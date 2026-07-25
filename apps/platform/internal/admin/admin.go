// Package admin is the operations backend of the GGD platform: an operator
// tool for player management (search, ban/unban, M COIN grants, MMR
// maintenance), match-history inspection, announcements and an append-only
// audit log. Every route is AdminOnly (a valid access token whose account
// carries the "admin" role); every mutation appends an audit line.
//
// Storage follows the platform convention: data/ JSON is the durable truth
// (via jsonstore), Redis is only a rebuildable cache. Account mutations reuse
// the existing locked read-modify-write paths (account.Repo.Update /
// SetRating, wallet.SetMCoinAbsolute), so they stay single-writer safe and
// idempotent. No wall-clock is read directly — a clock seam (SetNow) keeps
// timestamps deterministic under test.
package admin

import (
	"context"
	"crypto/rand"
	"errors"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/friend"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/internal/wallet"
)

// RoleAdmin is the authorization role required by every admin route. It is an
// alias of account.RoleAdmin, which is where the constant now lives so that
// internal/auth can grant it at registration without importing this package
// (that edge would be a cycle — see the doc comment on account.RoleAdmin).
const RoleAdmin = account.RoleAdmin

// Approval-decision provenance, recorded on the audit line's detail.source so
// the log can distinguish an in-console click from the #209 Slack one-tap link.
const (
	// SourceAdminConsole is the default: an operator clicked approve/deny in the
	// admin console, so adminId names their account.
	SourceAdminConsole = "admin-console"
	// SourceSlackLink is the #209 click-to-approve link: a signed, single-use
	// token was redeemed out of band (the owner tapping the Slack notification
	// from their phone, not logged into /admin). There is no operator session, so
	// adminId is ActorSlackLink rather than an account id.
	SourceSlackLink = "slack-link"
	// ActorSlackLink is the sentinel recorded as the audit adminId when an
	// approval came through the Slack link: it is NOT an account id, and is
	// deliberately not ULID-shaped so it can never collide with one.
	ActorSlackLink = "slack-link"
)

// Service owns the admin operations. It composes the existing platform
// services rather than reaching into their stores directly.
type Service struct {
	accounts *account.Repo
	wallet   *wallet.Service
	rank     *ranking.Service
	friends  *friend.Service
	store    *jsonstore.Store
	rdb      *redisx.Client

	bootstrapUsername string
	now               func() time.Time
}

// New builds the admin service. bootstrapUsername (may be empty) names the
// account granted the admin role on boot.
func New(accounts *account.Repo, wallet *wallet.Service, rank *ranking.Service,
	friends *friend.Service, store *jsonstore.Store, rdb *redisx.Client, bootstrapUsername string) *Service {
	return &Service{
		accounts:          accounts,
		wallet:            wallet,
		rank:              rank,
		friends:           friends,
		store:             store,
		rdb:               rdb,
		bootstrapUsername: bootstrapUsername,
		now:               time.Now,
	}
}

// SetNow overrides the clock seam (tests inject a fixed clock so audit and
// announcement timestamps are deterministic).
func (s *Service) SetNow(fn func() time.Time) { s.now = fn }

// newID mints a ULID off the clock seam (time-ordered ids) with crypto/rand
// entropy, matching account.NewID's construction.
func (s *Service) newID() string {
	return ulid.MustNew(ulid.Timestamp(s.now()), rand.Reader).String()
}

// EnsureBootstrapAdmin idempotently makes the bootstrap username a USABLE
// administrator. A missing account is logged, not an error (register it, then
// restart).
//
// "Usable", not merely "roled", is the whole contract. This is the last-resort
// recovery path: it is reached precisely when the deploy is in a bad state, and
// a recovery that hands back an account which cannot obtain a token is not a
// recovery. Granting the role alone was silently inert in two reachable states,
// both of which end in a permanently ownerless deploy:
//
//   - the #126 approval gate is on and the account is still pending, so login
//     answers 403 account_pending and no admin exists who could approve it;
//   - the account was banned (e.g. by a squatter who won the first-owner claim
//     before the operator did), so login answers 403 account_banned.
//
// So the grant also forces approved and clears any ban. Both are logged: an
// operator must see that the rescue changed more than the role.
func (s *Service) EnsureBootstrapAdmin(ctx context.Context) error {
	if s.bootstrapUsername == "" {
		return nil
	}
	a, err := s.accounts.GetByUsername(ctx, s.bootstrapUsername)
	if errors.Is(err, account.ErrNotFound) {
		slog.Warn("admin: bootstrap account not found — register it and restart to grant admin",
			"username", s.bootstrapUsername)
		return nil
	}
	if err != nil {
		return err
	}
	if a.HasRole(RoleAdmin) && a.IsApproved() && !a.Banned {
		slog.Info("admin: bootstrap account already a usable admin", "username", s.bootstrapUsername, "id", a.ID)
		return nil
	}
	grantedRole, approved, unbanned := false, false, false
	if _, err := s.accounts.Update(ctx, a.ID, func(ac *account.Account) error {
		if !ac.HasRole(RoleAdmin) {
			ac.Roles = append(ac.Roles, RoleAdmin)
			grantedRole = true
		}
		if !ac.IsApproved() {
			ac.Status = account.StatusApproved
			approved = true
		}
		if ac.Banned {
			ac.Banned, ac.BanReason = false, ""
			unbanned = true
		}
		return nil
	}); err != nil {
		return err
	}
	slog.Warn("admin: bootstrap recovery applied", "username", s.bootstrapUsername, "id", a.ID,
		"grantedRole", grantedRole, "forcedApproved", approved, "clearedBan", unbanned)
	return nil
}

// SetAdminRole grants or revokes the admin role on one account and audits it.
//
// This exists because the first-owner bootstrap can, in principle, put the role
// on the wrong account (it is decided by arrival order on a public endpoint),
// and until now nothing in the product could take a role back — admin.go only
// ever appended, and no route touched roles at all. An unrecoverable wrong
// grant would have meant hand-editing account JSON.
//
// Revocation refuses to remove the last USABLE admin (not merely the last
// role-holder: an admin who is banned or unapproved cannot sign in, so counting
// them would let the platform lock itself out). Granting also forces the target
// approved, for the same reason EnsureBootstrapAdmin does — an admin who cannot
// log in is not an admin.
func (s *Service) SetAdminRole(ctx context.Context, adminID, targetID string, grant bool) (AccountRow, error) {
	target, err := s.accounts.GetByID(ctx, targetID)
	if err != nil {
		return AccountRow{}, notFoundOr(err)
	}
	if !grant && target.HasRole(RoleAdmin) {
		usable, err := s.accounts.UsableAdmins(ctx)
		if err != nil {
			return AccountRow{}, err
		}
		if len(usable) <= 1 && (len(usable) == 0 || usable[0] == targetID) {
			return AccountRow{}, httpx.Err(http.StatusConflict, "last_admin",
				"this is the only administrator who can sign in — promote someone else first")
		}
	}
	a, err := s.accounts.Update(ctx, targetID, func(ac *account.Account) error {
		if grant {
			if !ac.HasRole(RoleAdmin) {
				ac.Roles = append(ac.Roles, RoleAdmin)
			}
			if !ac.IsApproved() {
				ac.Status = account.StatusApproved
			}
			return nil
		}
		kept := make([]string, 0, len(ac.Roles))
		for _, role := range ac.Roles {
			if role != RoleAdmin {
				kept = append(kept, role)
			}
		}
		if len(kept) == 0 {
			kept = nil
		}
		ac.Roles = kept
		return nil
	})
	if err != nil {
		return AccountRow{}, notFoundOr(err)
	}
	action := "role_revoke"
	if grant {
		action = "role_grant"
	}
	if err := s.audit(ctx, adminID, action, targetID, map[string]any{"role": RoleAdmin}); err != nil {
		return AccountRow{}, err
	}
	slog.Warn("admin: admin role changed", "by", adminID, "target", targetID, "granted", grant)
	return rowOf(a), nil
}

// IsAdmin reports whether the account carries the admin role.
func (s *Service) IsAdmin(ctx context.Context, accountID string) (bool, error) {
	a, err := s.accounts.GetByID(ctx, accountID)
	if err != nil {
		return false, err
	}
	return a.HasRole(RoleAdmin), nil
}

// ---- account projections ----------------------------------------------------

// AccountRow is a search-result row. It never includes the password hash.
type AccountRow struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	MMR       int       `json:"mmr"`
	Games     int       `json:"games"`
	Wins      int       `json:"wins"`
	MCoin     int       `json:"mcoin"`
	Banned    bool      `json:"banned"`
	BanReason string    `json:"banReason,omitempty"`
	Roles     []string  `json:"roles"`
	CreatedAt time.Time `json:"createdAt"`

	// Status is the #126 approval state: "pending", "approved", "denied", or
	// "" for an account created before the gate existed / while it was off.
	//
	// It is ALWAYS emitted, never omitempty. A console that has to distinguish
	// "this account is grandfathered" from "the server build I am talking to
	// does not know about approval at all" cannot do it if the field vanishes
	// on the empty value — both would arrive as `undefined`. The empty string
	// is a real, meaningful state here (see account.IsApproved), so it is sent.
	Status string `json:"status"`
	// Approved mirrors account.IsApproved: whether this account may obtain a
	// session RIGHT NOW under the gate. It is derived, not stored, and exists
	// so the console never has to re-implement the grandfathering rule (`"" or
	// "approved"`) and drift from the server's answer.
	Approved bool `json:"approved"`
}

func rowOf(a account.Account) AccountRow {
	roles := a.Roles
	if roles == nil {
		roles = []string{}
	}
	return AccountRow{
		ID: a.ID, Username: a.Username, Email: a.Email, MMR: a.MMR,
		Games: a.Games, Wins: a.Wins, MCoin: a.MCoin, Banned: a.Banned,
		BanReason: a.BanReason, Roles: roles, CreatedAt: a.CreatedAt,
		Status: a.Status, Approved: a.IsApproved(),
	}
}

// Profile is the full admin view of one account (adds wallet + friend count).
type Profile struct {
	Account      AccountRow    `json:"account"`
	UpdatedAt    time.Time     `json:"updatedAt"`
	Wallet       wallet.Wallet `json:"wallet"`
	FriendsCount int           `json:"friendsCount"`
}

// SearchAccounts returns a paginated slice of accounts whose id, username or
// email contains query (case-insensitive; empty query matches all), newest
// first. total is the pre-pagination match count.
func (s *Service) SearchAccounts(ctx context.Context, query string, page, pageSize int) (rows []AccountRow, total int, err error) {
	return s.SearchAccountsByStatus(ctx, query, "", page, pageSize)
}

// PendingAccounts returns the APPROVAL QUEUE: every account stamped pending
// (#126), OLDEST FIRST, plus the pre-pagination total.
//
// Oldest first is the one ordering difference from SearchAccounts, and it is
// deliberate. Search is a lookup tool, so "who signed up most recently" is the
// useful order. This is a WORK QUEUE: the person who has been waiting longest
// is the person the owner should answer first, and on a family deploy that
// person is a relative currently staring at an "awaiting approval" screen.
// Newest-first would bury them under every later arrival.
func (s *Service) PendingAccounts(ctx context.Context, page, pageSize int) (rows []AccountRow, total int, err error) {
	return s.searchAccounts(ctx, "", account.StatusPending, true, page, pageSize)
}

// SearchAccountsByStatus is SearchAccounts with an additional exact-match
// filter on the #126 approval status. An empty status matches every account
// (grandfathered ones included); otherwise only accounts carrying exactly that
// status are returned. Newest first.
func (s *Service) SearchAccountsByStatus(ctx context.Context, query, status string, page, pageSize int) (rows []AccountRow, total int, err error) {
	return s.searchAccounts(ctx, query, status, false, page, pageSize)
}

func (s *Service) searchAccounts(ctx context.Context, query, status string, oldestFirst bool, page, pageSize int) (rows []AccountRow, total int, err error) {
	page, pageSize = normalizePage(page, pageSize)
	ids, err := s.accounts.List(ctx)
	if err != nil {
		return nil, 0, err
	}
	q := strings.ToLower(strings.TrimSpace(query))
	status = strings.ToLower(strings.TrimSpace(status))
	matched := make([]account.Account, 0, len(ids))
	for _, id := range ids {
		a, err := s.accounts.GetByID(ctx, id)
		if err != nil {
			continue // skip unreadable rows rather than failing the whole search
		}
		if status != "" && a.Status != status {
			continue
		}
		if q == "" ||
			strings.Contains(strings.ToLower(a.Username), q) ||
			strings.Contains(strings.ToLower(a.Email), q) ||
			strings.Contains(strings.ToLower(a.ID), q) {
			matched = append(matched, a)
		}
	}
	sort.Slice(matched, func(i, j int) bool {
		if oldestFirst {
			return matched[i].CreatedAt.Before(matched[j].CreatedAt)
		}
		return matched[i].CreatedAt.After(matched[j].CreatedAt)
	})
	total = len(matched)
	rows = []AccountRow{}
	for _, a := range paginate(matched, page, pageSize) {
		rows = append(rows, rowOf(a))
	}
	return rows, total, nil
}

// GetProfile returns the full admin profile of one account.
func (s *Service) GetProfile(ctx context.Context, id string) (Profile, error) {
	a, err := s.accounts.GetByID(ctx, id)
	if err != nil {
		return Profile{}, notFoundOr(err)
	}
	w, err := s.wallet.Get(ctx, id)
	if err != nil {
		return Profile{}, err
	}
	friendsCount := 0
	if doc, err := s.friends.Get(ctx, id); err == nil {
		friendsCount = len(doc.Friends)
	}
	return Profile{Account: rowOf(a), UpdatedAt: a.UpdatedAt, Wallet: w, FriendsCount: friendsCount}, nil
}

// ---- account mutations (all audited) ----------------------------------------

// AdjustMCoin applies a signed delta to an account's M COIN balance (clamped at
// zero) via the absolute-write path, and records an audit line. Returns the new
// balance.
func (s *Service) AdjustMCoin(ctx context.Context, adminID, targetID string, delta int, reason string) (int, error) {
	if _, err := s.accounts.GetByID(ctx, targetID); err != nil {
		return 0, notFoundOr(err)
	}
	w, err := s.wallet.Get(ctx, targetID)
	if err != nil {
		return 0, err
	}
	next := w.MCoin + delta
	if next < 0 {
		next = 0
	}
	if err := s.wallet.SetMCoinAbsolute(ctx, targetID, next); err != nil {
		return 0, err
	}
	if err := s.audit(ctx, adminID, "mcoin_adjust", targetID, map[string]any{
		"delta": delta, "balance": next, "reason": reason,
	}); err != nil {
		return 0, err
	}
	return next, nil
}

// MaxCrystalGrant is the largest 藍水晶 amount one operator action may hand out
// per account (task #225). It is a TYPO GUARD, not an economy rule: at
// wallet.CrystalUnlockCost (300) it is still ~3,333 champion unlocks, far past
// any grant the owner would mean, while an extra couple of zeros on a bulk
// "give everyone 1000" is refused instead of silently minting a number nobody
// can spend. The same bound applies to the single and the bulk grant so the
// console cannot reach a value through one door that the other refuses.
const MaxCrystalGrant = 1_000_000

// GrantCrystal adds 藍水晶 to ONE account on an operator's behalf and records an
// audit line (task #225). Returns the target's resulting balance.
//
// Additive, never absolute: two grants of 500 mean 1000. amount is validated by
// the handler (positive, <= MaxCrystalGrant) and re-checked here so a future
// non-HTTP caller cannot skip it. A missing account is a clean 404 BEFORE any
// balance moves.
func (s *Service) GrantCrystal(ctx context.Context, adminID, targetID string, amount int, reason string) (int, error) {
	if err := validCrystalAmount(amount); err != nil {
		return 0, err
	}
	if _, err := s.accounts.GetByID(ctx, targetID); err != nil {
		return 0, notFoundOr(err)
	}
	next, err := s.wallet.AddCrystal(ctx, targetID, amount)
	if err != nil {
		return 0, err
	}
	if err := s.audit(ctx, adminID, "crystal_grant", targetID, map[string]any{
		"amount": amount, "balance": next, "reason": reason,
	}); err != nil {
		return 0, err
	}
	return next, nil
}

// BulkGrantResult is the outcome of a 一鍵發放 run: every account that exists was
// attempted exactly once, and each landed in exactly one of granted/failed.
//
// FirstError is carried IN THE RESULT rather than returned as an error because a
// partial failure is a reportable outcome here, not a failed request: 900 of 901
// accounts really were granted, and an operator who is shown a bare error learns
// neither that nor whether to re-run (re-running would double-grant the 900).
// GrantCrystalAll's error return is reserved for failures where NOTHING was
// attempted — a bad amount or an unreadable account directory.
type BulkGrantResult struct {
	// Accounts is how many accounts existed and were attempted.
	Accounts int `json:"accounts"`
	// Granted is how many balances actually moved.
	Granted int `json:"granted"`
	// Failed is how many accounts errored. Their balances are UNCHANGED (each
	// grant is one locked read-modify-write), never half-written.
	Failed int `json:"failed"`
	// FirstError is the first per-account (or audit-write) failure message, empty
	// when everything succeeded.
	FirstError string `json:"firstError,omitempty"`
}

// GrantCrystalAll is 一鍵發放所有帳號藍水晶: the same additive grant applied to
// EVERY account that exists, in one operator action (task #225).
//
// IT IS NOT THE #204 BACKFILL AND MUST NOT BE BUILT ON IT.
// wallet.BackfillWelcomeCrystals delegates to SeedNewAccountCrystals, whose
// idempotency rule is "skip any account that already has a walletmeta record".
// On a live deploy essentially every account has one, so routing an operator
// bulk grant through it would report success and grant almost nobody. This is a
// deliberately REPEATABLE action with no skip rule: run it twice and everyone
// gets it twice, which is what 「一鍵發放」 means. Only the SHAPE is borrowed —
// per-account loop, counters, first error surfaced, never abort.
//
// Accounts are enumerated with store.Scan (the files that actually exist) rather
// than accounts.List (the derived _index.json), because a missing index reads as
// an EMPTY collection: a 一鍵發放 that silently grants zero accounts and reports
// success is the failure mode worth paying a directory listing to avoid.
//
// PARTIAL FAILURE IS BOUNDED, NOT ROLLED BACK. Each account is one locked
// read-modify-write, so a mid-loop failure leaves earlier accounts correctly
// granted and later ones untouched — no account is ever left with a half-written
// balance. The audit line is written ONCE, AFTER the loop, and carries the
// counts; a failure to write it does not undo the balances, so the returned
// error means "the grants happened but the log did not", which is the honest
// thing for the operator to see.
func (s *Service) GrantCrystalAll(ctx context.Context, adminID string, amount int, reason string) (BulkGrantResult, error) {
	if err := validCrystalAmount(amount); err != nil {
		return BulkGrantResult{}, err
	}
	ids, err := s.store.Scan(account.ColAccounts)
	if err != nil {
		return BulkGrantResult{}, err
	}
	out := BulkGrantResult{Accounts: len(ids)}
	var firstErr error
	for _, id := range ids {
		if _, err := s.wallet.AddCrystal(ctx, id, amount); err != nil {
			out.Failed++
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		out.Granted++
	}
	// ONE line for the whole operation, with the affected-account count — the
	// targetId is a sentinel rather than an empty string so the console's Target
	// column is never blank.
	if auditErr := s.audit(ctx, adminID, "crystal_grant_all", "*", map[string]any{
		"amount": amount, "accounts": out.Accounts, "granted": out.Granted,
		"failed": out.Failed, "reason": reason,
	}); auditErr != nil && firstErr == nil {
		firstErr = auditErr
	}
	if firstErr != nil {
		out.FirstError = firstErr.Error()
	}
	slog.Warn("admin: bulk crystal grant", "by", adminID, "amount", amount,
		"accounts", out.Accounts, "granted", out.Granted, "failed", out.Failed, "firstError", out.FirstError)
	return out, nil
}

// validCrystalAmount enforces the operator-grant bounds: a whole positive
// amount no larger than MaxCrystalGrant. Zero and negative are refused rather
// than clamped — the meta record floors at 0, so accepting a negative amount
// would quietly WIPE a balance instead of deducting from it, and "deduct
// crystals" is not a feature this surface offers.
func validCrystalAmount(amount int) error {
	if amount <= 0 {
		return httpx.BadRequest("amount must be a positive whole number")
	}
	if amount > MaxCrystalGrant {
		return httpx.BadRequest("amount out of range")
	}
	return nil
}

// SetMMR sets an ABSOLUTE MMR (keeping games/wins), re-ZADDs the leaderboard,
// and audits.
func (s *Service) SetMMR(ctx context.Context, adminID, targetID string, mmr int, reason string) error {
	a, err := s.accounts.GetByID(ctx, targetID)
	if err != nil {
		return notFoundOr(err)
	}
	if err := s.accounts.SetRating(ctx, targetID, mmr, a.Games, a.Wins); err != nil {
		return err
	}
	if err := s.rank.Add(ctx, targetID, mmr); err != nil {
		return err
	}
	return s.audit(ctx, adminID, "mmr_set", targetID, map[string]any{"mmr": mmr, "reason": reason})
}

// Ban marks the account banned (with reason), revokes its live refresh tokens
// for an immediate logout, and audits.
func (s *Service) Ban(ctx context.Context, adminID, targetID, reason string) (AccountRow, error) {
	a, err := s.accounts.Update(ctx, targetID, func(ac *account.Account) error {
		ac.Banned = true
		ac.BanReason = reason
		return nil
	})
	if err != nil {
		return AccountRow{}, notFoundOr(err)
	}
	_ = s.rdb.RevokeAllRefresh(ctx, targetID) // best effort — the login/refresh guard is authoritative
	if err := s.audit(ctx, adminID, "ban", targetID, map[string]any{"reason": reason}); err != nil {
		return AccountRow{}, err
	}
	return rowOf(a), nil
}

// SetApproval is the #126 approval decision: it moves one account between
// pending / approved / denied, revokes its live sessions when the decision
// takes access away, and appends an audit line. Returns the updated row.
//
// It exists so approve/deny is a SERVICE operation rather than a bare
// account.Repo.SetStatus from an HTTP handler. Three things follow from that,
// none of which the bare status write did:
//
//  1. IT IS AUDITED. Every other operator action that changes what an account
//     may do — ban, unban, role grant/revoke, M COIN, MMR — appends to the
//     append-only log the console reads. Approval is the decision that lets a
//     person into the owner's private deploy at all; it being the one
//     unrecorded action was indefensible. The reason string is recorded with
//     it, so "why was cousin Bob declined" survives the conversation.
//
//  2. IT REVOKES SESSIONS WHEN ACCESS IS TAKEN AWAY. Denying (or returning to
//     pending) an account that is currently signed in must not leave it playing
//     until its refresh token happens to expire. Login/Refresh both re-check
//     the status, so the revoke is belt-and-braces rather than the mechanism —
//     but without it the account keeps a working ~15-minute access token, which
//     on a deny is precisely the window the owner was trying to close.
//
//  3. IT REFUSES TO LOCK THE PLATFORM OUT. Taking approval away from the last
//     administrator who can still sign in produces a deploy where nobody can
//     approve anybody — including the administrator who would have to fix it,
//     because approval is exactly what they just lost. That is the same
//     deadlock SetAdminRole's revocation guard refuses, arrived at by a
//     different door, so it is refused by the same rule and the same 409
//     last_admin code. Self-denial by the sole owner is the likeliest way to
//     get there (a mis-click on one's own row in a list), and it would have
//     required hand-editing account JSON — or cmd/ownerreset — to undo.
func (s *Service) SetApproval(ctx context.Context, adminID, targetID, status, reason string) (AccountRow, error) {
	return s.SetApprovalWithSource(ctx, adminID, targetID, status, reason, SourceAdminConsole)
}

// SetApprovalWithSource is SetApproval with the audit provenance made explicit
// (detail.source). It is the ONE place approve/deny is applied, so the #209
// Slack link and the console click share every guarantee above — the last-admin
// guard, the live-session revoke and the append-only audit line — and differ
// only in who the log names. SetApproval passes SourceAdminConsole; the Slack
// link passes SourceSlackLink with the ActorSlackLink sentinel for adminID.
func (s *Service) SetApprovalWithSource(ctx context.Context, adminID, targetID, status, reason, source string) (AccountRow, error) {
	switch status {
	case account.StatusPending, account.StatusApproved, account.StatusDenied:
	default:
		return AccountRow{}, httpx.BadRequest(`status must be "pending", "approved" or "denied"`)
	}
	target, err := s.accounts.GetByID(ctx, targetID)
	if err != nil {
		return AccountRow{}, notFoundOr(err)
	}
	// Losing approval is the direction that can brick the deploy; granting it
	// never can, so the guard only runs on the taking-away side.
	revokesAccess := status != account.StatusApproved
	if revokesAccess && target.HasRole(RoleAdmin) && target.IsApproved() {
		usable, err := s.accounts.UsableAdmins(ctx)
		if err != nil {
			return AccountRow{}, err
		}
		if len(usable) <= 1 && (len(usable) == 0 || usable[0] == targetID) {
			return AccountRow{}, httpx.Err(http.StatusConflict, "last_admin",
				"this is the only administrator who can sign in — approve or promote someone else first")
		}
	}
	a, err := s.accounts.SetStatus(ctx, targetID, status)
	if err != nil {
		return AccountRow{}, notFoundOr(err)
	}
	if revokesAccess {
		// Best effort — the login/refresh approval guard is authoritative even
		// if this revoke races or fails.
		_ = s.rdb.RevokeAllRefresh(ctx, targetID)
	}
	detail := map[string]any{"status": status, "source": source}
	if reason != "" {
		detail["reason"] = reason
	}
	if err := s.audit(ctx, adminID, "approval_"+status, targetID, detail); err != nil {
		return AccountRow{}, err
	}
	slog.Info("admin: account approval status changed", "by", adminID, "target", targetID, "status", status, "source", source)
	return rowOf(a), nil
}

// SetApprovalFromLink applies a #209 Slack click-to-approve decision. It is the
// seam the internal/approvelink handler calls after it has verified the signed,
// single-use token — the token IS the authorization, so there is no operator
// account to name, and the decision is recorded as (ActorSlackLink, source
// slack-link). It reuses SetApprovalWithSource, so a link approval is audited,
// revokes live sessions on a deny, and honours the last-admin guard exactly like
// the console. The updated row is discarded so a caller need not import this
// package's projection type.
func (s *Service) SetApprovalFromLink(ctx context.Context, targetID, status, reason string) error {
	_, err := s.SetApprovalWithSource(ctx, ActorSlackLink, targetID, status, reason, SourceSlackLink)
	return err
}

// Unban clears the banned flag and audits.
func (s *Service) Unban(ctx context.Context, adminID, targetID string) (AccountRow, error) {
	a, err := s.accounts.Update(ctx, targetID, func(ac *account.Account) error {
		ac.Banned = false
		ac.BanReason = ""
		return nil
	})
	if err != nil {
		return AccountRow{}, notFoundOr(err)
	}
	if err := s.audit(ctx, adminID, "unban", targetID, nil); err != nil {
		return AccountRow{}, err
	}
	return rowOf(a), nil
}

// ---- helpers ----------------------------------------------------------------

func notFoundOr(err error) error {
	if errors.Is(err, account.ErrNotFound) {
		return httpx.NotFound("account not found")
	}
	return err
}

func normalizePage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return page, pageSize
}

func paginate[T any](items []T, page, pageSize int) []T {
	start := (page - 1) * pageSize
	if start >= len(items) {
		return nil
	}
	end := start + pageSize
	if end > len(items) {
		end = len(items)
	}
	return items[start:end]
}

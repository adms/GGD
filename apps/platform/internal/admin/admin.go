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

// RoleAdmin is the authorization role required by every admin route.
const RoleAdmin = "admin"

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

// EnsureBootstrapAdmin idempotently grants the bootstrap username the admin
// role. A missing account is logged, not an error (register it, then restart).
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
	if a.HasRole(RoleAdmin) {
		slog.Info("admin: bootstrap account already admin", "username", s.bootstrapUsername, "id", a.ID)
		return nil
	}
	if _, err := s.accounts.Update(ctx, a.ID, func(ac *account.Account) error {
		if !ac.HasRole(RoleAdmin) {
			ac.Roles = append(ac.Roles, RoleAdmin)
		}
		return nil
	}); err != nil {
		return err
	}
	slog.Info("admin: granted admin role via bootstrap", "username", s.bootstrapUsername, "id", a.ID)
	return nil
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
	page, pageSize = normalizePage(page, pageSize)
	ids, err := s.accounts.List(ctx)
	if err != nil {
		return nil, 0, err
	}
	q := strings.ToLower(strings.TrimSpace(query))
	matched := make([]account.Account, 0, len(ids))
	for _, id := range ids {
		a, err := s.accounts.GetByID(ctx, id)
		if err != nil {
			continue // skip unreadable rows rather than failing the whole search
		}
		if q == "" ||
			strings.Contains(strings.ToLower(a.Username), q) ||
			strings.Contains(strings.ToLower(a.Email), q) ||
			strings.Contains(strings.ToLower(a.ID), q) {
			matched = append(matched, a)
		}
	}
	sort.Slice(matched, func(i, j int) bool { return matched[i].CreatedAt.After(matched[j].CreatedAt) })
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

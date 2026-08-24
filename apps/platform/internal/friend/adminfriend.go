package friend

// adminfriend.go — 管理員預設好友 (GH#499).
//
// ════════════════════════════════════════════════════════════════════════════
// owner 2026-08-21 逐字
// ════════════════════════════════════════════════════════════════════════════
//
//	「**所有人預設都會加管理員帳號為好友**」
//	「`adminAccountId` => **yes, 如果只有一個就預設那一個**」
//	「**管理員是強制雙向 不必請求 每個人創號自動預設有管理員好友**」
//
// ════════════════════════════════════════════════════════════════════════════
// 三件事,以及每一件為什麼不是它看起來的那個簡單做法
// ════════════════════════════════════════════════════════════════════════════
//
// ① ⛔ NOT `Service.Request()`. Request writes a PENDING edge the other side has
//    to accept. Running it for the existing accounts would have produced 198
//    「等待接受」rows nobody will ever press — a feature that ships, looks done,
//    and is worth exactly zero. `ForceFriend` writes both Friends edges in one
//    two-sided transaction instead (friend.go).
//
// ② ⛔ THE HOOK IS NOT IN auth.Register. It is `account.Repo.Create`'s
//    post-create seam, which runs only after the account FILE has landed. The
//    thing that must be impossible is「帳號沒建成、好友關係卻留下來了」, and any
//    seam placed earlier can produce exactly that. See account.PostCreateHook.
//
// ③ ⭐ NEW ACCOUNTS ALONE WOULD BE A NO-OP FOR ALMOST EVERYBODY. 198 accounts
//    already exist and none of them will ever be created again, so the backfill
//    (`Backfill`) is not a migration nicety — without it owner's「所有人」means
//    「今天以後註冊的人」. It runs at boot (Server.Boot, after the bootstrap-admin
//    grant so the admin it needs already carries the role) and is also exposed
//    as an admin-only route for the Quick Approval「加入」區 (handlers.go).
//    Idempotent by construction: ForceFriend reports changed=false when the two
//    are already friends, so boot number two writes nothing.
//
// ════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THE POLICY IS READ THROUGH THE OVERLAY AND NOT JUST content/
// ════════════════════════════════════════════════════════════════════════════
// The console saves a config doc through `PUT /content-overlay/docs/config/...`
// into data/content-overlay/overlay.json, while the shipped values live in
// content/config/admin-friend.json — and on the family host content/ is a
// READ-ONLY bind mount. A reader that only read content/ would give this page
// the exact shape task #241 documents: the operator saves, the page answers
// 「✓ 已寫入」, the page even re-renders the saved value, and the platform goes
// on using the shipped one forever. So shipped is the base and the overlay is
// layered on top HERE, on every decision, exactly like wallet/economy.go.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/jsonstore"
)

// Identifiers of the shipped policy document.
const (
	// AdminFriendDocID is the content doc id (content/config/admin-friend.json).
	AdminFriendDocID = "admin-friend"
	// AdminFriendSchema is its schema tag, mirroring zConfigAdminFriendDoc in
	// packages/shared/src/content/schema/config.ts.
	AdminFriendSchema = "config.admin-friend@1"
)

// Durable content-overlay identifiers, mirroring internal/contentoverlay's
// Collection / DocID / key(collection, id). COPIED, not imported: contentoverlay
// imports internal/admin, admin imports this layer's neighbours, and the edge
// would be an import cycle — the same copy wallet/economy.go keeps, for the same
// reason, with the same duty to be pinned by a test rather than trusted.
const (
	overlayCollection = "content-overlay"
	overlayDocID      = "overlay"
	// OverlayAdminFriendKey is what the console's putOverlayDoc("config",
	// "admin-friend") writes.
	OverlayAdminFriendKey = "config/" + AdminFriendDocID
)

// AdminPolicy is 管理員預設好友 as the platform actually reads it.
type AdminPolicy struct {
	// Enabled is the master switch. Off = no new-account link and no backfill.
	Enabled bool
	// AdminAccountID names the admin everybody is befriended with.
	//
	// ⭐ AdminAccountAuto (or empty) means「如果只有一個就預設那一個」— resolve it
	// from the roster. ⚠️ The shipped value is the WORD, not the empty string:
	// the console's text input refuses an empty value ("不可以是空的"), so an
	// operator who typed an id in could never get back to automatic. A knob you
	// can only turn one way is the shape of 第一·五守則.
	AdminAccountID string
	// BackfillExisting runs the existing-accounts pass at boot.
	BackfillExisting bool
	// OverrideBlocked forces the link through an explicit block. Shipped OFF —
	// see ForceFriend.
	OverrideBlocked bool
}

// DefaultAdminPolicy is the fuse: what the platform does when the document
// cannot be read at all. It is ON, because owner's sentence is「所有人預設都會加
// 管理員帳號為好友」and a content-read failure that silently disables the feature
// looks identical to owner having turned it off — neither of which anybody sees.
func DefaultAdminPolicy() AdminPolicy {
	return AdminPolicy{Enabled: true, AdminAccountID: AdminAccountAuto, BackfillExisting: true, OverrideBlocked: false}
}

// AdminAccountAuto is the AdminAccountID value that means「照 owner 的規則自己
// 判斷」. The empty string is accepted as a synonym (a hand-edited file, or the
// pre-console shape), but ⛔ never SHIPPED as one — see AdminPolicy.AdminAccountID.
const AdminAccountAuto = "auto"

// isAuto reports whether an adminAccountId asks for roster resolution.
func isAuto(id string) bool {
	t := strings.TrimSpace(id)
	return t == "" || strings.EqualFold(t, AdminAccountAuto)
}

// adminPolicyDoc is the wire shape. Every knob is a POINTER so a document that
// omits one keeps the shipped value instead of landing as Go's zero (which for
// three of the four booleans means "off" — a silent feature kill).
type adminPolicyDoc struct {
	Schema           string  `json:"schema"`
	Enabled          *bool   `json:"enabled"`
	AdminAccountID   *string `json:"adminAccountId"`
	BackfillExisting *bool   `json:"backfillExisting"`
	OverrideBlocked  *bool   `json:"overrideBlocked"`
}

func (p *AdminPolicy) apply(d adminPolicyDoc) {
	if d.Enabled != nil {
		p.Enabled = *d.Enabled
	}
	if d.AdminAccountID != nil {
		p.AdminAccountID = strings.TrimSpace(*d.AdminAccountID)
	}
	if d.BackfillExisting != nil {
		p.BackfillExisting = *d.BackfillExisting
	}
	if d.OverrideBlocked != nil {
		p.OverrideBlocked = *d.OverrideBlocked
	}
}

// LoadAdminPolicy reads the SHIPPED policy from content/config/admin-friend.json.
//
// ⚠️ Fail-open is deliberate (a missing content tree must not stop the platform
// booting) and therefore LOUD: both failure paths name the path they tried and
// the values they fell back to, because「內容讀不到」and「owner 關掉了這個功能」
// are otherwise the same silence.
func LoadAdminPolicy(contentDir string) AdminPolicy {
	p := DefaultAdminPolicy()
	if strings.TrimSpace(contentDir) == "" {
		return p
	}
	path := filepath.Join(contentDir, "config", AdminFriendDocID+".json")
	raw, err := os.ReadFile(path) //nolint:gosec // operator-supplied content dir
	if err != nil {
		slog.Warn("friend: 管理員預設好友 shipped policy is unreadable — using the built-in defaults",
			"path", path, "err", err, "enabled", p.Enabled, "backfillExisting", p.BackfillExisting)
		return p
	}
	var d adminPolicyDoc
	if err := json.Unmarshal(raw, &d); err != nil {
		slog.Error("friend: 管理員預設好友 shipped policy is not readable JSON — using the built-in defaults",
			"path", path, "err", err)
		return p
	}
	if d.Schema != AdminFriendSchema {
		slog.Error("friend: 管理員預設好友 shipped policy carries the wrong schema tag — using the built-in defaults",
			"path", path, "schema", d.Schema, "want", AdminFriendSchema)
		return p
	}
	p.apply(d)
	return p
}

// AutoAdmin is the wiring struct: it owns the shipped policy and the two things
// the feature needs (the social graph and the account roster).
type AutoAdmin struct {
	svc      *Service
	accounts *account.Repo
	shipped  AdminPolicy
}

// EnableAdminAutoFriend installs 管理員預設好友 on this service and returns the
// hook the account repository should be given. Composition root only.
//
// ⚠️ It stores itself on the Service so the admin-only backfill route can reach
// it without a fourth constructor argument threaded through three call sites of
// NewHandlers.
func (s *Service) EnableAdminAutoFriend(accounts *account.Repo, shipped AdminPolicy) *AutoAdmin {
	a := &AutoAdmin{svc: s, accounts: accounts, shipped: shipped}
	s.autoAdmin = a
	return a
}

// Policy is the live policy: shipped values with the operator's durable overlay
// layered on top. Re-read on every decision so a console save lands without a
// restart (see the file header).
func (a *AutoAdmin) Policy() AdminPolicy {
	p := a.shipped
	if a.svc == nil || a.svc.store == nil {
		return p
	}
	var f struct {
		Docs    map[string]json.RawMessage `json:"docs"`
		Deleted map[string]bool            `json:"deleted"`
	}
	if err := a.svc.store.Get(overlayCollection, overlayDocID, &f); err != nil {
		if !errors.Is(err, jsonstore.ErrNotFound) {
			slog.Warn("friend: could not read the content overlay — using the shipped 管理員預設好友 policy", "err", err)
		}
		return p
	}
	if f.Deleted[OverlayAdminFriendKey] {
		return p // operator explicitly reverted to shipped
	}
	raw, ok := f.Docs[OverlayAdminFriendKey]
	if !ok {
		return p
	}
	var d adminPolicyDoc
	if err := json.Unmarshal(raw, &d); err != nil {
		slog.Warn("friend: 管理員預設好友 override is not readable JSON — using the shipped policy",
			"key", OverlayAdminFriendKey, "err", err)
		return p
	}
	if d.Schema != AdminFriendSchema {
		slog.Warn("friend: 管理員預設好友 override carries the wrong schema tag — using the shipped policy",
			"key", OverlayAdminFriendKey, "schema", d.Schema, "want", AdminFriendSchema)
		return p
	}
	p.apply(d)
	return p
}

// ErrNoAdminResolved is returned when the policy names nobody and the roster
// cannot answer「只有一個就預設那一個」on its own.
var ErrNoAdminResolved = errors.New("friend: no administrator account could be resolved")

// ResolveAdminID answers 「誰是那個管理員」.
//
// ⭐ owner 2026-08-21:「`adminAccountId` => **yes, 如果只有一個就預設那一個**」.
// So "auto" is not「未設定,什麼都別做」— it is a live rule:
//
//	named in the policy → that account, but ONLY if it exists AND carries
//	                      RoleAdmin (fail CLOSED: a stale id must not quietly
//	                      befriend everybody with a deleted account, and a
//	                      non-admin id must not become an admin by being typed
//	                      into this box)
//	exactly one admin   → that one
//	zero / more than one → ErrNoAdminResolved, loudly, naming the count. More
//	                      than one is the case owner reserved for himself
//	                      (「多於一個時才需要他挑」) and picking one here would be
//	                      choosing on his behalf which human sees everybody's
//	                      online status.
func (a *AutoAdmin) ResolveAdminID(ctx context.Context, p AdminPolicy) (string, error) {
	if id := strings.TrimSpace(p.AdminAccountID); !isAuto(id) {
		acct, err := a.accounts.GetByID(ctx, id)
		if err != nil {
			return "", fmt.Errorf("friend: 管理員預設好友 names account %q, which cannot be read: %w", id, err)
		}
		if !acct.HasRole(account.RoleAdmin) {
			return "", fmt.Errorf("friend: 管理員預設好友 names account %q, which is not an administrator: %w", id, ErrNoAdminResolved)
		}
		return acct.ID, nil
	}
	admins, err := a.accounts.Admins(ctx)
	if err != nil {
		return "", err
	}
	if len(admins) == 1 {
		return admins[0], nil
	}
	return "", fmt.Errorf("friend: %d administrator accounts exist, so 管理員預設好友 needs adminAccountId set in the console: %w",
		len(admins), ErrNoAdminResolved)
}

// AfterAccountCreated is account.PostCreateHook: every account that durably
// lands is befriended with the administrator, both ways, immediately.
//
// Best-effort AND loud (see account.PostCreateHook): it can never fail the
// registration, so the only way anybody learns it did not happen is this log —
// plus the backfill, which will pick the account up on the next boot.
func (a *AutoAdmin) AfterAccountCreated(ctx context.Context, accountID string) {
	p := a.Policy()
	if !p.Enabled {
		return
	}
	adminID, err := a.ResolveAdminID(ctx, p)
	if err != nil {
		// ⚠️ Info, not Error: on a fresh deploy the FIRST account is created
		// before any admin exists, which is the ordinary path, not a fault.
		// Boot's backfill closes the gap.
		slog.Info("friend: 管理員預設好友 skipped for a new account — no administrator to link to yet",
			"accountId", accountID, "err", err)
		return
	}
	if adminID == accountID {
		return // the administrator's own account; withBoth would reject it anyway
	}
	if _, err := a.svc.ForceFriend(ctx, adminID, accountID, p.OverrideBlocked); err != nil {
		slog.Error("friend: could not link a new account to the administrator; it was created WITHOUT the default friend",
			"accountId", accountID, "adminId", adminID, "err", err)
		return
	}
	slog.Info("friend: 管理員預設好友 linked a new account", "accountId", accountID, "adminId", adminID)
}

// BackfillResult reports one existing-accounts pass.
type BackfillResult struct {
	AdminID string `json:"adminId"`
	Scanned int    `json:"scanned"`
	Linked  int    `json:"linked"`
	Failed  int    `json:"failed"`
}

// Backfill links every EXISTING account to the administrator (owner's ⭐: 「所有
// 人」, not「今天以後註冊的人」). Idempotent — an account that is already linked
// costs one read and zero writes.
//
// A per-account failure is counted and logged, never fatal: one unreadable file
// must not stop the other 197 from being linked.
func (a *AutoAdmin) Backfill(ctx context.Context) (BackfillResult, error) {
	p := a.Policy()
	if !p.Enabled {
		return BackfillResult{}, nil
	}
	adminID, err := a.ResolveAdminID(ctx, p)
	if err != nil {
		return BackfillResult{}, err
	}
	ids, err := a.accounts.List(ctx)
	if err != nil {
		return BackfillResult{}, err
	}
	res := BackfillResult{AdminID: adminID}
	for _, id := range ids {
		if id == adminID {
			continue
		}
		res.Scanned++
		changed, err := a.svc.ForceFriend(ctx, adminID, id, p.OverrideBlocked)
		if err != nil {
			res.Failed++
			slog.Error("friend: 管理員預設好友 backfill could not link one account", "accountId", id, "err", err)
			continue
		}
		if changed {
			res.Linked++
		}
	}
	return res, nil
}

// BackfillAdminFriendsInBackground runs Backfill off the boot path.
//
// ⚠️ It is a goroutine because it is O(accounts) file reads and boot must not
// wait on it; it is NOT fire-and-forget, because a backfill that silently did
// nothing is indistinguishable from one that linked everybody. Both outcomes
// are logged with counts.
func (s *Service) BackfillAdminFriendsInBackground(ctx context.Context) {
	a := s.autoAdmin
	if a == nil {
		return
	}
	if p := a.Policy(); !p.Enabled || !p.BackfillExisting {
		return
	}
	s.bg.Add(1)
	go func() {
		defer s.bg.Done()
		res, err := a.Backfill(ctx)
		if err != nil {
			slog.Warn("friend: 管理員預設好友 backfill did not run", "err", err)
			return
		}
		slog.Info("friend: 管理員預設好友 backfill finished",
			"adminId", res.AdminID, "scanned", res.Scanned, "linked", res.Linked, "failed", res.Failed)
	}()
}

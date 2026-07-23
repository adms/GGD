// Package ownerreset is the platform's OFFLINE administrator password reset.
//
// # The hole it fills
//
// The first account registered on an ownerless deploy becomes the owner
// (internal/auth/bootstrap.go). Nothing then existed to help that owner if they
// forgot the password they picked: the console shows a login form, /account/password
// demands the current password, and the two documented escapes — hand-editing
// data/accounts/<id>.json, or ADMIN_BOOTSTRAP_USERNAME + a restart — grant a
// role and clear a ban but never touch a credential. A single-owner deploy was
// one forgotten password away from being permanently unadministrable.
//
// # Why this is a command and not an endpoint
//
// The authorisation question is "is the caller the person who owns this
// machine?", and the ONLY signal on this binary that answers it honestly is
// access to the host filesystem. The obvious alternative — "the request came
// from 127.0.0.1" — is not merely weak here, it is INVERTED: the game client
// ships a LAN-published vite dev server that proxies phone traffic into this
// platform, so every device on the wifi already arrives as 127.0.0.1. A
// loopback-gated reset endpoint would hand the administrator password to any
// phone on the network. internal/server/devsurface_test.go is the standing lock
// on that, and it forbids internal/{auth,admin,server} from so much as naming a
// caller address.
//
// So the capability is a binary the operator runs in a shell ON the host. That
// is the same proof-of-host-access GGD_OWNER_BOOTSTRAP_TOKEN uses (a 0600 file
// under DATA_DIR that only a local user can read), taken to its conclusion: a
// process the operator started needs no token to prove where it is running,
// because it IS running there. No token file to leak, no endpoint to reach, no
// address to launder. surface_test.go pins that the serving binary does not
// even link this package, so there is no route to find.
//
// # What it touches, and what a running platform does about it
//
// It writes the durable JSON truth and the Redis hot layer directly, so it works
// whether or not the platform process is up:
//
//   - PLATFORM RUNNING: no restart is needed. Every credential read goes to the
//     account file (jsonstore.Get is an os.ReadFile with no cache; Login,
//     auth.Middleware and admin.AdminOnly all re-read per request), so the new
//     password is live the moment the file is renamed into place. The one thing
//     that outlives the reset is an already-minted ACCESS token, valid until it
//     expires (cfg.AccessTokenTTL, 15m) — refresh rotation is the platform's
//     revocation seam and this uses exactly the seam ban/deny use.
//     The store's write lock is per-PROCESS, so this command and a running
//     platform can in principle interleave a read-modify-write on the same
//     account; every write is atomic (renameio), so the risk is a LOST update,
//     never a torn file. verifyWrite below re-reads and retries for that.
//   - PLATFORM STOPPED: identical, minus the interleaving concern.
//   - REDIS DOWN: refused up front. Refresh tokens live only in Redis, so a
//     reset that cannot reach it would leave every stolen session alive and
//     silently call that success.
package ownerreset

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/alexedwards/argon2id"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
)

// AuditAction is the audit-log action name for a host-side reset. It renders in
// the console's audit page like any operator action, which is the point: a
// credential replaced out-of-band must be visible IN the product.
const AuditAction = "owner_password_reset"

// ActorCLI is the audit actor id used for a reset. It is not an account id —
// no account authorised this, a shell on the host did — and it is deliberately
// self-describing in the console's Admin column.
const ActorCLI = "host:ownerreset"

// writeAttempts bounds the read-modify-write retry that guards against a
// RUNNING platform's concurrent write to the same account clobbering ours (the
// store's mutex does not span processes — see the package header).
const writeAttempts = 3

// Errors callers distinguish. Everything else is wrapped and returned as-is.
var (
	// ErrNoTarget means neither -username nor -id was given.
	ErrNoTarget = errors.New("ownerreset: name the account with -username or -id")
	// ErrNotFound means no such account in the durable store.
	ErrNotFound = errors.New("ownerreset: no such account")
	// ErrNotAdmin means the target carries no admin role and -allow-non-admin
	// was not passed. This command exists to rescue ADMINISTRATORS; silently
	// resetting a player's password would make it a generic account-takeover
	// tool for anyone who ever gets a shell on the box.
	ErrNotAdmin = errors.New("ownerreset: target is not an administrator")
	// ErrRedisUnreachable means sessions could not be revoked, so nothing was
	// changed (see the package header).
	ErrRedisUnreachable = errors.New("ownerreset: cannot reach Redis, so live sessions could not be revoked — nothing was changed")
	// ErrLostWrite means a concurrent writer kept clobbering our write.
	ErrLostWrite = errors.New("ownerreset: another process kept overwriting the account — stop the platform and retry")
)

// Deps are the already-opened durable store and Redis. Open builds them from
// the environment; tests wire their own.
type Deps struct {
	Accounts *account.Repo
	Rdb      *redisx.Client
	Store    *jsonstore.Store

	// HashParams overrides the argon2id cost. nil — which is what the command
	// always passes — means auth.HashPassword's registration parameters, so a
	// rescued account is hashed exactly like a freshly registered one. Tests
	// set light params, mirroring server.Options.Argon2Params.
	HashParams *argon2id.Params

	// Now is the clock seam for the audit entry (nil = time.Now).
	Now func() time.Time
}

func (d Deps) now() time.Time {
	if d.Now == nil {
		return time.Now()
	}
	return d.Now()
}

// Request names the target and carries the already-obtained new password.
//
// The password is a FIELD, never a command-line flag: cmd/ownerreset obtains it
// from a no-echo TTY prompt or generates one, so it never lands in shell
// history, in `ps` output, or in a process's argv on /proc.
type Request struct {
	// Username OR AccountID identifies the target (exactly one).
	Username  string
	AccountID string
	// NewPassword must satisfy auth.ValidatePassword.
	NewPassword string
	// AllowNonAdmin permits a target that carries no admin role.
	AllowNonAdmin bool
	// Generated records that the password was machine-generated. Audited as a
	// boolean; the password itself never is.
	Generated bool
}

// Result is what the operator is shown. It contains NO credential material —
// the plaintext stays in the caller's hand and the hash never leaves the store.
type Result struct {
	AccountID string
	Username  string
	// WasAdmin is false only when -allow-non-admin was used.
	WasAdmin bool
	// PreviousStatus is the approval status before the reset ("" = legacy).
	PreviousStatus string
	// ForcedApproved / ClearedBan record the un-locking half of the rescue.
	ForcedApproved bool
	ClearedBan     bool
	// SessionsRevoked is how many live refresh tokens were destroyed.
	SessionsRevoked int
	// Warnings are post-write failures. The password HAS changed when these are
	// present; they name what else did not happen and what to do about it.
	Warnings []string
}

// Changed reports whether the password was actually replaced. Reset returns a
// zero Result with an error when nothing was written.
func (r Result) Changed() bool { return r.AccountID != "" }

// Reset replaces the password of one account and makes that account usable.
//
// Order is chosen so that every failure lands on the safe side:
//
//  1. Redis reachability, target resolution, the admin check and password
//     validation ALL run before anything is written. A refusal at this stage
//     leaves the deploy exactly as it was.
//  2. The credential, the approval status and the ban are written in ONE locked
//     read-modify-write, then verified by re-reading. Forcing approved and
//     clearing the ban is not scope creep: this is the last-resort path, it is
//     reached precisely when the deploy is broken, and a rescued admin who is
//     pending (under the #126 gate) or banned (by a squatter who won the
//     first-owner race) still cannot obtain a token. A rescue that cannot sign
//     in rescues nobody — the same reasoning admin.EnsureBootstrapAdmin uses.
//  3. Sessions are revoked AFTER the write, so a token stolen before the reset
//     cannot outlive it, and a rotation racing the revoke is swept by the
//     bounded re-check.
//  4. The audit line is written last and carries no secret.
func Reset(ctx context.Context, d Deps, req Request) (Result, error) {
	if err := d.Rdb.R.Ping(ctx).Err(); err != nil {
		return Result{}, fmt.Errorf("%w: %v", ErrRedisUnreachable, err)
	}
	a, err := resolve(ctx, d, req)
	if err != nil {
		return Result{}, err
	}
	if !a.HasRole(account.RoleAdmin) && !req.AllowNonAdmin {
		return Result{}, fmt.Errorf("%w: %q (%s) carries no %q role — pass -allow-non-admin if you really mean to reset a player's password",
			ErrNotAdmin, a.Username, a.ID, account.RoleAdmin)
	}
	// Hashing also validates the password, so an unusable one is refused before
	// any write (and before we have spent ~100ms on argon2id for nothing).
	hash, err := auth.HashPassword(req.NewPassword, d.HashParams)
	if err != nil {
		return Result{}, err
	}
	// Backstop: the store refuses anything that is not an encoded argon2id
	// string, and this command must never be the thing that writes a plaintext.
	if !strings.HasPrefix(hash, "$argon2id$") {
		return Result{}, account.ErrInvalidPasswordHash
	}

	res := Result{
		AccountID:      a.ID,
		Username:       a.Username,
		WasAdmin:       a.HasRole(account.RoleAdmin),
		PreviousStatus: a.Status,
	}
	live, err := d.Rdb.CountLiveRefresh(ctx, a.ID)
	if err != nil {
		return Result{}, fmt.Errorf("%w: %v", ErrRedisUnreachable, err)
	}
	res.SessionsRevoked = int(live)

	if err := applyWrite(ctx, d, a.ID, hash, &res); err != nil {
		return Result{}, err
	}

	// From here the credential HAS changed. Nothing below may abort the run —
	// telling the operator "it failed" about a password that now works would be
	// the one lie this command must never tell. Failures become warnings.
	if err := revokeSessions(ctx, d, a.ID); err != nil {
		res.Warnings = append(res.Warnings, fmt.Sprintf(
			"live sessions were NOT fully revoked (%v) — an already-issued refresh token may still work; "+
				"restore Redis and re-run this command, or ban+unban the account from the console", err))
	}
	if err := writeAudit(ctx, d, res, req.Generated); err != nil {
		res.Warnings = append(res.Warnings, fmt.Sprintf(
			"the reset was NOT recorded in the audit log (%v) — the password change itself succeeded", err))
	}
	// Deliberately no password, no hash, no salt: this line exists so an
	// operator reading journalctl can see that a credential was replaced.
	slog.Warn("ownerreset: administrator password replaced from the host",
		"accountId", res.AccountID, "username", res.Username,
		"sessionsRevoked", res.SessionsRevoked, "forcedApproved", res.ForcedApproved,
		"clearedBan", res.ClearedBan, "wasAdmin", res.WasAdmin)
	return res, nil
}

// resolve finds the target by username or id.
func resolve(ctx context.Context, d Deps, req Request) (account.Account, error) {
	username, id := strings.TrimSpace(req.Username), strings.TrimSpace(req.AccountID)
	switch {
	case username != "" && id != "":
		return account.Account{}, errors.New("ownerreset: give -username OR -id, not both")
	case username != "":
		a, err := d.Accounts.GetByUsername(ctx, username)
		if errors.Is(err, account.ErrNotFound) {
			return a, fmt.Errorf("%w: username %q (run with -list to see the administrators this deploy has)", ErrNotFound, username)
		}
		return a, err
	case id != "":
		a, err := d.Accounts.GetByID(ctx, id)
		if errors.Is(err, account.ErrNotFound) {
			return a, fmt.Errorf("%w: id %q (run with -list to see the administrators this deploy has)", ErrNotFound, id)
		}
		return a, err
	default:
		return account.Account{}, ErrNoTarget
	}
}

// applyWrite installs the hash, forces approved and clears any ban in one
// locked read-modify-write, then RE-READS to confirm the write survived.
//
// The re-read is not paranoia about the filesystem — jsonstore writes through
// renameio and is atomic. It is about the other process: account.Repo's mutex
// is in-process, so a running platform settling a match on this same account
// can read-modify-write around us and drop our field. That would present as
// "the reset said it worked and the password still does not". Detecting it and
// retrying is cheap; guessing is not.
func applyWrite(ctx context.Context, d Deps, id, hash string, res *Result) error {
	for attempt := 1; attempt <= writeAttempts; attempt++ {
		forcedApproved, clearedBan := false, false
		if _, err := d.Accounts.Update(ctx, id, func(ac *account.Account) error {
			ac.PasswordHash = hash
			if !ac.IsApproved() {
				ac.Status = account.StatusApproved
				forcedApproved = true
			}
			if ac.Banned {
				ac.Banned, ac.BanReason = false, ""
				clearedBan = true
			}
			return nil
		}); err != nil {
			return err
		}
		stored, err := d.Accounts.GetByID(ctx, id)
		if err != nil {
			return err
		}
		if stored.PasswordHash == hash && stored.IsApproved() && !stored.Banned {
			res.ForcedApproved = res.ForcedApproved || forcedApproved
			res.ClearedBan = res.ClearedBan || clearedBan
			return nil
		}
		slog.Warn("ownerreset: the account was rewritten by another process mid-reset — retrying",
			"accountId", id, "attempt", attempt, "of", writeAttempts)
	}
	return ErrLostWrite
}

// revokeSessions kills every live refresh token of the account, then re-checks.
//
// RevokeAllRefresh is the seam ban/deny and the self-service password change
// already use. The re-check exists because a rotation racing the revoke can
// re-register a token after SMembers has read the set: one extra sweep costs a
// round trip and closes the practical window.
func revokeSessions(ctx context.Context, d Deps, id string) error {
	for i := 0; i < writeAttempts; i++ {
		if err := d.Rdb.RevokeAllRefresh(ctx, id); err != nil {
			return err
		}
		n, err := d.Rdb.CountLiveRefresh(ctx, id)
		if err != nil {
			return err
		}
		if n == 0 {
			return nil
		}
	}
	return errors.New("refresh tokens kept reappearing")
}

// writeAudit appends the reset to the SAME append-only log the console's audit
// page reads, in the shape admin.Service.audit writes (see
// internal/server/audit.go, which does the identical thing for the self-service
// password change). The detail map is an allow-list of booleans and counts by
// construction — there is no field here that could carry the password, and
// auditNoSecret_test pins that.
func writeAudit(ctx context.Context, d Deps, res Result, generated bool) error {
	now := d.now().UTC()
	return d.Store.AppendLine(admin.ColAudit, now.Format("2006-01-02"), admin.AuditEntry{
		AdminID:  ActorCLI,
		Action:   AuditAction,
		TargetID: res.AccountID,
		Detail: map[string]any{
			"source":          "cmd/ownerreset",
			"username":        res.Username,
			"wasAdmin":        res.WasAdmin,
			"forcedApproved":  res.ForcedApproved,
			"clearedBan":      res.ClearedBan,
			"sessionsRevoked": res.SessionsRevoked,
			"generated":       generated,
		},
		TS: now,
	})
}

// Admin is one administrator, for the -list output that helps an operator who
// has forgotten WHICH account is the owner.
type Admin struct {
	ID       string
	Username string
	Banned   bool
	Status   string
}

// ListAdmins returns every account carrying the admin role, read the same way
// the first-owner gate reads it: the account FILES, not _index.json and not
// Redis. Safe to print — it is the host's own operator list, and it carries no
// credential material.
func ListAdmins(ctx context.Context, d Deps) ([]Admin, error) {
	ids, err := d.Accounts.Admins(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Admin, 0, len(ids))
	for _, id := range ids {
		a, err := d.Accounts.GetByID(ctx, id)
		if err != nil {
			return nil, err
		}
		out = append(out, Admin{ID: a.ID, Username: a.Username, Banned: a.Banned, Status: a.Status})
	}
	return out, nil
}

package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/redisx"
)

// First-account owner bootstrap.
//
// A fresh deploy has no accounts, therefore no admin, therefore nobody who can
// grant anyone the admin role — the console is unreachable and (with the #126
// approval gate on) the first registrant would sit pending forever with nobody
// alive to approve it. The deploy is bricked.
//
// The fix ships NO secret: while a deploy has no administrator, a registration
// creates the owner — admin role plus a forced APPROVED status, written into
// the account's very first persisted state. There is no default password to
// leak, to hardcode in this repo, or to forget to change; the owner picks their
// own credential at the moment they claim it.
//
// # What gates the grant
//
// THE GATE IS "THIS DEPLOY HAS NO ADMINISTRATOR", read from the account files
// on disk (account.Repo.Admins — a directory scan, not the derived _index.json,
// and not Redis). Everything else is a referee or an extra lock, never the
// gate. That choice is the whole design, and it is a deliberate replacement for
// the obvious-looking "the store has zero accounts":
//
//   - "zero accounts" is not the same predicate as "no owner was ever minted".
//     Every way an account can land WITHOUT a promotion — a cancelled request
//     context, a half-failed create, a concurrent loser winning the race to
//     disk — permanently forecloses ownership under that rule, and the only
//     exit is the ADMIN_BOOTSTRAP_USERNAME + restart dance this feature exists
//     to remove. Under "no admin exists" all of those simply retry.
//   - It reads the durable truth, so wiping Redis cannot mint a second owner
//     and losing _index.json cannot either.
//   - It fails CLOSED: an unreadable store is treated as "an admin might exist",
//     never as "this deploy is free to claim".
//
// The Redis key is therefore NOT a permanent one-shot — it is a short-lived
// mutex that serialises simultaneous first registrations, taken with SETNX and
// a TTL and released as soon as the registration finishes either way. A crash
// mid-claim costs at most ownerClaimTTL, not the deploy.
//
// # Who may claim
//
// While a deploy is ownerless the claim is open to any registration, which is a
// footrace on a public endpoint: whoever registers first wins, operator or not.
// That is an accepted, BOUNDED exposure — the window exists only until the
// first admin exists, the boot log says loudly that it is open and who closed
// it, and admin.SetAdminRole can revoke a wrong grant afterwards. A deploy that
// cannot accept that (anything reachable from a network the operator does not
// control) sets GGD_OWNER_BOOTSTRAP_TOKEN=1: the platform then mints a one-time
// token into the boot log and DATA_DIR/owner-setup-token (0600), and only a
// registration presenting it may claim ownership.
//
// NOT USED, DELIBERATELY: "the caller is on loopback". On this binary that
// signal is inverted — the LAN-published vite dev server proxies phone traffic
// to the platform, so every remote client arrives from 127.0.0.1 and a loopback
// check would hand ownership to exactly the caller it was meant to exclude.
// internal/server/devsurface_test.go is the standing lock on that, and it is
// why the escape hatch here is a filesystem token (real operator presence,
// immune to proxying) rather than an address.

// bootstrapRecovery is appended to every failure log so the operator reading it
// has the escape hatch in front of them, not in a doc somewhere.
const bootstrapRecovery = "set ADMIN_BOOTSTRAP_USERNAME=<username> and restart the platform to grant the admin role manually"

// ownerClaimTTL bounds how long one registration may hold the owner claim.
// It only has to cover a single account write, and its expiry is safe because
// the real gate is the durable "no admin exists" check — an expired claim can
// still not promote anyone once an admin is on disk.
const ownerClaimTTL = 2 * time.Minute

// ownerTokenFile is the 0600 file under DATA_DIR that holds the one-time owner
// token when GGD_OWNER_BOOTSTRAP_TOKEN is on. Reading it requires access to the
// machine running the platform, which is the point.
//
// #nosec G101 -- this is a FILENAME, not a credential: gosec matches the
// identifier on "token", not the value. The token itself is minted at runtime
// from crypto/rand and written 0600 in ensureOwnerToken below; the file lives
// under DATA_DIR, which .gitignore excludes ("runtime durable store"), so it is
// never committed — `git ls-files | grep owner-setup-token` is empty. Nor is it
// web-reachable: the platform registers no static-file route (no FileServer /
// http.Dir / ServeFile anywhere in internal/ or cmd/).
const ownerTokenFile = "owner-setup-token"

// OwnerBootstrap configures the first-owner grant. The zero value disables it
// entirely, which is what an embedder (or a test simulating an established
// deploy) wants.
type OwnerBootstrap struct {
	// Enabled turns the whole mechanism on.
	Enabled bool
	// RequireToken demands that a claiming registration present the one-time
	// token from DATA_DIR/owner-setup-token.
	RequireToken bool
	// DataDir is where that token lives.
	DataDir string
}

// SetOwnerBootstrap installs the bootstrap policy (composition root only).
func (s *Service) SetOwnerBootstrap(b OwnerBootstrap) { s.ownerBootstrap = b }

// OwnerTokenPath is where the one-time owner token lives for a given data dir.
func OwnerTokenPath(dataDir string) string { return filepath.Join(dataDir, ownerTokenFile) }

// PrepareOwnerBootstrap is called once at boot. It reports the ownership state
// of the deploy in the log — an operator must be able to see, without turning
// on debug logging, whether the claim window is open — and mints or clears the
// one-time token accordingly. It returns an error only when the durable store
// cannot be read, because in that case nothing downstream can be trusted.
func (s *Service) PrepareOwnerBootstrap(ctx context.Context) error {
	if !s.ownerBootstrap.Enabled {
		return nil
	}
	admins, err := s.accounts.Admins(ctx)
	if err != nil {
		return err
	}
	if len(admins) > 0 {
		// Owned: no claim is available, so any token lying around is dead weight.
		if err := os.Remove(OwnerTokenPath(s.ownerBootstrap.DataDir)); err != nil && !os.IsNotExist(err) {
			slog.Error("auth: could not remove the stale owner-setup token", "err", err)
		}
		slog.Info("auth: deploy has an administrator — the first-owner claim is closed", "admins", len(admins))
		return nil
	}
	if !s.ownerBootstrap.RequireToken {
		slog.Warn("auth: THIS DEPLOY HAS NO ADMINISTRATOR — the next registration becomes the owner",
			"action", "register your own account now, before anyone else can",
			"harden", "set GGD_OWNER_BOOTSTRAP_TOKEN=1 to require a one-time token instead")
		return nil
	}
	tok, err := s.ensureOwnerToken()
	if err != nil {
		return err
	}
	slog.Warn("auth: THIS DEPLOY HAS NO ADMINISTRATOR — registration must present the owner token to claim it",
		"ownerToken", tok, "tokenFile", OwnerTokenPath(s.ownerBootstrap.DataDir),
		"action", "register with this token in the request's bootstrapToken field")
	return nil
}

// OwnerlessState reports whether this deploy still needs its first owner, so the
// register UI can switch into "首位管理員設定" mode and offer the owner-token
// field. It reveals ONLY two booleans — never the token, never account
// existence — and both are things the boot log already shouts, so it is not a
// meaningful probe surface: needsOwner is true solely during the ownerless
// window, and even while it is true a networked deploy still requires the 0600
// token to actually claim (requireToken), so advertising the window weakens
// nothing. (This is deliberately narrower than advertising the invite gate,
// which the client never does: whether a deploy is gated is a different signal.)
//
// It FAILS CLOSED: bootstrap disabled, or an unreadable store, both report
// needsOwner=false, so the UI never invites a first-owner claim on a deploy that
// is already owned or that cannot be read.
func (s *Service) OwnerlessState(ctx context.Context) (needsOwner, requireToken bool) {
	if !s.ownerBootstrap.Enabled {
		return false, false
	}
	admins, err := s.accounts.Admins(ctx)
	if err != nil {
		slog.Error("auth: could not read admins for the bootstrap-state probe; reporting owned", "err", err)
		return false, false
	}
	return len(admins) == 0, s.ownerBootstrap.RequireToken
}

// ensureOwnerToken returns the existing token, minting one if absent.
func (s *Service) ensureOwnerToken() (string, error) {
	path := OwnerTokenPath(s.ownerBootstrap.DataDir)
	// #nosec G304 -- `path` is OwnerTokenPath(DataDir), i.e. filepath.Join of the
	// operator-configured DATA_DIR and the ownerTokenFile constant above. No
	// request data reaches either component.
	if data, err := os.ReadFile(path); err == nil {
		if tok := strings.TrimSpace(string(data)); tok != "" {
			return tok, nil
		}
	} else if !os.IsNotExist(err) {
		return "", err
	}
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	tok := hex.EncodeToString(raw)
	// 0o750 (was 0o755): filepath.Dir(path) is DATA_DIR itself, which in every
	// deployed configuration already exists (bind mount / PVC), so this is a
	// no-op in production and only bites on a fresh nested DATA_DIR. The token
	// file below is already correctly 0600, and `make family-token` reads it via
	// `docker compose cp` (the daemon runs as root), so the mode never gates the
	// owner's own access.
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return "", err
	}
	if err := os.WriteFile(path, []byte(tok+"\n"), 0o600); err != nil {
		return "", err
	}
	return tok, nil
}

// ownerTokenAccepted reports whether the presented token matches the one on
// disk. A missing/empty file or an empty presentation is never a match.
func (s *Service) ownerTokenAccepted(presented string) bool {
	presented = strings.TrimSpace(presented)
	if presented == "" {
		return false
	}
	data, err := os.ReadFile(OwnerTokenPath(s.ownerBootstrap.DataDir))
	if err != nil {
		slog.Error("auth: could not read the owner-setup token", "err", err, "recovery", bootstrapRecovery)
		return false
	}
	want := strings.TrimSpace(string(data))
	if want == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(want), []byte(presented)) == 1
}

// consumeOwnerToken removes the one-time token once it has actually produced an
// owner. Best effort: PrepareOwnerBootstrap clears it on the next boot anyway,
// and the durable "an admin exists" gate already refuses further claims.
func (s *Service) consumeOwnerToken() {
	if !s.ownerBootstrap.RequireToken {
		return
	}
	if err := os.Remove(OwnerTokenPath(s.ownerBootstrap.DataDir)); err != nil && !os.IsNotExist(err) {
		slog.Error("auth: could not consume the owner-setup token", "err", err)
	}
}

// claimOwnership reports whether the account about to be created may be granted
// ownership of this deploy, and returns a release for the claim it took.
//
// It never returns an error, and it never fails a registration: an account is
// worth more than a grant, and — unlike the earlier "the store must be empty"
// design — declining to promote costs nothing permanent, because the next
// registration on a still-ownerless deploy can claim it instead. Every refusal
// path is logged with the ADMIN_BOOTSTRAP_USERNAME recovery string.
//
// The returned release must always be called (defer it): on success it retires
// the mutex so a failed create can be retried immediately, and on failure it
// prevents a dead claim from blocking the next registrant for ownerClaimTTL.
func (s *Service) claimOwnership(ctx context.Context, id, presentedToken string) (bool, func()) {
	noop := func() {}
	if !s.ownerBootstrap.Enabled {
		return false, noop
	}
	// THE GATE. Fail closed: an unreadable store must never read as "unowned".
	admins, err := s.accounts.Admins(ctx)
	if err != nil {
		slog.Error("auth: could not determine whether this deploy has an administrator; registering without an owner grant",
			"err", err, "recovery", bootstrapRecovery)
		return false, noop
	}
	if len(admins) > 0 {
		return false, noop
	}
	if s.ownerBootstrap.RequireToken && !s.ownerTokenAccepted(presentedToken) {
		slog.Warn("auth: registration on an ownerless deploy presented no valid owner token — created as an ordinary player",
			"tokenFile", OwnerTokenPath(s.ownerBootstrap.DataDir))
		return false, noop
	}
	// Referee only: serialises simultaneous first registrations so exactly one
	// of them can be writing an owner at a time.
	ok, err := s.rdb.SetNX(ctx, redisx.KeyBootstrapOwner(), id, ownerClaimTTL)
	if err != nil {
		slog.Error("auth: could not take the owner claim; registering without an owner grant",
			"err", err, "recovery", bootstrapRecovery)
		return false, noop
	}
	if !ok {
		return false, noop
	}
	return true, func() { s.releaseOwnerClaim(ctx, id) }
}

// releaseOwnerClaimScript deletes the claim only if this registration still
// holds it, so a claim that already expired and was retaken by someone else is
// never stolen from its new holder.
var releaseOwnerClaimScript = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`

func (s *Service) releaseOwnerClaim(ctx context.Context, id string) {
	if err := s.rdb.R.Eval(ctx, releaseOwnerClaimScript, []string{redisx.KeyBootstrapOwner()}, id).Err(); err != nil {
		// Harmless: the claim carries a TTL, and the durable gate is what
		// actually decides. Logged because a Redis that refuses EVAL is worth
		// knowing about.
		slog.Warn("auth: could not release the owner claim (it will expire)", "err", err, "ttl", ownerClaimTTL)
	}
}

// logFirstOwner announces the promotion at WARN so it stands out in the boot
// log: an operator scanning a fresh deploy's output must be able to see WHICH
// account took ownership and WHEN, without turning on debug logging.
func logFirstOwner(a account.Account) {
	slog.Warn("auth: FIRST ACCOUNT — granted platform ownership (admin role + approved)",
		"username", a.Username,
		"accountId", a.ID,
		"at", a.CreatedAt.UTC().Format(time.RFC3339),
		"role", account.RoleAdmin,
		"note", "the claim window is now closed; use POST /api/v1/admin/accounts/{id}/role to change this")
}

// ownerreset_test.go exercises the host-side administrator password reset
// against a REAL wired platform (testutil): the command's Deps are opened over
// the same DATA_DIR and Redis the running server is serving from, which is
// exactly the topology an operator is in when they run it while the platform is
// up. Every "did it work?" assertion therefore goes through the platform's own
// HTTP surface — a stored hash that changed proves nothing if login disagrees.
//
// Passwords in this file are throwaway literals invented for the assertion
// using them; nothing here names a real account or credential.
package ownerreset_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexedwards/argon2id"
	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/ownerreset"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// registerPassword mirrors testutil.Register's derivation, so a test can try
// the ORIGINAL password after a reset and watch it fail.
func registerPassword(username string) string { return "correct-horse-" + username }

// harness boots a fresh (ownerless) deploy and opens the CLI's Deps against the
// SAME store + Redis. The first registration therefore becomes the owner-admin,
// which is the account this whole feature exists to rescue.
func harness(t *testing.T) (*testutil.TS, ownerreset.Deps) {
	t.Helper()
	ts := testutil.NewFreshDeploy(t)
	return ts, depsFor(t, ts.Cfg.DataDir, ts.Mini.Addr())
}

func depsFor(t *testing.T, dataDir, redisAddr string) ownerreset.Deps {
	t.Helper()
	store, err := jsonstore.New(dataDir)
	require.NoError(t, err)
	rdb := redisx.New(redisAddr, "")
	t.Cleanup(func() { _ = rdb.Close() })
	return ownerreset.Deps{
		Accounts: account.NewRepo(store, rdb),
		Rdb:      rdb,
		Store:    store,
		// Light params for speed, mirroring server.Options.Argon2Params. The
		// production nil-means-registration-parameters path has its own test
		// (TestResetHashesWithTheRegistrationParameters).
		HashParams: testutil.LightArgon2,
	}
}

func storedAccount(t *testing.T, d ownerreset.Deps, id string) account.Account {
	t.Helper()
	a, err := d.Accounts.GetByID(context.Background(), id)
	require.NoError(t, err)
	return a
}

// login posts credentials the way the console and the game client do.
func login(ts *testutil.TS, usernameOrEmail, password string) testutil.Resp {
	return ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": usernameOrEmail, "password": password,
	})
}

func refresh(ts *testutil.TS, token string) testutil.Resp {
	return ts.Do(http.MethodPost, "/api/v1/auth/refresh", "", map[string]string{"refreshToken": token})
}

// captureLogs redirects slog for the duration of fn and returns everything it
// emitted, so a test can assert what a credential-touching path did NOT print.
func captureLogs(t *testing.T, fn func()) string {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	defer slog.SetDefault(prev)
	fn()
	return buf.String()
}

// ownerreset-resets-password: the stored credential is replaced, the OLD
// password stops working and the NEW one signs in — checked through the
// platform's own login, not by inspecting the file.
func TestResetSwapsTheWorkingPassword(t *testing.T) {
	testkit.Cover(t, "ownerreset-resets-password")
	ts, d := harness(t)
	owner := ts.Register("founder")
	before := storedAccount(t, d, owner.ID)
	require.True(t, before.HasRole(account.RoleAdmin), "the first account on a fresh deploy must be the admin")

	const newPassword = "throwaway-rescue-passphrase-1"
	res, err := ownerreset.Reset(context.Background(), d, ownerreset.Request{
		Username: "founder", NewPassword: newPassword,
	})
	require.NoError(t, err)
	assert.True(t, res.Changed())
	assert.Equal(t, owner.ID, res.AccountID)
	assert.True(t, res.WasAdmin)

	after := storedAccount(t, d, owner.ID)
	assert.NotEqual(t, before.PasswordHash, after.PasswordHash, "the stored hash must change")
	assert.True(t, strings.HasPrefix(after.PasswordHash, "$argon2id$"),
		"the store must never hold anything but an encoded argon2id hash")
	assert.NotContains(t, after.PasswordHash, newPassword, "the plaintext must not be in the file")

	// THE assertion: the running platform — not restarted, not reloaded —
	// answers with the new credential and refuses the old one.
	old := login(ts, "founder", registerPassword("founder"))
	assert.Equal(t, http.StatusUnauthorized, old.Status, "the old password must stop working: %s", string(old.Raw))

	fresh := login(ts, "founder", newPassword)
	require.Equal(t, http.StatusOK, fresh.Status, "the new password must sign in: %s", string(fresh.Raw))
	tokens := fresh.Body["tokens"].(map[string]any)
	assert.NotEmpty(t, tokens["accessToken"])
}

// ownerreset-revokes-sessions: every live refresh token of the target dies, and
// no other account's session is touched. A reset that left a stolen session
// alive would hand the thief a way back in the moment the operator relaxed.
func TestResetKillsEverySessionOfTheTargetOnly(t *testing.T) {
	testkit.Cover(t, "ownerreset-revokes-sessions")
	ts, d := harness(t)
	owner := ts.Register("founder")
	bystander := ts.Register("teammate")

	// Two more sessions for the owner — a phone and a second browser, say — so
	// the test is about ALL of them, not just the newest.
	second := login(ts, "founder", registerPassword("founder"))
	require.Equal(t, http.StatusOK, second.Status)
	secondRefresh := second.Body["tokens"].(map[string]any)["refreshToken"].(string)
	third := login(ts, "founder", registerPassword("founder"))
	require.Equal(t, http.StatusOK, third.Status)
	thirdRefresh := third.Body["tokens"].(map[string]any)["refreshToken"].(string)

	live, err := d.Rdb.CountLiveRefresh(context.Background(), owner.ID)
	require.NoError(t, err)
	require.EqualValues(t, 3, live, "three sessions were opened")

	res, err := ownerreset.Reset(context.Background(), d, ownerreset.Request{
		Username: "founder", NewPassword: "throwaway-rescue-passphrase-2",
	})
	require.NoError(t, err)
	assert.Equal(t, 3, res.SessionsRevoked, "the report must name how many sessions were killed")

	for i, tok := range []string{owner.Refresh, secondRefresh, thirdRefresh} {
		r := refresh(ts, tok)
		assert.Equal(t, http.StatusUnauthorized, r.Status,
			"refresh token %d of the reset account must be dead: %s", i, string(r.Raw))
	}
	remaining, err := d.Rdb.CountLiveRefresh(context.Background(), owner.ID)
	require.NoError(t, err)
	assert.EqualValues(t, 0, remaining)

	// The blast radius is exactly one account.
	other := refresh(ts, bystander.Refresh)
	require.Equal(t, http.StatusOK, other.Status,
		"another account's session must be untouched: %s", string(other.Raw))
}

// ownerreset-rescues-locked-out-admin: a banned AND unapproved administrator
// comes back usable. Replacing only the credential would be a rescue that still
// cannot sign in — login answers 403 for both states before it ever looks at a
// password.
func TestBannedAndPendingAdminComesBackUsable(t *testing.T) {
	testkit.Cover(t, "ownerreset-rescues-locked-out-admin")
	ts, d := harness(t)
	owner := ts.Register("founder")

	// Put the owner in the worst reachable state: banned (by a squatter who won
	// the first-owner race) and pending (under the #126 approval gate).
	_, err := ts.Srv.Accounts.Update(context.Background(), owner.ID, func(a *account.Account) error {
		a.Banned, a.BanReason = true, "locked out by a squatter"
		a.Status = account.StatusPending
		return nil
	})
	require.NoError(t, err)
	blocked := login(ts, "founder", registerPassword("founder"))
	require.Equal(t, http.StatusForbidden, blocked.Status, "precondition: the admin cannot sign in at all")

	const newPassword = "throwaway-rescue-passphrase-3"
	res, err := ownerreset.Reset(context.Background(), d, ownerreset.Request{
		Username: "founder", NewPassword: newPassword,
	})
	require.NoError(t, err)
	assert.True(t, res.ForcedApproved, "the rescue must report that it forced approval")
	assert.True(t, res.ClearedBan, "the rescue must report that it cleared the ban")
	assert.Equal(t, account.StatusPending, res.PreviousStatus)

	after := storedAccount(t, d, owner.ID)
	assert.False(t, after.Banned)
	assert.Empty(t, after.BanReason)
	assert.True(t, after.IsApproved())
	assert.True(t, after.HasRole(account.RoleAdmin), "the role must survive the rescue")

	ok := login(ts, "founder", newPassword)
	require.Equal(t, http.StatusOK, ok.Status, "a rescued admin must actually be able to sign in: %s", string(ok.Raw))

	// …and the session it gets is a real operator session.
	access := ok.Body["tokens"].(map[string]any)["accessToken"].(string)
	admins := ts.Do(http.MethodGet, "/api/v1/admin/accounts?page=1&pageSize=1", access, nil)
	assert.Equal(t, http.StatusOK, admins.Status, "the rescued admin must reach the admin API: %s", string(admins.Raw))
}

// ownerreset-no-password-leak: the new password appears in no log line, in no
// audit field, and in nothing the store persists. The argv half of the same
// property is pinned in surface_test.go (there is no flag that could carry it).
func TestPasswordNeverLeaksIntoLogsAuditOrStore(t *testing.T) {
	testkit.Cover(t, "ownerreset-no-password-leak")
	ts, d := harness(t)
	owner := ts.Register("founder")

	// A distinctive literal, so a substring search cannot pass by accident.
	const newPassword = "zqx-throwaway-canary-passphrase-77"

	var res ownerreset.Result
	logs := captureLogs(t, func() {
		var err error
		res, err = ownerreset.Reset(context.Background(), d, ownerreset.Request{
			Username: "founder", NewPassword: newPassword, Generated: true,
		})
		require.NoError(t, err)
	})
	require.NotEmpty(t, logs, "the reset must log SOMETHING — otherwise this test proves nothing")
	assert.NotContains(t, logs, newPassword, "the password must never reach a log line")

	after := storedAccount(t, d, owner.ID)
	assert.NotContains(t, logs, after.PasswordHash, "the hash must not be logged either")

	// The audit file on disk, read as raw bytes — not through a struct that
	// might drop the very field a leak would live in.
	raw := auditBytes(t, ts.Cfg.DataDir)
	require.NotEmpty(t, raw, "the reset must have written an audit line")
	assert.NotContains(t, string(raw), newPassword, "the password must never reach the audit log")
	assert.NotContains(t, string(raw), after.PasswordHash, "the hash must never reach the audit log")
	assert.NotContains(t, string(raw), "$argon2id$", "no credential material of any shape belongs in the audit log")

	// Nor anywhere else the reset wrote: the whole DATA_DIR is searched.
	assertNoPlaintextUnder(t, ts.Cfg.DataDir, newPassword)

	// And the Result an operator's terminal renders carries no secret.
	blob, err := json.Marshal(res)
	require.NoError(t, err)
	assert.NotContains(t, string(blob), newPassword)
}

// auditBytes returns every byte of the admin audit log.
func auditBytes(t *testing.T, dataDir string) []byte {
	t.Helper()
	dir := filepath.Join(dataDir, admin.ColAudit)
	entries, err := os.ReadDir(dir)
	require.NoError(t, err, "the audit directory must exist after a reset")
	var out []byte
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		require.NoError(t, err)
		out = append(out, data...)
	}
	return out
}

// assertNoPlaintextUnder walks DATA_DIR and fails if the plaintext password is
// anywhere in it.
func assertNoPlaintextUnder(t *testing.T, dataDir, password string) {
	t.Helper()
	require.NoError(t, filepath.Walk(dataDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		assert.NotContains(t, string(data), password, "%s holds the plaintext password", path)
		return nil
	}))
}

// ownerreset-non-admin-guarded: a target with no admin role is refused, and the
// refusal changes NOTHING. Without this the command is a generic
// account-takeover tool for anyone who ever gets a shell on the box.
func TestRefusesANonAdminTargetWithoutTheExplicitFlag(t *testing.T) {
	testkit.Cover(t, "ownerreset-non-admin-guarded")
	ts, d := harness(t)
	_ = ts.Register("founder") // the admin; the second account is an ordinary player
	player := ts.Register("teammate")
	before := storedAccount(t, d, player.ID)

	res, err := ownerreset.Reset(context.Background(), d, ownerreset.Request{
		Username: "teammate", NewPassword: "throwaway-should-not-apply-4",
	})
	require.Error(t, err)
	assert.ErrorIs(t, err, ownerreset.ErrNotAdmin)
	assert.Contains(t, err.Error(), "-allow-non-admin", "the refusal must name the way through")
	assert.False(t, res.Changed(), "a refusal must report that nothing happened")

	// Nothing moved: not the hash, not the session, not the login.
	after := storedAccount(t, d, player.ID)
	assert.Equal(t, before.PasswordHash, after.PasswordHash)
	still := refresh(ts, player.Refresh)
	assert.Equal(t, http.StatusOK, still.Status, "a refused reset must not revoke sessions")
	ok := login(ts, "teammate", registerPassword("teammate"))
	assert.Equal(t, http.StatusOK, ok.Status, "the player's own password must still work")

	// With the flag, it proceeds — and says the target was not an administrator.
	res, err = ownerreset.Reset(context.Background(), d, ownerreset.Request{
		Username: "teammate", NewPassword: "throwaway-explicit-override-5", AllowNonAdmin: true,
	})
	require.NoError(t, err)
	assert.False(t, res.WasAdmin, "the report must not pretend the target was an admin")
	assert.Equal(t, http.StatusOK, login(ts, "teammate", "throwaway-explicit-override-5").Status)
}

// ownerreset-audited: the reset lands in the SAME append-only audit log the
// console renders — a credential replaced out-of-band has to be visible inside
// the product — and the entry carries no secret.
func TestResetIsAuditedWithNoSecret(t *testing.T) {
	testkit.Cover(t, "ownerreset-audited")
	ts, d := harness(t)
	owner := ts.Register("founder")

	const newPassword = "throwaway-audited-passphrase-6"
	_, err := ownerreset.Reset(context.Background(), d, ownerreset.Request{
		Username: "founder", NewPassword: newPassword, Generated: true,
	})
	require.NoError(t, err)

	// Read it the way the operator does: sign in with the NEW password and pull
	// the console's audit page.
	signin := login(ts, "founder", newPassword)
	require.Equal(t, http.StatusOK, signin.Status, string(signin.Raw))
	access := signin.Body["tokens"].(map[string]any)["accessToken"].(string)

	page := ts.Do(http.MethodGet, "/api/v1/admin/audit?page=1&pageSize=50", access, nil)
	require.Equal(t, http.StatusOK, page.Status, string(page.Raw))
	assert.NotContains(t, string(page.Raw), newPassword, "the console must not be able to display the password")

	var found *admin.AuditEntry
	entries, _, err := ts.Srv.Admin.ListAudit(context.Background(), 1, 50)
	require.NoError(t, err)
	for i := range entries {
		if entries[i].Action == ownerreset.AuditAction {
			found = &entries[i]
			break
		}
	}
	require.NotNil(t, found, "a %q entry must exist: %+v", ownerreset.AuditAction, entries)
	assert.Equal(t, ownerreset.ActorCLI, found.AdminID, "the actor must say a host shell did this, not an account")
	assert.Equal(t, owner.ID, found.TargetID)
	assert.Equal(t, "cmd/ownerreset", found.Detail["source"])
	assert.Equal(t, true, found.Detail["wasAdmin"])
	assert.Equal(t, true, found.Detail["generated"])
	assert.EqualValues(t, 1, found.Detail["sessionsRevoked"])
	for k, v := range found.Detail {
		s, ok := v.(string)
		if !ok {
			continue
		}
		assert.NotContains(t, s, newPassword, "audit detail %q leaks the password", k)
		assert.NotContains(t, s, "$argon2id$", "audit detail %q leaks credential material", k)
	}
}

// ownerreset-redis-required: with Redis unreachable the reset REFUSES rather
// than changing the password and silently leaving every stolen session alive —
// refresh tokens live nowhere else.
func TestRefusesWhenSessionsCannotBeRevoked(t *testing.T) {
	testkit.Cover(t, "ownerreset-revokes-sessions")
	ts, d := harness(t)
	owner := ts.Register("founder")
	before := storedAccount(t, d, owner.ID)

	ts.Mini.Close() // Redis goes away between the operator's login and their reset

	res, err := ownerreset.Reset(context.Background(), d, ownerreset.Request{
		Username: "founder", NewPassword: "throwaway-should-not-apply-7",
	})
	require.Error(t, err)
	assert.ErrorIs(t, err, ownerreset.ErrRedisUnreachable)
	assert.False(t, res.Changed())
	assert.Equal(t, before.PasswordHash, storedAccount(t, d, owner.ID).PasswordHash,
		"a refused reset must leave the credential exactly as it was")
}

// ownerreset-registration-params: the CLI hashes with the parameters
// REGISTRATION uses. Two hashing cost settings in one codebase is the kind of
// drift nobody notices until the day the cost is raised and rescued accounts
// quietly keep the old one.
func TestResetHashesWithTheRegistrationParameters(t *testing.T) {
	testkit.Cover(t, "ownerreset-registration-params")
	// A bare auth.Service with nil params — exactly how server.New builds it in
	// production — registering an account into a temp store.
	mr := miniredis.RunT(t)
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	rdb := redisx.New(mr.Addr(), "")
	t.Cleanup(func() { _ = rdb.Close() })
	repo := account.NewRepo(store, rdb)
	svc, err := auth.New(repo, rdb, "test-secret", 0, 0, nil /* = registration defaults */, false)
	require.NoError(t, err)
	registered, _, err := svc.Register(context.Background(), "paramscheck",
		"paramscheck@example.com", "throwaway-registration-8", auth.RegisterOptions{})
	require.NoError(t, err)

	// The CLI's production path: Deps.HashParams nil.
	d := ownerreset.Deps{Accounts: repo, Rdb: rdb, Store: store}
	_, err = ownerreset.Reset(context.Background(), d, ownerreset.Request{
		Username: "paramscheck", NewPassword: "throwaway-reset-9", AllowNonAdmin: true,
	})
	require.NoError(t, err)

	reset, err := repo.GetByID(context.Background(), registered.ID)
	require.NoError(t, err)

	regParams, _, _, err := argon2id.DecodeHash(registered.PasswordHash)
	require.NoError(t, err)
	resetParams, _, _, err := argon2id.DecodeHash(reset.PasswordHash)
	require.NoError(t, err)
	assert.Equal(t, regParams.Memory, resetParams.Memory)
	assert.Equal(t, regParams.Iterations, resetParams.Iterations)
	assert.Equal(t, regParams.Parallelism, resetParams.Parallelism)
	assert.Equal(t, regParams.KeyLength, resetParams.KeyLength)
	// …and both really are the platform's declared defaults, so this test fails
	// if BOTH sides drift together.
	assert.Equal(t, auth.DefaultParams.Memory, resetParams.Memory)
	assert.Equal(t, auth.DefaultParams.Iterations, resetParams.Iterations)
}

// ownerreset-no-password-leak: the generator produces a password that is
// strong, unique per run, and acceptable to the platform's ONE password policy —
// a generated credential the server would then refuse is worse than no
// generator at all.
func TestGeneratedPasswordsAreStrongUniqueAndAccepted(t *testing.T) {
	testkit.Cover(t, "ownerreset-no-password-leak")
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		pw, err := ownerreset.GeneratePassword()
		require.NoError(t, err)
		require.NoError(t, auth.ValidatePassword(pw), "a generated password must pass the platform's own policy: %q", pw)
		assert.False(t, seen[pw], "generated password repeated within 200 draws — the source is not random")
		seen[pw] = true
		letters := strings.ReplaceAll(pw, "-", "")
		assert.Len(t, letters, ownerreset.GeneratedLength)
		for _, r := range letters {
			assert.NotContains(t, "0O1lI", string(r), "the alphabet must avoid look-alike characters")
		}
	}
}

// ownerreset-registration-params: the prompt's pre-check is the platform's own
// policy, not a second copy of it — it must accept and reject exactly what the
// server does, or the CLI grows a rule the platform has never heard of.
func TestPromptPreCheckMatchesThePlatformPolicy(t *testing.T) {
	testkit.Cover(t, "ownerreset-registration-params")
	for _, pw := range []string{"", "short", strings.Repeat("a", 129), "has\x00a-control-char"} {
		require.Error(t, ownerreset.ValidateNewPassword(pw), "%q", pw)
		require.Error(t, auth.ValidatePassword(pw), "%q must also be refused by the platform", pw)
	}
	for _, pw := range []string{"throwaway-8", strings.Repeat("a", 128)} {
		require.NoError(t, ownerreset.ValidateNewPassword(pw), "%q", pw)
		require.NoError(t, auth.ValidatePassword(pw), "%q must also be accepted by the platform", pw)
	}
	// A generated password always clears its own gate.
	pw, err := ownerreset.GeneratePassword()
	require.NoError(t, err)
	require.NoError(t, ownerreset.ValidateNewPassword(pw))
}

// ownerreset-no-password-leak: the command refuses a password-shaped flag with
// an explanation, instead of flag's generic parse error — by then the secret is
// already in the shell history and in `ps`.
func TestPasswordShapedFlagsAreRefusedWithAnExplanation(t *testing.T) {
	testkit.Cover(t, "ownerreset-no-password-leak")
	for _, args := range [][]string{
		{"-username", "founder", "-password", "hunter2"},
		{"--password=hunter2"},
		{"-pw", "hunter2"},
		{"-new-password", "hunter2"},
		{"--secret", "hunter2"},
		{"-p", "hunter2"},
	} {
		err := ownerreset.RejectPasswordArg(args)
		require.Error(t, err, "args %v must be refused", args)
		assert.Contains(t, err.Error(), "shell history")
	}
	// …and the legitimate command lines are untouched.
	for _, args := range [][]string{
		{"-username", "founder"},
		{"-username", "founder", "-generate"},
		{"-id", "01HZZ", "-allow-non-admin"},
		{"-list"},
	} {
		assert.NoError(t, ownerreset.RejectPasswordArg(args), "args %v must be allowed", args)
	}
}

// ownerreset-resets-password: naming no target, or an unknown one, is a clean
// refusal that points at -list — an owner who has forgotten their password has
// often forgotten which username it belongs to.
func TestTargetResolutionFailuresAreHelpful(t *testing.T) {
	testkit.Cover(t, "ownerreset-resets-password")
	ts, d := harness(t)
	owner := ts.Register("founder")

	_, err := ownerreset.Reset(context.Background(), d, ownerreset.Request{NewPassword: "throwaway-x-10"})
	assert.ErrorIs(t, err, ownerreset.ErrNoTarget)

	_, err = ownerreset.Reset(context.Background(), d, ownerreset.Request{
		Username: "nobody-here", NewPassword: "throwaway-x-10",
	})
	assert.ErrorIs(t, err, ownerreset.ErrNotFound)
	assert.Contains(t, err.Error(), "-list")

	admins, err := ownerreset.ListAdmins(context.Background(), d)
	require.NoError(t, err)
	require.Len(t, admins, 1)
	assert.Equal(t, owner.ID, admins[0].ID)
	assert.Equal(t, "founder", admins[0].Username)

	// -id is the other way in, for an operator who has the account file but not
	// the username.
	_, err = ownerreset.Reset(context.Background(), d, ownerreset.Request{
		AccountID: owner.ID, NewPassword: "throwaway-by-id-11",
	})
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, login(ts, "founder", "throwaway-by-id-11").Status)
}

// ownerreset-resets-password: an unusable password is refused BEFORE anything
// is written, using the platform's single password policy rather than a second
// copy of it.
func TestAnInvalidPasswordChangesNothing(t *testing.T) {
	testkit.Cover(t, "ownerreset-resets-password")
	ts, d := harness(t)
	owner := ts.Register("founder")
	before := storedAccount(t, d, owner.ID)

	for _, bad := range []string{"", "short", strings.Repeat("a", 129), "has\x00a-control-char"} {
		_, err := ownerreset.Reset(context.Background(), d, ownerreset.Request{
			Username: "founder", NewPassword: bad,
		})
		require.Error(t, err, "password %q must be refused", bad)
	}
	assert.Equal(t, before.PasswordHash, storedAccount(t, d, owner.ID).PasswordHash)
	assert.Equal(t, http.StatusOK, login(ts, "founder", registerPassword("founder")).Status,
		"a refused reset must leave the owner able to sign in as before")
}

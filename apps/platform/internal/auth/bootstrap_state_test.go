// bootstrap_state_test.go covers the T0 (#180) fix that makes a fresh gated
// deploy self-serviceable through the browser: the public GET
// /auth/bootstrap-state probe the register UI reads to switch into first-owner
// mode, and the end-to-end flow that probe enables — read the host token,
// register with it as bootstrapToken (NO invite), then family registers with a
// minted code. The bug it guards against: the client could not put bootstrapToken
// on the wire, so the browser owner was structurally unable to bootstrap.
package auth_test

import (
	"bytes"
	"context"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// bootstrapState GETs the public first-owner probe.
func bootstrapState(t *testing.T, ts *testutil.TS) testutil.Resp {
	t.Helper()
	return ts.Do(http.MethodGet, "/api/v1/auth/bootstrap-state", "", nil)
}

// auth-bootstrap-state-probe: the probe reveals ONLY needsOwner + requireToken,
// is true only while the deploy is ownerless, and flips closed the instant an
// admin exists — enough for the UI to choose its mode, nothing more.
func TestBootstrapStateProbe(t *testing.T) {
	testkit.Cover(t, "auth-bootstrap-state-probe")
	t.Setenv("GGD_OWNER_BOOTSTRAP_TOKEN", "1")
	ts := testutil.NewInviteGated(t, true)
	require.NoError(t, ts.Srv.Boot(context.Background()))

	st := bootstrapState(t, ts)
	require.Equal(t, http.StatusOK, st.Status, string(st.Raw))
	assert.Equal(t, true, st.Body["needsOwner"], "a fresh deploy needs its first owner")
	assert.Equal(t, true, st.Body["requireToken"], "GGD_OWNER_BOOTSTRAP_TOKEN=1 → the claim needs the token")
	// It leaks nothing else: no token, no account existence.
	_, hasTok := st.Body["ownerToken"]
	assert.False(t, hasTok, "the probe must never carry the token")

	// Claim ownership, then the probe must flip closed.
	raw, err := os.ReadFile(filepath.Join(ts.Cfg.DataDir, "owner-setup-token"))
	require.NoError(t, err)
	token := string(bytes.TrimSpace(raw))
	owner := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]any{
		"username": "founder", "email": "founder@fam.test",
		"password": "correct-horse-founder", "bootstrapToken": token,
	})
	require.Equal(t, http.StatusCreated, owner.Status, string(owner.Raw))

	st2 := bootstrapState(t, ts)
	require.Equal(t, http.StatusOK, st2.Status)
	assert.Equal(t, false, st2.Body["needsOwner"], "the window shuts the instant the owner lands")
}

// auth-first-owner-browser-flow: the WHOLE point — a fresh gated deploy is
// self-serviceable through exactly the bytes the client now sends. Owner reads
// the host token and registers with it as bootstrapToken (no invite); a wrong or
// absent token cannot claim and now needs a code; family registers with a minted
// code and gets an ordinary player account.
func TestFirstOwnerBrowserFlow(t *testing.T) {
	testkit.Cover(t, "auth-first-owner-browser-flow")
	t.Setenv("GGD_OWNER_BOOTSTRAP_TOKEN", "1")
	ts := testutil.NewInviteGated(t, true)
	require.NoError(t, ts.Srv.Boot(context.Background()))

	// The UI reads the probe: this deploy needs its owner, with a token.
	require.Equal(t, true, bootstrapState(t, ts).Body["needsOwner"])

	// The owner reads the one-time token off their own host.
	raw, err := os.ReadFile(filepath.Join(ts.Cfg.DataDir, "owner-setup-token"))
	require.NoError(t, err)
	token := string(bytes.TrimSpace(raw))
	require.NotEmpty(t, token)

	// A wrong/absent token cannot claim — and, on a gated deploy, is refused for
	// lack of a code (the owner path is NOT a second door for a stranger).
	wrong := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]any{
		"username": "impostor", "email": "impostor@x.test",
		"password": "correct-horse-impostor", "bootstrapToken": "deadbeef",
	})
	assert.Equal(t, http.StatusForbidden, wrong.Status, string(wrong.Raw))
	assert.Equal(t, "invite_required", wrong.ErrCode())

	// The owner registers with the token as bootstrapToken and NO invite —
	// exactly the body api.ts now builds in first-owner mode.
	owner := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]any{
		"username": "founder", "email": "founder@fam.test",
		"password": "correct-horse-founder", "bootstrapToken": token,
	})
	require.Equal(t, http.StatusCreated, owner.Status, string(owner.Raw))
	acct := owner.Body["account"].(map[string]any)
	assert.Equal(t, []any{"admin"}, acct["roles"], "the first-owner claim grants admin")
	assert.Equal(t, "approved", acct["status"])
	ownerAccess := owner.Body["tokens"].(map[string]any)["accessToken"].(string)
	require.NotEmpty(t, ownerAccess)

	// Family path unchanged: still needs a REAL minted code.
	noCode := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]any{
		"username": "sister", "email": "sister@fam.test", "password": "correct-horse-sister",
	})
	assert.Equal(t, http.StatusForbidden, noCode.Status)
	assert.Equal(t, "invite_required", noCode.ErrCode())

	codes := mintCodes(t, ts, ownerAccess, "妹妹", 1)
	fam := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]any{
		"username": "sister", "email": "sister@fam.test",
		"password": "correct-horse-sister", "inviteCode": codes[0],
	})
	require.Equal(t, http.StatusCreated, fam.Status, string(fam.Raw))
	assert.Nil(t, fam.Body["account"].(map[string]any)["roles"], "family member is an ordinary player")
}

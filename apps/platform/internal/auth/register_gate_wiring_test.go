package auth_test

// GH#236 — the PAIR nothing was checking: "a networked config" and "a gated
// register endpoint".
//
// register_oracle_residual_test.go establishes that the #174 invite gate is the
// ONLY thing standing between /auth/register and an open enumeration oracle
// (four probes, 409/201/409/201 to an anonymous caller when the gate is off).
// docs/_security-audit.md F-18 accepts the residual on exactly that basis.
//
// But every test that exercised the gate — including that file's own — boots it
// through server.Options{RequireInvite: true}, the TEST-ONLY override. The
// shipped binary never sets it: cmd/platform/main.go calls
//
//	server.New(cfg, server.Options{})
//
// so on ggd.adms.ai the gate is installed by the OTHER half of
//
//	if opts.RequireInvite || cfg.RequireInvite { authSvc.SetInviteGate(inviteSvc) }
//
// and `cfg.RequireInvite` was true in NO test that ever built a router.
//
// MEASURED 2026-08-04, before this file existed: delete `|| cfg.RequireInvite`
// from internal/server/server.go and `go test ./...` across the whole platform
// module stays green (the one failure, opsenv's
// TestWalletPlayRateAgreesWithTheDerivedLength, is red on clean HEAD too and is
// unrelated). That one-token deletion turns the family deploy into open signup
// with the enumeration oracle wide open, and nothing says a word.
//
// That is failure form ⑤ — 被測的不是出貨的那個 — and it is the same shape as
// the deploy postconditions lesson in CLAUDE.md: config.Load resolving
// RequireInvite=true is one NOUN (guarded by config/golive_test.go), the auth
// service refusing un-invited callers uniformly is another NOUN (guarded by
// register_oracle_residual_test.go), and the RELATIONSHIP between them — "the
// resolved value reaches the shipped router" — was guarded by neither. A
// relationship cannot be established by checking each half.
//
// So this test walks the whole path in one piece: a bare networked environment
// → the REAL config.Load() → server.New with the PRODUCTION Options{} → the
// four enumeration probes against the built router.

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// strongDeploySecret clears config.checkDeploySecrets (#176): long enough and
// varied enough not to look like a dev value. Its content is irrelevant here —
// it exists so config.Load() gets far enough to resolve the gate.
const strongDeploySecret = "9f3c1a7e0b45d28c6e91f0a3b7d54c8e2f60a91d3c7b58e04f2a6d1c9b30e785"

// networkedDeployConfig runs the REAL config.Load() against the environment a
// networked host actually has: a wildcard listen address, real secrets, and
// NOTHING said about registration. Every GGD_* registration variable is cleared
// first, so the value that comes back is the DEFAULT — the thing an operator
// gets by saying nothing, which is what ggd.adms.ai does.
func networkedDeployConfig(t *testing.T) config.Config {
	t.Helper()
	for _, k := range []string{
		"GGD_REQUIRE_INVITE", "GGD_REQUIRE_APPROVAL", "GGD_BURN_INVITE_ON_CONFLICT",
		"GGD_DEPLOY_TIER", "REDIS_ADDR", "CONTENT_DIR",
	} {
		t.Setenv(k, "")
	}
	t.Setenv("PLATFORM_ADDR", ":8080") // the built-in default: reachable from the network
	t.Setenv("JWT_SIGNING_SECRET", strongDeploySecret)
	t.Setenv("PLATFORM_GAME_SHARED_SECRET", strongDeploySecret+"a")
	t.Setenv("REDIS_PASSWORD", strongDeploySecret+"b")
	t.Setenv("DATA_DIR", t.TempDir())

	cfg, err := config.Load()
	require.NoError(t, err, "a fully-secreted networked deploy must boot")
	return cfg
}

// TestTheResolvedConfigAloneGatesTheShippedRegisterEndpoint is the guard for
// the relationship.
//
// It deliberately boots through testutil.NewFreshDeploy, which passes
// server.Options{RequireInvite: false} — the PRODUCTION composition shape. The
// gate therefore has exactly one way to be installed: cfg.RequireInvite, the
// value config.Load just resolved. If the wiring that reads it is removed,
// weakened, or reordered, the census below stops being uniform and this test
// names it.
//
// The assertion is on the four probes, not on a boolean, because "the gate is
// on" is a property and "a stranger cannot tell a registered identity from a
// free one" is the behaviour (failure form ⑦). Byte equality, not just "all
// 4xx": a 403 that differed in body between a taken and a free identity would
// be the same oracle wearing a different status code.
func TestTheResolvedConfigAloneGatesTheShippedRegisterEndpoint(t *testing.T) {
	testkit.Cover(t, "auth-register-config-alone-installs-the-invite-gate")

	cfg := networkedDeployConfig(t)
	require.True(t, cfg.RequireInvite,
		"a networked deploy that declares nothing must resolve the invite gate ON — "+
			"if this changed deliberately, docs/_security-audit.md F-18 and "+
			"register_oracle_residual_test.go describe a posture that no longer exists")

	// PRODUCTION SHAPE: the ONLY thing carried in is the resolved config value.
	// server.Options stays empty of RequireInvite, exactly as cmd/platform does.
	ts := testutil.NewFreshDeploy(t, func(c *config.Config) {
		c.RequireInvite = cfg.RequireInvite
	})

	// Seed the deploy the way a real one starts: the first account is the
	// invite-exempt owner, who mints the code the victim registers with. After
	// this, an admin exists, so every further registration needs a code — the
	// established-deploy posture the family host is in.
	owner := ts.Register("owner")
	seed := mintCodes(t, ts, owner.Access, "seed", 1)[0]
	ts.RegisterWithCode("victim", seed) // victim / victim@example.com now exists

	// The attack, from a stranger with no code.
	got := census(t, ts, "", 1)
	first := got[0]
	for i, r := range got {
		assert.Equal(t, http.StatusForbidden, r.Status,
			"probe %d (%s) reached the uniqueness check — the invite gate is not installed from cfg.RequireInvite, "+
				"so a stranger reads 201-vs-409 on the shipped deploy: %s",
			i, fourProbes(1)[i].label, string(r.Raw))
		assert.Equal(t, string(first.Raw), string(r.Raw),
			"probe %d (%s) is distinguishable from probe 0 — that difference IS the oracle",
			i, fourProbes(1)[i].label)
	}
	assert.NotContains(t, string(first.Raw), "victim",
		"the refusal echoed the value under test")
}

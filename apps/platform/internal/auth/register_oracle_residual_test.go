package auth_test

// GH#179, the half register_enumeration_test.go could not see.
//
// THE ATTACK, in four requests. Every probe pairs the value under test with a
// counterpart the caller KNOWS is fresh, so the status code alone is the answer
// and nothing in the response body has to leak:
//
//	{username:"victim",  email:"<fresh>"}  409 -> "victim" is registered
//	{username:"<fresh>", email:"<fresh>"}  201 -> that name is free
//	{username:"<fresh>", email:"victim@…"} 409 -> that address is registered
//	{username:"<fresh>", email:"<fresh>@…"} 201 -> that address is free
//
// Collapsing the two 409s into one message does not touch this, because the
// caller chose which field was fresh. Equalising 409/201 latency does not touch
// it either, because a status code is not a stopwatch reading. Both of those
// changes are real and are kept — they are simply not what closes this.
//
// WHAT CLOSES IT is the #174 invite gate running BEFORE the uniqueness
// reservation, and it closes it only for callers WITHOUT a live code. The three
// tests below are, in order: the boundary that holds, the residual that does
// not, and the knob that prices the residual.
//
// Nothing here is a source-code scan or a property assertion. Every test posts
// the four real requests through the fully-wired router and reads what comes
// back, because "the four answers are indistinguishable" is the whole claim.

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// enumProbe is one line of the attack: the value under test, paired with a
// guaranteed-fresh counterpart.
type enumProbe struct {
	label, username, email string
}

// fourProbes builds the census for a victim registered as
// victim / victim@example.com. gen keeps the fresh counterparts unique across
// repeated censuses inside one test.
func fourProbes(gen int) []enumProbe {
	return []enumProbe{
		{"USERNAME victim (registered)", "victim", fmt.Sprintf("fresh%da@example.com", gen)},
		{"USERNAME nobody (free)", fmt.Sprintf("nobody%db", gen), fmt.Sprintf("fresh%db@example.com", gen)},
		{"EMAIL victim@example.com (registered)", fmt.Sprintf("fresh%dc", gen), "victim@example.com"},
		{"EMAIL nobody@example.com (free)", fmt.Sprintf("fresh%dd", gen), fmt.Sprintf("nobody%dd@example.com", gen)},
	}
}

// census posts the four probes and returns their responses in order.
func census(t *testing.T, ts *testutil.TS, code string, gen int) []testutil.Resp {
	t.Helper()
	out := make([]testutil.Resp, 0, 4)
	for _, p := range fourProbes(gen) {
		body := map[string]string{"username": p.username, "email": p.email, "password": "hunter2hunter2"}
		if code != "" {
			body["inviteCode"] = code
		}
		r := ts.Do(http.MethodPost, registerPath, "", body)
		t.Logf("%-40s -> HTTP %d", p.label, r.Status)
		out = append(out, r)
	}
	return out
}

// TestInviteGateIsTheEnumerationBoundary is the guard that actually holds the
// line on a gated deploy: an un-invited caller must not be able to tell a
// registered identity from a free one, and the four answers must be identical
// down to the BYTE — not merely "both are 4xx".
//
// It runs the census twice, once with no code at all and once with a
// syntactically valid but unknown code, because those take different branches
// (invite_required vs invite_invalid) and only the second one proves the gate
// still refuses uniformly once a caller has started guessing codes.
//
// MUTATION that must make it red: move the `if s.invites != nil && !owner`
// Redeem block in Service.Register BELOW the two SETNX reservations. Then a
// taken identity answers 409 while a free one answers 403, and the census stops
// being uniform. Verified 2026-07-30.
func TestInviteGateIsTheEnumerationBoundary(t *testing.T) {
	testkit.Cover(t, "auth-register-invite-gate-blocks-enumeration")
	ts := testutil.NewInviteGated(t, true)
	owner := ts.Register("owner") // first account: invite-exempt, claims ownership
	seed := mintCodes(t, ts, owner.Access, "seed", 1)[0]
	ts.RegisterWithCode("victim", seed) // victim / victim@example.com now exists

	for _, tc := range []struct {
		name, code string
		gen        int
	}{
		{"no code at all", "", 1},
		{"a well-formed but unknown code", "GGD-2222-3333", 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := census(t, ts, tc.code, tc.gen)
			first := got[0]
			for i, r := range got {
				assert.Equal(t, http.StatusForbidden, r.Status,
					"probe %d (%s) escaped the invite gate: %s", i, fourProbes(tc.gen)[i].label, string(r.Raw))
				assert.Equal(t, string(first.Raw), string(r.Raw),
					"probe %d (%s) is distinguishable from probe 0 — that difference IS the oracle",
					i, fourProbes(tc.gen)[i].label)
			}
			assert.NotContains(t, string(first.Raw), "victim",
				"the refusal echoed the value under test")
		})
	}
}

// TestOneLiveInviteCodeBuysUnboundedEnumeration is a WITNESS, not an
// aspiration. It records the channel that is STILL OPEN on the shipped default
// configuration, so that:
//
//   - the claim cannot rot into "#179 is closed" again (this file, the
//     ErrRegistrationConflict header and docs/_security-audit.md F-18 all say
//     the same thing, and this test is the one that would notice a change);
//   - if somebody DOES close it, this test goes red and forces those three
//     places to be updated together.
//
// The measurement: a caller holding one live code posts six CONFLICTING
// registrations. Each 409 rolls the burn back, so the code is still 未使用 at
// the end and still spends normally on a real registration. Six is arbitrary —
// nothing in the code bounds it.
func TestOneLiveInviteCodeBuysUnboundedEnumeration(t *testing.T) {
	testkit.Cover(t, "auth-register-code-holder-oracle-open")
	ts := testutil.NewInviteGated(t, true)
	owner := ts.Register("owner")
	codes := mintCodes(t, ts, owner.Access, "seed", 2)
	ts.RegisterWithCode("victim", codes[0])
	attacker := codes[1]

	const probes = 6
	for i := range probes {
		r := ts.Do(http.MethodPost, registerPath, "", map[string]string{
			"username": "victim", // the value under test
			"email":    fmt.Sprintf("throwaway%d@example.com", i),
			"password": "hunter2hunter2", "inviteCode": attacker,
		})
		require.Equal(t, http.StatusConflict, r.Status,
			"probe %d: expected the oracle to still answer 409; body %s", i, string(r.Raw))
	}
	assert.Equal(t, "active", codeRow(t, ts, owner.Access, attacker)["effectiveStatus"],
		"%d conflicting probes cost the caller nothing — this is the residual #179 channel", probes)

	// And the code is still good afterwards, so the probing left no trace an
	// operator would notice in the 邀請碼 console.
	free := ts.Do(http.MethodPost, registerPath, "", map[string]string{
		"username": "brandnew", "email": "brandnew@example.com",
		"password": "hunter2hunter2", "inviteCode": attacker,
	})
	assert.Equal(t, http.StatusCreated, free.Status, "body: %s", string(free.Raw))
}

// TestBurnInviteOnConflictPricesEachProbe pins the knob (cfg.BurnInviteOnConflict
// / GGD_BURN_INVITE_ON_CONFLICT), which is the owner's lever on the residual
// above. It does NOT hide the 201-vs-409 answer — nothing synchronous can,
// without a mail channel this platform does not have. What it does is make each
// answer cost one invite code, so the oracle is bounded by how many codes the
// operator handed out instead of being free.
//
// The two halves matter equally: a conflicting probe must spend the code, and a
// SUCCESSFUL registration must spend it too (it always did). One code, one bit,
// either way.
//
// MUTATION that must make it red: drop `|| s.burnInviteOnConflict` from the
// deferred release condition in Service.Register, i.e. ignore the flag.
// Verified 2026-07-30.
func TestBurnInviteOnConflictPricesEachProbe(t *testing.T) {
	testkit.Cover(t, "auth-register-burn-invite-on-conflict")
	ts := testutil.NewInviteGated(t, true, func(c *config.Config) {
		c.BurnInviteOnConflict = true
	})
	owner := ts.Register("owner")
	codes := mintCodes(t, ts, owner.Access, "seed", 2)
	ts.RegisterWithCode("victim", codes[0])
	attacker := codes[1]

	probe := func(username, email string) testutil.Resp {
		return ts.Do(http.MethodPost, registerPath, "", map[string]string{
			"username": username, "email": email,
			"password": "hunter2hunter2", "inviteCode": attacker,
		})
	}

	// Probe 1 still gets its answer — the knob prices the oracle, it does not
	// silence it, and pretending otherwise would be the same lie #179 told.
	first := probe("victim", "throwaway0@example.com")
	require.Equal(t, http.StatusConflict, first.Status, "body: %s", string(first.Raw))

	assert.Equal(t, "redeemed", codeRow(t, ts, owner.Access, attacker)["effectiveStatus"],
		"the conflicting probe handed the code back — the knob is not wired")

	// Probe 2 with the same code can no longer reach the uniqueness check at
	// all, so it is indistinguishable from a probe on a free identity: both are
	// invite_used. That is the bound.
	againTaken := probe("victim", "throwaway1@example.com")
	againFree := probe("nobody-at-all", "nobody-at-all@example.com")
	assert.Equal(t, http.StatusForbidden, againTaken.Status, "body: %s", string(againTaken.Raw))
	assert.Equal(t, string(againTaken.Raw), string(againFree.Raw),
		"once the code is spent a taken identity and a free one must answer identically")

	// A spent code buys nothing further, so N codes buy at most N answers.
	fresh := mintCodes(t, ts, owner.Access, "second", 1)[0]
	attacker = fresh
	created := probe("brandnew", "brandnew@example.com")
	require.Equal(t, http.StatusCreated, created.Status, "body: %s", string(created.Raw))
	assert.Equal(t, "redeemed", codeRow(t, ts, owner.Access, fresh)["effectiveStatus"],
		"a successful registration must spend its code too")
}

// TestRegisterOracleIsOpenWithoutTheInviteGate is the third witness: on an
// UNGATED deploy (loopback dev, or GGD_REQUIRE_INVITE=0) the four probes answer
// 409/201/409/201 to an anonymous caller. This is the debunker's original
// reproduction, kept as a test so the honest statement in F-18 — "register is
// not enumeration-safe; the invite gate is what protects a networked deploy" —
// has something that fails if it ever stops being true.
//
// config.resolveRequireInvite defaults the gate ON for every non-loopback bind,
// so the posture this test describes is the DEV one. It is recorded because the
// dev posture is what every other test in this package runs under, which is
// exactly how the four #179 guards ended up green against a live oracle.
func TestRegisterOracleIsOpenWithoutTheInviteGate(t *testing.T) {
	testkit.Cover(t, "auth-register-oracle-open-ungated")
	ts := testutil.New(t)
	ts.Register("victim")

	got := census(t, ts, "", 1)
	statuses := []int{got[0].Status, got[1].Status, got[2].Status, got[3].Status}
	assert.Equal(t, []int{
		http.StatusConflict, http.StatusCreated,
		http.StatusConflict, http.StatusCreated,
	}, statuses,
		"the ungated census changed shape — if register is now enumeration-safe, update "+
			"docs/_security-audit.md F-18, the ErrRegistrationConflict header and this file together")
}

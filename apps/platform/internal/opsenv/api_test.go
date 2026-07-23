package opsenv_test

import (
	"context"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/opsenv"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// grantAdmin promotes an account to the admin role on the JSON truth. AdminOnly
// reloads the account per request, so the existing token gains admin rights.
func grantAdmin(t *testing.T, ts *testutil.TS, id string) {
	t.Helper()
	_, err := ts.Srv.Accounts.Update(context.Background(), id, func(a *account.Account) error {
		if !a.HasRole(admin.RoleAdmin) {
			a.Roles = append(a.Roles, admin.RoleAdmin)
		}
		return nil
	})
	require.NoError(t, err)
}

// adminValues digs the values table out of the admin response envelope
// {doc, stored, defaults, descriptors, info}.
func adminValues(t *testing.T, r testutil.Resp) map[string]any {
	t.Helper()
	doc, ok := r.Body["doc"].(map[string]any)
	require.True(t, ok, "doc missing: %s", string(r.Raw))
	v, ok := doc["values"].(map[string]any)
	require.True(t, ok, "values missing: %s", string(r.Raw))
	return v
}

// publicValues digs the values table out of the bare public document.
func publicValues(t *testing.T, r testutil.Resp) map[string]any {
	t.Helper()
	v, ok := r.Body["values"].(map[string]any)
	require.True(t, ok, "values missing: %s", string(r.Raw))
	return v
}

// errMsg digs the human-readable message out of the error envelope. Every
// rejection in this package must NAME the offending key and the bound it
// violated — a bare 400 makes an operator guess.
func errMsg(r testutil.Resp) string {
	if e, ok := r.Body["error"].(map[string]any); ok {
		if m, ok := e["message"].(string); ok {
			return m
		}
	}
	return string(r.Raw)
}

func put(ts *testutil.TS, token string, v map[string]any) testutil.Resp {
	return ts.Do(http.MethodPut, "/api/v1/admin/server-ops", token, map[string]any{"values": v})
}

// formatFloat renders a bound the way the platform's error messages do, so an
// assertion cannot pass or fail on formatting.
func formatFloat(v float64) string { return strconv.FormatFloat(v, 'g', -1, 64) }

// opsenv-api-admin: the ops table is admin-gated for writes and admin reads.
// No token → 401, a normal user → 403, an admin → 200 with the compiled
// defaults (the owner's 50-match ceiling and the shipped snapshot rate) plus
// the descriptor + read-only inventory the console renders from.
func TestAPIAdminAuthAndDefaults(t *testing.T) {
	testkit.Cover(t, "opsenv-api-admin")
	ts := testutil.New(t)
	normal := ts.Register("normal")
	boss := ts.Register("boss")

	r := ts.Do(http.MethodGet, "/api/v1/admin/server-ops", "", nil)
	assert.Equal(t, http.StatusUnauthorized, r.Status)
	r = ts.Do(http.MethodGet, "/api/v1/admin/server-ops", normal.Access, nil)
	assert.Equal(t, http.StatusForbidden, r.Status)
	assert.Equal(t, "admin_required", r.ErrCode())

	r = put(ts, "", map[string]any{"maxRooms": 40})
	assert.Equal(t, http.StatusUnauthorized, r.Status)
	r = put(ts, normal.Access, map[string]any{"maxRooms": 40})
	assert.Equal(t, http.StatusForbidden, r.Status)

	grantAdmin(t, ts, boss.ID)
	r = ts.Do(http.MethodGet, "/api/v1/admin/server-ops", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "admin GET: %s", string(r.Raw))

	v := adminValues(t, r)
	assert.Len(t, v, len(opsenv.Keys), "the admin read is always the full table")
	assert.Equal(t, float64(opsenv.DefaultMaxRooms), v["maxRooms"], "the shipped ceiling is 50")
	assert.Equal(t, float64(opsenv.DefaultSnapshotHz), v["snapshotHz"])

	// Fresh install: nothing has ever been saved. The console must be able to
	// SAY that rather than implying an operator chose these numbers.
	assert.Equal(t, false, r.Body["stored"])

	// The console renders bounds, safety badges and 何時生效 copy off these, so
	// the platform is the single home for them.
	descs, ok := r.Body["descriptors"].([]any)
	require.True(t, ok, "descriptors missing: %s", string(r.Raw))
	assert.Len(t, descs, len(opsenv.Keys))
	info, ok := r.Body["info"].([]any)
	require.True(t, ok, "info missing: %s", string(r.Raw))
	assert.NotEmpty(t, info, "the read-only inventory is most of what makes ops numbers visible")
	assert.Equal(t, float64(opsenv.ClientInterpDelayMs), r.Body["clientInterpDelayMs"])
}

// opsenv-api-bounds: strict PUT validation. Every rejection is a 400 that NAMES
// the offending key and the bound it violated, and nothing persists.
//
// maxRooms 0 gets its own assertion because it is not merely "a small number":
// a ceiling of zero makes every match creation throw, i.e. a total outage for
// the whole deploy, so it must be impossible to save rather than possible to
// regret.
func TestAPIPutBounds(t *testing.T) {
	testkit.Cover(t, "opsenv-api-bounds")
	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	// Unknown key → 400 naming it. This is also how every never-expose knob
	// (devCheats, tickHz, the phase durations…) is refused: they are simply not
	// in the writable set.
	r := put(ts, boss.Access, map[string]any{"devCheats": 1})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	assert.Equal(t, "bad_request", r.ErrCode())
	assert.Contains(t, strings.ToLower(errMsg(r)), "devcheats")

	r = put(ts, boss.Access, map[string]any{"tickHz": 60})
	assert.Equal(t, http.StatusBadRequest, r.Status, "tickHz is read-only: it must not be writable")

	// Zero rooms = total outage.
	r = put(ts, boss.Access, map[string]any{"maxRooms": 0})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	assert.Contains(t, errMsg(r), "maxRooms")
	assert.Contains(t, errMsg(r), "1", "the message must name the bound")

	// Above the ceiling → the guard would be functionally deleted.
	r = put(ts, boss.Access, map[string]any{"maxRooms": 99999})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	assert.Contains(t, errMsg(r), "500")

	// A fractional room count is not a room count.
	r = put(ts, boss.Access, map[string]any{"maxRooms": 12.5})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	assert.Contains(t, errMsg(r), "whole number")

	// The exact bounds are legal.
	r = put(ts, boss.Access, map[string]any{"maxRooms": opsenv.MinMaxRooms})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	r = put(ts, boss.Access, map[string]any{"maxRooms": opsenv.MaxMaxRooms})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))

	// One bad key in an otherwise-valid body rejects the WHOLE write…
	r = put(ts, boss.Access, map[string]any{"maxRooms": 80, "bogus": 1})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	// …and the previously saved table is untouched.
	r = ts.Do(http.MethodGet, "/api/v1/admin/server-ops", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	assert.Equal(t, float64(opsenv.MaxMaxRooms), adminValues(t, r)["maxRooms"])
}

// opsenv-api-coupled: the snapshot/interpolation pairing is enforced as a
// REJECTION, not a warning.
//
// The interpolation buffer freezes rather than extrapolates, so a client needs
// two snapshot intervals of cushion; every shipped client is compiled with
// ClientInterpDelayMs of delay. Lowering the server's snapshot rate alone
// therefore pushes the whole fleet under its own buffer and the game stutters,
// with no number on any screen explaining it. 20 Hz would need 100 ms of
// client-side delay and the fleet has 66, so the platform refuses it and says
// so — half of a load-bearing pair must never be settable alone.
func TestAPIPutCoupledSnapshotRule(t *testing.T) {
	testkit.Cover(t, "opsenv-api-coupled")
	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	// In range [15, 30] but incompatible with the fleet's interpolation delay.
	r := put(ts, boss.Access, map[string]any{"snapshotHz": 20})
	require.Equal(t, http.StatusBadRequest, r.Status, "20 Hz needs 100 ms of client cushion: %s", string(r.Raw))
	msg := errMsg(r)
	assert.Contains(t, msg, "snapshotHz")
	assert.Contains(t, msg, "interpolation")
	assert.Contains(t, msg, "100", "the message must name the delay the rate would require")
	assert.Contains(t, msg, "66", "…and the delay the fleet actually has")

	// Below even the raw transport floor → the ordinary range rejection, naming
	// the bound the platform ACTUALLY enforces (the effective floor, which the
	// descriptor also advertises) rather than the transport one, so the number in
	// the message is the number the console shows.
	r = put(ts, boss.Access, map[string]any{"snapshotHz": 10})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	assert.Contains(t, errMsg(r), formatFloat(opsenv.EffectiveMinSnapshotHz()))
	r = put(ts, boss.Access, map[string]any{"snapshotHz": 60})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	assert.Contains(t, errMsg(r), "30")

	// The compatible rate saves.
	r = put(ts, boss.Access, map[string]any{"snapshotHz": 30})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	assert.Equal(t, 30.0, adminValues(t, r)["snapshotHz"])

	// Nothing incompatible ever reached the durable file.
	r = ts.Do(http.MethodGet, "/api/v1/server-ops", "", nil)
	require.Equal(t, http.StatusOK, r.Status)
	assert.Equal(t, 30.0, publicValues(t, r)["snapshotHz"])
}

// opsenv-api-roundtrip: a sparse PUT persists — present keys keep their value,
// omitted keys reset to the COMPILED DEFAULT, version/updatedAt are
// server-owned, and the saved table survives a fresh GET (jsonstore round-trip).
func TestAPIPutRoundTrip(t *testing.T) {
	testkit.Cover(t, "opsenv-api-roundtrip")
	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	// The owner's actual ask: 200 → 50 is the shipped default, and an operator
	// can now take it lower without a deploy.
	r := put(ts, boss.Access, map[string]any{"maxRooms": 24})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	v := adminValues(t, r)
	assert.Equal(t, 24.0, v["maxRooms"])
	assert.Equal(t, float64(opsenv.DefaultSnapshotHz), v["snapshotHz"], "omitted key = compiled default")
	assert.Len(t, v, len(opsenv.Keys), "the response is always the full table")

	doc := r.Body["doc"].(map[string]any)
	assert.NotEmpty(t, doc["updatedAt"])
	assert.Equal(t, float64(opsenv.SchemaVersion), doc["version"])
	assert.Equal(t, true, r.Body["stored"])

	// Fresh GET returns the persisted truth.
	r = ts.Do(http.MethodGet, "/api/v1/admin/server-ops", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	assert.Equal(t, 24.0, adminValues(t, r)["maxRooms"])
	assert.Equal(t, true, r.Body["stored"])

	// A later PUT that omits maxRooms resets it to the compiled default — the
	// body is the complete desired state (combat-env / curation semantics).
	r = put(ts, boss.Access, map[string]any{"snapshotHz": 30})
	require.Equal(t, http.StatusOK, r.Status)
	assert.Equal(t, float64(opsenv.DefaultMaxRooms), adminValues(t, r)["maxRooms"])

	// An empty body is a legal "reset everything to the shipped defaults".
	r = ts.Do(http.MethodPut, "/api/v1/admin/server-ops", boss.Access, map[string]any{})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	v = adminValues(t, r)
	assert.Equal(t, float64(opsenv.DefaultMaxRooms), v["maxRooms"])
	assert.Equal(t, float64(opsenv.DefaultSnapshotHz), v["snapshotHz"])
}

// opsenv-api-public: the game-server reads GET /api/v1/server-ops WITHOUT a
// token (whitelist / combat-env precedent). It is cacheable and reflects the
// admin's last save.
func TestAPIPublicRead(t *testing.T) {
	testkit.Cover(t, "opsenv-api-public")
	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	req, err := http.NewRequest(http.MethodGet, ts.HTTP.URL+"/api/v1/server-ops", nil)
	require.NoError(t, err)
	resp, err := ts.HTTP.Client().Do(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Cache-Control"), "max-age=10")
	resp.Body.Close()

	require.Equal(t, http.StatusOK, put(ts, boss.Access, map[string]any{"maxRooms": 12}).Status)

	r := ts.Do(http.MethodGet, "/api/v1/server-ops", "", nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	v := publicValues(t, r)
	assert.Equal(t, 12.0, v["maxRooms"])
	assert.Equal(t, float64(opsenv.DefaultSnapshotHz), v["snapshotHz"])
}

// opsenv-api-unconfigured: an UNCONFIGURED platform must serve an EMPTY values
// map on the public read, not the defaults-filled table.
//
// Why this is not cosmetic: the game-server merges this body OVER its COMPILED
// defaults, per key (apps/game-server/src/config/serverOps.ts). A
// defaults-filled body therefore carries explicit numbers that beat whatever
// the deploy configured for itself — a shard started with GGD_MAX_ROOMS=200
// would silently drop to 50, and one started with GGD_SNAPSHOT_HZ would lose
// it, the moment it could reach a platform nobody had ever configured. This is
// the same failure that reset every content-authored combat multiplier, and it
// is invisible: nothing is lost on disk, the values just stop applying.
//
// The ADMIN read keeps the full table — the console needs every key present to
// render the editor — and once an operator saves, the full table ships on the
// public read too, because at that point every value is a deliberate choice.
func TestAPIPublicReadUnconfigured(t *testing.T) {
	testkit.Cover(t, "opsenv-api-unconfigured")
	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	r := ts.Do(http.MethodGet, "/api/v1/server-ops", "", nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	assert.Empty(t, publicValues(t, r),
		"an unconfigured platform must not override a deploy's own env configuration")

	// The admin read still gets the full editable table, flagged as unsaved.
	r = ts.Do(http.MethodGet, "/api/v1/admin/server-ops", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	assert.Len(t, adminValues(t, r), len(opsenv.Keys))
	assert.Equal(t, false, r.Body["stored"])

	// After a save the public read carries the operator's full, deliberate table.
	require.Equal(t, http.StatusOK, put(ts, boss.Access, map[string]any{"maxRooms": 50}).Status)

	r = ts.Do(http.MethodGet, "/api/v1/server-ops", "", nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	assert.Len(t, publicValues(t, r), len(opsenv.Keys),
		"once configured, even a value equal to the default is a deliberate choice and ships")
}

// opsenv-validate-unit: Validate answers "would this save be accepted?" without
// a write, and is the single implementation both the handler and any future
// caller share.
func TestValidate(t *testing.T) {
	testkit.Cover(t, "opsenv-validate-unit")

	assert.NoError(t, opsenv.Validate(opsenv.KeyMaxRooms, 50))
	assert.NoError(t, opsenv.Validate(opsenv.KeySnapshotHz, opsenv.DefaultSnapshotHz))

	assert.Error(t, opsenv.Validate("nope", 1))
	assert.Error(t, opsenv.Validate(opsenv.KeyMaxRooms, 0))
	assert.Error(t, opsenv.Validate(opsenv.KeyMaxRooms, opsenv.MaxMaxRooms+1))
	assert.Error(t, opsenv.Validate(opsenv.KeyMaxRooms, 3.5))
	assert.Error(t, opsenv.Validate(opsenv.KeySnapshotHz, 20))

	// EffectiveMinSnapshotHz is the lowest rate the fleet's compiled
	// interpolation delay can absorb — and, crucially, the SAME number the
	// descriptor advertises as Min (see TestAdvertisedRangeIsTheAcceptedRange).
	assert.NoError(t, opsenv.Validate(opsenv.KeySnapshotHz, opsenv.EffectiveMinSnapshotHz()))
	assert.Error(t, opsenv.Validate(opsenv.KeySnapshotHz, opsenv.EffectiveMinSnapshotHz()-1))
}

// opsenv-advertised-range-is-accepted-range: every value the console is told is
// legal must actually be accepted, and every value outside it rejected.
//
// THE BUG THIS PINS. The descriptor used to advertise the raw transport bounds
// (15..30) while a separate post-range check rejected everything the shipped
// clients could not absorb — so the console rendered 「可調整範圍 15 ～ 30」 and
// the platform 400'd 15, 20, 24, 25 and 29. An operator reading the UI had no
// way to know 20 was impossible, and 29.9 being accepted while 29 was not made
// it look random. Serving the descriptor from the server was supposed to make
// exactly this impossible ("the bounds exist exactly once"); the bound simply
// was not all in the descriptor. Now it is, and this test walks the boundary so
// it cannot come apart again.
func TestAdvertisedRangeIsTheAcceptedRange(t *testing.T) {
	testkit.Cover(t, "opsenv-advertised-range-is-accepted-range")

	for _, d := range opsenv.Descriptors {
		require.LessOrEqual(t, d.Min, d.Max, "%s: an unrenderable descriptor (Min > Max)", d.Key)

		// The advertised endpoints must both be accepted.
		assert.NoError(t, opsenv.Validate(d.Key, d.Min), "%s: advertised Min must be accepted", d.Key)
		assert.NoError(t, opsenv.Validate(d.Key, d.Max), "%s: advertised Max must be accepted", d.Key)
		// The compiled default must be inside its own advertised range.
		assert.NoError(t, opsenv.Validate(d.Key, d.Default), "%s: default must be accepted", d.Key)

		// Just outside must be refused, in the unit the operator types.
		step := 1.0
		if !d.Integer {
			step = 0.1
		}
		assert.Error(t, opsenv.Validate(d.Key, d.Min-step), "%s: below Min must be refused", d.Key)
		assert.Error(t, opsenv.Validate(d.Key, d.Max+step), "%s: above Max must be refused", d.Key)

		// And nothing strictly inside may be refused — the property that actually
		// failed before. Walk the interval at operator granularity.
		for v := d.Min; v <= d.Max; v += step {
			if d.Integer && v != math.Trunc(v) {
				continue
			}
			assert.NoError(t, opsenv.Validate(d.Key, v),
				"%s: %v is inside the advertised range %v..%v but the validator refuses it — "+
					"the console would show a range it cannot save", d.Key, v, d.Min, d.Max)
		}
	}
}

// opsenv-stale-file-revalidated: a value that was legal when it was SAVED but is
// not legal now must not be served.
//
// This is not a hand-editing story. The snapshot floor is derived from the
// client's compiled interpolation delay, so a netcode change moves the bound
// underneath every already-stored document — INTERP_DELAY_MS 100 → 66 moved it
// 20 → 30 while this package was being written. sanitize() used to check only
// min/max/integer/finite, so such a document was loaded and served verbatim to
// every game-server, and the one rule whose purpose is to protect the whole
// fleet from a stuttering save was enforced on the write path alone.
func TestStoredValueIsRevalidatedOnLoad(t *testing.T) {
	testkit.Cover(t, "opsenv-stale-file-revalidated")
	ts := testutil.New(t)

	dir := filepath.Join(ts.Srv.Cfg.DataDir, opsenv.Collection)
	require.NoError(t, os.MkdirAll(dir, 0o755))
	// snapshotHz 15 is inside the TRANSPORT bounds and was a legal save under a
	// 100 ms client delay; it is not legal against today's fleet.
	require.NoError(t, os.WriteFile(filepath.Join(dir, opsenv.DocID+".json"),
		[]byte(`{"version":1,"updatedAt":"2026-01-01T00:00:00Z","values":{"maxRooms":50,"snapshotHz":15}}`),
		0o644))

	r := ts.Do(http.MethodGet, "/api/v1/server-ops", "", nil)
	require.Equal(t, http.StatusOK, r.Status)
	assert.EqualValues(t, opsenv.DefaultSnapshotHz, publicValues(t, r)["snapshotHz"],
		"a stored snapshotHz the write path would refuse today must fall back to the compiled "+
			"default, not be served to every game-server")
	assert.EqualValues(t, 50, publicValues(t, r)["maxRooms"],
		"the other keys in the same document must be untouched")
}

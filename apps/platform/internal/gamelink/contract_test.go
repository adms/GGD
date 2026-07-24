package gamelink_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// THE CONTRACT TEST FOR TASKS #6 / #25.
//
// Every other test in this package builds a `gamelink.ResultRequest` VALUE in
// Go and hands it to the handler. That proves the settlement logic works and
// proves nothing at all about the bytes the game server actually sends — which
// is precisely how this shipped broken for the whole project: MatchRoom.ts
// posted its own `MatchResult`, whose `{teams:[{teamId, placement, members}]}`
// shape shares only `matchId` and `mode` with this struct. `placements` and
// `seats` decoded as nil, the settlement walked zero seats, and the platform
// answered 200 "ok" while crediting nobody. Not one match had ever settled.
//
// So this file starts from REAL BYTES instead. testdata/gameserver_result_callback.json
// is the literal output of `buildPlatformResult` in
// apps/game-server/src/rooms/MatchRoom.ts (regenerate it by calling that
// function if the shape ever changes on purpose). If the two sides drift again,
// this test fails on the platform side before anyone plays a match.

// gameServerBody loads the recorded game-server payload and rebinds it to this
// test's match and accounts: the fixture's ids are placeholders, everything
// else — field names, nesting, types — is byte-faithful to the wire.
func gameServerBody(t *testing.T, matchID string, humans ...string) []byte {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "gameserver_result_callback.json"))
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(raw, &payload))
	payload["matchId"] = matchID
	seats, _ := payload["seats"].([]any)
	require.NotEmpty(t, seats, "fixture must carry seats")
	next := 0
	for _, s := range seats {
		seat, _ := s.(map[string]any)
		if seat["isBot"] == true || next >= len(humans) {
			continue
		}
		seat["accountId"] = humans[next]
		next++
	}
	require.Equal(t, len(humans), next, "fixture must have a human seat per account")
	payload["endedAt"] = time.Now().UnixMilli()

	out, err := json.Marshal(payload)
	require.NoError(t, err)
	return out
}

func postResult(t *testing.T, base, matchID string, body []byte) (int, map[string]any) {
	t.Helper()
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	req, err := http.NewRequest(http.MethodPost, base+"/api/v1/internal/matches/"+matchID+"/result", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(gamelink.HeaderTimestamp, ts)
	req.Header.Set(gamelink.HeaderAuth, gamelink.Sign(testutil.GameSecret, ts, body))
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

// The payload the game server really sends must settle real accounts.
func TestGameServerPayloadActuallySettles(t *testing.T) {
	testkit.Cover(t, "seam-contract-gameserver-payload")
	ts := testutil.New(t)
	host, guest, _, matchID := startMatch(ts)

	before, err := ts.Srv.Accounts.GetByID(t.Context(), host.ID)
	require.NoError(t, err)
	require.Zero(t, before.Games, "precondition: nothing settled yet")

	code, ack := postResult(t, ts.HTTP.URL, matchID, gameServerBody(t, matchID, host.ID, guest.ID))
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, "ok", ack["status"])
	// The number that would have caught this bug on day one. A 200 with
	// settled=0 is the exact silent failure being fixed, so the handler reports
	// what it paid and the game server logs it.
	require.EqualValues(t, 2, ack["settled"], "both human seats credited")
	require.EqualValues(t, 2, ack["humanSeats"])

	after, err := ts.Srv.Accounts.GetByID(t.Context(), host.ID)
	require.NoError(t, err)
	require.Equal(t, 1, after.Games, "the match counted")
	require.Equal(t, 1, after.Wins, "team 0 placed first")
	require.Greater(t, after.MMR, before.MMR, "the winner's MMR moved")
	// M幣 needs an ALL-HUMAN lobby; this contract fixture has bot fill, so the
	// balance must be untouched rather than paid (anti-farm, owner's rule).
	require.Zero(t, after.MCoin, "bot lobby pays no M幣")

	// 水晶 (task #118) rides this same authenticated path — it has no other
	// grant route — so a match that settles must also have paid crystals.
	require.Positive(t, ts.Srv.Wallet.CrystalOf(t.Context(), host.ID),
		"水晶 still granted (halved, because a bot sits on his team) — the settlement path works")

	// And the ladder the player looks at afterwards is no longer empty.
	r := ts.Do(http.MethodGet, "/api/v1/ranking/leaderboard", host.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.NotEmpty(t, r.Body["entries"], "leaderboard has the settled match's players")
}

// The regression guard: the OLD game-server payload must now be refused loudly
// rather than accepted as an empty settlement.
func TestLegacyTeamsShapedPayloadIsRejected(t *testing.T) {
	testkit.Cover(t, "seam-contract-legacy-rejected")
	ts := testutil.New(t)
	host, _, _, matchID := startMatch(ts)

	// This is exactly what MatchRoom.ts used to post: the sim's own MatchResult.
	legacy, err := json.Marshal(map[string]any{
		"matchId": matchID,
		"mode":    "PairedDuels",
		"seed":    12345,
		"rounds":  7,
		"teams": []any{map[string]any{
			"teamId": 0, "placement": 1,
			"members": []any{map[string]any{
				"seatId": 0, "accountId": host.ID, "kills": 3, "deaths": 1, "isBot": false,
			}},
		}},
	})
	require.NoError(t, err)

	code, _ := postResult(t, ts.HTTP.URL, matchID, legacy)
	require.Equal(t, http.StatusBadRequest, code,
		"a body with no placements/seats settles nobody and must say so, not answer 200")

	after, err := ts.Srv.Accounts.GetByID(t.Context(), host.ID)
	require.NoError(t, err)
	require.Zero(t, after.Games, "nothing was silently applied")

	// AND the match id must NOT have been latched as done — otherwise the
	// rejection would poison a corrected retry, which is what made the original
	// bug unrecoverable without clearing Redis.
	require.False(t, ts.Mini.Exists("match:result:done:"+matchID),
		"a malformed body must not burn the idempotency latch")

	// Proof of that: the correct payload for the SAME match still settles.
	code, ack := postResult(t, ts.HTTP.URL, matchID, gameServerBody(t, matchID, host.ID))
	require.Equal(t, http.StatusOK, code)
	require.EqualValues(t, 1, ack["settled"])
}

package matchstats_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/matchstats"
)

const testSecret = "test-internal-secret"

// mountLikeServer builds the SAME router shape internal/server builds, so a
// path drift between matchstats.IngestPath and the registered route is a red
// test rather than a 404 nobody sees until the game-server starts posting into
// the void. (Failure mode ②: the data is produced and never lands.)
func mountLikeServer(t *testing.T, svc *matchstats.Service, now time.Time) (http.Handler, *stubGate) {
	t.Helper()
	gate := &stubGate{}
	h := matchstats.NewHandlers(svc, gate.middleware, testSecret, time.Minute)
	h.SetNow(func() time.Time { return now })
	r := chi.NewRouter()
	r.Route("/api/v1", func(api chi.Router) {
		h.MountInternal(api)
		api.Group(func(pr chi.Router) { h.Mount(pr) })
	})
	return r, gate
}

// stubGate stands in for admin.AdminOnly and records whether it ran.
type stubGate struct {
	ran   int
	allow bool
}

func (g *stubGate) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		g.ran++
		if !g.allow {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func signedPost(t *testing.T, h http.Handler, path string, body []byte, now time.Time, sign bool) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	ts := strconv.FormatInt(now.Unix(), 10)
	req.Header.Set(gamelink.HeaderTimestamp, ts)
	if sign {
		req.Header.Set(gamelink.HeaderAuth, gamelink.Sign(testSecret, ts, body))
	} else {
		req.Header.Set(gamelink.HeaderAuth, "deadbeef")
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func ingestBody(t *testing.T, matchID string, endedAt time.Time, ledger []byte) []byte {
	t.Helper()
	raw, err := json.Marshal(matchstats.IngestRequest{
		MatchID: matchID, GameVersion: "game-7",
		EndedAt: endedAt.UnixMilli(), Ledger: ledger,
	})
	require.NoError(t, err)
	return raw
}

func TestIngestRouteIsReachableAtTheExportedPath(t *testing.T) {
	now := time.Date(2026, 7, 30, 9, 0, 0, 0, time.UTC)
	ended := now.Add(-5 * time.Minute)
	svc, store, _ := newSvc(t, matchstats.Options{
		PlatformVersion: "v0.9.13", Now: func() time.Time { return now },
	})
	h, _ := mountLikeServer(t, svc, now)

	w := signedPost(t, h, matchstats.IngestPath, ingestBody(t, "m_0001", ended, ledger("m_0001")), now, true)
	require.Equal(t, http.StatusOK, w.Code,
		"matchstats.IngestPath must be the path the route is actually mounted at — "+
			"the body-cap exemption in internal/server keys on this exact string. body=%s", w.Body)

	var ack matchstats.IngestAck
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &ack))
	assert.Equal(t, "ok", ack.Status)
	assert.Zero(t, ack.Dropped)
	assert.Equal(t, "v0.9.13", ack.Versions.Platform)

	var rec matchstats.Record
	require.NoError(t, store.Get(matchstats.Collection(ended), "m_0001", &rec),
		"the record must be ON DISK, not merely acknowledged")
	assert.Equal(t, "game-7", rec.Version.Game)
}

func TestIngestRefusesAnUnsignedRequest(t *testing.T) {
	now := time.Now()
	svc, _, _ := newSvc(t, matchstats.Options{})
	h, _ := mountLikeServer(t, svc, now)
	w := signedPost(t, h, matchstats.IngestPath, ingestBody(t, "m_1", now, ledger("m_1")), now, false)
	assert.Equal(t, http.StatusUnauthorized, w.Code,
		"the ledger route is on the internal HMAC channel; an unsigned body must not be stored")
}

func TestIngestKeepsTheGoodPartOfAPartlyBadLedger(t *testing.T) {
	now := time.Date(2026, 7, 30, 9, 0, 0, 0, time.UTC)
	ended := now.Add(-time.Minute)
	svc, store, _ := newSvc(t, matchstats.Options{Now: func() time.Time { return now }})
	h, _ := mountLikeServer(t, svc, now)

	bad := []byte(`{"matchId":"m_1","casts":[{"castId":0,"seatId":0,"abilityId":"a"},{"castId":1,"seatId":0}]}`)
	w := signedPost(t, h, matchstats.IngestPath, ingestBody(t, "m_1", ended, bad), now, true)
	require.Equal(t, http.StatusOK, w.Code, "one bad element must not reject the whole match")

	var ack matchstats.IngestAck
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &ack))
	assert.Equal(t, 1, ack.Dropped,
		"the ack must SAY what was dropped — a bare ok is what let a mis-shaped payload look "+
			"healthy for this entire project (see gamelink's resultAck)")

	var rec matchstats.Record
	require.NoError(t, store.Get(matchstats.Collection(ended), "m_1", &rec))
	require.Len(t, rec.Dropped, 1)
	assert.Equal(t, "casts[1]", rec.Dropped[0].Path,
		"and the loss must be recorded ON the record, so the console can flag incomplete numbers")
}

func TestIngestRefusesAnUnknownSectionOutright(t *testing.T) {
	now := time.Now()
	svc, _, _ := newSvc(t, matchstats.Options{})
	h, _ := mountLikeServer(t, svc, now)
	body := ingestBody(t, "m_1", now, []byte(`{"matchId":"m_1","cast":[]}`))
	w := signedPost(t, h, matchstats.IngestPath, body, now, true)
	assert.Equal(t, http.StatusBadRequest, w.Code,
		"a section name this build does not know reads back as EMPTY everywhere — refuse it loudly")
}

func TestIngestRefusesAMissingEndedAt(t *testing.T) {
	now := time.Now()
	svc, _, _ := newSvc(t, matchstats.Options{})
	h, _ := mountLikeServer(t, svc, now)
	raw, err := json.Marshal(matchstats.IngestRequest{
		MatchID: "m_1", Ledger: ledger("m_1"),
	})
	require.NoError(t, err)
	w := signedPost(t, h, matchstats.IngestPath, raw, now, true)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestTheReadSurfaceIsAdminGated(t *testing.T) {
	now := time.Now()
	svc, _, _ := newSvc(t, matchstats.Options{})
	h, gate := mountLikeServer(t, svc, now)

	for _, path := range []string{"/api/v1/admin/match-stats/", "/api/v1/admin/match-stats/m_1"} {
		gate.ran = 0
		req := httptest.NewRequest(http.MethodGet, path, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		assert.Equal(t, http.StatusForbidden, w.Code, "%s must be behind the admin gate", path)
		assert.Equal(t, 1, gate.ran, "%s did not run the admin middleware at all", path)
	}
}

func TestNilAdminGatePanicsAtWiringTime(t *testing.T) {
	svc, _, _ := newSvc(t, matchstats.Options{})
	assert.PanicsWithValue(t,
		"matchstats: adminOnly middleware is required; an admin surface must never mount unguarded",
		func() { matchstats.NewHandlers(svc, nil, "s", time.Minute) },
		"wiring nil must crash on boot, never mount an unguarded admin surface")
}

func TestAdminListAndGetReturnWhatWasStored(t *testing.T) {
	now := time.Date(2026, 7, 30, 9, 0, 0, 0, time.UTC)
	svc, _, _ := newSvc(t, matchstats.Options{PlatformVersion: "v1", Now: func() time.Time { return now }})
	h, gate := mountLikeServer(t, svc, now)
	gate.allow = true
	for i := range 2 {
		id := fmt.Sprintf("m_%04d", i)
		_, err := svc.Put(matchstats.Ingest{
			MatchID: id, GameVersion: "game-7",
			EndedAt: now.Add(-time.Duration(i) * time.Hour), Ledger: ledger(id),
		})
		require.NoError(t, err)
	}

	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/admin/match-stats/", nil))
	require.Equal(t, http.StatusOK, w.Code)
	var list struct {
		Matches []matchstats.Summary `json:"matches"`
		Unread  int                  `json:"unreadable"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &list))
	require.Len(t, list.Matches, 2)
	assert.Equal(t, "m_0000", list.Matches[0].MatchID, "newest first")
	assert.Equal(t, "v1", list.Matches[0].Version.Platform,
		"the index must carry the build stamp — that is the column an operator sorts by "+
			"when comparing one version against the next")
	assert.Greater(t, list.Matches[0].Bytes, int64(0))

	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/admin/match-stats/m_0001", nil))
	require.Equal(t, http.StatusOK, w.Code)
	var rec matchstats.Record
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &rec))
	assert.Equal(t, "m_0001", rec.MatchID)
	assert.NotEmpty(t, rec.Ledger)

	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/admin/match-stats/nope", nil))
	assert.Equal(t, http.StatusNotFound, w.Code)
}

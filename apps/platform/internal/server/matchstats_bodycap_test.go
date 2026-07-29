package server

// The #126 global 1 MiB request-body cap applies to EVERY route so no route has
// to remember to bound itself. #207's match-stats ingest is the second
// legitimate exception (after #243's archive upload): a real ledger is 12 seats
// × ~8 rounds of casts / item transactions / offers and goes past 1 MiB for a
// long match.
//
// The failure this pins is the silent one. MaxBytesReader's error surfaces as a
// generic decode failure, so under the global cap the platform would 400
// precisely the matches with the most to analyse, the game-server would log
// "invalid JSON body", and nobody would connect that to a size limit.

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ggd/platform/internal/matchstats"
)

// readAll is a handler that drains the (already wrapped) body and reports
// whether MaxBytesReader cut it off.
func readAll(t *testing.T, out *error) http.Handler {
	t.Helper()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		*out = err
	})
}

func TestMatchStatsIngestIsExemptFromTheGlobalBodyCap(t *testing.T) {
	body := bytes.Repeat([]byte("x"), int(maxRequestBodyBytes)+1<<20) // 1 MiB over the global cap

	var errExempt error
	req := httptest.NewRequest(http.MethodPost, matchstats.IngestPath, bytes.NewReader(body))
	capRequestBody(readAll(t, &errExempt)).ServeHTTP(httptest.NewRecorder(), req)
	if errExempt != nil {
		t.Fatalf("a %d-byte ledger was cut off at the exempt path %s: %v\n"+
			"a long match would be rejected as 'invalid JSON body' with nothing naming the size",
			len(body), matchstats.IngestPath, errExempt)
	}

	// …and the exemption must be EXACT, never a prefix: a sibling route under
	// the same subtree must keep the global cap.
	var errSibling error
	req = httptest.NewRequest(http.MethodPost, matchstats.IngestPath+"/anything", bytes.NewReader(body))
	capRequestBody(readAll(t, &errSibling)).ServeHTTP(httptest.NewRecorder(), req)
	if errSibling == nil {
		t.Errorf("%s/anything was also exempted — a prefix exemption silently enlarges every "+
			"future route added under the same subtree", matchstats.IngestPath)
	}
}

func TestTheMatchStatsCapCoversWhatTheStorageLayerAccepts(t *testing.T) {
	// The HTTP layer must never reject a body the storage gate would have
	// accepted; otherwise the cap that shows up in the error message is not the
	// cap that is actually binding.
	if maxMatchStatsBytes < matchstats.MaxRecordBytes {
		t.Fatalf("maxMatchStatsBytes (%d) is below matchstats.MaxRecordBytes (%d) — "+
			"the transport would 413 records the store would have taken",
			maxMatchStatsBytes, matchstats.MaxRecordBytes)
	}
}

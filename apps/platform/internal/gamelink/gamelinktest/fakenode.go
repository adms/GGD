// Package gamelinktest provides a fake Colyseus game server (httptest) for
// integration tests of both seam directions: it verifies the outbound HMAC on
// /_internal/matches and can send signed result callbacks to the platform.
package gamelinktest

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"time"

	"github.com/ggd/platform/internal/gamelink"
)

// FakeNode is a stand-in for the Colyseus /_internal/matches admin route.
type FakeNode struct {
	Server *httptest.Server
	Secret string

	mu       sync.Mutex
	requests []gamelink.MatchRequest
	rejected int
}

// New starts the fake game server. Close it via Close().
func New(secret string) *FakeNode {
	f := &FakeNode{Secret: secret}
	f.Server = httptest.NewServer(http.HandlerFunc(f.handle))
	return f
}

// Close shuts the server down.
func (f *FakeNode) Close() { f.Server.Close() }

// URL is the base URL to use as GAME_SERVER_ADDR.
func (f *FakeNode) URL() string { return f.Server.URL }

// Requests returns every accepted reservation request.
func (f *FakeNode) Requests() []gamelink.MatchRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]gamelink.MatchRequest, len(f.requests))
	copy(out, f.requests)
	return out
}

// Rejected returns how many requests failed HMAC verification.
func (f *FakeNode) Rejected() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.rejected
}

func (f *FakeNode) handle(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/_internal/matches" || r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	body, _ := io.ReadAll(r.Body)
	ts := r.Header.Get(gamelink.HeaderTimestamp)
	sig := r.Header.Get(gamelink.HeaderAuth)
	if !gamelink.Verify(f.Secret, ts, sig, body, time.Now(), 30*time.Second) {
		f.mu.Lock()
		f.rejected++
		f.mu.Unlock()
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, `{"error":{"code":"unauthorized","message":"bad internal signature"}}`)
		return
	}
	var req gamelink.MatchRequest
	if err := json.Unmarshal(body, &req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	f.mu.Lock()
	f.requests = append(f.requests, req)
	f.mu.Unlock()

	resp := gamelink.MatchResponse{
		MatchID:        req.MatchID,
		ColyseusRoomID: "coly-" + req.MatchID,
		Endpoint:       "ws://fake-game:2567",
	}
	for _, seat := range req.Seats {
		if seat.IsBot {
			continue // bots are never reserved — MatchRoom spawns them
		}
		resp.Reservations = append(resp.Reservations, gamelink.Reservation{
			AccountID: seat.AccountID,
			SeatToken: "seat-" + req.MatchID + "-" + seat.AccountID,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// SendResult signs and POSTs a result callback to the platform, returning the
// HTTP response. ts defaults to now when tsOverride is zero.
func SendResult(platformBase, secret string, result gamelink.ResultRequest, tsOverride int64) (*http.Response, error) {
	body, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}
	ts := tsOverride
	if ts == 0 {
		ts = time.Now().Unix()
	}
	tsStr := strconv.FormatInt(ts, 10)
	req, err := http.NewRequest(http.MethodPost,
		platformBase+"/api/v1/internal/matches/"+result.MatchID+"/result", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(gamelink.HeaderTimestamp, tsStr)
	req.Header.Set(gamelink.HeaderAuth, gamelink.Sign(secret, tsStr, body))
	return http.DefaultClient.Do(req)
}

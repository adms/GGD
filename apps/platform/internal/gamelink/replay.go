package gamelink

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/ggd/platform/internal/httpx"
)

// Replay proxying (task #175). Match recordings live on the GAME server (next to
// the deterministic sim that produces them), reachable only over the private,
// HMAC-signed /_internal channel — never a public route, because recordings
// carry player names. The admin console reaches them THROUGH this platform proxy
// so a single admin session gates the whole surface; the platform never stores a
// recording, it only forwards the admin's request with a fresh HMAC signature.

// ReplaySummary mirrors the game server's list row (kept loose: the platform
// forwards it to the admin UI verbatim and does not interpret the fields).
type ReplaySummary = json.RawMessage

// ListReplays fetches the recording list from the game server, newest first.
func (s *Service) ListReplays(ctx context.Context) (json.RawMessage, error) {
	return s.replayGet(ctx, "/_internal/replays")
}

// replayIDRe bounds the recording id — the ONLY attacker-influenced component of
// the proxied URL. url.PathEscape already confines it to a single path segment
// (it escapes "/", "?" and "#"), but it does NOT escape dots, so a bare ".."
// would still address one segment upward on the game server's private API. The
// game side normalises that away, but the platform owns its own input: matching
// this pattern and rejecting ".." makes the containment argument local to this
// file instead of depending on a service in another language.
var replayIDRe = regexp.MustCompile(`^[A-Za-z0-9._-]{1,96}$`)

func validReplayID(id string) bool {
	return replayIDRe.MatchString(id) && !strings.Contains(id, "..")
}

// GetReplay fetches one recording's summary + header + compatibility verdict.
func (s *Service) GetReplay(ctx context.Context, id string) (json.RawMessage, error) {
	if !validReplayID(id) {
		return nil, httpx.NotFound("recording not found")
	}
	return s.replayGet(ctx, "/_internal/replays/"+url.PathEscape(id))
}

// MintReplayTicket asks the game server for a short-lived, single-recording view
// ticket the client uses to open the replay room.
func (s *Service) MintReplayTicket(ctx context.Context, id string) (json.RawMessage, error) {
	if !validReplayID(id) {
		return nil, httpx.NotFound("recording not found")
	}
	return s.replaySend(ctx, http.MethodPost, "/_internal/replays/"+url.PathEscape(id)+"/ticket", nil)
}

func (s *Service) replayGet(ctx context.Context, path string) (json.RawMessage, error) {
	return s.replaySend(ctx, http.MethodGet, path, nil)
}

func (s *Service) replaySend(ctx context.Context, method, path string, body []byte) (json.RawMessage, error) {
	if body == nil {
		body = []byte{}
	}
	ts := strconv.FormatInt(s.now().Unix(), 10)
	// #nosec G704 -- not SSRF: the request AUTHORITY is fixed before any
	// attacker byte appears. s.gameAddr is pure operator config (config.go:
	// GAME_SERVER_ADDR, default http://127.0.0.1:2567) and no request data
	// reaches it; `path` always begins with the literal "/_internal/", so the
	// scheme/host/port are already parsed by then and cannot be redirected —
	// even id="@evil.com" leaves req.URL.Host as 127.0.0.1:2567. The one
	// variable component is the recording id, which validReplayID bounds to
	// [A-Za-z0-9._-]{1,96} (no "..") and url.PathEscape confines to a single
	// path segment. Both callers are admin-gated (replay_http.go: ar.Use(adminOnly)).
	req, err := http.NewRequestWithContext(ctx, method, s.gameAddr+path, strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set(HeaderTimestamp, ts)
	// Signed over the SAME bytes the game server verifies (empty for GET).
	req.Header.Set(HeaderAuth, Sign(s.secret, ts, body))
	// #nosec G704 -- same request as above; see the containment argument there.
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, httpx.Err(http.StatusBadGateway, "game_unreachable", "game server unreachable")
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode == http.StatusNotFound {
		return nil, httpx.NotFound("recording not found")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, httpx.Err(http.StatusBadGateway, "game_rejected",
			fmt.Sprintf("game server returned %d", resp.StatusCode))
	}
	return json.RawMessage(respBody), nil
}

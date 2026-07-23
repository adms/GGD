package gamelink

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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

// GetReplay fetches one recording's summary + header + compatibility verdict.
func (s *Service) GetReplay(ctx context.Context, id string) (json.RawMessage, error) {
	return s.replayGet(ctx, "/_internal/replays/"+url.PathEscape(id))
}

// MintReplayTicket asks the game server for a short-lived, single-recording view
// ticket the client uses to open the replay room.
func (s *Service) MintReplayTicket(ctx context.Context, id string) (json.RawMessage, error) {
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
	req, err := http.NewRequestWithContext(ctx, method, s.gameAddr+path, strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set(HeaderTimestamp, ts)
	// Signed over the SAME bytes the game server verifies (empty for GET).
	req.Header.Set(HeaderAuth, Sign(s.secret, ts, body))
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

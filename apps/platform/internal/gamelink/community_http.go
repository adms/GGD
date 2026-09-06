package gamelink

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
	"github.com/go-chi/chi/v5"
)

var communityRequestID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

// Mounted behind auth + PlayableOnly. The game room checks the authenticated
// account against its reserved seats before returning bytes or accepting ready.
func (s *Service) MountCommunity(r chi.Router) {
	r.Get("/community-matches/{matchId}", s.communityContent)
	r.Get("/community-matches/{matchId}/heroes/{workId}", s.communityContent)
	r.Post("/community-matches/{matchId}/ready", s.communityContent)
}

// This surface accepts only a short-lived ticket for one replay, never a player
// session or a client-selected Main URL. The game server verifies that ticket.
func (s *Service) MountReplayContent(r chi.Router) {
	r.Post("/replay-content/{replayId}", s.replayContent)
	r.Post("/replay-content/{replayId}/heroes/{workId}", s.replayContent)
}

func (s *Service) replayContent(w http.ResponseWriter, r *http.Request) {
	id, workID := chi.URLParam(r, "replayId"), chi.URLParam(r, "workId")
	if !validReplayID(id) || (workID != "" && (!communityRequestID.MatchString(workID) || strings.Contains(workID, ".."))) {
		httpx.WriteError(w, httpx.BadRequest("回放或作品身分不合法。"))
		return
	}
	var ticket struct {
		Ticket string `json:"ticket"`
	}
	if err := httpx.DecodeJSON(r, &ticket); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if len(ticket.Ticket) == 0 || len(ticket.Ticket) > 512 {
		httpx.WriteError(w, httpx.Unauthorized("缺少有效的回放觀看憑證。"))
		return
	}
	input := struct {
		ReplayID string `json:"replayId"`
		Ticket   string `json:"ticket"`
		WorkID   string `json:"workId,omitempty"`
	}{id, ticket.Ticket, workID}
	s.forwardCommunityContent(w, r, input, workID)
}

func (s *Service) communityContent(w http.ResponseWriter, r *http.Request) {
	matchID, workID := chi.URLParam(r, "matchId"), chi.URLParam(r, "workId")
	if !communityRequestID.MatchString(matchID) || strings.Contains(matchID, "..") || (workID != "" && (!communityRequestID.MatchString(workID) || strings.Contains(workID, ".."))) {
		httpx.WriteError(w, httpx.BadRequest("房間或作品身分不合法。"))
		return
	}
	input := struct {
		MatchID     string `json:"matchId"`
		AccountID   string `json:"accountId"`
		WorkID      string `json:"workId,omitempty"`
		ReadyDigest string `json:"readyDigest,omitempty"`
	}{MatchID: matchID, AccountID: auth.MustIdentity(r.Context()).AccountID, WorkID: workID}
	if r.Method == http.MethodPost {
		var ready struct {
			Digest string `json:"digest"`
		}
		if err := httpx.DecodeJSON(r, &ready); err != nil {
			httpx.WriteError(w, err)
			return
		}
		if len(ready.Digest) != 71 || !strings.HasPrefix(ready.Digest, "sha256:") {
			httpx.WriteError(w, httpx.BadRequest("缺少已驗證的房間內容版本。"))
			return
		}
		input.ReadyDigest = ready.Digest
	}
	s.forwardCommunityContent(w, r, input, workID)
}

func (s *Service) forwardCommunityContent(w http.ResponseWriter, r *http.Request, input any, workID string) {
	if s.secret == "" {
		httpx.WriteError(w, httpx.Err(503, "community_content_disabled", "尚未設定固定內容驗證服務。"))
		return
	}
	body, _ := json.Marshal(input)
	// Authority is operator configuration; request-controlled IDs are only in the signed body.
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, s.gameAddr+"/_internal/community-content", bytes.NewReader(body))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	ts := strconv.FormatInt(s.now().Unix(), 10)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(HeaderTimestamp, ts)
	req.Header.Set(HeaderAuth, Sign(s.secret, ts, body))
	client := *s.http
	client.Timeout = 70 * time.Second
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(req)
	if err != nil {
		httpx.WriteError(w, httpx.Err(503, "community_content_unavailable", "無法連線至房間內容服務。"))
		return
	}
	defer response.Body.Close()
	limit := int64(64 * 1024 * 1024)
	if workID == "" || response.StatusCode != http.StatusOK {
		limit = 4 * 1024 * 1024
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil || int64(len(raw)) > limit {
		httpx.WriteError(w, httpx.Err(503, "community_content_incomplete", "房間內容超過容量或傳輸中斷。"))
		return
	}
	if response.StatusCode != http.StatusOK {
		var problem struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(raw, &problem)
		if problem.Error.Message == "" {
			problem.Error.Message = "無法取得固定房間內容。"
		}
		httpx.WriteError(w, httpx.Err(response.StatusCode, "community_content_rejected", problem.Error.Message))
		return
	}
	contentType := "application/json"
	if workID != "" {
		contentType = "application/zip"
	} else if !json.Valid(raw) {
		httpx.WriteError(w, httpx.Err(503, "community_content_invalid", "房間內容回應格式錯誤。"))
		return
	}
	if !strings.HasPrefix(response.Header.Get("Content-Type"), contentType) {
		httpx.WriteError(w, httpx.Err(503, "community_content_invalid", "房間內容媒體格式錯誤。"))
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}

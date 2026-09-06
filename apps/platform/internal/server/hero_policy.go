package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/submissions"
)

// The existing Admin config editor writes this overlay and its existing audit.
// A missing/corrupt document closes intake instead of inventing a second default.
func (s *Server) heroIntakePolicy() (submissions.HeroIntakePolicy, error) {
	if s.Store != nil {
		var overlay struct {
			Docs    map[string]json.RawMessage `json:"docs"`
			Deleted map[string]bool            `json:"deleted"`
		}
		err := s.Store.Get("content-overlay", "overlay", &overlay)
		if err != nil && !errors.Is(err, jsonstore.ErrNotFound) {
			return submissions.HeroIntakePolicy{}, heroPolicyUnavailable()
		}
		if err == nil && !overlay.Deleted[overlayUgcKey] {
			if raw, found := overlay.Docs[overlayUgcKey]; found {
				return parseHeroIntakePolicy(raw)
			}
		}
	}
	if s.Cfg.ContentDir == "" {
		return submissions.HeroIntakePolicy{}, heroPolicyUnavailable()
	}
	raw, err := os.ReadFile(filepath.Join(s.Cfg.ContentDir, "config", "ugc.json"))
	if err != nil {
		return submissions.HeroIntakePolicy{}, heroPolicyUnavailable()
	}
	return parseHeroIntakePolicy(raw)
}

func heroPolicyUnavailable() error {
	return httpx.Err(503, "hero_policy_unavailable", "投稿政策無法驗證；請保留本機草稿並稍後重試。")
}

func parseHeroIntakePolicy(raw []byte) (submissions.HeroIntakePolicy, error) {
	var doc struct {
		ID              string  `json:"id"`
		Schema          string  `json:"schema"`
		Note            *string `json:"note"`
		Enabled         *bool   `json:"enabled"`
		RequireAuth     *bool   `json:"requireAuth"`
		AutoPromote     *bool   `json:"autoPromote"`
		DigestRecompute *bool   `json:"digestRecompute"`
		MaxPending      *int    `json:"maxPendingPerPlayer"`
		DailyQuota      *int    `json:"quotaPerPlayerPerDay"`
		MaxBytes        *int    `json:"maxBytes"`
		ModelUploads    *bool   `json:"heroModelUploadsEnabled"`
		ModelMaxBytes   *int    `json:"heroModelMaxBytes"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if !json.Valid(raw) || decoder.Decode(&doc) != nil || doc.ID != "ugc" || doc.Schema != "config.ugc@1" || doc.Enabled == nil || doc.RequireAuth == nil || doc.AutoPromote == nil || doc.DigestRecompute == nil || doc.MaxPending == nil || doc.DailyQuota == nil || doc.MaxBytes == nil {
		return submissions.HeroIntakePolicy{}, heroPolicyUnavailable()
	}
	// Bounds mirror Main's config.ugc@1 transport schema; no operational defaults
	// live here. A shared shipped-config fixture verifies this Go consumer.
	if *doc.MaxPending < 1 || *doc.MaxPending > 200 || *doc.DailyQuota < 1 || *doc.DailyQuota > 500 || *doc.MaxBytes < 4096 || *doc.MaxBytes > 4194304 {
		return submissions.HeroIntakePolicy{}, heroPolicyUnavailable()
	}
	modelUploads := doc.ModelUploads == nil || *doc.ModelUploads
	modelMaxBytes := *doc.MaxBytes
	if doc.ModelMaxBytes != nil {
		if *doc.ModelMaxBytes < 4096 || *doc.ModelMaxBytes > submissions.MaxHeroArchiveBytes {
			return submissions.HeroIntakePolicy{}, heroPolicyUnavailable()
		}
		modelMaxBytes = *doc.ModelMaxBytes
	}
	return submissions.HeroIntakePolicy{Enabled: *doc.Enabled, MaxPendingPerPlayer: *doc.MaxPending, QuotaPerPlayerPerDay: *doc.DailyQuota, MaxBytes: *doc.MaxBytes, ModelUploadsEnabled: modelUploads, ModelMaxBytes: modelMaxBytes}, nil
}

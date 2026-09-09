package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/ggd/platform/internal/account"
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
		PowerUserQuota  *int    `json:"powerUserQuotaPerDay"`
		MaxBytes        *int    `json:"maxBytes"`
		ModelUploads    *bool   `json:"heroModelUploadsEnabled"`
		ModelMaxBytes   *int    `json:"heroModelMaxBytes"`
		// ⭐⭐ 2026-09-08 合併 PR 1118 補上 —— main 的 GH#1025 給 `config.ugc@1` 加了這兩格，
		//   而下面是 `DisallowUnknownFields()` ⇒ ⛔ 少宣告一格，**整份政策就讀不進來**，
		//   而回給玩家的是 503「投稿政策無法驗證」——⭐ 一個看起來像伺服器壞了的錯誤，
		//   ⛔ 真正的原因是 Main 那邊多了一個欄位。
		// ⚠️ 這兩格**不參與**完整英雄的政策（它們是內容池與公告模式）⇒ 宣告了但不讀。
		//   ⭐ 而「宣告」本身就是它們存在的意義：嚴格解析要嚴格得**有名有姓**。
		CommunityRoomOnly *bool   `json:"communityRoomOnly"`
		PublishMode       *string `json:"publishMode"`
		// ⭐⭐ GH#1157 —— 已發布英雄的收據要對哪幾欄。⛔ 留空 ⇒ `migration`（出貨值）。
		// ⚠️ 這一格**必須**宣告:下面是 `DisallowUnknownFields()` ⇒ ⛔ 少一格,
		//   **整份政策讀不進來**,而玩家收到的是 503「投稿政策無法驗證」——
		//   ⭐ 一個看起來像伺服器壞了的錯誤（這個檔上面那段註解記過同一次事故）。
		HeroTargetMatch *string `json:"heroTargetMatch"`
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
	powerUserQuota := *doc.DailyQuota
	if doc.PowerUserQuota != nil {
		if *doc.PowerUserQuota < 1 || *doc.PowerUserQuota > 500 {
			return submissions.HeroIntakePolicy{}, heroPolicyUnavailable()
		}
		powerUserQuota = *doc.PowerUserQuota
	}
	modelUploads := doc.ModelUploads == nil || *doc.ModelUploads
	modelMaxBytes := *doc.MaxBytes
	if doc.ModelMaxBytes != nil {
		if *doc.ModelMaxBytes < 4096 || *doc.ModelMaxBytes > submissions.MaxHeroArchiveBytes {
			return submissions.HeroIntakePolicy{}, heroPolicyUnavailable()
		}
		modelMaxBytes = *doc.ModelMaxBytes
	}
	// ⭐ GH#1157 —— 三檔之一;留空 ⇒ 出貨值 `migration`。
	// ⛔ **不認得的值一律 503**（fail-closed）—— ⭐ 靜靜退回預設會讓一個打錯的
	//   後台設定看起來像「生效了」,而那正是這一票要修的病的另一半。
	targetMatch := submissions.HeroTargetMatchMigration
	if doc.HeroTargetMatch != nil {
		switch submissions.HeroTargetMatch(*doc.HeroTargetMatch) {
		case submissions.HeroTargetMatchMigration, submissions.HeroTargetMatchGameAndMigration, submissions.HeroTargetMatchStrict:
			targetMatch = submissions.HeroTargetMatch(*doc.HeroTargetMatch)
		default:
			return submissions.HeroIntakePolicy{}, heroPolicyUnavailable()
		}
	}
	return submissions.HeroIntakePolicy{HeroTargetMatch: targetMatch, PowerUserQuotaPerDay: powerUserQuota, Enabled: *doc.Enabled, MaxPendingPerPlayer: *doc.MaxPending, QuotaPerPlayerPerDay: *doc.DailyQuota, MaxBytes: *doc.MaxBytes, ModelUploadsEnabled: modelUploads, ModelMaxBytes: modelMaxBytes}, nil
}

// Re-read durable certification on every check, including after package preparation.
func (s *Server) heroAccountIntakePolicy(ctx context.Context, accountID string, policy submissions.HeroIntakePolicy) (submissions.HeroIntakePolicy, error) {
	a, err := s.Accounts.GetByID(ctx, accountID)
	if err != nil {
		return submissions.HeroIntakePolicy{}, heroPolicyUnavailable()
	}
	if a.HasRole(account.RolePowerUser) && a.IsApproved() && !a.Banned {
		policy.QuotaPerPlayerPerDay = max(policy.QuotaPerPlayerPerDay, policy.PowerUserQuotaPerDay)
	}
	return policy, nil
}

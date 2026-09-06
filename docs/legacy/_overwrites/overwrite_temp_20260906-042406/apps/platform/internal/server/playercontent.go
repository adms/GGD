package server

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/submissions"
)

// overlayPlayerContentKey 是 console 的 `putOverlayDoc(CONFIG, "ui-cues")` 產生的鍵。
const overlayPlayerContentKey = "config/ui-cues"

// playerContentFlags 讀 `config.ui-cues@1` 的兩格 `playerContent` 開關。
//
// ── ⭐ 為什麼要**先讀 overlay**，⛔ 不是只讀出貨樹 ────────────────────────────
// `contentoverlay/goconsumers_test.go` 的訊息逐字：
//
//	「A Go reader of content/ does NOT see 後台 → 內容管理 edits, so shipping an
//	 admin page for it without checking is how 商店經濟 became write-only.」
//
// ⇒ 只讀出貨樹 = 後台把這一格關掉而**平台看不到** —— 而這兩格存在的理由就是
// 「一鍵關掉」。⛔ 一個關不掉的緊急開關比沒有開關更糟。
//
// ── ⭐ 為什麼**每一次呼叫都重讀**，⛔ 不是開機讀一次 ────────────────────────
// #278 修掉的正是那個缺陷：`Configs` 是 boot 時載入的，所以後台存檔之後要重啟
// shard 才生效，而頁面上寫著「從下一場開始生效」。這一條是**對外開放**的開關，
// 關掉它必須是**當下**生效。檔很小，而它只在有人打這兩條路線時被讀。
//
// ── ⛔ 讀不到／壞掉／缺欄位 ⇒ **兩格都關** ─────────────────────────────────
// ⭐ 刻意 fail-**closed**，⚠️ 而它與 `main.tsx` 的 fail-open **刻意相反**：
// 那一邊關的是「網站開不開得起來」，這一邊關的是「陌生人的內容看不看得到」。
func (s *Server) playerContentFlags() (submit bool, discover bool) {
	// ① 先問 overlay（後台存檔就住在這裡）。
	if s.Store != nil {
		var f struct {
			Docs    map[string]json.RawMessage `json:"docs"`
			Deleted map[string]bool            `json:"deleted"`
		}
		err := s.Store.Get("content-overlay", "overlay", &f)
		switch {
		case err != nil && !errors.Is(err, jsonstore.ErrNotFound):
			slog.Warn("submissions: 讀不到內容覆蓋層 —— 兩格開關 fail-closed（投稿與發現都關）",
				"key", overlayPlayerContentKey, "err", err)
			return false, false
		case err == nil && !f.Deleted[overlayPlayerContentKey]:
			if raw, ok := f.Docs[overlayPlayerContentKey]; ok {
				return parsePlayerContent(raw, "overlay")
			}
		}
	}
	// ② overlay 沒有這一份（或被 revert 成出貨）⇒ 讀出貨樹。
	if s.Cfg.ContentDir == "" {
		return false, false
	}
	raw, err := os.ReadFile(filepath.Join(s.Cfg.ContentDir, "config", "ui-cues.json"))
	if err != nil {
		return false, false
	}
	return parsePlayerContent(raw, "shipped")
}

// parsePlayerContent 是**全有或全無**的：一份讀不懂的文件 ⇒ 兩格都關。
// ⛔ 不做部分套用 —— 「submit 開了而 discover 的那一半沒讀到」是最糟的組合
// （收得進來、而沒有人看得到它被收進來了）。
func parsePlayerContent(raw []byte, from string) (bool, bool) {
	var doc struct {
		Schema        string `json:"schema"`
		PlayerContent *struct {
			Submit   *bool `json:"submit"`
			Discover *bool `json:"discover"`
		} `json:"playerContent"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		slog.Warn("submissions: ui-cues 讀不懂 —— 兩格開關 fail-closed", "from", from, "err", err)
		return false, false
	}
	if doc.Schema != "" && doc.Schema != "config.ui-cues@1" {
		slog.Warn("submissions: ui-cues 的 schema 標籤不對 —— 兩格開關 fail-closed",
			"from", from, "schema", doc.Schema)
		return false, false
	}
	if doc.PlayerContent == nil || doc.PlayerContent.Submit == nil || doc.PlayerContent.Discover == nil {
		return false, false
	}
	return *doc.PlayerContent.Submit, *doc.PlayerContent.Discover
}

// overlayUgcKey 是 console 的 `putOverlayDoc(CONFIG, "ugc")` 產生的鍵。
const overlayUgcKey = "config/ugc"

// ugcDigestRecompute 讀 `config.ugc@1` 的 `digestRecompute` 開關（GH#1022）。
//
// ⭐ 與 `playerContentFlags` **同一個形狀**：先 overlay、再出貨樹、每一次呼叫都重讀
// （這一格是「要不要相信客戶端的 digest」—— 後台翻它必須**當下**生效）。
//
// ── ⛔ 讀不到／壞掉／缺欄位 ⇒ **on**（fail-closed）────────────────────────────
// ⚠️ 它與 `playerContentFlags` 的 fail-closed 方向**看起來相反**（那一邊是 false），
// ⭐ 而語意是同一個：「不知道 ⇒ 選**擋人**的那一邊」。這一格 on 是擋、off 是放。
func (s *Server) ugcDigestRecompute() bool {
	if s.Store != nil {
		var f struct {
			Docs    map[string]json.RawMessage `json:"docs"`
			Deleted map[string]bool            `json:"deleted"`
		}
		err := s.Store.Get("content-overlay", "overlay", &f)
		switch {
		case err != nil && !errors.Is(err, jsonstore.ErrNotFound):
			slog.Warn("submissions: 讀不到內容覆蓋層 —— digestRecompute fail-closed（視為 on）",
				"key", overlayUgcKey, "err", err)
			return true
		case err == nil && !f.Deleted[overlayUgcKey]:
			if raw, ok := f.Docs[overlayUgcKey]; ok {
				return parseUgcDigestRecompute(raw, "overlay")
			}
		}
	}
	if s.Cfg.ContentDir == "" {
		return true
	}
	raw, err := os.ReadFile(filepath.Join(s.Cfg.ContentDir, "config", "ugc.json"))
	if err != nil {
		return true
	}
	return parseUgcDigestRecompute(raw, "shipped")
}

// parseUgcDigestRecompute：一份讀不懂的文件 ⇒ on（⛔ 不是「缺欄位就當成沒開」）。
func parseUgcDigestRecompute(raw []byte, from string) bool {
	var doc struct {
		Schema          string `json:"schema"`
		DigestRecompute *bool  `json:"digestRecompute"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		slog.Warn("submissions: ugc 讀不懂 —— digestRecompute fail-closed（視為 on）", "from", from, "err", err)
		return true
	}
	if doc.Schema != "" && doc.Schema != "config.ugc@1" {
		slog.Warn("submissions: ugc 的 schema 標籤不對 —— digestRecompute fail-closed（視為 on）",
			"from", from, "schema", doc.Schema)
		return true
	}
	if doc.DigestRecompute == nil {
		return true
	}
	return *doc.DigestRecompute
}

// UgcDigestRecomputeForTest 把上面那個未匯出的讀法開給**探針**用（#241 census）。
func (s *Server) UgcDigestRecomputeForTest() bool { return s.ugcDigestRecompute() }

// PlayerContentFlagsForTest 把上面那個未匯出的讀法開給**探針**用。
//
// ⭐ 它存在的理由與 `contentoverlay/goconsumers_test.go` 的訊息逐字相同：
// 「a census row with nothing measuring it is a comment」——
// 一列沒有人量的登記，正是 #241 那個缺陷的形狀。
// ⛔ 它刻意**不**是 handler 的一部分：handler 量到的是 HTTP 形狀，
// 而這兩格開關開與關**都回 200**，⇒ 狀態碼分不出它有沒有生效。
func (s *Server) PlayerContentFlagsForTest() (submit bool, discover bool) {
	return s.playerContentFlags()
}

// ⭐⭐ §4 —— AI／編輯器憑證的判別，與 promote 的稽核。
//
// ⭐ **重驗真的接上了**（2026-09-02）：`GGD_CONTENT_API_URL` 有值時，
// promote 會對 content-api 的 `POST /content-import/validate` 發**一次真的驗證**，
// 而那一支是 TS 側的純函式 `validatePackage`（⛔ 不在 Go 這邊重寫第二份）。
//
// ⚠️ ⭐ 而**沒設定就沒有鉤子** ⇒ `Promote` 回 503 `revalidator_missing`。
// ⛔ 這一格沒有安全的預設值：塞一個「當它過了」的鉤子會讓 promote 看起來會動，
// ⭐ 而一條「看起來會動、實際上沒重驗」的上線路徑，比沒有這條路徑危險得多。
//
// ── ⭐⭐ GH#1022 —— `GGD_CONTENT_API_URL` 現在**接得到**（`docker/compose.yaml` 的
// platform 區塊有 pass-through 那一格）；同一個 URL 也餵 Submit 的 digest 重算。
// ⚠️ ⭐ 已知的環境差別（⛔ 不是缺陷，是 content-api 的 `guard.ts` 刻意的）：
//   content-api 的每一個 mutating verb 只收 **loopback peer** ⇒ `pnpm dev`（platform 與
//   content-api 都在本機）走得通；`docker compose --profile dev` 容器對容器會拿 403
//   ⇒ promote 回 409 `revalidation_failed`（fail-loud，⛔ 不是靜默通過）。
func (s *Server) submissionPromoteDeps() submissions.PromoteDeps {
	contentAPI := os.Getenv("GGD_CONTENT_API_URL")
	return submissions.PromoteDeps{
		// ⭐ GH#1022 —— Submit 時的 digest 重算（同一個 content-api）。
		//   沒設定 ⇒ nil ⇒ 開關開著時 Submit 回 503 `digest_verifier_missing`。
		VerifyDigest:    submissions.ContentAPIDigestVerifier(contentAPI, nil),
		DigestRecompute: s.ugcDigestRecompute,
		// ⭐ origin 取自**角色**，⛔ 不是 body（包裡自稱一律覆蓋）。
		IsProposer: func(r *http.Request) bool {
			id, ok := auth.IdentityFrom(r.Context())
			if !ok || s.Accounts == nil {
				return false
			}
			a, err := s.Accounts.GetByID(r.Context(), id.AccountID)
			if err != nil {
				return false
			}
			return a.HasRole(submissions.RoleEditorProposer)
		},
		// ⭐ 沒設定 ⇒ `ContentAPIRevalidator` 回 nil ⇒ `Promote` 拒絕（fail-closed）。
		Revalidate: submissions.ContentAPIRevalidator(os.Getenv("GGD_CONTENT_API_URL"), nil),
		Audit: func(adminID, action string, detail map[string]any) {
			if s.Curation == nil {
				return
			}
			s.Curation.Audit(adminID, action, detail)
		},
	}
}

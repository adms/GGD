package server

import (
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/ggd/platform/internal/data/jsonstore"
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

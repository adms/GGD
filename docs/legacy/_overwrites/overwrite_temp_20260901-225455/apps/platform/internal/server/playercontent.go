package server

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// playerContentFlags 讀 `config.ui-cues@1` 的兩格 `playerContent` 開關。
//
// ⭐ 為什麼**每一次呼叫都重讀檔**，⛔ 不是開機讀一次：
// `Configs` 是 boot 時載入的，所以後台存檔之後要重啟 shard 才生效 —— 而
// #278 修掉的正是那個缺陷（頁面上寫著「從下一場開始生效」而它其實要重啟）。
// ⚠️ 這一條路線是**對外開放**的開關：關掉它必須是**當下**生效，
// ⛔ 不是「等下一次重啟」。檔很小（幾 KB），而它只在有人打這兩條路線時被讀。
//
// ⛔ 讀不到、壞掉、缺欄位 ⇒ **兩格都關**。
// ⭐ 這是刻意的 fail-closed：一條沒有人決定過要不要開的對外路線，
// 預設值只能是關（⚠️ 而它與 `main.tsx` 的 fail-open **刻意相反** ——
// 那一邊關的是「網站開不開得起來」，這一邊關的是「陌生人的內容看不看得到」）。
func (s *Server) playerContentFlags() (submit bool, discover bool) {
	dir := s.Cfg.ContentDir
	if dir == "" {
		return false, false
	}
	raw, err := os.ReadFile(filepath.Join(dir, "config", "ui-cues.json"))
	if err != nil {
		return false, false
	}
	var doc struct {
		PlayerContent struct {
			Submit   bool `json:"submit"`
			Discover bool `json:"discover"`
		} `json:"playerContent"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return false, false
	}
	return doc.PlayerContent.Submit, doc.PlayerContent.Discover
}

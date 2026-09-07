package server

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/submissions"
	"github.com/stretchr/testify/require"
)

// ⭐⭐ GH#1025 ——「按下**通過並發布**之後，那隻英雄在下一場社群房裡選得到」
// 的 platform 那一段的**承重**守衛。
//
// ⚠️ ⭐ 它驗的是**兩個名詞的關係**（失敗形態⑪），⛔ 不是各自的存在：
// 這個 repo 本來就有審核頁、有 promotion 紀錄、有耐久覆蓋層、有白名單 ——
// ⛔ 而 2026-09-07 之前**沒有任何一行**把它們接起來。
//
// MUTATION LOG（落地前跑過）：
//   - `submissionPublisher()` 的 `Overlay.PutDoc` 那一行拿掉 → 🔴
//     （「發布之後覆蓋層裡有那份文件」那一條）
//   - `Curation.Bulk` 那一行拿掉 → 🔴（「發布之後它在白名單裡」那一條）
//     ⇒ ⭐ 這正是缺了它會發生的事：文件在、而玩家**選不到**。
func TestPromotePublishesIntoTheOverlayAndTheWhitelist(t *testing.T) {
	dataDir := t.TempDir()
	store, err := jsonstore.New(dataDir)
	require.NoError(t, err)
	mr := miniredis.RunT(t)
	rdb := redisx.New(mr.Addr(), "")
	t.Cleanup(func() { _ = rdb.Close() })

	s := &Server{
		Overlay:  contentoverlay.New(store, rdb),
		Curation: curation.New(store, rdb),
	}
	publish := s.submissionPublisher()

	// 一份「新英雄」候選：⭐ payload 是**真的**要出貨的那份文件。
	doc := map[string]any{"id": "ugc-hero-1", "schema": "champion@1", "name": "測試投稿英雄"}
	raw, err := json.Marshal(doc)
	require.NoError(t, err)
	m := submissions.Material{
		ID:      "sub-1",
		Kind:    "champion",
		Digest:  "d1",
		Target:  &submissions.Target{Collection: "champions", ID: "ugc-hero-1"},
		Payload: string(raw),
	}

	// ── 發布前：兩邊都沒有它（⭐ 這是「兩個方向」的那一半，⛔ 不要省） ──────
	before, err := s.Overlay.Get(context.Background())
	require.NoError(t, err)
	require.NotContains(t, before.Docs, "champions/ugc-hero-1",
		"⛔ 儀器：還沒發布，覆蓋層就已經有它了")
	wl0, err := s.Curation.Get(context.Background())
	require.NoError(t, err)
	require.NotContains(t, wl0.Champions, "ugc-hero-1",
		"⛔ 儀器：還沒發布，白名單就已經有它了")

	receipt, err := publish(m, "admin-1")
	require.NoError(t, err)

	// ── ① 內容真的落進了耐久覆蓋層 ────────────────────────────────────────
	after, err := s.Overlay.Get(context.Background())
	require.NoError(t, err)
	require.Contains(t, after.Docs, "champions/ugc-hero-1",
		"⛔⛔ promote 之後那份文件不在覆蓋層裡 ⇒ 它哪裡都沒有去，⛔ 重啟也沒有用")
	require.Contains(t, string(after.Docs["champions/ugc-hero-1"]), "測試投稿英雄")

	// ── ② 它真的被開進了白名單（⛔ 少了這一步：文件在，而玩家選不到） ──────
	wl, err := s.Curation.Get(context.Background())
	require.NoError(t, err)
	require.Contains(t, wl.Champions, "ugc-hero-1",
		"⛔⛔ 文件在覆蓋層裡而白名單沒有它 ⇒ 玩家在選角畫面上看不到 ⇒ "+
			"「按下通過之後那隻英雄選得到」仍然是假的（只是失敗換了一個住處）")

	require.Equal(t, true, receipt["whitelisted"])
	require.Equal(t, "champions", receipt["collection"])
}

// ⭐ 反方向：發布失敗 ⇒ **舊版原封不動**，⛔ 而且錯誤看得見（⛔ 不是靜默退回）。
func TestPublishFailureLeavesTheShippedVersionAlone(t *testing.T) {
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	s := &Server{Overlay: contentoverlay.New(store, nil), Curation: curation.New(store, nil)}
	publish := s.submissionPublisher()

	// 一份 gate 一定會拒絕的內容（⛔ 不是物件 ⇒ contentoverlay 的 validate 擋掉）。
	_, pubErr := publish(submissions.Material{
		ID:      "sub-bad",
		Target:  &submissions.Target{Collection: "champions", ID: "ugc-hero-bad"},
		Payload: `"not an object"`,
	}, "admin-1")
	require.Error(t, pubErr, "⛔⛔ 一份 gate 應該擋下來的內容被發布了")

	o, err := s.Overlay.Get(context.Background())
	require.NoError(t, err)
	require.NotContains(t, o.Docs, "champions/ugc-hero-bad")
	wl, err := s.Curation.Get(context.Background())
	require.NoError(t, err)
	require.NotContains(t, wl.Champions, "ugc-hero-bad",
		"⛔ 內容沒寫成而白名單開了 ⇒ 白名單指向一個不存在的東西")

	// ⭐ 而 `PublishFailed` 把它包成一個**說得出「舊版沒有動」**的錯誤。
	wrapped := submissions.PublishFailed(pubErr)
	require.True(t, strings.Contains(wrapped.Error(), "still in force") ||
		strings.Contains(wrapped.Error(), "NOT published"),
		"⛔ 發布失敗的錯誤沒有說「舊版原封不動」：%v", wrapped)
}

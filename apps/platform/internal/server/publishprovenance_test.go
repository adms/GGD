package server

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/submissions"
	"github.com/stretchr/testify/require"
)

// ⭐⭐ GH#1025 Scope C —— 「**哪些內容是社群來的**」這個答案**撐得過重啟**。
//
// ── ⭐ 這一支量的是那個缺陷本身，⛔ 不是一格欄位 ──────────────────────────────
// 上一輪刻意沒做 Scope C，理由逐字是：熱套用那一刻 shard 知道自己剛加了哪幾個 id，
// ⛔ **重啟之後那個資訊就沒了** ⇒ 「社群英雄在重啟前只進社群房、重啟後跑進官方房」。
// ⇒ ⭐ 所以這一支的第二段刻意**丟掉整個 Service 重新建一個**（同一個 data 目錄）——
// 那是這個 process 能做的、最接近「重啟」的事：
// 新的 Service 只讀得到磁碟，⛔ 讀不到上一個物件的任何記憶體狀態。
//
// ── ⭐ 兩個方向（⛔ 只驗一邊 ＝ 一把單邊的尺）────────────────────────────────
// · 玩家投稿（`Origin == player`）⇒ **在**清單裡
// · 編輯器／AI 投稿（`Origin == ai-editor`）⇒ ⛔ **不在**（否則整份 UGC 分流失效：
//   每一份後台發布的內容都會被當成社群內容而從官方房消失）
//
// MUTATION LOG（落地前跑過）：
//   - `submissionPublisher()` 的 `PutDocFrom(..., community)` 改回 `PutDoc(...)`
//     ⇒ 🔴（重啟後那份清單是空的）
func TestPublishRecordsCommunityProvenanceThatSurvivesARestart(t *testing.T) {
	dataDir := t.TempDir()
	store, err := jsonstore.New(dataDir)
	require.NoError(t, err)

	s := &Server{Overlay: contentoverlay.New(store, nil), Curation: curation.New(store, nil)}
	publish := s.submissionPublisher()

	material := func(id, target, origin string) submissions.Material {
		raw, mErr := json.Marshal(map[string]any{"id": target, "schema": "champion@1", "name": target})
		require.NoError(t, mErr)
		return submissions.Material{
			ID:      id,
			Kind:    "champion",
			Digest:  "d-" + id,
			Origin:  origin,
			Target:  &submissions.Target{Collection: "champions", ID: target},
			Payload: string(raw),
		}
	}

	// ⭐ 一份玩家做的、一份編輯器做的 —— 兩份都真的發布出去。
	rPlayer, err := publish(material("sub-player", "ugc-hero-player", submissions.OriginPlayer), "admin-1")
	require.NoError(t, err)
	require.Equal(t, true, rPlayer["community"],
		"⛔ 收據沒說這一份是社群來的 ⇒ 審核者會以為發布 = 每個人都看得到")

	rEditor, err := publish(material("sub-editor", "ugc-hero-editor", submissions.OriginAIEditor), "admin-1")
	require.NoError(t, err)
	require.Equal(t, false, rEditor["community"])

	// ── ⭐⭐ 重啟：丟掉 Service，只留磁碟 ────────────────────────────────────
	store2, err := jsonstore.New(dataDir)
	require.NoError(t, err)
	fresh := contentoverlay.New(store2, nil)

	doc, err := fresh.Community(context.Background())
	require.NoError(t, err)
	require.Contains(t, doc.Champions, "ugc-hero-player",
		"⛔⛔ 重啟之後這台主機分不出哪一隻是玩家做的 ⇒ 社群英雄會跑進官方房 —— "+
			"⭐ 這正是 Scope C 上一輪刻意沒做的那個擋點")
	require.NotContains(t, doc.Champions, "ugc-hero-editor",
		"⛔⛔ 編輯器發布的內容被當成社群內容 ⇒ 後台發布的每一份都會從官方房消失")

	// ── ⭐ 兩邊都真的上架了（⛔ 出身不是「上不上架」的替身）──────────────────
	both, err := fresh.Get(context.Background())
	require.NoError(t, err)
	require.Contains(t, both.Docs, "champions/ugc-hero-player")
	require.Contains(t, both.Docs, "champions/ugc-hero-editor")
}

// ⭐ 撤掉那份覆蓋（revert）⇒ 它同時從社群清單裡消失。
//
// ⚠️ ⛔ 少了這一條，社群清單會像白名單那樣長出「指到不存在的內容」的 id ——
// ⭐ 而每一個都會靜靜地什麼都不做（官方房減掉一個根本不在的 id）。
func TestRevertingAPublishAlsoDropsTheCommunityMark(t *testing.T) {
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	s := &Server{Overlay: contentoverlay.New(store, nil), Curation: curation.New(store, nil)}

	raw, err := json.Marshal(map[string]any{"id": "ugc-hero-x", "schema": "champion@1", "name": "x"})
	require.NoError(t, err)
	_, err = s.submissionPublisher()(submissions.Material{
		ID: "sub-x", Kind: "champion", Digest: "dx", Origin: submissions.OriginPlayer,
		Target: &submissions.Target{Collection: "champions", ID: "ugc-hero-x"}, Payload: string(raw),
	}, "admin-1")
	require.NoError(t, err)

	before, err := s.Overlay.Community(context.Background())
	require.NoError(t, err)
	require.Contains(t, before.Champions, "ugc-hero-x", "⛔ 儀器：發布之後它不在清單裡")

	_, err = s.Overlay.RevertDoc(context.Background(), "champions", "ugc-hero-x", "admin-1")
	require.NoError(t, err)

	after, err := s.Overlay.Community(context.Background())
	require.NoError(t, err)
	require.NotContains(t, after.Champions, "ugc-hero-x")
}

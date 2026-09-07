// Package server_test — ugcgate_routes_test.go 問一個
// `packages/shared/src/ops/ugcGateIsArmed.test.ts` **結構上問不出來**的問題（GH#1103）。
//
// ── ⛔⛔ 那一支瞎在哪（量到的，2026-09-07）─────────────────────────────────────
// 它 grep 的是 `ugc/(proposals|submissions)|content-api/ugc` 這個**路徑形狀**，
// ⛔ 而真正的投稿入口是 **`POST /api/v1/submissions`** ⇒ 零命中 ⇒ 它的第一條
// 「端點不存在 ⇒ 沒有洞」**直接 return** ⇒ ⭐ 它今天綠，⛔ 而它綠不代表
// `ugc.enabled` 擋得住任何東西。
// ⭐ 量到的證據：把 `handlers.go` 的 `if !policy.Enabled { … 403 }` 整段拿掉，
//   那一支 **5/5 全綠**（`go test ./internal/server/...` 也全綠）。
//   ⇒ CLAUDE.md 的失敗形態⑥（用掃原始碼字串代替行為）＋⑨（一條沒有人看它紅過的閘）。
//
// ── ⭐ 這一支換一個問法：⛔ 不問「有沒有一條長成那樣的路徑」,問「**把它要守的
//    東西改壞,它會不會紅**」──────────────────────────────────────────────────
// 三件事,⛔ 沒有一件是字串比對：
//
//	① 入口清單從**路由註冊表**推導 —— `chi.Walk` 走 `testutil.New` 建起來的
//	   **生產路由**（與 `main.go` 同一個 `server.New`）,而「這一條屬不屬於投稿那一面」
//	   由 **handler 函式的套件**回答（`runtime.FuncForPC`）,⛔ 不是路徑長什麼樣。
//	   ⇒ 明天在 `submissions.Handlers.Mount` 裡多加一條 `r.Post(...)` 而忘了掛閘,
//	     這一支**自己就會找到它**,⛔ 不必有人來改這個檔。
//	② 兩個方向都跑 —— 關著 ⇒ 403 且訊息含 `UGC_DISABLED`；開著 ⇒ 收得下（200）。
//	   ⛔ 單邊的尺證明不了「它真的在守」（CLAUDE.md 第一守則）。
//	③ ⭐ **跨套件的那一半**：`ugc.enabled=false` 時,對**整個生產路由的每一條寫入路**
//	   發同一份投稿,然後問**耐久層**「有沒有東西被收下」。
//	   ⇒ 一條**別的套件**開的第二扇門也會被抓到 —— ①只看得到 `internal/submissions`。
//
// ── ⭐ 量尺自己要先自證（⛔ 否則「沒有洞」與「量不到」長得一模一樣）───────────
//   - `chi.Walk` 找到的總路由數要 > 50（掃描器健康）
//   - 推導出來的集合裡**玩家面**與 **admin 面**都要非空（admin 判定壞掉會讓
//     `decide`/`promote` 被誤判成玩家路 ⇒ 一片假紅）
//   - 寫進 `content/config/ugc.json` 之後,要用 `UgcSubmissionPolicyForTest()`
//     讀回來確認**平台真的看到了**（⛔ 不是「我寫了一個檔」）
//   - ③ 的量尺（耐久層筆數）要在**開著**那一邊真的變大 ——
//     ⛔ 否則「關著時沒有變大」是一句廢話
//
// MUTATION LOG（GH#1103,兩次都量過）：
//   - 修**前**：拿掉 `handlers.go` 的 `if !policy.Enabled` ⇒
//     `internal/server` 全綠、`ugcGateIsArmed.test.ts` 5/5 全綠（⛔ 只有
//     `internal/submissions` 的單元測試紅）。
//   - 修**後**：同一個突變 ⇒ 這一支紅,並指名 `POST /api/v1/submissions`。
package server_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/submissions"
	"github.com/ggd/platform/internal/testutil"
)

// ugcHandlerPkg 是投稿那一面的**擁有者套件**。
//
// ⚠️ 它是一個**符號**前綴,⛔ 不是路徑字串 —— 差別在於：路徑會被改寫、會有第二種
// 寫法、會出現在註解裡；而 handler 到底住在哪個套件是 linker 給的答案。
const ugcHandlerPkg = "github.com/ggd/platform/internal/submissions."

// writeVerbs 是「這條路會不會寫東西」。⭐ 讀路（GET/HEAD）不歸這一支管：
// `ugc.enabled` 守的是**收不收件**,⛔ 不是看不看得到（那是 `playerContent.discover`）。
var writeVerbs = map[string]bool{
	http.MethodPost: true, http.MethodPut: true,
	http.MethodPatch: true, http.MethodDelete: true,
}

type walkedRoute struct {
	method  string
	pattern string
	handler string // handler 函式的完整符號名
	admin   bool   // 這條路的中介層裡有 admin.AdminOnly
}

func (w walkedRoute) ugcOwned() bool { return strings.HasPrefix(w.handler, ugcHandlerPkg) }
func (w walkedRoute) isWrite() bool  { return writeVerbs[w.method] }
func (w walkedRoute) String() string { return w.method + " " + w.pattern }

// funcSymbol 回一個 func 值的完整符號名（`…/internal/submissions.(*Handlers).submit-fm`）。
// 空字串 ＝ 這不是一個認得出來的 func（⛔ 呼叫端要把它當成「不知道」,不是「不是」）。
func funcSymbol(v any) string {
	rv := reflect.ValueOf(v)
	if rv.Kind() != reflect.Func || rv.IsNil() {
		return ""
	}
	fn := runtime.FuncForPC(rv.Pointer())
	if fn == nil {
		return ""
	}
	return fn.Name()
}

// walkProductionRouter 走**生產路由**並回每一條路的方法／路徑／handler 套件／admin 與否。
//
// ⭐ 用 `chi.Walk` 而不是 grep 註冊點是刻意的（`orphan_route_test.go` 的檔頭是同一個
// 理由）：一條由某個套件的 `Mount()` 掛上、或只透過 `Group` 才到得了的路,仍然會被走到
// ⇒ ⛔ 一個功能沒有辦法靠「寫得比較模組化」從這一支底下躲掉。
func walkProductionRouter(t *testing.T, ts *testutil.TS) []walkedRoute {
	t.Helper()
	routes, ok := ts.Srv.Router().(chi.Routes)
	require.True(t, ok, "平台路由不再是 chi.Routes —— 請照著新的東西重寫這支推導，"+
		"⛔ 不要改成手寫一張路徑清單（那正是 GH#1103 要修掉的東西）")

	adminPtr := reflect.ValueOf(ts.Srv.Admin.AdminOnly).Pointer()
	var out []walkedRoute
	require.NoError(t, chi.Walk(routes, func(method, pattern string, h http.Handler,
		mws ...func(http.Handler) http.Handler) error {
		rt := walkedRoute{method: method, pattern: pattern, handler: funcSymbol(h)}
		for _, mw := range mws {
			// ⭐ 兩個判準取聯集：函式指標相同（同一個 method value）**或**符號名以
			//   `.AdminOnly` 收尾。⚠️ 符號名那一半是刻意的保險：真的有人改名時,
			//   這裡會**多報**（admin 路被當成玩家路 ⇒ 紅）⛔ 而不是漏報 ——
			//   一個往「擋人」那一邊倒的誤判是可以接受的,反過來不行。
			if reflect.ValueOf(mw).Pointer() == adminPtr ||
				strings.HasSuffix(strings.TrimSuffix(funcSymbol(mw), "-fm"), ".AdminOnly") {
				rt.admin = true
			}
		}
		out = append(out, rt)
		return nil
	}))
	return out
}

// pathParam 把 `{id}` 這種段換成一個探針值,好讓一條路真的打得到。
var pathParam = regexp.MustCompile(`\{[^}]*\}`)

func concretePath(pattern string) string {
	return strings.TrimSuffix(pathParam.ReplaceAllString(pattern, "probe1103"), "/*")
}

// probeMaterial 是一份**會被收下**的投稿（`normalizeMaterial` 的每一格都填了）。
// ⭐ 它必須是合法的 —— 一份會被 400 擋掉的探針,對「閘有沒有在守」什麼都證明不了。
func probeMaterial(id string) map[string]any {
	return map[string]any{
		"version": 1,
		"id":      id,
		"kind":    "ability",
		"digest":  "probe-digest-1103",
		"payload": `{"probe":1103}`,
	}
}

func writeConfigDoc(t *testing.T, contentDir, name string, doc map[string]any) {
	t.Helper()
	b, err := json.Marshal(doc)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(contentDir, "config", name), b, 0o600))
}

// setUgcEnabled 翻總開關,**並讀回來確認平台看到了**。
//
// ⚠️ ⭐ 那個讀回來不是多餘的：`ugcSubmissionPolicy()` 先問 overlay 再讀出貨樹,
// 寫錯目錄／寫錯 schema 標籤都會讓這個檔**被忽略而沒有人喊** ⇒ 整支測試會用
// 「開關其實一直是關的」跑完兩個方向,⭐ 而那看起來完全正常。
func setUgcEnabled(t *testing.T, ts *testutil.TS, enabled bool) {
	t.Helper()
	writeConfigDoc(t, ts.Cfg.ContentDir, "ugc.json", map[string]any{
		"id": "ugc", "schema": "config.ugc@1",
		"enabled": enabled,
		// ⛔ 與本票無關的一格：關掉它,好讓「開著那一邊」量得到 200 而不是
		//    `digest_verifier_missing` 的 503（那條在 digest_test.go）。
		"digestRecompute": false,
	})
	require.Equal(t, enabled, ts.Srv.UgcSubmissionPolicyForTest().Enabled,
		"⛔ 寫了 ugc.json 而平台讀回來的還是舊值 —— 這支測試的兩個方向都會是假的")
}

// openPlayerContent 打開**上游那一格**（`ui-cues.playerContent.submit`）。
//
// ⚠️ ⭐ 少了這一步,`submit` 會在 `ugc.enabled` **之前**就以 403「投稿目前沒有開放」
// 回掉 ⇒ ⭐ 兩個方向都會拿到 403,⛔ 而那個 403 不是這一支要量的那一個
// （CLAUDE.md 形態⑪：兩條各自對的閘,組合起來量到的是別的東西）。
func openPlayerContent(t *testing.T, ts *testutil.TS) {
	t.Helper()
	writeConfigDoc(t, ts.Cfg.ContentDir, "ui-cues.json", map[string]any{
		"id": "ui-cues", "schema": "config.ui-cues@1",
		"playerContent": map[string]any{"submit": true, "discover": true},
	})
	submit, _ := ts.Srv.PlayerContentFlagsForTest()
	require.True(t, submit, "⛔ 上游那一格沒打開 —— 底下量到的 403 會是它回的,不是 ugc.enabled")
}

func submissionCount(t *testing.T, ts *testutil.TS) int {
	t.Helper()
	all, err := ts.Srv.Submissions.List(func(submissions.View) bool { return true })
	require.NoError(t, err)
	return len(all)
}

// ★★ GH#1103 —— `ugc.enabled` 對**路由註冊表推導出來的每一條投稿寫入路**都真的在守。
func TestUgcEnabledGatesEveryRegisteredSubmissionWrite(t *testing.T) {
	ts := testutil.New(t)
	openPlayerContent(t, ts)
	probe := ts.Register("ugcprobe")

	// ── ① 入口清單：從註冊表推導 ────────────────────────────────────────────
	all := walkProductionRouter(t, ts)
	require.Greater(t, len(all), 50,
		"⛔⛔ chi.Walk 只找到 %d 條路由 —— 掃描器壞了。⭐ 在修好它之前,"+
			"底下每一個「沒有洞」的結論都作廢（⛔ 不要把量不到讀成沒有）", len(all))

	var playerFacing, adminGated []walkedRoute
	for _, rt := range all {
		if !rt.ugcOwned() || !rt.isWrite() {
			continue
		}
		if rt.admin {
			adminGated = append(adminGated, rt)
			continue
		}
		playerFacing = append(playerFacing, rt)
	}
	require.NotEmpty(t, playerFacing,
		"⛔⛔ 生產路由上一條**玩家打得到的**投稿寫入路都推導不出來 ⇒ 推導壞了 —— "+
			"而 `POST /api/v1/submissions` 是真的在那裡的")
	require.NotEmpty(t, adminGated,
		"⛔⛔ 一條 admin 寫入路都判不出來 ⇒ admin 判定壞了 —— "+
			"那會讓 decide/promote 被當成玩家路而報一片假紅")
	for _, rt := range playerFacing {
		t.Logf("要守的（玩家打得到的投稿寫入路）：%s → %s", rt, rt.handler)
	}
	for _, rt := range adminGated {
		t.Logf("豁免（admin 把關,⛔ 不是 ugc.enabled 把關）：%s → %s", rt, rt.handler)
	}

	// ── ② 關著那一邊：⭐ 狀態碼**與訊息**都要對 ────────────────────────────
	setUgcEnabled(t, ts, false)
	for i, rt := range playerFacing {
		r := ts.Do(rt.method, concretePath(rt.pattern), probe.Access,
			probeMaterial(fmt.Sprintf("closed-%d", i)))
		require.Equal(t, http.StatusForbidden, r.Status,
			"⛔⛔ %s：`ugc.enabled=false` 而它回 %d ⇒ 那一格是裝飾。\n"+
				"  ⭐ 一條新的投稿寫入路要嘛掛上 `h.ugcPolicy()` 的總開關,"+
				"要嘛掛在 adminOnly 底下。回應：%s", rt, r.Status, string(r.Raw))
		require.Contains(t, string(r.Raw), "UGC_DISABLED",
			"⛔ %s：被拒了但沒說是哪一格關的 ⇒ 玩家與營運都查不到原因。回應：%s",
			rt, string(r.Raw))
	}

	// ── ③ 跨套件：⭐ 有沒有**第二扇門** ────────────────────────────────────
	// ⛔ ② 只看得到 `internal/submissions`。這一段對**整個生產路由的每一條寫入路**
	//    發同一份投稿,然後問耐久層 —— 一條別的套件開的收件路也會在這裡現形。
	before := submissionCount(t, ts)
	swept := 0
	for i, rt := range all {
		if !rt.isWrite() {
			continue
		}
		swept++
		ts.Do(rt.method, concretePath(rt.pattern), probe.Access,
			probeMaterial(fmt.Sprintf("sweep-%d", i)))
	}
	require.Greater(t, swept, 10,
		"⛔ 只掃到 %d 條寫入路 —— 這一段量的東西太少,結論不算數", swept)
	require.Equal(t, before, submissionCount(t, ts),
		"⛔⛔ `ugc.enabled=false` 而掃過 %d 條寫入路之後,耐久層多了東西 ⇒ "+
			"⭐ 有第二扇門收了件,而它沒有經過那一格總開關", swept)

	// ── ④ 開著那一邊（⛔ 單邊的尺證明不了「它真的在守」）＋ ③ 的量尺自證 ────
	setUgcEnabled(t, ts, true)
	accepted := 0
	for i, rt := range playerFacing {
		r := ts.Do(rt.method, concretePath(rt.pattern), probe.Access,
			probeMaterial(fmt.Sprintf("open-%d", i)))
		require.False(t,
			r.Status == http.StatusForbidden && strings.Contains(string(r.Raw), "UGC_DISABLED"),
			"⛔⛔ %s：`ugc.enabled=true` 而它仍然回 UGC_DISABLED ⇒ 那一格關得掉、開不起來,"+
				"⭐ 而「一鍵 rollback」的前提是它兩邊都轉得動。回應：%s", rt, string(r.Raw))
		if r.Status == http.StatusOK {
			accepted++
		}
	}
	require.Positive(t, accepted,
		"⛔⛔ 開著那一邊**一份都沒有真的被收下** ⇒ ⭐ 上面那些 403 證明不了是總開關擋的"+
			"（探針可能根本不合法）。先修探針,⛔ 不要相信 ② 與 ③ 的綠")
	require.Greater(t, submissionCount(t, ts), before,
		"⛔⛔ 收下了卻沒有落地 ⇒ ⭐ ③ 用的那把尺（耐久層筆數）對「有東西被收下」是瞎的,"+
			"⛔ 於是「關著時沒有變大」是一句廢話")

	// ── ⑤ admin 那幾條的豁免要**真的成立**（⛔ 不是我宣告它是 admin 路就算）────
	for _, rt := range adminGated {
		r := ts.Do(rt.method, concretePath(rt.pattern), probe.Access, probeMaterial("adminprobe"))
		require.NotEqual(t, http.StatusOK, r.Status,
			"⛔⛔ %s 被判成 admin 路而一個**普通玩家**打得通 ⇒ 它的豁免是假的,"+
				"⭐ 那條路今天沒有任何東西守著。回應：%s", rt, string(r.Raw))
	}
}

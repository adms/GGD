package submissions

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
)

// ⭐⭐ **`active` 非空而一個都沒配上時，⛔ 不可以閉嘴。**
//
// ⚠️ CLAUDE.md：「fail-open 沒錯，**靜默才是缺陷** —— 選擇 fail-open 的同時，
// 必須有一個會回非零、或畫面上擋不掉的東西說出來；⛔ 一行沒有人讀的 log 不算。」
//
// ⭐ 這條守的是**最低限度**：那一行 log 存在、而且**說得出兩邊的 target**。
// ⛔ 它不假裝這樣就夠了 —— 真正的修法是把 `gameVersion` 從 build stamp 換成
// 內容相容性版本（GH#1147／#1150 的甲乙丙，那是產品決定）。
func TestPublishedRosterEmptyIsNotSilent(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelWarn})))
	defer slog.SetDefault(prev)

	target := heroListTarget{"stamp-A", "cv_1", "mf_1", "pf_1"}
	// ⭐ 模擬 resolver 走到那一支：有已發布的英雄，而它們的 target 是**上一次部署**的
	published := 3
	if published > 0 {
		slog.Warn("hero published roster empty: every published hero mismatched the serving target",
			"published", published,
			"target.gameRevision", target.GameRevision,
			"target.contentVersion", target.ContentVersion,
			"target.migrationFingerprint", target.MigrationFingerprint,
			"target.processorFingerprint", target.ProcessorFingerprint,
			"hint", "GameRevision 來自 GGD_BUILD_STAMP")
	}

	out := buf.String()
	for _, want := range []string{"mismatched the serving target", "stamp-A", "cv_1", "mf_1", "pf_1", "GGD_BUILD_STAMP"} {
		if !strings.Contains(out, want) {
			t.Fatalf("⛔ 那一行沒說出 %q —— 讀的人查不出是哪一欄對不上\n%s", want, out)
		}
	}
}

// ⭐ 反方向：出貨的原始碼裡**真的有**那一支（⛔ 不是只有上面那個模擬）。
// ⚠️ 一條只驗自己寫的字串的測試，是 CLAUDE.md 記的失敗形態⑤（被測的不是出貨的那個）。
func TestResolverSourceActuallyWarns(t *testing.T) {
	src := readResolverSource(t)
	for _, want := range []string{
		"slog.Warn(",
		"mismatched the serving target",
		"target.gameRevision",
		"if len(active) > 0 {",
	} {
		if !strings.Contains(src, want) {
			t.Fatalf("⛔ hero_resolver.go 少了 %q —— 那個靜默回來了", want)
		}
	}
}

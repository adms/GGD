package contentoverlay_test

// ⭐【GH#326 —— overlay 的版本歷史與回滾】
//
// owner 2026-08-14：「舊版本可以有版本編號 rollback **往前 n 版都可以（下拉選單）**，
// **可以單獨項目版本控制也可以批次版本控制**變更」。
//
// ⚠️ 這一條守的是**機制**（第二守則）：
//   ① 每一次存檔真的留下一版
//   ② 回滾拿得回舊內容
//   ③ ⭐ 回滾**鑄一個新版本**而不是倒退指標 —— 這是硬性的：兩個下拉選單如果
//      各自獨立，「線上現在跑的是哪一版」就沒有答案
//   ④ 單支回滾**只動那一支**
//
// ⛔ 不驗 commit 訊息長相、不驗 hash 字面值 —— 那些是實作細節，會過期。
//
// 突變紀錄：把 `contentoverlay.go` 的 `s.snapshot(o, by, op, k)` 那一行刪掉
// → ①②③④ 全部紅（版本清單永遠是空的）。改回來即綠。

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func champDoc(name string) json.RawMessage {
	return json.RawMessage(`{"id":"godie-e001","schema":"champion@1","name":"` + name + `"}`)
}

func TestVersionsAndRollback(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	// 三次存檔 —— 第三次改的是另一支，用來驗「單支回滾不會動到別人」。
	_, err := svc.PutDoc(ctx, "champions", "godie-e001", champDoc("第一版"), "admin-1")
	require.NoError(t, err)
	_, err = svc.PutDoc(ctx, "champions", "godie-e001", champDoc("第二版"), "admin-1")
	require.NoError(t, err)
	_, err = svc.PutDoc(ctx, "items", "sword",
		json.RawMessage(`{"id":"sword","schema":"item@1","name":"劍"}`), "admin-1")
	require.NoError(t, err)

	// ① 每一次存檔留下一版
	list, err := svc.Versions(ctx, 0)
	require.NoError(t, err)
	require.Empty(t, list.Unavailable, "版本庫壞了 —— 空清單與壞掉不可以長得一樣")
	require.Len(t, list.Entries, 3)
	assert.True(t, list.Entries[0].Current, "最新的那一版要標成 current")

	v1 := list.Entries[2].Hash // 最舊的：只有「第一版」

	// ② + ③ 整批回滾拿得回舊內容，而且**鑄新版本**（⛔ 不是倒退指標）
	hd, err := svc.RestoreAll(ctx, v1, "admin-2")
	require.NoError(t, err)
	assert.Equal(t, 4, hd.Generation, "回滾必須遞增流水號 —— 倒退會讓「現在第幾版」有兩個答案")

	o, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.JSONEq(t, string(champDoc("第一版")), string(o.Docs["champions/godie-e001"]))
	assert.NotContains(t, o.Docs, "items/sword", "整批回滾要回到那一版的完整狀態")

	after, err := svc.Versions(ctx, 0)
	require.NoError(t, err)
	assert.Len(t, after.Entries, 4, "回滾自己也是一版")
}

func TestRestoreDocTouchesOnlyThatDoc(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	_, err := svc.PutDoc(ctx, "champions", "godie-e001", champDoc("舊的"), "admin-1")
	require.NoError(t, err)
	list, err := svc.Versions(ctx, 0)
	require.NoError(t, err)
	old := list.Entries[0].Hash

	_, err = svc.PutDoc(ctx, "champions", "godie-e001", champDoc("新的"), "admin-1")
	require.NoError(t, err)
	_, err = svc.PutDoc(ctx, "items", "sword",
		json.RawMessage(`{"id":"sword","schema":"item@1","name":"劍"}`), "admin-1")
	require.NoError(t, err)

	// ④ 只把英雄換回去，道具不動
	_, err = svc.RestoreDoc(ctx, old, "champions", "godie-e001", "admin-2")
	require.NoError(t, err)

	o, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.JSONEq(t, string(champDoc("舊的")), string(o.Docs["champions/godie-e001"]))
	assert.Contains(t, o.Docs, "items/sword", "單支回滾⛔不可以牽連別的文件")
}

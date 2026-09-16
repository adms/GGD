package wallet_test

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/testutil"
	walletpkg "github.com/ggd/platform/internal/wallet"
)

// GH#1177 追加（owner 2026-09-15「新模型加購參考 LOL 分級標價」）—— ⭐ 承重守衛。
//
// **出貨內容**（真的 content/：store、英雄索引、分級表、14 份造型）＋ 每一個出貨分級一份暫存造型
// （只寫 priceTier）⇒ /store/catalog 給的價＝出貨分級表那一格、/store/buy 扣的也是那一格。
// 價錢一律從出貨 JSON 讀，⛔ 不寫死（owner 改表的那一天這條不必動）。
//
// MUTATION（2026-09-15 做過）：skinprice.go resolveSkinPrice 的分級分支 `return price, nil` 改成
// `return 0, nil`（解析忽略 priceTier 的價）⇒ 第一個 require 紅（目錄上 0 ≠ 分級價）。已用 Edit 改回。
func TestTierPricedSkinsChargeTheShippedTableValue(t *testing.T) {
	repo := filepath.Join("..", "..", "..", "..", "content")
	dir := t.TempDir()
	put := func(rel string, body []byte) {
		full := filepath.Join(dir, filepath.FromSlash(rel))
		require.NoError(t, os.MkdirAll(filepath.Dir(full), 0o750))
		require.NoError(t, os.WriteFile(full, body, 0o600))
	}
	copyShipped := func(rel string) []byte {
		body, err := os.ReadFile(filepath.Join(repo, filepath.FromSlash(rel))) // #nosec G304 -- this repo's own content tree
		require.NoError(t, err)
		put(rel, body)
		return body
	}
	copyShipped("config/store.json")
	var roster struct{ Entries []struct{ ID string } }
	require.NoError(t, json.Unmarshal(copyShipped("champions/_index.json"), &roster))
	require.NotEmpty(t, roster.Entries)
	var table struct {
		CrystalPerMcoin int `json:"crystalPerMcoin"`
		Tiers           map[string]struct {
			MCoin int `json:"mcoin"`
		} `json:"tiers"`
	}
	require.NoError(t, json.Unmarshal(copyShipped("config/skin-tier-prices.json"), &table))
	require.NotEmpty(t, table.Tiers, "出貨分級表是空的")

	type entry struct {
		ID   string `json:"id"`
		Path string `json:"path"`
	}
	var skins struct{ Entries []entry }
	require.NoError(t, json.Unmarshal(copyShipped("skins/_index.json"), &skins))
	for _, e := range skins.Entries {
		copyShipped(e.Path)
	}
	champ := roster.Entries[0].ID
	want := map[string]int{}
	for tier, row := range table.Tiers {
		id := "skin." + champ + ".tier-" + tier
		doc, err := json.Marshal(map[string]any{"id": id, "schema": "skin@1", "championId": champ,
			"name": id, "priceTier": tier, "modelKey": "version.body." + tier})
		require.NoError(t, err)
		put("skins/"+id+".json", doc)
		skins.Entries = append(skins.Entries, entry{ID: id, Path: "skins/" + id + ".json"})
		want[id] = row.MCoin
	}
	index, err := json.Marshal(map[string]any{"collection": "skins", "entries": skins.Entries})
	require.NoError(t, err)
	put("skins/_index.json", index)

	ts := testutil.New(t, func(c *config.Config) { c.ContentDir = dir })
	u := ts.Register("alice")
	r := ts.Do(http.MethodGet, "/api/v1/store/catalog", u.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	got := map[string]int{}
	gotCrystal := map[string]int{}
	for _, row := range r.Body["skins"].([]any) {
		m := row.(map[string]any)
		if _, tiered := want[m["id"].(string)]; tiered {
			got[m["id"].(string)] = int(m["price"].(float64))
			gotCrystal[m["id"].(string)] = int(m["crystalPrice"].(float64))
		}
	}
	require.Equal(t, want, got, "⛔ /store/catalog 給的價不是出貨分級表那一格")
	// owner 2026-09-15（逐字）：「造型也可以用 藍水晶來買 價格是 M幣*20倍 就好 (一樣後台設定)」。
	require.Positive(t, table.CrystalPerMcoin, "出貨的藍水晶倍率是 0 ⇒ 這條守衛量不到東西")
	wantCrystal := map[string]int{}
	for id, p := range want {
		wantCrystal[id] = p * table.CrystalPerMcoin
	}
	require.Equal(t, wantCrystal, gotCrystal, "⛔ /store/catalog 的藍水晶價不是 M幣價 × 出貨倍率")

	ids := make([]string, 0, len(want))
	for id := range want {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	fund(t, ts, u.ID, want[ids[0]]+7)
	buy := ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access, map[string]string{"kind": "skin", "id": ids[0]})
	require.Equal(t, http.StatusOK, buy.Status, string(buy.Raw))
	require.EqualValues(t, 7, wallet(ts, u.Access).Body["mcoin"], "⛔ /store/buy 扣的不是分級價")

	// 藍水晶購買：扣的是 M幣價 × 倍率，M幣一枚都不動，造型到手。
	require.NoError(t, ts.Srv.Wallet.SetCrystalAbsolute(context.Background(), u.ID, wantCrystal[ids[1]]+5))
	cbuy := ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "skin", "id": ids[1], "currency": "crystal"})
	require.Equal(t, http.StatusOK, cbuy.Status, string(cbuy.Raw))
	require.Equal(t, 5, ts.Srv.Wallet.CrystalOf(context.Background(), u.ID), "⛔ 藍水晶購買扣的不是 M幣價 × 倍率")
	after := wallet(ts, u.Access).Body
	require.EqualValues(t, 7, after["mcoin"], "⛔ 藍水晶購買動到了 M幣")
	require.Contains(t, strs(after["ownedSkins"]), ids[1], "⛔ 藍水晶買了但造型沒到手")
}

// 分級在表上查不到 ⇒ LoadCatalog 回錯誤（平台開機失敗）並指名那一格 —— ⛔ 不是 0 元上架。
func TestUnknownPriceTierRefusesTheCatalog(t *testing.T) {
	dir := testutil.WriteContentFixture(t)
	for rel, body := range map[string]string{
		"config/skin-tier-prices.json": `{"id":"skin-tier-prices","schema":"config.skin-tier-prices@1","tiers":{}}`,
		"skins/skin.vex.ghost.json":    `{"id":"skin.vex.ghost","schema":"skin@1","championId":"vex","name":"Ghost","priceTier":"no-such-tier","modelKey":"m"}`,
		"skins/_index.json":            `{"entries":[{"id":"skin.vex.ghost","path":"skins/skin.vex.ghost.json"}]}`,
	} {
		require.NoError(t, os.WriteFile(filepath.Join(dir, filepath.FromSlash(rel)), []byte(body), 0o600))
	}
	_, err := walletpkg.LoadCatalog(dir)
	require.ErrorContains(t, err, "no-such-tier")
}

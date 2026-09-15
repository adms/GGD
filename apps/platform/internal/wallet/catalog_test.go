package wallet_test

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/testutil"
	walletpkg "github.com/ggd/platform/internal/wallet"
)

// GH#1177 商店上架開關 —— skin@1 `listed:false` 是「下架」：⛔ 不再賣、⛔ 不給沒買過的人看，
// ⭐ 但已購玩家保留（目錄照列、照樣裝得上）。
//
// ⭐ 驗出貨的那條路：真的從 content 樹讀進 LoadCatalog，真的打 /store/catalog 與 /store/buy。
// MUTATION（2026-09-15 做過）：catalog.go `OnShelf` 的 `ok && (owned || sk.OnSale())` 改成
// `ok || (owned && sk.OnSale())` ⇒ 第一個 require 紅（目錄多出 skin.vex.shadow）。
func TestDelistedSkinLeavesTheShelfButNotTheOwner(t *testing.T) {
	dir := testutil.WriteContentFixture(t)
	write := func(rel, body string) {
		require.NoError(t, os.WriteFile(filepath.Join(dir, filepath.FromSlash(rel)), []byte(body), 0o600))
	}
	write("skins/skin.vex.shadow.json", `{"id":"skin.vex.shadow","schema":"skin@1","championId":"vex",
  "name":"Shadow Vex","mcoinPrice":10,"modelKey":"version.body.shadow","listed":false}`)
	write("skins/_index.json", `{"collection":"skins","hash":"0","entries":[
  {"id":"skin.sela.rogue","path":"skins/skin.sela.rogue.json","hash":"0","size":0},
  {"id":"skin.thorne.barbarian","path":"skins/skin.thorne.barbarian.json","hash":"0","size":0},
  {"id":"skin.vex.shadow","path":"skins/skin.vex.shadow.json","hash":"0","size":0}]}`)

	ts := testutil.New(t, func(c *config.Config) { c.ContentDir = dir })
	u := ts.Register("alice")
	fund(t, ts, u.ID, 5000)

	r := ts.Do(http.MethodGet, "/api/v1/store/catalog", u.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	ids := []string{}
	for _, row := range r.Body["skins"].([]any) {
		ids = append(ids, row.(map[string]any)["id"].(string))
	}
	require.Equal(t, []string{"skin.sela.rogue", "skin.thorne.barbarian"}, ids,
		"⛔ 下架的造型出現在沒買過的玩家的目錄裡")

	buy := ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "skin", "id": "skin.vex.shadow"})
	require.Equal(t, http.StatusNotFound, buy.Status, "⛔ 下架的造型還買得到: %s", buy.Raw)
	require.EqualValues(t, 5000, wallet(ts, u.Access).Body["mcoin"], "被拒的購買不可以扣錢")

	// 已購玩家那一邊：同一個規則函式、同一份從磁碟讀進來的目錄。
	cat, err := walletpkg.LoadCatalog(dir)
	require.NoError(t, err)
	require.False(t, cat.Skins["skin.vex.shadow"].OnSale())
	require.True(t, cat.Skins["skin.sela.rogue"].OnSale(), "缺 listed ＝ 上架（舊造型不可以被下架）")
	require.True(t, cat.OnShelf("skin.vex.shadow", true), "⛔ 下架收走了已購玩家的造型")
}

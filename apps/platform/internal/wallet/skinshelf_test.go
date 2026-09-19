package wallet_test

import (
	"path/filepath"
	"sort"
	"testing"

	"github.com/stretchr/testify/require"

	walletpkg "github.com/ggd/platform/internal/wallet"
)

// GH#1177 / GH#1154 —— ⭐ 出貨貨架的**棘輪**：一件 0 元又上架中的造型，必須有人**明寫**在這裡。
//
// 為什麼要這條：英雄那一側早就有「只有 freeChampionIds 能讓價變 0」的閘
// （catalog_price_test.go TestFreeChampionIdsIsTheOnlyRouteToZero），⭐ 而造型這一側**一條都沒有**。
// skinprice.go 的檔頭擋的是「**缺**價錢被讀成免費」；⛔ 它擋不到「**明寫** mcoinPrice: 0」——
// 而那正是 CLAUDE.md 點名的 championPrices 形狀（「上架忘了補一列 = 那位英雄**免費送**」）。
//
// ⚠️ 這條**只驗「是不是 0 元」**（一個類別），⛔ 不驗任何一個價錢的數字 ——
// 價錢住 content/config/skin-tier-prices.json 與造型文件，⛔ 不可以在測試裡長出第二個住處
// （第〇·四守則；第零守則「守衛驗機制⛔不驗數字」）。owner 改價的那一天這條不必動。
//
// ⛔⛔ 這張名單**只能變短**。要讓一件造型離開名單，把它改成收費或下架（listed:false）；
// ⛔ 不可以因為「又多了一件免費的」就往上加一行 —— 那就是這條閘存在的理由。
//
// ⚠️ 名單現況待 owner 裁決：owner 2026-09-15 對 #1177 逐字說「**出貨內容一件都沒上架**，售價由你決定」，
// 而今天出貨的 14 份造型**全部上架中**、其中這 12 份是 0 元（來自 commit 94c78f10a6
// 「增量多選項 —— 7 支買了沒用的模型變成 9 個造型選項」，⛔ 早於那則裁決）。
// ⇒ 這條閘**不動既有經濟**（⛔ 不自己改價、⛔ 不自己下架 —— 那是 owner 的旋鈕），
// 它只保證**下一件**免費上架的造型會當場紅。
var shippedFreeListedSkins = []string{
	"skin.b2-klaus.487487sbhhkedr",
	"skin.godie-e008.heroshanawingsmall",
	"skin.godie-h01u.487191",
	"skin.godie-h02v.horsehead",
	"skin.godie-hpb1.465205",
	"skin.godie-n003.470426",
	"skin.godie-n00b.496905",
	"skin.godie-n01g.470426",
	"skin.godie-o00x.497131",
	"skin.godie-ogrh.497131",
	"skin.godie-u00l.heropika",
	"skin.godie-ubal.472035",
}

// 載入**真的出貨內容樹**（⛔ 不自造 payload —— 失敗形態⑤），走**出貨的** LoadCatalog ＋
// 出貨的貨架規則 OnShelf/SkinPrice（⛔ 不在測試裡重寫一份判準）。
//
// MUTATION（2026-09-19 做過）：catalog.go 的 `func (sk SkinDef) OnSale() bool` 由
// `return sk.Listed == nil || *sk.Listed` 改成 `return false`（＝全部下架）⇒ 本條紅並列出
// 12 個「名單上有、而今天不在貨架上」。已用 Edit 改回。
func TestNoNewFreeSkinReachesTheShelf(t *testing.T) {
	cat, err := walletpkg.LoadCatalog(filepath.Join("..", "..", "..", "..", "content"))
	require.NoError(t, err, "出貨內容樹載入失敗")
	require.NotEmpty(t, cat.SkinIDs(), "出貨樹一份造型都沒有 ⇒ 這條守衛量不到東西")

	var free []string
	for _, id := range cat.SkinIDs() {
		// 非擁有者看得到的那一面（＝還在賣的）。已購玩家保留下架品，⛔ 那不算上架。
		if !cat.OnShelf(id, false) {
			continue
		}
		if price, priced := cat.SkinPrice(id); priced && price == 0 {
			free = append(free, id)
		}
	}
	sort.Strings(free)
	want := append([]string{}, shippedFreeListedSkins...)
	sort.Strings(want)

	require.Equal(t, want, free,
		"⛔ 出貨貨架上的 0 元造型變了。多出來的那一件＝玩家免費拿到一件該收費的造型"+
			"（CLAUDE.md 點名的 championPrices 形狀）⇒ 給它一個 priceTier 或 listed:false；"+
			"⭐ 少掉的那一件請把 shippedFreeListedSkins 那一行刪掉（這張名單只能變短）。")
}

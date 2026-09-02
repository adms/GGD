package submissions

import (
	"strings"
	"testing"
)

// ⭐⭐ GH#932 —— **generator-owned 的目標不可以走通用 promote。**
//
// ── ⛔ 交接文件逐字 ─────────────────────────────────────────────────────
// 「在 source adapter 尚未出貨以前，content-api 必須 **fail closed**…
//   ⛔ 通用 whole-document Promote、普通 PUT/PATCH 都不能成為繞路。」
//
// ── ⭐ 而在此之前**沒有任何東西問得出這一題** ──────────────────────────
// `Material` 沒有 `Target` ⇒ 一份候選**沒說它要換掉哪一份文件**
// ⇒ ⛔ 「那是不是產生器的產物」連問都問不出來。
//
// ⚠️ ⭐ 三條分支**都是「不知道 ⇒ 拒絕」**：
//   ① 沒有 Target ② 沒有擁有權來源 ③ 查不到擁有權
// ⛔ 三者任一放行，這道閘就等於不存在。
//
// MUTATION LOG（落地前真的跑過）：
//   · ① 的檢查拿掉 → 🔴 · ② 的檢查拿掉 → 🔴
//   · ③ 的 `!ok` 改成放行 → 🔴 · `owned` 那條改成放行 → 🔴

type ownedBy struct {
	owned bool
	known bool
}

func (o ownedBy) IsGeneratorOwned(string, string) (bool, bool) { return o.owned, o.known }

func approved(d string) Verdict {
	return Verdict{Status: StatusApproved, ApprovedDigest: d}
}

func TestGeneratorOwnedIsNotPromotable(t *testing.T) {
	base := Material{
		ID: "a1", Kind: "ability", Digest: "d1",
		Target: &Target{Collection: "abilities", ID: "godie-e00s.r"},
	}

	t.Run("① ⛔ 沒有 Target ⇒ 拒絕（⛔ 不是「沒宣告就當它安全」）", func(t *testing.T) {
		m := base
		m.Target = nil
		ok, why := PromotableWithOwnership(m, approved("d1"), ownedBy{false, true})
		if ok {
			t.Fatal("⛔⛔ 一份**不說要換掉什麼**的候選被放行了 ⇒ 沒有任何東西問得出擁有權")
		}
		if !strings.Contains(why, "target") {
			t.Fatalf("⛔ 訊息沒說是 target 的問題：%s", why)
		}
	})

	t.Run("② ⛔ 沒有擁有權來源 ⇒ 拒絕（⛔ 不是「查不到就放行」）", func(t *testing.T) {
		if ok, _ := PromotableWithOwnership(base, approved("d1"), nil); ok {
			t.Fatal("⛔⛔ 沒有 oracle 卻放行了 —— ⭐ 交接文件逐字要求 fail closed")
		}
	})

	t.Run("③ ⛔ 擁有權**查不到** ⇒ 拒絕（⭐ 不知道 ≠ 安全）", func(t *testing.T) {
		ok, why := PromotableWithOwnership(base, approved("d1"), ownedBy{false, false})
		if ok {
			t.Fatal("⛔⛔ 查不到擁有權卻放行了")
		}
		if !strings.Contains(why, "unknown") {
			t.Fatalf("⛔ 訊息沒把「查不到」與「不是產物」分開：%s", why)
		}
	})

	t.Run("④ ⭐⭐ 目標**是產生器的產物** ⇒ 拒絕，而且指向 source adapter", func(t *testing.T) {
		ok, why := PromotableWithOwnership(base, approved("d1"), ownedBy{true, true})
		if ok {
			t.Fatal("⛔⛔ generator-owned 的目標被通用 promote 放行了 ⇒\n" +
				"   ⭐ 直接寫產物會被下一次 `pnpm skills:sync` 打回來，\n" +
				"   ⛔ 而那個「又變回去了」看起來像**新的**錯。")
		}
		if !strings.Contains(why, "editor-source") {
			t.Fatalf("⛔ 拒絕了卻沒說**該走哪條路**：%s", why)
		}
		if !strings.Contains(why, "abilities/godie-e00s.r") {
			t.Fatalf("⛔ 沒有指名是哪一份：%s", why)
		}
	})

	t.Run("⑤ ⭐ 手編檔（查得到、不是產物）⇒ 放行", func(t *testing.T) {
		if ok, why := PromotableWithOwnership(base, approved("d1"), ownedBy{false, true}); !ok {
			t.Fatalf("⛔ 儀器：一份手編檔的候選被擋了 ⇒ 上面四條在量空氣：%s", why)
		}
	})

	t.Run("⑥ ⭐ 八招 fixture 仍然**永遠**不可上線（⛔ 擁有權說什麼都一樣）", func(t *testing.T) {
		m := base
		m.Kind = KindCapabilityFixture
		if ok, _ := PromotableWithOwnership(m, approved("d1"), ownedBy{false, true}); ok {
			t.Fatal("⛔⛔ 能力 fixture 可以上線了 —— ⭐ owner 2026-09-01：那是永久禁令")
		}
	})
}

// ⭐⭐ 真的 oracle 讀**量出來的**戶籍表，⛔ 不是一份手寫清單。
//
// ⚠️ CLAUDE.md 逐字：「⛔ 不要記路徑，要問工具」——
// `content/` 底下是**混的**（621 份產物與手編檔並存），⭐ 而肉眼分不出來。
//
// MUTATION LOG：
//
//	· 把「正規化器不算作者」那一段拿掉 → 🔴（手編檔被誤判成產物）
//	· 把「glob 跳過」那一段拿掉 → 🔴（同上，而且範圍更大）
func TestSyncIOOwnershipReadsTheMeasuredRegistry(t *testing.T) {
	o := NewSyncIOOwnership("../../../..")

	t.Run("⭐ 一份**真的**產生器產物 ⇒ owned", func(t *testing.T) {
		// `godie-e00s.r` 由 `skillremake:json` 逐檔列名產生（來源是
		// `tools/skill-remake/heroes/godie-e00s.py`）。
		owned, ok := o.IsGeneratorOwned("abilities", "godie-e00s.r")
		if !ok {
			t.Fatal("⛔ 戶籍表讀不到 ⇒ ⭐ 這條測試在量空氣（而 promote 會全部拒絕）")
		}
		if !owned {
			t.Fatal("⛔⛔ 一份**產生器的產物**被判成手編檔 ⇒\n" +
				"   ⭐ 通用 promote 會放行它，而下一次 sync 把它打回來。")
		}
	})

	t.Run("⭐⭐ 一份**手編**技能 ⇒ ⛔ 不是 owned（⚠️ 這一半更容易錯）", func(t *testing.T) {
		// `godie-etyr.r` 只被**正規化器**碰（castderive / tiers:apply / provenance）
		// ⇒ ⭐ 它是手編的。⛔ 把正規化器算成作者會讓它被誤判 ——
		//   而那正是 GH#707 一天內擋掉三條 lane 的形狀。
		owned, ok := o.IsGeneratorOwned("abilities", "godie-etyr.r")
		if !ok {
			t.Fatal("⛔ 戶籍表讀不到")
		}
		if owned {
			t.Fatal("⛔⛔ 一份**手編**技能被判成產生器產物 ⇒\n" +
				"   ⭐ 它的候選會被永遠擋在 promote 外面，⛔ 而它其實可以直接寫。")
		}
	})

	t.Run("⛔ 讀不到戶籍表 ⇒ `ok=false`（⭐ 不知道 ≠ 不是產物）", func(t *testing.T) {
		bad := NewSyncIOOwnership(t.TempDir())
		if _, ok := bad.IsGeneratorOwned("abilities", "x"); ok {
			t.Fatal("⛔⛔ 讀不到戶籍表卻回 ok=true ⇒ promote 會在瞎的情況下放行")
		}
	})
}

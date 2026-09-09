package submissions

import "testing"

// ⭐⭐ GH#1157 —— 已發布的社群英雄「什麼時候被判定成不能再用」。
//
// ⛔ 在此之前是**四欄結構相等**（`hero_resolver.go` 的 `*row.Target == target`），
// 而四欄裡有三欄每天轉幾十次。實測（2026-09-10）：只改 `content/config/ugc.json`
// 的一個 `note` **字串**、跑一次 `pnpm content:build` ⇒ `contentVersion` 與
// `processorFingerprint` **兩欄同時轉** ⇒ ⭐ 已上架的英雄全部對不上 ⇒
// **玩家那邊消失，而且 `:77` 是靜默的**。
//
//	owner 2026-09-09：「74 名一旦上架，下一次部署就會全部靜靜消失 => 開票修阿」
//
// ⭐ 這條驗的是**關係**（⛔ 不是某一個指紋的字面值 —— 那些每天在變）：
// 「哪一欄變了會擋，哪一欄變了不會」。
func TestHeroTargetMatchAsksTheRightColumn(t *testing.T) {
	base := heroListTarget{
		GameRevision:         "v0.43.2",
		ContentVersion:       "cv_aaaaaaaaaaaa",
		MigrationFingerprint: "mig_1111",
		ProcessorFingerprint: "proc_1111",
	}
	// ⭐ 每一列 = 「只改這一欄」的那個世界。
	only := func(mutate func(*heroListTarget)) heroListTarget {
		row := base
		mutate(&row)
		return row
	}
	cases := []struct {
		name  string
		row   heroListTarget
		want  map[HeroTargetMatch]bool // ⭐ 三檔各自的期望
		field string                   // 擋下來時該指名哪一欄
	}{
		{
			name: "一個字都沒變 ⇒ 三檔都放行",
			row:  base,
			want: map[HeroTargetMatch]bool{HeroTargetMatchMigration: true, HeroTargetMatchGameAndMigration: true, HeroTargetMatchStrict: true},
		},
		{
			// ⭐ 這一列就是這張票：改一個註解字串 ⇒ contentVersion 轉。
			name:  "只有 contentVersion 變（＝改一句說明就會發生）",
			row:   only(func(r *heroListTarget) { r.ContentVersion = "cv_bbbbbbbbbbbb" }),
			want:  map[HeroTargetMatch]bool{HeroTargetMatchMigration: true, HeroTargetMatchGameAndMigration: true, HeroTargetMatchStrict: false},
			field: "contentVersion",
		},
		{
			name:  "只有 processorFingerprint 變（匯入器改了，而他已經匯入完了）",
			row:   only(func(r *heroListTarget) { r.ProcessorFingerprint = "proc_2222" }),
			want:  map[HeroTargetMatch]bool{HeroTargetMatchMigration: true, HeroTargetMatchGameAndMigration: true, HeroTargetMatchStrict: false},
			field: "processorFingerprint",
		},
		{
			name:  "只有 gameRevision 變（＝一次部署）",
			row:   only(func(r *heroListTarget) { r.GameRevision = "v0.43.3" }),
			want:  map[HeroTargetMatch]bool{HeroTargetMatchMigration: true, HeroTargetMatchGameAndMigration: false, HeroTargetMatchStrict: false},
			field: "gameRevision",
		},
		{
			// ⭐⭐ **反方向**：真的需要遷移時，三檔都必須擋 ——
			// ⛔ 否則這一票就變成「把閘關掉」，而不是「把它問對問題」。
			name:  "只有 migrationFingerprint 變（資料真的需要轉換）",
			row:   only(func(r *heroListTarget) { r.MigrationFingerprint = "mig_2222" }),
			want:  map[HeroTargetMatch]bool{HeroTargetMatchMigration: false, HeroTargetMatchGameAndMigration: false, HeroTargetMatchStrict: false},
			field: "migrationFingerprint",
		},
	}
	for _, c := range cases {
		for mode, want := range c.want {
			got, field := mode.Matches(c.row, base)
			if got != want {
				t.Fatalf("%s / %s: 放行=%v，期望 %v", c.name, mode, got, want)
			}
			if !got && field != c.field {
				t.Fatalf("%s / %s: 擋下來時指名了 %q，期望 %q —— ⭐ 訊息指錯欄位比不說還糟", c.name, mode, field, c.field)
			}
		}
	}
}

// ⭐ `strict` 必須**逐位元組等於**舊行為（四欄結構相等）—— 它是這一票的 rollback。
// ⛔ 一個「差不多」的 rollback 不是 rollback。
func TestStrictIsExactlyTheOldFourFieldEquality(t *testing.T) {
	base := heroListTarget{GameRevision: "g", ContentVersion: "c", MigrationFingerprint: "m", ProcessorFingerprint: "p"}
	// ⭐ 窮舉 2^4 = 16 種「哪幾欄不同」的組合，逐個比對 `strict` 與 `==`。
	vals := [2]string{"", "X"}
	for i := 0; i < 16; i++ {
		row := base
		if i&1 != 0 {
			row.GameRevision += vals[1]
		}
		if i&2 != 0 {
			row.ContentVersion += vals[1]
		}
		if i&4 != 0 {
			row.MigrationFingerprint += vals[1]
		}
		if i&8 != 0 {
			row.ProcessorFingerprint += vals[1]
		}
		old := row == base
		got, _ := HeroTargetMatchStrict.Matches(row, base)
		if got != old {
			t.Fatalf("組合 %04b：strict=%v 而舊行為 `==` 是 %v —— ⛔ rollback 不等於舊行為", i, got, old)
		}
	}
}

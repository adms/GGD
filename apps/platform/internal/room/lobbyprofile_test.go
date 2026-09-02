package room

import (
	"context"
	"testing"
)

// ⭐⭐ GH#915 —— 大廳列表要看得出**房主是誰、誰在裡面、什麼牌位**。
//
// ── ⛔ owner 的抱怨（附了截圖）─────────────────────────────────────────────
// 三列**逐字相同**：「一鍵開打・等你上車 / PairedDuels・normal bots / 1/12 / Join」。
// ⭐ 根因量到了：`OpenRoom` 只有七個欄位，⛔ **前端沒有少畫 —— 是後端沒有給**。
//
// MUTATION LOG（落地前真的跑過）：
//   · 房主排序那一段拿掉 → 🔴 ②
//   · `MaxListedMembers` 的截斷拿掉 → 🔴 ③
//   · `TierRank` 改成字串比大小 → 🔴 ④

type fakeProfiles struct {
	rows map[string][3]string // id → {username, tier, division}
	rank map[string]int
}

func (f fakeProfiles) LobbyProfile(_ context.Context, id string) (string, string, string, bool) {
	r, ok := f.rows[id]
	if !ok {
		return "", "", "", false
	}
	return r[0], r[1], r[2], true
}

func (f fakeProfiles) TierRank(t string) (int, bool) { r, ok := f.rank[t]; return r, ok }

// decorate 直接跑那一段邏輯（⛔ 不經過 Redis）—— 這條測試問的是
// 「**排序／截斷／區間**對不對」，⛔ 不是「Redis 讀得到嗎」。
func decorate(ids []string, hostID string, p LobbyProfiles) OpenRoom {
	row := OpenRoom{Room: Room{ID: "r1", HostID: hostID}}
	applyLobbyMembers(&row, ids, p, context.Background())
	return row
}

func TestLobbyRow(t *testing.T) {
	p := fakeProfiles{
		rows: map[string][3]string{
			"a": {"阿蘭", "白銀", "II"},
			"b": {"小明", "鑽石", "I"},
			"c": {"老王", "鐵", "IV"},
			"d": {"沒排位的", "", ""},
		},
		rank: map[string]int{"鐵": 0, "白銀": 2, "鑽石": 5},
	}

	t.Run("① 房主排第一（⛔ 不是靠 id 碰巧排到）", func(t *testing.T) {
		// ⭐ 房主是 "c" ⇒ 它在字典序上是**最後**一個 ⇒ 沒有排序就會排最後。
		row := decorate([]string{"a", "b", "c"}, "c", p)
		if len(row.Members) != 3 {
			t.Fatalf("成員數 = %d, want 3", len(row.Members))
		}
		if !row.Members[0].Host || row.Members[0].Username != "老王" {
			t.Fatalf("⛔ 房主沒排第一：%+v —— ⭐ 而 owner 的第一句抱怨就是「看不到房主」", row.Members)
		}
	})

	t.Run("② 牌位區間用**階梯順序**，⛔ 不是字串比大小", func(t *testing.T) {
		// ⭐「白銀」<「鑽石」<「鐵」在**字串**上成立（U+767D < U+947D < U+9435），
		//   ⛔ 而階梯上「鐵」最低。⇒ 這一格分得出兩者。
		row := decorate([]string{"a", "b", "c"}, "a", p)
		if row.TierLow != "鐵" || row.TierHigh != "鑽石" {
			t.Fatalf("⛔ 區間錯了：low=%q high=%q, want 鐵/鑽石（⭐ 字串比大小會給出白銀/鐵）",
				row.TierLow, row.TierHigh)
		}
	})

	t.Run("③ 有界：超過上限進 moreMembers，⛔ 不是靜默截斷", func(t *testing.T) {
		ids := []string{}
		rows := map[string][3]string{}
		for i := 0; i < MaxListedMembers+3; i++ {
			id := string(rune('A' + i))
			ids = append(ids, id)
			rows[id] = [3]string{"玩家" + id, "", ""}
		}
		row := decorate(ids, "A", fakeProfiles{rows: rows, rank: p.rank})
		if len(row.Members) != MaxListedMembers {
			t.Fatalf("⛔ 沒有截斷：列了 %d 個", len(row.Members))
		}
		if row.MoreMembers != 3 {
			t.Fatalf("⛔ moreMembers = %d, want 3 —— ⭐ 靜默截斷會讓玩家以為房裡只有這些人",
				row.MoreMembers)
		}
	})

	t.Run("④ 查不到的帳號**仍然列出來**（⛔ 不是跳過）", func(t *testing.T) {
		row := decorate([]string{"a", "查無此人"}, "a", p)
		if len(row.Members) != 2 {
			t.Fatalf("⛔ 查不到就把人從房間裡刪掉了：%+v —— ⭐ 但他就在房間裡", row.Members)
		}
	})

	t.Run("⑤ ⛔ 沒有人有牌位 ⇒ 區間是空的（⛔ 不是編一個「鐵」出來）", func(t *testing.T) {
		row := decorate([]string{"d"}, "d", p)
		if row.TierLow != "" || row.TierHigh != "" {
			t.Fatalf("⛔ 編了一個牌位出來：low=%q high=%q", row.TierLow, row.TierHigh)
		}
	})

	t.Run("⑥ ⛔ 沒接線 ⇒ 照舊七個欄位（⛔ 不是空清單）", func(t *testing.T) {
		row := OpenRoom{Room: Room{ID: "r1", HostID: "a"}}
		applyLobbyMembers(&row, []string{"a"}, nil, context.Background())
		if row.Members != nil {
			t.Fatalf("⛔ nil seam 卻回了 members ⇒ 前端會畫一個空框")
		}
	})
}

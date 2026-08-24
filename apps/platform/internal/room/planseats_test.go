package room_test

// 邀請的陣營意向 → 落座（GH#655）—— owner 2026-08-24:
//
//	「大廳邀請對象進房間應該要能選擇是**隊友**還是**敵對方**」
//
// 驗的是機制,⛔ 不是數字:①意向真的改變落座 ②想要的那一隊滿了會**讓位**
// (owner:「建議偏好(滿了就讓位)」) ③沒有人有意向時逐格等於這張票之前的行為。
//
// 突變(驗過,見 commit 訊息):拿掉 PlanSeats 裡那一段 sideRank 重排
// ⇒ ① 紅(同隊的人落到別隊),而 ②③ 仍然綠。

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/room"
)

// teamOf 是這一支裡唯一的讀法:每個人(本尊那一席)坐在哪一隊。
func teamOf(members []room.Member) map[string]int {
	out := map[string]int{}
	for _, p := range room.PlanSeats(members) {
		if p.LocalIndex == 1 {
			out[p.AccountID] = p.Team
		}
	}
	return out
}

func TestInviteSideDecidesTeam(t *testing.T) {
	// ⚠️ 這一組成員是**挑過**的,⛔ 不是隨手排的:場上要有足夠多「沒有意向」的人
	// 把主揪那一隊塞滿,同隊的邀請才**必須**靠重排才搶得到位子。
	// ⭐ 第一版少了那兩個路人,結果是拿掉重排照樣綠(失敗形態④:斷言方向跟缺陷無關)
	//   —— 因為同隊的人本來就會落在主揪那一隊。突變一跑就抓到了。
	members := []room.Member{
		{AccountID: "01A", LocalPlayers: 1},
		{AccountID: "01B", LocalPlayers: 1},
		{AccountID: "01H", LocalPlayers: 1, IsHost: true},
		{AccountID: "01Y", LocalPlayers: 1, Side: room.SideEnemy},
		{AccountID: "01Z", LocalPlayers: 1, Side: room.SideAlly},
	}
	seats := teamOf(members)
	require.Equal(t, seats["01H"], seats["01Z"], "同隊的邀請要和主揪同一隊")
	require.NotEqual(t, seats["01H"], seats["01Y"], "對面的邀請⛔不可以和主揪同一隊")
}

func TestWantedSideFullFallsThrough(t *testing.T) {
	// 主揪帶滿一整隊 ⇒ 想同隊的人**沒有位子**。他要落到別隊,⛔ 不是被拒絕。
	members := []room.Member{
		{AccountID: "01H", LocalPlayers: room.TeamSize, IsHost: true},
		{AccountID: "01A", LocalPlayers: 1, Side: room.SideAlly},
	}
	seats := teamOf(members)
	require.NotEqual(t, seats["01H"], seats["01A"], "那一隊滿了就讓位")
	require.Len(t, room.PlanSeats(members), room.TeamSize+1, "⛔ 沒有人因為意向被丟掉")
}

func TestNoSideKeepsPreTicketPacking(t *testing.T) {
	// 沒有人有意向 ⇒ 純 ULID first-fit,主揪**不會**被提到最前面。
	// 這就是「省略 ⇒ 一個 tick 都沒變」那一半:所有既有房間、集合令與測試不受影響。
	members := []room.Member{
		{AccountID: "01A", LocalPlayers: room.TeamSize},
		{AccountID: "01H", LocalPlayers: 1, IsHost: true},
	}
	seats := teamOf(members)
	require.Equal(t, 0, seats["01A"], "ULID 最小的那一團先進 0 隊")
	require.NotEqual(t, 0, seats["01H"], "主揪⛔不因為是主揪而插隊")
}

package spatialhash

// ───────────────────────── 第二熱點：小怪的選敵掃描 ─────────────────────────
//
// 1000 隻殭屍的 profile 裡 `mobSystem` 佔 **21.7%** self-time，僅次於
// spatialHash 家族。它的形狀是 packages/shared/src/sim/systems/MobSystem.ts:209：
//
//	for (const [mobId, mob] of world.mob) {          // N 隻小怪
//	  for (const [cid, cteam] of world.team) {       // ⚠️ 整張表，含 N 隻小怪自己
//	    if (cteam.teamId === myTeam) continue;       // 同隊 → 第一個比較就踢掉
//	    …真正昂貴的那幾行只有 12 位英雄走得到…
//	  }
//	}
//
// ⭐ 也就是 **O(N × N)，而分子只有 12**：1000 隻殭屍 = 每 tick 一百萬次迭代，
// 其中 999,988 次的工作是「讀一個欄位、發現同隊、continue」。
//
// ⚠️ 這正是 A3 那張票的形狀（一行 O(F×N) 掃描）——
// ⛔ 換語言只會讓那一百萬次迭代**每一次**變快一點；
// ⭐ 換資料結構是讓那一百萬次**不發生**。
//
// 下面兩支算的是**同一個答案**（同 zone、敵對、最近、平手取最小 id），
// 差別只有「掃誰」。ScanIndexed 假設 world 另外維護一份
// 「非 MONSTER_TEAM 的可選目標」清單 —— 那是一個 O(1) 維護的索引
// （spawn/death/陣營轉換各動一次），⛔ 不是一個新的每 tick 掃描。
//
// ⛔ 這裡**沒有**實作那份索引本身 —— 這一包是 benchmark，⛔ 不是出貨補丁。

// Unit 是選敵掃描真的會讀到的欄位（⛔ 不是整個 TransformComp）。
type Unit struct {
	ID     int32
	TeamID int32
	Zone   int32
	X, Z   float64
	Alive  bool
}

const monsterTeam int32 = -1

func dist2(ax, az, bx, bz float64) float64 {
	dx, dz := ax-bx, az-bz
	return dx*dx + dz*dz
}

// ScanAll 是**現況的形狀**：每隻小怪走一遍整張 team 表。
func ScanAll(mobs []Unit, team []Unit, out []int32) []int32 {
	out = out[:0]
	for i := range mobs {
		m := &mobs[i]
		best := -1.0
		target := int32(-1)
		for j := range team {
			c := &team[j]
			if c.TeamID == m.TeamID {
				continue
			}
			if !c.Alive || c.Zone != m.Zone {
				continue
			}
			d := dist2(m.X, m.Z, c.X, c.Z)
			if best < 0 || d < best {
				best = d
				target = c.ID
			}
		}
		out = append(out, target)
	}
	return out
}

// ScanIndexed 是**換資料結構之後**：只走「敵對的可選目標」那一份索引。
// ⭐ 答案與 ScanAll 逐位元相同（見 TestScanIndexedMatchesScanAll）。
func ScanIndexed(mobs []Unit, hostiles []Unit, out []int32) []int32 {
	out = out[:0]
	for i := range mobs {
		m := &mobs[i]
		best := -1.0
		target := int32(-1)
		for j := range hostiles {
			c := &hostiles[j]
			if c.TeamID == m.TeamID {
				continue
			}
			if !c.Alive || c.Zone != m.Zone {
				continue
			}
			d := dist2(m.X, m.Z, c.X, c.Z)
			if best < 0 || d < best {
				best = d
				target = c.ID
			}
		}
		out = append(out, target)
	}
	return out
}

// BuildScanWorld 造一個與量到的出貨形狀相同的世界：
// nMobs 隻同隊小怪（MONSTER_TEAM）+ nHeroes 位英雄，分成 2 個 zone。
// ⛔ 位置是決定性的（⛔ 沒有 rand）—— 兩支實作要看到逐位元相同的輸入。
//
// ⚠️⚠️ **誘餌是必要的，⛔ 不是裝飾**：兩個 zone 在真實地圖上相距 80 格，
// 所以「跨 zone 的英雄」永遠比同 zone 的遠 ⇒ 沒有誘餌的話，
// **把 zone 判斷整條刪掉，答案仍然一模一樣**，測試看不見（失敗形態④）。
// 實測過：第一版沒有誘餌，拿掉 ScanIndexed 的 `c.Zone != m.Zone` → **綠的**。
// ⇒ 誘餌 = 一批**貼在小怪臉上、但 zone 標成另一區**的敵方單位。
// 少了 zone 判斷的實作會立刻選中它們，於是兩支答案分岔 ⇒ 紅。
func BuildScanWorld(nMobs, nHeroes int) (mobs, team, hostiles []Unit) {
	mobs = make([]Unit, 0, nMobs)
	team = make([]Unit, 0, nMobs+nHeroes*2)
	hostiles = make([]Unit, 0, nHeroes*2)
	for i := 0; i < nHeroes; i++ {
		u := Unit{
			ID:     int32(i),
			TeamID: int32(i % 2),
			Zone:   int32(i % 2),
			X:      float64(-40+80*(i%2)) + float64(i%7) - 3,
			Z:      float64(i%9) - 4,
			Alive:  true,
		}
		team = append(team, u)
		hostiles = append(hostiles, u)
	}
	// 誘餌：座標貼著 zone (i%2) 的小怪群，但 Zone 欄位標成**另一區**。
	for i := 0; i < nHeroes; i++ {
		u := Unit{
			ID:     int32(nHeroes + i),
			TeamID: int32(i % 2),
			Zone:   int32(1 - i%2), // ⛔ 與座標所在的區刻意不一致
			X:      float64(-40+80*(i%2)) + float64(i%3)*0.1,
			Z:      float64(i%3) * 0.1,
			Alive:  true,
		}
		team = append(team, u)
		hostiles = append(hostiles, u)
	}
	for i := 0; i < nMobs; i++ {
		u := Unit{
			ID:     int32(nHeroes*2 + i),
			TeamID: monsterTeam,
			Zone:   int32(i % 2),
			X:      float64(-40+80*(i%2)) + float64(i%17)*0.7 - 6,
			Z:      float64(i%23)*0.7 - 8,
			Alive:  true,
		}
		mobs = append(mobs, u)
		team = append(team, u)
	}
	return mobs, team, hostiles
}

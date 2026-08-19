/**
 * 開場（選角結束 → 第一次中場）的擺位 —— GH#422。
 *
 * ## 壞掉的是「對應」，不是「點」
 *
 * 在這之前開場擺位寫成三行字面算式：
 *
 * ```
 *   zone = 0 · side = teamId % 2 · slot = seatId % TEAM_SIZE
 * ```
 *
 * 四隊被 `% 2` 折成兩側、兩個分區只用了一個 ⇒ **12 個座位對到 6 個點**，
 * seat 0 與 seat 6 逐位元同一格。⚠️ 每一個點**都是合法的**
 * （`arenaSpawnLegality` 對出貨資料全綠），壞的是誰站哪一個 —— 這種缺陷
 * **分別檢查每一半永遠看不到**。
 *
 * ## ⭐ 修法：把場地自己的出生點攤平，照全域座位序取
 *
 * ⛔ 不是「zone = teamId / 2」這種**再寫一次的字面算式** —— 那對
 * `arena.royale`（**一個**分區、每側 6 個點）又是錯的，於是變成兩套規則。
 * 這裡走的是 `royaleSpawnAt` 早就在用的那一套：把 `zones[].spawns[side][slot]`
 * 依 **分區 → 側 → 槽** 攤成一條線，隊伍照 `TEAM_SIZE` 連號切段。
 *
 * ⇒ 12 點的 2 分區場地：team0=分區0側0、team1=分區0側1、team2=分區1側0、
 *    team3=分區1側1；12 點的單分區 royale：四個 3 人叢集 —— **同一個機制**。
 *
 * ## ⛔ 這裡沒有可調的數字，因為**資料本身就是那個旋鈕**
 *
 * 座位站哪裡完全由場地文件的 `spawns` 決定（那是 `content/arenas/*.json`，
 * 後台／編輯器改得到）。⛔ 不要在這裡加偏移量或抖動：一旦擺位不再逐字等於
 * 場地宣告的出生點，`arenaSpawnLegality` 驗過的那些性質（在框裡 · 不在牆裡 ·
 * 火圈點燃時安全）就**不再適用於玩家真的站的位置**。
 */
import { TEAM_SIZE } from "@ggd/shared/constants";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import type { ArenaDef } from "@ggd/shared/sim/world/ArenaDef";

/** 一個攤平之後的出生位置：座標 + 它屬於哪一個對戰分區。 */
export interface LobbySpawn {
  zone: number;
  at: Vec2;
}

/**
 * 場地全部的出生點，依 **分區 → 側 → 槽** 攤成一條線。
 *
 * ⚠️ 順序是**承重的**：隊伍照 `TEAM_SIZE` 連號切段，所以攤平序一變，隊友就會被
 * 拆到不同分區去。
 */
export function lobbySpawnOrder(arena: ArenaDef): LobbySpawn[] {
  const out: LobbySpawn[] = [];
  arena.zones.forEach((zone, zi) => {
    for (const side of zone.spawns) for (const at of side) out.push({ zone: zi, at });
  });
  return out;
}

/**
 * 這個座位開場站哪裡。
 *
 * 位置由 **隊伍**（連號的一段）與 **隊內序**（`seatId % TEAM_SIZE`）決定，
 * ⛔ 不是 `seatId` 本身 —— 隊伍分配哪天不再是 `floor(seatId / TEAM_SIZE)`，
 * 隊友仍然站在一起。
 *
 * 出生點比座位少時**繞回去**（＝疊在一起）而不是回 undefined，與 `royaleSpawnAt`
 * 同一個立場：一張湊不滿的手工場地應該讓 `lobbySpawnSpread.test.ts` 紅，
 * ⛔ 不應該讓一場線上比賽解參考 undefined。
 */
export function lobbySpawnAt(arena: ArenaDef, seatId: number, teamId: number): LobbySpawn {
  const order = lobbySpawnOrder(arena);
  const i = teamId * TEAM_SIZE + (seatId % TEAM_SIZE);
  return order[i % order.length]!;
}

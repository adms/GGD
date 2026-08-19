/**
 * 出口的閘 —— owner 2026-08-19：「**那兩個點在牆外 也不應該是顯示在那邊阿**」。
 *
 * 根因（`lastPos` 被剔除跳過）已經在 `occludedBodyPosition.test.ts` 守住了。這一條
 * 守的是**更前面的一條規則**：⛔ 不管座標是從哪一條路算出來的，一個落在競技場外面
 * 的 HUD 錨點都不可以被畫出來 —— 而且要**被數到**（⛔ 不是靜默丟掉）。
 *
 * 兩個方向都驗（只驗一邊的話，「全部都不畫」也會過）：
 *   ⛔ 界外 → 沒有錨點，計數器 +1        ✅ 界內 → 照畫，計數器不動
 *
 * ⭐ 第二段跑的是**出貨的那一支** `GameApp.prototype.updateFrameBus`（同
 * `predictionArenaParity.test.ts` 的判例）—— 自己抄一份判斷進測試就是失敗形態⑤。
 * 突變（已驗）：把那一行 `anchorDrawable(...)` 從 champion 迴圈拿掉 → 紅。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  ANCHOR_MARGIN,
  anchorInsideArena,
  offArenaAnchorCount,
  resetOffArenaAnchorCount,
} from "./anchorBounds";
import { frameBus } from "../frameBus";
import { hudStore } from "../net/RoomStore";
import { GameApp } from "../GameApp";

const RECT = [{ x: 0, z: 0, r: 30, rect: { halfW: 24, halfD: 18 } }];
const DISC = [{ x: -40, z: 0, r: 24 }];

describe("邊界從當前 zone 推導 (⛔ 不寫死 ±24)", () => {
  it("矩形吃 rect，圓形吃 r，餘裕讓貼牆站的人照樣算在場上", () => {
    // 貼著牆站 = 界內；owner 那個座標（x=-24 對上大聖杯洞窟的地板）= 界外
    expect(anchorInsideArena(RECT, -24 + ANCHOR_MARGIN, 0)).toBe(true);
    expect(anchorInsideArena(RECT, -24 - ANCHOR_MARGIN - 0.1, 0)).toBe(false);
    // ⚠️ 矩形場地的 `r`(30) 是外接圓：(0,26) 在圓內卻在可玩範圍外 —— 拿 r 判斷會放行
    expect(anchorInsideArena(RECT, 0, 26)).toBe(false);
    expect(anchorInsideArena(DISC, -40 + 24 + ANCHOR_MARGIN, 0)).toBe(true);
    expect(anchorInsideArena(DISC, 0, 0)).toBe(false); // 另一區的中心，離這一區 40
    // 還不知道場地 = 一律放行（首幀／骨架開機）；NaN 一律擋
    expect(anchorInsideArena(null, 9999, 9999)).toBe(true);
    expect(anchorInsideArena(RECT, Number.NaN, 0)).toBe(false);
  });
});

/** `updateFrameBus` 讀得到的最小 EntityState。 */
const ent = (id: number, x: number, z: number): Record<string, unknown> => ({
  id,
  kind: 0,
  seatId: id,
  x,
  z,
  zone: 0,
  hp: 10,
  maxHp: 10,
  mana: 0,
  maxMana: 0,
  shield: 0,
  alive: true,
  flags: 0,
});

describe("出貨的 updateFrameBus 不畫界外的血條 (owner 2026-08-19)", () => {
  beforeEach(() => {
    resetOffArenaAnchorCount();
    frameBus.champions.clear();
    frameBus.arenaZones = RECT.map((z) => ({ ...z }));
    frameBus.project = () => ({ sx: 0, sy: 0, visible: true });
    hudStore.setState({ seats: [], localEntityId: null, localSeatId: null, mobBossLive: [] });
  });

  it("界內的照畫，界外的整個錨點不存在，而且被數到", () => {
    const entities = new Map<string, unknown>([
      ["1", ent(1, 19, -3)], // 大聖杯洞窟正常的出生點
      // ⚠️ 這是 2026-08-19 那次**真實的**過期座標之一：中場（arena.skeleton）
      // side 0 站的 x=-56。⛔ 同一次事故的另一個過期座標 x=-24 **這道閘擋不住** ——
      // 它剛好落在大聖杯洞窟地板的邊緣上（halfW 24）。見 anchorBounds.ts 檔頭。
      ["2", ent(2, -56, -4)],
    ]);
    const self = {
      views: { posOf: () => null, isOccluded: () => false },
      visibleZones: { has: () => true },
      teamBySeat: new Map(),
      fbNameBySeat: new Map(),
      fbChampBySeat: new Map(),
      fbSeen: new Set(),
      casts: { progressFor: () => null },
      mobBarCfg: {},
      predictedEntityId: null,
    };
    (
      GameApp.prototype as unknown as {
        updateFrameBus: (s: unknown, n: number) => void;
      }
    ).updateFrameBus.call(self, { entities }, 0);

    expect(frameBus.champions.has(1), "界內的血條被誤殺了").toBe(true);
    expect(frameBus.champions.has(2), "界外的血條照畫 —— 這就是 owner 看到的畫面").toBe(false);
    expect(offArenaAnchorCount(), "擋掉了卻沒有留下痕跡（靜默才是缺陷）").toBe(1);
  });
});

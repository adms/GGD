/**
 * ⭐【矩形場地的火圈對**玩家**也是矩形】—— GH#364.
 *
 * owner 2026-08-14 對「方形地圖上的火圈怎麼辦」的裁決是「**一樣要有**」，
 * 而 GH#324 把它實作成「內縮成矩形」。⚠️ 但那個 fork **只落在殭屍身上**
 * (`fireRingBurnMobs`)：`FireRingSystem`（玩家＋召喚物的傷害）與
 * `isBurnedByFireRing`（上 wire 的 `ENTITY_FLAG.BURNING`，客戶端的紅畫面）
 * 兩條路都留在圓盤法上，整整一版沒有任何東西紅 —— 而 `isBurnedByFireRing`
 * 的檔頭自己寫著「can never drift from the damage that justifies it」（第三守則）。
 *
 * 這一條驗的是**機制**：在 rect 分區裡，火圈咬人的邊界跟著**矩形**走，
 * ⛔ 不是外接圓。⛔ 沒有任何斷言寫死出貨數字 —— 位置、半徑、身體半徑全部
 * 從**出貨場地文件**與 sim 自己讀回來。
 *
 * ⛔ 刻意讀 `content/arenas/*.json`（挑第一張 `bounds.kind === "rect"` 的），
 * 不捏夾具：新圖上線自動被納入，而且被測的就是出貨的那一個（失敗形態⑤）。
 *
 * 突變紀錄（2026-08-18）：把 `fireRingSafeAt` 的 rect 分支改回
 * `fireRingIsSafe(radius, bodyRadius, distSq(pos, zone.center))`（＝回到圓盤法）
 * → 下面兩條都紅（短軸那個位置提早 5.4 單位半徑才開始燒，而且旗標與傷害同時錯）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "./SimWorld";
import { arenaDefFromDoc, type ArenaDef } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId } from "../ids";
import {
  beginCombatFireRing,
  currentFireRingRadius,
  fireRingRulesFromConfig,
  fireRingSafeAt,
  isBurnedByFireRing,
  type FireRingConfigLike,
} from "./fireRing";
import { reviveChampionAt } from "./revive";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DT = 1 / 30;

beforeAll(() => registerSkeletonContent());

/** 第一張出貨的**矩形**場地。⛔ 不是手打的 id —— 新圖照樣被守。 */
function shippedRectArena(): { def: ArenaDef; halfW: number; halfD: number } {
  const dir = join(ROOT, "content/arenas");
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as Parameters<typeof arenaDefFromDoc>[0];
    const z0 = doc.zones[0];
    if (z0?.bounds?.kind !== "rect") continue;
    return { def: arenaDefFromDoc(doc), halfW: z0.bounds.halfW, halfD: z0.bounds.halfD };
  }
  throw new Error("出貨內容裡一張矩形場地都沒有 —— 這條守衛失去了守的對象");
}

/** 火圈在點燃後第 `n` 個 tick 立刻開始收（`startSec: 0`），其餘走出貨語意。 */
const RING: FireRingConfigLike = { startSec: 0, shrinkSec: 20, stage1Radius: 4 };

describe("矩形分區的火圈 · 玩家側 (GH#364)", () => {
  it("⭐ 咬人的邊界跟著矩形的短軸走，⛔ 不是外接圓", () => {
    const { def, halfW, halfD } = shippedRectArena();
    const w = new SimWorld(def, 7);
    w.combatActive = true;
    const zone = def.zones[0]!;
    // 短軸上的一個點：離中心不遠，但很靠近矩形的上緣。
    // 圓盤法會讓它一直安全到 `radius ≈ dist + body`；矩形法在
    // `halfD/halfW` 的比例下**早得多**就咬到它 —— 兩種法的差距就是這條斷言。
    const at = { x: zone.center.x, z: zone.center.z + halfD * 0.86 };
    const hero = spawnChampion(w, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(1),
      pos: at,
      zone: 0,
    });
    const body = w.transform.get(hero)!.radius;
    const dist = Math.hypot(at.x - zone.center.x, at.z - zone.center.z);

    beginCombatFireRing(w, fireRingRulesFromConfig(RING, DT));
    let burnRadius = -1;
    for (let i = 0; i < 30 * 30 && burnRadius < 0; i++) {
      const before = currentFireRingRadius(w);
      w.step(new Map());
      if (w.events.some((e) => e.type === "fireRingDamage" && e.data.id === hero)) burnRadius = before;
    }
    expect(burnRadius).toBeGreaterThan(0); // 它真的燒到了（不是永遠沒燒）
    // 圓盤法的答案**恰好**是 dist + body。矩形法必須明顯更早（半徑更大時就咬）。
    // 差額由分區自己的長寬比推導 ⇒ ⛔ 沒有出貨數字住在這條斷言裡。
    const discAnswer = dist + body;
    const rectAnswer = (dist + body) * (halfW / halfD);
    expect(rectAnswer).toBeGreaterThan(discAnswer + 1); // 這張圖真的分得出兩種法
    expect(burnRadius).toBeGreaterThan(discAnswer + 1);
  });

  it("復活點被拉進**矩形**的圈裡，⛔ 不是拉進外接圓（不可以一站起來就燒）", () => {
    const { def, halfD } = shippedRectArena();
    const w = new SimWorld(def, 7);
    w.combatActive = true;
    const zone = def.zones[0]!;
    const hero = spawnChampion(w, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(1),
      pos: { x: zone.center.x, z: zone.center.z },
      zone: 0,
    });
    beginCombatFireRing(w, fireRingRulesFromConfig(RING, DT));
    for (let i = 0; i < 30 * 10; i++) w.step(new Map()); // 圈收到一半
    w.health.get(hero)!.alive = false;
    // 死在短軸的邊上 —— 圓盤法會覺得這裡「還在圈內」而原地放人。
    const at = { x: zone.center.x, z: zone.center.z + halfD * 0.9 };
    const landed = reviveChampionAt(w, hero, { pos: at, zone: 0, hpPct: 0.5, manaPct: 0.5 });
    expect(landed).not.toBeNull();
    const body = w.transform.get(hero)!.radius;
    expect(fireRingSafeAt(zone, landed!, body, currentFireRingRadius(w))).toBe(true);
  });

  it("上 wire 的 BURNING 旗標與真正扣的血逐格一致", () => {
    const { def, halfD } = shippedRectArena();
    const w = new SimWorld(def, 7);
    w.combatActive = true;
    const zone = def.zones[0]!;
    const hero = spawnChampion(w, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(1),
      pos: { x: zone.center.x, z: zone.center.z + halfD * 0.86 },
      zone: 0,
    });
    beginCombatFireRing(w, fireRingRulesFromConfig(RING, DT));
    let sawBurn = false;
    let sawSafe = false;
    for (let i = 0; i < 30 * 25; i++) {
      w.step(new Map());
      const dealt = w.events.some((e) => e.type === "fireRingDamage" && e.data.id === hero);
      // 旗標是在同一個 tick 之後讀的 —— snapshot.ts 也是這個順序。
      expect(isBurnedByFireRing(w, hero)).toBe(dealt);
      if (dealt) sawBurn = true;
      else sawSafe = true;
      if (sawBurn && !w.health.get(hero)!.alive) break;
    }
    expect(sawSafe && sawBurn).toBe(true); // 兩種狀態都真的走過
  });
});

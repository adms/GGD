/**
 * ⭐【週期領域】`delayed.anchor` 的**行為**守衛（`delayed.ts` 檔頭⑥）。
 *
 * B5 掃描器量到「44 支技能宣稱迴圈、JSON 一格都沒有」。逐支讀完之後，引擎真正
 * 缺的只有一句話：「每秒對**附近**的敵人造成傷害」—— 圓心是**施法者本人**，
 * ⛔ 不是地上的一個點。這一支就驗那一句話。
 *
 * ── 驗的是機制不是數字（第二守則）────────────────────────────────────────
 * ⛔ 沒有任何出貨數值進斷言。夾具的 5 / 0.2 / 3 是**這支測試自己的**幾何，而每
 * 一條斷言都是同一次執行的兩臂相減（釘住 vs 跟著走），環境掉血在兩臂一樣、會從
 * 差值裡消掉。
 *
 * ⚠️ 這裡跑的是**出貨的那一關**：`zEffectDefUnion.parse` 先把夾具餵給出貨 Zod
 * （＝內容檔進 registry 的那一關），再交給出貨的 `runEffects` + 真的 `SimWorld`
 * （失敗形態⑤：被測的不是出貨的那個）。
 *
 * ── 突變紀錄（一批一條，最承重的那一條）────────────────────────────────────
 *  · `effects/delayed.ts` `delayedSystem` 的
 *      `wave.followCaster === true ? world.transform.get(wave.caster)?.pos : wave.point`
 *    改回 `const origin = wave.point`（＝這一格出現以前：圓永遠釘在落點）
 *      → 紅（訊息逐字抄在任務回報裡）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { runEffects } from "./effectRunner";
import { zEffectDefUnion } from "../../content/schema/effect";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { DEFAULT_AUTO_ENGAGE } from "../combatFeel";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
/** 這串總共要落幾發 —— ⭐ 斷言直接讀它，⛔ 不抄第二份字面值。 */
const TICKS = 5;
const RADIUS = 3;
/** 圈外，⛔ 但施法者走過去之後就在圈內。 */
const AWAY = 9;

/** 一片【週期領域】：每 0.2 秒把圈裡的人重算一次，共 TICKS 發。 */
function field(anchor?: "point" | "caster", cnt: number = TICKS): EffectDef[] {
  return [
    zEffectDefUnion.parse({
      kind: "delayed",
      shape: "circle",
      radius: RADIUS,
      side: "enemies",
      delaySec: 0.1,
      count: cnt,
      intervalSec: 0.2,
      targetMode: "reresolve",
      ...(anchor !== undefined ? { anchor } : {}),
      effects: [{ kind: "damage", damageType: "magic", amount: { perRank: [40], ratios: [] } }],
    }) as EffectDef,
  ];
}

/**
 * 跑一臂：`moveAt` 是施法者走到遠端那個人身邊的 tick（null = 站著不動）。
 * 回傳兩個身體各自**在哪幾個 tick 掉了血**。
 */
function arm(anchor: "point" | "caster" | undefined, moveAt: number | null, noField = false, cnt = TICKS) {
  const world = new SimWorld(SKELETON_ARENA, 20260823);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  // ⛔ 關掉自動索敵：一場真的互毆會在同樣的 tick 上製造掉血，而這裡量的正是
  //    「哪一個 tick 掉血」。
  world.combatFeel = { ...world.combatFeel, autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false } };
  const body = (dz: number, seat: number): EntityId =>
    spawnChampion(world, {
      championId: SELA.id as ChampionId,
      seatId: asSeatId(seat),
      teamId: asTeamId(seat === 0 ? 0 : 1),
      pos: { x: C.x, z: C.z + dz },
      zone: 0,
    });
  const caster = body(0, 0);
  const near = body(2.8, 1); // 施放那一刻就在圈裡
  const far = body(AWAY, 2); // 圈外
  world.step(new Map());

  if (!noField) runEffects(field(anchor, cnt), {
    world,
    caster,
    rank: 1,
    targets: [],
    origin: "ability:test.periodic-field",
    rng: world.rng,
  } satisfies EffectContext);

  const hp = { near: world.health.get(near)!, far: world.health.get(far)! };
  const out = { near: [] as number[], far: [] as number[] };
  for (let i = 0; i < 40; i++) {
    if (i === moveAt) world.transform.get(caster)!.pos = { x: C.x, z: C.z + AWAY };
    const bn = hp.near.hp;
    const bf = hp.far.hp;
    world.step(new Map());
    if (bn - hp.near.hp > 1e-6) out.near.push(i);
    if (bf - hp.far.hp > 1e-6) out.far.push(i);
  }
  return out;
}

describe("週期領域：圈每 T 秒重算一次，而且圈可以跟著施法者走", () => {
  it("periodic-field-ticks-and-follows", () => {
    cover("periodic-field-anchor");

    // ① ⭐ 迴圈真的跑 TICKS 次 —— ⛔ 不是「參數存在」，是圈裡那個人**分幾個
    //    不同的 tick** 挨打。等距也一起驗（週期 ≠ 同一 tick 打 N 下）。
    const still = arm(undefined, null);
    console.log("STILL", JSON.stringify(still), "NOFIELD", JSON.stringify(arm(undefined, null, true)), "ONCE", JSON.stringify(arm(undefined, null, false, 1)));
    expect(still.near.length, "圈裡的人沒有被逐次結算 —— 迴圈沒有真的跑").toBe(TICKS);
    const gaps = still.near.slice(1).map((t, i) => t - still.near[i]!);
    expect(new Set(gaps).size, `不等距 = 不是週期：${still.near.join(",")}`).toBe(1);

    // ② ⭐ 承重：施法者走過去之後，遠端那個人開始挨打 —— 圈跟著人走了。
    const follow = arm("caster", 6);
    const pinned = arm(undefined, 6); // 同一次移動，只差這一格
    expect(follow.far.length, "施法者走到他身邊了，圈卻沒有跟過去").toBeGreaterThan(0);
    // ③ A/B 的另一半：省略這一格 = 這一格出現以前的行為（圈釘在落點）。
    expect(pinned.far.length, "沒有填 anchor 卻打到了遠端 —— 這一臂量到的不是這個機制").toBe(0);
    // ④ 跟著走 = 也會**離開**原地：近端那個人在施法者走掉之後就不再挨打。
    expect(
      follow.near.length,
      "圈跟著人走了，原地那個人卻照樣被打滿 —— 圓心根本沒有動",
    ).toBeLessThan(pinned.near.length);
  });
});

/**
 * ⭐【週期領域】`delayed.anchor` 的**行為**守衛（`delayed.ts` 檔頭⑥）。
 *
 * B5 掃描器量到「44 支技能宣稱迴圈、JSON 一格都沒有」。逐支讀完之後，引擎真正
 * 缺的只有一句話：「每秒對**附近**的敵人造成傷害」—— 圓心是**施法者本人**，
 * ⛔ 不是地上的一個點。這一支就驗那一句話。
 *
 * ── 驗機制不驗數字（第二守則）───────────────────────────────────────────────
 * ⛔ 沒有任何出貨數值進斷言：夾具的幾何是這支測試自己的，而每一條斷言都是**同一
 * 顆種子、同一個幾何**的兩臂相減 —— 實測這個場景每 40 tick 有 **1 次**與這支
 * 技能無關的掉血，它在兩臂各出現一次、從差值裡消掉。
 * ⚠️ 這正是 `travelingWaveAdvance.test.ts` 檔頭記下的同一件事：
 * **「掉了幾次血」不等於「這支技能打了幾次」**。
 *
 * ⚠️ 跑的是**出貨的那一關**：`zEffectDefUnion.parse`（＝內容檔進 registry 的那
 * 一關）→ 出貨的 `runEffects` → 真的 `SimWorld`（失敗形態⑤）。
 *
 * ── 突變紀錄（一批一條，最承重的那一條）────────────────────────────────────
 *  · `effects/delayed.ts` `delayedSystem` 的 `origin` 改回 `wave.point`
 *    （＝這一格出現以前：圓永遠釘在施放那一刻的落點）→ 紅。
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
/** 這一串總共要落幾發 —— ⭐ 斷言直接讀它，⛔ 不抄第二份字面值。 */
const TICKS = 5;
/** 圈外，⛔ 但施法者走過去之後就在圈內。 */
const AWAY = 9;

/** 一片【週期領域】：每 0.2 秒把圈裡的人重算一次，共 `count` 發。 */
function field(anchor: "point" | "caster" | undefined, count: number): EffectDef[] {
  return [
    zEffectDefUnion.parse({
      kind: "delayed",
      shape: "circle",
      radius: 3,
      side: "enemies",
      delaySec: 0.1,
      count,
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
function arm(anchor: "point" | "caster" | undefined, moveAt: number | null, count = TICKS) {
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
  const near = body(1, 1); // 施放那一刻就在圈裡
  const far = body(AWAY, 2); // 圈外
  world.step(new Map());

  runEffects(field(anchor, count), {
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

    // ① ⭐ 迴圈真的多跑了 TICKS-1 次 —— ⛔ 不是「參數存在」。對照組是 `count: 1`
    //    （schema 檔頭逐字：退化成純延遲），環境那一次掉血在兩臂都有。
    const loop = arm(undefined, null);
    const once = arm(undefined, null, 1);
    expect(
      loop.near.length - once.near.length,
      `圈裡的人沒有被逐次結算 —— 迴圈沒有真的跑：${loop.near.join(",")}`,
    ).toBe(TICKS - 1);

    // ② ⭐ 承重：施法者走過去之後，遠端那個人開始挨打 —— 圈跟著人走了。
    const follow = arm("caster", 6);
    const pinned = arm(undefined, 6); // 同一次移動，只差這一格
    expect(follow.far.length, "施法者走到他身邊了，圈卻沒有跟過去").toBeGreaterThan(0);
    // ③ A/B 的另一半：省略這一格 = 這一格出現以前的行為（圈釘在落點）。
    //    ⭐ 它同時證明遠端那個人身上**沒有**環境雜訊，所以 ④ 可以直接讀他。
    expect(pinned.far.length, "沒有填 anchor 卻打到了遠端 —— 這一臂量到的不是這個機制").toBe(0);
    // ④ 等距 = 真的是週期，⛔ 不是「同一個 tick 打了 N 下」。
    const gaps = follow.far.slice(1).map((t, i) => t - follow.far[i]!);
    expect(new Set(gaps).size, `不等距 = 不是週期：${follow.far.join(",")}`).toBe(1);
  });
});

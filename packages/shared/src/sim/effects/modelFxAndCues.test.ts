/**
 * #551【移動中的模型特效】+ #543/#549【螢幕回饋・特效文字】的**行為**守衛。
 *
 * ⛔ 出貨數值一個都沒有進斷言（第二守則的「驗機制不驗數字」）：兩條比的都是
 * **同一次執行的另一半** —— 一條比「快的比慢的先到、路徑上的比終點的先中」，
 * 一條比「七刀冒出來的字是不是七個不同的號碼」。夾具自己填的距離與速度是夾具
 * 的量，⛔ 不是 `content/config/` 裡的任何一格。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）─────────────────────────────────
 *  · ⭐ 承重線 —— `effects/spawnModelFx.ts` 的
 *      `atTick: world.tick + ticks`（onArrive 那一串）
 *    改成 `atTick: world.tick`（＝落點爆炸在**施法那一 tick**就發生，也就是這個
 *    kind 出現之前唯一寫得出來的東西：一發瞬間的 `damageArea`）
 *      → 紅：「模型的抵達時刻沒有跟著距離／速度走 —— 落點爆炸在施法那一 tick
 *        就發生了: expected 0 to be greater than 0」
 *    ⚠️ 它同時擋住「班表沒排」與「排了但不看速度」兩種壞法。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { DEFAULT_AUTO_ENGAGE } from "../combatFeel";

beforeAll(() => registerSkeletonContent());
const C = SKELETON_ARENA.zones[0]!.center;

function stage(seed: number, offsets: readonly number[]): {
  world: SimWorld;
  caster: EntityId;
  bodies: EntityId[];
} {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  world.combatFeel = { ...world.combatFeel, autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false } };
  const caster = spawnChampion(world, {
    championId: SELA.id as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: C.x, z: C.z }, zone: 0,
  });
  // 面向 +x，因為 `path:"forward"` 讀的就是它。
  world.transform.get(caster)!.facing = { x: 1, z: 0 };
  const bodies = offsets.map((dx, i) =>
    spawnChampion(world, {
      championId: SELA.id as ChampionId, seatId: asSeatId(i + 1), teamId: asTeamId(1),
      pos: { x: C.x + dx, z: C.z }, zone: 0,
    }),
  );
  world.step(new Map());
  world.transform.get(caster)!.facing = { x: 1, z: 0 };
  return { world, caster, bodies };
}

function run(world: SimWorld, caster: EntityId, targets: EntityId[], effects: EffectDef[]): void {
  const ctx: EffectContext = { world, caster, rank: 1, targets, origin: "ability:test.fx", rng: world.rng };
  runEffects(effects, ctx);
}

const hit = (flat: number): EffectDef => ({ kind: "damage", amount: { flat }, damageType: "true" });

/** 每個身體**第一次**掉血是在第幾個 tick（沒掉過 = -1）。 */
function firstDropTicks(world: SimWorld, ids: readonly EntityId[], ticks: number): number[] {
  const hps = ids.map((id) => world.health.get(id)!);
  const base = hps.map((h) => h.hp);
  const out = ids.map(() => -1);
  for (let t = 0; t < ticks; t++) {
    world.step(new Map());
    for (let i = 0; i < ids.length; i++) {
      if (out[i] === -1 && base[i]! - hps[i]!.hp > 1e-6) out[i] = t;
    }
  }
  return out;
}

const beam = (speed: number, distance: number): EffectDef => ({
  kind: "spawnModelFx",
  shape: "single",
  modelKey: "fx.test.beam",
  path: "forward",
  speed,
  distance,
  touchRadius: 2.5,
  onTouch: [hit(40)],
  onArrive: [{ kind: "damageArea", radius: 2.5, amount: { flat: 40 }, damageType: "true", includeOrigin: true }],
});

describe("#551 移動中的模型特效 spawnModelFx", () => {
  it("模型**沿路徑走**：路徑上的先中、終點的後中，而且慢的比快的晚到", () => {
    cover("model-fx-travels-along-path");
    const DIST = 18;
    // 兩個受害者：一個站在半路（只吃 onTouch），一個站在終點（吃 onArrive）。
    // ⚠️ 兩個都刻意站遠，理由與 `comboAndPull.test.ts` 逐字相同（近身會多記掉血）。
    const fast = stage(55100, [DIST / 2, DIST]);
    run(fast.world, fast.caster, [], [beam(30, DIST)]);
    const [midFast, endFast] = firstDropTicks(fast.world, fast.bodies, 60) as [number, number];

    const slow = stage(55100, [DIST / 2, DIST]);
    run(slow.world, slow.caster, [], [beam(10, DIST)]);
    const [, endSlow] = firstDropTicks(slow.world, slow.bodies, 60) as [number, number];

    // ⭐ 承重①：落點結算**不在施法那一 tick** —— 它要等模型走完那一段路。
    expect(
      endFast,
      "模型的抵達時刻沒有跟著距離／速度走 —— 落點爆炸在施法那一 tick 就發生了",
    ).toBeGreaterThan(0);
    // ⭐ 承重②：**速度真的是速度** —— 同一段距離，慢的比較晚到。
    expect(endSlow, "速度沒有被讀進班表：快慢兩發同時抵達").toBeGreaterThan(endFast);
    // ⭐ 承重③：**路徑真的是路徑** —— 半路那個人比終點那個人先中。
    expect(midFast, "路徑中段的身體沒有被 onTouch 掃到").toBeGreaterThanOrEqual(0);
    expect(midFast, "onTouch 沒有沿路徑推進：半路與終點同時結算").toBeLessThan(endFast);
  });
});

describe("#543 螢幕回饋 / #549 特效文字", () => {
  it("`{{i}}` 在**執行時**解析成段號（一個節點 → 七個號碼），閃爍發給解出來的目標", () => {
    cover("client-cues-sequence-index");
    const { world, caster, bodies } = stage(55101, [12]);
    const victim = bodies[0]!;
    run(world, caster, [victim], [
      {
        kind: "comboStrikes",
        shape: "single",
        steps: [1 / 30, 4 / 30, 7 / 30], // 夾具自己的節奏，⛔ 不是出貨值
        perStrike: [
          { kind: "floatingText", shape: "single", text: "{{i}}Hit", applyTo: "victim" },
          {
            kind: "screenFlash", shape: "single", colorRgb: [255, 0, 0],
            peakAlpha: 0.5, durationSec: 0.2, applyTo: "victim",
          },
        ],
      },
    ]);

    const texts: string[] = [];
    const flashSubjects: EntityId[][] = [];
    for (let i = 0; i < 20; i++) {
      world.step(new Map());
      for (const ev of world.events) {
        if (ev.type === "floatingText") texts.push(ev.data.text as string);
        if (ev.type === "screenFlash") flashSubjects.push(ev.data.subjects as EntityId[]);
      }
    }

    // ⭐ 承重：一個節點冒出**三個不同的號碼**（⛔ 不是三次同一個字）。
    expect(texts, "{{i}} 沒有在執行時解析 —— 三刀冒出來的是同一個字").toEqual(["1Hit", "2Hit", "3Hit"]);
    // 閃爍收件人 = 這一段解出來的目標（⛔ 不是施法者、⛔ 不是全場）。
    expect(flashSubjects.length).toBe(texts.length);
    expect(flashSubjects.every((s) => s.length === 1 && s[0] === victim)).toBe(true);
  });
});

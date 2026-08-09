/**
 * Lane 2（2026-08-10）—— 三格「作者填了、引擎不看」的欄位，一支守衛。
 *
 * 這三件事是同一個病：**schema 上有那一格，而它不會改變遊戲裡發生的事**
 * （失敗形態②的鏡像）。所以三條斷言都問「世界／解析器的最終狀態變了沒有」，
 * ⛔ 不問「EffectDef 長什麼樣」，也沒有任何出貨數值進斷言。
 *
 * ── ⭐ 承重的那一條（本 lane 唯一做突變的）───────────────────────────────
 * `proxyCast.emitCastEvents` —— 把 handler 裡那一段 `fireHooks` 拿掉
 * （＝欄位打開了也不發事件）
 *   → 紅：「打開 emitCastEvents 之後「施法時」的被動還是沒有吃到 ——
 *          那一格沒有接線: expected 0 to be greater than 0」
 * 另外兩條（`randomArea` 的孤兒欄位、`maxStat` 的死上限）是**解析器**的規則，
 * 一條薄斷言就夠，不開對抗輪（第零守則③）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { attachSource } from "../stats/statPipeline";
import { Abilities } from "../content/registry";
import { runEffects } from "./effectRunner";
import { zEffectDef } from "../../content/schema/effect";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "../../ids";
import { DEFAULT_AUTO_ENGAGE } from "../combatFeel";

beforeAll(() => registerSkeletonContent());
const id = <T extends string>(s: string): T => s as T;
const C = SKELETON_ARENA.zones[0]!.center;

/** 代放的目標技能**自己什麼都不做** —— 這樣掉的血只可能來自「施法時」的被動。 */
const PROXIED = id<AbilityId>("test.lane2-silent");

/** 打開／不打開 `emitCastEvents`，量受害者掉了多少血。 */
function castThroughProxy(emitCastEvents?: boolean): number {
  const world = new SimWorld(SKELETON_ARENA, 20260810);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  world.combatFeel = { ...world.combatFeel, autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false } };
  const seat = (n: number, dx: number): ReturnType<typeof spawnChampion> =>
    spawnChampion(world, {
      championId: SELA.id as ChampionId,
      seatId: asSeatId(n),
      teamId: asTeamId(n),
      pos: { x: C.x + dx, z: C.z },
      zone: 0,
    });
  const caster = seat(0, 0);
  const victim = seat(1, 2);
  world.step(new Map());

  Abilities.register(PROXIED, {
    id: PROXIED,
    name: "silent",
    slot: "Q",
    castType: "self",
    maxRank: 1,
    cooldown: [0],
    manaCost: [0],
    range: 0,
    effects: [],
  });
  // 「施法時」的被動 —— 這是玩家看得到的那一面（血條）。
  attachSource(world, caster, {
    id: "buff:test-on-cast",
    kind: "buff",
    hooks: [
      { on: "onAbilityCast", effects: [{ kind: "damage", amount: { flat: 30 }, damageType: "true" }] },
    ],
  });

  const proxy: EffectDef = {
    kind: "proxyCast",
    shape: "single",
    abilityId: PROXIED,
    requireLearned: false,
    ...(emitCastEvents !== undefined ? { emitCastEvents } : {}),
  };
  const ctx: EffectContext = {
    world,
    caster,
    rank: 1,
    targets: [victim],
    origin: "ability:test.lane2",
    rng: world.rng,
  };
  const hp = world.health.get(victim)!;
  const before = hp.hp;
  runEffects([proxy], ctx);
  world.step(new Map());
  return before - hp.hp;
}

describe("Lane 2：三格不會改變任何事的欄位", () => {
  it("⭐ proxyCast.emitCastEvents 真的決定「代放算不算一次施法」（兩個方向）", () => {
    cover("proxycast-emit-cast-events");
    const off = castThroughProxy(undefined);
    const on = castThroughProxy(true);
    // 預設 = 今天的行為：不發事件，所以「施法時」的被動一點都吃不到。
    expect(off, "省略 emitCastEvents 卻發了事件 = 既有內容的行為被改掉了").toBe(0);
    expect(on, "打開 emitCastEvents 之後「施法時」的被動還是沒有吃到 —— 那一格沒有接線")
      .toBeGreaterThan(0);
  });

  it("randomArea 的四格孤兒欄位真的不見了（handler 一格都不讀）", () => {
    cover("randomarea-orphan-geometry-removed");
    const base = { kind: "randomArea", count: [3], intervalSec: 0.2, scatterRadius: 5, effects: [{ kind: "spawnVfx", vfxId: "test.meteor" }] };
    expect(zEffectDef.safeParse(base).success, "randomArea 現在連自己都收不下了").toBe(true);
    for (const dead of [{ shape: "single" }, { radius: 5 }, { side: "enemies" }, { maxTargets: 3 }]) {
      expect(
        zEffectDef.safeParse({ ...base, ...dead }).success,
        `randomArea 還收得下 ${Object.keys(dead)[0]} —— 那是一格沒有人讀的數字`,
      ).toBe(false);
    }
  });

  it('maxStat.basis:"thisSource" 配純百分比 = 一個永遠咬不到的上限，載入時就擋', () => {
    cover("maxstat-thissource-needs-flat");
    const buff = (op: string): unknown => ({
      kind: "applyBuff",
      duration: 5,
      stackKey: "test.cap",
      modifiers: [{ stat: "ad", op, value: 0.1 }],
      maxStat: { stat: "ad", value: 10, basis: "thisSource" },
    });
    const bad = zEffectDef.safeParse(buff("pctAdd"));
    expect(bad.success, "純百分比配 thisSource 還過得了 —— 那個上限永遠是 0").toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.some((i) => i.path.includes("maxStat"))).toBe(true);
    }
    // 反面：補一條固定值就進得來（否則上面那條會被「applyBuff 整個不合法」騙過去）。
    expect(zEffectDef.safeParse(buff("flat")).success).toBe(true);
  });
});

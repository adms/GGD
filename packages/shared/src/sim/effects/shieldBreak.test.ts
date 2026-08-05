/**
 * 【破盾】`shieldBreak` 的行為守衛（D1，#278）。
 *
 * ── 這一檔只釘兩件事，而第二件才是重點 ──────────────────────────────────
 *
 *  ①  護盾**真的沒了**（讀 `hp.shields`，不是讀「函式被呼叫過」）。
 *
 *  ②  ⛔ `st.effects` **原封不動**。這是 D1 存在的全部意義：一發破盾把對手的
 *      增益也拔了，那就是淨化不是破盾，而**畫面上看不出差別** ——
 *      玩家只會覺得「這道具好像有點強」。
 *      突變：讓池子選擇失效（`pools` 傳 `{status:true,shields:true}`）→ 這一條紅。
 *
 * ── 為什麼不順便驗 `shape` ─────────────────────────────────────────────
 * 因為 `shape` 的解析是**共用**的（`shapeTargets.ts`），而 `dispel.test.ts`
 * 的 `dsp-circle-edge` 已經在驗那一支。在這裡再抄一份圓形夾具，驗的是同一段
 * 程式碼的第二份斷言 —— 那不是覆蓋，是重複（CLAUDE.md：不要過度測試）。
 * ⚠️ 這句話成立的前提是「它真的共用」，所以下面第三條就是釘住這件事：
 * 破盾走的是同一支解析器。
 *
 * 突變紀錄（都真的做過，見 commit message）:
 *   · `pools: { shields: true }` → 加上 `status: true` → sb-only-shields 紅
 *   · `clearPools(...)` 整段刪掉                        → sb-gone 紅
 *   · `shapeTargets(e, ctx)` → `ctx.targets`            → sb-shares-shape 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import { resolveAbilityRadius } from "../abilities/abilitySystem";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import type { StatusEffect } from "../components";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

function stage(): { world: SimWorld; hero: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 5);
  world.combatActive = true;
  const hero = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return { world, hero };
}

function ally(world: SimWorld, seat: number, dx: number): EntityId {
  const id = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(0),
    pos: { x: C.x + dx, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return id;
}

/** 掛一片盾。`expiresAtTick` 是**絕對** tick。 */
function shield(world: SimWorld, id: EntityId, sourceId: string, amount = 100): void {
  const hp = world.health.get(id)!;
  hp.shields.push({ sourceId, amount, expiresAtTick: world.tick + 300 });
}

function put(world: SimWorld, id: EntityId, statusId: string): void {
  const st = world.status.get(id) ?? { effects: [] };
  st.effects.push({
    statusId: statusId as StatusEffect["statusId"],
    sourceId: `src:${statusId}`,
    expiresAtTick: world.tick + 300,
    moveSpeedMult: 0.7,
    polarity: "buff",
  });
  world.status.set(id, st);
}

function fire(world: SimWorld, caster: EntityId, targets: EntityId[], e: EffectDef): void {
  const ctx: EffectContext = {
    world,
    caster,
    rank: 1,
    targets,
    origin: "test:shieldBreak",
    rng: world.rng,
  };
  runEffects([e], ctx);
}

describe("shieldBreak —— 【破盾】", () => {
  it("護盾真的沒了", () => {
    cover("sb-gone");
    const { world, hero } = stage();
    shield(world, hero, "a");
    shield(world, hero, "b");
    expect(world.health.get(hero)!.shields).toHaveLength(2);

    fire(world, hero, [hero], { kind: "shieldBreak", shape: "single" } as EffectDef);

    expect(world.health.get(hero)!.shields).toHaveLength(0);
  });

  it("⛔ 只碰護盾 —— 身上的增益一格都沒動", () => {
    cover("sb-only-shields");
    const { world, hero } = stage();
    shield(world, hero, "a");
    put(world, hero, "haste");
    put(world, hero, "berserk");

    fire(world, hero, [hero], { kind: "shieldBreak", shape: "single" } as EffectDef);

    expect(world.health.get(hero)!.shields).toHaveLength(0);
    // ⚠️ 兩個方向一起讀：只驗「盾沒了」的話，一個把整個人清空的實作也會過。
    expect((world.status.get(hero)?.effects ?? []).map((e) => String(e.statusId)).sort()).toEqual([
      "berserk",
      "haste",
    ]);
  });

  it("shape 走的是與淨化同一支解析器（圈外的人沒被破盾）", () => {
    cover("sb-shares-shape");
    const { world, hero } = stage();
    const DOC_RADIUS = 8;
    const effective = resolveAbilityRadius(world, DOC_RADIUS);
    expect(effective).toBeGreaterThan(1); // 夾具前提

    const near = ally(world, 1, effective * 0.5);
    const far = ally(world, 2, effective * 1.5);
    shield(world, near, "n");
    shield(world, far, "f");

    fire(world, hero, [hero], {
      kind: "shieldBreak",
      shape: "circle",
      side: "allies",
      radius: DOC_RADIUS,
    } as EffectDef);

    expect(world.health.get(near)!.shields).toHaveLength(0);
    expect(world.health.get(far)!.shields).toHaveLength(1);
  });
});

/**
 * ⛔ **86-04 打雷絕招 與 65-04 天譴 真的會放出逐跳的連鎖閃電。**（GH#451，M3）
 *
 * owner 2026-08-20 逐字：「每個閃電有**極小的時間間隔**播放閃電動畫與傷害才到
 * 下一個⋯**有其特殊性與純範圍直接給傷害區別很大**」。⇒ 這一支只驗那個「區別」：
 *   ① 一次施放打出**很多發**，而且散落在**多個 tick** 上（⛔ 不是一格結算完）
 *   ② 後面的那幾發**比前面小**（decay 真的乘進去了）
 *
 * ⚠️ 讀**登錄表裡那一份**（真的 `ContentLoader` + `registerAll` + 真的 `SimWorld`），
 * ⛔ 不是掃磁碟 JSON 的字串 —— 那是失敗形態⑥（掃原始碼字串代替行為）。
 * ⛔ 斷言裡一個出貨數字都沒有（第二守則：驗機制不驗數字）—— 半徑、傷害、跳數、
 * 間隔全部是後台/內容可調的，抄進來就是第四個住處。
 *
 * 突變紀錄：`content/abilities/godie-o00k.r.json` 的 `jumpIntervalSec` 0.05 → 0
 * （＝ owner 推翻的「一格 tick 全結算」）→ 紅（「逐跳要跨多個 tick」那一條）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { runEffects } from "../sim/effects/effectRunner";
import { asSeatId, asTeamId, type AbilityId, type EntityId } from "../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

/** 施法者 + 一排敵對的身體，都在圈內，彼此夠近讓鏈跳得動。 */
function rig(victims: number): { world: SimWorld; caster: EntityId; foes: EntityId[] } {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const place = (x: number, seat: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: 0 },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.1,
      zone: 0,
    });
    world.health.set(id, { hp: 90000, maxHp: 90000, mana: 900, maxMana: 900, alive: true, shields: [] });
    world.team.set(id, { teamId: asTeamId(seat), seatId: asSeatId(seat) });
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    world.status.set(id, { effects: [] });
    return id;
  };
  const caster = place(C.x, 0);
  const foes = Array.from({ length: victims }, (_, i) => place(C.x + 0.8 * (i + 1), i + 1));
  world.rebuildGrid();
  return { world, caster, foes };
}

/** 施放那一支技能，逐 tick 記下**它自己**排進傷害佇列的每一發。 */
function boltsOf(abilityId: string): { tick: number; amount: number }[] {
  const def = Abilities.get(abilityId as AbilityId);
  expect(def, `${abilityId} 不在登錄表裡`).toBeDefined();
  const { world, caster, foes } = rig(5);
  const origin = `ability:${abilityId}`;
  const seen: { tick: number; amount: number }[] = [];
  const q = world.damageQueue as unknown as {
    push: (...xs: { amount: number; origin: string }[]) => number;
  };
  const original = q.push.bind(q);
  q.push = (...xs) => {
    for (const x of xs) if (x.origin === origin) seen.push({ tick: world.tick, amount: x.amount });
    return original(...xs);
  };
  runEffects(def!.effects, {
    world,
    caster,
    rank: 1,
    targets: [...foes],
    point: { x: C.x, z: 0 },
    origin,
    rng: world.rng,
  });
  const noIntents = new Map();
  for (let i = 0; i < 120; i++) world.step(noIntents);
  return seen;
}

describe("GH#451 — 打雷／天譴的連鎖閃電是逐跳的，不是一發範圍傷害", () => {
  for (const id of ["godie-o00k.r", "godie-udea.r"]) {
    it(`${id}：多發閃電、跨多個 tick、後面的比前面小`, () => {
      const bolts = boltsOf(id);
      // ① 不是「一個來源一發」：真的跳了。
      expect(bolts.length, "連鎖一發都沒打出來").toBeGreaterThan(1);
      // ② owner 要的那個「區別」：⛔ 不在同一格 tick 結算完。
      expect(new Set(bolts.map((b) => b.tick)).size, "逐跳應該跨多個 tick").toBeGreaterThan(1);
      // ③ decay 真的乘進去了 —— 只比大小，⛔ 不抄 0.9 也不抄基礎傷害。
      const amounts = bolts.map((b) => b.amount);
      expect(Math.min(...amounts), "後面的跳沒有比前面小 ⇒ decay 沒生效").toBeLessThan(
        Math.max(...amounts),
      );
    });
  }
});

/**
 * GH#1054 —— `chanceFrom.flat`：觸發機率的常數項，門檻 = `clamp(flat + 三圍 × coeff, min, max)`
 *（96-01 華山劍法 war3map.j:44815「(5 + 敏捷/15)%」）。① 封存區的華山劍法走出貨 `syncAbilityPassives`
 * 掛上、真 `fireHooks` 逐發對卡面公式（0／75／150 敏）② 朗基努斯之槍（沒 flat）逐位元不變 ③ schema 上下界。
 * 突變（2026-09-06）：`hookProcChance` 拿掉 `(from.flat ?? 0) +` ⇒ ① 在 0 敏第 14 發紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { recomputeStats } from "../stats/statPipeline";
import { attachItemSource } from "../economy/itemSource";
import { fireHooks } from "./hooks";
import { Rng } from "../math/rng";
import { zHookDef } from "../../content/schema/effect";
import { zAbilityDoc, type AbilityDoc } from "../../content/schema/ability";
import { zChampionDoc } from "../../content/schema/champion";
import { ContentStore } from "../../content/store";
import { registerAll, Arenas, Configs, Models, StatusEffects, VfxDefs } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { syncAbilityPassives } from "../abilities/abilityPassives";
import { liveAttribute } from "../stats/attrSources";
import type { HookDef } from "../stats/modifiers";
import type { ItemDef } from "../content/defs";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const LONGINUS = "godie-i018" as ItemId;
const Z0 = SKELETON_ARENA.zones[0]!;
const SWINGS = 400;
type Rig = { world: SimWorld; attacker: EntityId; victim: EntityId };
const withChanceFrom = (h: HookDef): boolean => h.chanceFrom !== undefined;
/** 卡面公式，從文件推導（⛔ 不抄數字）。`flat` 缺席 = #1054 之前那一條。 */
const thresholdOf = (cf: NonNullable<HookDef["chanceFrom"]>, agi: number): number =>
  Math.min(cf.max, Math.max(cf.min, (cf.flat ?? 0) + agi * cf.coeff));

let HERO: ChampionId;
let huashan: AbilityDoc;

beforeAll(() => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables, Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const store = new ContentStore();
  const read = (c: string): Record<string, unknown>[] =>
    readdirSync(join(CONTENT_DIR, c)).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort()
      .map((f) => JSON.parse(readFileSync(join(CONTENT_DIR, c, f), "utf-8")));
  for (const c of ["ability-templates", "abilities", "items"]) for (const d of read(c)) store.add(c as never, d.id as string, d);
  for (const d of read("champions")) { const p = zChampionDoc.safeParse(d); if (p.success) store.add("champions", p.data.id, p.data); }
  huashan = zAbilityDoc.parse(JSON.parse(readFileSync(join(CONTENT_DIR, "_legacy/abilities/godie-o02w.q.json"), "utf-8")));
  store.add("abilities", huashan.id, huashan);
  registerAll(store);
  HERO = [...Champions.all()].filter((d) => d.attributes !== undefined).sort((a, b) => (a.id < b.id ? -1 : 1))[0]!.id;
});

function rig(): Rig {
  const world = new SimWorld(SKELETON_ARENA, 1054);
  const mk = (seat: number, team: number, dx: number): EntityId => {
    const id = spawnChampion(world, { championId: HERO, seatId: asSeatId(seat), teamId: asTeamId(team), pos: { x: Z0.center.x + dx, z: Z0.center.z + 10 }, zone: 0 });
    recomputeStats(world, id);
    return id;
  };
  const attacker = mk(0, 0, 0);
  const victim = mk(1, 1, 3);
  Object.assign(world.health.get(victim)!, { hp: 1e7, maxHp: 1e7 });
  world.rebuildGrid();
  return { world, attacker, victim };
}

/** 總敏捷調到 `target`：走 `attrBonus`（能力屬性強化那條路），⛔ 不手塞 stats。 */
function setAgi(r: Rig, target: number): void {
  r.world.champion.get(r.attacker)!.attrBonus.agi += target - liveAttribute(r.world, r.attacker, "agi", "total")!;
  recomputeStats(r.world, r.attacker);
  expect(liveAttribute(r.world, r.attacker, "agi", "total")).toBeCloseTo(target, 9);
}

/** 真的抽 SWINGS 次：每發先快照 `world.rng.state`，同一顆亂數算「照 p 該不該中」，逐發比對。回傳中了幾發。 */
function replay(r: Rig, p: number): number {
  let fires = 0;
  for (let i = 0; i < SWINGS; i++) {
    const probe = new Rng(0);
    probe.state = r.world.rng.state;
    const expected = probe.chance(p);
    const fired = fireHooks(r.world, r.attacker, "onBasicAttack", r.victim, undefined, undefined, undefined, withChanceFrom) > 0;
    expect(fired, `第 ${i} 發：門檻 ${p}`).toBe(expected);
    if (fired) fires++;
    r.world.tick++;
  }
  return fires;
}

describe("GH#1054 chanceFrom.flat —— 機率門檻的常數項", () => {
  it("① 華山劍法 0／75／150 敏：每一發都等於卡面 clamp(flat + 敏 × coeff)", () => {
    const cf = huashan.passive!.ranks[0]!.hooks![0]!.chanceFrom!;
    expect(cf.flat).toBeGreaterThan(0); // 文件真的帶著常數項，⛔ 不是 min 假扮的
    const r = rig();
    r.world.abilities.get(r.attacker)!.slots.Q = { abilityId: huashan.id as never, rank: 1, cooldownRemainingTicks: 0 };
    syncAbilityPassives(r.world, r.attacker); // 出貨的掛載路徑
    expect(r.world.stats.get(r.attacker)!.sources.some((s) => s.hooks?.some(withChanceFrom))).toBe(true);
    for (const agi of [0, 75, 150]) {
      setAgi(r, agi);
      const p = thresholdOf(cf, agi);
      if (agi === 0) expect(p).toBe(cf.flat); // 0 敏只剩常數項 —— 突變會紅的那一點
      expect(replay(r, p), `${agi} 敏應該中過至少一次`).toBeGreaterThan(0);
    }
  });

  it("② 既有使用者逐位元不變：朗基努斯之槍（沒有 flat）仍是 clamp(敏 × coeff)", () => {
    const doc = JSON.parse(readFileSync(join(CONTENT_DIR, "items", `${LONGINUS}.json`), "utf-8")) as ItemDef;
    const cf = doc.passive![0]!.chanceFrom!;
    expect(cf.flat).toBeUndefined();
    const r = rig();
    r.world.champion.get(r.attacker)!.items[0] = LONGINUS;
    attachItemSource(r.world, r.attacker, LONGINUS, 0, doc);
    const agi = liveAttribute(r.world, r.attacker, "agi", "total")!;
    expect(replay(r, Math.min(cf.max, Math.max(cf.min, agi * cf.coeff)))).toBeGreaterThan(0);
  });

  it("③ schema：flat > 1 或 flat > max ⇒ 拒絕；缺席不注入預設", () => {
    const hook = (flat?: number, max = 1) => ({
      on: "onBasicAttack",
      chanceFrom: { attr: "agi", coeff: 0.001, ...(flat !== undefined ? { flat } : {}), min: 0, max },
      effects: [{ kind: "damage", damageType: "magic", amount: { flat: 1 } }],
    });
    expect(zHookDef.safeParse(hook(1.5)).success).toBe(false);
    expect(zHookDef.safeParse(hook(0.5, 0.3)).success).toBe(false);
    expect(zHookDef.parse(hook(0.05)).chanceFrom?.flat).toBe(0.05);
    expect("flat" in zHookDef.parse(hook()).chanceFrom!).toBe(false);
  });
});

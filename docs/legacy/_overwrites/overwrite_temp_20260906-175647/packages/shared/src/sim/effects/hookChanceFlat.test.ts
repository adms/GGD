/**
 * GH#1054 —— `chanceFrom.flat`：觸發機率的**常數項**。
 *
 * 門檻 = `clamp(flat + 三圍 × coeff, min, max)`。w3x 那一族「(5 + 敏捷/15)%」
 * （96-01 華山劍法，war3map.j:44815 `udg_LHC_RandRang = 5 + GetHeroStatBJ(AGI,…,true)/15`）
 * 在這一格出現之前寫不進 JSON —— 拿 `min` 當常數在 75 敏以下與卡面差最多 5 個百分點。
 *
 * 三條，各擋一種「做了但玩家拿不到」：
 *  ① 華山劍法的文件（⚠️ 這位英雄停在 `content/_legacy/`，所以讀那一份）走**出貨的**
 *     `syncAbilityPassives` 掛上，再用**真的** `fireHooks` 抽籤：每一發都拿引擎當下那一顆
 *     亂數重算「照卡面公式該不該中」，逐發比對 —— 0／75／150 敏三點，公式**從 JSON 推導**。
 *  ② 既有使用者逐位元不變：朗基努斯之槍（沒有 `flat`）仍走 #1054 之前那一條算式，
 *     同一個抽籤位置、同一顆亂數。
 *  ③ schema：`flat` 超過 1、或超過 `max`（係數永遠沒作用）⇒ 載入時拒絕；缺席不注入預設。
 *
 * 突變（2026-09-06）：`hooks.ts::hookProcChance` 拿掉 `(from.flat ?? 0) +` ⇒ ① 在 0 敏那一點
 * 第一發該中的就紅（引擎門檻變成 0）。
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

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../../content");
const HUASHAN_PATH = join(CONTENT_DIR, "_legacy", "abilities", "godie-o02w.q.json");
const LONGINUS = "godie-i018" as ItemId;
const Z0 = SKELETON_ARENA.zones[0]!;
const SEED = 1054;
const SWINGS = 400;

type ChanceFrom = NonNullable<HookDef["chanceFrom"]>;
type Rig = { world: SimWorld; attacker: EntityId; victim: EntityId };
const withChanceFrom = (h: HookDef): boolean => h.chanceFrom !== undefined;

/** 卡面公式，從文件推導（⛔ 不抄數字）。`flat` 缺席 = #1054 之前那一條。 */
function thresholdOf(cf: ChanceFrom, agi: number): number {
  return Math.min(cf.max, Math.max(cf.min, (cf.flat ?? 0) + agi * cf.coeff));
}

let HERO: ChampionId;
let huashan: AbilityDoc;

beforeAll(() => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const store = new ContentStore();
  const read = (c: string): Record<string, unknown>[] =>
    readdirSync(join(CONTENT_DIR, c))
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .sort()
      .map((f) => JSON.parse(readFileSync(join(CONTENT_DIR, c, f), "utf-8")));
  for (const c of ["ability-templates", "abilities"]) for (const d of read(c)) store.add(c as never, d.id as string, d);
  for (const d of read("champions")) {
    const p = zChampionDoc.safeParse(d);
    if (p.success) store.add("champions", p.data.id, p.data);
  }
  for (const d of read("items")) store.add("items", d.id as string, d);
  // 華山劍法：封存區的那一份，⚠️ 過**出貨的** schema（strict），⛔ 不是手寫夾具。
  huashan = zAbilityDoc.parse(JSON.parse(readFileSync(HUASHAN_PATH, "utf-8")));
  store.add("abilities", huashan.id, huashan);
  registerAll(store);
  // 挑一位帶三圍的出貨英雄當載體（同 onHitTerms §2C：⛔ 不寫死 id）。
  HERO = [...Champions.all()].filter((d) => d.attributes !== undefined).sort((a, b) => (a.id < b.id ? -1 : 1))[0]!.id;
});

function rig(): Rig {
  const world = new SimWorld(SKELETON_ARENA, SEED);
  const mk = (seat: number, team: number, dx: number): EntityId => {
    const id = spawnChampion(world, {
      championId: HERO,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x: Z0.center.x + dx, z: Z0.center.z + 10 },
      zone: 0,
    });
    recomputeStats(world, id);
    return id;
  };
  const attacker = mk(0, 0, 0);
  const victim = mk(1, 1, 3);
  const vhp = world.health.get(victim)!;
  vhp.maxHp = 1e7;
  vhp.hp = 1e7;
  world.rebuildGrid();
  return { world, attacker, victim };
}

/** 把載體的**總敏捷**調到 `target`：走 `attrBonus`（能力屬性強化那條路），⛔ 不手塞 stats。 */
function setAgi(r: Rig, target: number): void {
  const ac = r.world.champion.get(r.attacker)!;
  ac.attrBonus.agi += target - liveAttribute(r.world, r.attacker, "agi", "total")!;
  recomputeStats(r.world, r.attacker);
  expect(liveAttribute(r.world, r.attacker, "agi", "total")).toBeCloseTo(target, 9);
}

/**
 * 真的抽 `SWINGS` 次籤。每一發先快照 `world.rng.state`，用同一顆亂數算「照 `p` 該不該中」，
 * 再讓引擎自己跑 —— 逐發相等 ⇒ 門檻是 `p` **而且**抽籤仍在同一個位置。回傳中了幾發。
 */
function replay(r: Rig, p: number): number {
  let fires = 0;
  for (let i = 0; i < SWINGS; i++) {
    const probe = new Rng(0);
    probe.state = r.world.rng.state;
    const expected = probe.chance(p);
    const fired =
      fireHooks(r.world, r.attacker, "onBasicAttack", r.victim, undefined, undefined, undefined, withChanceFrom) > 0;
    expect(fired, `第 ${i} 發：門檻 ${p}`).toBe(expected);
    if (fired) fires++;
    r.world.tick++;
  }
  return fires;
}

describe("GH#1054 chanceFrom.flat —— 機率門檻的常數項", () => {
  it("① 華山劍法 0／75／150 敏：每一發都等於卡面 clamp(flat + 敏 × coeff)", () => {
    const cf = huashan.passive!.ranks[0]!.hooks![0]!.chanceFrom!;
    expect(cf.flat).toBeGreaterThan(0); // 文件真的帶著常數項（⛔ 不是 min 假扮的）
    const r = rig();
    const ab = r.world.abilities.get(r.attacker)!;
    ab.slots.Q = { abilityId: huashan.id as never, rank: 1, cooldownRemainingTicks: 0 };
    syncAbilityPassives(r.world, r.attacker); // 出貨的掛載路徑
    expect(r.world.stats.get(r.attacker)!.sources.some((s) => s.hooks?.some(withChanceFrom))).toBe(true);
    for (const agi of [0, 75, 150]) {
      setAgi(r, agi);
      const p = thresholdOf(cf, agi);
      if (agi === 0) expect(p).toBe(cf.flat); // 0 敏 ⇒ 只剩常數項，這一點正是突變會紅的地方
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
    // ⭐ 刻意寫 #1054 **之前**那一條算式，⛔ 不經 thresholdOf：這一條守的是「舊文件的答案沒變」。
    const before1054 = Math.min(cf.max, Math.max(cf.min, agi * cf.coeff));
    expect(replay(r, before1054)).toBeGreaterThan(0);
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

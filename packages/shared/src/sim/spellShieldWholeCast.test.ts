/**
 * GH#1091 —— 法術護盾擋**整發**（07-01 臨、兵、鬥 / 原作 `ANss` Spell Shield）。
 *
 * GH#1085 只擋得了狀態那一半 ⇒ 一支「傷害＋減益」的敵方法術打上來時，減益被吃掉
 * 而**傷害照樣落地**。這一支釘的是那個缺口：整發消失。
 *
 * 出貨內容、真的 world、真的 `castAbility` ＋ 真的 `castResolveSystem`。
 * ⛔ 不記任何敵方技能的 id —— 從註冊表挑「指定目標／範圍、同時有 damage 與一份
 * 帶 `debuff` 標籤的狀態、且沒有條件葉」的那一支（形態⑤／⑥）。
 *
 * ⭐ 量尺**兩個方向都跑**（一把只驗單邊的尺不算自證過）：
 *   · 護盾在 ＋ 指定目標 ⇒ 傷害**沒進**、減益沒中、護盾碎、客戶端收到 `immune`
 *   · 護盾碎了 ⇒ 第二發傷害與減益**都進來**（⛔ 不是「這支技能本來就打不到」）
 *   · 開關 `status-only` ⇒ 減益沒中而**傷害進來**（＝ #1085 那一版，一鍵 rollback）
 *   · **範圍技** ⇒ 傷害進來、減益仍被狀態那道閘擋下（原作只擋指定目標）
 *
 * 突變紀錄：`sim/spellWardCast.ts` 的 `if (world.shieldRules… !== "whole") return false;`
 * 改成無條件 `return false` ⇒ 第一條 `first.hit` 紅（傷害落地）。用 Edit 改回來。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles, Statuses } from "./content/registry";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { spellWardRefusesCast } from "./spellWardCast";
import type { SpellWardScope } from "./shieldRules";
import type { EffectDef } from "./effects/effect";
import type { CastTarget } from "./intents";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../..", "content");
const USHIO = "godie-hpb1" as ChampionId;
const SHIELD = "spell-shield";
const NO_INTENTS = new Map();
type Slot = "Q" | "W" | "E" | "R";
const SLOTS: readonly Slot[] = ["Q", "W", "E", "R"];

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
});

interface Spell { champion: ChampionId; abilityId: AbilityId; slot: Slot; statusId: string }

/** 出貨裡挑一支「這個 castType、有傷害、也掛一份 debuff、沒有條件葉」的敵方技能。 */
function pick(castType: "targeted" | "ground"): Spell {
  for (const a of Abilities.all()) {
    if (a.castType !== castType) continue;
    if (a.effects.some((e) => e.condition !== undefined)) continue;
    if (!a.effects.some((e) => e.kind === "damage")) continue;
    const st = a.effects.find(
      (e): e is Extract<EffectDef, { kind: "applyStatus" }> =>
        e.kind === "applyStatus" &&
        e.applyTo !== "self" &&
        (Statuses.tryGet(e.statusId)?.tags ?? []).includes("debuff"),
    );
    if (st === undefined) continue;
    const champion = a.id.slice(0, a.id.lastIndexOf(".")) as ChampionId;
    const def = Champions.tryGet(champion);
    const slot = def === undefined ? undefined : SLOTS.find((s) => def.abilities[s].id === a.id);
    if (slot === undefined) continue;
    return { champion, abilityId: a.id, slot, statusId: String(st.statusId) };
  }
  throw new Error(`⛔ 出貨裡挑不到 ${castType}「傷害＋debuff」的技能 —— 夾具前提消失了`);
}

interface Stage { world: SimWorld; hero: EntityId; foes: EntityId[]; spell: Spell }

function stage(castType: "targeted" | "ground", scope: SpellWardScope = "whole"): Stage {
  const spell = pick(castType);
  const world = new SimWorld(SKELETON_ARENA, 1091);
  world.combatActive = true;
  world.shieldRules = { ...world.shieldRules, spellWardBlocksWholeCast: scope };
  const c = SKELETON_ARENA.zones[0]!.center;
  const hero = spawnChampion(world, { championId: USHIO, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: c.x, z: c.z }, zone: 0 });
  // 兩位敵人各放一次 —— 「第二發」不必等冷卻。
  const foes = [1, 2].map((i) =>
    spawnChampion(world, { championId: spell.champion, seatId: asSeatId(i), teamId: asTeamId(1), pos: { x: c.x + 2, z: c.z + (i - 1.5) * 2 }, zone: 0 }),
  );
  for (const f of foes) world.abilities.get(f)!.slots[spell.slot].rank = 1;
  world.step(NO_INTENTS);
  return { world, hero, foes, spell };
}

const refill = (world: SimWorld, id: EntityId): void => { world.health.get(id)!.mana = 9999; };
const shieldUp = (world: SimWorld, id: EntityId): boolean =>
  world.stats.get(id)!.sources.some((s) => s.statusId === SHIELD);

function castQ(world: SimWorld, hero: EntityId): void {
  refill(world, hero);
  expect(castAbility(world, hero, "Q", { type: "self" })).toBe("ok");
  for (let i = 0; i < 30 && !shieldUp(world, hero); i++) world.step(NO_INTENTS);
  expect(shieldUp(world, hero), "⛔ 放了 Q 沒有掛上護盾 —— 夾具壞了").toBe(true);
}

/** 敵方對英雄放那一支；三個旗標**逐 tick latch**（`world.events` 每一 tick 被清空）。 */
function hostileCast(s: Stage, foe: EntityId, castType: "targeted" | "ground"): { hit: boolean; landed: boolean; beat: boolean } {
  const { world, hero, spell } = s;
  refill(world, foe);
  const at = world.transform.get(hero)!.pos;
  const target: CastTarget = castType === "ground"
    ? { type: "point", point: { x: at.x, z: at.z } }
    : { type: "entity", entityId: hero };
  expect(castAbility(world, foe, spell.slot, target)).toBe("ok");
  const origin = `ability:${spell.abilityId}`;
  let hit = false, landed = false, beat = false;
  // 出貨的指定目標技能**全部**有吟唱（105/105），最長 2.267 秒 ⇒ 150 tick 綽綽有餘。
  for (let i = 0; i < 150; i++) {
    world.step(NO_INTENTS);
    for (const e of world.events) {
      if (e.data["target"] !== hero) continue;
      if (e.type === "damage" && e.data["origin"] === origin) hit = true;
      if (e.type === "immune") beat = true;
    }
    if ((world.status.get(hero)?.effects ?? []).some((x) => x.statusId === spell.statusId)) landed = true;
  }
  return { hit, landed, beat };
}

describe("GH#1091 法術護盾 —— 擋整發（傷害＋減益一起消失）", () => {
  it("指定目標的「傷害＋減益」整發消失、護盾碎、客戶端收到那一拍；第二發傷害與減益都進來", () => {
    const s = stage("targeted");
    castQ(s.world, s.hero);
    const first = hostileCast(s, s.foes[0]!, "targeted");
    expect(first.hit, `${s.spell.abilityId} 的**傷害**應該跟著整發一起被吃掉（#1085 的缺口）`).toBe(false);
    expect(first.landed, "減益也應該被吃掉").toBe(false);
    expect(first.beat, "擋下了但客戶端收不到 immune —— 玩家看不到（形態②）").toBe(true);
    expect(shieldUp(s.world, s.hero), "擋下一次之後護盾應該碎掉").toBe(false);
    const second = hostileCast(s, s.foes[1]!, "targeted");
    expect(second.hit, "護盾已碎，第二發的傷害要進來（⛔ 不是這支技能本來就打不到）").toBe(true);
    expect(second.landed, "護盾已碎，第二發的減益要中").toBe(true);
  });

  it("開關關成 status-only ⇒ 逐位元回到 #1085：減益沒中，⭐ 而傷害照樣落地", () => {
    const s = stage("targeted", "status-only");
    castQ(s.world, s.hero);
    const r = hostileCast(s, s.foes[0]!, "targeted");
    expect(r.hit, "只擋狀態的那一版，傷害是會進來的 —— 這一格就是 rollback 的證據").toBe(true);
    expect(r.landed, "狀態那道閘（#1085）仍然要擋下減益").toBe(false);
    expect(shieldUp(s.world, s.hero)).toBe(false);
  });

  it("範圍技不吃整發攔截（原作只擋指定目標）：傷害進來，減益仍由狀態那道閘擋下", () => {
    const s = stage("ground");
    castQ(s.world, s.hero);
    const r = hostileCast(s, s.foes[0]!, "ground");
    expect(r.hit, "⛔ 範圍技被整發擋掉了 —— 那會讓一層護盾吃掉一波殭屍潮").toBe(true);
    expect(r.landed, "範圍技帶來的減益仍該被狀態那道閘吃掉").toBe(false);
    expect(shieldUp(s.world, s.hero)).toBe(false);
  });

  it("同隊的指定目標法術不消耗護盾（卡面說的是「對方」）", () => {
    const s = stage("targeted");
    castQ(s.world, s.hero);
    const c = SKELETON_ARENA.zones[0]!.center;
    const ally = spawnChampion(s.world, { championId: s.spell.champion, seatId: asSeatId(3), teamId: asTeamId(0), pos: { x: c.x - 2, z: c.z }, zone: 0 });
    const def = Abilities.get(s.spell.abilityId);
    expect(spellWardRefusesCast(s.world, ally, def, [s.hero], `ability:${s.spell.abilityId}`)).toBe(false);
    expect(spellWardRefusesCast(s.world, s.hero, def, [s.hero], `ability:${s.spell.abilityId}`)).toBe(false);
    expect(shieldUp(s.world, s.hero), "自己人／自己的法術不該打破護盾").toBe(true);
  });
});

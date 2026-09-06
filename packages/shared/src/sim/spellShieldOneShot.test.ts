/**
 * GH#1085 —— 07-01 臨、兵、鬥「可抵擋對方負性魔法」：**擋一次就消耗**（原作 ANss Spell Shield）。
 *
 * 出貨內容、真的 world、真的 `castAbility`（蒼月潮的 Q ＋ 出貨裡挑出來的一支敵方負面狀態技能）、
 * 真的 `applyStatus` 消費端。⛔ 不記敵方技能的 id —— 從註冊表挑「指定目標、唯一效果是掛一份帶
 * `debuff` 標籤的狀態」的那一支：內容哪天改了，夾具跟著挑別支，⛔ 不會用錯的訊息紅（形態⑤／⑥）。
 * 驗機制不驗數字：斷言全部是「掛上了沒有」「護盾還在不在」「客戶端收沒收到那一拍」。
 *
 * 兩個方向一起讀（一把只驗單邊的尺不算自證過）：
 *   · 有護盾 ⇒ 第一份敵方減益掛不上、護盾消失、客戶端收得到 `immune`（打擊點的「免疫」浮字）
 *   · 護盾消耗後 ⇒ 第二份掛得上（一次性，⛔ 不是無限次）；沒放 Q 的同一具身體第一份就掛得上
 *   · 自己的東西（W 的 moon-combo、自己給自己的減益）⇒ 不被自己的護盾吃掉、也不消耗它
 *
 * 突變紀錄：`effects/applyStatus.ts` 的 `spendImmunityCharge` 那一行改成永遠不扣 ⇒
 * 「第二發 ⇒ 中」紅（第二份也被擋）。用 Edit 改回來。
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
import { runEffects } from "./effects/effectRunner";
import type { EffectDef } from "./effects/effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type StatusId } from "../ids";

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

interface HostileSpell { champion: ChampionId; abilityId: AbilityId; slot: Slot; statusId: string }

/** 出貨裡挑一支「指定目標、唯一效果是掛一份帶 debuff 標籤的狀態」的敵方技能。 */
function pickHostileSpell(): HostileSpell {
  for (const a of Abilities.all()) {
    if (a.castType !== "targeted" || a.effects.length !== 1) continue;
    const fx = a.effects[0]!;
    if (fx.kind !== "applyStatus" || fx.applyTo === "self" || fx.condition !== undefined) continue;
    if (!(Statuses.tryGet(fx.statusId)?.tags ?? []).includes("debuff")) continue;
    const champion = a.id.slice(0, a.id.lastIndexOf(".")) as ChampionId;
    const def = Champions.tryGet(champion);
    const slot = def === undefined ? undefined : SLOTS.find((s) => def.abilities[s].id === a.id);
    if (slot === undefined) continue;
    return { champion, abilityId: a.id, slot, statusId: String(fx.statusId) };
  }
  throw new Error("⛔ 出貨裡挑不到「指定目標、只掛一份 debuff 狀態」的技能 —— 夾具前提消失了");
}

function stage(seed = 1085): { world: SimWorld; hero: EntityId; foes: EntityId[]; spell: HostileSpell } {
  const spell = pickHostileSpell();
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;
  const hero = spawnChampion(world, { championId: USHIO, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: c.x, z: c.z }, zone: 0 });
  // 兩位敵人各放一次 —— 「第二發」不必碰冷卻。
  const foes = [1, 2].map((i) =>
    spawnChampion(world, { championId: spell.champion, seatId: asSeatId(i), teamId: asTeamId(1), pos: { x: c.x + 2, z: c.z + (i - 1.5) * 2 }, zone: 0 }),
  );
  for (const f of foes) world.abilities.get(f)!.slots[spell.slot].rank = 1;
  world.step(NO_INTENTS);
  return { world, hero, foes, spell };
}

const refill = (world: SimWorld, id: EntityId): void => { world.health.get(id)!.mana = 9999; };
const shieldUp = (world: SimWorld, id: EntityId): boolean => world.stats.get(id)!.sources.some((s) => s.statusId === SHIELD);
const has = (world: SimWorld, id: EntityId, statusId: string): boolean =>
  (world.status.get(id)?.effects ?? []).some((e) => e.statusId === statusId);

function castQ(world: SimWorld, hero: EntityId): void {
  refill(world, hero);
  expect(castAbility(world, hero, "Q", { type: "self" })).toBe("ok");
  for (let i = 0; i < 30 && !shieldUp(world, hero); i++) world.step(NO_INTENTS);
  expect(shieldUp(world, hero), "⛔ 放了 Q 沒有掛上護盾 —— 夾具壞了").toBe(true);
}

/** 敵方對英雄放那一支；回「狀態掛上了沒」與「客戶端有沒有收到 immune 那一拍」。 */
function hostileCast(world: SimWorld, foe: EntityId, hero: EntityId, spell: HostileSpell): { landed: boolean; beat: boolean } {
  refill(world, foe);
  expect(castAbility(world, foe, spell.slot, { type: "entity", entityId: hero })).toBe("ok");
  let landed = false;
  let beat = false;
  for (let i = 0; i < 90 && !landed && !beat; i++) {
    world.step(NO_INTENTS);
    landed = has(world, hero, spell.statusId);
    // ⚠️ GH#1091 之後這一拍**有兩個發射站**：狀態那道閘（`applyStatus`，帶
    // `statusId`）與整發攔截（`spellWardCast`，⛔ 沒有 statusId —— 被擋的是整發，
    // 「哪一份狀態」沒有答案）。⇒ 這裡問的是「客戶端有沒有收到免疫那一拍」，
    // ⛔ 不是「哪一份狀態被擋」；釘住 statusId 會讓這條守衛在整發攔截打開的那一天
    // 紅得像回歸，而它其實是前提消失了（一條綠燈的第④種假來源）。
    beat = world.events.some((e) => e.type === "immune" && e.data["target"] === hero);
  }
  return { landed, beat };
}

describe("GH#1085 07-01 臨、兵、鬥 —— 擋一次負面魔法就消耗", () => {
  it("Q 之後：敵方的負面狀態掛不上、護盾消失、客戶端收到「免疫」那一拍；第二發 ⇒ 中", () => {
    const { world, hero, foes, spell } = stage();
    castQ(world, hero);
    const first = hostileCast(world, foes[0]!, hero, spell);
    expect(first.landed, `${spell.abilityId} 的 ${spell.statusId} 應該被護盾擋下`).toBe(false);
    expect(first.beat, "擋下了但客戶端收不到 immune —— 玩家看不到（形態②）").toBe(true);
    expect(shieldUp(world, hero), "擋下一次之後護盾應該消失").toBe(false);
    const second = hostileCast(world, foes[1]!, hero, spell);
    expect(second.landed, "護盾已消耗，第二份應該掛得上（一次性，⛔ 不是無限次）").toBe(true);
  });

  it("沒放 Q 的同一具身體，第一份就掛得上（⛔ 不是那支技能本來就掛不上）", () => {
    const { world, hero, foes, spell } = stage();
    expect(hostileCast(world, foes[0]!, hero, spell).landed).toBe(true);
  });

  it("自己的東西不被自己的護盾吃掉：W 的 moon-combo 照掛、自己給自己的減益不消耗護盾", () => {
    const { world, hero, foes, spell } = stage();
    world.abilities.get(hero)!.slots.W.rank = 1;
    castQ(world, hero);
    refill(world, hero);
    expect(castAbility(world, hero, "W", { type: "entity", entityId: foes[0]! })).toBe("ok");
    for (let i = 0; i < 60 && !has(world, hero, "moon-combo"); i++) world.step(NO_INTENTS);
    expect(has(world, hero, "moon-combo"), "07-02 的連段窗被自己的護盾吃掉了").toBe(true);
    expect(shieldUp(world, hero)).toBe(true);
    // 自己施加給自己的減益（走真的 applyStatus 消費端）：掛得上，護盾也還在。
    runEffects(
      [{ kind: "applyStatus", statusId: spell.statusId as StatusId, duration: 2 } as EffectDef],
      { world, caster: hero, rank: 1, targets: [hero], origin: "test:self", rng: world.rng },
    );
    expect(has(world, hero, spell.statusId)).toBe(true);
    expect(shieldUp(world, hero), "自己的減益不該打破自己的護盾（卡面說的是「對方」）").toBe(true);
  });
});

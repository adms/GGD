/**
 * Task #78 phase 3 — BEHAVIOURAL proof for the ported WC3 abilities.
 *
 * Every assertion here drives the real sim against the real content docs and
 * checks what HAPPENED: hp actually removed, a stat actually present in the
 * final block, an AoE's actual hit set, a proc actually firing, an ally
 * actually restored. A data-shape test ("the doc has kind: damage") would have
 * passed for every one of the abilities this pass repaired — 龍宮禮奈's crit
 * passive was a 6-second self-buff, 佐助's Q dealt literally zero, 初音's EX
 * damaged the ally it is supposed to heal — so shape assertions are exactly
 * what must NOT be relied on.
 *
 * Sources for the numbers are quoted in `docs/content/reconciliation/` and, per
 * ability, in the patch that produced the doc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 2026-08-12 —— 四支已經**不再驗 w3x 原作**，改驗 owner 的新版設計。
 *
 * owner 2026-08-12 裁決（逐字）：「**(c) 分開**，但預設**一律以我新版的優先**，
 * 除非我的設計有明顯的缺失你可以來問我」。
 *
 * 被取代的是 `godie-h01u.q`（80-01 天下無雙）、`godie-h01u.passive`
 * （80-00 飛將神弓）、`godie-h01u.e`（80-03 鬼神烈戟）、`godie-edem.r`
 * （45-04 哥哥）。**原作的 w3a / JASS rawcode 與數值沒有丟掉** —— 逐支存在
 * ⭐ `docs/_w3x-fidelity-superseded.md`（task #78 的結論在那裡繼續活著）。
 * 這四條測試的斷言換了期望值與驅動方式，**沒有拔掉任何一條斷言**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 2026-08-13 —— Saber `godie-e00q` 已經**不在營運名單上**
 *
 * owner 把沒上架的英雄連技能一起搬進 `content/_legacy/`（不在 `COLLECTION_NAMES`
 * 裡，引擎預設讀不到）。Aamk 那兩條（69-01 力量強化 / 69-04 魔力增幅）的主角就是
 * 他，而且**全營運內容裡再也沒有第二支同型技能** —— 我掃過留下的 461 支：屬性按鈕
 * 型的常駐加值（`effects: []` + `passive.ranks[].modifiers` 給 ad/maxHealth/
 * maxMana）在營運母體裡歸零了。
 *
 * ⛔ 所以這兩條不能「換一位英雄重寫」，也不可以 `.skip` 掉。做的是**把封存的那一位
 * 明確加回這個 registry**（只有他一位，見 `ARCHIVED_SUBJECTS`），斷言一條沒動。
 * 理由同 CLAUDE.md：⭐「『分開』不是『丟掉』…… 知識不可以無聲消失」——
 * 「屬性按鈕被匯入成傷害核彈」是真的發生過的匯入器缺陷，守衛留著才擋得住它回來。
 *
 * ⚠️ 這一項要拿給 owner 決定：Saber 若確定不回來，這兩條該退役（連同 `Aamk` 匯入
 * 器守衛整條線）；⛔ 但那是排序的決定，不是我的（第零守則⑧）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import type { ContentStore } from "../../content/store";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { castAbility, rankUpAbility, learnEx } from "./abilitySystem";
import { Stat } from "../stats/statTypes";
import { championStatBase } from "../stats/attributes";
import { attachSource } from "../stats/statPipeline";
import { ModOp } from "../stats/modifiers";
import { finalizeStat } from "../baseBonus";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import type { CoreAbilitySlot } from "../intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
/**
 * Test anchor. SKELETON_ARENA puts a radius-2.5 PILLAR on each zone centre (and
 * two more at ±9/∓8), so spawning the rig on the centre drops both bodies
 * inside an obstacle and MovementSystem shoves them ~6 units apart — far enough
 * that no melee auto ever lands. Everything here is anchored 14 units "north"
 * of the centre instead, which is clear of all three pillars and well inside
 * the 24-unit boundary.
 */
const P = { x: Z0.center.x, z: Z0.center.z + 14 };
const NO_INTENTS = new Map();

/**
 * Heroes this suite still needs a doc for after they left the operational
 * roster. ⛔ 刻意逐位點名, 不是「把 `content/_legacy/` 整個載進來」—— 其餘 40 位
 * 沒有守衛在等他們, 全載進來只會讓這個 registry 跟營運母體不一樣而已。
 */
const ARCHIVED_SUBJECTS = ["godie-e00q"] as const;
const ARCHIVE_DIR = join(CONTENT_DIR, "_legacy");

/** Put one archived champion + all of its ability docs into the loaded store. */
function addArchivedChampion(store: ContentStore, cid: string): void {
  const champPath = join(ARCHIVE_DIR, "champions", `${cid}.json`);
  // If he ever comes BACK to the operational roster this must not shadow the
  // live doc — the loader already put it in the store, so bail out.
  if (store.has("champions", cid)) return;
  if (!existsSync(champPath)) {
    throw new Error(`${cid}: 營運目錄與 content/_legacy/ 都沒有這位英雄`);
  }
  store.add("champions", cid, JSON.parse(readFileSync(champPath, "utf-8")));
  const abilityDir = join(ARCHIVE_DIR, "abilities");
  for (const f of readdirSync(abilityDir)) {
    if (!f.startsWith(`${cid}.`) || !f.endsWith(".json")) continue;
    const doc = JSON.parse(readFileSync(join(abilityDir, f), "utf-8")) as { id: string };
    if (!store.has("abilities", doc.id)) store.add("abilities", doc.id, doc);
  }
}

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  for (const cid of ARCHIVED_SUBJECTS) addArchivedChampion(res.store, cid);
  registerAll(res.store);
});

// ------------------------------------------------------------------ helpers
let seat = 0;
function mk(world: SimWorld, championId: string, team: number, dx: number, dz = 0): EntityId {
  return spawnChampion(world, {
    championId: championId as ChampionId,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: { x: P.x + dx, z: P.z + dz },
    zone: 0,
  });
}

/**
 * Raise `slot` to `rank` through the real rank-up path (points + ult gate),
 * then let the pipeline settle: `attachSource` only marks stats dirty, exactly
 * as buying an item does — `statRecomputeSystem` folds it in on the next tick.
 */
function toRank(world: SimWorld, id: EntityId, slot: CoreAbilitySlot, rank: number): void {
  world.ultGateOverride = true;
  const ab = world.abilities.get(id)!;
  while (ab.slots[slot].rank < rank) {
    ab.unspentPoints = 1;
    expect(rankUpAbility(world, id, slot)).toBe(true);
  }
  world.step(NO_INTENTS);
  world.rebuildGrid();
}

/** Refill mana so a cast is never rejected for an unrelated reason. */
function topUpMana(world: SimWorld, id: EntityId): void {
  world.health.get(id)!.mana = 1e6;
}

function stats(world: SimWorld, id: EntityId): Record<Stat, number> {
  return world.stats.get(id)!.final;
}

/**
 * The champion's LEVEL-1 base for `stat`, 三圍 included (task #248).
 *
 * These fidelity assertions are all of the form "the passive adds exactly N on
 * top of the hero's own base", so the baseline has to be the hero's REAL base.
 * `def.baseStats[stat]` is no longer that: since #248 it is the raw w3x card
 * (呂布 `ad` 6, not the 33 he fights with) and the attribute term is added by
 * `recomputeStats`. Reading it directly would make every one of these tests
 * assert the wrong number while still looking correct.
 */
function champBase(championId: string, stat: Stat): number {
  // ...and since v0.9.9 it is not `championStatBase` alone either: the pipeline
  // finishes with 環境倍率 → 基礎加成 → clamp (`finalizeStat`, sim/baseBonus.ts).
  // Stopping at the card would put every assertion below 300 HP under what the
  // hero actually fights with — the same class of wrongness the note above
  // describes, one layer further out.
  return finalizeStat(championStatBase(Champions.get(championId as ChampionId), stat, 1), stat);
}

/**
 * Step out an in-progress cast's 起手 (wind-up) and return the ticks it took.
 *
 * Since the owner's telegraph rule every ability carries a `castTimeSec`
 * (unset -> 0.6 s, previously-set +0.3 s), so effects no longer run inside
 * `castAbility` — they DEFER into `ab.cast` and fire from `CastResolveSystem`
 * when the wind-up elapses. A test that casts and then steps a fixed 1-3 ticks
 * is therefore asserting on a spell that has not gone off yet. This waits for
 * the real thing rather than hard-coding a tick count, so the assertions below
 * keep testing WHAT HAPPENED (the point of this file) and stay correct if a
 * cast time is retuned again.
 */
function windUp(world: SimWorld, id: EntityId, maxTicks = 120): number {
  const ab = world.abilities.get(id)!;
  let n = 0;
  while (ab.cast && n < maxTicks) {
    world.step(NO_INTENTS);
    n++;
  }
  expect(ab.cast, "cast never resolved — interrupted, or maxTicks too low").toBeNull();
  return n;
}

/** Step the world once and return the `damage` events it produced. */
function stepDamage(world: SimWorld): { target: EntityId; amount: number; crit: boolean; origin: string }[] {
  world.step(NO_INTENTS);
  return world.events
    .filter((e) => e.type === "damage")
    .map((e) => e.data as unknown as { target: EntityId; amount: number; crit: boolean; origin: string });
}

/**
 * Point `attacker` at `victim` and run `ticks` ticks of autos, pinning both
 * bodies (knockback would shove the bag out of reach) and topping the bag up so
 * nothing dies mid-sample. Returns every `damage` event that landed on it.
 */
function autoAttack(world: SimWorld, attacker: EntityId, victim: EntityId, ticks: number) {
  const hits: { amount: number; crit: boolean; origin: string }[] = [];
  const ap = { ...world.transform.get(attacker)!.pos };
  const vp = { ...world.transform.get(victim)!.pos };
  for (let i = 0; i < ticks; i++) {
    world.nav.get(attacker)!.attackTarget = victim;
    world.transform.get(attacker)!.pos = { ...ap };
    world.transform.get(victim)!.pos = { ...vp };
    const hp = world.health.get(victim)!;
    hp.hp = hp.maxHp;
    for (const d of stepDamage(world)) {
      if (d.target === victim) hits.push({ amount: d.amount, crit: d.crit, origin: d.origin });
    }
  }
  return hits;
}

/**
 * The still-live buff sources one ability's passive hook has attached.
 *
 * ⚠️ 前綴要**指名到那一支技能**：呂布身上同時有 80-01（Q，普攻疊加）與 80-00
 * （天生技，擊殺疊加）兩條 hook 在掛 buff，`applyBuff` 沒有 `stackKey` 時的 id 是
 * `buff:hook:abilityPassive:<abilityId>#<tick>`，所以「一次施加 = 一份來源」——
 * 層數就是這個陣列的長度。過期的來源可能還躺在陣列上（`buffExpirySystem` 在它
 * 自己的相位收），所以這裡自己濾掉。
 */
function passiveBuffs(world: SimWorld, id: EntityId, abilityId: string) {
  return world.stats
    .get(id)!
    .sources.filter(
      (s) =>
        s.id.startsWith(`buff:hook:abilityPassive:${abilityId}#`) &&
        (s.expiresAtTick === undefined || s.expiresAtTick > world.tick),
    );
}
const lubuQStacks = (w: SimWorld, id: EntityId) => passiveBuffs(w, id, "godie-h01u.q");
const lubuKillStacks = (w: SimWorld, id: EntityId) => passiveBuffs(w, id, "godie-h01u.passive");

/**
 * One tick of "keep swinging at this bag" — the same pinning `autoAttack` does
 * （擊退會把沙包推出射程，沙包死掉會停）, but it hands the tick back so the caller
 * can read the stat pipeline BETWEEN swings, which is the whole point for a
 * 1-second on-attack buff.
 */
function swinger(world: SimWorld, attacker: EntityId, victim: EntityId): () => void {
  const ap = { ...world.transform.get(attacker)!.pos };
  const vp = { ...world.transform.get(victim)!.pos };
  return () => {
    world.nav.get(attacker)!.attackTarget = victim;
    world.transform.get(attacker)!.pos = { ...ap };
    world.transform.get(victim)!.pos = { ...vp };
    const hp = world.health.get(victim)!;
    hp.hp = hp.maxHp;
    world.step(NO_INTENTS);
  };
}

// ============================================================ permanent passives
describe("WC3 permanent passives are permanent (task #78)", () => {
  it("染血的柴刀 AOcr grants the map's real crit chance AND multiplier, and cannot be cast", () => {
    cover("fidelity-passive-crit");
    const world = new SimWorld(SKELETON_ARENA, 7);
    const rena = mk(world, "godie-e001", 0, -3);

    // W unlearned: the champion has NO crit at all
    expect(stats(world, rena)[Stat.CritChance]).toBe(0);

    // rank 1 -> w3a 致命一擊機率 18 % × 傷害乘數 1.25 (was: +25 % crit for 6 s)
    toRank(world, rena, "W", 1);
    expect(stats(world, rena)[Stat.CritChance]).toBeCloseTo(0.18, 6);
    expect(stats(world, rena)[Stat.CritDamage]).toBeCloseTo(1.25, 6);

    // rank 4 REPLACES rank 1 (12 % × 3.5) — a stacking bug would read 0.60
    toRank(world, rena, "W", 4);
    expect(stats(world, rena)[Stat.CritChance]).toBeCloseTo(0.12, 6);
    expect(stats(world, rena)[Stat.CritDamage]).toBeCloseTo(3.5, 6);

    // and it is not an ability you can press: no mana spent, no cooldown started
    const mana = world.health.get(rena)!.mana;
    expect(castAbility(world, rena, "W", { type: "self" })).toBe("passive");
    expect(world.health.get(rena)!.mana).toBe(mana);
    expect(world.abilities.get(rena)!.slots.W.cooldownRemainingTicks).toBe(0);
  });

  it("染血的柴刀's crit multiplier is what basic attacks actually crit for", () => {
    cover("fidelity-passive-crit-lands");
    const world = new SimWorld(SKELETON_ARENA, 11);
    const rena = mk(world, "godie-e001", 0, -0.7);
    const bag = mk(world, "godie-hart", 1, 0.7);
    toRank(world, rena, "W", 1); // 18 % × 1.25

    const hits = autoAttack(world, rena, bag, 4000).filter((h) => h.origin === "basic");
    const crits = hits.filter((h) => h.crit);
    const plain = hits.filter((h) => !h.crit);
    expect(crits.length).toBeGreaterThan(0);
    expect(plain.length).toBeGreaterThan(0);
    // a crit is EXACTLY the native 1.25x multiplier, not GGD's 1.75 default
    expect(crits[0]!.amount / plain[0]!.amount).toBeCloseTo(1.25, 5);
  });

  // owner 2026-08-12 裁決：「(c) 分開，但預設一律以我新版的優先」——
  // 舊行為 天下無雙 = 常駐 +25/+50/+75/+100 AD 配 -3/-6/-9/-12 armor（A0N5 Iatt /
  // A0N4 Idef，逐階取代），新規格 = 「每次[普通攻擊時]都會增加 10%[攻擊速度]並可
  // [疊加]，持續1秒，若沒有繼續攻擊則[疊加]的[攻擊速度]增益歸零」。
  // 原作數值存在 docs/_w3x-fidelity-superseded.md §1。
  it("天下無雙 是普攻觸發、會疊加、一秒歸零的攻速增益 —— 站著不動一格加成都沒有", () => {
    cover("fidelity-passive-lubu-q");
    const world = new SimWorld(SKELETON_ARENA, 3);
    // Q starts LEARNED at spawn, so its passive must already be attached
    const lubu = mk(world, "godie-h01u", 0, -0.7);
    const bag = mk(world, "godie-hart", 1, 0.7);
    world.step(NO_INTENTS);
    world.rebuildGrid();
    const baseAd = champBase("godie-h01u", Stat.AttackDamage);
    const baseArmor = champBase("godie-h01u", Stat.Armor);
    const baseAs = champBase("godie-h01u", Stat.AttackSpeed);

    // 站著不動：舊版這一刻已經是 +25 AD / -3 armor，新版**什麼都沒有**
    expect(stats(world, lubu)[Stat.AttackDamage]).toBeCloseTo(baseAd, 4);
    expect(stats(world, lubu)[Stat.Armor]).toBeCloseTo(baseArmor, 4);
    expect(stats(world, lubu)[Stat.AttackSpeed]).toBeCloseTo(baseAs, 6);

    toRank(world, lubu, "Q", 4); // 舊版 lv5 = +100 AD / -12 armor
    expect(stats(world, lubu)[Stat.AttackDamage]).toBeCloseTo(baseAd, 4);
    expect(stats(world, lubu)[Stat.Armor]).toBeCloseTo(baseArmor, 4);

    // 真的揮出一刀 → 一份 10% 攻速的來源掛上來（這是新規格的全部機制）
    const swing = swinger(world, lubu, bag);
    let n = 0;
    while (lubuQStacks(world, lubu).length === 0 && n < 200) {
      swing();
      n++;
    }
    expect(n, "普攻打了 200 tick 都沒有掛上 天下無雙 的增益").toBeLessThan(200);
    expect(stats(world, lubu)[Stat.AttackSpeed]).toBeCloseTo(baseAs * 1.1, 6);

    // 「若沒有繼續攻擊則歸零」—— 停手一秒，來源與加成一起消失
    for (let i = 0; i < Math.round(1 / world.dt) + 3; i++) world.step(NO_INTENTS);
    expect(lubuQStacks(world, lubu).length).toBe(0);
    expect(stats(world, lubu)[Stat.AttackSpeed]).toBeCloseTo(baseAs, 6);
  });

  // owner 2026-08-12 裁決（同上）—— 「[疊加]」那半個規格。
  // 出貨攻速一刀要 1.44 s，比 1 s 的持續時間長，所以兩層永遠碰不到面；這裡墊一份
  // 攻速讓一秒打得完兩下，被測的仍然是**真的普攻走真的 hook** 掛出來的那些來源。
  it("天下無雙 的層數真的會同時存在並且相加（不是一份來源被刷新）", () => {
    cover("fidelity-passive-lubu-q-stacks");
    const world = new SimWorld(SKELETON_ARENA, 71);
    const lubu = mk(world, "godie-h01u", 0, -0.7);
    const bag = mk(world, "godie-hart", 1, 0.7);
    attachSource(world, lubu, {
      id: "rig:attack-speed",
      kind: "item",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: 1.0 }],
    });
    world.step(NO_INTENTS);
    world.rebuildGrid();

    const swing = swinger(world, lubu, bag);
    const asAt = new Map<number, number>();
    for (let i = 0; i < 200; i++) {
      swing();
      const k = lubuQStacks(world, lubu).length;
      if (!asAt.has(k)) asAt.set(k, stats(world, lubu)[Stat.AttackSpeed]);
    }
    expect(asAt.has(1), "連一層都沒掛上").toBe(true);
    expect(asAt.has(2), "兩下普攻只留下一層 —— 層數被刷新掉了，不是疊加").toBe(true);
    expect(asAt.get(2)!).toBeGreaterThan(asAt.get(1)!); // 兩層真的比一層快
  });

  // owner 2026-08-12 裁決（同上）—— 舊行為 飛將神弓 A0AU = 擊殺 +10 AD、10 秒過期，
  // 新規格 = 擊殺 +1% 攻速 +0.01 攻擊距離、duration 99999（≒永久，每殺一層）。
  // 原作數值存在 docs/_w3x-fidelity-superseded.md §2。
  it("飛將神弓 的擊殺疊加還在，但它現在不會過期了", () => {
    cover("fidelity-passive-lubu-onkill");
    const world = new SimWorld(SKELETON_ARENA, 5);
    const lubu = mk(world, "godie-h01u", 0, -0.7);
    const prey = mk(world, "godie-o02p", 1, 0.7);
    world.step(NO_INTENTS);
    const range0 = stats(world, lubu)[Stat.AttackRange];
    expect(lubuKillStacks(world, lubu).length).toBe(0);

    // chip the victim down so the next auto that lands is a killing blow
    const lp = { ...world.transform.get(lubu)!.pos };
    const pp = { ...world.transform.get(prey)!.pos };
    for (let i = 0; i < 400 && world.health.get(prey)!.alive; i++) {
      world.nav.get(lubu)!.attackTarget = prey;
      world.transform.get(lubu)!.pos = { ...lp };
      world.transform.get(prey)!.pos = { ...pp };
      world.health.get(prey)!.hp = 1;
      world.step(NO_INTENTS);
    }
    expect(world.health.get(prey)!.alive).toBe(false);
    world.step(NO_INTENTS); // let the stat recompute land
    // 一次擊殺 = 一層，而且它真的走到 final（不是只躺在 sources 上）
    expect(lubuKillStacks(world, lubu).length).toBe(1);
    const withStack = stats(world, lubu)[Stat.AttackRange];
    expect(withStack).toBeGreaterThan(range0);

    // 舊行為在這裡就過期了（10 s 的 buff，舊斷言跑 15 s 去接那個落差）。
    // 新規格 duration 99999 —— 跑過舊的窗口，它必須還在。
    for (let i = 0; i < Math.round(15 / world.dt) + 5; i++) world.step(NO_INTENTS);
    expect(lubuKillStacks(world, lubu).length).toBe(1);
    expect(stats(world, lubu)[Stat.AttackRange]).toBeGreaterThanOrEqual(withStack);
  });

  it("魔力應援 AOae is a permanent aura buff on its owner, not a 12 s / 60-mana cast", () => {
    cover("fidelity-passive-aura");
    const world = new SimWorld(SKELETON_ARENA, 9);
    const konoka = mk(world, "godie-etyr", 0, -3);
    const baseAs = champBase("godie-etyr", Stat.AttackSpeed);
    const baseMs = champBase("godie-etyr", Stat.MoveSpeed);

    toRank(world, konoka, "W", 1); // w3a 增加攻擊速度 35 %, 增加移動速度 5 %
    expect(stats(world, konoka)[Stat.AttackSpeed]).toBeCloseTo(baseAs * 1.35, 5);
    expect(stats(world, konoka)[Stat.MoveSpeed]).toBeCloseTo(baseMs * 1.05, 5);

    // 500 ticks later it is STILL on (the old doc expired after 10 s / 300 ticks)
    for (let i = 0; i < 500; i++) world.step(NO_INTENTS);
    expect(stats(world, konoka)[Stat.AttackSpeed]).toBeCloseTo(baseAs * 1.35, 5);
  });

  it("魔力激發 (a passive EX) turns on at learnEx and never before", () => {
    cover("fidelity-passive-ex");
    const world = new SimWorld(SKELETON_ARENA, 13);
    const konoka = mk(world, "godie-etyr", 0, -3);
    const base = champBase("godie-etyr", Stat.ManaRegen);

    expect(stats(world, konoka)[Stat.ManaRegen]).toBeCloseTo(base, 5);
    expect(learnEx(world, konoka)).toBe(true);
    world.step(NO_INTENTS);
    // w3a A0ST 增加法力回復 0.07 at its only level
    expect(stats(world, konoka)[Stat.ManaRegen]).toBeCloseTo(base + 0.07, 5);
    expect(castAbility(world, konoka, "EX", { type: "self" })).toBe("passive");
  });

  it("鋼鐵尾巴 AHbh procs ON ATTACK at the map's 10 % chance for the map's bonus damage", () => {
    cover("fidelity-passive-bash-proc");
    const world = new SimWorld(SKELETON_ARENA, 17);
    const pika = mk(world, "godie-ofar", 0, -0.7);
    const bag = mk(world, "godie-hart", 1, 0.7);
    world.step(NO_INTENTS);

    // unlearned: the proc must never fire
    const before = autoAttack(world, pika, bag, 2000);
    expect(before.some((h) => h.origin === "basic")).toBe(true);
    expect(before.some((h) => h.origin.includes("godie-ofar.w"))).toBe(false);

    toRank(world, pika, "W", 1); // w3a 狂怒擊機率 10, 傷害加成 75
    const after = autoAttack(world, pika, bag, 8000);
    const procs = after.filter((h) => h.origin === "hook:abilityPassive:godie-ofar.w");
    const autos = after.filter((h) => h.origin === "basic");
    expect(procs.length).toBeGreaterThan(0); // it fires
    expect(procs.length).toBeLessThan(autos.length); // and it is CHANCED, not every swing
  });
});

// ============================================================ the Aamk leak
describe("the Aamk leak: attribute buttons are stat passives, not damage nukes", () => {
  it("力量強化 grants STR (ad + maxHealth) and deals NO damage to anyone", () => {
    cover("fidelity-aamk-str");
    const world = new SimWorld(SKELETON_ARENA, 23);
    const saber = mk(world, "godie-e00q", 0, -2);
    const victim = mk(world, "godie-hart", 1, 2);
    const baseAd = champBase("godie-e00q", Stat.AttackDamage);
    const baseHp = champBase("godie-e00q", Stat.MaxHealth);

    // Q is learned at spawn: w3a 力量加成 4 -> ad +4, maxHealth +88 (22/STR)
    expect(stats(world, saber)[Stat.AttackDamage]).toBeCloseTo(baseAd + 4, 4);
    expect(stats(world, saber)[Stat.MaxHealth]).toBeCloseTo(baseHp + 88, 4);

    // pressing it does nothing at all — no mana, no cooldown, no damage packet
    const full = world.health.get(victim)!.hp;
    expect(castAbility(world, saber, "Q", { type: "entity", entityId: victim })).toBe("passive");
    for (let i = 0; i < 5; i++) world.step(NO_INTENTS);
    expect(world.health.get(victim)!.hp).toBe(full);

    toRank(world, saber, "Q", 4); // 力量加成 16
    expect(stats(world, saber)[Stat.AttackDamage]).toBeCloseTo(baseAd + 16, 4);
    expect(stats(world, saber)[Stat.MaxHealth]).toBeCloseTo(baseHp + 22 * 16, 4);
  });

  // owner 2026-08-12 裁決：「(c) 分開，但預設一律以我新版的優先」——
  // 舊行為 哥哥 = Aamk 屬性強化（靈敏度加成 12 → armor +3.6、攻速 +24%，常駐），
  // 新規格 =「當『千鳥』命中帶有[燃燒]標記的敵人時引發忍術『麒麟』雷電大爆炸」。
  // 原作數值存在 docs/_w3x-fidelity-superseded.md §4。
  // ⚠️ Aamk 那條「屬性按鈕不是傷害核彈」的匯入器守衛在佐助身上沒了；
  //    主守衛仍然由上面兩條 godie-e00q（力量強化 / 魔力增幅）扛著。
  it("哥哥 只在千鳥打中【燃燒】的敵人時才炸，而且不再給任何常駐三圍", () => {
    cover("fidelity-aamk-agi");
    /** 跑一次「(可選)先燒 → 再放千鳥」，回傳這一輪所有傷害的 origin。 */
    const run = (burnFirst: boolean): string[] => {
      const world = new SimWorld(SKELETON_ARENA, 29);
      const sasuke = mk(world, "godie-edem", 0, -6);
      mk(world, "godie-hart", 1, 0, 0);
      mk(world, "godie-hart", 1, 0, 1.5);
      world.rebuildGrid();
      toRank(world, sasuke, "Q", 1); // 45-01 火遁：它就是【燃燒】的來源
      toRank(world, sasuke, "E", 1); // 45-03 千鳥：hook 指名的那一格
      toRank(world, sasuke, "R", 1); // 45-04 哥哥本人

      // 舊版學會 R 的這一刻就有 armor +3.6 / 攻速 +24%，新版一格常駐都沒有
      expect(stats(world, sasuke)[Stat.Armor]).toBeCloseTo(champBase("godie-edem", Stat.Armor), 4);
      expect(stats(world, sasuke)[Stat.AttackSpeed]).toBeCloseTo(
        champBase("godie-edem", Stat.AttackSpeed),
        5,
      );

      const origins: string[] = [];
      const collect = () => {
        for (const e of world.events) {
          if (e.type === "damage") origins.push((e.data as unknown as { origin: string }).origin);
        }
      };
      const castAt = (slot: CoreAbilitySlot) => {
        topUpMana(world, sasuke);
        expect(castAbility(world, sasuke, slot, { type: "point", point: { x: P.x, z: P.z } })).toBe(
          "ok",
        );
        windUp(world, sasuke);
        collect();
        for (let i = 0; i < 3; i++) {
          world.step(NO_INTENTS);
          collect();
        }
      };
      if (burnFirst) castAt("Q");
      castAt("E");
      return origins;
    };

    const clean = run(false);
    expect(clean).toContain("ability:godie-edem.e"); // 千鳥本體確實打中了
    expect(clean.some((o) => o.includes("godie-edem.r"))).toBe(false); // 沒燒 → 不炸

    const burned = run(true);
    expect(burned).toContain("ability:godie-edem.e");
    // 燒了 → 麒麟落下。origin 指名 R 的被動，所以它不可能是千鳥自己的傷害
    expect(burned.filter((o) => o === "hook:abilityPassive:godie-edem.r").length).toBeGreaterThan(0);
  });

  it("魔力增幅 grants the Rhpt upgrade's mana pool, not 80 magic damage", () => {
    cover("fidelity-aamk-mana");
    const world = new SimWorld(SKELETON_ARENA, 31);
    const saber = mk(world, "godie-e00q", 0, -2);
    const baseMana = champBase("godie-e00q", Stat.MaxMana);

    toRank(world, saber, "R", 1); // war3map.w3q Rhpt effect1 rmnx = 500/level
    expect(stats(world, saber)[Stat.MaxMana]).toBeCloseTo(baseMana + 500, 3);
    toRank(world, saber, "R", 3);
    expect(stats(world, saber)[Stat.MaxMana]).toBeCloseTo(baseMana + 1500, 3);
  });
});

// ============================================================ area resolution
describe("multi-target natives resolve as areas, not single targets", () => {
  it("十萬伏特 ANfl hits EVERY enemy standing in its 350u circle", () => {
    cover("fidelity-aoe-forked-lightning");
    const world = new SimWorld(SKELETON_ARENA, 37);
    const pika = mk(world, "godie-o00k", 0, -6);
    const a = mk(world, "godie-hart", 1, 0, -1);
    const b = mk(world, "godie-hart", 1, 0, 0);
    const c = mk(world, "godie-hart", 1, 0, 1);
    const far = mk(world, "godie-hart", 1, 12, 0); // well outside the circle
    world.rebuildGrid();

    const hp = (e: EntityId) => world.health.get(e)!.hp;
    const full = [a, b, c, far].map(hp);
    expect(
      castAbility(world, pika, "Q", { type: "point", point: { x: P.x, z: P.z } }),
    ).toBe("ok");
    windUp(world, pika);
    for (let i = 0; i < 3; i++) world.step(NO_INTENTS);

    // all three inside take damage — the old doc hit exactly one of them
    expect(hp(a)).toBeLessThan(full[0]!);
    expect(hp(b)).toBeLessThan(full[1]!);
    expect(hp(c)).toBeLessThan(full[2]!);
    expect(hp(far)).toBe(full[3]!);
  });

  it("火遁-豪火龍之術 deals its JASS damage (it used to deal exactly ZERO)", () => {
    cover("fidelity-chochu-damage");
    const world = new SimWorld(SKELETON_ARENA, 41);
    const sasuke = mk(world, "godie-edem", 0, -6);
    const a = mk(world, "godie-hart", 1, 0, -1);
    const b = mk(world, "godie-hart", 1, 0, 1);
    world.rebuildGrid();

    const before = [a, b].map((e) => world.health.get(e)!.hp);
    expect(
      castAbility(world, sasuke, "Q", { type: "point", point: { x: P.x, z: P.z } }),
    ).toBe("ok");
    windUp(world, sasuke);
    for (let i = 0; i < 3; i++) world.step(NO_INTENTS);
    // Trig_ChoChuFireDro: skillLevel*100 + 150 = 250 at rank 1, magic, r330u
    expect(before[0]! - world.health.get(a)!.hp).toBeGreaterThan(50);
    expect(before[1]! - world.health.get(b)!.hp).toBeGreaterThan(50);
  });

  // owner 2026-08-12 裁決：「(c) 分開，但預設一律以我新版的優先」——
  // 舊行為 鬼神烈戟 = 以自己為圓心的圓形傷害 + w3a 增加防禦 -3 持續 3 秒，
  // 新規格 =「[衝刺] 一段距離並造成一[直線][範圍] 150/200/250/300 + 30% [AP] 傷害。
  // (若對方在 [破甲] 狀態，則額外造成 100% [AP] 傷害)」。
  // ⭐ 最大的一項變化：**破甲從「這一招施加的」變成「這一招要讀的條件」** ——
  //    現在施加 armor-break 的是 W 弒鬼神。原作數值存在
  //    docs/_w3x-fidelity-superseded.md §3。
  it("鬼神烈戟 是衝刺 + 直線，線外的人完全沒事，而且它自己不再削護甲", () => {
    cover("fidelity-lubu-e-aoe");
    const world = new SimWorld(SKELETON_ARENA, 43);
    const lubu = mk(world, "godie-h01u", 0, 0, -4);
    const onLine = mk(world, "godie-hart", 1, 0, 0); // 呂布與施法點之間
    const offLine = mk(world, "godie-hart", 1, 5, 0); // 一樣的距離，但在線外
    world.rebuildGrid();
    toRank(world, lubu, "E", 1);
    topUpMana(world, lubu);
    const from = { ...world.transform.get(lubu)!.pos };
    const armor0 = stats(world, onLine)[Stat.Armor];
    const hp0 = [onLine, offLine].map((e) => world.health.get(e)!.hp);

    expect(castAbility(world, lubu, "E", { type: "point", point: { x: P.x, z: P.z + 4 } })).toBe(
      "ok",
    );
    // 施法前搖 then the dash carries him and the line resolves
    windUp(world, lubu);
    for (let i = 0; i < 15; i++) world.step(NO_INTENTS);

    // [衝刺]：他真的離開原地往施法點去（舊版原地不動）
    expect(world.transform.get(lubu)!.pos.z).toBeGreaterThan(from.z + 1);
    // [直線]：線上的中招，線外的一點都沒有（舊版是圓，兩個都會中）
    expect(world.health.get(onLine)!.hp).toBeLessThan(hp0[0]!);
    expect(world.health.get(offLine)!.hp).toBe(hp0[1]!);
    // 舊版這裡護甲會掉 3 秒；新版破甲是**輸入**不是輸出，所以護甲不動
    expect(stats(world, onLine)[Stat.Armor]).toBeCloseTo(armor0, 4);
  });
});

// ============================================================ inverted mechanics
describe("abilities that heal no longer damage", () => {
  it("把你給MikuMiku掉 restores an ALLY to full hp + mana and refuses enemies", () => {
    cover("fidelity-miku-ex-restore");
    const world = new SimWorld(SKELETON_ARENA, 47);
    const miku = mk(world, "godie-o02p", 0, -2);
    const ally = mk(world, "godie-hart", 0, -1);
    const foe = mk(world, "godie-hart", 1, 2);
    world.rebuildGrid();
    expect(learnEx(world, miku)).toBe(true);

    const ahp = world.health.get(ally)!;
    ahp.hp = 1;
    ahp.mana = 0;
    // an ENEMY is not a legal target for it any more
    expect(castAbility(world, miku, "EX", { type: "entity", entityId: foe })).toBe("bad-target");
    expect(world.health.get(foe)!.hp).toBe(world.health.get(foe)!.maxHp);

    expect(castAbility(world, miku, "EX", { type: "entity", entityId: ally })).toBe("ok");
    windUp(world, miku);
    for (let i = 0; i < 3; i++) world.step(NO_INTENTS);
    expect(ahp.hp).toBeCloseTo(ahp.maxHp, 3); // SetUnitLifePercentBJ(target,100)
    expect(ahp.mana).toBeCloseTo(ahp.maxMana, 3); // SetUnitManaPercentBJ(target,100)
  });

  it("世界第一的公主殿下 heals its caster instead of nuking the ground", () => {
    cover("fidelity-miku-r-heal");
    const world = new SimWorld(SKELETON_ARENA, 53);
    const miku = mk(world, "godie-o02p", 0, 0);
    const foe = mk(world, "godie-hart", 1, 1);
    world.rebuildGrid();
    toRank(world, miku, "R", 1);
    const mhp = world.health.get(miku)!;
    mhp.hp = 10;
    const foeHp = world.health.get(foe)!.hp;

    expect(castAbility(world, miku, "R", { type: "self" })).toBe("ok");
    windUp(world, miku);
    for (let i = 0; i < 3; i++) world.step(NO_INTENTS);
    expect(mhp.hp).toBeGreaterThan(10); // A11E 回復 200 at rank 1
    expect(world.health.get(foe)!.hp).toBe(foeHp); // and nobody is damaged
  });
});

// ============================================================ per-rank buffs
describe("per-rank buff columns reach the game", () => {
  it("鬼隱之擊 gives the w3a's rank-1 +50 % ms for 12 s, and rank 4's +150 % for 45 s", () => {
    cover("fidelity-perrank-buff");
    const mkWorld = (rank: number) => {
      const world = new SimWorld(SKELETON_ARENA, 59);
      const rena = mk(world, "godie-e001", 0, 0);
      toRank(world, rena, "Q", rank);
      topUpMana(world, rena);
      const base = stats(world, rena)[Stat.MoveSpeed];
      expect(castAbility(world, rena, "Q", { type: "self" })).toBe("ok");
      // windUp's LAST step is the one that resolves the cast and attaches the
      // buff, so it has already had the pipeline run on it — an extra step here
      // would read the duration one tick short.
      windUp(world, rena);
      return { world, rena, base, boosted: stats(world, rena)[Stat.MoveSpeed] };
    };

    // ms is clamped at 14, so compare the SOURCE the pipeline received
    const r1 = mkWorld(1);
    const buff1 = world1Buff(r1.world, r1.rena);
    expect(buff1.value).toBeCloseTo(0.5, 6);
    expect(buff1.durationTicks).toBe(Math.round(12 / r1.world.dt));

    const r4 = mkWorld(4);
    const buff4 = world1Buff(r4.world, r4.rena);
    expect(buff4.value).toBeCloseTo(1.5, 6);
    expect(buff4.durationTicks).toBe(Math.round(45 / r4.world.dt));
  });

  it("神聖結界 lasts the w3a's 8 / 12 / 16 s, not a flat invented 10 s", () => {
    cover("fidelity-perrank-duration");
    for (const [rank, secs] of [[1, 8], [2, 12], [3, 16]] as const) {
      const world = new SimWorld(SKELETON_ARENA, 61);
      const ushio = mk(world, "godie-hpb1", 0, 0);
      toRank(world, ushio, "R", rank);
      topUpMana(world, ushio); // 魔耗 150/300/450 outruns his own pool at rank 3
      const base = stats(world, ushio)[Stat.Armor];
      expect(castAbility(world, ushio, "R", { type: "self" })).toBe("ok");
      windUp(world, ushio);
      world.step(NO_INTENTS);
      expect(stats(world, ushio)[Stat.Armor]).toBeGreaterThan(base);
      // one tick BEFORE expiry it is still up; after it, gone
      for (let i = 0; i < Math.round(secs / world.dt) - 3; i++) world.step(NO_INTENTS);
      expect(stats(world, ushio)[Stat.Armor]).toBeGreaterThan(base);
      for (let i = 0; i < 6; i++) world.step(NO_INTENTS);
      expect(stats(world, ushio)[Stat.Armor]).toBeCloseTo(base, 4);
    }
  });
});

/** The single active buff ModifierSource on an entity (value + remaining life). */
function world1Buff(world: SimWorld, id: EntityId): { value: number; durationTicks: number } {
  const src = world.stats.get(id)!.sources.find((s) => s.kind === "buff");
  expect(src).toBeDefined();
  return {
    value: src!.modifiers![0]!.value,
    durationTicks: src!.expiresAtTick! - (world.tick - 1),
  };
}

/**
 * GH#289 lane P6 — `shield.absorbs`, the damage-type FILTER.
 *
 * owner 2026-07-30:「護盾的確有分**吸收所有傷害**跟**吸收 AP 傷害 only**」.
 * Before this, 破法對咒 (a WC3 `Aam2` anti-magic barrier) ate physical
 * auto-attacks too — 650→2600 points of the wrong kind of protection.
 *
 * ── Why these assertions and not others ────────────────────────────────────
 *
 * Every case here QUEUES a real `DamagePacket` and runs a real
 * `SimWorld.step()`, then reads FINAL state: `world.health.get(id).hp` and the
 * pool amounts left on `health.shields`. Nothing asserts the shape of an
 * EffectDef and nothing greps source (failure shapes ⑥ / ⑦) — a filter that
 * stores the field perfectly and never consults it in the damage loop must go
 * red here, and it does (mutation record in the commit message).
 *
 * The last block drives the SHIPPED 破法對咒 documents (both mirrors) instead of
 * a hand-written effect, because failure shape ⑤ is exactly "被測的不是出貨的
 * 那個": a green filter with the content still authored as an all-shield changes
 * nothing a player can feel. It reads the two JSON files DIRECTLY (like
 * abilityMirror.test.ts / icons.test.ts) rather than through ContentLoader, so
 * it neither depends on `content:build` having run nor on the rest of the
 * content tree parsing.
 *
 * ── The WC3 evidence for making 破法對咒 magic-only ────────────────────────
 *
 * 傑洛士 53-03 (`A07T`) spawns an `hfoo` dummy that casts `antimagicshell` on
 * everything within 550r, granting `A0DS` — whose base is `Aam2`, Anti-magic
 * Shell (war3map.j:39928-39939, tools/w3x-import/out/GoDieEX22s-src/
 * JASS_BEHAVIOR.json 傑洛士/53-03). `A0DS`'s own research tip reads 「使用強大
 * 的魔力展開結界承受**法術傷害**」 with 「每單位基礎**抗魔**抵銷值 250」, and the
 * shipped GGD description already says 「承受住範圍500內650點的**法術傷害**」.
 * Tooltip and JASS AGREE here, so there is no hidden-mechanic conflict to take
 * to owner (CLAUDE.md 描述↔JASS 衝突條款). docs/_fidelity-audit-78.md §B.5.4
 * had already flagged the widening as "surfaced not fixed"; this is the fix.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { runEffects } from "./effectRunner";
import { zEffectDefUnion } from "../../content/schema/effect";
import { zConfigShieldDoc, zConfigDoc } from "../../content/schema/config";
import {
  DEFAULT_SHIELD_RULES,
  SHIELD_ABSORB_ORDERS,
  SHIELD_SCHEMA,
  shieldRulesFromDoc,
  type ShieldAbsorbOrder,
} from "../shieldRules";
import type { EffectContext, EffectDef, DamageType } from "./effect";
import type { ShieldAbsorb } from "../components";
import { asSeatId, asTeamId, type EntityId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";

beforeAll(() => registerSkeletonContent());

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../../content");
const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;
const LANE_Z = Z0.center.z + 14; // pillar-free band, same as combatJuice.test.ts

interface Rig {
  world: SimWorld;
  caster: EntityId;
  target: EntityId;
}

/**
 * Two bodies with health + transform + team + nav + status, and deliberately NO
 * `StatsComp` on the victim: `mitigate()` then finds no Armor/MagicResist and
 * returns the packet amount unchanged, so every number below is exact and a
 * physical/magic asymmetry can only come from the shield filter under test —
 * not from a resist difference.
 */
function rig(seed = 20260730): Rig {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const spawn = (x: number, seat: number, team: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: LANE_Z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.6,
      zone: 0,
    });
    world.health.set(id, {
      hp: 5000,
      maxHp: 5000,
      mana: 400,
      maxMana: 400,
      alive: true,
      shields: [],
    });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
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
  const caster = spawn(Z0.center.x, 0, 0);
  const target = spawn(Z0.center.x + 3, 1, 1);
  world.rebuildGrid();
  return { world, caster, target };
}

function ctxOf(r: Rig): EffectContext {
  return {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [r.target],
    point: { x: Z0.center.x + 3, z: LANE_Z },
    origin: "ability:test.p6",
    rng: r.world.rng,
  };
}

/** Put an absorb pool on the victim through the SHIPPED effect path. */
function castShield(r: Rig, amount: number, absorbs?: ShieldAbsorb): void {
  const eff: EffectDef =
    absorbs === undefined
      ? { kind: "shield", amount: { flat: amount }, duration: 5 }
      : { kind: "shield", amount: { flat: amount }, duration: 5, absorbs };
  runEffects([eff], ctxOf(r));
}

interface Outcome {
  /** HP the victim actually lost this tick. */
  hpLoss: number;
  /** absorb left in each pool, in `health.shields` order (dead pools dropped). */
  poolsLeft: number[];
  /**
   * The same survivors WITH their filter, `"<absorbs>:<amount>"`, in
   * `health.shields` order.
   *
   * ⚠️ The bare `poolsLeft` numbers are NOT enough to tell the three absorb
   * ORDERS apart: `specificFirst` and `insertionOrder` can leave the identical
   * multiset of amounts on DIFFERENT pools (see the divergence block below),
   * and a test that only reads amounts would call two different rules equal.
   */
  poolsById: string[];
  /** `damage` event's `blocked` flag (the client's "a guard ate it" signal). */
  blocked: boolean;
  guardBroke: boolean;
}

/** Queue one packet, run ONE real tick, and report what the world looks like. */
function hit(r: Rig, amount: number, type: DamageType): Outcome {
  const hp = r.world.health.get(r.target)!;
  const before = hp.hp;
  r.world.damageQueue.push({
    source: r.caster,
    target: r.target,
    amount,
    type,
    crit: false,
    origin: "ability:test.p6",
  });
  r.world.step(NO_INTENTS);
  const dmgEvt = r.world.events.find((e) => e.type === "damage")?.data as
    | { blocked?: boolean }
    | undefined;
  return {
    hpLoss: before - hp.hp,
    poolsLeft: hp.shields.map((s) => s.amount),
    poolsById: hp.shields.map((s) => `${s.absorbs ?? "all"}:${s.amount.toFixed(3)}`),
    blocked: dmgEvt?.blocked === true,
    guardBroke: r.world.events.some((e) => e.type === "guardBreak"),
  };
}

/** What a packet of `raw` actually costs after the global output multiplier. */
function landed(r: Rig, raw: number): number {
  return raw * r.world.combatEnv.damageDealt;
}

/** What a `shield` of `raw` is actually worth after the global shield knob. */
function pool(r: Rig, raw: number): number {
  return raw * r.world.combatEnv.shield;
}

/* ═════════════════════════════════════════════════════════════════════════
 * 1. THE OWNER-STATED CASE — an AP-only barrier vs the two damage types.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("shield.absorbs — 只吸 AP 的護盾 (p6-shield-absorbs)", () => {
  it("physical damage goes straight through: pool UNTOUCHED, hp drops in full", () => {
    cover("p6-shield-absorbs");
    const r = rig();
    castShield(r, 400, "magic");
    const poolBefore = r.world.health.get(r.target)!.shields[0]!.amount;

    const out = hit(r, 300, "physical");

    // the whole point: the barrier is TRANSPARENT to physical — it neither
    // absorbs nor is consumed, and the victim eats the entire hit.
    expect(out.hpLoss).toBeCloseTo(landed(r, 300), 6);
    expect(out.poolsLeft).toHaveLength(1);
    expect(out.poolsLeft[0]).toBeCloseTo(poolBefore, 6);
    // and the client is told the truth: nothing guarded this hit.
    expect(out.blocked).toBe(false);
    expect(out.guardBroke).toBe(false);
  });

  it("magic damage IS absorbed: hp untouched, pool drains by exactly the hit", () => {
    cover("p6-shield-absorbs");
    const r = rig();
    castShield(r, 400, "magic");
    const poolBefore = r.world.health.get(r.target)!.shields[0]!.amount;

    const out = hit(r, 300, "magic");

    expect(out.hpLoss).toBe(0);
    expect(out.poolsLeft[0]).toBeCloseTo(poolBefore - landed(r, 300), 6);
    expect(out.blocked).toBe(true);
  });

  it("an overflowing magic hit spends the pool and bleeds the remainder to hp", () => {
    cover("p6-shield-absorbs");
    const r = rig();
    castShield(r, 100, "magic");
    const poolBefore = r.world.health.get(r.target)!.shields[0]!.amount;

    const out = hit(r, 500, "magic");

    expect(out.poolsLeft).toEqual([]); // spent pools are filtered out
    expect(out.hpLoss).toBeCloseTo(landed(r, 500) - poolBefore, 6);
    expect(out.guardBroke).toBe(true); // >0 → 0 on this hit = 破碎
  });

  it("`true` damage is NOT magic — an AP-only barrier does not stop the fire ring class of hit", () => {
    cover("p6-shield-absorbs");
    // Guards the enum boundary: "magic" must mean magic, not "anything that is
    // not physical". `true` is its own row in DamageType and its own row in the
    // absorbs enum.
    const r = rig();
    castShield(r, 400, "magic");
    const poolBefore = r.world.health.get(r.target)!.shields[0]!.amount;

    const out = hit(r, 200, "true");

    expect(out.hpLoss).toBeCloseTo(landed(r, 200), 6);
    expect(out.poolsLeft[0]).toBeCloseTo(poolBefore, 6);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 2. THE DEFAULT IS UNCHANGED — 「吸收所有傷害」 still eats everything.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("shield.absorbs — 預設值沒有變 (p6-shield-absorbs-default)", () => {
  it.each(["physical", "magic", "true"] as const)(
    "an unfiltered shield still absorbs %s exactly as before the filter existed",
    (type) => {
      cover("p6-shield-absorbs-default");
      const r = rig();
      castShield(r, 400); // no `absorbs` — the shipped spelling of every doc
      const poolBefore = r.world.health.get(r.target)!.shields[0]!.amount;

      const out = hit(r, 250, type);

      expect(out.hpLoss).toBe(0);
      expect(out.poolsLeft[0]).toBeCloseTo(poolBefore - landed(r, 250), 6);
      expect(out.blocked).toBe(true);
    },
  );

  it("the explicit \"all\" spelling behaves identically to omitting the field", () => {
    cover("p6-shield-absorbs-default");
    const run = (absorbs?: ShieldAbsorb): Outcome => {
      const r = rig();
      castShield(r, 400, absorbs);
      return hit(r, 250, "physical");
    };
    expect(run("all")).toEqual(run(undefined));
    expect(run(undefined).hpLoss).toBe(0);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 3. TWO POOLS, ONE HIT — the ordering decision, asserted behaviourally.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("shield.absorbs — 兩種護盾誰先吸 (p6-shield-absorb-order)", () => {
  it("a magic hit spends the NARROW pool first and leaves the all-purpose one intact", () => {
    cover("p6-shield-absorb-order");
    // Cast order is deliberately all-FIRST, so "oldest first" and
    // "narrow first" disagree: under plain insertion order the 500 pool would
    // eat this hit and the magic-only 200 would sit there unusable.
    const r = rig();
    castShield(r, 500); // all-purpose, cast first (older)
    castShield(r, 200, "magic"); // narrow, cast second (newer)
    const all0 = pool(r, 500);
    const magic0 = pool(r, 200);

    const out = hit(r, 150, "magic");

    expect(out.hpLoss).toBe(0);
    const byAmount = [...out.poolsLeft].sort((a, b) => a - b);
    expect(byAmount[0]).toBeCloseTo(magic0 - landed(r, 150), 6); // narrow paid
    expect(byAmount[1]).toBeCloseTo(all0, 6); // broad untouched
  });

  it("a magic hit bigger than the narrow pool overflows into the broad one", () => {
    cover("p6-shield-absorb-order");
    const r = rig();
    castShield(r, 500);
    castShield(r, 200, "magic");
    const all0 = pool(r, 500);
    const magic0 = pool(r, 200);
    const incoming = landed(r, 400);

    const out = hit(r, 400, "magic");

    expect(out.hpLoss).toBe(0);
    expect(out.poolsLeft).toHaveLength(1); // the narrow pool is spent + dropped
    expect(out.poolsLeft[0]).toBeCloseTo(all0 - (incoming - magic0), 6);
  });

  it("a physical hit ignores the narrow pool entirely and spends only the broad one", () => {
    cover("p6-shield-absorb-order");
    const r = rig();
    castShield(r, 200, "magic");
    castShield(r, 500);
    const all0 = pool(r, 500);
    const magic0 = pool(r, 200);

    const out = hit(r, 150, "physical");

    expect(out.hpLoss).toBe(0);
    const byAmount = [...out.poolsLeft].sort((a, b) => a - b);
    expect(byAmount[0]).toBeCloseTo(magic0, 6); // untouched
    expect(byAmount[1]).toBeCloseTo(all0 - landed(r, 150), 6);
    // 破碎 must NOT fire: the pool that was eating this hit is gone-to-zero only
    // when the ELIGIBLE total hits zero, and here plenty is left.
    expect(out.guardBroke).toBe(false);
  });

  it("guardBreak fires when the ELIGIBLE pool empties, even with an ineligible one still standing", () => {
    cover("p6-shield-absorb-order");
    // The regression this pins: reading the guard-break signal off the TOTAL
    // pool would stay silent here forever, because the magic-only 300 never
    // drains — a physical guard could shatter and the client would never
    // play the 破碎 beat.
    const r = rig();
    castShield(r, 300, "magic");
    castShield(r, 100);

    const out = hit(r, 400, "physical");

    expect(out.guardBroke).toBe(true);
    expect(out.hpLoss).toBeCloseTo(landed(r, 400) - pool(r, 100), 6);
    expect(out.poolsLeft).toHaveLength(1);
    expect(out.poolsLeft[0]).toBeCloseTo(pool(r, 300), 6);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 4. THE SHIPPED DOCS — 破法對咒 as it will actually be cast in a match.
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * 破法對咒 —— 出貨名單裡**現存的每一份鏡像**, 由技能編號推導出來。
 *
 * ⚠️ 這裡原本是寫死的 `["godie-o00l.e", "godie-o02s.r"]` (傑洛士 E 與涼宮八ㄦ匕 R,
 * 同一支 WC3 法術的兩份鏡像)。owner 2026-08-13 把 41 位沒上架的英雄搬進
 * `content/_legacy/` (那個目錄不在 `COLLECTION_NAMES` 裡, 引擎讀不到它),
 * 涼宮八ㄦ匕 `godie-o02s` 在那一批 —— 於是三條測試以 ENOENT 倒下, 而**沒有任何
 * 東西真的壞掉**。
 *
 * ⭐ 挑樣本的鑰匙是**技能編號**, ⛔ 不是「effects 裡填了 absorbs 的那些」。
 *    後者是拿結論去挑樣本: 哪天有人把某一份改回吸收全類型, 那份文件就會自己從
 *    母體裡消失, 這一整段於是變成同義反覆(而且是全綠的)。編號是 JASS 對照的
 *    join key (CLAUDE.md 命名層), 它不會浮動, 而且「涼宮哪天從 legacy 回來」
 *    會自動重新被蓋到 —— 不用有人記得回來改這一行。
 * ⭐ championId / slot 一樣從文件自己身上讀 (`id` 的前綴 + `slot` 欄位),
 *    ⛔ 不是第二份要跟著手動對齊的表。
 */
const BARRIER_NUMBER = "53-03"; // 53 號英雄的第三支技能 —— 編號↔技能是綁死的

interface BarrierDoc {
  abilityId: string;
  championId: string;
  slot: string;
}

function shippedBarrierDocs(): BarrierDoc[] {
  const dir = join(CONTENT_DIR, "abilities");
  const out: BarrierDoc[] = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
      id: string;
      name?: string;
      slot?: string;
    };
    if (doc.name?.startsWith(BARRIER_NUMBER) !== true || doc.slot === undefined) continue;
    out.push({
      abilityId: doc.id,
      championId: doc.id.slice(0, doc.id.lastIndexOf(".")),
      slot: doc.slot,
    });
  }
  return out;
}

const BARRIER_DOCS = shippedBarrierDocs();

function shippedEffects(abilityId: string): EffectDef[] {
  const raw = JSON.parse(
    readFileSync(join(CONTENT_DIR, "abilities", `${abilityId}.json`), "utf8"),
  ) as { effects: unknown[] };
  // Parse through the REAL Zod union, so a doc the loader would reject cannot
  // sneak past this suite by being hand-shaped in the test.
  return raw.effects.map((e) => zEffectDefUnion.parse(e) as EffectDef);
}

describe("破法對咒 只吸魔法 —— 出貨文件走出貨路徑 (p6-barrier-content)", () => {
  it("出貨名單裡真的還有 破法對咒 —— 母體空了下面每一條都會靜默消失", () => {
    cover("p6-barrier-content");
    // 反向守衛。`it.each([])` 不會紅,它只是**不產生任何測試** —— 這一段於是
    // 從「出貨文件真的只吸魔法」無聲地退化成零條斷言(七種失敗形態 ③)。
    // ⛔ 下界刻意是結構性的「至少一份」,不是「兩份」:鏡像有幾份是內容決定的,
    //    抄那個數字就是把出貨值搬進測試。
    expect(BARRIER_DOCS.length, `content/abilities 裡找不到編號 ${BARRIER_NUMBER} 的技能`)
      .toBeGreaterThan(0);
  });

  it.each(BARRIER_DOCS)("$abilityId: a physical hit is NOT absorbed", ({ abilityId }) => {
    cover("p6-barrier-content");
    const r = rig();
    runEffects(shippedEffects(abilityId), ctxOf(r));
    const barrier = r.world.health.get(r.target)!.shields[0]!;
    expect(barrier.amount).toBeGreaterThan(0);
    const before = barrier.amount;

    const out = hit(r, 300, "physical");

    expect(out.hpLoss).toBeCloseTo(landed(r, 300), 6);
    expect(out.poolsLeft[0]).toBeCloseTo(before, 6);
  });

  it.each(BARRIER_DOCS)("$abilityId: a magic hit IS absorbed", ({ abilityId }) => {
    cover("p6-barrier-content");
    const r = rig();
    runEffects(shippedEffects(abilityId), ctxOf(r));
    const before = r.world.health.get(r.target)!.shields[0]!.amount;

    const out = hit(r, 300, "magic");

    expect(out.hpLoss).toBe(0);
    expect(out.poolsLeft[0]).toBeCloseTo(before - landed(r, 300), 6);
  });

  it("the champion-embedded MIRROR carries the same filter as the standalone doc", () => {
    cover("p6-barrier-content");
    // The mirror is what apps/editor's PreviewController and the admin 內容管理
    // page render WHOLE (see content/abilityMirror.test.ts). A standalone-only
    // edit is invisible in a match but wrong in every raw-doc consumer.
    expect(BARRIER_DOCS.length).toBeGreaterThan(0); // 同上的反向守衛
    for (const { championId, slot, abilityId } of BARRIER_DOCS) {
      const champ = JSON.parse(
        readFileSync(join(CONTENT_DIR, "champions", `${championId}.json`), "utf8"),
      ) as { abilities: Record<string, { effects: { kind: string; absorbs?: string }[] }> };
      const embedded = champ.abilities[slot]!.effects.find((e) => e.kind === "shield");
      const standalone = shippedEffects(abilityId).find(
        (e): e is Extract<EffectDef, { kind: "shield" }> => e.kind === "shield",
      );
      expect(embedded, `${championId}.${slot}`).toBeDefined();
      expect(standalone, abilityId).toBeDefined();
      expect(embedded!.absorbs, `${championId}.${slot}`).toBe("magic");
      expect(standalone!.absorbs, abilityId).toBe("magic");
    }
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 5. THE OTHER HALF OF THE ENUM — `physical` and `true` barriers.
 *
 * ⚠️ WHY THIS BLOCK EXISTS. Before it, the whole suite (17 cases here + 13 in
 * effectRegistry.test.ts) stayed GREEN under this one-line mutation:
 *
 *     -  return a === "all" || a === type;
 *     +  return a === "all" || (a === "magic" && type === "magic");
 *     -    else if (a === type) narrow.push(sh);
 *     +    else if (a === "magic" && type === "magic") narrow.push(sh);
 *
 * i.e. HALF THE ENUM turned into decoration — an `absorbs:"physical"` barrier
 * hit by a physical blow absorbed nothing, drained nothing and let the victim
 * eat 100% of the damage — and 33 tests all passed. That is failure shape ③
 * (「可以從渲染樹刪掉但測試還是全綠」) applied to the sim: the two members with
 * no shipped content had no behavioural witness at all, only the schema-shape
 * assertions in effectRegistry.test.ts, which is failure shape ⑦ (掃屬性代替
 * 掃行為) — parsing `absorbs: "physical"` successfully says nothing about
 * whether a physical hit is ever absorbed.
 *
 * Every case below QUEUES a real packet and runs a real `SimWorld.step()`.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("shield.absorbs — 四個值都要有行為守衛 (p6-shield-absorbs-enum)", () => {
  /** For each filter: the type it eats, and the two it must be transparent to. */
  const CASES: { filter: Exclude<ShieldAbsorb, "all">; eats: DamageType; passes: DamageType[] }[] = [
    { filter: "physical", eats: "physical", passes: ["magic", "true"] },
    { filter: "magic", eats: "magic", passes: ["physical", "true"] },
    { filter: "true", eats: "true", passes: ["physical", "magic"] },
  ];

  it.each(CASES)("an `absorbs:\"$filter\"` barrier EATS $eats damage", ({ filter, eats }) => {
    cover("p6-shield-absorbs-enum");
    const r = rig();
    castShield(r, 400, filter);
    const poolBefore = r.world.health.get(r.target)!.shields[0]!.amount;

    const out = hit(r, 300, eats);

    // hp untouched, pool down by exactly the landed damage, client told 擋下了.
    expect(out.hpLoss).toBe(0);
    expect(out.poolsLeft[0]).toBeCloseTo(poolBefore - landed(r, 300), 6);
    expect(out.blocked).toBe(true);
  });

  it.each(CASES.flatMap(({ filter, passes }) => passes.map((t) => ({ filter, t }))))(
    "an `absorbs:\"$filter\"` barrier is TRANSPARENT to $t damage",
    ({ filter, t }) => {
      cover("p6-shield-absorbs-enum");
      const r = rig();
      castShield(r, 400, filter);
      const poolBefore = r.world.health.get(r.target)!.shields[0]!.amount;

      const out = hit(r, 300, t);

      expect(out.hpLoss).toBeCloseTo(landed(r, 300), 6); // full hit lands
      expect(out.poolsLeft[0]).toBeCloseTo(poolBefore, 6); // pool not consumed
      expect(out.blocked).toBe(false); // and the client is not told 擋下了
      expect(out.guardBroke).toBe(false);
    },
  );

  it("a physical-only barrier BREAKS on physical — the 破碎 beat is not magic-only either", () => {
    cover("p6-shield-absorbs-enum");
    // `guardBreak` is derived from `activeShieldTotal`, which runs the SAME
    // `shieldEats` predicate. A magic-special-cased implementation reports
    // shieldBefore = 0 here, so the shatter beat never fires for the other
    // three members and the client plays nothing.
    const r = rig();
    castShield(r, 100, "physical");

    const out = hit(r, 500, "physical");

    expect(out.guardBroke).toBe(true);
    expect(out.poolsLeft).toEqual([]);
    expect(out.hpLoss).toBeCloseTo(landed(r, 500) - pool(r, 100), 6);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 6. 誰先吸 IS A FIELD — three orders, three different survivors.
 *
 * ⚠️ The scenario is designed so all THREE diverge. With two pools it is easy
 * to write a case where two of the three orders agree, and such a test has no
 * 鑑別力 for the third. Three pools, cast all → magic → all, hit for more than
 * any single pool holds:
 *
 *   pools (insertion order):  A=all 100 · M=magic 80 · B=all 60
 *   incoming:                 magic 150
 *
 *   specificFirst  M(80) then A(70)  → survivors  A=30(all)  B=60(all)
 *   generalFirst   A(100) then B(50) → survivors  M=80(magic) B=10(all)
 *   insertionOrder A(100) then M(50) → survivors  M=30(magic) B=60(all)
 *
 * Note specificFirst and insertionOrder leave the SAME multiset of amounts
 * ({30,60}) on DIFFERENT pools — which is why the assertions read the pool's
 * filter as well as its amount (failure shape ⑦ again: 「剩下 30 和 60」 is a
 * property; 「剩下的 30 是那個全類型盾 / 那個抗魔盾」 is the behaviour).
 * ═════════════════════════════════════════════════════════════════════════ */

/** A rig whose world runs `order` instead of the shipped rule. */
function rigOrdered(order: ShieldAbsorbOrder): Rig {
  const r = rig();
  r.world.shieldRules = { absorbOrder: order };
  return r;
}

/** The three-pool board above, in insertion order. */
function threePools(r: Rig): void {
  castShield(r, 100); // A — all-purpose, oldest
  castShield(r, 80, "magic"); // M — narrow
  castShield(r, 60); // B — all-purpose, newest
}

/** `"<filter>:<amount>"` exactly as `Outcome.poolsById` spells it. */
function id(filter: string, amount: number): string {
  return `${filter}:${amount.toFixed(3)}`;
}

describe("誰先吸 = 後台欄位 (p6-shield-absorb-order-field)", () => {
  it("specificFirst (出貨值): the narrow pool pays first, then the oldest broad one", () => {
    cover("p6-shield-absorb-order-field");
    const r = rigOrdered("specificFirst");
    threePools(r);

    const out = hit(r, 150, "magic");

    expect(out.hpLoss).toBe(0);
    expect(out.poolsById).toEqual([
      id("all", pool(r, 100) - (landed(r, 150) - pool(r, 80))),
      id("all", pool(r, 60)),
    ]);
  });

  it("generalFirst: the broad pools pay first — the anti-magic barrier is left standing", () => {
    cover("p6-shield-absorb-order-field");
    const r = rigOrdered("generalFirst");
    threePools(r);

    const out = hit(r, 150, "magic");

    expect(out.hpLoss).toBe(0);
    expect(out.poolsById).toEqual([
      id("magic", pool(r, 80)),
      id("all", pool(r, 60) - (landed(r, 150) - pool(r, 100))),
    ]);
  });

  it("insertionOrder: specificity ignored — oldest first, whoever it is", () => {
    cover("p6-shield-absorb-order-field");
    const r = rigOrdered("insertionOrder");
    threePools(r);

    const out = hit(r, 150, "magic");

    expect(out.hpLoss).toBe(0);
    expect(out.poolsById).toEqual([
      id("magic", pool(r, 80) - (landed(r, 150) - pool(r, 100))),
      id("all", pool(r, 60)),
    ]);
  });

  it("the three orders are PAIRWISE different on this board — the scenario has 鑑別力", () => {
    cover("p6-shield-absorb-order-field");
    // Without this, all three cases above could be passing against one rule that
    // ignores the field: each would still be internally consistent if the
    // expectations happened to coincide. They must not coincide.
    const seen = SHIELD_ABSORB_ORDERS.map((order) => {
      const r = rigOrdered(order);
      threePools(r);
      return { order, board: hit(r, 150, "magic").poolsById.join(" | ") };
    });
    expect(new Set(seen.map((s) => s.board)).size, JSON.stringify(seen)).toBe(
      SHIELD_ABSORB_ORDERS.length,
    );
  });

  it("no order can make an INELIGIBLE pool pay — the filter still gates every one", () => {
    cover("p6-shield-absorb-order-field");
    // The field decides WHO PAYS FIRST among the eligible; it must never widen
    // eligibility. A physical hit vs a magic-only pool is transparent under all
    // three, including `insertionOrder`, whose bucket is the one that could
    // most easily have been written as「everything, oldest first」.
    for (const order of SHIELD_ABSORB_ORDERS) {
      const r = rigOrdered(order);
      castShield(r, 400, "magic");
      const before = r.world.health.get(r.target)!.shields[0]!.amount;

      const out = hit(r, 200, "physical");

      expect(out.hpLoss, order).toBeCloseTo(landed(r, 200), 6);
      expect(out.poolsLeft[0], order).toBeCloseTo(before, 6);
    }
  });

  it("the shipped default IS specificFirst — putting the decision on a field changed no match", () => {
    cover("p6-shield-absorb-order-field");
    expect(DEFAULT_SHIELD_RULES.absorbOrder).toBe("specificFirst");
    // and a world nobody configured behaves exactly like an explicit one.
    const plain = rig();
    threePools(plain);
    const explicit = rigOrdered("specificFirst");
    threePools(explicit);
    expect(hit(plain, 150, "magic").poolsById).toEqual(hit(explicit, 150, "magic").poolsById);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 7. THE FIELD IS REACHABLE — doc → rules → a real tick.
 *
 * A rule the operator cannot actually save is failure shape ② (「算出來了但
 * 從沒送到客戶端」, one layer up): the sim would honour a value nothing can
 * produce. So this block drives the REAL collection schema (`zConfigDoc`, the
 * discriminated union the content loader parses every config doc through) and
 * the REAL reader, then runs a tick with the result.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("config.shield@1 → world.shieldRules (p6-shield-order-doc)", () => {
  const doc = (absorbOrder: string): unknown => ({
    id: "shield",
    schema: SHIELD_SCHEMA,
    absorbOrder,
  });

  it("an operator doc parsed by the REAL loader union changes what the tick does", () => {
    cover("p6-shield-order-doc");
    const parsed = zConfigDoc.parse(doc("generalFirst"));
    const r = rig();
    r.world.shieldRules = shieldRulesFromDoc(parsed);
    threePools(r);

    const out = hit(r, 150, "magic");

    // generalFirst's board, reached entirely through the doc path.
    expect(out.poolsById).toEqual([
      id("magic", pool(r, 80)),
      id("all", pool(r, 60) - (landed(r, 150) - pool(r, 100))),
    ]);
  });

  it("missing / wrong-schema / garbage-value all degrade to the SHIPPED rule, never to empty", () => {
    cover("p6-shield-order-doc");
    // ⚠️ Returning an unset order would make `absorbOrder()` fall through to a
    // bucket nobody fills — every shield on every unit silently stops absorbing.
    expect(shieldRulesFromDoc(undefined)).toEqual(DEFAULT_SHIELD_RULES);
    expect(shieldRulesFromDoc({ schema: "config.combat-feel@1", absorbOrder: "generalFirst" }))
      .toEqual(DEFAULT_SHIELD_RULES);
    expect(shieldRulesFromDoc(doc("specificFrist"))).toEqual(DEFAULT_SHIELD_RULES); // typo
    expect(shieldRulesFromDoc(doc(""))).toEqual(DEFAULT_SHIELD_RULES);
  });

  it("the schema's enum and the sim's option list cannot drift apart", () => {
    cover("p6-shield-order-doc");
    for (const order of SHIELD_ABSORB_ORDERS) {
      expect(zConfigShieldDoc.safeParse(doc(order)).success, order).toBe(true);
      expect(shieldRulesFromDoc(doc(order)).absorbOrder).toBe(order);
    }
    // a value the sim does not implement must not be saveable
    expect(zConfigShieldDoc.safeParse(doc("narrowFirst")).success).toBe(false);
  });
});

/**
 * 道具給的 三圍 —— `item@1.attributes`, on the SHIPPED docs and through the
 * SHIPPED equip/sell/變身 paths.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHAT THIS GUARDS, AND WHY EACH ASSERTION IS THE ONE THAT WOULD CATCH IT
 *
 * The feature is 「四魂之玉 力敏智+30」 / 「朗基努斯之槍 力量+12 敏捷+12」. It has
 * four ways to be wrong, and each of them has already happened to a neighbour:
 *
 *  ① 失敗形態 ② 「算出來了但玩家拿不到」 — the field parses, `ItemDef.attributes`
 *    exists, and nothing forwards it onto the ModifierSource. §1 measures a
 *    STAT on the champion's sheet, never `def.attributes`.
 *  ② 失敗形態 ⑤ 「被測的不是出貨的那個」 — a hand-written `{str:30}` fixture stays
 *    green after somebody deletes the block from `content/items/godie-i00z.json`.
 *    §4 reads the shipped docs off disk AND re-derives the expected numbers from
 *    the owner's own 效能 prose, so the doc and the description are pinned to
 *    each other, not to a constant typed here.
 *  ③ THE DUPLICATION BUG the design exists to prevent — a grant that survives
 *    selling the item, or that doubles on 變身. §2 and §3.
 *  ④ 「道具的三圍」 and 「三選一卡片的三圍」 quietly becoming two different
 *    mechanisms with two coefficient sets. §1's headline test asserts an item
 *    grant is EQUAL, on all 15 stats, to writing the same number into
 *    `champ.attrBonus` — the accumulator `applyAttrPick` writes.
 *
 * ⚠️ THE COMBAT-ENV IS THE SHIPPED ONE, read off `content/config/combat-env.json`
 * at run time, not `DEFAULT_COMBAT_ENV`. Under the neutral table
 * `strToMaxHealth` happens to be its own default and the assertion would pass
 * with the coefficient wired to the wrong key; under the shipped table
 * (`maxHealth: 9`, `agiToArmor: 0.3`) it would not. §1 also re-derives the
 * expected maxHealth from the coefficient TIMES the env multiplier rather than
 * hard-coding a number, so a rebalance cannot make this file red for a reason
 * that has nothing to do with items.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentStore } from "../content/store";
import {
  registerAll,
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
} from "../content/registries";
import { zChampionDoc } from "../content/schema/champion";
import { zItemDoc } from "../content/schema/item";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { attachItemSource, itemSourceId, syncItemSources } from "./economy/itemSource";
import { grantItemFree, sellItem } from "./economy/shop";
import { detachSource, recomputeStats } from "./stats/statPipeline";
import { championAttrBonus, liveAttribute, sourceAttrGrants } from "./stats/attrSources";
import { ATTR_GRANT_MAX, ATTR_GRANT_MIN } from "./stats/attributes";
import { normalizeCombatEnv, type CombatEnvMultipliers } from "./combatEnv";
import { ALL_STATS, Stat, type StatBlock } from "./stats/statTypes";
import { readConditionStat } from "./content/condition";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../ids";

const TAG = "item-attributes";
const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;

/** 四魂之玉 — 「力敏智+30」 */
const SHIKON = "godie-i00z" as ItemId;
/** 朗基努斯之槍 — 「力量+12」「敏捷+12」 */
const LONGINUS = "godie-i018" as ItemId;

function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<
          string,
          unknown
        >,
    );
}

/** The SHIPPED combat-env, so the coefficients under test are the live ones. */
let ENV: CombatEnvMultipliers;
/** A champion doc that really carries a 三圍 block, chosen at load time. */
let HERO: ChampionId;

beforeAll(() => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const store = new ContentStore();
  // ability-templates first: `registerAll` expands 鑄技工坊 refs at registration.
  for (const c of ["ability-templates", "abilities"] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  for (const doc of docs("champions")) {
    const parsed = zChampionDoc.safeParse(doc);
    if (parsed.success) store.add("champions", parsed.data.id, parsed.data);
  }
  for (const doc of docs("items")) store.add("items", doc.id as string, doc);
  registerAll(store);

  const env = JSON.parse(
    readFileSync(join(CONTENT_DIR, "config", "combat-env.json"), "utf-8"),
  ) as { multipliers?: Record<string, number> };
  ENV = normalizeCombatEnv(env.multipliers);

  // ⚠️ CHOSEN, not typed in. Pinning one hero id here would make this suite red
  // the day that hero is renamed or retired, for a reason that has nothing to do
  // with items. The FIRST champion (sorted, so it is deterministic) that carries
  // a real 三圍 block is what every §1–§3 case needs and all it needs.
  const withAttrs = [...Champions.all()]
    .filter((d) => d.attributes !== undefined)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  expect(withAttrs.length).toBeGreaterThan(0);
  HERO = withAttrs[0]!.id;
});

function spawnHero(level = 3): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  world.combatEnv = ENV;
  const id = spawnChampion(world, {
    championId: HERO,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
    level,
  });
  recomputeStats(world, id);
  return { world, id };
}

function sheet(world: SimWorld, id: EntityId): StatBlock {
  recomputeStats(world, id);
  return { ...world.stats.get(id)!.final };
}

// ---------------------------------------------------------------------------
// §1 — THE FAN-OUT: an item's 三圍 is the SAME number as a 三選一 card's
// ---------------------------------------------------------------------------
describe("§1 item 三圍 rides championStatBase, exactly like a 能力屬性強化 pick", () => {
  it("+30 STR from an item moves maxHealth by strToMaxHealth × 30 × env.maxHealth", () => {
    cover(`${TAG}/str-to-maxhealth`);
    const { world, id } = spawnHero();
    const before = sheet(world, id);

    attachItemSource(world, id, "probe-str" as ItemId, 0, {
      id: "probe-str" as ItemId,
      name: "probe",
      cost: 0,
      tier: 1,
      tags: [],
      attributes: { str: 30 },
    });
    const after = sheet(world, id);

    // The WHOLE chain, re-derived from the live table rather than hard-coded:
    // 30 STR × strToMaxHealth lands in the champion's BASE, and `finalizeStat`
    // then multiplies the base by the maxHealth env factor. 基礎加成 (#273) is a
    // flat post-multiplier grant and is identical on both sides, so it cancels.
    const expected = 30 * ENV.strToMaxHealth * ENV.maxHealth;
    expect(after[Stat.MaxHealth] - before[Stat.MaxHealth]).toBeCloseTo(expected, 6);
    // …and it is NOT zero, so a coefficient of 0 could not make this vacuous.
    expect(expected).toBeGreaterThan(0);
  });

  it("+12 AGI from an item is MULTIPLICATIVE on attack speed, not additive", () => {
    cover(`${TAG}/agi-attack-speed-multiplicative`);
    const { world, id } = spawnHero();
    const before = sheet(world, id);
    const agi0 = liveAttribute(world, id, "agi", "total")!;

    attachItemSource(world, id, "probe-agi" as ItemId, 0, {
      id: "probe-agi" as ItemId,
      name: "probe",
      cost: 0,
      tier: 1,
      tags: [],
      attributes: { agi: 12 },
    });
    const after = sheet(world, id);

    // `authored × (1 + agiToAttackSpeed·AGI)` — the WC3 cooldown model, where
    // AGI is the hero's TOTAL, so the ratio depends on what he already had:
    const c = ENV.agiToAttackSpeed;
    const ratio = after[Stat.AttackSpeed] / before[Stat.AttackSpeed];
    expect(ratio).toBeCloseTo((1 + c * (agi0 + 12)) / (1 + c * agi0), 9);

    // …AND IT IS NOT THE ADDITIVE FORM. This is the half that makes the test a
    // guard rather than an echo: had the grant been expanded into an equivalent
    // `as pctAdd 0.02×12` modifier — which is what "just make it a StatModifier"
    // would produce — the ratio would be `1 + c·12` for every champion. The
    // hero's innate AGI is what separates them, so the two numbers differ.
    expect(ratio).not.toBeCloseTo(1 + c * 12, 3);
    expect(agi0).toBeGreaterThan(0);
    expect(ratio).toBeGreaterThan(1);
  });

  it("an item grant and the same number in `champ.attrBonus` agree on ALL 15 stats", () => {
    cover(`${TAG}/item-equals-attr-card`);
    // THE headline guard. `applyAttrPick` (#260 三選一) writes `champ.attrBonus`;
    // an item writes `ModifierSource.attributes`. If the two ever stop landing on
    // the same seam, some stat will disagree — and the panel would then show a
    // card and a weapon promising 力量+30 while paying different amounts.
    const viaItem = spawnHero();
    attachItemSource(viaItem.world, viaItem.id, "probe-all" as ItemId, 0, {
      id: "probe-all" as ItemId,
      name: "probe",
      cost: 0,
      tier: 1,
      tags: [],
      attributes: { str: 30, agi: 30, int: 30 },
    });

    const viaCard = spawnHero();
    const champ = viaCard.world.champion.get(viaCard.id)!;
    champ.attrBonus.str += 30;
    champ.attrBonus.agi += 30;
    champ.attrBonus.int += 30;
    viaCard.world.stats.get(viaCard.id)!.dirty = true;

    const a = sheet(viaItem.world, viaItem.id);
    const b = sheet(viaCard.world, viaCard.id);
    for (const s of ALL_STATS) expect([s, a[s]]).toEqual([s, b[s]]);

    // …and the pair is not trivially equal because both are the BARE champion:
    // at least one stat must differ from an un-granted hero, or this whole
    // comparison would pass with the feature deleted from both sides.
    const plain = spawnHero();
    const p = sheet(plain.world, plain.id);
    expect(ALL_STATS.filter((s) => a[s] !== p[s]).length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// §2 — UNEQUIP: selling the weapon must take the 三圍 with it
// ---------------------------------------------------------------------------
describe("§2 the grant lives and dies with the source", () => {
  it("sellItem restores the sheet byte-for-byte (no residual 三圍)", () => {
    cover(`${TAG}/sell-restores`);
    const { world, id } = spawnHero();
    const before = sheet(world, id);

    const slot = grantItemFree(world, id, SHIKON);
    expect(slot).toBeGreaterThanOrEqual(0);
    const equipped = sheet(world, id);
    expect(equipped[Stat.MaxHealth]).toBeGreaterThan(before[Stat.MaxHealth]);

    expect(sellItem(world, id, slot)).toBe(true);
    const after = sheet(world, id);
    for (const s of ALL_STATS) expect([s, after[s]]).toEqual([s, before[s]]);
    // …and the accumulator the 三選一 writes was never touched, which is the
    // laundering path this design exists to make unreachable.
    expect(world.champion.get(id)!.attrBonus).toEqual({ str: 0, agi: 0, int: 0 });
  });

  it("detachSource alone is enough — nothing else has to remember to undo it", () => {
    cover(`${TAG}/detach-restores`);
    const { world, id } = spawnHero();
    const before = sheet(world, id);
    attachItemSource(world, id, LONGINUS, 2, Items.get(LONGINUS));
    expect(sheet(world, id)[Stat.MaxHealth]).toBeGreaterThan(before[Stat.MaxHealth]);
    expect(detachSource(world, id, itemSourceId(LONGINUS, 2))).toBe(true);
    expect(sheet(world, id)[Stat.MaxHealth]).toBeCloseTo(before[Stat.MaxHealth], 9);
  });
});

// ---------------------------------------------------------------------------
// §3 — 變身: `syncItemSources` must neither drop nor duplicate the grant
// ---------------------------------------------------------------------------
describe("§3 the 變身 re-resolve is neutral", () => {
  it("syncItemSources leaves exactly ONE copy of the grant", () => {
    cover(`${TAG}/form-resync-idempotent`);
    const { world, id } = spawnHero();
    const slot = grantItemFree(world, id, SHIKON);
    const equipped = sheet(world, id);

    // `ChampionFormSystem.setBody` — the sole writer of the body — calls this
    // after every transform. Called three times here: a grant that were folded
    // into `champ.attrBonus` at equip time would triple.
    syncItemSources(world, id);
    syncItemSources(world, id);
    syncItemSources(world, id);

    const after = sheet(world, id);
    for (const s of ALL_STATS) expect([s, after[s]]).toEqual([s, equipped[s]]);
    const sc = world.stats.get(id)!;
    expect(sc.sources.filter((s) => s.attributes !== undefined)).toHaveLength(1);
    expect(sc.sources.find((s) => s.id === itemSourceId(SHIKON, slot))!.attributes).toEqual({
      str: 30,
      agi: 30,
      int: 30,
    });
  });
});

// ---------------------------------------------------------------------------
// §4 — THE SHIPPED DOCS: owner's 效能 prose ↔ the data, both directions
// ---------------------------------------------------------------------------
describe("§4 the two shipped weapons carry exactly what their 效能 lines promise", () => {
  /** 「力量+12」/「力敏智+30」 → the {str,agi,int} the line claims. */
  function claimedAttrs(description: string): Record<string, number> {
    const want: Record<string, number> = {};
    for (const raw of description.split("\n")) {
      const line = raw.trim().replace("＋", "+");
      const m = /^(力量|敏捷|智慧|力敏智)\s*\+\s*(\d+(?:\.\d+)?)$/.exec(line);
      if (!m) continue;
      const n = Number(m[2]);
      const keys = m[1] === "力敏智" ? ["str", "agi", "int"] : { 力量: "str", 敏捷: "agi", 智慧: "int" }[m[1]!]!;
      for (const k of typeof keys === "string" ? [keys] : keys) want[k] = (want[k] ?? 0) + n;
    }
    return want;
  }

  it.each([SHIKON, LONGINUS])("%s: doc.attributes === the description's own numbers", (itemId) => {
    cover(`${TAG}/shipped-doc-matches-prose/${itemId}`);
    const raw = JSON.parse(
      readFileSync(join(CONTENT_DIR, "items", `${itemId}.json`), "utf-8"),
    ) as Record<string, unknown>;
    const want = claimedAttrs(String(raw.description ?? ""));
    expect(Object.keys(want).length).toBeGreaterThan(0); // the prose still says it
    expect(raw.attributes).toEqual(want);
    // …and the doc actually PARSES with that block (the Zod mirror is armed).
    expect(zItemDoc.safeParse(raw).success).toBe(true);
  });

  it.each([SHIKON, LONGINUS])("%s: the REGISTERED def forwards it onto the source", (itemId) => {
    cover(`${TAG}/shipped-def-reaches-source/${itemId}`);
    const { world, id } = spawnHero();
    const before = sheet(world, id);
    const slot = grantItemFree(world, id, itemId);
    const after = sheet(world, id);

    const src = world.stats.get(id)!.sources.find((s) => s.id === itemSourceId(itemId, slot))!;
    expect(src.attributes).toEqual(Items.get(itemId).attributes);
    // Behaviour, not just the field: maxHealth is fed by STR and both weapons
    // grant STR, so the sheet has to have moved.
    expect(after[Stat.MaxHealth]).toBeGreaterThan(before[Stat.MaxHealth]);
  });
});

// ---------------------------------------------------------------------------
// §5 — 「總」 vs 「基礎」: the two readings, and who reads which
// ---------------------------------------------------------------------------
describe("§5 basis", () => {
  it("a condition's 力量/敏捷 reads the TOTAL (equipment included)", () => {
    cover(`${TAG}/condition-reads-total`);
    const { world, id } = spawnHero();
    const beforeStr = readConditionStat(world, id, "str", "absolute")!;
    attachItemSource(world, id, LONGINUS, 0, Items.get(LONGINUS));
    recomputeStats(world, id);
    expect(readConditionStat(world, id, "str", "absolute")).toBeCloseTo(beforeStr + 12, 9);
    expect(liveAttribute(world, id, "str", "total")).toBeCloseTo(beforeStr + 12, 9);
    // …while "base" deliberately does NOT see it — that is the axis
    // `grantAttribute.maxAttributeBasis` defaults to, so a weapon cannot retire
    // 獸化心靈's hidden 120-AGI ceiling early.
    expect(liveAttribute(world, id, "str", "base")).toBeCloseTo(beforeStr, 9);
    expect(championAttrBonus(world, id, "base")).toEqual({ str: 0, agi: 0, int: 0 });
    expect(championAttrBonus(world, id, "total").str).toBeCloseTo(12, 9);
  });

  it("an EXPIRED source stops granting on the same tick the stat loop drops it", () => {
    cover(`${TAG}/expired-source-ignored`);
    const { world, id } = spawnHero();
    const sc = world.stats.get(id)!;
    sc.sources.push({
      id: "buff:probe",
      kind: "buff",
      attributes: { str: 40 },
      expiresAtTick: world.tick + 2,
    });
    expect(sourceAttrGrants(sc.sources, world.tick)).toHaveLength(1);
    expect(sourceAttrGrants(sc.sources, world.tick + 2)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §6 — the BOUNDS are armed at both ends (CLAUDE.md 「欄位要有上界」)
// ---------------------------------------------------------------------------
describe("§6 zItemAttributes bounds", () => {
  const base = {
    id: "probe-bounds",
    schema: "item@1",
    name: "probe",
    cost: 0,
    tier: 1,
    tags: [],
  };

  it("accepts the two shipped magnitudes", () => {
    cover(`${TAG}/bounds-accept`);
    expect(zItemDoc.safeParse({ ...base, attributes: { str: 30, agi: 30, int: 30 } }).success).toBe(
      true,
    );
    expect(zItemDoc.safeParse({ ...base, attributes: { str: 12, agi: 12 } }).success).toBe(true);
  });

  it("rejects the ×100 mis-parse, the negative, and the empty block", () => {
    cover(`${TAG}/bounds-reject`);
    // 30 typed as 3000 — the mis-parse the ceiling exists for.
    expect(
      zItemDoc.safeParse({ ...base, attributes: { str: ATTR_GRANT_MAX + 1 } }).success,
    ).toBe(false);
    expect(
      zItemDoc.safeParse({ ...base, attributes: { agi: ATTR_GRANT_MIN - 1 } }).success,
    ).toBe(false);
    // `{}` is the tier-5 defect: a block that looks authored and pays nothing.
    expect(zItemDoc.safeParse({ ...base, attributes: {} }).success).toBe(false);
    // and an unknown attribute key must not slip through `.strict()`
    expect(zItemDoc.safeParse({ ...base, attributes: { luk: 5 } }).success).toBe(false);
  });
});

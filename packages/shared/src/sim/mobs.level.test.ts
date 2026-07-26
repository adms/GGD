/**
 * #217 喪標麥可 — the mob's MODEL, its LEVELLED stats, and the deterministic
 * ROUND→LEVEL channel. Focused on the three reported symptoms:
 *
 *   (a) a mob rendered as the KNIGHT stand-in (`champ.thorne`) and the authored
 *       `mobWaves.mob.modelKey` was silently ignored — the key now travels on
 *       `MobRules.modelKey`;
 *   (b) the 喪標麥可 champion doc's `baseStats`/`growth` never reached the mob at
 *       all (a mob has no ChampionComp, so `recomputeStats` returns early), so
 *       editing the hero sheet changed nothing on the field;
 *   (c) every mob was the same strength in every round — there was no level.
 *
 * TASK #244 RE-SOURCED (b). The mob's curve no longer comes from the hero sheet
 * at all: it is authored on `mobWaves.mob` in content/config/arena-rules.json.
 * This suite now reads the numbers from THERE (still a direct on-disk read, the
 * standinRoster.test.ts pattern) so it keeps failing if the shipped doc and the
 * curve drift apart — while the champion doc is still loaded and registered so
 * the new tripwire can prove that moving 喪標麥可's HERO stats does NOT move the
 * mob. The literals 300 / 400 / 600 are the owner's contract and must survive
 * every refactor byte-for-byte.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { zChampionDoc } from "../content/schema/champion";
import { DEFAULT_MOB_WAVES_CONFIG, type MobWavesConfig } from "../content/schema/config";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { Champions } from "./content/registry";
import type { ChampionDef } from "./content/defs";
import type { ChampionId } from "../ids";
import {
  MOB_CHAMPION_ID,
  MOB_MODEL_KEY,
  mobLevelForRound,
  mobRulesFromConfig,
  mobsAliveInZone,
} from "./mobs";
import { beginCombatMobs, mobSystem } from "./systems/MobSystem";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

/** The shipped 喪標麥可 hero sheet — the single source of truth for the curve. */
const DOC = zChampionDoc.parse(
  JSON.parse(readFileSync(join(CONTENT_DIR, "champions", `${MOB_CHAMPION_ID}.json`), "utf8")),
);

/**
 * THE SHIPPED ARENA DOC — since #244 THIS is where the mob's curve lives. It
 * used to be read off `DOC` (the hero sheet) right below, which is exactly the
 * coupling #244 broke: 喪標麥可 is both a pickable hero and the #215 mob, so a
 * hero-stat edit silently re-tuned the roguelite difficulty.
 */
const ARENA_RULES = JSON.parse(
  readFileSync(join(CONTENT_DIR, "config", "arena-rules.json"), "utf8"),
) as { mobWaves: MobWavesConfig };

const BASE_HP = ARENA_RULES.mobWaves.mob.baseHp!;
const GROWTH_HP = ARENA_RULES.mobWaves.mob.hpPerLevel!;
const BASE_REGEN = ARENA_RULES.mobWaves.mob.baseRegen!;
const GROWTH_REGEN = ARENA_RULES.mobWaves.mob.regenPerLevel!;

beforeAll(() => {
  registerSkeletonContent();
  // Register JUST the stat sheet under the mob's champion id. `mobRulesFromConfig`
  // reads only baseStats/growth, so a minimal def is a faithful stand-in for the
  // fully-linked doc the real host loads.
  Champions.register(MOB_CHAMPION_ID as ChampionId, {
    id: MOB_CHAMPION_ID as ChampionId,
    name: DOC.name,
    role: DOC.role,
    attackType: DOC.attackType,
    modelKey: DOC.modelKey,
    baseStats: DOC.baseStats,
    growth: DOC.growth,
    abilities: {} as ChampionDef["abilities"],
    skillOrder: [],
    buildPriority: [],
    tags: DOC.tags ?? [],
  });
});

const CFG: MobWavesConfig = { ...DEFAULT_MOB_WAVES_CONFIG };
const DT = 1 / 30;

describe("#244 the MOB CARD is what a mob is made of (was: the hero sheet)", () => {
  it("the shipped MOB CARD carries the owner's numbers (100/+100, 1/+0.2)", () => {
    cover("mob-217-doc-numbers");
    expect(BASE_HP).toBe(100);
    expect(GROWTH_HP).toBe(100);
    expect(BASE_REGEN).toBe(1);
    expect(GROWTH_REGEN).toBe(0.2);
  });

  it("mob maxHp/regen follow base + growth*(level-1) — the SAME law recomputeStats uses", () => {
    cover("mob-217-stats-from-doc");
    for (const round of [3, 4, 5, 9]) {
      const rules = mobRulesFromConfig(CFG, DT, round);
      const level = rules.level;
      expect(rules.maxHp).toBe(Math.round(BASE_HP + GROWTH_HP * (level - 1)));
      expect(rules.hpRegenPerSec).toBeCloseTo(BASE_REGEN + GROWTH_REGEN * (level - 1), 10);
    }
    // The owner's concrete expectation, RE-SET 2026-07-26 and CARRIED THROUGH
    // THE #244 SPLIT UNCHANGED: round 3 -> lv3 -> 100 + 100*2 = 300 hp.
    // These literals are the contract. If you are here because they went red,
    // the fix is to restore the mob card, NOT to update the numbers.
    expect(mobRulesFromConfig(CFG, DT, 3).maxHp).toBe(300);
    expect(mobRulesFromConfig(CFG, DT, 4).maxHp).toBe(400);
  });

  it("falls back to the flat config maxHp when neither a mob curve nor a champion doc exists", () => {
    cover("mob-217-stats-fallback");
    // Strip the #244 curve AND point at a missing champion: tier 3, the
    // content-free path every bare-config unit test takes.
    const rules = mobRulesFromConfig(
      {
        ...CFG,
        mob: {
          ...CFG.mob,
          championId: "no-such-hero",
          baseHp: undefined,
          hpPerLevel: undefined,
          baseRegen: undefined,
          regenPerLevel: undefined,
        },
      },
      DT,
      7,
    );
    expect(rules.maxHp).toBe(CFG.mob.maxHp);
    expect(rules.hpRegenPerSec).toBe(0);
  });

  it("the LEGACY champion-doc tier still works for a pre-#244 arena (no mob curve authored)", () => {
    cover("mob-244-legacy-champion-tier");
    // No baseHp/… on the card → the hero sheet is read, exactly as before #244.
    // This is what keeps every pre-split arena doc loading unchanged.
    const legacy = mobRulesFromConfig(
      {
        ...CFG,
        mob: {
          ...CFG.mob,
          baseHp: undefined,
          hpPerLevel: undefined,
          baseRegen: undefined,
          regenPerLevel: undefined,
        },
      },
      DT,
      3,
    );
    expect(legacy.maxHp).toBe(Math.round(DOC.baseStats.maxHealth! + DOC.growth.maxHealth! * 2));
  });

  it("#244 TRIPWIRE — the hero sheet can never move the mob curve again", () => {
    cover("mob-244-hero-sheet-decoupled");
    // Register 喪標麥可 THE HERO at his post-#244 sheet (380 base / 45 growth).
    // Before the split this alone would have made round-3 mobs 470 hp and
    // round-6 mobs 605 — a silent roguelite difficulty change nobody asked for.
    expect(DOC.baseStats.maxHealth).toBe(380);
    expect(DOC.growth.maxHealth).toBe(45);
    expect(Champions.get(MOB_CHAMPION_ID as ChampionId).baseStats.maxHealth).toBe(380);
    // …and the mob curve does not budge.
    expect(mobRulesFromConfig(CFG, DT, 3).maxHp).toBe(300);
    expect(mobRulesFromConfig(CFG, DT, 6).maxHp).toBe(600);
  });
});

describe("#217 (c) the ROUND is the mob's level channel", () => {
  it("round 3 → lv3 and every later round is +1 (levelPerRound)", () => {
    cover("mob-217-level-per-round");
    expect(mobLevelForRound(CFG, 3)).toBe(3);
    expect(mobLevelForRound(CFG, 4)).toBe(4);
    expect(mobLevelForRound(CFG, 5)).toBe(5);
    expect(mobLevelForRound(CFG, 12)).toBe(12);
  });

  it("a round BELOW fromRound clamps to the base level — never 0 or negative", () => {
    cover("mob-217-level-clamp");
    expect(mobLevelForRound(CFG, 1)).toBe(3);
    expect(mobLevelForRound(CFG, 2)).toBe(3);
    // omitting the argument entirely means "the floor" (pre-#217 call sites)
    expect(mobRulesFromConfig(CFG, DT).level).toBe(3);
  });

  it("baseLevel / levelPerRound are honoured when the arena overrides them", () => {
    cover("mob-217-level-config");
    const cfg: MobWavesConfig = {
      ...CFG,
      fromRound: 2,
      mob: { ...CFG.mob, baseLevel: 5, levelPerRound: 2 },
    };
    expect(mobLevelForRound(cfg, 2)).toBe(5);
    expect(mobLevelForRound(cfg, 4)).toBe(9);
  });

  it("a SPAWNED mob really is tougher in a later round (the symptom, end to end)", () => {
    cover("mob-217-spawn-scales");
    const hpOfFirstMob = (round: number): number => {
      const w = new SimWorld(SKELETON_ARENA, 1);
      w.combatActive = true;
      beginCombatMobs(w, mobRulesFromConfig({ ...CFG, firstWaveSec: DT }, DT, round), [0]);
      w.step(new Map());
      expect(mobsAliveInZone(w, 0)).toBeGreaterThan(0);
      const [id] = [...w.mob.keys()];
      return w.health.get(id!)!.maxHp;
    };
    expect(hpOfFirstMob(3)).toBe(300);
    expect(hpOfFirstMob(4)).toBe(400);
    expect(hpOfFirstMob(6)).toBe(600);
  });

  it("a mob regenerates its levelled hp — RegenSystem never sees it (no StatsComp)", () => {
    cover("mob-217-regen");
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatActive = true;
    const rules = mobRulesFromConfig({ ...CFG, firstWaveSec: DT }, DT, 3);
    beginCombatMobs(w, rules, [0]);
    w.step(new Map());
    const [id] = [...w.mob.keys()];
    const hp = w.health.get(id!)!;
    expect(w.stats.has(id!)).toBe(false); // the neutrality contract is intact
    hp.hp = 50;
    for (let i = 0; i < 30; i++) w.step(new Map()); // ~1 combat second
    expect(hp.hp).toBeGreaterThan(50);
    expect(hp.hp).toBeLessThanOrEqual(hp.maxHp);
    // and it can never overheal past the levelled cap
    hp.hp = hp.maxHp;
    for (let i = 0; i < 30; i++) w.step(new Map());
    expect(hp.hp).toBe(hp.maxHp);
  });
});

describe("#217 (a) the model key is a live knob", () => {
  it("MobRules carries the mob's model doc id, defaulting to 喪標麥可's own mesh", () => {
    cover("mob-217-modelkey-default");
    const bare: MobWavesConfig = { ...CFG, mob: { ...CFG.mob, modelKey: undefined } };
    expect(mobRulesFromConfig(bare, DT, 3).modelKey).toBe(MOB_MODEL_KEY);
    expect(MOB_MODEL_KEY).toBe("champ.godie-zombiex");
  });

  it("an authored mobWaves.mob.modelKey actually reaches the rules (it used to be ignored)", () => {
    cover("mob-217-modelkey-config");
    const cfg: MobWavesConfig = { ...CFG, mob: { ...CFG.mob, modelKey: "champ.sela" } };
    expect(mobRulesFromConfig(cfg, DT, 3).modelKey).toBe("champ.sela");
  });

  it("the shipped arena-rules doc points the mob at the zombie model, not the knight", () => {
    cover("mob-217-arena-rules-model");
    const raw = ARENA_RULES;
    expect(raw.mobWaves.mob.modelKey).toBe("champ.godie-zombiex");
    expect(raw.mobWaves.mob.championId).toBe(MOB_CHAMPION_ID);
    expect(raw.mobWaves.mob.baseLevel).toBe(3);
    expect(raw.mobWaves.mob.levelPerRound).toBe(1);
    // #244 — the mob's own curve is authored on the card, not inherited.
    expect(raw.mobWaves.mob.baseHp).toBe(100);
    expect(raw.mobWaves.mob.hpPerLevel).toBe(100);
  });
});

describe("#217 determinism", () => {
  it("levelling draws ZERO from the rng and two same-round runs digest identically", () => {
    cover("mob-217-determinism");
    const build = (round: number): SimWorld => {
      const w = new SimWorld(SKELETON_ARENA, 42);
      w.combatActive = true;
      beginCombatMobs(w, mobRulesFromConfig({ ...CFG, firstWaveSec: DT }, DT, round), [0]);
      return w;
    };
    const a = build(5);
    const b = build(5);
    const rngBefore = a.rng.state;
    for (let i = 0; i < 90; i++) {
      a.step(new Map());
      b.step(new Map());
    }
    expect(a.mob.size).toBeGreaterThan(0);
    expect(a.rng.state).toBe(rngBefore); // no rng draw from spawn/level/regen
    expect(a.digest()).toBe(b.digest());
    // …and a DIFFERENT round is observably different state (hp is digested),
    // which is what makes a level mismatch surface as a digest mismatch.
    const c = build(6);
    for (let i = 0; i < 90; i++) c.step(new Map());
    expect(c.digest()).not.toBe(a.digest());
  });

  it("a disarmed world is untouched by #217 — mobSystem is still a strict no-op", () => {
    cover("mob-217-off-noop");
    const w = new SimWorld(SKELETON_ARENA, 7);
    w.combatActive = true;
    const before = w.digest();
    mobSystem(w);
    expect(w.mobTicks).toBe(-1);
    expect(w.digest()).toBe(before);
  });
});

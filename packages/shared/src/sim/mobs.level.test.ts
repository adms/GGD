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
import { championStatBase, championStatGrowth } from "./stats/attributes";
import { Stat } from "./stats/statTypes";
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
    // #248: the sheet is only faithful WITH the 三圍 block — without it the raw
    // `baseStats.maxHealth` (80) is all the legacy tier would see, instead of
    // the 380 the champion actually has.
    attributes: DOC.attributes,
    abilities: {} as ChampionDef["abilities"],
    skillOrder: [],
    buildPriority: [],
    tags: DOC.tags ?? [],
  });
});

const CFG: MobWavesConfig = { ...DEFAULT_MOB_WAVES_CONFIG };

/**
 * 出貨的**舊線性等級通道**（`baseLevel + levelPerRound × (回合 − fromRound)`）。
 *
 * owner 2026-08-04 給了普通殭屍一條曲線（`回合*2+1`），而 `mobLevelForRound` 的
 * 規則是「有曲線就以它為準」。舊通道**沒有被刪掉** —— 清空曲線就回到它，而每一份
 * 2026-08-04 之前的競技場文件都還走它。所以它仍然需要一條守衛，只是那條守衛必須
 * 明確地把曲線清掉才驗得到自己要驗的東西（失敗形態 ⑤：被測的不是你以為的那個）。
 */
const LINEAR_CFG: MobWavesConfig = {
  ...CFG,
  mob: { ...CFG.mob, levelCurve: undefined },
};

/** 該回合的小怪血量，由**該回合的等級**推出來 —— 不抄字面值（見檔頭）。 */
const hpAtRound = (round: number): number =>
  Math.round(BASE_HP + GROWTH_HP * (mobLevelForRound(CFG, round) - 1));
const DT = 1 / 30;

/** The registered hero sheet, as an AttributeCarrier for the #248 helpers. */
const HERO_DEF = {
  baseStats: DOC.baseStats,
  growth: DOC.growth,
  attributes: DOC.attributes,
};

describe("#244 the MOB CARD is what a mob is made of (was: the hero sheet)", () => {
  it("the shipped MOB CARD carries the owner's numbers (20/+20, regen 0)", () => {
    cover("mob-217-doc-numbers");
    // RE-SET by the owner 2026-07-26 (second pass): 「肉鴿模式下，殭屍(喪標麥可)的
    // 生命力20%跟攻擊力只有10%，殭屍數量目前設定也要減半」. The previous card was
    // 100/+100 and 12 attack; this is that card at 20% hp and 10% attack.
    // Regen was NOT in the directive and is unchanged — which makes it FIVE
    // TIMES stronger in relative terms (2/s against 120 hp at round 6, where it
    // used to be 2/s against 600). Left as-is deliberately; flagged to the owner.
    expect(BASE_HP).toBe(20);
    expect(GROWTH_HP).toBe(20);
    // Regen ZEROED by the same directive: with hp at 20%, an unchanged 2/s
    // would have been FIVE TIMES stronger in relative terms (1.67%/s of a
    // 120 hp round-6 mob, where it used to be 0.33%/s of 600). The owner chose
    // zero over a proportional cut — a small mob that does not heal at all.
    expect(BASE_REGEN).toBe(0);
    expect(GROWTH_REGEN).toBe(0);
  });

  it("mob maxHp/regen follow base + growth*(level-1) — the SAME law recomputeStats uses", () => {
    cover("mob-217-stats-from-doc");
    for (const round of [3, 4, 5, 9]) {
      const rules = mobRulesFromConfig(CFG, DT, round);
      const level = rules.level;
      expect(rules.maxHp).toBe(Math.round(BASE_HP + GROWTH_HP * (level - 1)));
      expect(rules.hpRegenPerSec).toBeCloseTo(BASE_REGEN + GROWTH_REGEN * (level - 1), 10);
    }
    // ⚠️ 這兩行以前寫死 60 / 80（= 卡片 20/+20 在**第 3 級**）。2026-08-04 owner
    // 換掉的是**等級通道**（`回合*2+1`），不是卡片 —— 但寫死的版本會紅，而訊息說
    // 「小怪卡片被動過了」，害人去修一個沒壞的東西。卡片本身（20/+20/regen 0）由
    // 上面那條姊妹測試釘住，這裡只驗**律**：血量 = 卡片套在該回合的等級上。
    expect(mobRulesFromConfig(CFG, DT, 3).maxHp).toBe(hpAtRound(3));
    expect(mobRulesFromConfig(CFG, DT, 4).maxHp).toBe(hpAtRound(4));
    // 而且真的隨回合長（擋「律接上了但等級每回合都一樣」）。
    expect(hpAtRound(4)).toBeGreaterThan(hpAtRound(3));
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
    // ⚠️ `LINEAR_CFG`：一份真的 pre-#244 的競技場文件既沒有小怪卡,**也沒有等級
    // 曲線**（那是 2026-08-04 才有的欄位）。用帶曲線的 `CFG` 去扮演「舊文件」,
    // 測的就不是舊文件了（失敗形態 ⑤）。
    const legacy = mobRulesFromConfig(
      {
        ...LINEAR_CFG,
        mob: {
          ...LINEAR_CFG.mob,
          baseHp: undefined,
          hpPerLevel: undefined,
          baseRegen: undefined,
          regenPerLevel: undefined,
        },
      },
      DT,
      3,
    );
    // #248: the hero sheet's level-3 health is `championStatBase(…, 3)`, not
    // `baseStats + growth*2` — the 三圍 term is outside those two records now.
    //
    // #265 的全英雄 +300 生命**不會**出現在這裡,而且不需要旗標來擋:它住在
    // `finalizeStat`(sim/baseBonus.ts),而小怪從不走 `recomputeStats`。這條界線
    // 從「記得傳 championHealthBonus:false」變成結構性的 —— 見 attributes.ts。
    expect(legacy.maxHp).toBe(
      Math.round(
        championStatBase(HERO_DEF, Stat.MaxHealth, mobLevelForRound(LINEAR_CFG, 3)),
      ),
    );
  });

  it("#244 TRIPWIRE — the hero sheet can never move the mob curve again", () => {
    cover("mob-244-hero-sheet-decoupled");
    // Register 喪標麥可 THE HERO at his post-#244 sheet (380 base / 45 growth).
    // Before the split this alone would have made round-3 mobs 470 hp and
    // round-6 mobs 605 — a silent roguelite difficulty change nobody asked for.
    //
    // #248 MOVED WHERE THE 380 LIVES, NOT WHAT IT IS. The card carries STR 12
    // and a raw `baseStats.maxHealth`, and the sim adds `strToMaxHealth × STR`
    // on top. The coefficient later moved (Blizzard's 25 -> the SOURCE MAP's
    // own war3mapMisc.txt 23), so the raw card was re-back-solved 80 -> 104 and
    // `104 + 23×12` is still exactly 380. 喪標麥可's attributes are `authored`,
    // not w3x — they exist to REPRODUCE this sheet, so re-solving them is the
    // only way to keep #244's number rather than let it drift to 356.
    // Asserting the EFFECTIVE level-1 value (not the raw field) is what keeps
    // #244's deliberate tuning pinned through both re-derivations.
    //
    // #265 (2026-07-28) 是第三個試圖移動它的東西:全英雄初始生命 +300。喪標麥可
    // 同時是可選英雄與 #215 的小怪,所以這個 380 必須撐得住。它撐得住的方式在
    // v0.9.9 變了:加成不再是 `championStatBase` 的一個可選旗標,而是搬到
    // `finalizeStat`(倍率之後),而**小怪根本不走那條路**——`recomputeStats` 沒有
    // ChampionComp 就提早 return,小怪的血在 sim/mobs.ts 自己算。
    //
    // 這一行因此是純粹的英雄卡面數字,兩邊共用。玩家實際拿到的 680(380+300)
    // 釘在 sim/balanceTuning.test.ts。
    expect(championStatBase(HERO_DEF, Stat.MaxHealth, 1)).toBe(380);

    // THE +45 IS TWO LAYERS, AND THEY NO LONGER COINCIDE.
    // #244 authored `growth.maxHealth = 45`. #248 gave the hero STR +1.8/level,
    // which through Blizzard's 25 was ALSO exactly 45 — a coincidence that the
    // map's real 23 ends: the attribute layer is now 41.4. The owner ruled that
    // `growth` survives the re-derivation as a designer knob layered on the
    // w3x-faithful attribute curve (「growth 區塊就是重複來源 => 本來就可以重複
    // 沒有衝突」), so the effective per-level health is the SUM, 86.4. Pin the
    // LAYERS separately, so losing either one fails here rather than silently
    // halving or doubling the roguelite boss.
    const ATTR_LAYER = 23 * 1.8; // strToMaxHealth (war3mapMisc StrHitPointBonus) × strGrowth
    const GROWTH_LAYER = 45; // #244's authored growth.maxHealth — untouched
    expect(ATTR_LAYER).toBeCloseTo(41.4, 9);
    expect(HERO_DEF.growth[Stat.MaxHealth]).toBe(GROWTH_LAYER);
    expect(championStatGrowth(HERO_DEF, Stat.MaxHealth)).toBeCloseTo(ATTR_LAYER + GROWTH_LAYER, 9);
    // The owner's own sanity number, end to end: level 12, maxHealth ×4. It was
    // 5480 under the 25 and is 5321.6 under the map's 23 — a consequence of the
    // corrected coefficient, logged for him in docs/_execution-batches.md.
    // #265 也沒有移動它:這一行問的是屬性卡面(×4,#248 當時的算法)。玩家現在
    // 實際看到的是 `1330.4 × 3 + 300`,釘在 sim/balanceTuning.test.ts。
    expect(championStatBase(HERO_DEF, Stat.MaxHealth, 12) * 4).toBeCloseTo(5321.6, 6);
    expect(
      championStatBase(Champions.get(MOB_CHAMPION_ID as ChampionId), Stat.MaxHealth, 1),
    ).toBe(380);
    // …and the mob curve does not budge —— 這條守的是「英雄卡不可以動到小怪卡」，
    // 所以期望值一樣從小怪卡推導（見 `hpAtRound`）。英雄卡若真的漏進來，血量會是
    // 上面那個 5,321 等級的東西，跟這個差兩個數量級，不是捨入。
    expect(mobRulesFromConfig(CFG, DT, 3).maxHp).toBe(hpAtRound(3));
    expect(mobRulesFromConfig(CFG, DT, 6).maxHp).toBe(hpAtRound(6));
  });
});

describe("#217 (c) the ROUND is the mob's level channel", () => {
  it("round 3 → lv3 and every later round is +1 (levelPerRound)", () => {
    cover("mob-217-level-per-round");
    // ⚠️ `LINEAR_CFG`，不是 `CFG`：出貨已經改吃曲線（見它的說明）。用 `CFG` 的話
    // 這條會紅，而訊息說「每回合 +1 壞了」—— 真相是它根本沒在跑那條路。
    expect(mobLevelForRound(LINEAR_CFG, 3)).toBe(3);
    expect(mobLevelForRound(LINEAR_CFG, 4)).toBe(4);
    expect(mobLevelForRound(LINEAR_CFG, 5)).toBe(5);
    expect(mobLevelForRound(LINEAR_CFG, 12)).toBe(12);
    // 而出貨的那一份**不**走這條 —— 否則上面四行會變成在測一條沒人跑的死路。
    expect(mobLevelForRound(CFG, 3)).not.toBe(mobLevelForRound(LINEAR_CFG, 3));
  });

  it("a round BELOW fromRound clamps to the base level — never 0 or negative", () => {
    cover("mob-217-level-clamp");
    expect(mobLevelForRound(LINEAR_CFG, 1)).toBe(3);
    expect(mobLevelForRound(LINEAR_CFG, 2)).toBe(3);
    // omitting the argument entirely means "the floor" (pre-#217 call sites)
    expect(mobRulesFromConfig(LINEAR_CFG, DT).level).toBe(3);
    // 曲線那一邊也不可以掉到 0 或負的（它是絕對的，`fromRound` 之前照樣算得出來）。
    expect(mobLevelForRound(CFG, 0)).toBeGreaterThanOrEqual(1);
    expect(mobLevelForRound(CFG, -5)).toBeGreaterThanOrEqual(1);
  });

  it("baseLevel / levelPerRound are honoured when the arena overrides them", () => {
    cover("mob-217-level-config");
    const cfg: MobWavesConfig = {
      ...LINEAR_CFG,
      fromRound: 2,
      mob: { ...LINEAR_CFG.mob, baseLevel: 5, levelPerRound: 2 },
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
    expect(hpOfFirstMob(3)).toBe(hpAtRound(3));
    expect(hpOfFirstMob(4)).toBe(hpAtRound(4));
    expect(hpOfFirstMob(6)).toBe(hpAtRound(6));
    // 「越晚的回合越硬」才是這條的症狀，所以它自己要被斷言。
    expect(hpOfFirstMob(6)).toBeGreaterThan(hpOfFirstMob(3));
  });

  it("a mob regenerates its levelled hp — RegenSystem never sees it (no StatsComp)", () => {
    cover("mob-217-regen");
    // The MECHANISM, driven by an explicit non-zero card. The SHIPPED card is
    // regen 0 (owner directive 2026-07-26, see the balance describe below), so
    // this can no longer be observed from the shipped numbers — but the wiring
    // still has to hold: a mob has no StatsComp, so if its regen ever migrated
    // to RegenSystem it would silently stop healing at ANY regen value.
    const REGEN_CFG: MobWavesConfig = {
      ...CFG,
      mob: { ...CFG.mob, baseRegen: 1, regenPerLevel: 0.2 },
    };
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatActive = true;
    const rules = mobRulesFromConfig({ ...REGEN_CFG, firstWaveSec: DT }, DT, 3);
    expect(rules.hpRegenPerSec).toBeGreaterThan(0); // the fixture is live
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

  it("the shipped arena-rules doc still renders the mob SMALLER than a hero (owner ruling, now on sizeMult)", () => {
    cover("mob-217-arena-rules-model");
    const raw = ARENA_RULES;
    // THE OWNER RULING THIS PROTECTS, unchanged since 2026-07-26:
    // 「肉鴿殭屍…縮小到適合尺寸…不然現在根本玩不了」. Measured, not guessed —
    // every generated voxel body's glb is 1.800 u tall and #150 normalises every
    // champion to 1.800 u too, so a trash mob was standing exactly as tall as a
    // hero, which is what "too big" actually meant.
    //
    // ⚠️ THE MECHANISM CHANGED IN GH#192, the ruling did not. #217 expressed it
    // as `modelKey: "champ.mob.zombie"` — a second doc holding `scale: 0.68`.
    // GH#192 resolves the mesh FROM THE CHAMPION (owner: 「選什麼英雄就會讀取什麼
    // 3d modal」), which would have silently handed the ruling back at 1.0×, so
    // the 0.68 now lives on `mob.sizeMult` where an operator can also SEE it.
    // The assertion is therefore on the SIZE, not on which doc id is named:
    // a rewrite that keeps the size passes, and one that quietly restores a
    // hero-sized zombie fails no matter how it spells the model.
    expect(raw.mobWaves.mob.sizeMult).toBe(0.68);
    expect(raw.mobWaves.mob.sizeMult).toBeLessThan(1);
    // The override must be ABSENT, or the champion branch never runs in a real
    // match and 「選什麼英雄就會讀取什麼 3d modal」 ships inert (failure shape ②).
    expect(raw.mobWaves.mob.modelKey).toBeUndefined();
    // …and with it absent the mesh really does come off the champion card.
    expect(mobRulesFromConfig(raw.mobWaves, DT, 3).modelKey).toBe(MOB_MODEL_KEY);
    // 染黑 (GH#192): shipped ON, or the zombies wear the player's own colours.
    expect(raw.mobWaves.mob.tintStrength).toBe(0.65);
    expect(raw.mobWaves.mob.championId).toBe(MOB_CHAMPION_ID);
    expect(raw.mobWaves.mob.baseLevel).toBe(3);
    expect(raw.mobWaves.mob.levelPerRound).toBe(1);
    // #244 — the mob's own curve is authored on the card, not inherited.
    expect(raw.mobWaves.mob.baseHp).toBe(20);
    expect(raw.mobWaves.mob.hpPerLevel).toBe(20);
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
    // #262 UPDATE. `CFG` here is the SHIPPED block, which now authors a
    // 特殊殭屍 chance — and that roll is a deliberate `world.rng` draw (see
    // `rollMobKind`). So the #217 invariant is restated precisely rather than
    // dropped: LEVELLING / REGEN / EDGE-SPAWN still draw nothing, and the ONLY
    // draw is the one special roll per spawned mob. Proven by construction: run
    // the identical world with the special block stripped and the stream must
    // sit exactly where it started.
    const noSpecial = new SimWorld(SKELETON_ARENA, 42);
    noSpecial.combatActive = true;
    beginCombatMobs(
      noSpecial,
      mobRulesFromConfig({ ...CFG, firstWaveSec: DT, special: undefined }, DT, 5),
      [0],
    );
    const noSpecialBefore = noSpecial.rng.state;
    for (let i = 0; i < 90; i++) noSpecial.step(new Map());
    expect(noSpecial.mob.size).toBeGreaterThan(0);
    expect(noSpecial.rng.state).toBe(noSpecialBefore); // level/regen/spawn: zero draws
    // …and with the block armed the stream HAS moved, so the assertion above is
    // measuring a real absence rather than a code path that never ran.
    expect(a.rng.state).not.toBe(rngBefore);
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

/**
 * The 2026-07-26 (second pass) balance directive, pinned so it cannot drift.
 *
 * 「肉鴿模式下，殭屍(喪標麥可)的生命力20%跟攻擊力只有10%，殭屍數量目前設定也要減半」
 *
 * Three separate knobs, and they live in TWO files that must agree: the shipped
 * `content/config/arena-rules.json` and `DEFAULT_MOB_WAVES_CONFIG` in
 * shared/content/schema/config.ts (dev cheats and the last-resort fallback read
 * the latter). #244 already split the mob's numbers off the 喪標麥可 hero sheet
 * precisely so a hero edit could not silently re-tune the roguelite; this test
 * closes the matching gap between the content doc and the contract default.
 */
describe("#215 mob balance — the owner's 20% hp / 10% attack / half-count pass", () => {
  it("hp is 20% of the previous card, in BOTH the content doc and the default", () => {
    cover("mob-215-hp-20pct");
    // was 100 / +100
    expect(ARENA_RULES.mobWaves.mob.baseHp).toBe(20);
    expect(ARENA_RULES.mobWaves.mob.hpPerLevel).toBe(20);
    expect(DEFAULT_MOB_WAVES_CONFIG.mob.baseHp).toBe(20);
    expect(DEFAULT_MOB_WAVES_CONFIG.mob.hpPerLevel).toBe(20);
  });

  it("regen is ZERO on the shipped card, in both", () => {
    cover("mob-215-regen-zero");
    // was 1 / +0.2. Zeroed rather than cut to 20%: the owner chose "a small mob
    // that does not heal" over "a small mob that heals proportionally".
    expect(ARENA_RULES.mobWaves.mob.baseRegen).toBe(0);
    expect(ARENA_RULES.mobWaves.mob.regenPerLevel).toBe(0);
    expect(DEFAULT_MOB_WAVES_CONFIG.mob.baseRegen).toBe(0);
    expect(DEFAULT_MOB_WAVES_CONFIG.mob.regenPerLevel).toBe(0);
    // …and it really is zero downstream, not just in the doc.
    expect(mobRulesFromConfig(CFG, DT, 6).hpRegenPerSec).toBe(0);
  });

  it("attack is 10% of the previous card, in both", () => {
    cover("mob-215-atk-10pct");
    // was 12. `attackDamage` is FLAT — it does not scale with level and does not
    // pass through combat-env, so this number is what a zombie hits you for at
    // every round of every match.
    expect(ARENA_RULES.mobWaves.mob.attackDamage).toBeCloseTo(1.2, 10);
    expect(DEFAULT_MOB_WAVES_CONFIG.mob.attackDamage).toBeCloseTo(1.2, 10);
  });

  it("the count is halved on BOTH knobs, in both files", () => {
    cover("mob-215-count-half");
    // was 10 per wave / 30 alive per zone. Every shipped arena has 2 zones, so
    // the field cap goes 60 → 30.
    expect(ARENA_RULES.mobWaves.mobsPerWaveCap).toBe(5);
    expect(ARENA_RULES.mobWaves.maxAlivePerZone).toBe(15);
    expect(DEFAULT_MOB_WAVES_CONFIG.mobsPerWaveCap).toBe(5);
    expect(DEFAULT_MOB_WAVES_CONFIG.maxAlivePerZone).toBe(15);
  });

  it("the content doc and the contract default have not drifted apart", () => {
    cover("mob-215-doc-default-agree");
    // The two files are edited by hand and by different tasks. Anything that
    // changes one and not the other lands here rather than in a playtest.
    for (const k of ["baseHp", "hpPerLevel", "attackDamage", "maxHp", "attackRange", "attackCdSec", "radius"] as const) {
      expect(ARENA_RULES.mobWaves.mob[k], `mob.${k} drifted`).toEqual(DEFAULT_MOB_WAVES_CONFIG.mob[k]);
    }
    for (const k of ["mobsPerWaveCap", "maxAlivePerZone", "fromRound"] as const) {
      expect(ARENA_RULES.mobWaves[k], `${k} drifted`).toEqual(DEFAULT_MOB_WAVES_CONFIG[k]);
    }
  });
});

/**
 * The mob's WALK SPEED — owner 2026-07-27: 「肉鴿殭屍除了生命跟攻擊減弱以外，
 * 移動速度也會減半」.
 *
 * Before this, a mob had no speed of its own at all. It carries no StatsComp
 * (deliberate — see components.ts MobComp), so `MovementSystem` fell straight
 * through to `BASE_MOVE_SPEED = 6`: a GENERAL fallback for "anything that moves
 * without stats", which the mob happened to be the only user of. The number
 * that fallback holds was never a balance decision about zombies — and at 6 u/s
 * the trash mob walked at TWICE the 3.0 `ms` of 喪標麥可, the champion it is a
 * copy of.
 *
 * So halving it is done the #244 way: the mob card owns the number, exactly as
 * it already owns hp/regen, and the shared constant stays a neutral fallback.
 */
describe("#215 the mob walks at its OWN speed, not a general fallback", () => {
  it("the shipped card halves it: 6 → 3, in BOTH files", () => {
    cover("mob-215-speed-half");
    expect(ARENA_RULES.mobWaves.mob.moveSpeed).toBe(3);
    expect(DEFAULT_MOB_WAVES_CONFIG.mob.moveSpeed).toBe(3);
  });

  it("…and it really reaches MobRules, not just the doc", () => {
    cover("mob-215-speed-wired");
    // The reader has to be live: a rules object that silently drops the field
    // would leave MovementSystem on the fallback and this whole change inert.
    expect(mobRulesFromConfig(CFG, DT, 3).moveSpeed).toBe(3);
    expect(mobRulesFromConfig(CFG, DT, 9).moveSpeed).toBe(3); // flat, not levelled
  });

  it("an un-authored card falls back to 6 — the fallback is NOT a balance change", () => {
    cover("mob-215-speed-fallback");
    const bare: MobWavesConfig = { ...CFG, mob: { ...CFG.mob, moveSpeed: undefined } };
    // 6 is MovementSystem's BASE_MOVE_SPEED. If someone lowers one and not the
    // other, a card that says nothing silently changes what mobs do.
    expect(mobRulesFromConfig(bare, DT, 3).moveSpeed).toBe(6);
  });

  it("the mob is no longer faster than the champion it copies", () => {
    cover("mob-215-speed-vs-hero");
    // 喪標麥可's own `ms` (owner 2026-07-27 also asked for him to be 稍慢一點).
    // The mob being FASTER than its own hero was the thing that read wrong.
    const hero = JSON.parse(
      readFileSync(join(CONTENT_DIR, "champions", "godie-zombiex.json"), "utf8"),
    ) as { baseStats: { ms: number } };
    expect(hero.baseStats.ms).toBe(2.6);
    const mob = ARENA_RULES.mobWaves.mob.moveSpeed!;
    // Not a strict "slower than" — the owner set them independently. What must
    // not come back is the 2× gap.
    expect(mob / hero.baseStats.ms).toBeLessThan(1.5);
  });
});

/**
 * THE GUARD THE BLOCK ABOVE WAS MISSING.
 *
 * Everything above asserts DATA — the card says 3, `MobRules` carries 3. None
 * of it asserts that MovementSystem ever READS that number. Deleting the whole
 * wiring line
 *
 *     world.stats.get(id)?.final[Stat.MoveSpeed] ||
 *       (world.mob.has(id) ? (world.mobRules?.moveSpeed ?? BASE_MOVE_SPEED) : BASE_MOVE_SPEED)
 *
 * back to the bare `|| BASE_MOVE_SPEED` leaves the mob walking at 6 again — and
 * **all 1182 shared tests stayed green**. That is this repo's signature defect
 * (#259 #265 #73 #221), caught here only because the mutation was actually run.
 *
 * So this measures the thing the player experiences: how far a real mob really
 * travels in a real second of a real sim.
 */
describe("#215 the mob's own speed actually MOVES it (the wiring, not the doc)", () => {
  const TICKS_PER_SEC = 30;

  /** Distance a spawned mob covers in one combat second, walking at a far target. */
  function measuredSpeed(cfg: MobWavesConfig): number {
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatActive = true;
    const rules = mobRulesFromConfig({ ...cfg, firstWaveSec: DT }, DT, 3);
    beginCombatMobs(w, rules, [0]);
    w.step(new Map());
    const [id] = [...w.mob.keys()];
    const t = w.transform.get(id!)!;
    const nav = w.nav.get(id!)!;
    // Walk it straight along +x toward a point far enough that it never arrives
    // and never decelerates inside the window.
    const from = { x: t.pos.x, z: t.pos.z };
    nav.moveTarget = { x: from.x + 1000, z: from.z };
    // Skip the acceleration ramp (MovementSystem ramps over ACCEL_TICKS) by
    // measuring the SECOND second, not the first.
    for (let i = 0; i < TICKS_PER_SEC; i++) w.step(new Map());
    const mid = { x: t.pos.x, z: t.pos.z };
    for (let i = 0; i < TICKS_PER_SEC; i++) w.step(new Map());
    return Math.hypot(t.pos.x - mid.x, t.pos.z - mid.z);
  }

  it("a mob really walks at the CARD's 3 u/s, not the fallback 6", () => {
    cover("mob-215-speed-measured");
    const got = measuredSpeed(CFG);
    // Measured 2.33 u/s against a nominal 3.0, and that gap is expected, not a
    // bug: this counts straight-line DISPLACEMENT, while `MobSystem` re-points
    // `nav.moveTarget` at its real target every tick, so the mob's actual path
    // curves away from the +x line the measurement is taken along. Path length
    // >= displacement, always.
    //
    // The band only has to separate "the card" from "the fallback": at 3 u/s
    // this reads ~2.33, at 6 u/s it reads ~4.7. Anything in [2.0, 3.6] is the
    // card; the fallback cannot land there.
    expect(got, `measured ${got.toFixed(2)} u/s`).toBeGreaterThan(2.0);
    expect(got, `measured ${got.toFixed(2)} u/s — this is the FALLBACK, not the card`).toBeLessThan(3.6);
  });

  it("…and it tracks the card: double the number, the mob really goes faster", () => {
    cover("mob-215-speed-tracks-card");
    // The decisive one. A hard-coded 3 would pass the test above and fail here;
    // an unread card fails both. Ratio rather than absolutes so terrain effects
    // divide out.
    const slow = measuredSpeed(CFG);
    const fast = measuredSpeed({ ...CFG, mob: { ...CFG.mob, moveSpeed: 6 } });
    expect(fast / slow, `3 u/s → ${slow.toFixed(2)}, 6 u/s → ${fast.toFixed(2)}`).toBeGreaterThan(1.6);
  });
});

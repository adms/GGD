/**
 * 從英雄推導的數值 (GH#206, owner 2026-07-29) — 殭屍王 / 特殊殭屍.
 *
 * THE DIRECTIVE:
 *   · 特殊殭屍: 生命與能力屬性 = 該設定英雄的 5×, 體型 3×, 基礎生命額外 +10,000, 移速 −50%
 *   · 殭屍王:   生命與能力屬性 = 該設定英雄的 20×, 體型 30×, 基礎生命額外 +100,000, 移速 −80%,
 *              等級是滿級 99
 * with ONE owner-approved 折衷: 「生命與能力屬性倍數」 is TWO knobs, because a
 * single 20× puts the king's attack where one swing kills a round-3 player twice
 * over. HP and damage fail differently — a wall is fun, a one-shot is not.
 *
 * ── WHAT EVERY TEST BELOW IS SHAPED AGAINST ────────────────────────────────
 * The repo's failure shapes, and specifically:
 *
 *  ⑤ 「被測的不是出貨的」 — every number here is read out of `mobRulesFromConfig`
 *     / `mobProfile`, i.e. the ONE function the game server actually calls
 *     (MatchController → `mobRulesFromConfig(rules.mobWaves, dt, round)`). None
 *     of them reads the config back and calls it a result: a field that is
 *     authored but never consumed passes a config assertion and fails these.
 *  ⑦ 「掃屬性」 — 「the king has a `heroHpMult`」 is not a claim about hp. Each
 *     assertion is written so a WRONG implementation lands on a DIFFERENT
 *     number: the flat bonus inside the multiply is ~8× too big, ignoring
 *     `heroLevel` is 2.5× too small, and reusing `heroHpMult` for damage is 5×
 *     too big — none of them is a rounding difference anyone could argue about.
 *  ③ 「刪掉還全綠」 — the LEGACY case is pinned too, from the opposite side: an
 *     arena with no `heroHpMult` must still produce the pre-#206 number, so
 *     「delete the old path」 is as red as 「delete the new one」.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { zChampionDoc } from "../content/schema/champion";
import { DEFAULT_MOB_WAVES_CONFIG, type MobWavesConfig } from "../content/schema/config";
import { registerSkeletonContent } from "./content/skeleton";
import { Champions } from "./content/registry";
import { championStatBase } from "./stats/attributes";
import { Stat } from "./stats/statTypes";
import { COMBAT_ENV_DEFAULTS } from "./combatEnv";
import type { ChampionDef } from "./content/defs";
import type { ChampionId } from "../ids";
import {
  MOB_CHAMPION_ID,
  mobLevelForRound,
  mobProfile,
  mobRulesFromConfig,
  type MobWavesConfigLike,
} from "./mobs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const DT = 1 / 30;

/** The SHIPPED doc, read off disk — not a fixture that could drift from it. */
const ARENA_RULES = JSON.parse(
  readFileSync(join(CONTENT_DIR, "config", "arena-rules.json"), "utf8"),
) as { mobWaves: MobWavesConfig };

/** The shipped 喪標麥可 hero sheet — whose 5×/20× these are. */
const DOC = zChampionDoc.parse(
  JSON.parse(readFileSync(join(CONTENT_DIR, "champions", `${MOB_CHAMPION_ID}.json`), "utf8")),
);

/**
 * A SECOND champion, deliberately unlike the first in every axis the derivation
 * touches. It exists for the 移速 guard: the king must NOT get faster or slower
 * when it changes face, and only a hero with a wildly different sheet can tell
 * a correct implementation from one that anchors on the hero.
 */
const OTHER_ID = "test-other-hero" as ChampionId;

function defFrom(id: ChampionId, doc: typeof DOC): ChampionDef {
  return {
    id,
    name: doc.name,
    role: doc.role,
    attackType: doc.attackType,
    modelKey: doc.modelKey,
    baseStats: doc.baseStats,
    growth: doc.growth,
    attributes: doc.attributes,
    abilities: {} as ChampionDef["abilities"],
    skillOrder: [],
    buildPriority: [],
    tags: doc.tags ?? [],
  };
}

beforeAll(() => {
  registerSkeletonContent();
  Champions.register(MOB_CHAMPION_ID as ChampionId, defFrom(MOB_CHAMPION_ID as ChampionId, DOC));
  Champions.register(OTHER_ID, {
    ...defFrom(OTHER_ID, DOC),
    // ~4× the hp, ~5× the ad and 2.3× the walk speed of 喪標麥可.
    baseStats: { ...DOC.baseStats, maxHealth: 900, ad: 140, ms: 6.1 },
    growth: { ...DOC.growth, maxHealth: 130, ad: 9 },
    attributes: { ...DOC.attributes!, str: 40, strGrowth: 5 },
  });
});

/** The hero sheet as the `AttributeCarrier` the derivation reads. */
const HERO = { baseStats: DOC.baseStats, growth: DOC.growth, attributes: DOC.attributes };

/** The shipped block, as the sim's own config-like view of it. */
/**
 * ⚠️ **等級來源被釘死，是這一族測試的前提不是它的主題**（2026-08-04）。
 *
 * 本檔量的是「從英雄卡推導王／特殊的血量與攻擊」那條**算術**（×倍率、再 +固定值、
 * 兩個旋鈕互不相干）——「幾級」只是它的一個輸入。owner 2026-08-04 把出貨的
 * `heroLevelSource` 改成 `"curve"`（王 `回合²+10`、特殊 `回合*3+5`），於是本檔每一條
 * 寫著 99 的斷言一起紅，而**它們紅的原因跟推導算術一點關係都沒有**。
 *
 * 所以這裡把來源釘回各自原本的模式：王 `"fixed"`（吃 `heroLevel: 99`）、
 * 特殊 `"matchHighest"`。出貨曲線由 `mobLevelCurve.test.ts` 守 —— 兩件事分開之後，
 * 改任何一邊都不會用**錯誤的訊息**弄紅另一邊。
 */
const SHIPPED_RAW = ARENA_RULES.mobWaves as unknown as MobWavesConfigLike;
const SHIPPED = {
  ...SHIPPED_RAW,
  boss: { ...(SHIPPED_RAW.boss as object), heroLevelSource: "fixed" },
  special: { ...(SHIPPED_RAW.special as object), heroLevelSource: "matchHighest" },
} as unknown as MobWavesConfigLike;

/** `mobRulesFromConfig` over a copy of the shipped doc with `boss` patched. */
function withBoss(patch: Record<string, unknown>, round = 3) {
  const cfg = {
    ...SHIPPED,
    boss: { ...(SHIPPED.boss as object), ...patch },
  } as MobWavesConfigLike;
  return mobRulesFromConfig(cfg, DT, round);
}

/** `mobRulesFromConfig` over a copy of the shipped doc with `special` patched. */
function withSpecial(patch: Record<string, unknown>, round = 3) {
  const cfg = {
    ...SHIPPED,
    special: { ...(SHIPPED.special as object), ...patch },
  } as MobWavesConfigLike;
  return mobRulesFromConfig(cfg, DT, round);
}

describe("殭屍王 · 從英雄推導 (GH#206)", () => {
  it("血量 = round(該英雄 99 級的生命上限 × 20) + 100,000 —— 讀 mobRulesFromConfig 的輸出", () => {
    cover("mob-boss-hero-derived");
    const b = ARENA_RULES.mobWaves.boss!;
    // The doc really does carry the owner's numbers…
    expect(b.heroHpMult).toBe(20);
    expect(b.hpFlatBonus).toBe(100000);
    expect(b.heroLevel).toBe(99);

    // …and the SIM really does compute from them. This is the whole test: the
    // number below is produced by the same function MatchController calls.
    const heroHp = championStatBase(HERO, Stat.MaxHealth, 99, COMBAT_ENV_DEFAULTS);
    const expected = Math.round(heroHp * 20) + 100000;
    const rules = mobRulesFromConfig(SHIPPED, DT, 3);
    expect(rules.boss!.maxHp).toBe(expected);

    // Anchors, so a change in ANY direction is visible rather than swallowed by
    // the formula tracking whatever the implementation does:
    //   · the shipped king is 276,944 hp on today's 喪標麥可 sheet;
    //   · the pre-#206 king (×100 the round-3 zombie) was 6,000.
    expect(rules.boss!.maxHp).toBeGreaterThan(200000);
    expect(rules.boss!.maxHp).not.toBe(b.maxHp); // not the flat number
    expect(rules.boss!.maxHp).not.toBe(rules.maxHp * b.hpMult!); // not the ×zombie one
  });

  it("加法在乘法「之後」—— 把 +100,000 折進倍率會差 190 萬 (owner 2026-07-28 加成不參與倍率)", () => {
    cover("mob-boss-hero-derived");
    const heroHp = championStatBase(HERO, Stat.MaxHealth, 99, COMBAT_ENV_DEFAULTS);
    const correct = Math.round(heroHp * 20) + 100000;
    const insideTheMultiply = Math.round((heroHp + 100000) * 20);
    // The two readings are not close — this is the v0.9.8 「後台寫 300, 玩家拿到
    // 900」 bug one mechanic over, and it is 1.9 MILLION hp here.
    expect(insideTheMultiply).toBeGreaterThan(correct * 7);
    expect(mobRulesFromConfig(SHIPPED, DT, 3).boss!.maxHp).toBe(correct);

    // …and the rounding really is on the PRODUCT, not on the sum. A fractional
    // flat bonus separates the two placements; nothing in the shipped doc does,
    // so without this case `round(a*b + c)` would pass.
    const frac = withBoss({ heroHpMult: 1.5, hpFlatBonus: 0.5, heroLevel: 3 });
    const h3 = championStatBase(HERO, Stat.MaxHealth, 3, COMBAT_ENV_DEFAULTS);
    expect(frac.boss!.maxHp).toBe(Math.round(h3 * 1.5) + 0.5);
    expect(frac.boss!.maxHp).not.toBe(Math.round(h3 * 1.5 + 0.5));
  });

  it("heroLevel 99 真的接上了：同一個英雄, 3 級與 99 級的王差了一大截", () => {
    cover("mob-boss-hero-derived");
    // THE 「加了欄位但沒接上」 GUARD. If `heroLevel` were ignored (or read as the
    // round's mob level, which at round 3 IS 3) these two would be equal.
    const atMax = withBoss({ heroLevel: 99 }).boss!.maxHp;
    const atThree = withBoss({ heroLevel: 3 }).boss!.maxHp;
    expect(atMax).toBeGreaterThan(atThree);
    // Not 「a bit bigger」: the hero term is 8,847 at 99 against 553 at 3, so the
    // king is 2.4× heavier even with the flat +100,000 dominating both.
    expect(atMax).toBeGreaterThan(atThree * 2);
    // And each is exactly its own formula, so neither is an accident.
    for (const lv of [3, 50, 99]) {
      const hero = championStatBase(HERO, Stat.MaxHealth, lv, COMBAT_ENV_DEFAULTS);
      expect(withBoss({ heroLevel: lv }).boss!.maxHp).toBe(Math.round(hero * 20) + 100000);
    }
    // ABSENT `heroLevel` = the ROUND's mob level, not a hidden 99 — otherwise
    // the 特殊殭屍's 「跟著回合成長」 would silently be 「always max level」.
    //
    // ⚠️ 期望值從 `mobLevelForRound` **推導**，不是寫死 3（2026-08-04）：
    // owner 給了普通殭屍一條曲線（`回合*2+1`），所以「該回合的小怪等級」在第 3
    // 回合是 7 不是 3。寫死的話這一條會因為**別人**改了曲線而紅，而訊息會說
    // 「heroLevel 沒接上」—— 一個用錯誤訊息紅掉的斷言（CLAUDE.md）。
    const roundLevel3 = mobLevelForRound(SHIPPED, 3);
    const heroAtRound3 = championStatBase(HERO, Stat.MaxHealth, roundLevel3, COMBAT_ENV_DEFAULTS);
    expect(withBoss({ heroLevel: undefined }, 3).boss!.maxHp).toBe(
      Math.round(heroAtRound3 * 20) + 100000,
    );
    expect(withBoss({ heroLevel: undefined }, 9).boss!.maxHp).toBeGreaterThan(
      withBoss({ heroLevel: undefined }, 3).boss!.maxHp,
    );
  });

  it("血量與攻擊力是「兩個」旋鈕 —— 動其中一個不會動到另一個", () => {
    cover("mob-boss-hero-derived");
    const shipped = mobRulesFromConfig(SHIPPED, DT, 3).boss!;
    // owner 2026-07-29 walked this from GH#206's 4 down to 2.
    expect(ARENA_RULES.mobWaves.boss!.heroDamageMult).toBe(2);
    const heroAd = championStatBase(HERO, Stat.AttackDamage, 99, COMBAT_ENV_DEFAULTS);
    expect(shipped.attackDamage).toBeCloseTo(heroAd * 2, 9);
    // …and NOT the flat 12 the pre-#206 doc still carries.
    expect(shipped.attackDamage).not.toBeCloseTo(ARENA_RULES.mobWaves.boss!.attackDamage, 6);

    // THE MUTATION THIS TEST EXISTS FOR: raise the DAMAGE knob to the hp one's
    // 20 and the hp must not move a point. An implementation that reads one
    // field for both (easy to write, invisible in a config diff) fails here.
    const hot = withBoss({ heroDamageMult: 20 });
    expect(hot.boss!.attackDamage).toBeCloseTo(heroAd * 20, 9);
    expect(hot.boss!.maxHp).toBe(shipped.maxHp);
    // …and symmetrically.
    const fat = withBoss({ heroHpMult: 40 });
    expect(fat.boss!.maxHp).not.toBe(shipped.maxHp);
    expect(fat.boss!.attackDamage).toBeCloseTo(shipped.attackDamage, 9);
  });

  it("移速錨在「一般殭屍」而不是英雄 —— 換英雄不會改變王的速度", () => {
    cover("mob-boss-hero-derived");
    const zombieMs = ARENA_RULES.mobWaves.mob.moveSpeed!;
    expect(ARENA_RULES.mobWaves.boss!.moveSpeedMult).toBe(0.2);
    expect(mobRulesFromConfig(SHIPPED, DT, 3).boss!.moveSpeed).toBeCloseTo(zombieMs * 0.2, 9);

    // THE DISCRIMINATOR. `test-other-hero` walks at 6.1 against 喪標麥可's 2.6, so
    // a hero-anchored implementation gives 1.22 here and 0.52 above — and the
    // 「特殊殭屍 ×0.5」 case it shares code with would come out FASTER than the
    // 3.0 zombie it is supposed to be a slowed-down version of.
    const other = withBoss({ championId: OTHER_ID });
    expect(other.boss!.moveSpeed).toBeCloseTo(zombieMs * 0.2, 9);
    // …but the hero DOES move hp/damage, so this is not just 「nothing is wired」.
    expect(other.boss!.maxHp).not.toBe(mobRulesFromConfig(SHIPPED, DT, 3).boss!.maxHp);

    // …and the anchor really is the zombie: retune the zombie and the king follows.
    const cfg = {
      ...SHIPPED,
      mob: { ...SHIPPED.mob, moveSpeed: 10 },
    } as MobWavesConfigLike;
    expect(mobRulesFromConfig(cfg, DT, 3).boss!.moveSpeed).toBeCloseTo(2, 9);
  });

  it("沒有 heroHpMult 的舊 arena：行為與 #206 之前完全相同", () => {
    cover("mob-boss-hero-derived");
    // THE CONTRACT A SHELF OF EXISTING TESTS DEPENDS ON. Strip the five new
    // fields and every number has to fall back to the pre-#206 answer.
    //
    // ⚠️ ROUND 9, NOT ROUND 3 — found by mutating tier 2 away and watching this
    // test stay GREEN. At round 3 the zombie is 60 hp, so ×100 is 6,000, which
    // is byte-identical to the flat `maxHp` the doc also carries: deleting the
    // `hpMult` tier entirely passes there. Round 9's zombie is 180, so the two
    // implementations are 18,000 apart. (The same trap is documented on
    // `mobs.boss.test.ts`'s own hpMult case; this one walked straight into it.)
    const strip = {
      heroHpMult: undefined,
      heroDamageMult: undefined,
      hpFlatBonus: undefined,
      moveSpeedMult: undefined,
      heroLevel: undefined,
    };
    const legacy = withBoss(strip, 9);
    const b = ARENA_RULES.mobWaves.boss!;
    const base = mobRulesFromConfig(SHIPPED, DT, 9);
    expect(legacy.boss!.maxHp).toBe(Math.max(1, Math.round(base.maxHp * b.hpMult!)));
    expect(legacy.boss!.maxHp).not.toBe(b.maxHp); // ← the discriminating line
    expect(legacy.boss!.attackDamage).toBe(b.attackDamage);
    expect(legacy.boss!.moveSpeed).toBe(b.moveSpeed);
    // …and with `hpMult` gone too it is the flat number, i.e. tier 3 survives.
    const flat = withBoss({ ...strip, hpMult: undefined }, 9);
    expect(flat.boss!.maxHp).toBe(b.maxHp);
  });

  it("英雄查不到就退回舊路徑 —— 不是 0, 不是 NaN, 不是 1 血的王", () => {
    cover("mob-boss-hero-derived");
    const missing = withBoss({ championId: "no-such-champion-doc" });
    const b = ARENA_RULES.mobWaves.boss!;
    const base = mobRulesFromConfig(SHIPPED, DT, 3);
    expect(Number.isFinite(missing.boss!.maxHp)).toBe(true);
    expect(missing.boss!.maxHp).toBe(Math.round(base.maxHp * b.hpMult!));
    expect(missing.boss!.attackDamage).toBe(b.attackDamage);
    // 移速 does NOT degrade with it — it never needed the champion at all.
    expect(missing.boss!.moveSpeed).toBeCloseTo(ARENA_RULES.mobWaves.mob.moveSpeed! * 0.2, 9);
  });
});

describe("特殊殭屍 · 從英雄推導 (GH#206)", () => {
  it("血量/攻擊力走英雄卡, 而且是 mobProfile 這個出貨路徑讀得到的", () => {
    cover("mob-special-hero-derived");
    const s = ARENA_RULES.mobWaves.special!;
    expect(s.heroHpMult).toBe(5);
    expect(s.heroDamageMult).toBe(2);
    // #290 owner 2026-07-29: 10,000 → 4,000 (the flat used to be 78% of the
    // special's round-3 hp, which made 隨機英雄 cosmetic); owner 2026-08-02
    // 「血太多 請都減半」→ 2,000。這一格是**平衡值**,所以不釘字面數字 ——
    // 三份鏡像相等由 `mobs.heroLevelSource.test.ts` 與 `apps/admin/src/mobWaves.test.ts` 守。
    expect(s.hpFlatBonus).toBeGreaterThan(0);
    expect(s.heroLevel).toBeUndefined(); // 等級由 heroLevelSource 決定, 不是這格
    // ⚠️ owner 2026-08-04 把出貨的特殊殭屍改成 `"curve"`（`回合*3+5`）。
    // 這一條讀的是**未釘死的原始出貨值**，所以它守的是「出貨檔真的照 owner 改了」。
    expect(SHIPPED_RAW.special!.heroLevelSource).toBe("curve");
    expect(SHIPPED_RAW.special!.levelCurve).toBeDefined();

    // READ THROUGH `mobProfile`, which is what `spawnMob` / MobSystem's melee /
    // MovementSystem all call — not through `rules.special`, which no system
    // reads directly.
    const rules = mobRulesFromConfig(SHIPPED, DT, 3);
    const prof = mobProfile(rules, "special");
    const heroHp = championStatBase(HERO, Stat.MaxHealth, rules.level, COMBAT_ENV_DEFAULTS);
    const heroAd = championStatBase(HERO, Stat.AttackDamage, rules.level, COMBAT_ENV_DEFAULTS);
    expect(prof.maxHp).toBe(Math.round(heroHp * s.heroHpMult!) + s.hpFlatBonus!);
    expect(prof.attackDamage).toBeCloseTo(heroAd * 2, 9);
    // …and NOT the ×zombie multipliers the block still carries.
    expect(prof.maxHp).not.toBe(Math.round(rules.maxHp * s.hpMult));
    expect(prof.attackDamage).not.toBeCloseTo(rules.attackDamage * s.damageMult, 6);
  });

  it("特殊殭屍跟著回合成長 (沒有 heroLevel), 移速仍然錨在一般殭屍", () => {
    cover("mob-special-hero-derived");
    const r3 = mobProfile(mobRulesFromConfig(SHIPPED, DT, 3), "special");
    const r9 = mobProfile(mobRulesFromConfig(SHIPPED, DT, 9), "special");
    expect(r9.maxHp).toBeGreaterThan(r3.maxHp);
    expect(r9.attackDamage).toBeGreaterThan(r3.attackDamage);
    // Pinning freezes it — which is what the KING does and the special
    // deliberately does not. ⚠️ #290: `heroLevel` ALONE no longer pins. The MODE
    // decides which number is read, so 「用這個數字」 has to be said out loud with
    // `heroLevelSource: "fixed"` — otherwise the shipped `"matchHighest"` (which
    // this fixture inherits) wins and the box is inert, exactly as designed.
    const pin = { heroLevel: 3, heroLevelSource: "fixed" } as const;
    const pinned3 = mobProfile(withSpecial(pin, 3), "special");
    const pinned9 = mobProfile(withSpecial(pin, 9), "special");
    expect(pinned9.maxHp).toBe(pinned3.maxHp);
    // …and the SAME fixture without the mode does NOT freeze — the assertion
    // that stops 「加了 enum 但沒人讀」 from passing as a pin.
    expect(mobProfile(withSpecial({ heroLevel: 3 }, 9), "special").maxHp).toBeGreaterThan(
      mobProfile(withSpecial({ heroLevel: 3 }, 3), "special").maxHp,
    );

    // 移速: owner 「−50%」, ×the ZOMBIE. Changing the special's face must not
    // move it (see the king's 移速 test for why this is the whole point).
    const zombieMs = ARENA_RULES.mobWaves.mob.moveSpeed!;
    expect(ARENA_RULES.mobWaves.special!.moveSpeedMult).toBe(0.5);
    expect(mobProfile(mobRulesFromConfig(SHIPPED, DT, 3), "special").moveSpeed).toBeCloseTo(
      zombieMs * 0.5,
      9,
    );
    expect(mobProfile(withSpecial({ championId: OTHER_ID }), "special").moveSpeed).toBeCloseTo(
      zombieMs * 0.5,
      9,
    );
    // A special zombie must never be FASTER than the zombies it hides among —
    // the literal reading of 「移動速度 −50%」, and the thing a hero anchor breaks.
    expect(mobProfile(mobRulesFromConfig(SHIPPED, DT, 3), "special").moveSpeed).toBeLessThan(
      mobProfile(mobRulesFromConfig(SHIPPED, DT, 3), "normal").moveSpeed,
    );
  });

  it("沒有 heroHpMult 的舊 arena：mobProfile 走回 ×一般殭屍的舊算式", () => {
    cover("mob-special-hero-derived");
    const legacy = withSpecial({
      heroHpMult: undefined,
      heroDamageMult: undefined,
      hpFlatBonus: undefined,
      heroLevel: undefined,
    });
    const s = ARENA_RULES.mobWaves.special!;
    const prof = mobProfile(legacy, "special");
    expect(prof.maxHp).toBe(Math.max(1, Math.round(legacy.maxHp * s.hpMult)));
    expect(prof.attackDamage).toBeCloseTo(legacy.attackDamage * s.damageMult, 9);
    // The absolute overrides really are ABSENT rather than zeroed — a 0 here
    // would be a 1-hp special zombie that dies to the first tick of anything.
    expect(legacy.special!.maxHp).toBeNull();
    expect(legacy.special!.attackDamage).toBeNull();
  });
});

describe("三份出貨值不能漂移 (GH#206)", () => {
  it("schema DEFAULT 與 content/config/arena-rules.json 的 boss/special 完全一致", () => {
    cover("mob-boss-hero-derived");
    // apps/admin/src/mobWaves.test.ts pins the CONSOLE's third copy against
    // these two; this is the sim-side half of the same fence, so a lane that
    // only touches shared/ still cannot ship a default the doc disagrees with.
    expect(DEFAULT_MOB_WAVES_CONFIG.boss).toEqual(ARENA_RULES.mobWaves.boss);
    expect(DEFAULT_MOB_WAVES_CONFIG.special).toEqual(ARENA_RULES.mobWaves.special);
  });
});

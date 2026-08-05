/**
 * 英雄卡讀在幾級 —— 三種模式 (#290, owner 2026-07-29).
 *
 * THE DIRECTIVE, verbatim: 「特殊殭屍也可以設 heroLevel,但預設是跟當時場上英雄
 * 最高等級相同(一樣是個選項),flat 降到 4,000」.
 *
 * ── 「場上英雄」是哪些?OWNER 2026-07-29 的裁決,逐字 ────────────────────────
 * 「①「場上英雄」是哪些?=> (a) 該小怪所在 zone 的全英雄(死活都計算在內)」
 *
 * 這一句推翻了本檔第一版寫的兩件事,兩件都有測試釘在下面:
 *   (a-1) **zone-scoped** —— 不是全世界。zone 1 打到 L60 不可以讓 zone 0 的殭屍
 *         變成 L60 的怪物,所以 `matchHighestChampionLevel(world, zone)` 的 zone
 *         是必填的,`mobSpawnProfile(world, zone, …)` 也是。
 *   (a-2) **死活都算** —— 第一版要求 `alive === true`,於是全隊倒地的那幾秒特殊
 *         殭屍會縮回該回合小怪等級(round 3 ⇒ 6,764 hp),有人被救起又彈回兩萬多。
 *         那是把 owner 的裁決做反了,而且難度曲線是倒的(隊友倒下 ⇒ 怪物變弱)。
 *
 * ── WHY THE HARD PART IS *WHEN*, NOT *WHAT* ────────────────────────────────
 * `"round"` and `"fixed"` are constants: `mobRulesFromConfig` bakes them at ARM
 * TIME and nothing downstream has to think. 「當時場上英雄最高等級」 is not a
 * constant — heroes level up inside a round (every Nth zombie kill, and the
 * king's `bountyLevels`) — so an arm-time implementation would make the 20th
 * special of a round identical to the 1st and STILL PASS every assertion you
 * could write against `mobRulesFromConfig` alone. That is failure shape ②
 * (算了沒送到) with a green suite on top.
 *
 * So the load-bearing test here is the one that spawns TWO mobs with a level-up
 * in between and demands two different numbers, read out of `world.health` —
 * the value the player actually fights. Everything else is the fence around it:
 *
 *  ③ 「刪掉還全綠」 — `"round"`, `"fixed"` and ABSENT are each pinned from their
 *     own side, so deleting the legacy chain is as red as deleting the new mode.
 *  ⑤ 「被測的不是出貨的」 — every number comes from `mobRulesFromConfig` /
 *     `spawnMob`, the two functions MatchController and MobSystem actually call.
 *     Nothing reads the config back and calls it a result.
 *  ⑦ 「掃屬性」 — 「the doc has a heroLevelSource」 is not a claim about hp. Each
 *     assertion is written so a wrong implementation lands on a DIFFERENT number
 *     (L40 vs L3 on this sheet is ~2.4× the hero term, not a rounding argument).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { Champions } from "./content/registry";
import { zChampionDoc } from "../content/schema/champion";
import {
  DEFAULT_MOB_WAVES_CONFIG,
  zMobHeroLevelSource,
  type MobWavesConfig,
} from "../content/schema/config";
import { championStatBase } from "./stats/attributes";
import { Stat } from "./stats/statTypes";
import { COMBAT_ENV_DEFAULTS } from "./combatEnv";
import type { ChampionDef } from "./content/defs";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import {
  MOB_CHAMPION_ID,
  MOB_HERO_LEVEL_SOURCES,
  matchHighestChampionLevel,
  mobArmedHeroLevel,
  mobLevelForRound,
  mobProfile,
  mobRulesFromConfig,
  mobSpawnProfile,
  spawnMob,
  type MobWavesConfigLike,
} from "./mobs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const DT = 1 / 30;

/** The SHIPPED doc, read off disk — not a fixture that could drift from it. */
const ARENA_RULES = JSON.parse(
  readFileSync(join(CONTENT_DIR, "config", "arena-rules.json"), "utf8"),
) as { mobWaves: MobWavesConfig };

/** The shipped 喪標麥可 hero sheet — the one the ×5 is a multiple OF. */
const DOC = zChampionDoc.parse(
  JSON.parse(readFileSync(join(CONTENT_DIR, "champions", `${MOB_CHAMPION_ID}.json`), "utf8")),
);
const HERO = { baseStats: DOC.baseStats, growth: DOC.growth, attributes: DOC.attributes };

beforeAll(() => {
  registerSkeletonContent();
  Champions.register(MOB_CHAMPION_ID as ChampionId, {
    id: MOB_CHAMPION_ID as ChampionId,
    name: DOC.name,
    role: DOC.role,
    attackType: DOC.attackType,
    modelKey: DOC.modelKey,
    baseStats: DOC.baseStats,
    growth: DOC.growth,
    attributes: DOC.attributes,
    abilities: {} as ChampionDef["abilities"],
    skillOrder: [],
    buildPriority: [],
    tags: DOC.tags ?? [],
  });
});

const SHIPPED = ARENA_RULES.mobWaves as unknown as MobWavesConfigLike;

/** `mobRulesFromConfig` over the shipped doc with `special` patched. */
function withSpecial(patch: Record<string, unknown>, round = 3) {
  const cfg = {
    ...SHIPPED,
    special: {
      ...(SHIPPED.special as object),
      // EVERY spawn is a special, so `spawnMob` cannot hand back a plain zombie
      // and make a hp assertion pass for the wrong reason.
      chancePercent: 100,
      ...patch,
    },
  } as MobWavesConfigLike;
  return mobRulesFromConfig(cfg, DT, round);
}

function newWorld(seed = 1): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, seed);
  w.combatActive = true;
  return w;
}

/** One skeleton champion at `level`, alive, in `zone` (default 0). */
function hero(w: SimWorld, seat: number, level: number, zone = 0): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(seat % 2),
    pos: { x: seat * 2, z: 0 },
    zone,
    level,
  });
}

/** The hp a special zombie ACTUALLY spawns with — `world.health`, not the rules. */
function spawnSpecialHp(
  w: SimWorld,
  rules: ReturnType<typeof withSpecial>,
  i = 0,
  zone = 0,
): number {
  const id = spawnMob(w, zone, rules, 1, i);
  expect(w.mob.get(id)!.kind).toBe("special");
  return w.health.get(id)!.maxHp;
}

/**
 * `round(championStatBase(MaxHealth, level) × heroHpMult) + hpFlatBonus` — the
 * owner's formula, with **both knobs read off the shipped config**.
 *
 * ⚠️ 這兩個數字以前是寫死的（`× 5` / `+ 4000`）。它們是 owner 反覆調的平衡值
 * （flat 走過 10,000 → 4,000 → 2,000），而寫死等於把它們釘進**第四個地方** ——
 * 於是每一次調平衡都變成改程式，正好是 CLAUDE.md 第一守則在防的事。
 *
 * 讀設定並沒有讓這些測試變空：它們驗的是**公式的形狀**（英雄卡 × 倍率 + 定值,
 * 且等級來自場上最高），不是那兩個數字本身。數字本身由
 * 「schema DEFAULT ↔ content json ↔ 後台 SHIPPED」三面互釘的漂移測試守。
 */
function expectedSpecialHp(level: number): number {
  const s = ARENA_RULES.mobWaves.special!;
  return (
    Math.round(championStatBase(HERO, Stat.MaxHealth, level, COMBAT_ENV_DEFAULTS) * s.heroHpMult!) +
    s.hpFlatBonus!
  );
}

describe("#290 · 「跟當時場上英雄最高等級相同」 是在生成那一刻算的", () => {
  it("場上最高 L40 → 特殊殭屍用 L40 推導;有人升到 L60 再生一隻 → 數字跟著變", () => {
    cover("mob-special-hero-level-source");
    const w = newWorld();
    const a = hero(w, 0, 12);
    hero(w, 1, 40);
    const rules = withSpecial({ heroLevelSource: "matchHighest" }, 3);

    // 1) The first spawn reads the CURRENT top level (40), not the round's 3.
    const first = spawnSpecialHp(w, rules, 0);
    expect(first).toBe(expectedSpecialHp(40));
    // …and demonstrably NOT the round-3 answer an arm-time implementation gives.
    expect(first).not.toBe(expectedSpecialHp(3));

    // 2) THE WHOLE POINT. Level somebody up mid-round, spawn again with the SAME
    //    armed `rules` object — an arm-time implementation returns `first` here,
    //    because its number was frozen before this line existed.
    w.champion.get(a)!.level = 60;
    const second = spawnSpecialHp(w, rules, 1);
    expect(second).toBe(expectedSpecialHp(60));
    expect(second).toBeGreaterThan(first);

    // 3) The mob already on the field keeps ITS number — hp is per-entity, so a
    //    late spawn must not retroactively buff the one standing next to it.
    expect(first).toBe(expectedSpecialHp(40));
  });

  it("死掉的英雄照樣算 —— owner 2026-07-29「(a) …全英雄(死活都計算在內)」", () => {
    cover("mob-special-hero-level-source");
    // OWNER, 2026-07-29, verbatim:
    //   「①「場上英雄」是哪些?=> (a) 該小怪所在 zone 的全英雄(死活都計算在內)」
    //
    // 這條測試的前一版寫的是相反的事(「死掉的英雄不算」),把 owner 的裁決做反
    // 了。留一句在這裡是為了讓下一個人不要「順手改回去」:要求 alive 的版本會讓
    // 全隊倒地的那幾秒特殊殭屍從 22,748 hp 縮成 6,764 hp,救起來又彈回去。
    const w = newWorld();
    const a = hero(w, 0, 55);
    const rules = withSpecial({ heroLevelSource: "matchHighest" }, 3);
    expect(spawnSpecialHp(w, rules, 0)).toBe(expectedSpecialHp(55));

    w.health.get(a)!.alive = false;
    // 屍體照算 —— 55,不是 null。
    expect(matchHighestChampionLevel(w, 0)).toBe(55);
    const afterWipe = spawnSpecialHp(w, rules, 1);
    expect(afterWipe).toBe(expectedSpecialHp(55));
    // …而且明確 NOT 該回合等級。這一行是「做反了」與「做對了」分岔的地方:
    // 舊語意在這裡會拿到 expectedSpecialHp(3) = 6,764,差距 ~3.4 倍,不是捨入。
    expect(afterWipe).not.toBe(expectedSpecialHp(3));
    expect(Number.isFinite(afterWipe)).toBe(true);
  });

  it("一個英雄都沒有的世界才退回該回合等級,而且不 throw", () => {
    cover("mob-special-hero-level-source");
    const w = newWorld();
    expect(matchHighestChampionLevel(w, 0)).toBeNull();
    const rules = withSpecial({ heroLevelSource: "matchHighest" }, 7);
    expect(() => spawnMob(w, 0, rules, 1, 0)).not.toThrow();
    // ⇒ `"round"` fallback, spelled out. 死活都算之後這是 `armedLevel` 唯一還走
    // 得到的路:那個 zone 真的一個英雄都沒有。
    //
    // ⚠️ 期望值從 `mobLevelForRound` 推導,不是寫死 7(2026-08-04 owner 給了
    // 普通殭屍一條曲線)。寫死的話這條會因為**曲線被調過**而紅,訊息卻說
    // 「空世界的 fallback 壞了」—— 用錯誤訊息紅掉的斷言(CLAUDE.md)。
    expect(rules.level).toBe(mobLevelForRound(SHIPPED, 7));
    expect(spawnSpecialHp(w, rules, 1)).toBe(expectedSpecialHp(rules.level));
  });

  it("最高等級的讀取走排序過的迭代,而且真的是 MAX 不是 first/last", () => {
    cover("mob-special-hero-level-source");
    // Insertion order deliberately NOT ascending by level: an implementation
    // that returns the first or the last entry lands on 9 or 21, never 47.
    const w = newWorld();
    hero(w, 0, 9);
    hero(w, 1, 47);
    hero(w, 2, 21);
    expect(matchHighestChampionLevel(w, 0)).toBe(47);

    // Determinism: the same set built in the opposite insertion order answers
    // identically, and so does the spawned hp that reads it.
    const w2 = newWorld();
    hero(w2, 2, 21);
    hero(w2, 1, 47);
    hero(w2, 0, 9);
    expect(matchHighestChampionLevel(w2, 0)).toBe(47);
    const rules = withSpecial({ heroLevelSource: "matchHighest" }, 3);
    expect(spawnSpecialHp(w, rules, 0)).toBe(spawnSpecialHp(w2, rules, 0));
  });
});

describe("#290 · 「該小怪所在 zone 的」 —— 隔壁擂台的高等英雄不算", () => {
  it("zone 1 的 L80 不可以動到 zone 0 的殭屍;zone 1 自己的殭屍才吃得到", () => {
    cover("mob-special-hero-level-source");
    // 一場 3v3v3v3 同時有好幾個 duel zone 在打。owner 2026-07-29 (a):
    //   「該小怪所在 zone 的全英雄」 —— 不是全世界的。
    const w = newWorld();
    hero(w, 0, 12, 0); // 這一區的英雄還很菜
    hero(w, 1, 80, 1); // 隔壁那一區已經打到 L80
    const rules = withSpecial({ heroLevelSource: "matchHighest" }, 3);

    expect(matchHighestChampionLevel(w, 0)).toBe(12);
    expect(matchHighestChampionLevel(w, 1)).toBe(80);

    // 生在 zone 0 的殭屍讀 12 —— 一個「掃全世界」的實作會在這裡拿到 L80,
    // 而 L80 的答案跟 L12 差 ~4.6 倍,不是捨入爭議。
    const inZone0 = spawnSpecialHp(w, rules, 0, 0);
    expect(inZone0).toBe(expectedSpecialHp(12));
    expect(inZone0).not.toBe(expectedSpecialHp(80));

    // 同一個 `rules` 物件、同一個世界,生在 zone 1 就讀 80。兩隻不同的數字證明
    // 這是「按 zone 查」而不是「剛好都回同一個 fallback」。
    const inZone1 = spawnSpecialHp(w, rules, 1, 1);
    expect(inZone1).toBe(expectedSpecialHp(80));
    expect(inZone1).toBeGreaterThan(inZone0);
  });

  it("英雄全在別的 zone ⇒ 這個 zone 退回 armedLevel,不是借用隔壁的", () => {
    cover("mob-special-hero-level-source");
    const w = newWorld();
    hero(w, 0, 99, 2);
    expect(matchHighestChampionLevel(w, 0)).toBeNull();
    const rules = withSpecial({ heroLevelSource: "matchHighest" }, 4);
    // `rules.level` = 該回合的小怪等級(曲線推導,見上一條的說明)。
    expect(spawnSpecialHp(w, rules, 0, 0)).toBe(expectedSpecialHp(rules.level));
  });
});

describe("#290 · 另外兩個模式與「沒填」", () => {
  it("`fixed` 完全不受場上等級影響", () => {
    cover("mob-special-hero-level-source");
    const rules = withSpecial({ heroLevelSource: "fixed", heroLevel: 30 }, 3);
    const empty = newWorld();
    const crowded = newWorld();
    hero(crowded, 0, 99);
    // Same number with an empty field and with a level-99 lobby — the assertion
    // that separates 「指定」 from 「跟場上最高」.
    expect(spawnSpecialHp(empty, rules, 0)).toBe(expectedSpecialHp(30));
    expect(spawnSpecialHp(crowded, rules, 0)).toBe(expectedSpecialHp(30));
    // …and it is NOT the round level either, so 「fixed 其實走 round」 is red.
    expect(expectedSpecialHp(30)).not.toBe(expectedSpecialHp(3));
  });

  it("`round` 沿用該回合的小怪等級, 隨回合成長, 不看場上", () => {
    cover("mob-special-hero-level-source");
    const w = newWorld();
    hero(w, 0, 88);
    const r3 = withSpecial({ heroLevelSource: "round" }, 3);
    const r9 = withSpecial({ heroLevelSource: "round" }, 9);
    expect(spawnSpecialHp(w, r3, 0)).toBe(expectedSpecialHp(r3.level));
    expect(spawnSpecialHp(w, r9, 1)).toBe(expectedSpecialHp(r9.level));
    // 「隨回合成長」是這條的主張,所以它要自己被斷言,不能只靠兩個等式碰巧不同。
    expect(r9.level).toBeGreaterThan(r3.level);
    expect(spawnSpecialHp(w, r9, 2)).toBeGreaterThan(spawnSpecialHp(w, r3, 3));
  });

  it("ABSENT 退化成 #290 之前的鏈 `heroLevel ?? 該回合等級`, 兩邊都測", () => {
    cover("mob-special-hero-level-source");
    const w = newWorld();
    hero(w, 0, 88);
    // (a) no `heroLevel` either ⇒ the round's level, exactly like the pre-#290
    //     特殊殭屍 (「跟著回合成長」).
    const legacyRound = withSpecial({ heroLevelSource: undefined, heroLevel: undefined }, 6);
    expect(legacyRound.special!.heroDerive ?? null).toBeNull();
    expect(spawnSpecialHp(w, legacyRound, 0)).toBe(expectedSpecialHp(legacyRound.level));
    // (b) an authored `heroLevel` with no mode ⇒ that number, exactly like the
    //     pre-#290 king. This is the half that a 「absent means round」 shortcut
    //     would break, and it would break it by cutting the king's hp in half.
    const legacyPinned = withSpecial({ heroLevelSource: undefined, heroLevel: 51 }, 6);
    expect(spawnSpecialHp(w, legacyPinned, 1)).toBe(expectedSpecialHp(51));
    // The pure resolver says the same thing, for both blocks and both branches.
    expect(mobArmedHeroLevel({}, 6)).toBe(6);
    expect(mobArmedHeroLevel({ heroLevel: 51 }, 6)).toBe(51);
    expect(() => mobArmedHeroLevel({ heroLevelSource: "matchHighest" }, 6)).not.toThrow();
  });

  it("非 matchHighest 的 kind 完全不帶重算資料 —— 熱路徑一次乘法都沒多做", () => {
    cover("mob-special-hero-level-source");
    // `heroDerive` is the ONLY thing `mobSpawnProfile` branches on, so 「其他模式
    // 零成本」 is exactly the claim that it stays null.
    expect(withSpecial({ heroLevelSource: "round" }).special!.heroDerive ?? null).toBeNull();
    expect(withSpecial({ heroLevelSource: "fixed" }).special!.heroDerive ?? null).toBeNull();
    expect(withSpecial({ heroLevelSource: "matchHighest" }).special!.heroDerive).not.toBeNull();
    // A block that names the mode but derives NOTHING (no hero multipliers) also
    // stays null — otherwise every spawn would recompute two `null`s forever.
    const noMults = withSpecial({
      heroLevelSource: "matchHighest",
      heroHpMult: undefined,
      heroDamageMult: undefined,
    });
    expect(noMults.special!.heroDerive ?? null).toBeNull();
    // …and that arena still spawns the pre-#206 ×一般殭屍 special, unharmed.
    const w = newWorld();
    hero(w, 0, 70);
    expect(spawnSpecialHp(w, noMults, 0)).toBe(
      Math.max(1, Math.round(noMults.maxHp * noMults.special!.hpMult)),
    );
  });

  it("`mobSpawnProfile` 對 matchHighest 以外的一切 = `mobProfile`,逐欄位相同", () => {
    cover("mob-special-hero-level-source");
    const w = newWorld();
    hero(w, 0, 77);
    for (const kind of ["normal", "special", "boss"] as const) {
      const rules = withSpecial({ heroLevelSource: "round" }, 5);
      expect(mobSpawnProfile(w, 0, rules, kind), kind).toEqual(mobProfile(rules, kind));
    }
  });

  it("模式名稱與 schema 一致 (少一個就會有一個存不進去的選項)", () => {
    cover("mob-special-hero-level-source");
    // 「後台選單」與「sim 認得的」是兩份清單,少一邊 = 後台存得進去、遊戲讀不懂,
    // 而且是靜默的(落到 default 分支)。`"curve"` 是 2026-08-04 加的第四個。
    expect([...MOB_HERO_LEVEL_SOURCES].sort()).toEqual([
      "curve",
      "fixed",
      "matchHighest",
      "round",
    ]);
    expect([...zMobHeroLevelSource.options].sort()).toEqual([...MOB_HERO_LEVEL_SOURCES].sort());
  });
});

describe("#290 · 出貨的 flat 與 heroLevelSource 真的走完出貨路徑", () => {
  it("content json 與 schema DEFAULT 的 flat 完全一致, 而且真的進到 mobRulesFromConfig 的輸出", () => {
    cover("mob-special-hero-level-source");
    // 這一格是 owner 反覆調的平衡值(10,000 → 4,000 → 2,000, 2026-08-02 「請都減半」),
    // 所以這裡驗的是**兩份出貨鏡像相等**,不是某一個字面數字 —— 釘字面值等於
    // 每次調平衡都要改測試,而那正是第一守則在防的事。真正會壞的是「有人只改了
    // 其中一份」,那個由下面這條等式抓。
    const flat = ARENA_RULES.mobWaves.special!.hpFlatBonus!;
    expect(DEFAULT_MOB_WAVES_CONFIG.special!.hpFlatBonus).toBe(flat);
    // 仍然要有下界:flat 是「英雄卡以外的保底血」,0 會讓低等英雄的特殊殭屍
    // 一擊即死,而那是靜默的 —— 沒有任何畫面會說「保底沒了」。
    expect(flat).toBeGreaterThan(0);
    // owner 2026-08-04 把出貨的兩格都改成 `"curve"`(特殊 `回合*3+5`、王 `回合²+10`)。
    // 這兩行守的是「出貨檔真的照裁決改了」,所以它們**故意**釘字面值。
    expect(ARENA_RULES.mobWaves.special!.heroLevelSource).toBe("curve");
    expect(ARENA_RULES.mobWaves.boss!.heroLevelSource).toBe("curve");
    expect(ARENA_RULES.mobWaves.special!.levelCurve).toBeDefined();
    expect(ARENA_RULES.mobWaves.boss!.levelCurve).toBeDefined();

    // …and the SHIPPED PATH produces it. 等級從**出貨的那條曲線**推導,所以
    // 「曲線沒接上」(退回 roundLevel = 7)在這裡就是紅的,差 ~1.9 倍不是捨入。
    const w = newWorld();
    hero(w, 0, 25);
    const rules = mobRulesFromConfig(SHIPPED, DT, 3);
    const armed = mobArmedHeroLevel(ARENA_RULES.mobWaves.special!, rules.level, 3);
    expect(armed).not.toBe(rules.level);
    const hp = mobSpawnProfile(w, 0, rules, "special").maxHp;
    const heroPart = Math.round(
      championStatBase(HERO, Stat.MaxHealth, armed, COMBAT_ENV_DEFAULTS) *
        ARENA_RULES.mobWaves.special!.heroHpMult!,
    );
    expect(hp).toBe(heroPart + flat);
    // 而且 flat 真的是**加上去**的,不是被吞掉 —— 只驗 `hp === heroPart + flat`
    // 在 flat 為 0 時對「完全不讀 flat」的實作也會過。
    expect(hp - heroPart).toBe(flat);
  });

  it("殭屍王的等級來自曲線,而且不看場上的英雄", () => {
    cover("mob-special-hero-level-source");
    // ⚠️ 這條以前叫「殭屍王仍然是滿級 99」。owner 2026-08-04 把王改成
    // `回合*回合+10`,所以「滿級 99」從**規格**變成**過期的斷言** —— 留著它會
    // 在下一個人改對的時候紅,而訊息說「fixed 把等級鬆綁了」。
    //
    // 沒變的那一半才是這條要守的:王的等級**不看場上英雄**(`heroDerive` 為
    // null,熱路徑一次重算都不做),而且不會被一隊菜英雄拖下去。
    const w = newWorld();
    hero(w, 0, 12); // a low-level field must not drag the king down
    for (const round of [3, 9]) {
      const rules = mobRulesFromConfig(SHIPPED, DT, round);
      const level = mobArmedHeroLevel(ARENA_RULES.mobWaves.boss!, rules.level, round);
      const expected =
        Math.round(championStatBase(HERO, Stat.MaxHealth, level, COMBAT_ENV_DEFAULTS) * 20) +
        100000;
      expect(rules.boss!.maxHp, `R${round}`).toBe(expected);
      expect(mobSpawnProfile(w, 0, rules, "boss").maxHp, `R${round}`).toBe(expected);
      expect(rules.boss!.heroDerive ?? null).toBeNull();
    }
    // 而且真的**隨回合長**(擋「曲線接上了但每回合都回同一個數字」)。
    expect(mobRulesFromConfig(SHIPPED, DT, 9).boss!.maxHp).toBeGreaterThan(
      mobRulesFromConfig(SHIPPED, DT, 3).boss!.maxHp,
    );
  });
});

describe("#290 · 已知缺口 (刻意記錄,不是通過)", () => {
  it("KNOWN GAP: matchHighest 只改到血量;近戰傷害仍是 arm-time 值", () => {
    cover("mob-special-hero-level-source");
    // MobSystem's melee reads `mobProfile(rules, kind).attackDamage` on the
    // PER-TICK path from the SHARED `world.mobRules`, so there is nowhere
    // per-entity to put a spawn-time damage number without a new MobComp field.
    // `mobSpawnProfile` already computes the right one — the consumer is what is
    // missing. This test PINS the gap so it is visible in CI instead of living
    // in a comment: closing it (MobComp carries the spawn-time damage) makes
    // this assertion fail, which is the intended way to find it.
    const w = newWorld();
    hero(w, 0, 60);
    const rules = withSpecial({ heroLevelSource: "matchHighest" }, 3);
    const armTime = mobProfile(rules, "special").attackDamage; // what MobSystem swings with
    const spawnTime = mobSpawnProfile(w, 0, rules, "special").attackDamage; // what it should be
    expect(spawnTime).toBeGreaterThan(armTime);
    expect(spawnTime).toBeCloseTo(
      championStatBase(HERO, Stat.AttackDamage, 60, COMBAT_ENV_DEFAULTS) * 2,
      9,
    );
    expect(armTime).toBeCloseTo(
      championStatBase(HERO, Stat.AttackDamage, rules.level, COMBAT_ENV_DEFAULTS) * 2,
      9,
    );
  });
});

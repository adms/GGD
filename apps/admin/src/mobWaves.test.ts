/**
 * 殭屍波系統 — the pure logic, plus the three DRIFT PINS that make this page
 * trustworthy rather than merely present:
 *
 *   1. SCHEMA. `schedule[].championId` must exist and be optional — the whole
 *      「每回合殭屍指定哪個英雄來擔任」 column stores nothing without it, and
 *      the row object is `.strict()`, so a doc carrying the field would be
 *      REJECTED by the content loader if the schema lost it. Deleting the field
 *      from packages/shared fails right here.
 *   2. THE SHIPPED DEFAULTS + the two derived formulas are restated inside
 *      mobWaves.ts to keep zod and SimWorld out of the eager admin bundle. They
 *      are compared against `DEFAULT_MOB_WAVES_CONFIG`, `MOB_CHAMPION_ID`,
 *      `MOB_MODEL_KEY`, `mobCapsForRound` and `mobLevelForRound` here, where
 *      importing those is free.
 *   3. THE REAL DOC. `content/config/arena-rules.json` is parsed off disk and
 *      round-tripped through the form, so 「後台編出來的東西」 and 「線上真的
 *      在跑的東西」 cannot diverge silently.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  DEFAULT_MOB_WAVES_CONFIG,
  zMobWavesConfig,
} from "@ggd/shared/content/schema/config";
import {
  MOB_CHAMPION_ID,
  MOB_MODEL_KEY,
  DEFAULT_MOB_BASE_LEVEL,
  DEFAULT_MOB_LEVEL_PER_ROUND,
  mobCapsForRound,
  mobLevelForRound,
} from "@ggd/shared/sim/mobs";
import {
  MOB_BASE_LEVEL_FALLBACK,
  MOB_CHAMPION_FALLBACK,
  MOB_LEVEL_PER_ROUND_FALLBACK,
  MOB_MODEL_FALLBACK,
  MOB_WAVES_FIELD_ORDER,
  MOB_WAVES_GROUPS,
  MOB_WAVES_LABELS,
  SETTLEMENT_MODES,
  SHIPPED_MOB_WAVES,
  addScheduleRow,
  capsForRound,
  championLabel,
  changedFields,
  configFromForm,
  extractMobWaves,
  formFromConfig,
  formValid,
  groupsCoverAllFields,
  hpForRound,
  isDirty,
  lastAuthoredRound,
  levelForRound,
  patchArenaRules,
  removeScheduleRow,
  resetField,
  roundRows,
  scheduleChanged,
  setField,
  setRoundChampion,
  setScheduleCell,
  shippedForm,
  sortChampions,
  validateField,
  validateForm,
  effectiveGold,
  effectiveGoldText,
  goldPoolLastHitBonus,
  MOB_WAVES_GOLD_ENV_KEY,
  type MobWavesConfig,
  type MobWavesFieldKey,
} from "./mobWaves";

const ARENA_RULES_PATH = fileURLToPath(
  new URL("../../../content/config/arena-rules.json", import.meta.url),
);
const ARENA_RULES = JSON.parse(readFileSync(ARENA_RULES_PATH, "utf8")) as Record<string, unknown>;

/**
 * THE FIELD LIST, WRITTEN OUT BY HAND.
 *
 * Deliberately not derived from `MOB_WAVES_FIELD_ORDER` — a test that iterates
 * the registry it is testing passes just as happily when the registry is empty.
 * This is the owner's 「每一個欄位」 spelled out, so deleting any one of them
 * from the page's registry fails the suite.
 */
const EVERY_FIELD: readonly MobWavesFieldKey[] = [
  "fromRound",
  "firstWaveSec",
  "waveIntervalSec",
  "mobsPerWaveCap",
  "maxAlivePerZone",
  "stopSpawnOnTeamWipe",
  "roundHoldMobKinds",
  // GH#268 精英小怪血條
  "healthBar.showHealthBar",
  "healthBar.barWidth",
  "healthBar.barHeight",
  "healthBar.yOffset",
  "healthBar.showThreshold",
  "mob.maxHp",
  "mob.attackDamage",
  "mob.moveSpeed",
  "mob.attackRange",
  "mob.attackCdSec",
  "mob.radius",
  "mob.modelKey",
  "mob.championId",
  // 由誰擔任:指定 / 隨機 (#289)
  "mob.championSource",
  "mob.sizeMult",
  "mob.tintStrength",
  // #247 腳下圈圈 (owner 2026-08-01)
  "mob.groundRingDiameter",
  "mob.groundRingSizeFollow",
  "mob.baseLevel",
  "mob.levelPerRound",
  "mob.levelCurve.perRoundSq",
  "mob.levelCurve.perRound",
  "mob.levelCurve.flat",
  "mob.baseHp",
  "mob.hpPerLevel",
  "mob.baseRegen",
  "mob.regenPerLevel",
  "reward.gold",
  "reward.xp",
  "reward.killsPerLevel",
  // 殭屍王 (#262)
  "boss.enabled",
  "boss.killThreshold",
  "boss.repeatable",
  "boss.maxHp",
  "boss.attackDamage",
  "boss.attackCdSec",
  "boss.attackRange",
  "boss.moveSpeed",
  "boss.radius",
  "boss.modelKey",
  "boss.championId",
  "boss.championSource",
  "boss.sizeMult",
  "boss.hpMult",
  "boss.bountyGold",
  "boss.bountyXp",
  "boss.bountyLevels",
  "boss.lastHitMultiplier",
  "boss.lastHitMode",
  "boss.countOverkill",
  // #247 無視碰撞 + 每回合上限 (owner 2026-08-01)
  "boss.noClip",
  "boss.noClipUnits",
  "boss.noClipObstacles",
  "boss.noClipStayInside",
  "boss.maxPerRound",
  "boss.maxPerRoundScope",
  // #247 第二批 —— 仇恨排序 + 長血條 (owner 2026-08-01)
  "boss.aggroRank",
  "boss.healthBar",
  "boss.healthBarAnchor",
  "boss.healthBarReveal",
  // #291 分紅結算的字 (owner 2026-08-03「特殊殭屍 不應該用殭屍王 分紅結算畫面」)
  "boss.settlementTitle",
  // 從英雄推導 (GH#206) — 生命與能力屬性 = 該設定英雄的 N 倍, +M, 移速 ×K, 等級 99
  "boss.heroHpMult",
  "boss.heroDamageMult",
  "boss.hpFlatBonus",
  "boss.moveSpeedMult",
  "boss.heroLevel",
  // 等級來源:跟場上最高 / 指定 / 沿用回合 (#290)
  "boss.heroLevelSource",
  "boss.levelCurve.perRoundSq",
  "boss.levelCurve.perRound",
  "boss.levelCurve.flat",
  // 特殊殭屍 (#262)
  "special.chancePercent",
  "special.hpMult",
  "special.damageMult",
  "special.moveSpeedMult",
  "special.radiusMult",
  "special.rewardMult",
  "special.modelKey",
  "special.championId",
  "special.championSource",
  "special.sizeMult",
  // 從英雄推導 (GH#206) — no `moveSpeedMult`: the special already has one, and
  // it already means 「×一般殭屍」, which is the only anchor that reads correctly.
  "special.heroHpMult",
  "special.heroDamageMult",
  "special.hpFlatBonus",
  "special.heroLevel",
  "special.heroLevelSource",
  "special.levelCurve.perRoundSq",
  "special.levelCurve.perRound",
  "special.levelCurve.flat",
  // 分紅獎池 (#288) — owner 2026-07-29 「特殊殭屍也照傷害比例分」
  "special.bountyGold",
  "special.bountyXp",
  "special.bountyLevels",
  "special.lastHitMultiplier",
  "special.lastHitMode",
  "special.splitByDamage",
  "special.countOverkill",
  // #291 —— 它自己的字 + 它自己的呈現模式
  "special.settlementTitle",
  "special.settlementMode",
];

// ---------------------------------------------------------------------------

describe("schema — the per-round 由誰擔任 column has somewhere to live", () => {
  it("accepts a schedule row carrying championId", () => {
    cover("admin-mob-waves");
    const parsed = zMobWavesConfig.safeParse({
      ...DEFAULT_MOB_WAVES_CONFIG,
      schedule: [{ round: 7, mobsPerWaveCap: 15, maxAlivePerZone: 30, championId: "godie-hblm" }],
    });
    // The row object is `.strict()`. Without the schema field this is a hard
    // "Unrecognized key" failure — which is exactly the point: the console could
    // store the column and the GAME WOULD REFUSE TO LOAD the doc.
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schedule?.[0]?.championId).toBe("godie-hblm");
    }
  });

  it("keeps it OPTIONAL — every legacy row still parses", () => {
    cover("admin-mob-waves");
    const parsed = zMobWavesConfig.safeParse(DEFAULT_MOB_WAVES_CONFIG);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.schedule?.[0]?.championId).toBeUndefined();
  });

  it("rejects an EMPTY championId rather than storing a blank id", () => {
    cover("admin-mob-waves");
    const parsed = zMobWavesConfig.safeParse({
      ...DEFAULT_MOB_WAVES_CONFIG,
      schedule: [{ round: 7, mobsPerWaveCap: 1, maxAlivePerZone: 1, championId: "" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("what the console PRODUCES parses against the real schema", () => {
    cover("admin-mob-waves");
    let form = formFromConfig(SHIPPED_MOB_WAVES);
    form = setScheduleCell(form, 0, "championId", "godie-hblm");
    form = setField(form, "mob.attackDamage", "3.5");
    const parsed = zMobWavesConfig.safeParse(configFromForm(form));
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe(true);
  });
});

describe("drift pins — the console's copies match the engine", () => {
  it("the console's 出貨版 is BYTE-FOR-BYTE the real arena-rules doc", () => {
    cover("admin-mob-waves");
    // THE pin. `SHIPPED_MOB_WAVES` is the 全部重設 target and the pre-fetch seed,
    // so if it drifts from content/config/arena-rules.json the page shows — and
    // offers to restore — numbers the game has never run.
    expect(SHIPPED_MOB_WAVES).toEqual(extractMobWaves(ARENA_RULES));
  });

  it("agrees with DEFAULT_MOB_WAVES_CONFIG on every key that contract defines", () => {
    cover("admin-mob-waves");
    // Not a whole-object compare: the doc authors `mob.modelKey`
    // (champ.mob.zombie) and the engine's fallback contract deliberately does
    // not, leaving the sim to use MOB_MODEL_KEY. Compare what both declare.
    for (const [k, v] of Object.entries(DEFAULT_MOB_WAVES_CONFIG)) {
      if (k === "mob" || k === "reward") continue;
      expect(SHIPPED_MOB_WAVES[k as "fromRound"], `${k} drifted`).toEqual(v);
    }
    for (const [k, v] of Object.entries(DEFAULT_MOB_WAVES_CONFIG.mob)) {
      expect(SHIPPED_MOB_WAVES.mob[k as "maxHp"], `mob.${k} drifted`).toEqual(v);
    }
    expect(SHIPPED_MOB_WAVES.reward).toEqual(DEFAULT_MOB_WAVES_CONFIG.reward);
  });

  it("the fallbacks equal the sim's constants", () => {
    cover("admin-mob-waves");
    expect(MOB_CHAMPION_FALLBACK).toBe(MOB_CHAMPION_ID);
    expect(MOB_MODEL_FALLBACK).toBe(MOB_MODEL_KEY);
    expect(MOB_BASE_LEVEL_FALLBACK).toBe(DEFAULT_MOB_BASE_LEVEL);
    expect(MOB_LEVEL_PER_ROUND_FALLBACK).toBe(DEFAULT_MOB_LEVEL_PER_ROUND);
  });

  it("capsForRound / levelForRound agree with the sim for every round 0..14", () => {
    cover("admin-mob-waves");
    for (let r = 0; r <= 14; r++) {
      expect(capsForRound(SHIPPED_MOB_WAVES, r), `caps @${r}`).toEqual(
        mobCapsForRound(SHIPPED_MOB_WAVES, r),
      );
      expect(levelForRound(SHIPPED_MOB_WAVES, r), `level @${r}`).toBe(
        mobLevelForRound(SHIPPED_MOB_WAVES, r),
      );
    }
  });

  it("hpForRound uses the #244 mob-card law, and says so when there is no card", () => {
    cover("admin-mob-waves");
    // 律:`baseHp + hpPerLevel × (該回合等級 − 1)`。⚠️ 期望值從**這一頁自己的**
    // `levelForRound` 推導,而那一支在上面已經被釘成跟引擎逐位元相同 —— 所以這條
    // 仍然是「後台印的血量 = 玩家打到的血量」,而不是一個會被 owner 調等級曲線
    // 撞紅的字面值(它以前寫死 60 / 120)。
    const law = (round: number): number =>
      Math.round(
        SHIPPED_MOB_WAVES.mob.baseHp! +
          SHIPPED_MOB_WAVES.mob.hpPerLevel! * (levelForRound(SHIPPED_MOB_WAVES, round) - 1),
      );
    expect(hpForRound(SHIPPED_MOB_WAVES, 3)).toBe(law(3));
    expect(hpForRound(SHIPPED_MOB_WAVES, 6)).toBe(law(6));
    expect(law(6)).toBeGreaterThan(law(3));
    const noCurve = {
      ...SHIPPED_MOB_WAVES,
      mob: { ...SHIPPED_MOB_WAVES.mob, baseHp: undefined },
    };
    // NOT `maxHp` — with no card the sim reads the CHAMPION doc, which this page
    // cannot see. A number here would be a number that is not true.
    expect(hpForRound(noCurve, 3)).toBeNull();
  });
});

describe("the real shipped doc", () => {
  it("round-trips through the form without changing a single value", () => {
    cover("admin-mob-waves");
    const block = extractMobWaves(ARENA_RULES);
    expect(block).not.toBeNull();
    expect(configFromForm(formFromConfig(block!))).toEqual(block);
  });

  it("still describes round 10 as the empty 乾淨總決賽", () => {
    cover("admin-mob-waves");
    const block = extractMobWaves(ARENA_RULES)!;
    const rows = roundRows(block, 10);
    const finale = rows.find((r) => r.round === 10)!;
    expect(finale.active).toBe(true);
    expect(finale.mobsPerWaveCap).toBe(0);
    expect(finale.maxAlivePerZone).toBe(0);
    // the flag the table paints a badge from — this is what stops 0/0 reading
    // as a typo
    expect(finale.cleanFinale).toBe(true);
    // and no OTHER round is flagged that way
    expect(rows.filter((r) => r.cleanFinale).map((r) => r.round)).toEqual([10]);
  });

  it("lastAuthoredRound reaches the doc's own last round", () => {
    cover("admin-mob-waves");
    expect(lastAuthoredRound(ARENA_RULES)).toBeGreaterThanOrEqual(10);
  });
});

describe("每一個欄位 are reachable and labelled", () => {
  it("the registry covers exactly the hand-written field list", () => {
    cover("admin-mob-waves");
    expect([...MOB_WAVES_FIELD_ORDER].sort()).toEqual([...EVERY_FIELD].sort());
  });

  it("every field has a 中文名, a 影響 line and a kind", () => {
    cover("admin-mob-waves");
    for (const key of EVERY_FIELD) {
      const spec = MOB_WAVES_LABELS[key];
      expect(spec, `${key} unlabelled`).toBeDefined();
      expect(spec.zh.length, `${key} has no 中文名`).toBeGreaterThan(1);
      // the owner's 「不要只是一排沒有標籤的輸入框」: a note that just repeats
      // the name is not a note
      expect(spec.note.length, `${key} has no 影響說明`).toBeGreaterThan(6);
      expect(spec.note).not.toBe(spec.zh);
    }
  });

  it("every OPTIONAL field says what leaving it blank means", () => {
    cover("admin-mob-waves");
    for (const key of EVERY_FIELD) {
      const spec = MOB_WAVES_LABELS[key];
      if (!spec.optional) continue;
      expect(spec.emptyMeans, `${key} is optional but never says what blank means`).toBeTruthy();
    }
  });

  it("the display groups partition the field list", () => {
    cover("admin-mob-waves");
    expect(groupsCoverAllFields()).toBe(true);
    const seen = MOB_WAVES_GROUPS.flatMap((g) => g.keys);
    expect(seen.length).toBe(EVERY_FIELD.length);
  });

  it("EVERY field actually reaches the saved payload", () => {
    cover("admin-mob-waves");
    // A distinct, legal value per field, so an omitted one cannot hide behind a
    // shared default. This is the 「算出來但沒送到端點」 guard.
    const edits: Record<MobWavesFieldKey, string> = {
      fromRound: "2",
      firstWaveSec: "4",
      waveIntervalSec: "5",
      mobsPerWaveCap: "7",
      maxAlivePerZone: "9",
      stopSpawnOnTeamWipe: "0",
      roundHoldMobKinds: "any",
      // GH#268 —— 五個 sentinel 都和出貨值不同（true/34/5/0.35/1），所以一條
      // `configFromForm` 沒寫的行會以「拿到出貨值」的形態被抓到，而不是剛好相等。
      "healthBar.showHealthBar": "0",
      "healthBar.barWidth": "48",
      "healthBar.barHeight": "9",
      "healthBar.yOffset": "1.25",
      "healthBar.showThreshold": "0.4",
      "mob.maxHp": "111",
      "mob.attackDamage": "2.5",
      "mob.moveSpeed": "4.5",
      "mob.attackRange": "2.2",
      "mob.attackCdSec": "1.5",
      "mob.radius": "0.75",
      "mob.modelKey": "champ.mob.other",
      "mob.championId": "godie-hblm",
      // #289 — every sentinel differs from the shipped value (mob=fixed,
      // boss=random, special=random), so a `configFromForm` line that was
      // never written shows up as the SHIPPED value rather than as a match.
      "mob.championSource": "random",
      "mob.sizeMult": "1.4",
      "mob.tintStrength": "0.4",
      // #247 腳下圈圈 —— sentinels distinct from the shipped 1.25 / 1.
      "mob.groundRingDiameter": "3.5",
      "mob.groundRingSizeFollow": "0.5",
      "mob.baseLevel": "5",
      "mob.levelPerRound": "2",
      "mob.levelCurve.perRoundSq": "0.5",
      "mob.levelCurve.perRound": "3.5",
      "mob.levelCurve.flat": "4",
      "mob.baseHp": "33",
      "mob.hpPerLevel": "44",
      "mob.baseRegen": "1.5",
      "mob.regenPerLevel": "0.25",
      "reward.gold": "66",
      "reward.xp": "77",
      "reward.killsPerLevel": "8",
      "boss.enabled": "1",
      "boss.killThreshold": "150",
      "boss.repeatable": "0",
      "boss.maxHp": "7500",
      "boss.attackDamage": "14",
      "boss.attackCdSec": "1.6",
      "boss.attackRange": "3.1",
      "boss.moveSpeed": "2.9",
      "boss.radius": "2.1",
      "boss.championId": "godie-efur",
      "boss.championSource": "fixed",
      "boss.sizeMult": "7.5",
      "boss.hpMult": "55",
      // GH#206 — the hero-derived block. Distinct from everything else here so
      // an omitted `configFromForm` line shows up as this exact number missing.
      "boss.heroHpMult": "17",
      "boss.heroDamageMult": "6",
      "boss.hpFlatBonus": "88000",
      "boss.moveSpeedMult": "0.35",
      "boss.heroLevel": "77",
      // #290 — not the shipped "fixed", so a `configFromForm` line that never
      // wrote this key shows up as a diff instead of matching by luck.
      "boss.heroLevelSource": "round",
      "boss.levelCurve.perRoundSq": "2",
      "boss.levelCurve.perRound": "1.5",
      "boss.levelCurve.flat": "12",
      "boss.modelKey": "champ.mob.king-double",
      "boss.bountyGold": "4200",
      "boss.bountyXp": "1600",
      "boss.lastHitMultiplier": "3",
  "boss.bountyLevels": "50",
  "boss.lastHitMode": "bonus",
  "boss.countOverkill": "0",
  // #247 無視碰撞 + 每回合上限 —— every sentinel differs from the shipped value
  // (true/true/true/true/1/"zone"), so a field that never reaches the payload
  // cannot hide behind its own default.
  "boss.noClip": "0",
  "boss.noClipUnits": "0",
  "boss.noClipObstacles": "0",
  "boss.noClipStayInside": "0",
  "boss.maxPerRound": "3",
  "boss.maxPerRoundScope": "match",
  // #247 第二批 —— 仇恨排序 + 長血條三格 (owner 2026-08-01)
  "boss.aggroRank": "0.5",
  "boss.healthBar": "0",
  "boss.healthBarAnchor": "bottom",
  "boss.healthBarReveal": "sighted",
  // #291 —— sentinel 和出貨的「殭屍王 分紅結算」不同,所以一行沒寫進 payload
  // 會顯示成出貨值而不是碰巧對上。
  "boss.settlementTitle": "王 · 結算",
      "special.chancePercent": "12",
      "special.hpMult": "2.5",
      "special.damageMult": "1.75",
      "special.moveSpeedMult": "1.4",
      "special.radiusMult": "2.2",
      "special.rewardMult": "4",
      "special.championId": "godie-hblm",
      "special.championSource": "inherit",
      "special.sizeMult": "2.4",
      "special.heroHpMult": "6.5",
      "special.heroDamageMult": "3",
      "special.hpFlatBonus": "9000",
      "special.heroLevel": "42",
      // #290 — not the shipped "matchHighest", same reason as the king's.
      "special.heroLevelSource": "fixed",
      "special.levelCurve.perRoundSq": "0.25",
      "special.levelCurve.perRound": "4.5",
      "special.levelCurve.flat": "7",
      "special.modelKey": "champ.mob.special-double",
      // #288 — every sentinel differs from the shipped block (5000/200/5/1/
      // bonus/on/off), so a `configFromForm` line that was never written shows
      // up as this exact number missing rather than as a value that happens to
      // match the default.
      "special.bountyGold": "7300",
      "special.bountyXp": "310",
      "special.bountyLevels": "8",
      "special.lastHitMultiplier": "2.5",
      "special.lastHitMode": "weight",
      "special.splitByDamage": "0",
      "special.countOverkill": "1",
      // #291 —— 同上,兩格 sentinel 都和出貨值不同(「特殊殭屍 分紅結算」/ panel)。
      "special.settlementTitle": "特殊 · 結算",
      "special.settlementMode": "toast",
    };
    let form = formFromConfig(SHIPPED_MOB_WAVES);
    for (const [k, v] of Object.entries(edits)) form = setField(form, k as MobWavesFieldKey, v);
    const cfg = configFromForm(form) as unknown as Record<string, unknown>;
    // ⚠️ 走**全部**路徑段,不是只走兩段。2026-08-04 的 `levelCurve.*` 是三段的
    // （`mob.levelCurve.perRoundSq`），而舊版的 `const [head, tail] = split(".")`
    // 會停在 `levelCurve` 上、拿到那個物件,於是「這一格有沒有送到 payload」
    // 這件事**根本沒被問**,而斷言訊息會說它「沒到」—— 兩邊都是假的。
    const at = (key: MobWavesFieldKey): unknown =>
      key.split(".").reduce<unknown>(
        (node, seg) => (node as Record<string, unknown> | undefined)?.[seg],
        cfg,
      );
    for (const key of EVERY_FIELD) {
      const kind = MOB_WAVES_LABELS[key].kind;
      const expected =
        kind === "int" || kind === "num"
          ? Number(edits[key])
          : kind === "bool"
            ? edits[key] === "1"
            : edits[key];
      expect(at(key), `${key} never reached the payload`).toBe(expected);
    }
  });
});

describe("validation mirrors the schema instead of guessing", () => {
  it("blank is legal for an optional field and an error for a required one", () => {
    cover("admin-mob-waves");
    expect(validateField("mob.moveSpeed", "")).toBe("");
    expect(validateField("mob.attackDamage", "")).not.toBe("");
  });

  it("integer fields refuse a fraction", () => {
    cover("admin-mob-waves");
    expect(validateField("mobsPerWaveCap", "2.5")).not.toBe("");
    expect(validateField("mob.attackDamage", "2.5")).toBe("");
  });

  it("`.positive()` fields refuse 0 and `.min(0)` fields accept it", () => {
    cover("admin-mob-waves");
    expect(validateField("mob.attackCdSec", "0")).not.toBe("");
    expect(validateField("mob.attackDamage", "0")).toBe("");
    expect(validateField("reward.gold", "0")).toBe("");
    expect(validateField("mobsPerWaveCap", "0")).not.toBe("");
  });

  it("a blank optional field is OMITTED from the payload, never written as 0", () => {
    cover("admin-mob-waves");
    const form = setField(formFromConfig(SHIPPED_MOB_WAVES), "mob.hpPerLevel", "");
    const cfg = configFromForm(form);
    expect("hpPerLevel" in cfg.mob).toBe(false);
    // and the schema is happy with the omission
    expect(zMobWavesConfig.safeParse(cfg).success).toBe(true);
  });

  it("#289 清空「由誰擔任:指定/隨機」⇒ 那個 key 消失,不是被寫回出貨的 random", () => {
    cover("admin-mob-waves");
    // 這三格出貨值是 fixed / random / random,所以「留空 = 沿用出貨值」的實作
    // 會把 `random` 寫回去,操作員永遠清不掉,而且 `changedFields` 會報一個
    // 沒人做過的 diff。`optEnum`(不是 `enumOf`)才是對的那一個。
    let form = formFromConfig(SHIPPED_MOB_WAVES);
    for (const k of ["mob.championSource", "boss.championSource", "special.championSource"] as const) {
      form = setField(form, k, "");
    }
    const cfg = configFromForm(form);
    expect("championSource" in cfg.mob).toBe(false);
    expect("championSource" in cfg.boss!).toBe(false);
    expect("championSource" in cfg.special!).toBe(false);
    expect(zMobWavesConfig.safeParse(cfg).success).toBe(true);
  });

  it("#289 三個來源格只收 fixed / random / inherit —— wave / mob / 亂打都被擋在頁面上", () => {
    cover("admin-mob-waves");
    for (const k of ["mob.championSource", "boss.championSource", "special.championSource"] as const) {
      for (const ok of ["fixed", "random", "inherit"]) expect(validateField(k, ok)).toBe("");
      // 這一版刻意不提供 per-wave / per-mob(數值是 arm time 從一位英雄推導的)。
      for (const bad of ["wave", "mob", "__random__", "Random"]) {
        expect(validateField(k, bad), `${k}=${bad} 被放行`).not.toBe("");
      }
      // 留空合法 —— 這三格是 optional。
      expect(validateField(k, "")).toBe("");
    }
  });

  it("catches a duplicated round in the schedule", () => {
    cover("admin-mob-waves");
    let form = formFromConfig(SHIPPED_MOB_WAVES);
    form = setScheduleCell(form, 1, "round", "6");
    expect(validateForm(form).general.length).toBeGreaterThan(0);
    expect(formValid(form)).toBe(false);
  });

  it("a non-integer cap in the schedule is rejected per row", () => {
    cover("admin-mob-waves");
    const form = setScheduleCell(formFromConfig(SHIPPED_MOB_WAVES), 0, "maxAlivePerZone", "3.5");
    expect(validateForm(form).schedule[0]?.maxAlivePerZone).toBeTruthy();
  });
});

describe("the per-round table", () => {
  it("shows rounds BEFORE fromRound as inactive rather than hiding them", () => {
    cover("admin-mob-waves");
    const rows = roundRows(SHIPPED_MOB_WAVES, 10);
    expect(rows[0]?.round).toBe(1);
    expect(rows[0]?.active).toBe(false);
    expect(rows[2]?.round).toBe(3);
    expect(rows[2]?.active).toBe(true);
  });

  it("un-scheduled rounds inherit the base caps and are marked as such", () => {
    cover("admin-mob-waves");
    const rows = roundRows(SHIPPED_MOB_WAVES, 10);
    const r4 = rows.find((r) => r.round === 4)!;
    expect(r4.overridden).toBe(false);
    expect(r4.mobsPerWaveCap).toBe(SHIPPED_MOB_WAVES.mobsPerWaveCap);
    expect(r4.maxAlivePerZone).toBe(SHIPPED_MOB_WAVES.maxAlivePerZone);
  });

  it("a per-round championId overrides the whole-match one, and only for that round", () => {
    cover("admin-mob-waves");
    const cfg = {
      ...SHIPPED_MOB_WAVES,
      schedule: [{ round: 7, mobsPerWaveCap: 15, maxAlivePerZone: 30, championId: "godie-hblm" }],
    };
    const rows = roundRows(cfg, 10);
    const r7 = rows.find((r) => r.round === 7)!;
    expect(r7.championId).toBe("godie-hblm");
    expect(r7.championOverridden).toBe(true);
    const r8 = rows.find((r) => r.round === 8)!;
    expect(r8.championId).toBe(SHIPPED_MOB_WAVES.mob.championId);
    expect(r8.championOverridden).toBe(false);
  });

  it("falls all the way back to the sim default when the block names no champion", () => {
    cover("admin-mob-waves");
    const cfg = {
      ...SHIPPED_MOB_WAVES,
      mob: { ...SHIPPED_MOB_WAVES.mob, championId: undefined },
      schedule: undefined,
    };
    expect(roundRows(cfg, 4).find((r) => r.round === 4)?.championId).toBe(MOB_CHAMPION_FALLBACK);
  });

  it("adding a row seeds it with the caps ALREADY in force, not with zeros", () => {
    cover("admin-mob-waves");
    // Round 4 has no row; it inherits 5/15. A fresh row must not silently become
    // the 0/0 「這回合沒有殭屍」 setting.
    const form = addScheduleRow(formFromConfig(SHIPPED_MOB_WAVES), 4);
    const added = form.schedule.find((r) => r.round === "4")!;
    expect(added.mobsPerWaveCap).toBe(String(SHIPPED_MOB_WAVES.mobsPerWaveCap));
    expect(added.maxAlivePerZone).toBe(String(SHIPPED_MOB_WAVES.maxAlivePerZone));
    expect(added.championId).toBe("");
  });

  it("adding a row keeps the table sorted, and adding a duplicate is a no-op", () => {
    cover("admin-mob-waves");
    const form = addScheduleRow(formFromConfig(SHIPPED_MOB_WAVES), 4);
    expect(form.schedule.map((r) => Number(r.round))).toEqual([4, 6, 7, 8, 9, 10]);
    expect(addScheduleRow(form, 4).schedule.length).toBe(form.schedule.length);
  });

  it("setRoundChampion CREATES the row for a round that has none (GH#191 UX)", () => {
    cover("admin-mob-waves");
    // THE DEFECT: 由誰擔任 was only editable on rounds with an existing caps row,
    // and the shipped schedule starts at round 6 — so rounds 3-5, where the
    // zombies actually appear, were uneditable. The old code path had no way to
    // express this at all, so an implementation that still requires a row gives
    // a DIFFERENT answer here (`undefined`).
    const base = formFromConfig(SHIPPED_MOB_WAVES);
    expect(base.schedule.some((r) => r.round === "3")).toBe(false);
    const form = setRoundChampion(base, 3, "godie-efur");
    const row = form.schedule.find((r) => r.round === "3");
    expect(row?.championId).toBe("godie-efur");
    // …and creating it must not change that round's caps — the operator asked
    // to change the FACE, not to hand round 3 a different wave size.
    const before = capsForRound(SHIPPED_MOB_WAVES, 3);
    const after = capsForRound(configFromForm(form), 3);
    expect(after).toEqual(before);
    // it reaches the saved payload, and the schema accepts it
    const cfg = configFromForm(form);
    expect(cfg.schedule?.find((r) => r.round === 3)?.championId).toBe("godie-efur");
    expect(zMobWavesConfig.safeParse(cfg).success).toBe(true);
    // the table stays sorted (the row was appended, not spliced blindly)
    expect(form.schedule.map((r) => Number(r.round))).toEqual([3, 6, 7, 8, 9, 10]);
  });

  it("setRoundChampion edits an EXISTING row in place, and clearing a row-less round is a no-op", () => {
    cover("admin-mob-waves");
    const base = formFromConfig(SHIPPED_MOB_WAVES);
    // round 6 HAS a row: edit in place, do not add a second one for round 6
    const edited = setRoundChampion(base, 6, "godie-hblm");
    expect(edited.schedule.length).toBe(base.schedule.length);
    expect(edited.schedule.find((r) => r.round === "6")?.championId).toBe("godie-hblm");
    // Selecting the empty option on a round with no row must NOT manufacture
    // one — opening a dropdown and closing it would otherwise dirty the form.
    expect(setRoundChampion(base, 3, "")).toBe(base);
    // …but clearing an EXISTING row's champion is a real edit and is kept.
    expect(setRoundChampion(edited, 6, "").schedule.find((r) => r.round === "6")?.championId).toBe(
      "",
    );
  });

  it("removing every row drops the `schedule` key entirely (back to the legacy shape)", () => {
    cover("admin-mob-waves");
    let form = formFromConfig(SHIPPED_MOB_WAVES);
    while (form.schedule.length > 0) form = removeScheduleRow(form, 0);
    const cfg = configFromForm(form);
    expect("schedule" in cfg).toBe(false);
    expect(zMobWavesConfig.safeParse(cfg).success).toBe(true);
    // …and then every round is on the base caps
    expect(roundRows(cfg, 10).find((r) => r.round === 10)?.maxAlivePerZone).toBe(
      SHIPPED_MOB_WAVES.maxAlivePerZone,
    );
  });
});

describe("saving", () => {
  it("patchArenaRules replaces mobWaves and touches NOTHING else", () => {
    cover("admin-mob-waves");
    const next = patchArenaRules(ARENA_RULES, configFromForm(shippedForm()));
    for (const key of Object.keys(ARENA_RULES)) {
      if (key === "mobWaves") continue;
      expect(next[key], `${key} was disturbed by the save`).toEqual(ARENA_RULES[key]);
    }
    // the sibling blocks the owner explicitly told this task not to touch
    for (const key of ["rounds", "flowers", "guardianTower", "goldDrop", "reviveCircles"]) {
      expect(next[key]).toEqual(ARENA_RULES[key]);
    }
    expect(next["mobWaves"]).toEqual(SHIPPED_MOB_WAVES);
  });

  it("the full patched doc still parses as a whole arena-rules document", async () => {
    cover("admin-mob-waves");
    const { zConfigArenaRulesDoc } = await import("@ggd/shared/content/schema/config");
    let form = formFromConfig(extractMobWaves(ARENA_RULES)!);
    form = setScheduleCell(form, 4, "championId", "godie-efur");
    const parsed = zConfigArenaRulesDoc.safeParse(patchArenaRules(ARENA_RULES, configFromForm(form)));
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe(true);
  });

  it("tracks unsaved edits — fields and the schedule table separately", () => {
    cover("admin-mob-waves");
    const saved = SHIPPED_MOB_WAVES;
    const clean = formFromConfig(saved);
    expect(isDirty(clean, saved)).toBe(false);
    expect(changedFields(setField(clean, "reward.gold", "40"), saved)).toEqual(["reward.gold"]);
    expect(scheduleChanged(setScheduleCell(clean, 0, "championId", "godie-hblm"), saved)).toBe(true);
    expect(scheduleChanged(clean, saved)).toBe(false);
  });

  it("重設 puts one field back to the shipped value without touching its neighbours", () => {
    cover("admin-mob-waves");
    let form = setField(formFromConfig(SHIPPED_MOB_WAVES), "reward.gold", "999");
    form = setField(form, "reward.xp", "888");
    form = resetField(form, "reward.gold");
    expect(form.fields["reward.gold"]).toBe(String(SHIPPED_MOB_WAVES.reward.gold));
    expect(form.fields["reward.xp"]).toBe("888");
  });
});

describe("the champion picker shows people, not slugs", () => {
  it("labels an id with its 中文名", () => {
    cover("admin-mob-waves");
    const opts = [{ id: "godie-zombiex", name: "喪標麥可" }];
    expect(championLabel("godie-zombiex", opts)).toBe("喪標麥可（godie-zombiex）");
  });

  it("degrades to the bare id when the doc had no name", () => {
    cover("admin-mob-waves");
    expect(championLabel("godie-x", [{ id: "godie-x", name: "godie-x" }])).toBe("godie-x");
    expect(championLabel("missing", [])).toBe("missing");
  });

  it("sorts named champions first", () => {
    cover("admin-mob-waves");
    const sorted = sortChampions([
      { id: "godie-a", name: "godie-a" },
      { id: "godie-b", name: "阿banana" },
    ]);
    expect(sorted[0]?.id).toBe("godie-b");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * #291 分紅結算的措辭 —— owner 2026-08-03
 *   「特殊殭屍 不應該用殭屍王 分紅結算畫面」
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("#291 分紅結算的抬頭與呈現模式", () => {
  it("三個模式和 schema 的 enum 是同一張表（多一個少一個都存不進去）", () => {
    cover("admin-mob-waves");
    for (const m of SETTLEMENT_MODES) {
      const cfg = {
        ...DEFAULT_MOB_WAVES_CONFIG,
        special: { ...DEFAULT_MOB_WAVES_CONFIG.special!, settlementMode: m },
      };
      expect(zMobWavesConfig.safeParse(cfg).success, `${m} 被 schema 拒絕`).toBe(true);
      expect(validateField("special.settlementMode", m), `${m} 被後台擋掉`).toBe("");
    }
    // 反向對照組：schema 不認得的值，後台也必須擋 —— 否則上面那組對「什麼都放行」
    // 的實作也會全過（失敗形態④）。
    // ⚠️ 不列 `"toast "`：`validateField` 和整頁一樣先 trim，所以前後空白是合法的
    // 輸入（存進去的是 trim 過的值）。列進來只會測到 trim 本身。
    for (const bad of ["Panel", "none", "hidden", "0"]) {
      expect(validateField("special.settlementMode", bad), `${bad} 被放行`).not.toBe("");
      const cfg = {
        ...DEFAULT_MOB_WAVES_CONFIG,
        special: { ...DEFAULT_MOB_WAVES_CONFIG.special!, settlementMode: bad },
      };
      expect(zMobWavesConfig.safeParse(cfg).success, `${bad} 被 schema 放行`).toBe(false);
    }
  });

  it("兩個抬頭出貨值不一樣 —— 相同就等於這一格從來沒做", () => {
    cover("admin-mob-waves");
    const boss = SHIPPED_MOB_WAVES.boss!.settlementTitle;
    const special = SHIPPED_MOB_WAVES.special!.settlementTitle;
    expect(boss).toBeTruthy();
    expect(special).toBeTruthy();
    expect(special, "特殊殭屍還是穿著殭屍王的字").not.toBe(boss);
    // 而且 SHIPPED_* 必須等於 content/ 那一份（這一頁在 GET 回來之前畫的就是它）。
    expect(boss).toBe(extractMobWaves(ARENA_RULES)!.boss!.settlementTitle);
    expect(special).toBe(extractMobWaves(ARENA_RULES)!.special!.settlementTitle);
  });

  it("清空三格 ⇒ key 消失，不是被寫回出貨值（#289 的同一個坑）", () => {
    cover("admin-mob-waves");
    let form = formFromConfig(SHIPPED_MOB_WAVES);
    for (const k of [
      "boss.settlementTitle",
      "special.settlementTitle",
      "special.settlementMode",
    ] as const) {
      form = setField(form, k, "");
    }
    const cfg = configFromForm(form);
    expect("settlementTitle" in cfg.boss!).toBe(false);
    expect("settlementTitle" in cfg.special!).toBe(false);
    expect("settlementMode" in cfg.special!).toBe(false);
    expect(zMobWavesConfig.safeParse(cfg).success).toBe(true);
  });

  it("抬頭有上界 —— 24 字過、25 字被 schema 擋（只有下界等於沒有驗證）", () => {
    cover("admin-mob-waves");
    const ok = { ...DEFAULT_MOB_WAVES_CONFIG.boss!, settlementTitle: "字".repeat(24) };
    const tooLong = { ...DEFAULT_MOB_WAVES_CONFIG.boss!, settlementTitle: "字".repeat(25) };
    expect(zMobWavesConfig.safeParse({ ...DEFAULT_MOB_WAVES_CONFIG, boss: ok }).success).toBe(true);
    expect(
      zMobWavesConfig.safeParse({ ...DEFAULT_MOB_WAVES_CONFIG, boss: tooLong }).success,
    ).toBe(false);
  });
});

/**
 * 「實發」——顯示真實值 (owner 2026-08-04「顯示不說謊 => 顯示真實值，跟其他系統
 * 倍率一樣」，同 #125).
 *
 * ⚠️ 這是體驗層（一個後台欄位旁邊多印一行字），所以是**一條薄守衛**，不開對抗
 * 輪：刪掉 `effectiveGold` 的乘算或把欄位接到錯的那一格會紅，其餘不深挖。
 *
 * ⛔ 一個出貨數值都沒有抄進來：金額由「跑兩個不同的倍率去比」得到，端點由
 * `SHIPPED_MOB_WAVES` 推導，不是寫死「30,000 → 3,000 – 6,000」（0.1 / 2 都是
 * owner 每週在動的東西）。
 */
describe("實發（金錢欄位旁邊的乘完值）", () => {
  const GOLD_FIELDS = ["reward.gold", "special.bountyGold", "boss.bountyGold"] as const;
  /** 沒有獎池分紅資訊的那一份 —— 「補刀加碼」問不到，所以永遠是單一數字。 */
  const NO_POOL = null;

  it("★ 三個金錢欄位都認得，其餘欄位一律不印實發", () => {
    cover("admin-mob-waves");
    for (const k of GOLD_FIELDS) {
      expect(MOB_WAVES_GOLD_ENV_KEY[k], `${k} 沒有對應到任何一格發放倍率`).toBeDefined();
    }
    // 非金錢欄位問到的是 null —— 否則「每殺一隻給經驗」旁邊會冒出一個「實發 N 金」。
    for (const k of ["reward.xp", "mob.maxHp", "boss.bountyXp"] as const) {
      expect(effectiveGold(k, "100", { goldMobKill: 0.5, goldEliteKill: 0.5 }, NO_POOL)).toBeNull();
    }
  });

  it("★ 倍率真的被乘進去了（半倍 → 一半，0 → 0）", () => {
    cover("admin-mob-waves");
    // 用「同一個欄位、兩張不同的表」比較，所以沒有任何出貨數值住在這裡。
    const half = effectiveGold("reward.gold", "1000", { goldMobKill: 0.5 }, NO_POOL);
    expect(half, "半倍下沒算出實發").not.toBeNull();
    expect(half!.paid).toBe(500);
    expect(half!.configured, "設定值被改掉了 —— 框裡那個數字必須原封不動").toBe(1000);
    expect(effectiveGold("reward.gold", "1000", { goldMobKill: 0 }, NO_POOL)!.paid).toBe(0);
  });

  it("★ 普通殭屍與特殊殭屍/殭屍王讀的是**不同**的兩格（跟 sim 的分桶一致）", () => {
    cover("admin-mob-waves");
    // 只關掉「打一般殭屍」那一格：每殺一隻歸零，兩個獎池不動。
    const onlyMobOff = { goldMobKill: 0, goldEliteKill: 0.5 };
    expect(effectiveGold("reward.gold", "1000", onlyMobOff, NO_POOL)!.paid).toBe(0);
    expect(effectiveGold("special.bountyGold", "1000", onlyMobOff, NO_POOL)!.paid).toBe(500);
    expect(
      effectiveGold("boss.bountyGold", "1000", onlyMobOff, NO_POOL)!.paid,
      "殭屍王接到了「打一般殭屍」那一格 —— sim 把它算在特殊殭屍那格",
    ).toBe(500);
  });

  it("★ 沒有倍率表 / 空欄位 / 中性 1.0 → 不印（寧可不印，也不要印一個猜的）", () => {
    cover("admin-mob-waves");
    expect(effectiveGold("reward.gold", "1000", null, NO_POOL), "讀不到表卻印了實發").toBeNull();
    expect(effectiveGold("special.bountyGold", "", { goldEliteKill: 0.5 }, NO_POOL)).toBeNull();
    expect(
      effectiveGold("reward.gold", "1000", { goldMobKill: 1 }, NO_POOL),
      "1.0 是雜訊",
    ).toBeNull();
  });

  it("★ 那一行字要指名是哪一格倍率（否則操作者不知道去哪裡改）", () => {
    cover("admin-mob-waves");
    const e = effectiveGold("boss.bountyGold", "1000", { goldEliteKill: 0.5 }, NO_POOL)!;
    const text = effectiveGoldText(e, "打特殊殭屍／殭屍王發放金錢");
    expect(text).toContain("實發");
    expect(text).toContain("500");
    expect(text, "沒有說是哪一格在乘").toContain("打特殊殭屍／殭屍王發放金錢");
  });
});

/**
 * 實發**是一個區間** —— 第一版 chip 對殭屍王少報了一半 (2026-08-04)。
 *
 * 為什麼會少報：`設定值 × 倍率` 是**下界**，而出貨的 `lastHitMode: "bonus"`
 * （額外加碼）讓補刀的人「除了自己那份再多領一份自己的份額」，所以總額會超出
 * 獎池，超出多少**取決於傷害分佈** —— 複驗者在三人分紅量到一個值、在單一英雄
 * 包辦全部傷害＋補刀量到另一個值，兩個都對，它本來就是一個區間。
 *
 * ⛔ 驗的是**機制**不是數字：「是不是區間」「端點是不是由 `lastHitMode` /
 * `lastHitMultiplier` 這兩個後台欄位算出來的」。30000 / 2 / 0.1 一個都沒有抄進
 * 斷言 —— 期望值全部從 `SHIPPED_MOB_WAVES` 推導，倍率用一個測試自己挑的探針值。
 *
 * 薄守衛，不開對抗輪：這是體驗層（欄位旁邊多一行字）。
 */
describe("實發是一個區間（補刀加碼撐開的上界）", () => {
  /** 測試自己挑的探針倍率 —— 不是出貨值，出貨值換了它也不會紅。 */
  const PROBE = 0.5;
  const ENV = { goldMobKill: PROBE, goldEliteKill: PROBE };
  const LABEL = "打特殊殭屍／殭屍王發放金錢";

  /** 出貨那一份，只換掉殭屍王的兩個補刀欄位。 */
  function bossWith(patch: {
    lastHitMode?: "bonus" | "weight";
    lastHitMultiplier?: number;
  }): MobWavesConfig {
    return {
      ...SHIPPED_MOB_WAVES,
      boss: { ...SHIPPED_MOB_WAVES.boss!, ...patch },
    };
  }

  it("★ 出貨設定（額外加碼 + 倍率>1）→ 實發是區間，上界 = 下界 × 補刀倍率", () => {
    cover("admin-mob-waves");
    const shippedBoss = SHIPPED_MOB_WAVES.boss!;
    // 前提檢查：出貨真的是「會撐開區間」的那一組。這一行紅掉代表 owner 把出貨值
    // 改成守恆模式了 —— 那時候要動的是這個 describe 的前提，不是實作。
    expect(
      goldPoolLastHitBonus("boss.bountyGold", SHIPPED_MOB_WAVES),
      "出貨的殭屍王已經不是「額外加碼 + 倍率>1」了",
    ).toBeGreaterThan(1);

    const e = effectiveGold(
      "boss.bountyGold",
      String(shippedBoss.bountyGold),
      ENV,
      SHIPPED_MOB_WAVES,
    )!;
    expect(e, "出貨設定下完全沒算出實發").not.toBeNull();
    // 端點從設定推導，不抄字面值。
    expect(e.paid, "下界不是 獎池 × 發放倍率").toBe(
      Math.round(shippedBoss.bountyGold * PROBE),
    );
    expect(e.paidMax, "上界沒有把補刀加碼算進去 —— 這就是 chip 少報一半的那個缺陷").toBe(
      Math.round(shippedBoss.bountyGold * shippedBoss.lastHitMultiplier * PROBE),
    );
    expect(e.paidMax, "上界沒有比下界高，等於根本不是區間").toBeGreaterThan(e.paid);

    const text = effectiveGoldText(e, LABEL);
    expect(text, "區間的下界沒印在畫面上").toContain(String(e.paid));
    expect(text, "區間的上界沒印在畫面上 —— 操作者看到的還是單一數字").toContain(
      String(e.paidMax),
    );
    expect(text, "沒說為什麼是區間（補刀者多領一份 → 看傷害分佈）").toContain("傷害分佈");
  });

  it("★ 上界是「讀操作者設的補刀倍率」算的,不是寫死出貨的那個值", () => {
    cover("admin-mob-waves");
    // 為什麼要這一條:上面那條的每一個期望值都拿**出貨的** lastHitMultiplier 當來源,
    // 所以 `goldPoolLastHitBonus` 的 `return mult;` 改成 `return <出貨值>;`(＝無視操作者
    // 在後台打的數字,永遠假設出貨那個倍率)之後,apps/admin 全套 1,141 條**全綠**。
    // 「有讀那個欄位」與「寫死一個常數」在那條斷言眼裡一模一樣 —— 失敗形態 ④。
    //
    // 所以這裡刻意用一個**不等於出貨值**的倍率:操作者在後台把它調大,chip 的上界
    // 就必須跟著動。倍率本身仍然從 `SHIPPED_*` 推導(× 2),不抄字面值 —— 出貨值哪天
    // 從 2 改成 5,這條測試不用跟著改,而它守的東西沒有變。
    const shippedBoss = SHIPPED_MOB_WAVES.boss!;
    const operatorMult = shippedBoss.lastHitMultiplier * 2;
    expect(
      operatorMult,
      "探針倍率跟出貨值一樣,那寫死出貨值的實作照樣會過 —— 這條測試就白寫了",
    ).not.toBe(shippedBoss.lastHitMultiplier);

    expect(
      goldPoolLastHitBonus("boss.bountyGold", bossWith({ lastHitMultiplier: operatorMult })),
      "沒有讀操作者設的補刀倍率",
    ).toBe(operatorMult);

    const e = effectiveGold(
      "boss.bountyGold",
      String(shippedBoss.bountyGold),
      ENV,
      bossWith({ lastHitMultiplier: operatorMult }),
    )!;
    expect(e.paid, "下界不該被補刀倍率影響 —— 它是「沒人獨吃」那一端").toBe(
      Math.round(shippedBoss.bountyGold * PROBE),
    );
    expect(e.paidMax, "上界沒有跟著操作者調的倍率走,等於實作把倍率寫死了").toBe(
      Math.round(shippedBoss.bountyGold * operatorMult * PROBE),
    );
    expect(
      effectiveGoldText(e, LABEL),
      "畫面上印的上界還是出貨倍率算出來的那個數字",
    ).toContain(String(e.paidMax));
  });

  it("★ 切成「權重」（守恆）→ 變回單一數字", () => {
    cover("admin-mob-waves");
    const cfg = bossWith({ lastHitMode: "weight" });
    expect(goldPoolLastHitBonus("boss.bountyGold", cfg)).toBe(1);
    const e = effectiveGold("boss.bountyGold", String(cfg.boss!.bountyGold), ENV, cfg)!;
    expect(e.paidMax, "守恆模式還在印區間 —— 權重模式的總額是固定的").toBe(e.paid);
    expect(effectiveGoldText(e, LABEL)).not.toContain("–");
  });

  it("★ 補刀倍率 ≤ 1（加碼加了個 0）→ 也是單一數字", () => {
    cover("admin-mob-waves");
    const cfg = bossWith({ lastHitMode: "bonus", lastHitMultiplier: 1 });
    expect(goldPoolLastHitBonus("boss.bountyGold", cfg)).toBe(1);
    const e = effectiveGold("boss.bountyGold", String(cfg.boss!.bountyGold), ENV, cfg)!;
    expect(e.paidMax).toBe(e.paid);
  });

  it("★ 普通殭屍的每殺一隻不走獎池 → 永遠單一數字，就算獎池是加碼模式", () => {
    cover("admin-mob-waves");
    expect(goldPoolLastHitBonus("reward.gold", SHIPPED_MOB_WAVES)).toBe(1);
    const e = effectiveGold("reward.gold", "1000", ENV, SHIPPED_MOB_WAVES)!;
    expect(e.paidMax, "每殺一隻給金錢被當成獎池了").toBe(e.paid);
  });

  it("★ 發放倍率調回中性 1.0 → 區間照印（收起來就等於又說「實發就是獎池」）", () => {
    cover("admin-mob-waves");
    const neutral = { goldMobKill: 1, goldEliteKill: 1 };
    const shippedBoss = SHIPPED_MOB_WAVES.boss!;
    const e = effectiveGold(
      "boss.bountyGold",
      String(shippedBoss.bountyGold),
      neutral,
      SHIPPED_MOB_WAVES,
    );
    expect(e, "1.0 下把區間收起來了 —— 那一場實發仍然不等於獎池").not.toBeNull();
    expect(e!.paid).toBe(shippedBoss.bountyGold);
    expect(e!.paidMax).toBeGreaterThan(e!.paid);
    // 而普通殭屍在 1.0 下仍然不印（它真的沒有東西可說）。
    expect(effectiveGold("reward.gold", "1000", neutral, SHIPPED_MOB_WAVES)).toBeNull();
  });

  it("★ 特殊殭屍關掉「照傷害比例分」→ 全額給補刀的人、不加碼 → 單一數字", () => {
    cover("admin-mob-waves");
    // `splitByDamage` 關掉 = damager 表是空的 = `splitBossBounty` 的
    // 「沒有人造成可測量的傷害」分支，而那條分支兩種模式都不加碼。
    const cfg: MobWavesConfig = {
      ...SHIPPED_MOB_WAVES,
      special: {
        ...SHIPPED_MOB_WAVES.special!,
        lastHitMode: "bonus",
        lastHitMultiplier: 3,
        splitByDamage: false,
      },
    };
    expect(goldPoolLastHitBonus("special.bountyGold", cfg)).toBe(1);
    // 打開就會撐開 —— 否則上一行是被別的理由擋掉的（斷言方向與缺陷無關）。
    expect(
      goldPoolLastHitBonus("special.bountyGold", {
        ...cfg,
        special: { ...cfg.special!, splitByDamage: true },
      }),
    ).toBeGreaterThan(1);
  });
});

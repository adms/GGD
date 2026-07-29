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
  "mob.baseLevel",
  "mob.levelPerRound",
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
  // 從英雄推導 (GH#206) — 生命與能力屬性 = 該設定英雄的 N 倍, +M, 移速 ×K, 等級 99
  "boss.heroHpMult",
  "boss.heroDamageMult",
  "boss.hpFlatBonus",
  "boss.moveSpeedMult",
  "boss.heroLevel",
  // 等級來源:跟場上最高 / 指定 / 沿用回合 (#290)
  "boss.heroLevelSource",
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
  // 分紅獎池 (#288) — owner 2026-07-29 「特殊殭屍也照傷害比例分」
  "special.bountyGold",
  "special.bountyXp",
  "special.bountyLevels",
  "special.lastHitMultiplier",
  "special.lastHitMode",
  "special.splitByDamage",
  "special.countOverkill",
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
    // baseHp 20 + hpPerLevel 20 * (level-1); round 3 → level 3 → 20 + 40 = 60
    expect(hpForRound(SHIPPED_MOB_WAVES, 3)).toBe(60);
    expect(hpForRound(SHIPPED_MOB_WAVES, 6)).toBe(120);
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
      "mob.baseLevel": "5",
      "mob.levelPerRound": "2",
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
      "boss.modelKey": "champ.mob.king-double",
      "boss.bountyGold": "4200",
      "boss.bountyXp": "1600",
      "boss.lastHitMultiplier": "3",
  "boss.bountyLevels": "50",
  "boss.lastHitMode": "bonus",
  "boss.countOverkill": "0",
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
    };
    let form = formFromConfig(SHIPPED_MOB_WAVES);
    for (const [k, v] of Object.entries(edits)) form = setField(form, k as MobWavesFieldKey, v);
    const cfg = configFromForm(form) as unknown as Record<string, unknown>;
    const at = (key: MobWavesFieldKey): unknown => {
      const [head, tail] = key.split(".");
      if (tail === undefined) return cfg[head!];
      const block = cfg[head!] as Record<string, unknown> | undefined;
      return block?.[tail];
    };
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

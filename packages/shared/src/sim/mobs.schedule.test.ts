/**
 * mobs.schedule — the LATE-MATCH zombie escalation.
 *
 * owner, 2026-07-27:
 *   round  8 → 10 / 30
 *   round  9 → 20 / 60
 *   round 10 →  0 /  0  (乾淨總決賽 — no zombies at all)
 *
 * The trap this file exists for is the one #215's first speed test fell into:
 * asserting the CONFIG rather than the BEHAVIOUR. `"multiplier": 2` sitting in
 * arena-rules.json proves nothing — the mob card's own speed sat there correctly
 * for a whole session while MovementSystem read a general fallback instead, and
 * deleting the lookup left 1,182 tests green.
 *
 * So the load-bearing test here MEASURES: it runs real waves through a real
 * SimWorld and counts how many zombies are standing. A surge that is authored
 * but not wired reads as "still 15 alive" and this file goes red.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { DEFAULT_MOB_WAVES_CONFIG, type MobWavesConfig } from "../content/schema/config";
import { mobCapsForRound, mobRulesFromConfig, mobsAliveInZone } from "./mobs";
import { beginCombatMobs } from "./systems/MobSystem";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARENA_RULES = join(HERE, "../../../..", "content/config/arena-rules.json");

const TICKS_PER_SEC = 30;
const DT = 1 / TICKS_PER_SEC;

beforeAll(() => {
  registerSkeletonContent();
});

/** The SHIPPED mobWaves block — so the doc and this contract cannot drift. */
function shippedMobWaves(): MobWavesConfig {
  const doc = JSON.parse(readFileSync(ARENA_RULES, "utf8")) as { mobWaves: MobWavesConfig };
  return doc.mobWaves;
}

/**
 * Run a zone for `seconds` of combat at `round` and return how many mobs are
 * standing at the end. Waves are forced to land immediately and often, so the
 * run is long enough for the ALIVE cap to be the binding constraint rather than
 * the spawn schedule — which is the number the owner actually asked to double.
 */
function aliveAfter(cfg: MobWavesConfig, round: number, seconds: number): number {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatActive = true;
  const rules = mobRulesFromConfig({ ...cfg, firstWaveSec: DT, waveIntervalSec: DT }, DT, round);
  beginCombatMobs(w, rules, [0]);
  for (let i = 0; i < seconds * TICKS_PER_SEC; i++) w.step(new Map());
  return mobsAliveInZone(w, 0);
}

describe("the caps for a round", () => {
  it("follows the owner's table exactly", () => {
    cover("mob-schedule");
    const cfg = shippedMobWaves();
    expect(mobCapsForRound(cfg, 6)).toEqual({ mobsPerWaveCap: 10, maxAlivePerZone: 20 });
    expect(mobCapsForRound(cfg, 7)).toEqual({ mobsPerWaveCap: 15, maxAlivePerZone: 30 });
    expect(mobCapsForRound(cfg, 8)).toEqual({ mobsPerWaveCap: 20, maxAlivePerZone: 40 });
    expect(mobCapsForRound(cfg, 9)).toEqual({ mobsPerWaveCap: 25, maxAlivePerZone: 50 });
    expect(mobCapsForRound(cfg, 10)).toEqual({ mobsPerWaveCap: 0, maxAlivePerZone: 0 });
  });

  it("un-scheduled rounds keep the authored caps", () => {
    const cfg = shippedMobWaves();
    for (const r of [3, 4, 5, 11, 12]) {
      expect(mobCapsForRound(cfg, r)).toEqual({
        mobsPerWaveCap: cfg.mobsPerWaveCap,
        maxAlivePerZone: cfg.maxAlivePerZone,
      });
    }
  });

  it("ZERO survives the lookup — `||` would silently repopulate the grand final", () => {
    cover("mob-schedule");
    // The single most likely way to break 乾淨總決賽: read the row with `||`
    // instead of taking the field, and `0 || 15` puts fifteen zombies back into
    // the round the owner asked to empty.
    const caps = mobCapsForRound(shippedMobWaves(), 10);
    expect(caps.mobsPerWaveCap).toBe(0);
    expect(caps.maxAlivePerZone).toBe(0);
  });

  it("no schedule, or round 0, reads as the authored caps", () => {
    const cfg = shippedMobWaves();
    expect(mobCapsForRound({ ...cfg, schedule: undefined }, 9).maxAlivePerZone).toBe(
      cfg.maxAlivePerZone,
    );
    // round 0 is the 「no round tracking」 sentinel (unit tests, prediction shadow)
    expect(mobCapsForRound(cfg, 0).maxAlivePerZone).toBe(cfg.maxAlivePerZone);
  });
});

describe("the rules the sim actually receives", () => {
  it("carries the scheduled caps, round by round", () => {
    cover("mob-schedule");
    const cfg = shippedMobWaves();
    expect(mobRulesFromConfig(cfg, DT, 5).maxAlivePerZone).toBe(cfg.maxAlivePerZone);
    expect(mobRulesFromConfig(cfg, DT, 7).maxAlivePerZone).toBe(30);
    expect(mobRulesFromConfig(cfg, DT, 8).maxAlivePerZone).toBe(40);
    expect(mobRulesFromConfig(cfg, DT, 9).maxAlivePerZone).toBe(50);
    expect(mobRulesFromConfig(cfg, DT, 10).maxAlivePerZone).toBe(0);
  });
});

describe("the battlefield really fills up — and really empties (the wiring guard)", () => {
  it("5 < 7 < 9 in bodies standing, not just in numbers on a config", () => {
    // THE test. Everything above reads numbers off an object; this one counts
    // zombies in a real world. Stop threading the schedule into
    // mobRulesFromConfig and all three runs converge — which is the 「authored
    // but not wired」 failure the #215 speed test was rewritten to catch.
    cover("mob-schedule");
    const cfg = shippedMobWaves();
    const r5 = aliveAfter(cfg, 5, 40);
    const r7 = aliveAfter(cfg, 7, 40);
    const r9 = aliveAfter(cfg, 9, 40);
    expect(r5).toBeGreaterThan(0);
    expect(r7).toBeGreaterThan(r5);
    expect(r9).toBeGreaterThan(r7);
    // real steps, not merely "more" — a +1 each would also satisfy `>`
    expect(r7).toBeGreaterThanOrEqual(Math.floor(r5 * 1.8));
    expect(r9).toBeGreaterThanOrEqual(Math.floor(r7 * 1.5));
  });

  it("round 10 spawns NOTHING — 乾淨總決賽", () => {
    // The owner's grand final is champions only. Not 「fewer」: none.
    cover("mob-schedule");
    expect(aliveAfter(shippedMobWaves(), 10, 40)).toBe(0);
  });

  it("round 5 is still capped where it was authored", () => {
    // The opposite failure: a schedule that leaked into every round would make
    // the whole match the finale.
    const cfg = shippedMobWaves();
    expect(aliveAfter(cfg, 5, 40)).toBeLessThanOrEqual(cfg.maxAlivePerZone);
  });
});

describe("the shipped numbers are the owner's", () => {
  it("the table is exactly what was asked for", () => {
    expect(shippedMobWaves().schedule).toEqual([
      { round: 6, mobsPerWaveCap: 10, maxAlivePerZone: 20 },
      { round: 7, mobsPerWaveCap: 15, maxAlivePerZone: 30 },
      { round: 8, mobsPerWaveCap: 20, maxAlivePerZone: 40 },
      { round: 9, mobsPerWaveCap: 25, maxAlivePerZone: 50 },
      { round: 10, mobsPerWaveCap: 0, maxAlivePerZone: 0 },
    ]);
  });

  it("the shipped doc and the contract default agree", () => {
    // DEFAULT_MOB_WAVES_CONFIG is what dev cheats and fallbacks use; a doc-only
    // change would make a local match behave differently from a real one.
    expect(DEFAULT_MOB_WAVES_CONFIG.schedule).toEqual(shippedMobWaves().schedule);
  });

  it("a mob kill levels you up IMMEDIATELY, in the killing tick", () => {
    // owner, 2026-07-27: 「等級提升在戰鬥中是即時的」. It already was — MobSystem
    // calls grantLevels inline on the death event, and grantXp sets `sc.dirty`
    // and emits `levelUp` in that same tick, so the stat pipeline recomputes
    // before the next one. Pinned here so it cannot quietly become deferred.
    const src = readFileSync(join(HERE, "systems/MobSystem.ts"), "utf8");
    expect(src).toMatch(/grantLevels\(world, killer, 1\)/);
    const prog = readFileSync(join(HERE, "economy/progression.ts"), "utf8");
    expect(prog).toMatch(/sc\.dirty = true/);
    expect(prog).toMatch(/world\.emit\("levelUp"/);
  });

  // ⛔⛔ 這裡本來是 `it("killsPerLevel is 6")` —— 一條**把出貨值抄進測試**的斷言。
  //
  // ⭐ CLAUDE.md 第二守則逐字：出貨數字已經有三個住處（`content/config/` ＋
  // Zod `DEFAULT_*` ＋ admin `SHIPPED_*`），而它們之間有 drift 測試在守
  // ⇒ ⛔ 測試裡再抄一份就是**第四個住處，而它沒有守衛** ⇒ 它一定會過期，
  //   而且**用錯誤的訊息紅**（「排程壞了」而真相只是數值被調過）。
  //
  // ⭐ 2026-09-02（GH#918）owner 把它改成 0（關閉），這一條當場紅 —— 而它紅的
  // 訊息與「排程」毫無關係。⇒ 刪掉，⛔ 不是把 6 改成 0。
  //
  // ⭐ 真正該被守的是**機制**：`MobSystem.ts` 的 `killsPerLevel > 0` 那道閘
  // （0 ⇒ 一次都不發等級）—— 那一條在 `mobKillLevelOff.test.ts`。
});

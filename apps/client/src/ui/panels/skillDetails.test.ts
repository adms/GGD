/**
 * The prep window's 技能詳情 selector. Drives it against the REAL skeleton
 * content (`sela` / `thorne`) rather than a fixture, so a change to the shared
 * registries or to the ability-text helpers is caught here rather than on
 * screen. The requirement is "full description, cooldown, cost, per slot, incl.
 * passive + EX" — each clause is a case below.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { TICK_HZ } from "@ggd/shared/constants";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { skillRows, slotLabel, type SkillDetailSeat } from "./skillDetails";

beforeAll(() => registerSkeletonContent());

const seatOf = (over: Partial<SkillDetailSeat> = {}): SkillDetailSeat => ({
  championId: "sela",
  abilityRanks: [1, 0, 0, 0],
  cooldowns: [0, 0, 0, 0],
  exAbilityId: "",
  exRank: 0,
  exCooldown: 0,
  ...over,
});

describe("skill detail rows", () => {
  it("lists every castable slot in reading order", () => {
    cover("shop-skill-details");
    const rows = skillRows(seatOf());
    const core = rows.filter((r) => r.slot !== "PASSIVE" && r.slot !== "EX").map((r) => r.slot);
    expect(core).toEqual(["Q", "W", "E", "R"]);
    // the passive, when the champion has one, comes FIRST (it is always on)
    if (rows.some((r) => r.slot === "PASSIVE")) expect(rows[0]!.slot).toBe("PASSIVE");
  });

  it("carries cooldown, cost and cast type for each slot", () => {
    cover("shop-skill-details");
    const rows = skillRows(seatOf());
    const q = rows.find((r) => r.slot === "Q")!;
    const def = Champions.get("sela" as ChampionId);
    expect(q.cooldownSec).toBe(def.abilities.Q.cooldown[0]);
    expect(q.castLabel).toBeTruthy();
    // a costed ability reports its cost; a free one omits it rather than "0"
    const mana = def.abilities.Q.manaCost[0] ?? 0;
    if (mana > 0) expect(q.manaCost).toBe(mana);
    else expect(q.manaCost).toBeUndefined();
  });

  it("carries the BASE cast range / AoE radius for the view to scale (task #136)", () => {
    cover("shop-skill-details");
    const rows = skillRows(seatOf());
    const q = rows.find((r) => r.slot === "Q")!;
    const def = Champions.get("sela" as ChampionId);
    // the row holds the AUTHORED base — the combat-env `abilityRange` factor is
    // applied at display time (ProfileBlock via displayFinal), exactly as for the
    // cooldown — so a number here can never disagree with the sim's read seam.
    if (def.abilities.Q.range > 0) expect(q.range).toBe(def.abilities.Q.range);
    if (def.abilities.Q.radius !== undefined && def.abilities.Q.radius > 0)
      expect(q.radius).toBe(def.abilities.Q.radius);
  });

  it("shows RANK-1 numbers for an unlearned skill so it can be compared first", () => {
    cover("shop-skill-details");
    const rows = skillRows(seatOf({ abilityRanks: [0, 0, 0, 0] }));
    const w = rows.find((r) => r.slot === "W")!;
    expect(w.learned).toBe(false);
    expect(w.rank).toBe(0);
    // the panel can still print a cooldown — that is the point of browsing
    expect(w.cooldownSec).toBe(Champions.get("sela" as ChampionId).abilities.W.cooldown[0]);
  });

  it("scales the numbers with the CURRENT rank once learned", () => {
    cover("shop-skill-details");
    const def = Champions.get("sela" as ChampionId);
    if (def.abilities.Q.cooldown.length < 2) return; // single-rank kit — nothing to prove
    const r1 = skillRows(seatOf({ abilityRanks: [1, 0, 0, 0] })).find((r) => r.slot === "Q")!;
    const r2 = skillRows(seatOf({ abilityRanks: [2, 0, 0, 0] })).find((r) => r.slot === "Q")!;
    expect(r1.cooldownSec).toBe(def.abilities.Q.cooldown[0]);
    expect(r2.cooldownSec).toBe(def.abilities.Q.cooldown[1]);
  });

  it("reports live remaining cooldown in seconds, not ticks", () => {
    cover("shop-skill-details");
    const rows = skillRows(seatOf({ cooldowns: [3 * TICK_HZ, 0, 0, 0] }));
    expect(rows.find((r) => r.slot === "Q")!.cooldownLeftSec).toBeCloseTo(3, 6);
  });

  it("strips the 「NN-0X 」hero-number prefix but keeps the raw name available", () => {
    cover("shop-skill-details");
    // the shared stripAbilityNumber rule (task #11) — same helper the bar uses
    const rows = skillRows(seatOf());
    for (const r of rows) {
      expect(r.name).not.toMatch(/^\d{1,3}-\d{2,3}\s/);
      expect(r.rawName.length).toBeGreaterThanOrEqual(r.name.length);
    }
  });

  it("hides EX until it exists AND has unlocked, then shows it as a single rank", () => {
    cover("shop-skill-details");
    // no EX at all
    expect(skillRows(seatOf()).some((r) => r.slot === "EX")).toBe(false);
    // has one, still locked (exRank 0)
    const locked = seatOf({ exAbilityId: "sela.q", exRank: 0 });
    expect(skillRows(locked).some((r) => r.slot === "EX")).toBe(false);
    // unlocked
    const unlocked = seatOf({ exAbilityId: "sela.q", exRank: 1, exCooldown: 0 });
    const ex = skillRows(unlocked).find((r) => r.slot === "EX");
    expect(ex).toBeDefined();
    expect(ex!.rank).toBe(1);
    expect(ex!.maxRank).toBe(1); // EX is unlocked, never ranked
    expect(ex!.learned).toBe(true);
  });

  it("returns nothing at all before a champion is picked", () => {
    cover("shop-skill-details");
    expect(skillRows(seatOf({ championId: "" }))).toEqual([]);
    expect(skillRows(seatOf({ championId: "no-such-hero" }))).toEqual([]);
  });

  it("labels the non-hotkey rows in Chinese", () => {
    cover("shop-skill-details");
    // 天生, NOT 被動: ~57 of the recovered NN-00 innates are ACTIVE abilities, so
    // the slot name states when it is owned (level 1), and the row's `innateKind`
    // carries 被動 vs 主動.
    expect(slotLabel("PASSIVE")).toBe("天生");
    expect(slotLabel("EX")).toBe("EX");
    expect(slotLabel("Q")).toBe("Q");
  });
});

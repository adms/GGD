/**
 * fireRingArm.test.ts — the MatchController actually ARMS and RUNS the
 * round-pacing fire ring, on top of the sim-primitive coverage in
 * packages/shared/.../fireRing.test.ts.
 *
 * THE ARM TIME MOVED, DELIBERATELY. #132 was raised as BUG B —
 * 「進行到三分鐘應該要開始有火圈燒人」 — and this file locked 180 s / 5400 ticks
 * to prove it. Task #195 is a LATER owner directive that supersedes it:
 *
 *   「火圈出現時間變成 戰鬥開始 60秒 … 圈圈會花 20秒時間縮到最小沒有生存空間」
 *
 * so the ring now ignites at 60 s (1800 ticks) and closes over 20 s. The old
 * requirement is not being quietly overwritten: it is restated here, with its
 * replacement, so a reader who remembers 「三分鐘」 finds out what happened to it.
 *
 * Verifies:
 *   1. arm TIME — with the SHIPPED config.match@1 fireRing block, entering
 *      combat arms the ring at 60 s combat-elapsed (1800 ticks @30Hz) with a
 *      600-tick shrink.
 *   2. ignite + BURN + SETTLE — with combat damage neutralised so the ONLY
 *      lethal force is the ring, a live round ignites, burns the champions the
 *      contracting ring has left outside it, and SETTLES (a side dies) strictly
 *      before the hard combat backstop — the intended finisher.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../../../packages/shared/testkit/cover";
import { normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import type { FireRingConfig } from "@ggd/shared/content";
import { MatchController, type SeatSpec } from "./MatchController";

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** The shipped config.match@1 fireRing block (single source of truth for round length). */
function shippedFireRing(): FireRingConfig {
  const doc = JSON.parse(
    readFileSync(join(__dirname, "../../../../content/config/config.match.json"), "utf8"),
  ) as { match: { fireRing: FireRingConfig; combatMaxSec: number } };
  return doc.match.fireRing;
}

describe("fire ring is armed + timed by the MatchController (firering-arm, BUG B)", () => {
  it("the SHIPPED config arms the ring at 60s combat-elapsed on combat entry", () => {
    cover("firering-config");
    const fr = shippedFireRing();
    expect(fr.startSec).toBe(60); // #195 owner directive (was 180 under #132)
    expect(fr.shrinkSec).toBe(20);
    // 二段制 (owner 2026-08-02): the host must hand the SECOND stage through
    // too — it is the same `match.fireRing` object, so a knob the operator can
    // turn with no effect here would be failure mode ②.
    expect(fr.stage2StartSec).toBe(90);
    expect(fr.stage2ShrinkSec).toBe(20);

    const cfg = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 100 * 30, resolutionTicks: 3 };
    const ctl = new MatchController(
      "arm",
      1234,
      allBots(),
      cfg,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      fr,
    );
    while (ctl.phase.phase !== "combat") ctl.tick();

    // beginCombatFireRing armed it, combat-elapsed clock started, live-combat gate open
    expect(ctl.world.combatActive).toBe(true);
    expect(ctl.world.fireRingRules).not.toBeNull();
    // 60s × 30Hz = 1800 ticks (dt = 1/30) — 「戰鬥開始 60秒」.
    expect(ctl.world.fireRingRules!.startTicks).toBe(Math.round(60 / ctl.world.dt));
    expect(ctl.world.fireRingRules!.startTicks).toBe(1800);
    // …and 20 s × 30Hz = 600 ticks for 第一段 — 「第一段燒 20 秒就停止縮圈」.
    expect(ctl.world.fireRingRules!.shrinkTicks).toBe(600);
    // 二段制 arrived at the sim intact: a 30 s gap to 第二段 (90 − 60) and
    // another 600 ticks to 全地圖淹沒 at radius 0.
    expect(ctl.world.fireRingRules!.stage1Radius).toBe(4);
    expect(ctl.world.fireRingRules!.stage2GapTicks).toBe(900);
    expect(ctl.world.fireRingRules!.stage2ShrinkTicks).toBe(600);
    expect(ctl.world.fireRingRules!.minRadius).toBe(0);
    expect(ctl.world.fireRingTicks).toBe(0);
  });

  it("ignites, burns living champions with an ESCALATING rate, and SETTLES the round before the backstop", () => {
    cover("firering-kills");
    // Short start + short shrink so the test is fast, but the same
    // arm→ignite→shrink→burn→settle path the shipped 60/20 config runs.
    const fireRing: FireRingConfig = {
      startSec: 2,
      shrinkSec: 3,
      minRadius: 0.5,
      // 10 %/s 起燃 → 3 秒收完時 50 %/s → 之後續爬到 100 %/s。x 軸是「點燃後
      // 秒數」，所以最後一列不是收圈終點而是更晚的時間。
      burnCurve: [
        { sec: 0, pctPerSec: 0.1 },
        { sec: 3, pctPerSec: 0.5 },
        { sec: 6, pctPerSec: 1 },
      ],
      maxPctPerSec: 1,
      // GH#287 出貨預設：火圈無視免死（＝這一格出現之前的行為）。
      lethalSaveApplies: false,
      // 殭屍王回合延長 (#L1)。`config.match@1` 的 fireRing.boss 帶 `.default()`,
      // 所以 Zod 的 OUTPUT 型別上它是必填 —— 這個 fixture 少了它就不是
      // FireRingConfig。值就是出貨預設 (content/config/config.match.json)。
  // #248 —— 回合硬上限，鏡射出貨的 300 秒（不是隨手挑的：這個 fixture 的用途就是
  // 「出貨長什麼樣」，挑一個別的數字會讓它變成測一份不存在的設定）。
  roundHardCapSec: 300,
  boss: { extendCombatSec: 180, delayFireRingSec: 180 },
    };
    // Neutralise combat damage: the ONLY thing that can end this round is the ring,
    // so a settle proves the ring (not a normal wipe / the timer) finished it.
    const env = normalizeCombatEnv({ damageDealt: 0 });
    const cfg = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 100000, resolutionTicks: 3 };
    const ctl = new MatchController(
      "burn",
      4242,
      allBots(),
      cfg,
      undefined,
      undefined,
      undefined,
      undefined,
      env,
      fireRing,
    );
    while (ctl.phase.phase !== "combat") ctl.tick();
    const combatEnterTick = ctl.world.tick;

    const champIds = [...ctl.seats.values()].filter((s) => s.entityId !== null).map((s) => s.entityId!);
    const aliveCount = (): number => champIds.filter((id) => ctl.world.health.get(id)?.alive).length;
    const aliveAtStart = aliveCount();
    expect(aliveAtStart).toBeGreaterThanOrEqual(2); // at least two survivors to burn

    let ignited = false;
    const positiveRates: number[] = [];
    let ringDamageTotal = 0;
    let guard = 0;
    while (ctl.phase.phase === "combat" && guard++ < 100000) {
      ctl.tick();
      for (const ev of ctl.world.events) {
        if (ev.type === "fireRingStart") ignited = true;
        if (ev.type === "fireRingTick") {
          const r = ev.data.ratePerSec as number;
          if (r > 0) positiveRates.push(r);
        }
        if (ev.type === "fireRingDamage") ringDamageTotal += ev.data.amount as number;
      }
    }

    // the ring closed in and dealt real damage
    expect(ignited).toBe(true);
    expect(ringDamageTotal).toBeGreaterThan(0);
    // escalation: the per-second rate climbs with the SHRINK (10%/s → 50%/s)
    expect(positiveRates.length).toBeGreaterThan(2);
    expect(positiveRates[positiveRates.length - 1]!).toBeGreaterThan(positiveRates[0]!);
    // the round SETTLED because a side died to the ring — and did so far short of
    // the hard combat backstop (proof the RING was the finisher, not the timer).
    expect(ctl.phase.phase).not.toBe("combat");
    expect(aliveCount()).toBeLessThan(aliveAtStart); // champions actually burned to death
    const combatDurationTicks = ctl.world.tick - combatEnterTick;
    expect(combatDurationTicks).toBeLessThan(cfg.combatMaxTicks);
    // disarmed on round exit (concludeCombat → endCombatFireRing)
    expect(ctl.world.fireRingRules).toBeNull();
  });
});

/**
 * bossRoundExtensionHost.test.ts — #L2: the HOST half of 「殭屍王出現回合結束時間
 * 延長 3 分鐘(火圈時間也延後),除非全死不然不會提前結束」 (owner 2026-07-30).
 *
 * THE SIM HALF ALREADY EXISTED AND DID NOTHING. `packages/shared/src/sim/
 * fireRing.ts` has carried `extendRoundForBoss` / `combatDeadlineTick` /
 * `isCombatTimeUp` and a passing unit suite (`sim/bossRoundExtension.test.ts`)
 * while PRODUCTION had zero consumers: `MatchController` armed the ring with
 * `fireRingRulesFromConfig(ring, dt)` — TWO arguments — so `combatMaxTicks` came
 * out `Infinity`, `extendRoundForBoss` hit its own half-state gate and returned
 * 0, and the thing that actually force-ended combat was `PhaseMachine.ticksLeft`,
 * which nothing in the sim can move. Textbook 失敗形態 ②:「算出來了但從沒送到」.
 *
 * So every assertion here is written to go RED if the host wiring is removed
 * again, and NOT to merely re-observe the sim primitives:
 *
 *   · the deadline is read through `combatDeadlineTick(world)` — the value in
 *     force — never off `config.match@1` (失敗形態 ⑦: 掃屬性代替掃行為);
 *   · the headline guard counts the TICKS COMBAT ACTUALLY RAN FOR and requires
 *     the king to add exactly `extendCombatSec` of them, i.e. it reads the real
 *     phase transition;
 *   · the countdown is read back through `projectSnapshot` — the only channel a
 *     player learns the round clock by.
 *
 * ⚠️ SPEC CHANGE, owner 2026-08-02: 「已經只剩我方英雄 敵方英雄全死 並且**場上沒有
 * 殭屍王** 回合應該要馬上勝利結算才對」. 2026-07-30's rule (「場上還有**任何**殭屍就
 * 不結束」) is now the `any` setting of a BACKSTAGE FIELD, `mobWaves.roundHoldMobKinds`
 * (sim/mobs.ts `ROUND_HOLD_KINDS`), whose shipped value holds for kings only. So the
 * hold tests below are written as ONE mechanism in two groups — 普通殭屍 vs 殭屍王 —
 * and every expectation is DERIVED from the setting in force on `world.mobRules`,
 * never from a literal: flip the dropdown and these follow it instead of lying.
 *
 * MUTATION LOG — every one applied by hand, red confirmed, reverted:
 *   1. `fireRingRulesFromConfig(ring, dt, …)` → drop the 3rd argument
 *      ⇒ 3 red: "延長 5400 ticks", "runs the extra ticks", "wire countdown".
 *   2. `checkCombatEnd`: delete the `roundHoldMobKinds` hold line
 *      ⇒ 3 red: the king no longer holds, the pending winner is never built,
 *         and the halted zone settles instead of staying open.
 *   2b. `checkCombatEnd`: widen the hold to `ROUND_HOLD_KINDS.any`
 *      ⇒ 1 red: 普通殭屍 group — the round the owner asked to settle at once
 *         goes back to waiting for the field to clear.
 *   2c. `checkCombatEnd`: drop the `spawnHaltedZones.add` line
 *      ⇒ 1 red: waves keep arriving in the wiped zone while the king holds it.
 *   3. `checkCombatEnd`: move the mob hold ABOVE the 玩家全滅 branch
 *      ⇒ 2 red: the round stays open with every champion dead.
 *   4. `checkCombatEnd`: drop the `pending ??` in the 玩家全滅 branch
 *      ⇒ 1 red: the won round goes to a coin.
 *   5. `combatTimeUp`: delete the `this.phase.ticksLeft += …` credit
 *      ⇒ 2 red: combat stops at the un-extended deadline, HUD never grows.
 *   6a. `combatTimeUp`: `phaseExpired || isCombatTimeUp(w)` → `isCombatTimeUp(w)`
 *   6b. `combatTimeUp`: overwrite the countdown with `deadline - fireRingTicks`
 *       instead of crediting it (the tidier version this file caught during
 *       development)  ⇒ both 1 red: the #46 frozen-sim guard.
 *   7. `checkRoyaleEnd`: delete the `anyMobsAlive` hold  ⇒ 1 red (finale).
 *   8. `checkRoyaleEnd`: drop the `pending ??`           ⇒ 1 red (finale).
 *   9. `enterCombat`: drop `appliedBossExtensionTicks = 0`
 *      ⇒ 1 red: the SECOND king of a match extends nothing.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { TICK_HZ } from "@ggd/shared/constants";
import { MatchState } from "@ggd/shared/protocol/schema";
import { normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import {
  bossRoundExtensionTicks,
  combatDeadlineTick,
  fireRingIgnitionTick,
  DEFAULT_BURN_CURVE,
} from "@ggd/shared/sim/fireRing";
import {
  anyMobsAlive,
  anyMobsAliveOfKinds,
  mobsAliveInZone,
  summonMobBoss,
  ROUND_HOLD_KINDS,
  DEFAULT_ROUND_HOLD_KINDS,
} from "@ggd/shared/sim/mobs";
import { DEFAULT_MOB_WAVES_CONFIG, type FireRingConfig, type MobWavesConfig } from "@ggd/shared/content";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { FINAL_ROUND } from "./PairedDuels";
import { projectSnapshot } from "../net/snapshot";

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** Nothing may die of ordinary combat in these tests — only the clock decides. */
const NO_DAMAGE = normalizeCombatEnv({ damageDealt: 0 });

/**
 * The SHIPPED ring shape (values as in content/config/config.match.json), used
 * for the 5400-tick guard so the number under test is the operator's own.
 */
const SHIPPED_RING: FireRingConfig = {
  startSec: 60,
  shrinkSec: 20,
  minRadius: 0.5,
  burnCurve: [...DEFAULT_BURN_CURVE], // 出貨曲線的唯一字面值住在 sim/fireRing.ts
  maxPctPerSec: 1,
  // GH#287 出貨預設：火圈無視免死（＝這一格出現之前的行為）。
  lethalSaveApplies: false,
  // #248 —— 回合硬上限，鏡射出貨的 300 秒（不是隨手挑的：這個 fixture 的用途就是
  // 「出貨長什麼樣」，挑一個別的數字會讓它變成測一份不存在的設定）。
  roundHardCapSec: 300,
  boss: { extendCombatSec: 180, delayFireRingSec: 180 },
};

/** Mob waves that arm on round 1 and drop ONE wave, so a test can control the field. */
const ONE_WAVE: MobWavesConfig = {
  ...DEFAULT_MOB_WAVES_CONFIG,
  fromRound: 1,
  firstWaveSec: 0.2,
  waveIntervalSec: 9999,
};

/** Same, but the waves KEEP coming — so 「還在不在生」 is observable in a few dozen ticks. */
const REPEAT_WAVES: MobWavesConfig = { ...ONE_WAVE, waveIntervalSec: 0.2 };

const rulesWithMobs = (): ArenaRules => ({ ...DEFAULT_ARENA_RULES, mobWaves: ONE_WAVE });

function toCombat(ctl: MatchController, guard = 5000): MatchController {
  let n = 0;
  while (ctl.phase.phase !== "combat" && n++ < guard) ctl.tick();
  expect(ctl.phase.phase).toBe("combat");
  return ctl;
}

/** Kill every LIVING champion of `teamId` standing in `zone` (same helper as roundEnd.test). */
function wipeSideInZone(ctl: MatchController, teamId: number, zone: number): void {
  for (const seat of ctl.seats.values()) {
    if (seat.teamId !== teamId || seat.entityId === null) continue;
    const t = ctl.world.transform.get(seat.entityId);
    const hp = ctl.world.health.get(seat.entityId);
    if (t?.zone === zone && hp) {
      hp.alive = false;
      hp.hp = 0;
    }
  }
}

/** Clear the field: every mob everywhere reads dead to `isMobAlive`. */
function killAllMobs(ctl: MatchController): void {
  for (const id of ctl.world.mob.keys()) {
    const hp = ctl.world.health.get(id);
    if (hp) {
      hp.alive = false;
      hp.hp = 0;
    }
  }
}

// ===========================================================================
// 1 — the deadline the host hands the sim
// ===========================================================================
describe("the host arms the ring WITH a backstop, so a 殭屍王 can move it (#L2)", () => {
  it("summoning a king pushes the ACTIVE combat deadline out by 5400 ticks (180 s)", () => {
    cover("boss-round-extension-host");
    const cfg = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 100 * TICK_HZ, resolutionTicks: 3 };
    const ctl = new MatchController(
      "l2-deadline",
      1234,
      allBots(),
      cfg,
      undefined,
      rulesWithMobs(),
      undefined,
      undefined,
      NO_DAMAGE,
      SHIPPED_RING,
    );
    toCombat(ctl);

    // BEFORE: the deadline is FINITE and equals the authored combatMaxSec. This
    // single assertion is what the two-argument arm made impossible — it read
    // `Infinity`, which is why the sim's extension refused to apply at all.
    expect(combatDeadlineTick(ctl.world)).toBe(100 * TICK_HZ);
    expect(bossRoundExtensionTicks(ctl.world)).toBe(0);
    const ignitionBefore = fireRingIgnitionTick(ctl.world);
    expect(ignitionBefore).toBe(60 * TICK_HZ);

    // …now the king walks in, through the SHIPPED entry point (`summonMobBoss`
    // is the one function a 殭屍王 enters the world by — MobSystem calls exactly
    // this when a champion's tally crosses `boss.killThreshold`).
    const zone = ctl.pairings[0]!.zone;
    const summoner = [...ctl.seats.values()].find((s) => s.entityId !== null)!.entityId!;
    expect(ctl.world.mobRules).not.toBeNull();
    const king = summonMobBoss(ctl.world, zone, ctl.world.mobRules!, summoner, 100);
    expect(king).not.toBeNull();

    // AFTER: 「回合結束時間延長 3 分鐘」 AND 「火圈時間也延後」 — both halves, off
    // the live rules rather than off the config doc.
    expect(combatDeadlineTick(ctl.world)).toBe(100 * TICK_HZ + 180 * TICK_HZ);
    expect(bossRoundExtensionTicks(ctl.world)).toBe(180 * TICK_HZ);
    expect(180 * TICK_HZ).toBe(5400);
    expect(fireRingIgnitionTick(ctl.world)).toBe(ignitionBefore + 180 * TICK_HZ);
  });

  it("combat ACTUALLY RUNS the extra ticks — measured on the phase transition, not the config", () => {
    cover("boss-round-extension-host");
    // A miniature of the shipped shape: the ring is authored so far out that it
    // never ignites inside the test (no burn, no deaths), damage is zeroed, and
    // no mobs are on the field — so the ONLY thing that can end this round is
    // the clock. That is what makes the tick COUNT a measurement of the deadline.
    const EXTEND_SEC = 2;
    const ring: FireRingConfig = {
      ...SHIPPED_RING,
      startSec: 100,
      shrinkSec: 1,
      boss: { extendCombatSec: EXTEND_SEC, delayFireRingSec: EXTEND_SEC },
    };
    const cfg = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 60, resolutionTicks: 3 };

    /** Ticks spent in the combat phase; `summon` decides whether a king shows up. */
    const combatTicks = (summon: boolean): number => {
      const ctl = new MatchController(
        `l2-run-${summon}`,
        4242,
        allBots(),
        cfg,
        undefined,
        rulesWithMobs(),
        undefined,
        undefined,
        NO_DAMAGE,
        ring,
      );
      toCombat(ctl);
      if (summon) {
        const seat = [...ctl.seats.values()].find((s) => s.entityId !== null)!;
        summonMobBoss(ctl.world, ctl.pairings[0]!.zone, ctl.world.mobRules!, seat.entityId!, 100);
      }
      let n = 0;
      while (ctl.phase.phase === "combat" && n < 10_000) {
        ctl.tick();
        n++;
      }
      expect(ctl.phase.phase, "combat never ended").not.toBe("combat");
      return n;
    };

    const plain = combatTicks(false);
    const withKing = combatTicks(true);
    expect(plain).toBe(cfg.combatMaxTicks); // the authored backstop, unchanged
    // THE GUARD: exactly `extendCombatSec` more seconds of live combat. With the
    // two-argument arm the sim deadline is Infinity, the phase countdown decides,
    // and this comes back equal to `plain`.
    expect(withKing).toBe(plain + EXTEND_SEC * TICK_HZ);
  });

  it("a king in round 2 extends round 2 — the credit is per-ROUND, not per-match", () => {
    cover("boss-round-extension-host");
    // `bossRoundExtensionTicks` is read off the round's OWN armed rules, so it
    // returns to 0 at every combat entry. If the host's memo of 「已經給過多少」
    // did not reset with it, the second round's king would compare 5400 > 5400,
    // credit nothing, and `phaseExpired` would then end a round the sim deadline
    // says is still running — i.e. the extension silently stops working after
    // the first king of the match.
    const EXTEND_SEC = 2;
    const ring: FireRingConfig = {
      ...SHIPPED_RING,
      startSec: 100,
      shrinkSec: 1,
      boss: { extendCombatSec: EXTEND_SEC, delayFireRingSec: EXTEND_SEC },
    };
    const cfg = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 60, resolutionTicks: 3 };
    const ctl = new MatchController(
      "l2-two-rounds",
      2468,
      allBots(),
      cfg,
      undefined,
      rulesWithMobs(),
      undefined,
      undefined,
      NO_DAMAGE,
      ring,
    );

    const lengths: number[] = [];
    for (let round = 1; round <= 2; round++) {
      let g = 0;
      while (!(ctl.phase.phase === "combat" && ctl.phase.round === round) && g++ < 10_000) ctl.tick();
      expect(ctl.phase.round).toBe(round);
      const seat = [...ctl.seats.values()].find((s) => s.entityId !== null)!;
      summonMobBoss(ctl.world, ctl.pairings[0]!.zone, ctl.world.mobRules!, seat.entityId!, 100);
      let n = 0;
      while (ctl.phase.phase === "combat" && n < 10_000) {
        ctl.tick();
        n++;
      }
      lengths.push(n);
    }
    expect(lengths).toEqual([
      cfg.combatMaxTicks + EXTEND_SEC * TICK_HZ,
      cfg.combatMaxTicks + EXTEND_SEC * TICK_HZ,
    ]);
  });

  it("the extension reaches the CLIENT: phaseTicksLeft on the wire grows with it", () => {
    cover("boss-round-extension-host");
    // 失敗形態 ②. `state.phaseTicksLeft` is the round countdown the HUD draws.
    // Left on `PhaseMachine.ticksLeft`'s own decrement it would read 0:00 for
    // three minutes while combat visibly continued.
    const cfg = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 100 * TICK_HZ, resolutionTicks: 3 };
    const ctl = new MatchController(
      "l2-wire",
      99,
      allBots(),
      cfg,
      undefined,
      rulesWithMobs(),
      undefined,
      undefined,
      NO_DAMAGE,
      SHIPPED_RING,
    );
    toCombat(ctl);
    ctl.tick();
    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    const before = state.phaseTicksLeft;
    expect(before).toBeLessThanOrEqual(100 * TICK_HZ);

    const seat = [...ctl.seats.values()].find((s) => s.entityId !== null)!;
    summonMobBoss(ctl.world, ctl.pairings[0]!.zone, ctl.world.mobRules!, seat.entityId!, 100);
    ctl.tick();
    projectSnapshot(ctl, state, new Map());
    // one tick elapsed, 5400 added ⇒ the countdown JUMPS UP by 5399.
    expect(state.phaseTicksLeft).toBe(before + 180 * TICK_HZ - 1);
    expect(state.phaseTicksLeft).toBeGreaterThan(cfg.combatMaxTicks);
  });

  it("#46 still holds WITH a ring armed: a persistently throwing sim cannot freeze the round", () => {
    cover("boss-round-extension-host");
    // THE TRAP THIS PINS. `world.fireRingTicks` only advances inside `stepSim`,
    // which `tick()` CONTAINS on purpose. Make the combat deadline the sim's
    // clock and nothing else, and a sim that throws every tick stops that
    // counter — the countdown pins itself to a constant and `isCombatTimeUp`
    // never fires, which is task #46 all over again but only on rooms that have
    // a fire ring configured (i.e. every real one). `tickResilience.test.ts`
    // cannot catch it: every controller it builds is ringless.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const cfg = { champSelectTicks: 3, intermissionTicks: 5, combatMaxTicks: 200, resolutionTicks: 5 };
      const ctl = new MatchController(
        "l2-fault",
        77,
        allBots(),
        cfg,
        undefined,
        rulesWithMobs(),
        undefined,
        undefined,
        NO_DAMAGE,
        SHIPPED_RING,
      );
      toCombat(ctl);
      expect(ctl.world.fireRingRules).not.toBeNull(); // the ring really is armed
      (ctl.world as unknown as { step: (i: unknown) => void }).step = () => {
        throw new Error("injected persistent sim fault");
      };

      // the countdown must STRICTLY decrease every tick while combat lasts…
      let prev = ctl.phase.ticksLeft;
      for (let i = 0; i < 30 && ctl.phase.phase === "combat"; i++) {
        ctl.tick();
        expect(ctl.phase.ticksLeft).toBeLessThan(prev);
        prev = ctl.phase.ticksLeft;
      }
      expect(ctl.faultCount).toBeGreaterThan(0);
      // …and the round must still END, on the host clock, not hang forever.
      let n = 0;
      while (ctl.phase.phase === "combat" && n++ < 2000) ctl.tick();
      expect(ctl.phase.phase, "combat wedged on a frozen sim clock").not.toBe("combat");
      expect(ctl.world.fireRingTicks).toBeLessThan(cfg.combatMaxTicks); // sim never advanced
    } finally {
      errSpy.mockRestore();
    }
  });
});

// ===========================================================================
// 2 — 除非全死不然不會提前結束
// ===========================================================================
describe("a round with zombies still standing does not end early (#L2)", () => {
  /** Reach combat with one mob wave on the field and both duels still live. */
  function withMobsOnField(seed: number): MatchController {
    const cfg = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 3000, resolutionTicks: 3 };
    const ctl = new MatchController(
      `l2-mobs-${seed}`,
      seed,
      allBots(),
      cfg,
      undefined,
      rulesWithMobs(),
      undefined,
      undefined,
      NO_DAMAGE,
    );
    toCombat(ctl);
    for (let i = 0; i < 12; i++) ctl.tick(); // firstWaveSec 0.2 = 6 ticks
    expect(ctl.pairings.length).toBe(2);
    for (const p of ctl.pairings) expect(anyMobsAlive(ctl.world, p.zone)).toBe(true);
    return ctl;
  }

  /**
   * 「這一刻哪幾種怪壓得住回合」 —— read off the rules ACTUALLY ARMED on the world,
   * never off a literal. That is the whole point of the field: owner has already
   * moved this decision once (任何殭屍 → 只有殭屍王), so a test that copied the
   * answer in would become the fourth home of a value that has three, and would
   * lie on the day he moves it again.
   */
  const holdKindsInForce = (ctl: MatchController) =>
    ROUND_HOLD_KINDS[ctl.world.mobRules?.roundHoldMobKinds ?? DEFAULT_ROUND_HOLD_KINDS];

  /** A 殭屍王 into every duel zone, through the one door kings enter by. */
  function summonKingInEveryZone(ctl: MatchController): void {
    for (const p of ctl.pairings) {
      const seat = [...ctl.seats.values()].find(
        (s) => s.entityId !== null && ctl.world.transform.get(s.entityId)?.zone === p.zone,
      );
      const king = summonMobBoss(ctl.world, p.zone, ctl.world.mobRules!, seat!.entityId!, 100);
      expect(king, `no king summoned into zone ${p.zone}`).not.toBeNull();
    }
  }

  // 兩組,一個機制. owner 2026-08-02 收窄了「誰壓得住回合」,所以 這兩組必須分開跑:
  // 普通殭屍 = 馬上結算(他實打之後要的),殭屍王 = 仍然壓住(#L2 的延長機制沒被拆掉).
  // 期望值不是寫死的 "combat"/"resolution",是從 `roundHoldMobKinds` 推導的 —— 後台
  // 把它調回 `any`,這兩條會自己跟著改答案,而不是變成兩條說謊的紅燈.
  for (const kind of ["normal", "boss"] as const) {
    const label = kind === "boss" ? "殭屍王" : "普通殭屍";
    it(`只剩一隊存活、場上是${label} → 結不結算由 roundHoldMobKinds 決定`, () => {
      cover("boss-round-extension-host");
      const ctl = withMobsOnField(7);
      if (kind === "boss") summonKingInEveryZone(ctl);
      const hold = holdKindsInForce(ctl);
      // 前置:這一種怪真的站在場上,否則下面驗的是空氣.
      for (const p of ctl.pairings) {
        expect(anyMobsAliveOfKinds(ctl.world, p.zone, [kind]), `zone ${p.zone} 沒有${label}`).toBe(
          true,
        );
      }
      // 規格:這個 zone 這一刻該不該被壓住.
      const held = ctl.pairings.map((p) => anyMobsAliveOfKinds(ctl.world, p.zone, hold));

      for (const p of ctl.pairings) wipeSideInZone(ctl, p.sideB, p.zone);
      ctl.tick();
      for (const [i, p] of ctl.pairings.entries()) {
        expect(ctl.duelWinnerOf(p.zone), `zone ${p.zone}`).toBe(held[i] ? undefined : p.sideA);
      }
      expect(ctl.phase.phase).toBe(held.some(Boolean) ? "combat" : "resolution");

      if (held.some(Boolean)) {
        // …被壓住的那一種:場地清空才結算 —— #L2 的「除非全死不然不會提前結束」
        // 對它原封不動.
        for (const p of ctl.pairings) expect(anyMobsAlive(ctl.world, p.zone)).toBe(true);
        killAllMobs(ctl);
        ctl.tick();
        expect(ctl.phase.phase).toBe("resolution");
        for (const p of ctl.pairings) expect(ctl.duelWinnerOf(p.zone)).toBe(p.sideA);
      }
    });
  }

  it("一隊全滅的那一刻就停止生怪,不必等勝負被記下 (spawnHaltedZones)", () => {
    cover("boss-round-extension-host");
    // 舊規則之所以變成玩家眼中的 bug,是一個自我維持的迴圈:有殭屍 ⇒ 不記勝負 ⇒
    // 沒進 settledZones ⇒ 繼續生殭屍. 這一條站在迴圈的另一刀上:回合**還被殭屍王
    // 壓著**(所以 settledZones 依然是空的),而波次必須已經停了. 用一個還在打的
    // zone 當對照組 —— 同樣的 60 tick,它必須還在長.
    const cfg = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 3000, resolutionTicks: 3 };
    const ctl = new MatchController(
      "l2-halt",
      5,
      allBots(),
      cfg,
      undefined,
      { ...DEFAULT_ARENA_RULES, mobWaves: REPEAT_WAVES },
      undefined,
      undefined,
      NO_DAMAGE,
    );
    toCombat(ctl);
    for (let i = 0; i < 12; i++) ctl.tick();
    expect(ctl.pairings.length).toBe(2);
    const wiped = ctl.pairings[0]!;
    const control = ctl.pairings[1]!;

    const seat = [...ctl.seats.values()].find(
      (s) => s.entityId !== null && ctl.world.transform.get(s.entityId)?.zone === wiped.zone,
    )!;
    expect(summonMobBoss(ctl.world, wiped.zone, ctl.world.mobRules!, seat.entityId!, 100)).not.toBeNull();

    wipeSideInZone(ctl, wiped.sideB, wiped.zone);
    ctl.tick();
    expect(ctl.world.spawnHaltedZones.has(wiped.zone)).toBe(true);
    expect(ctl.world.spawnHaltedZones.has(control.zone)).toBe(false);
    // THE WINDOW settledZones cannot cover: the duel is NOT recorded yet.
    expect(ctl.world.settledZones.has(wiped.zone)).toBe(false);
    expect(ctl.duelWinnerOf(wiped.zone)).toBeUndefined();

    const haltedBefore = mobsAliveInZone(ctl.world, wiped.zone);
    const controlBefore = mobsAliveInZone(ctl.world, control.zone);
    for (let i = 0; i < 60; i++) ctl.tick();
    expect(ctl.phase.phase, "回合早就結束了,這 60 tick 沒有在測生成閘門").toBe("combat");
    expect(mobsAliveInZone(ctl.world, wiped.zone)).toBe(haltedBefore);
    expect(mobsAliveInZone(ctl.world, control.zone)).toBeGreaterThan(controlBefore);
  });

  it("玩家全滅 → 立即結束,不管殭屍在不在", () => {
    cover("boss-round-extension-host");
    const ctl = withMobsOnField(11);
    for (const p of ctl.pairings) {
      wipeSideInZone(ctl, p.sideA, p.zone);
      wipeSideInZone(ctl, p.sideB, p.zone);
    }

    // The zombies are STILL up ON THE TICK THE DECISION IS MADE — asserted here
    // rather than after, because `concludeCombat` → `endCombatMobs` clears the
    // field the instant the round ends, so a post-tick check would read empty
    // whether the hold applied or not (and would therefore pass either way).
    for (const p of ctl.pairings) expect(anyMobsAlive(ctl.world, p.zone)).toBe(true);
    ctl.tick();
    expect(ctl.phase.phase).toBe("resolution");
    for (const p of ctl.pairings) expect(ctl.duelWinnerOf(p.zone)).not.toBeUndefined();
  });

  it("被殭屍王拖住之後才全滅 → 勝利歸先前存活的那一隊,不是擲硬幣", () => {
    cover("boss-round-extension-host");
    // Six independent seeds × two zones = twelve decisions. A coin would have to
    // land right twelve times in a row (p = 2^-12) for this to pass by luck.
    //
    // 王,不是普通殭屍:出貨設定下只有王壓得住回合,而「先前存活的那一隊」這件記憶
    // 只有在回合被壓住的那段時間裡才有東西可記.
    for (const seed of [1, 2, 3, 5, 8, 13]) {
      const ctl = withMobsOnField(seed);
      summonKingInEveryZone(ctl);
      for (const p of ctl.pairings) {
        expect(
          anyMobsAliveOfKinds(ctl.world, p.zone, holdKindsInForce(ctl)),
          `seed ${seed}: roundHoldMobKinds 現在誰都壓不住,這一條的前提不成立了`,
        ).toBe(true);
      }
      for (const p of ctl.pairings) wipeSideInZone(ctl, p.sideB, p.zone);
      ctl.tick(); // held open by the king — sideA is the pending winner
      expect(ctl.phase.phase, `seed ${seed}`).toBe("combat");

      for (const p of ctl.pairings) wipeSideInZone(ctl, p.sideA, p.zone);
      ctl.tick(); // now 玩家全滅 with zombies still up
      expect(ctl.phase.phase, `seed ${seed}`).toBe("resolution");
      for (const p of ctl.pairings) {
        expect(ctl.duelWinnerOf(p.zone), `seed ${seed} zone ${p.zone}`).toBe(p.sideA);
      }
    }
  });

  it("決賽也一樣:殭屍還站著就不發冠軍,清空後才發", () => {
    cover("boss-round-extension-host");
    // The finale runs `checkRoyaleEnd`, a SEPARATE end rule — 「只剩一隊存活」 at
    // match scale — and mob waves arm on the royale zone through the same
    // `activeZones()` call a duel zone uses. `schedule: []` is the point of this
    // fixture: the SHIPPED table zeroes round 10's caps, so the shipped finale
    // has no zombies and this branch would be dead code an operator could still
    // wake up by raising them. Without this test the royale hold is deletable
    // with the suite still green (失敗形態 ③).
    const cfg = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 60, resolutionTicks: 2 };
    const everyRound: MobWavesConfig = { ...ONE_WAVE, schedule: [] };
    // FOUR seeds: the second half of each run checks that a total wipe DURING
    // the hold still crowns the team that was standing. `checkRoyaleEnd`'s
    // fallback is `rng.int(4)`, so a coin would have to land right four times
    // (p = 4^-4 ≈ 0.4 %) for this to pass without the pending-winner memory.
    for (const seed of [5, 6, 7, 8]) {
      const ctl = new MatchController(
        `l2-royale-${seed}`,
        seed,
        allBots(),
        cfg,
        undefined,
        { ...DEFAULT_ARENA_RULES, mobWaves: everyRound },
        undefined,
        undefined,
        NO_DAMAGE,
      );
      let n = 0;
      while (!(ctl.phase.phase === "combat" && ctl.phase.round === FINAL_ROUND) && n++ < 400_000) ctl.tick();
      expect(ctl.phase.round, `seed ${seed}`).toBe(FINAL_ROUND);
      const bout = ctl.royale;
      expect(bout, `seed ${seed}`).not.toBeNull();
      for (let i = 0; i < 10; i++) ctl.tick();
      expect(anyMobsAlive(ctl.world, bout!.zone), `seed ${seed}`).toBe(true);

      // leave exactly ONE team standing — #208's 「立即宣佈」 case, at match scale
      for (const t of bout!.teams.slice(1)) wipeSideInZone(ctl, t, bout!.zone);
      ctl.tick();
      expect(ctl.royaleWinner, `seed ${seed}: crowned early with zombies up`).toBeNull();
      expect(ctl.phase.phase, `seed ${seed}`).toBe("combat");

      // …and now the last team dies to the field it was left fighting.
      wipeSideInZone(ctl, bout!.teams[0]!, bout!.zone);
      ctl.tick();
      expect(ctl.royaleWinner, `seed ${seed}: crown went to a coin`).toBe(bout!.teams[0]);
    }
  });

  it("時間到永遠贏過殭屍:一個卡在角落的殭屍不能無限拖住回合", () => {
    cover("boss-round-extension-host");
    // The hold is bounded by the phase backstop, not only by the fire ring's
    // %-HP burn. Short clock + one live wave + a decided duel ⇒ the round still
    // ends, and it ends at the deadline.
    const cfg = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 40, resolutionTicks: 3 };
    const ctl = new MatchController(
      "l2-timer-wins",
      33,
      allBots(),
      cfg,
      undefined,
      rulesWithMobs(),
      undefined,
      undefined,
      NO_DAMAGE,
    );
    toCombat(ctl);
    for (let i = 0; i < 10; i++) ctl.tick();
    for (const p of ctl.pairings) expect(anyMobsAlive(ctl.world, p.zone)).toBe(true);
    for (const p of ctl.pairings) wipeSideInZone(ctl, p.sideB, p.zone);

    let n = 0;
    while (ctl.phase.phase === "combat" && n++ < 500) ctl.tick();
    expect(ctl.phase.phase).toBe("resolution");
    expect(n).toBeLessThanOrEqual(cfg.combatMaxTicks); // the timer, not a hang
    for (const p of ctl.pairings) expect(ctl.duelWinnerOf(p.zone)).toBe(p.sideA);
  });
});

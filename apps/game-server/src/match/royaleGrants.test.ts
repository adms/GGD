/**
 * ROUND-10 RULE A, THE HALF THAT HAD NO GUARD —
 * 「不管前面被淘汰與否，大家都回來打第 10 回合…照樣正常參戰、照樣拿每回合的
 *   等級/金錢/三選一」 (owner directive 2026-07-27).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS (read before touching it)
 * ---------------------------------------------------------------------------
 * The no-elimination change removed TWO `teamHealth <= 0 → skip` filters: one in
 * `participatingTeams()` (who gets paired) and one in `activeSeats()` (who gets
 * PAID). `royale.test.ts` only ever guarded the first: it followed a 0-health
 * team from round 1 to the finale and asserted it was in every bout — plus
 * `goldAt() > goldBefore` / `levelAt() > levelBefore` over nine rounds.
 *
 * THAT SECOND PAIR OF ASSERTIONS GUARDS NOTHING. `settleRound` / `settleRoyale`
 * pay round gold + XP by walking `this.seats.values()` directly, never through
 * `activeSeats()`, and kill bounty, guardian gold, mob income and the coin drop
 * all bypass it too. Nine rounds of that make gold and level rise no matter what
 * `activeSeats()` yields — so putting the filter back left the whole suite green.
 *
 * So every assertion here is aimed at the FIVE things `activeSeats()` is the ONLY
 * path to, each observed at the single tick the intermission grants run on:
 *
 *   1. the per-round GOLD grant      — exact authored number, measured as the
 *                                      delta across that one tick, not a total;
 *   2. the per-round LEVEL grant     — same seam, same exactness;
 *   3. the 三選一 augment card       — a stored offer keyed `${round}:${seatId}`;
 *   4. the free legendary-weapon card— a stored offer keyed `${round}:${seatId}:w`;
 *   5. the EX unlock + the gacha     — the `exUnlock` / `gachaItem` sim events
 *                                      emitted by those loops on that tick.
 *
 * …and all of it on ROUNDS 7-9, i.e. after a team's 20-point pool has actually
 * run out (measured first elimination: round 7 median), against the SHIPPED
 * `config.arena-rules@1` table rather than a test fixture — those are the rounds
 * whose 5 levels / 600-2750 gold / prismatic cards the owner's 2026-07-27 reward
 * table authored, and the ones a spent team used to be silently starved of.
 *
 * The team is PINNED at 0 health every tick (a High Stakes win can otherwise
 * refill it) so the condition holds at the exact instant the grants run, and a
 * healthy CONTROL team is measured alongside it: the contract is not merely
 * "the broke team got something", it is "the broke team got the SAME thing".
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asTeamId, type TeamId, type EntityId } from "@ggd/shared/ids";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { sellItem } from "@ggd/shared/sim/economy/shop";
import { MatchController, type SeatSpec } from "./MatchController";
import { resolveArenaRules, grantForRound, type ArenaRules } from "./arenaRules";
import { FINAL_ROUND } from "./PairedDuels";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The SHIPPED round table — exUnlockRound 7, prismatic cards on 7/8/9. */
let SHIPPED: ArenaRules;

beforeAll(async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const loaded = await new ContentLoader(new FsContentSource(join(here, "../../../../content"))).load();
  registerAll(loaded.store);
  SHIPPED = resolveArenaRules();
});

/**
 * A champion that HAS an EX skill, so rule A's 「EX 解鎖」 half is observable.
 * Pinned by an explicit precondition below rather than assumed: if the roster
 * ever drops this hero the test says so instead of silently testing nothing.
 *
 * ⚠️ 必須是**本體**。這裡原本坐的是 `godie-h01o`（一護的變身態），
 * 而 `Whitelist.allowsChampion` 現在擋掉所有變身態的身體
 * （見 `curation/transformedBodyGate.test.ts`）→ 席位會退回 `sela`，
 * 於是下面那條前提斷言先紅。換成同樣帶 EX 的本體 `godie-h01n`。
 */
const EX_CHAMPION = "godie-h01n"; // 開外掛的死神 - 黑崎一護（本體）

const FAST = { champSelectTicks: 4, intermissionTicks: 24, combatMaxTicks: 300, resolutionTicks: 3 };

const seats = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: true,
    championId: EX_CHAMPION,
  }));

/** The team whose pool we spend, and the healthy team we compare it against. */
const BROKE = asTeamId(2);
const CONTROL = asTeamId(0);

/** What one team was handed at ONE intermission entry. */
interface Handout {
  /** seats of this team holding an augment 三選一 card for this round */
  augmentCards: number;
  /** …and a free legendary-weapon card */
  weaponCards: number;
  /** `gachaItem` events emitted for this team's seats on the entry tick */
  gachaGrants: number;
  /** `exUnlock` events likewise */
  exUnlocks: number;
  /** per-seat gold gained across the entry tick */
  goldDelta: number[];
  /** per-seat levels gained across the entry tick */
  levelDelta: number[];
}

type RoundLedger = Map<number, { broke: Handout; control: Handout }>;

/**
 * Run a match to the end of `lastRound`, pinning BROKE at 0 team health on every
 * tick, and record what each team was handed at each intermission entry.
 *
 * The measurement is deliberately per-TICK. The intermission grants all run in
 * `enterIntermission`, which fires inside the single tick that carries the phase
 * from `resolution` to `intermission`; sampling gold/levels either side of THAT
 * tick isolates the grant from every other income in the match, which is exactly
 * what the old `goldAt() > goldBefore` assertion failed to do.
 */
function ledgerThrough(ctl: MatchController, lastRound: number, keepASlotFree = false): RoundLedger {
  const out: RoundLedger = new Map();
  const seatsOf = (team: TeamId): { entity: EntityId; seatId: number }[] =>
    [...ctl.seats.values()]
      .filter((s) => s.teamId === team && s.entityId !== null)
      .map((s) => ({ entity: s.entityId!, seatId: s.seatId as number }));

  // champ select first, so every seat has an entity to measure
  let guard = 0;
  while (ctl.phase.phase === "champSelect" && guard++ < 10_000) ctl.tick();

  const rosters = { broke: seatsOf(BROKE), control: seatsOf(CONTROL) };
  const sample = (r: { entity: EntityId }[]): { gold: number[]; level: number[] } => ({
    gold: r.map((s) => ctl.world.champion.get(s.entity)!.gold),
    level: r.map((s) => ctl.world.champion.get(s.entity)!.level),
  });

  const harvest = (
    roster: { entity: EntityId; seatId: number }[],
    before: { gold: number[]; level: number[] },
    round: number,
  ): Handout => {
    const ids = new Set<EntityId>(roster.map((s) => s.entity));
    const evs = (type: string): number =>
      ctl.world.events.filter((e) => e.type === type && ids.has(e.data.id as EntityId)).length;
    return {
      augmentCards: roster.filter((s) => ctl.offers.get(`${round}:${s.seatId}`)?.kind === "augment").length,
      weaponCards: roster.filter((s) => ctl.offers.get(`${round}:${s.seatId}:w`)?.kind === "item").length,
      gachaGrants: evs("gachaItem"),
      exUnlocks: evs("exUnlock"),
      goldDelta: roster.map((s, i) => ctl.world.champion.get(s.entity)!.gold - before.gold[i]!),
      levelDelta: roster.map((s, i) => ctl.world.champion.get(s.entity)!.level - before.level[i]!),
    };
  };

  guard = 0;
  while (ctl.phase.phase !== "matchEnd" && ctl.phase.round <= lastRound && guard++ < 400_000) {
    // 「生命見底」 held true at the instant the grants run — a High Stakes win
    // would otherwise refill the pool and quietly retire the condition.
    ctl.teamHealth.set(BROKE, 0);
    // …and the CONTROL arm is pinned FULL for the mirror-image reason (#265,
    // 2026-07-28). It used to be left to whatever the seeded bot match did, and
    // the #265 balance pass (每位英雄基礎生命 +300、倍率 4→3) shifted enough
    // round outcomes that CONTROL also bottomed out at 0 — which does not break
    // the feature, it breaks the EXPERIMENT: a "spent team is paid the same as a
    // healthy team" comparison whose control arm is also spent proves nothing.
    // Pinning both arms makes the only difference between them the one under
    // test, instead of leaving it to a seed.
    ctl.teamHealth.set(CONTROL, ctl.startingTeamHealth);
    // The gacha no-ops on a champion with six full slots, so by round 9 a
    // well-shopped bot rolls nothing for reasons that have nothing to do with
    // this contract. Free one slot on the LAST resolution tick — before the
    // sample below, so the refund never lands inside a measured grant delta.
    if (keepASlotFree && ctl.phase.phase === "resolution" && ctl.phase.ticksLeft === 1) {
      for (const roster of [rosters.broke, rosters.control]) {
        for (const s of roster) {
          const champ = ctl.world.champion.get(s.entity)!;
          const filled = champ.items.map((it, i) => (it ? i : -1)).filter((i) => i >= 0);
          if (champ.items.includes(null) || filled.length === 0) continue;
          sellItem(ctl.world, s.entity, filled[filled.length - 1]!);
        }
      }
    }
    const wasPhase = ctl.phase.phase;
    const before = { broke: sample(rosters.broke), control: sample(rosters.control) };
    ctl.tick();
    if (ctl.phase.phase === "intermission" && wasPhase !== "intermission") {
      const round = ctl.phase.round;
      out.set(round, {
        broke: harvest(rosters.broke, before.broke, round),
        control: harvest(rosters.control, before.control, round),
      });
    }
  }
  return out;
}

/** The rounds the owner's table pays 5 levels + 600/2750/750 gold on. */
const LATE_ROUNDS = [7, 8, 9];

describe("a SPENT team is still paid — rounds 7-9 (royale-no-elimination)", () => {
  /** One shared match: nine rounds of real content is the expensive part. */
  let ledger: RoundLedger;
  let ctl: MatchController;

  beforeAll(() => {
    ctl = new MatchController("r10-grants", 20260727, seats(), FAST, 20, SHIPPED);
    ledger = ledgerThrough(ctl, FINAL_ROUND - 1);
  });

  it("PRECONDITION: the match really reached round 9 with a 0-health team on the board", () => {
    cover("royale-no-elimination");
    for (const r of LATE_ROUNDS) expect(ledger.has(r), `no round ${r} intermission observed`).toBe(true);
    expect(ctl.teamHealth.get(BROKE)).toBe(0);
    expect(ctl.teamHealth.get(CONTROL)).toBeGreaterThan(0);
    // …and the seats really are three-per-team, so a `toBe(3)` below is a real
    // "every player on the spent team", not an accidental 0 === 0.
    expect(ledger.get(7)!.broke.goldDelta).toHaveLength(3);
  });

  it("hands it the 三選一 augment card every round, exactly like a healthy team", () => {
    cover("royale-no-elimination");
    for (const r of LATE_ROUNDS) {
      const tier = grantForRound(SHIPPED, r)?.augmentTier;
      expect(tier, `round ${r} authors no augment tier`).toBe("prismatic");
      const { broke, control } = ledger.get(r)!;
      // ⚠️ THE POINT: this offer is created inside the `activeSeats()` loop. It
      // is the ONLY thing on the round-grant path that a 0-health team cannot
      // also get from combat income, so it is what a re-added filter kills.
      expect(broke.augmentCards, `spent team got no card in round ${r}`).toBe(3);
      expect(broke.augmentCards).toBe(control.augmentCards);
    }
  });

  it("pays it the round's gold — the AUTHORED number, measured on the grant tick", () => {
    cover("royale-no-elimination");
    for (const r of LATE_ROUNDS) {
      const want = grantForRound(SHIPPED, r)?.grantGold;
      expect(want, `round ${r} authors no gold`).toBeGreaterThan(0);
      const { broke, control } = ledger.get(r)!;
      // Not "gold went up over nine rounds" (it always does — kill bounty, mob
      // income, round win/lose pay, coins) but "this exact tick moved it by the
      // exact authored amount". A withheld grant reads 0 here.
      for (const d of broke.goldDelta) expect(d, `round ${r} gold`).toBe(want);
      for (const d of control.goldDelta) expect(d).toBe(want);
    }
  });

  it("levels it up by the round's authored levels on that same tick", () => {
    cover("royale-no-elimination");
    for (const r of LATE_ROUNDS) {
      const want = grantForRound(SHIPPED, r)?.grantLevels;
      expect(want, `round ${r} authors no levels`).toBeGreaterThan(0);
      const { broke, control } = ledger.get(r)!;
      for (const d of broke.levelDelta) expect(d, `round ${r} levels`).toBe(want);
      for (const d of control.levelDelta) expect(d).toBe(want);
    }
  });

  it("unlocks its EX at the authored round, and the SIM emits the unlock for it", () => {
    cover("royale-no-elimination");
    expect(SHIPPED.exUnlockRound).toBe(7);
    // precondition: this roster really has an EX to unlock
    const anySeat = [...ctl.seats.values()].find((s) => s.teamId === BROKE)!;
    expect(anySeat.championId, "roster changed — pick another EX champion").toBe(EX_CHAMPION);
    expect(ctl.world.abilities.get(anySeat.entityId!)?.exSlot).toBeTruthy();

    // nothing before the gate, all three seats ON the gate round…
    expect(ledger.get(6)!.broke.exUnlocks).toBe(0);
    expect(ledger.get(7)!.broke.exUnlocks).toBe(3);
    expect(ledger.get(7)!.broke.exUnlocks).toBe(ledger.get(7)!.control.exUnlocks);
    // …and it STAYS unlocked, i.e. the rank really moved, not just the event
    for (const seat of ctl.seats.values()) {
      if (seat.teamId !== BROKE) continue;
      expect(ctl.world.abilities.get(seat.entityId!)!.exSlot!.rank).toBe(1);
    }
    // idempotent: no second unlock in rounds 8-9
    expect(ledger.get(8)!.broke.exUnlocks + ledger.get(9)!.broke.exUnlocks).toBe(0);
  });
});

describe("…and the cards the shipped table does not schedule late (royale-no-elimination)", () => {
  /**
   * The free legendary-weapon card and the 道具抽卡 gacha are the other two
   * `activeSeats()` consumers. The shipped doc schedules the weapon card on
   * rounds 2/5 and no gacha at all, so this match re-authors both onto 7-9 —
   * the operator-editable knobs, driven to the rounds rule A is about.
   */
  let ledger: RoundLedger;

  beforeAll(() => {
    const rounds = new Map(SHIPPED.rounds);
    for (const r of LATE_ROUNDS) rounds.set(r, { ...rounds.get(r)!, weaponLootTable: "quest-rewards" });
    // ⚠️ `draftConflict: "both"` 是這場實驗的前提（#340）：rounds 7-9 本來就排了
    // prismatic 聖杯願望，出貨預設（聖杯贏）會把剛剛塞上去的寶具卡壓掉，於是
    // 下面那條「0 生命的隊伍照樣拿得到寶具卡」會用空集合過關（失敗形態④）。
    // 這一支問的是「陣亡的隊伍有沒有被排除在發卡迴圈外」，不是撞卡裁決本身。
    const rules: ArenaRules = {
      ...SHIPPED,
      rounds,
      draftConflict: "both",
      gacha: { fromRound: 7, lootTable: "round-reward" },
    };
    const ctl = new MatchController("r10-grants-late", 777, seats(), FAST, 20, rules);
    ledger = ledgerThrough(ctl, FINAL_ROUND - 1, true);
  });

  it("still deals a 0-health team its FREE weapon card in rounds 7-9", () => {
    cover("royale-no-elimination");
    for (const r of LATE_ROUNDS) {
      const { broke, control } = ledger.get(r)!;
      expect(broke.weaponCards, `spent team got no weapon card in round ${r}`).toBe(3);
      expect(broke.weaponCards).toBe(control.weaponCards);
    }
  });

  it("still rolls its 道具抽卡 gacha in rounds 7-9", () => {
    cover("royale-no-elimination");
    // Asserted on the `gachaItem` SIM EVENT rather than on inventory size: bots
    // buy and sell during the same intermission, so a slot count would be noise.
    //
    // NOT compared against the control team: `rollItemReward` no-ops for a
    // champion whose six slots are already full, so the two teams legitimately
    // differ by how much their bots have bought. What must hold is that the
    // spent team is IN the loop at all — a withheld seat rolls exactly zero.
    let brokeTotal = 0;
    for (const r of LATE_ROUNDS) brokeTotal += ledger.get(r)!.broke.gachaGrants;
    for (const r of LATE_ROUNDS) {
      expect(ledger.get(r)!.broke.gachaGrants, `spent team was skipped in round ${r}`).toBeGreaterThan(0);
    }
    expect(brokeTotal).toBeGreaterThanOrEqual(LATE_ROUNDS.length);
  });
});

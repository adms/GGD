/**
 * roundTeardown.test.ts — task #216, the HOST half.
 *
 * PLAYTEST REPORT (owner, 2026-07-26):
 *   「回到商店時，戰鬥場景應該回覆，目前還會有火圈聲音跟血量會降低等，
 *     並且看得到戰場上的血條」
 *
 * The sim-side primitive (`world.settledZones`) is unit-tested in
 * packages/shared/.../settledZones.test.ts. What is pinned HERE is the wiring
 * that made the bug reachable in a real match: only the MatchController knows
 * that a zone's duel is decided, and before #216 it kept that knowledge in host
 * state (`this.duelWinners`) where no sim system could see it. So the fire ring
 * kept eating the survivors of a finished 3v3 for as long as the OTHER zone
 * fought on — and because a player knocked out this round is already looking at
 * the shop (client `shopGate`), that is exactly what 「回到商店…血量會降低」 was.
 *
 * Note where the bug is NOT: during the real `intermission` phase the world is
 * already clean (`concludeCombat` disarms everything). The window is one phase
 * earlier and it is per-zone, so these tests assert INSIDE live combat, with
 * `combatActive` still true — if they ever pass because the round ended, they
 * are not testing anything.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import type { FireRingConfig } from "@ggd/shared/content";
import type { EntityId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { hostDigest } from "../replay/digest";

/** A combat budget the phase timer can never be the reason anything happened. */
const CFG = {
  champSelectTicks: 5,
  intermissionTicks: 20,
  combatMaxTicks: 100_000,
  resolutionTicks: 5,
};

/**
 * A ring that ignites 1 s in and closes 1 s later, at a rate that is clearly
 * visible over ~3 s but nowhere near lethal in that window — so a round can be
 * observed BURNING without the observation ending it.
 */
const FAST_RING: FireRingConfig = {
  startSec: 1,
  shrinkSec: 1,
  minRadius: 0.5,
  // flat 20 %/s: this fixture wants a VISIBLE but non-lethal burn, so the
  // curve is deliberately constant rather than ramping to 必死.
  burnCurve: [
    { sec: 0, pctPerSec: 0.2 },
    { sec: 60, pctPerSec: 0.2 },
  ],
  maxPctPerSec: 1,
  // 殭屍王回合延長 (#L1)。`config.match@1` 的 fireRing.boss 帶 `.default()`,
  // 所以 Zod 的 OUTPUT 型別上它是必填 —— 這個 fixture 少了它就不是
  // FireRingConfig。值就是出貨預設 (content/config/config.match.json)。
  // #248 —— 回合硬上限，鏡射出貨的 300 秒（不是隨手挑的：這個 fixture 的用途就是
  // 「出貨長什麼樣」，挑一個別的數字會讓它變成測一份不存在的設定）。
  roundHardCapSec: 300,
  boss: { extendCombatSec: 180, delayFireRingSec: 180 },
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function controller(seed: number, fireRing?: FireRingConfig): MatchController {
  return new MatchController(
    "td",
    seed,
    allBots(),
    CFG,
    undefined,
    undefined,
    undefined,
    undefined,
    // combat damage OFF: the only thing that can move HP here is the ring, so a
    // "no HP lost" assertion cannot be satisfied by a lull in the bot fight.
    normalizeCombatEnv({ damageDealt: 0 }),
    fireRing,
  );
}

function toCombat(ctl: MatchController): void {
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  expect(ctl.phase.phase).toBe("combat");
}

/** Kill every LIVING champion of `teamId` standing in `zone` (deterministic wipe). */
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

/** Every living champion entity currently standing in `zone`. */
function livingIn(ctl: MatchController, zone: number): EntityId[] {
  const out: EntityId[] = [];
  for (const seat of ctl.seats.values()) {
    if (seat.entityId === null) continue;
    if (ctl.world.transform.get(seat.entityId)?.zone !== zone) continue;
    if (ctl.world.health.get(seat.entityId)?.alive) out.push(seat.entityId);
  }
  return out;
}

describe("a decided duel stops burning while the round plays on (#216)", () => {
  it("the winning zone takes ZERO fire-ring damage; the live zone keeps burning", () => {
    cover("teardown-host-settled-zone");
    const ctl = controller(1234, FAST_RING);
    toCombat(ctl);
    expect(ctl.pairings.length).toBe(2); // 4 teams → two duel zones
    const [decided, live] = ctl.pairings;

    // The instant this duel is decided, the host must tell the SIM.
    wipeSideInZone(ctl, decided!.sideB, decided!.zone);
    ctl.tick();
    expect(ctl.duelWinnerOf(decided!.zone)).toBe(decided!.sideA);
    expect([...ctl.world.settledZones]).toEqual([decided!.zone]);
    expect(ctl.duelWinnerOf(live!.zone)).toBeUndefined();

    const survivors = livingIn(ctl, decided!.zone);
    expect(survivors.length).toBeGreaterThan(0); // there IS someone left to burn
    const hpAtSettle = new Map(survivors.map((id) => [id, ctl.world.health.get(id)!.hp]));

    // …and now run through ignition (30 ticks) and full closure (60 ticks).
    let burnDecided = 0;
    let burnLive = 0;
    let guard = 0;
    while (ctl.phase.phase === "combat" && guard++ < 90) {
      ctl.tick();
      for (const ev of ctl.world.events) {
        if (ev.type !== "fireRingDamage") continue;
        const id = ev.data.id as EntityId;
        const zone = ctl.world.transform.get(id)?.zone;
        if (zone === decided!.zone) burnDecided += ev.data.amount as number;
        if (zone === live!.zone) burnLive += ev.data.amount as number;
      }
    }

    // THE REGRESSION: this was a steady drain the owner watched from the shop.
    expect(burnDecided).toBe(0);
    for (const [id, hp] of hpAtSettle) {
      expect(ctl.world.health.get(id)!.hp).toBeGreaterThanOrEqual(hp);
    }
    // …and the fix is SURGICAL, not "turn the ring off": the unfinished duel is
    // still being squeezed, which is the mechanic's whole job.
    expect(burnLive).toBeGreaterThan(0);
    // …while the round was still globally LIVE the entire time — i.e. the old
    // `combatActive` gate would NOT have saved the decided zone.
    expect(ctl.world.combatActive).toBe(true);
    expect(ctl.phase.phase).toBe("combat");
  });

  it("the next round starts with every zone undecided again", () => {
    cover("teardown-host-settled-zone");
    const ctl = controller(4242, FAST_RING);
    toCombat(ctl);
    for (const p of ctl.pairings) wipeSideInZone(ctl, p.sideB, p.zone);
    ctl.tick();
    expect(ctl.world.settledZones.size).toBe(ctl.pairings.length);
    expect(ctl.phase.phase).toBe("resolution"); // every duel decided → round over

    // resolution → intermission: combat is fully torn down (the state the owner
    // expected when he 「回到商店」).
    let guard = 0;
    while (ctl.phase.phase !== "intermission" && guard++ < 5000) ctl.tick();
    expect(ctl.world.combatActive).toBe(false);
    expect(ctl.world.fireRingRules).toBeNull();
    expect(ctl.world.fireRingTicks).toBe(-1);

    // …and `enterCombat` re-arms every zone, or round 2 would start pre-settled
    // and nothing would ever burn again.
    guard = 0;
    while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
    expect(ctl.world.settledZones.size).toBe(0);
    expect(ctl.world.combatActive).toBe(true);
  });
});

describe("settledZones is inside the replay divergence alarm (#216)", () => {
  it("hostDigest changes when a zone's decided-ness changes", () => {
    cover("teardown-host-settled-zone");
    // The flag now decides whether a champion takes damage, so a replica that
    // disagrees about it is a real divergence — it must be SENSED, not inferred
    // several hundred ticks later from the HP it moved.
    const ctl = controller(777, FAST_RING);
    toCombat(ctl);
    const before = hostDigest(ctl);
    ctl.world.settledZones.add(1);
    expect(hostDigest(ctl)).not.toBe(before);
    ctl.world.settledZones.delete(1);
    expect(hostDigest(ctl)).toBe(before); // and it is a pure function of the set
  });

  it("the digest does not depend on the ORDER the zones were settled in", () => {
    cover("teardown-host-settled-zone");
    // Insertion order is a host-iteration artefact (which pairing wiped first),
    // never a fact about the world — hashing it would fire false alarms.
    const a = controller(777, FAST_RING);
    const b = controller(777, FAST_RING);
    toCombat(a);
    toCombat(b);
    a.world.settledZones.add(0);
    a.world.settledZones.add(1);
    b.world.settledZones.add(1);
    b.world.settledZones.add(0);
    expect(hostDigest(a)).toBe(hostDigest(b));
  });
});

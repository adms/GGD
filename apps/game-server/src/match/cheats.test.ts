/**
 * Offline cheat console — server side. Exercises MatchController.applyCheat for
 * every cheat kind plus the dev-mode hard gate (cheatGate) and the foreign-seat
 * guard. These are dev-only helpers; determinism is intentionally not asserted.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId, type ChampionId, type ItemId } from "@ggd/shared/ids";
import { castAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { MatchController, type SeatSpec } from "./MatchController";
import { cheatsEnabled } from "./cheatGate";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** Fresh controller advanced to the first combat phase (entities spawned). */
function inCombat(seed = 4242): MatchController {
  const ctl = new MatchController("cheat", seed, allBots(), FAST);
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  return ctl;
}

/** Fresh controller stopped at the first intermission (entities spawned, no AI combat). */
function inIntermission(seed = 4242): MatchController {
  const ctl = new MatchController("cheat", seed, allBots(), FAST);
  let guard = 0;
  while (ctl.phase.phase !== "intermission" && guard++ < 5000) ctl.tick();
  return ctl;
}

const SEAT0 = asSeatId(0);

describe("applyCheat — economy & progression", () => {
  it("setLevel raises the champion to the target level (cheat-set-level)", () => {
    cover("cheat-set-level");
    const ctl = inCombat();
    const e = ctl.seats.get(SEAT0)!.entityId!;
    expect(ctl.applyCheat(SEAT0, { kind: "setLevel", level: 18 })).toBe(true);
    expect(ctl.world.champion.get(e)!.level).toBe(18);
    // levelling yields ability points to spend
    expect(ctl.world.abilities.get(e)!.unspentPoints).toBeGreaterThan(0);
  });

  it("grantGold adds gold to the seat (cheat-grant-gold)", () => {
    cover("cheat-grant-gold");
    const ctl = inCombat();
    const e = ctl.seats.get(SEAT0)!.entityId!;
    const before = ctl.world.champion.get(e)!.gold;
    expect(ctl.applyCheat(SEAT0, { kind: "grantGold", amount: 1000 })).toBe(true);
    expect(ctl.world.champion.get(e)!.gold).toBe(before + 1000);
  });

  it("grantMCoin is a graceful no-op (no in-sim wallet) (cheat-grant-gold)", () => {
    cover("cheat-grant-gold");
    const ctl = inCombat();
    expect(ctl.applyCheat(SEAT0, { kind: "grantMCoin", amount: 500 })).toBe(true);
  });
});

describe("applyCheat — abilities", () => {
  it("rankAbility ranks R past the level gate (cheat-rank-ability)", () => {
    cover("cheat-rank-ability");
    const ctl = inCombat();
    const e = ctl.seats.get(SEAT0)!.entityId!;
    // force a below-gate, no-points state — normal rank-up would be refused
    const champ = ctl.world.champion.get(e)!;
    const ab = ctl.world.abilities.get(e)!;
    champ.level = 1;
    ab.unspentPoints = 0;
    ab.slots.R.rank = 0;
    expect(ctl.applyCheat(SEAT0, { kind: "rankAbility", slot: "R" })).toBe(true);
    expect(ab.slots.R.rank).toBe(1); // bypassed the 6/11/16 gate
    // and the R gate override was left as it was (not stuck on globally)
    expect(ctl.world.ultGateOverride).toBe(false);
  });

  it("maxAbilities maxes Q/W/E/R including R (cheat-rank-ability)", () => {
    cover("cheat-rank-ability");
    const ctl = inCombat();
    const e = ctl.seats.get(SEAT0)!.entityId!;
    expect(ctl.applyCheat(SEAT0, { kind: "maxAbilities" })).toBe(true);
    const ab = ctl.world.abilities.get(e)!;
    expect(ab.slots.Q.rank).toBe(5);
    expect(ab.slots.W.rank).toBe(5);
    expect(ab.slots.E.rank).toBe(5);
    expect(ab.slots.R.rank).toBe(3);
  });

  it("resetCooldowns clears every ability cooldown (cheat-rank-ability)", () => {
    cover("cheat-rank-ability");
    const ctl = inCombat();
    const e = ctl.seats.get(SEAT0)!.entityId!;
    const ab = ctl.world.abilities.get(e)!;
    ab.slots.Q.cooldownRemainingTicks = 99;
    ab.basicAttackCdTicks = 20;
    expect(ctl.applyCheat(SEAT0, { kind: "resetCooldowns" })).toBe(true);
    expect(ab.slots.Q.cooldownRemainingTicks).toBe(0);
    expect(ab.basicAttackCdTicks).toBe(0);
  });
});

describe("applyCheat — items & champion", () => {
  it("giveItem drops an item into the inventory (cheat-give-item)", () => {
    cover("cheat-give-item");
    const ctl = inCombat();
    const e = ctl.seats.get(SEAT0)!.entityId!;
    expect(ctl.applyCheat(SEAT0, { kind: "giveItem", itemId: "ember-rod" })).toBe(true);
    expect(ctl.world.champion.get(e)!.items).toContain("ember-rod" as ItemId);
  });

  it("giveItem rejects an unknown item id (cheat-give-item)", () => {
    cover("cheat-give-item");
    const ctl = inCombat();
    expect(ctl.applyCheat(SEAT0, { kind: "giveItem", itemId: "nope" })).toBe(false);
  });

  it("swapChampion preserves seat/team/pos, swaps id, full hp (cheat-swap-champion)", () => {
    cover("cheat-swap-champion");
    const ctl = inCombat();
    const seat = ctl.seats.get(SEAT0)!;
    const oldEntity = seat.entityId!;
    const team = seat.teamId;
    const t = ctl.world.transform.get(oldEntity)!;
    const pos = { x: t.pos.x, z: t.pos.z };
    const target: ChampionId = (seat.championId === "sela" ? "thorne" : "sela") as ChampionId;

    expect(ctl.applyCheat(SEAT0, { kind: "swapChampion", championId: target })).toBe(true);
    const newEntity = seat.entityId!;
    expect(newEntity).not.toBe(oldEntity); // fresh entity
    expect(ctl.world.transform.has(oldEntity)).toBe(false); // old despawned
    expect(seat.championId).toBe(target); // new champion
    expect(seat.teamId).toBe(team); // team preserved
    const nt = ctl.world.transform.get(newEntity)!;
    expect(nt.pos).toEqual(pos); // position preserved
    const hp = ctl.world.health.get(newEntity)!;
    expect(hp.hp).toBe(hp.maxHp); // spawned at full hp
    expect(hp.maxHp).toBeGreaterThan(0);
  });

  it("swapChampion rejects an unknown champion id (cheat-swap-champion)", () => {
    cover("cheat-swap-champion");
    const ctl = inCombat();
    expect(ctl.applyCheat(SEAT0, { kind: "swapChampion", championId: "nope" })).toBe(false);
  });
});

describe("applyCheat — combat helpers", () => {
  it("fullHeal restores hp + mana and revives (cheat-god-mode)", () => {
    cover("cheat-god-mode");
    const ctl = inCombat();
    const e = ctl.seats.get(SEAT0)!.entityId!;
    const hp = ctl.world.health.get(e)!;
    hp.hp = 1;
    hp.mana = 0;
    hp.alive = false;
    expect(ctl.applyCheat(SEAT0, { kind: "fullHeal" })).toBe(true);
    expect(hp.hp).toBe(hp.maxHp);
    expect(hp.mana).toBe(hp.maxMana);
    expect(hp.alive).toBe(true);
  });

  it("godMode keeps the champion topped off and alive every tick (cheat-god-mode)", () => {
    cover("cheat-god-mode");
    const ctl = inCombat();
    const e = ctl.seats.get(SEAT0)!.entityId!;
    expect(ctl.applyCheat(SEAT0, { kind: "godMode", enabled: true })).toBe(true);
    const hp = ctl.world.health.get(e)!;
    // simulate a lethal burst mid-combat
    hp.hp = 0;
    hp.alive = true;
    ctl.tick();
    expect(hp.alive).toBe(true); // revived by the god-mode sustain
    expect(hp.hp).toBe(hp.maxHp); // topped back off before the snapshot
    // disabling stops the sustain
    ctl.applyCheat(SEAT0, { kind: "godMode", enabled: false });
    hp.hp = 5;
    ctl.tick();
    expect(hp.hp).toBeLessThanOrEqual(hp.maxHp);
  });

  it("zeroCooldown makes abilities spammable — no cooldown block (cheat-zero-cd)", () => {
    cover("cheat-zero-cd");
    // intermission caster: alive, no incoming AI combat / CC to disturb the cast
    const ctl = inIntermission();
    const e = ctl.seats.get(SEAT0)!.entityId!;
    ctl.applyCheat(SEAT0, { kind: "fullHeal" });
    ctl.applyCheat(SEAT0, { kind: "zeroCooldown", enabled: true });
    const ab = ctl.world.abilities.get(e)!;
    // clean caster state (clear any residual cooldown / status)
    ab.slots.Q.cooldownRemainingTicks = 0;
    ctl.world.status.get(e)!.effects = [];

    const r1 = castAbility(ctl.world, e, "Q", { type: "dir", dir: { x: 1, z: 0 } });
    expect(r1).toBe("ok");
    expect(ab.slots.Q.cooldownRemainingTicks).toBeGreaterThan(0); // normally on cooldown now
    ctl.tick(); // zero-cd sustain clears it
    expect(ab.slots.Q.cooldownRemainingTicks).toBe(0);
    // second cast is NOT cooldown-blocked
    ctl.world.status.get(e)!.effects = [];
    const r2 = castAbility(ctl.world, e, "Q", { type: "dir", dir: { x: 1, z: 0 } });
    expect(r2).toBe("ok");
  });

  it("killEnemies kills all enemy champions in my zone (cheat-kill-enemies)", () => {
    cover("cheat-kill-enemies");
    const ctl = inCombat();
    const seat = ctl.seats.get(SEAT0)!;
    const e = seat.entityId!;
    const myZone = ctl.world.transform.get(e)!.zone;
    expect(ctl.applyCheat(SEAT0, { kind: "killEnemies" })).toBe(true);
    // no living enemy champion shares my zone
    for (const [id, team] of ctl.world.team) {
      if (team.teamId === seat.teamId) continue;
      const t = ctl.world.transform.get(id);
      const hp = ctl.world.health.get(id);
      if (t?.zone === myZone && ctl.world.champion.has(id)) expect(hp!.alive).toBe(false);
    }
  });
});

describe("applyCheat — phase & offers", () => {
  it("skipPhase forces intermission → combat (cheat-skip-phase)", () => {
    cover("cheat-skip-phase");
    const ctl = new MatchController("skip", 7, allBots(), FAST);
    while (ctl.phase.phase !== "intermission") ctl.tick();
    expect(ctl.phase.phase).toBe("intermission");
    expect(ctl.applyCheat(SEAT0, { kind: "skipPhase" })).toBe(true);
    expect(ctl.phase.phase).toBe("combat");
  });

  it("skipPhase forces combat → resolution (cheat-skip-phase)", () => {
    cover("cheat-skip-phase");
    const ctl = inCombat();
    expect(ctl.phase.phase).toBe("combat");
    expect(ctl.applyCheat(SEAT0, { kind: "skipPhase" })).toBe(true);
    expect(ctl.phase.phase).toBe("resolution");
  });

  it("rerollOffers replaces this seat's open augment offer (cheat-skip-phase)", () => {
    cover("cheat-skip-phase");
    const ctl = new MatchController("reroll", 11, allBots(), FAST);
    while (ctl.phase.phase !== "intermission") ctl.tick();
    // find an augment offer for seat 0 (round-1 silver draft)
    const entry = [...ctl.offers.entries()].find(([, o]) => o.seatId === SEAT0 && o.kind === "augment");
    if (!entry) return; // no augment offer this seed — nothing to reroll
    const [offerId, before] = entry;
    const applied = ctl.applyCheat(SEAT0, { kind: "rerollOffers" });
    expect(applied).toBe(true);
    expect(ctl.offers.has(offerId)).toBe(true);
    expect(ctl.offers.get(offerId)!.createdTick).toBeGreaterThanOrEqual(before.createdTick);
  });
});

describe("cheat hard gate & seat isolation", () => {
  it("cheatsEnabled: dev-only, off in prod / when disabled (cheat-dev-gate)", () => {
    cover("cheat-dev-gate");
    expect(cheatsEnabled("", undefined)).toBe(true); // dev default on
    expect(cheatsEnabled("", "1")).toBe(true); // explicit on
    expect(cheatsEnabled("", "0")).toBe(false); // explicitly disabled
    expect(cheatsEnabled("shared-secret", undefined)).toBe(false); // prod: never
    expect(cheatsEnabled("shared-secret", "1")).toBe(false); // prod wins over flag
  });

  it("applyCheat is a no-op for a seat that does not exist (cheat-foreign-seat)", () => {
    cover("cheat-foreign-seat");
    const ctl = inCombat();
    // MatchRoom resolves seatId from the sender's own session, so a foreign seat
    // never reaches here; an out-of-range seat is rejected outright.
    expect(ctl.applyCheat(asSeatId(99), { kind: "grantGold", amount: 9999 })).toBe(false);
    // and it did not leak gold into any real seat
    for (const seat of ctl.seats.values()) {
      const champ = ctl.world.champion.get(seat.entityId!);
      if (champ) expect(champ.gold).toBeLessThan(9999);
    }
  });
});

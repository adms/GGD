/**
 * 殭屍王 ON THE WIRE (task #262) — the failure-shape-② guard.
 *
 * The sim can summon a king, run its damage ledger and split a 3,000g bounty
 * perfectly, and a player will still see NOTHING unless two separate wires
 * carry it:
 *
 *   1. THE ENTITY. `EntityState` has no radius, no scale and no kind sub-type —
 *      `key` (the model doc id) is the ONE field that distinguishes a king from
 *      a zombie on screen. If `snapshot.ts` resolves the wave's model key for
 *      every mob (which it did before #262), a 6,000 hp king renders as an
 *      ordinary zombie and 「它要看得出來」 is silently false.
 *   2. THE EVENTS. `FANNED_OUT_EVENT_TYPES` is a hard allowlist and the only
 *      path from a sim emit to a socket. A name missing from it fails SILENTLY:
 *      the sim emits, the client has a handler, nothing errors, and the feature
 *      never happens in a real match (docs/_false-completions.md).
 *
 * `eventFanout.test.ts` already proves every emit is CLASSIFIED. It cannot
 * prove a given event was classified the RIGHT way — a `mobBossSlain` parked in
 * `SERVER_ONLY_EVENT_TYPES` passes that suite and ships a dead feature. This
 * file names the two events and demands they be FANNED OUT.
 */
import { describe, expect, it } from "vitest";
import { Encoder, Decoder } from "@colyseus/schema";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";
import { MatchState, ENTITY_KIND } from "@ggd/shared/protocol/schema";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";
import { mobRulesFromConfig, summonMobBoss, spawnMob, mobModelKeyFor } from "@ggd/shared/sim/mobs";
import { beginCombatMobs } from "@ggd/shared/sim/systems/MobSystem";
import { isFannedOutEvent, FANNED_OUT_EVENT_TYPES, SERVER_ONLY_EVENT_TYPES } from "./eventFanout";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const DT = 1 / 30;

describe("殭屍王 events reach a socket", () => {
  it("mobBossSpawn + mobBossSlain are FANNED OUT, not parked as server-only", () => {
    cover("mob-boss-fanout");
    for (const name of ["mobBossSpawn", "mobBossSlain"]) {
      // through the REAL predicate the room calls, with a real event shape —
      // not just a set lookup, so a future gate added inside it is covered too
      const ev = { type: name, tick: 0, data: {} };
      expect(isFannedOutEvent(ev), `${name} would never reach a client`).toBe(true);
      expect(FANNED_OUT_EVENT_TYPES.has(name)).toBe(true);
      // …and NOT also in the server-only set, which would make the two lists
      // disagree about the same name.
      expect(SERVER_ONLY_EVENT_TYPES.has(name)).toBe(false);
    }
  });
});

describe("殭屍王 / 特殊殭屍 are visually distinct on the wire", () => {
  it("the snapshot sends a DIFFERENT model key per mob kind", () => {
    cover("mob-boss-wire");
    const ctl = new MatchController(
      "boss-wire",
      3,
      Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
      FAST,
    );
    while (ctl.phase.phase !== "combat") ctl.tick();
    ctl.tick();

    // Arm with the SHIPPED block (failure shape ⑤: test the thing that ships),
    // forcing every wave spawn to be a 特殊殭屍 so all three kinds are present.
    const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
    const w = ctl.world;
    const zone = 0;
    beginCombatMobs(w, { ...rules, special: { ...rules.special!, chance: 0 } }, [zone]);
    const normal = spawnMob(w, zone, { ...rules, special: { ...rules.special!, chance: 0 } }, 1, 0);
    const special = spawnMob(w, zone, { ...rules, special: { ...rules.special!, chance: 1 } }, 1, 1);
    const king = summonMobBoss(w, zone, rules, normal, 100)!;
    w.mobRules = rules;
    expect(w.mob.get(normal)!.kind).toBe("normal");
    expect(w.mob.get(special)!.kind).toBe("special");
    expect(w.mob.get(king)!.kind).toBe("boss");

    const state = new MatchState();
    const encoder = new Encoder(state);
    projectSnapshot(ctl, state, new Map());
    const decoded = new MatchState();
    new Decoder(decoded).decode(encoder.encodeAll());

    const key = (id: number): string => {
      const es = decoded.entities.get(String(id));
      expect(es, `entity ${id} never reached the wire`).toBeDefined();
      expect(es!.kind).toBe(ENTITY_KIND.MOB);
      return es!.key;
    };
    const keys = [key(normal), key(special), key(king)];
    // THE ASSERTION THAT DISTINGUISHES THE TWO IMPLEMENTATIONS: the pre-#262
    // encoder resolved `world.mobRules.modelKey` for every mob, so all three of
    // these would be the same string and this set would have size 1.
    expect(new Set(keys).size).toBe(3);
    // and each one is the key the sim's own resolver names, so the wire and the
    // sim cannot drift apart.
    expect(keys).toEqual([
      mobModelKeyFor(rules, "normal"),
      mobModelKeyFor(rules, "special"),
      mobModelKeyFor(rules, "boss"),
    ]);

    // The king's HP also rides along, so a neutral health bar can render 6,000
    // rather than a zombie's 200 — the other half of 「看得出來這是王」.
    expect(decoded.entities.get(String(king))!.maxHp).toBe(rules.boss!.maxHp);
    expect(decoded.entities.get(String(king))!.maxHp).toBeGreaterThan(
      decoded.entities.get(String(normal))!.maxHp,
    );
  });
});

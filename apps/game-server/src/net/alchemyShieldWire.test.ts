/**
 * 鍊金術之盾 (godie-i06q) ON THE WIRE —— the half `eventFanout.test.ts` cannot
 * express, and the half the two new effects shipped WITHOUT.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG, SO THIS FILE IS NOT MISTAKEN FOR DECORATION
 *
 * `sim/effects/taunt.ts` and `sim/effects/grantGold.ts` landed with a
 * `world.emit` each and NOTHING ELSE: neither name was in `FANNED_OUT_EVENT_TYPES`
 * nor in `SERVER_ONLY_EVENT_TYPES`, so `isFannedOutEvent` returned false and both
 * were dropped in silence before MatchRoom broadcast. taunt.ts:99 says in as many
 * words 「② THE PLAYER MUST BE ABLE TO SEE IT」 — and the player could not.
 * CLAUDE.md 失敗形態 ②, verbatim.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT THE SAME TEST AS `eventFanout.test.ts`
 *
 * That file proves every emitted name is CLASSIFIED. Classification is satisfied
 * just as well by parking a name in the server-only set, which would leave the
 * feature exactly as invisible as it was — 「a classified event nobody renders is
 * the same defect one layer later」. So this file pins the DIRECTION (both cross
 * the wire) and, more importantly, the PAYLOAD SHAPE the client consumer reads.
 *
 * ⚠️ THE PAYLOADS HERE ARE NOT HAND-WRITTEN. Both are produced by running the
 * REAL effect handlers through the REAL `runEffects`, because a guard that
 * invents its own `{ source, count }` object stays green forever after the emit
 * site renames the field — failure shape ⑤, which is exactly how the 變身 FORM
 * bits sat green while never being written. What this file asserts is what the
 * sim really put on the bus.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHAT IT DELIBERATELY DOES NOT COVER
 *
 * The bodies here are bare `world.spawn()` entities, not champions. That is
 * enough and it is honest: `grantGold` emits UNCONDITIONALLY after calling
 * `economy/progression.grantGold` (which no-ops on a non-champion), so the
 * payload is bit-identical either way, and `taunt` without a `radius` resolves
 * straight from `ctx.targets` and never touches the broad phase. The SHIPPED
 * card — real doc off disk, real `grantItemFree`, real hooks, real 10 % roll —
 * is covered by `packages/shared/src/sim/alchemyShieldShipped.test.ts`; this
 * file is about the wire, not about the card.
 */
import { describe, expect, it } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { SimEvent } from "@ggd/shared/sim/SimWorld";
import { FANNED_OUT_EVENT_TYPES, SERVER_ONLY_EVENT_TYPES, isFannedOutEvent } from "./eventFanout";

const TAG = "taunt-forced-targeting";

/** Run one authored effect on a throwaway world and hand back what it emitted. */
function emitted(effect: Record<string, unknown>, targets: number[] = []): SimEvent[] {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  const caster = world.spawn();
  const bodies = targets.map(() => world.spawn());
  world.events.length = 0;
  runEffects([effect as never], {
    world,
    caster,
    rank: 1,
    targets: bodies,
    origin: "item:godie-i06q",
    rng: world.rng,
  });
  return [...world.events];
}

describe("鍊金術之盾 — the two new sim events actually reach a client", () => {
  it("嘲弄 crosses the wire (it has no other channel at all)", () => {
    cover(TAG);
    // `world.taunt` is a sim-side Map: no snapshot field, no ENTITY_FLAG bit
    // (sim/taunt.ts DECISION 1). If this event is filtered out there is NOTHING
    // left — the pull becomes enemies inexplicably changing their minds.
    const evs = emitted({ kind: "taunt", durationSec: 1 }, [0]);
    const taunt = evs.find((e) => e.type === "taunt");
    expect(taunt, "the taunt effect emitted nothing — the rest of this file is vacuous").toBeDefined();
    expect(isFannedOutEvent(taunt!), "嘲弄 is dropped before MatchRoom broadcast").toBe(true);
    expect(SERVER_ONLY_EVENT_TYPES.has("taunt")).toBe(false);
  });

  it("煉金術's payout crosses the wire", () => {
    cover(TAG);
    const evs = emitted({ kind: "grantGold", flat: 12, to: "self" });
    const gold = evs.find((e) => e.type === "goldGrant");
    expect(gold, "the grantGold effect emitted nothing — the rest of this file is vacuous").toBeDefined();
    expect(isFannedOutEvent(gold!), "the payout is dropped before MatchRoom broadcast").toBe(true);
    expect(SERVER_ONLY_EVENT_TYPES.has("goldGrant")).toBe(false);
  });

  /**
   * THE FIELD NAMES, READ OFF THE REAL EMIT.
   *
   * `MatchRoom`/`ReplayRoom` forward `ev.data` WHOLE and unchanged, so a rename
   * at the emit site does not error anywhere: the event still arrives, the
   * client's `ev.data.source` is `undefined`, and `VfxSystem` silently draws
   * nothing. That is strictly WORSE than the event never crossing, because the
   * feature still looks done. These two assertions are the pair to
   * `apps/client/src/vfx/VfxSystem.alchemyShield.test.ts`, which proves the
   * consumer anchors on exactly these names.
   */
  it("嘲弄 carries the taunter and the pull count, under those names", () => {
    cover(TAG);
    const taunt = emitted({ kind: "taunt", durationSec: 1 }, [0, 0])
      .find((e) => e.type === "taunt")!;
    const data = taunt.data as Record<string, unknown>;
    // `source` is the TAUNTER's entity id — the only body the client can anchor
    // on, because the pulled ids are not on this payload at all.
    expect(typeof data.source, "VfxSystem anchors the ring on `source`").toBe("number");
    expect((data.source as number) > 0).toBe(true);
    // `count` is how many were really pulled, not how many were considered.
    expect(data.count).toBe(2);
    expect(data.durationSec).toBe(1);
  });

  it("煉金術 carries the PAYEE as `target`, and the rounded amount", () => {
    cover(TAG);
    const gold = emitted({ kind: "grantGold", flat: 12, to: "self" })
      .find((e) => e.type === "goldGrant")!;
    const data = gold.data as Record<string, unknown>;
    // ⚠️ `target` is the PAYEE, NOT the transmuted victim — grantGold.ts loops
    // over `payees`. A consumer that read it as 「the enemy」 would draw the
    // burst on the wrong body, and nothing would ever say so.
    expect(typeof data.target, "VfxSystem anchors the burst on `target`").toBe("number");
    expect(data.amount).toBe(12);
    expect(data.origin).toBe("item:godie-i06q");
  });

  it("neither name was parked in the server-only set to silence the classifier", () => {
    cover(TAG);
    // The cheap way to make `eventFanout.test.ts` green is to add both names to
    // SERVER_ONLY_EVENT_TYPES, which passes every check in that file and ships
    // the exact defect it was written to catch. Pin the direction explicitly.
    for (const name of ["taunt", "goldGrant"]) {
      expect(FANNED_OUT_EVENT_TYPES.has(name), `${name} must be fanned out`).toBe(true);
      expect(SERVER_ONLY_EVENT_TYPES.has(name), `${name} must not be server-only`).toBe(false);
    }
  });
});

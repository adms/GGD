/**
 * sec-input-01..: the Colyseus INPUT ingress validator.
 *
 * The headline finding: a client-supplied prototype-name slot/itemSlot
 * ('__proto__','constructor','toString',…) indexes a truthy Object/Array
 * prototype member instead of undefined, slips past the not-learned guard, and
 * reaches Abilities.get(undefined) / Items.get(Array.prototype), which THROW —
 * and the task-#46 tick catch turns that throw into a full-room disconnect (a
 * one-message DoS for all 6-12 players). These tests prove BOTH halves:
 *   • the raw malicious command DOES throw when fed straight to the sim (the
 *     vulnerability is real), and
 *   • sanitizeInputMessage DROPS it, so the sanitized frame does NOT throw.
 * Plus the payload-shape rules: unknown kinds, out-of-range slots, non-finite
 * coords, and oversized command lists.
 */
import { describe, it, expect } from "vitest";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { commandSystem } from "@ggd/shared/sim/systems/CommandSystem";
import { Champions } from "@ggd/shared/sim/content/registry";
import { asSeatId, asTeamId, type SeatId } from "@ggd/shared/ids";
import type { IntentFrame } from "@ggd/shared/sim/intents";
import {
  sanitizeInputMessage,
  sanitizeCommand,
  MAX_COMMANDS_PER_MESSAGE,
} from "./validateInput";

const SEAT = asSeatId(0);

/** A one-champion world where seat 0 has a spawned, alive champion. */
function worldWithChampion(): SimWorld {
  registerSkeletonContent();
  const world = new SimWorld(SKELETON_ARENA, 12345);
  const championId = Champions.ids()[0]!;
  spawnChampion(world, {
    championId,
    seatId: SEAT,
    teamId: asTeamId(0),
    pos: { x: 0, z: 0 },
    zone: 0,
  });
  world.economyOpen = true; // shop open so sellItem is actually reached
  return world;
}

function frameOf(commands: unknown[]): Map<SeatId, IntentFrame> {
  return new Map<SeatId, IntentFrame>([[SEAT, { commands: commands as never } as IntentFrame]]);
}

describe("INPUT validator — prototype-key injection (sec-input-01)", () => {
  it("RAW malicious castAbility slot='constructor' DOES throw in the sim (vuln is real)", () => {
    const world = worldWithChampion();
    const raw = [{ kind: "castAbility", slot: "constructor", target: { type: "self" } }];
    expect(() => commandSystem(world, frameOf(raw))).toThrow();
  });

  it("SANITIZED castAbility slot='constructor' is dropped, so the sim does NOT throw", () => {
    const world = worldWithChampion();
    const safe = sanitizeInputMessage({
      seq: 1,
      commands: [{ kind: "castAbility", slot: "constructor", target: { type: "self" } }],
    });
    expect(safe.commands ?? []).toHaveLength(0);
    expect(() => commandSystem(world, frameOf(safe.commands ?? []))).not.toThrow();
  });

  it("RAW malicious sellItem itemSlot='__proto__' DOES throw; sanitized is dropped", () => {
    const worldRaw = worldWithChampion();
    expect(() =>
      commandSystem(worldRaw, frameOf([{ kind: "sellItem", itemSlot: "__proto__" }])),
    ).toThrow();

    const worldSafe = worldWithChampion();
    const safe = sanitizeInputMessage({ seq: 1, commands: [{ kind: "sellItem", itemSlot: "__proto__" }] });
    expect(safe.commands ?? []).toHaveLength(0);
    expect(() => commandSystem(worldSafe, frameOf(safe.commands ?? []))).not.toThrow();
  });

  it("RAW malicious rankUpAbility slot='toString' DOES throw (with a point to spend); sanitized is dropped", () => {
    const worldRaw = worldWithChampion();
    // give a point so rankUpAbility proceeds to the Abilities.get(undefined) throw
    for (const ab of worldRaw.abilities.values()) ab.unspentPoints = 1;
    expect(() =>
      commandSystem(worldRaw, frameOf([{ kind: "rankUpAbility", slot: "toString" }])),
    ).toThrow();

    const worldSafe = worldWithChampion();
    for (const ab of worldSafe.abilities.values()) ab.unspentPoints = 1;
    const safe = sanitizeInputMessage({ seq: 1, commands: [{ kind: "rankUpAbility", slot: "toString" }] });
    expect(safe.commands ?? []).toHaveLength(0);
    expect(() => commandSystem(worldSafe, frameOf(safe.commands ?? []))).not.toThrow();
  });

  it("every prototype-name slot is rejected by sanitizeCommand", () => {
    for (const slot of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
      expect(sanitizeCommand({ kind: "castAbility", slot, target: { type: "self" } })).toBeUndefined();
      expect(sanitizeCommand({ kind: "rankUpAbility", slot })).toBeUndefined();
    }
  });
});

describe("INPUT validator — command shape rules (sec-input-02)", () => {
  it("keeps a well-formed cast with a whitelisted slot and valid target", () => {
    const cmd = sanitizeCommand({ kind: "castAbility", slot: "Q", target: { type: "self" } });
    expect(cmd).toEqual({ kind: "castAbility", slot: "Q", target: { type: "self" } });
  });

  it("accepts every real ability slot incl. EX", () => {
    for (const slot of ["Q", "W", "E", "R", "EX"]) {
      expect(sanitizeCommand({ kind: "castAbility", slot, target: { type: "self" } })).toBeTruthy();
    }
  });

  it("drops an unknown command kind", () => {
    expect(sanitizeCommand({ kind: "dropTable", itemSlot: 0 })).toBeUndefined();
    expect(sanitizeCommand({ kind: "__proto__" })).toBeUndefined();
    expect(sanitizeCommand(null)).toBeUndefined();
    expect(sanitizeCommand("ready")).toBeUndefined();
  });

  it("rejects out-of-range / non-integer item slots", () => {
    for (const itemSlot of [-1, 6, 999, 1.5, "0", NaN, Infinity, null]) {
      expect(sanitizeCommand({ kind: "sellItem", itemSlot })).toBeUndefined();
      expect(sanitizeCommand({ kind: "useItem", itemSlot })).toBeUndefined();
    }
    // in-range slots survive
    expect(sanitizeCommand({ kind: "sellItem", itemSlot: 0 })).toEqual({ kind: "sellItem", itemSlot: 0 });
    expect(sanitizeCommand({ kind: "sellItem", itemSlot: 5 })).toEqual({ kind: "sellItem", itemSlot: 5 });
  });

  it("rejects non-finite coordinates in cast targets and orders", () => {
    expect(
      sanitizeCommand({ kind: "castAbility", slot: "Q", target: { type: "point", point: { x: NaN, z: 0 } } }),
    ).toBeUndefined();
    expect(
      sanitizeCommand({ kind: "castAbility", slot: "Q", target: { type: "dir", dir: { x: Infinity, z: 1 } } }),
    ).toBeUndefined();
    // a valid order kind survives but the non-finite point is stripped, so no
    // NaN ever reaches the sim (the coordinate simply does not appear).
    const msg = sanitizeInputMessage({ seq: 1, order: { kind: "move", point: { x: NaN, z: 5 } } });
    expect(msg.order).toEqual({ kind: "move" });
    expect(msg.order?.point).toBeUndefined();
    const ok = sanitizeInputMessage({ seq: 1, order: { kind: "move", point: { x: 3, z: 5 } } });
    expect(ok.order).toEqual({ kind: "move", point: { x: 3, z: 5 } });
    // an unknown order kind is dropped entirely
    expect(sanitizeInputMessage({ seq: 1, order: { kind: "teleport" } }).order).toBeUndefined();
  });

  it("rejects a negative / non-integer entity id target", () => {
    expect(
      sanitizeCommand({ kind: "castAbility", slot: "Q", target: { type: "entity", entityId: -3 } }),
    ).toBeUndefined();
    expect(
      sanitizeCommand({ kind: "castAbility", slot: "Q", target: { type: "entity", entityId: 7 } }),
    ).toEqual({ kind: "castAbility", slot: "Q", target: { type: "entity", entityId: 7 } });
  });

  it("bounds content-id string length (buyItem / pickOffer)", () => {
    const huge = "x".repeat(5000);
    expect(sanitizeCommand({ kind: "buyItem", itemId: huge })).toBeUndefined();
    expect(sanitizeCommand({ kind: "buyItem", itemId: "" })).toBeUndefined();
    expect(sanitizeCommand({ kind: "buyItem", itemId: "sword" })).toEqual({ kind: "buyItem", itemId: "sword" });
    expect(sanitizeCommand({ kind: "pickOffer", offerId: huge })).toBeUndefined();
  });
});

describe("INPUT validator — oversized payloads (sec-input-03)", () => {
  it("truncates a giant commands[] to MAX_COMMANDS_PER_MESSAGE", () => {
    const commands = Array.from({ length: 1_000_000 }, () => ({ kind: "ready" }));
    const safe = sanitizeInputMessage({ seq: 1, commands });
    expect(safe.commands).toBeDefined();
    expect(safe.commands!.length).toBeLessThanOrEqual(MAX_COMMANDS_PER_MESSAGE);
  });

  it("a malformed / missing payload becomes a harmless no-op", () => {
    expect(sanitizeInputMessage(null)).toEqual({ seq: 0, commands: [] });
    expect(sanitizeInputMessage(undefined)).toEqual({ seq: 0, commands: [] });
    expect(sanitizeInputMessage(42)).toEqual({ seq: 0, commands: [] });
    expect(sanitizeInputMessage({ seq: -5 }).seq).toBe(0);
    expect(sanitizeInputMessage({ seq: 70000 }).seq).toBe(0);
  });
});

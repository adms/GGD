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
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "@ggd/shared/ids";
import type { IntentFrame } from "@ggd/shared/sim/intents";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
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
  // WAS: "RAW malicious castAbility slot='constructor' DOES throw (vuln is real)".
  // The sim layer has since been hardened — `abilityInstanceFor`
  // (packages/shared/src/sim/abilities/innateActive.ts) compares the slot name
  // against the known slots instead of indexing a Record with it, so a
  // prototype key now resolves to undefined and the command is reported
  // not-learned rather than crashing the room.
  //
  // That makes the OLD assertion (a throw) false, but it does NOT make this
  // test pointless: the ingress validator is still the outer layer of a
  // defence in depth, and the property worth pinning is now the stronger one —
  // a prototype-key slot reaching the sim RAW is INERT: it does not throw (no
  // room-wide disconnect via the #46 tick catch) and it casts nothing.
  it("RAW castAbility slot='constructor' is inert in the sim: no throw, no cast", () => {
    const world = worldWithChampion();
    const raw = [{ kind: "castAbility", slot: "constructor", target: { type: "self" } }];
    expect(() => commandSystem(world, frameOf(raw))).not.toThrow();
    // Nothing was cast: the sim's rng stream is untouched, so a malicious
    // client cannot even perturb determinism with this.
    const before = new SimWorld(SKELETON_ARENA, 12345).rng.state;
    expect(world.rng.state).toBe(before);
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

  it("RAW malicious sellItem itemSlot='__proto__' is now REFUSED by the sim too; sanitized is still dropped", () => {
    // ⚠️ 這一條的上半段在 2026-08-17 之前是 `.toThrow()` —— 它刻意證明「原始惡意
    // 指令真的會炸」，好說明入口清洗器不是裝飾。那個 throw 來自 `Items.get(Array.prototype)`。
    //
    // 賣價改成「取得價 × 退款率」之後那句 `Items.get` 不再需要而被拿掉，於是這條
    // 路**不再丟例外** —— 但它也不再安全：它會走到 `champ.items["__proto__"] = null`，
    // 把背包陣列的原型拔掉，而且靜悄悄的。⇒ `sellItem` 現在自己擋整數索引。
    //
    // 所以這一條改成守**更強**的性質：不是「它會炸」，而是「它什麼都不會做」——
    // ⛔ 不丟例外、⛔ 不動金幣、⛔ 不動背包。入口清洗器那一層一個字都沒放鬆。
    const worldRaw = worldWithChampion();
    const champ = [...worldRaw.champion.values()][0]!;
    const goldBefore = champ.gold;
    const itemsBefore = [...champ.items];
    expect(() =>
      commandSystem(worldRaw, frameOf([{ kind: "sellItem", itemSlot: "__proto__" }])),
    ).not.toThrow();
    expect(champ.gold, "惡意 slot 不可以生出金幣").toBe(goldBefore);
    expect([...champ.items], "惡意 slot 不可以動到背包").toEqual(itemsBefore);
    // 背包還是一個正常的陣列 —— 原型沒有被 `items["__proto__"] = null` 拔掉。
    expect(Array.isArray(champ.items)).toBe(true);
    expect(typeof champ.items.map).toBe("function");

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

  it("accepts a cast of the SIXTH slot — the innate the ingress used to eat", () => {
    // The sim had opened the 天生技 cast path end to end (CastableSlot,
    // abilityInstanceFor, the cooldown tick), but THIS validator still
    // whitelisted {Q,W,E,R,EX}, so a well-formed innate cast from a real client
    // was dropped right here — no throw, no log, no castRejected. 60 active
    // innates were unreachable one layer above the code that was ready.
    expect(sanitizeCommand({ kind: "castAbility", slot: "PASSIVE", target: { type: "self" } })).toEqual({
      kind: "castAbility",
      slot: "PASSIVE",
      target: { type: "self" },
    });
  });

  it("but the innate is still NOT rankable from the wire", () => {
    // 天生技 is owned at rank 1 from spawn and has no second column. Widening
    // the CAST alphabet must not have widened the RANK one.
    expect(sanitizeCommand({ kind: "rankUpAbility", slot: "PASSIVE" })).toBeUndefined();
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

/**
 * THE WHOLE CHAIN, once. Everything above tests one layer; this drives a
 * client-shaped INPUT payload through the ingress AND the sim and checks that
 * the innate actually DID something — damage on the wire's own target and a
 * cooldown armed on the sixth slot.
 *
 * It exists because the P0-3 failure was invisible at every single layer:
 * the sim accepted "PASSIVE", the client could name it, and the cast still
 * never happened, because the one validator between them dropped the command
 * without a word. A test that stops at "an intent was produced" or at
 * "castAbility returns ok" passes in exactly that broken world.
 */
describe("the SIXTH slot end to end — wire JSON → ingress → sim (P0-3)", () => {
  const INNATE_CHAMP = "test-innate-hero" as ChampionId;
  const INNATE_ID = "test-innate-hero.passive" as AbilityId;
  const VICTIM = asSeatId(1);

  /** Two enemy champions face to face; seat 0 owns an ACTIVE 天生技 (150 dmg). */
  function duelWorld(): { world: SimWorld; caster: EntityId; victim: EntityId } {
    registerSkeletonContent();
    const base = Champions.get(Champions.ids()[0]!);
    Abilities.register(INNATE_ID, {
      id: INNATE_ID,
      name: "22-00 嗚鎖打!",
      slot: "PASSIVE",
      innateKind: "active",
      // the real 22-00 shape: a ground AoE nuke, so the assertion below is
      // about an ENEMY losing hp, not about the caster nuking himself
      castType: "ground",
      maxRank: 1,
      cooldown: [40],
      manaCost: [0],
      range: 0,
      radius: 6,
      effects: [{ kind: "damage", damageType: "magic", amount: { flat: 150 } }],
    } as unknown as AbilityDef);
    Champions.register(INNATE_CHAMP, {
      ...base,
      id: INNATE_CHAMP,
      passiveAbility: INNATE_ID,
    } as unknown as ChampionDef);

    const world = new SimWorld(SKELETON_ARENA, 4242);
    const caster = spawnChampion(world, {
      championId: INNATE_CHAMP,
      seatId: SEAT,
      teamId: asTeamId(0),
      pos: { x: 0, z: 0 },
      zone: 0,
    });
    const victim = spawnChampion(world, {
      championId: Champions.ids()[0]!,
      seatId: VICTIM,
      teamId: asTeamId(1),
      pos: { x: 1, z: 0 },
      zone: 0,
    });
    return { world, caster, victim };
  }

  it("a raw INPUT payload naming PASSIVE really damages and really cools down", () => {
    const { world, caster, victim } = duelWorld();
    const hpBefore = world.health.get(victim)!.hp;

    // exactly what the client puts on the wire when D is pressed
    const msg = sanitizeInputMessage({
      seq: 1,
      commands: [
        { kind: "castAbility", slot: "PASSIVE", target: { type: "point", point: { x: 1, z: 0 } } },
      ],
    });
    expect(msg.commands).toHaveLength(1); // survived the ingress at all

    // world.step, not commandSystem alone: the real server ticks the whole
    // pipeline, and an AoE needs the broadphase grid that step() rebuilds.
    world.step(frameOf(msg.commands!));

    // the effect RAN — not "the command was accepted"
    expect(world.health.get(victim)!.hp).toBeLessThan(hpBefore);
    // and it paid a real cooldown on the sixth slot, not on Q
    const ab = world.abilities.get(caster)!;
    expect(ab.passiveSlot!.cooldownRemainingTicks).toBeGreaterThan(0);
    expect(ab.slots.Q.cooldownRemainingTicks).toBe(0);
  });

  it("the SAME payload did nothing before the ingress knew the slot", () => {
    // Re-creates the exact pre-fix behaviour with the old {Q,W,E,R,EX} rule, so
    // the test above can't quietly pass for some other reason.
    const { world, victim } = duelWorld();
    const hpBefore = world.health.get(victim)!.hp;
    const oldAllowed = new Set(["Q", "W", "E", "R", "EX"]);
    const raw = { kind: "castAbility", slot: "PASSIVE", target: { type: "point", point: { x: 1, z: 0 } } };
    const droppedByOldRule = !oldAllowed.has(raw.slot);
    expect(droppedByOldRule).toBe(true);

    world.step(frameOf([])); // what the sim received: nothing
    expect(world.health.get(victim)!.hp).toBe(hpBefore);
  });
});

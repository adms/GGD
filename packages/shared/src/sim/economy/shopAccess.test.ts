/**
 * The shop-access rule (task #38 gating contract). Pinned here rather than only
 * through the sim pipeline so the three-way phase behaviour — and specifically
 * 「本輪陣亡者到回合結束前還能買」 — is readable in one screen.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";
import { shopOpen, shopPhaseOf, type ShopAccess } from "./shopAccess";

const reasonOf = (a: ShopAccess): string | null => (a.open ? null : a.reason);

beforeAll(() => registerSkeletonContent());

function spawnBuyer(world: SimWorld): EntityId {
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z + 8 },
    zone: 0,
  });
  world.champion.get(id)!.gold = 5000;
  return id;
}

const buy = (itemId = "ember-rod"): Map<SeatId, IntentFrame> =>
  new Map([[asSeatId(0), { commands: [{ kind: "buyItem", itemId }] } as IntentFrame]]);

const rejectionsOf = (world: SimWorld): string[] =>
  world.events.filter((e) => e.type === "buyRejected").map((e) => String(e.data.reason));

describe("shopAccess rule", () => {
  it("prep is open to everyone, alive or not", () => {
    cover("shop-gate-prep");
    expect(shopOpen("prep", true).open).toBe(true);
    expect(shopOpen("prep", false).open).toBe(true);
  });

  it("combat closes the shop for a LIVING champion, with a reason", () => {
    cover("shop-gate-combat-alive");
    const res = shopOpen("combat", true);
    expect(res.open).toBe(false);
    expect(reasonOf(res)).toBe("combat-alive");
  });

  it("a champion DOWN this round keeps the shop during combat", () => {
    cover("shop-gate-defeated");
    expect(shopOpen("combat", false).open).toBe(true);
  });

  it("every other phase is closed to everyone", () => {
    cover("shop-gate-closed");
    for (const alive of [true, false]) {
      const res = shopOpen("closed", alive);
      expect(res.open).toBe(false);
      expect(reasonOf(res)).toBe("phase-closed");
    }
  });

  it("maps match phases onto the shop phase, unknown => closed", () => {
    cover("shop-gate-phase-map");
    expect(shopPhaseOf("intermission")).toBe("prep");
    expect(shopPhaseOf("combat")).toBe("combat");
    for (const p of ["champSelect", "resolution", "matchEnd", "connecting", ""]) {
      expect(shopPhaseOf(p)).toBe("closed");
    }
  });
});

describe("shop gate through the sim (server authority)", () => {
  it("a LIVING champion cannot buy mid-combat, and is TOLD why", () => {
    cover("shop-gate-server");
    const world = new SimWorld(SKELETON_ARENA, 42);
    const buyer = spawnBuyer(world);
    world.economyOpen = false;
    world.combatActive = true; // duel is live, buyer is standing
    world.step(buy());
    expect(world.champion.get(buyer)!.items.every((s) => s === null)).toBe(true);
    expect(rejectionsOf(world)).toEqual(["combat-alive"]);
  });

  it("a champion DOWN this round keeps buying until the round resolves", () => {
    cover("shop-gate-server");
    const world = new SimWorld(SKELETON_ARENA, 42);
    const buyer = spawnBuyer(world);
    world.economyOpen = false;
    world.combatActive = true;
    world.health.get(buyer)!.alive = false; // defeated this round
    world.step(buy());
    expect(world.champion.get(buyer)!.items[0]).toBe("ember-rod");
    expect(rejectionsOf(world)).toEqual([]);

    // the round ends (resolution): combat is over, so the window closes again
    world.combatActive = false;
    world.step(buy("ember-rod"));
    expect(rejectionsOf(world)).toEqual(["phase-closed"]);
  });

  it("surfaces every BuyResult instead of swallowing it (task #60)", () => {
    cover("shop-gate-reasons");
    const world = new SimWorld(SKELETON_ARENA, 42);
    const buyer = spawnBuyer(world);
    world.economyOpen = true;

    world.champion.get(buyer)!.gold = 0;
    world.step(buy());
    expect(rejectionsOf(world)).toEqual(["no-gold"]);

    world.step(buy("no-such-item"));
    expect(rejectionsOf(world)).toEqual(["unknown-item"]);

    // fill every inventory slot, then try once more
    world.champion.get(buyer)!.gold = 100_000;
    const champ = world.champion.get(buyer)!;
    champ.items.fill("ember-rod" as never);
    world.step(buy());
    expect(rejectionsOf(world)).toEqual(["no-slot"]);
  });
});

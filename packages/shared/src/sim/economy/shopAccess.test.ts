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
    // ⚠️ 2026-08-06：`resolution` **從這一列搬走了**，而那是刻意的行為改變，
    // 不是斷言鬆掉。它以前落在 `closed`，代價是剛被打倒的人在回合結算那一段
    // 買不到東西 —— 而 #208「只剩一隊存活就立即宣佈回合勝利」讓那常常就是他
    // 被打倒的同一瞬間。owner 的規則是「被打倒就可以買，被復活就不行」，所以
    // 結算改成與 combat 同一條規則。行為守衛在 `shopResolution.test.ts`。
    expect(shopPhaseOf("resolution")).toBe("resolution");
    for (const p of ["champSelect", "matchEnd", "connecting", ""]) {
      expect(shopPhaseOf(p)).toBe("closed");
    }
  });
});

describe("shop gate through the sim (server authority)", () => {
  it("a LIVING champion cannot buy mid-combat, and is TOLD why", () => {
    cover("shop-gate-server");
    const world = new SimWorld(SKELETON_ARENA, 42);
    // #261: these guards describe the rules that apply WHEN the weapon shelf is
    // open. The shelf being 暫時下架 today does not retire them — it takes the
    // weapons off sale — so the world is opened explicitly rather than deleting
    // the coverage that comes back the moment the owner flips the flag.
    world.weaponShelfOpen = true;
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
    // #261: these guards describe the rules that apply WHEN the weapon shelf is
    // open. The shelf being 暫時下架 today does not retire them — it takes the
    // weapons off sale — so the world is opened explicitly rather than deleting
    // the coverage that comes back the moment the owner flips the flag.
    world.weaponShelfOpen = true;
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
    // #261: these guards describe the rules that apply WHEN the weapon shelf is
    // open. The shelf being 暫時下架 today does not retire them — it takes the
    // weapons off sale — so the world is opened explicitly rather than deleting
    // the coverage that comes back the moment the owner flips the flag.
    world.weaponShelfOpen = true;
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

describe("a SPENT team still shops (shop-eliminated)", () => {
  /**
   * REVERSED BY THE OWNER, 2026-07-27. This block used to pin the opposite rule:
   * team health at 0 ended the match for that team — 「團隊生命已經沒了 整個遊戲
   * 都輸了 不是輸了回合」 — so the shop was denied with `team-eliminated`.
   *
   * The finale ruling removes elimination outright: 「不管前面被淘汰與否，大家都
   * 回來打第 10 回合」, 「繼續正常打，只是生命已經見底」, and a spent team keeps
   * taking its per-round gold, its 3-choose-1 and 照樣進商店. Denying it the shop
   * would hand it gold it could never spend — the same "shown a thing that does
   * not work" pathology as the original bug, pointed the other way.
   *
   * The parameter and the `team-eliminated` reason code survive because two files
   * in other lanes (`ui/panels/shopGate.ts`, `ui/panels/shopFeedback.ts`) pass and
   * map them; the rule no longer fires.
   */
  it("does NOT close the shop — the flag is accepted and ignored", () => {
    for (const phase of ["prep", "combat", "closed"] as const) {
      for (const alive of [true, false]) {
        // identical to the same call without the flag: 0 health changes nothing
        expect(shopOpen(phase, alive, true)).toEqual(shopOpen(phase, alive, false));
      }
    }
    // and concretely: an intermission shop is OPEN for a team on 0 team health
    expect(shopOpen("prep", true, true).open).toBe(true);
    expect(shopOpen("prep", false, true).open).toBe(true);
  });

  it("changes nothing for a team still in the match", () => {
    for (const phase of ["prep", "combat", "closed"] as const) {
      for (const alive of [true, false]) {
        expect(shopOpen(phase, alive, false)).toEqual(shopOpen(phase, alive));
      }
    }
  });
});

/**
 * 自身狀態效果真的上了線 — owner, 2026-07-27:
 *   「我也看不出來自己暈眩還是發生什麼事情，應該要有提示自己的負面/正面 buff」
 *
 * ⚠️ WHY THIS FILE EXISTS SEPARATELY FROM THE HUD TEST. `selfStatus.test.ts` on
 * the client feeds `selfStatusRows` its arrays directly. Every case there passes
 * with `projectSnapshot` NEVER FILLING THEM — which is precisely the bug that
 * was shipped: `StatusSystem` computed stuns for months and the wire carried
 * only `EntityState.flags` (four negative bits, no identity, no time), so the
 * HUD could not have drawn a status bar even if one had existed.
 *
 * That is this repo's failure shape ②, computed-but-never-delivered. It is
 * closed HERE, at the seam: a real status is put on a real world, the real
 * projection runs, and the SeatState is read back.
 */
import { describe, it, expect } from "vitest";
import { MatchState } from "@ggd/shared/protocol/schema";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";
import type { StatusId } from "@ggd/shared/ids";

const seats = Array.from({ length: 12 }, (_, i) => ({
  seatId: i,
  teamId: Math.floor(i / 3),
  isBot: true,
}));

function inCombat(): MatchController {
  const ctl = new MatchController("selfstatus", 4242, seats, {
    champSelectTicks: 5,
    intermissionTicks: 30,
    combatMaxTicks: 1200,
    resolutionTicks: 5,
  });
  while (ctl.phase.phase !== "combat") ctl.tick();
  ctl.tick();
  return ctl;
}

/** Attach a status to seat 0's champion, expiring `secs` from now. */
function stun(ctl: MatchController, id: string, secs: number): void {
  const seat = [...ctl.seats.values()][0]!;
  const eid = seat.entityId!;
  const comp = ctl.world.status.get(eid) ?? { effects: [] };
  comp.effects.push({
    statusId: id as StatusId,
    sourceId: "test",
    expiresAtTick: ctl.world.tick + Math.round(secs * 30),
    stun: true,
  });
  ctl.world.status.set(eid, comp);
}

function projectSeat0(ctl: MatchController): {
  ids: string[];
  remain: number[];
} {
  const state = new MatchState();
  projectSnapshot(ctl, state, new Map());
  const want = [...ctl.seats.values()][0]!.seatId;
  const ss = [...state.seats.values()].find((s) => s.seatId === want)!;
  return { ids: [...ss.statusIds], remain: [...ss.statusRemainTicks] };
}

describe("a status the sim applied reaches the seat on the wire", () => {
  it("an empty status component sends empty arrays, not junk", () => {
    const ctl = inCombat();
    const { ids, remain } = projectSeat0(ctl);
    expect(ids).toEqual([]);
    expect(remain).toEqual([]);
  });

  it("a live stun arrives with its id AND its remaining time", () => {
    // ⚠️ THE MUTATION THIS EXISTS FOR: delete the two `setArray` calls in
    // snapshot.ts. Every client-side test stays green; the player sees nothing.
    const ctl = inCombat();
    stun(ctl, "burnstun", 2);
    const { ids, remain } = projectSeat0(ctl);
    expect(ids).toEqual(["burnstun"]);
    expect(remain).toHaveLength(1);
    // ~2s at 30Hz, allowing for the tick the projection runs on
    expect(remain[0]).toBeGreaterThan(50);
    expect(remain[0]).toBeLessThanOrEqual(60);
  });

  it("the remaining time is RELATIVE — it counts down as the world ticks", () => {
    // An absolute expiry tick would be a number the client cannot interpret
    // (there is no serverTick on the wire). Asserted by watching it shrink.
    const ctl = inCombat();
    stun(ctl, "burnstun", 5);
    const first = projectSeat0(ctl).remain[0]!;
    for (let i = 0; i < 30; i++) ctl.tick();
    const later = projectSeat0(ctl).remain[0]!;
    expect(later, "the countdown is frozen — it is not relative").toBeLessThan(first - 20);
  });

  it("an EXPIRED status never rides the wire, not even for one snapshot", () => {
    // StatusSystem clears these on its own tick, but an effect that expires
    // between the sim step and the projection would otherwise flash a 0-second
    // icon at the player. Dropped at the seam instead.
    const ctl = inCombat();
    const seat = [...ctl.seats.values()][0]!;
    ctl.world.status.set(seat.entityId!, {
      effects: [
        { statusId: "burnstun" as StatusId, sourceId: "t", expiresAtTick: ctl.world.tick - 1, stun: true },
      ],
    });
    expect(projectSeat0(ctl).ids).toEqual([]);
  });

  it("the two arrays stay index-aligned with several effects", () => {
    const ctl = inCombat();
    stun(ctl, "burnstun", 3);
    stun(ctl, "slow30", 7);
    const { ids, remain } = projectSeat0(ctl);
    expect(ids).toHaveLength(2);
    expect(remain).toHaveLength(2);
    // the longer effect must carry the larger number — a swap here would put
    // 「3s」 on the 7-second slow and read as a broken timer
    const byId = new Map(ids.map((id, i) => [id, remain[i]!]));
    expect(byId.get("slow30")!).toBeGreaterThan(byId.get("burnstun")!);
  });

  it("ANOTHER seat's statuses never appear on yours", () => {
    // Per-seat by construction — 「自己身上的」. A leak would also hand a player
    // information about an enemy's cooldowns.
    const ctl = inCombat();
    const other = [...ctl.seats.values()][6]!;
    ctl.world.status.set(other.entityId!, {
      effects: [
        { statusId: "burnstun" as StatusId, sourceId: "t", expiresAtTick: ctl.world.tick + 90, stun: true },
      ],
    });
    expect(projectSeat0(ctl).ids).toEqual([]);
  });
});

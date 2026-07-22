/**
 * Headless smoke test — drives a real colyseus.js client against a locally
 * running game-server (dev mode, ws://localhost:2567):
 *   1. joinOrCreate("match") → seats/teams sync (12 seats, bot backfill)
 *   2. SELECT_CHAMPION sela → schema reflects the pick
 *   3. champSelect expires → champion entity spawns
 *   4. INPUT move order → authoritative position moves toward the target and
 *      SeatState.lastAckSeq acks the input seq
 * Exit 0 on success. Run: tsx apps/client/scripts/smoke.ts
 */
import { Client } from "colyseus.js";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { MSG } from "@ggd/shared/protocol/messages";

const ENDPOINT = process.env.GAME_WS ?? "ws://localhost:2567";
const ACCOUNT = `smoke-${Math.random().toString(36).slice(2, 8)}`;

function fail(msg: string): never {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exit(1);
}

async function waitFor(cond: () => boolean, what: string, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) fail(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`ok: ${what} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

async function main(): Promise<void> {
  const client = new Client(ENDPOINT);
  // fresh room for a deterministic phase sequence; reflection-based decode
  // (see net/RoomConnection.ts for why no rootSchema is passed)
  const room = await client.create<MatchState>("match", { accountId: ACCOUNT });
  console.log(`ok: joined room ${room.roomId} as ${ACCOUNT}`);

  let events = 0;
  room.onMessage(MSG.EVENT, () => events++);

  const state = (): MatchState => room.state;
  interface SeatInfo {
    seatId: number;
    championId: string;
    entityId: number;
    lastAckSeq: number;
  }
  const mySeat = (): SeatInfo | null => {
    let found: SeatInfo | null = null;
    if (!state()?.seats) return null;
    state().seats.forEach((s) => {
      if (s.accountId === ACCOUNT) {
        found = {
          seatId: s.seatId,
          championId: s.championId,
          entityId: s.entityId,
          lastAckSeq: s.lastAckSeq,
        };
      }
    });
    return found;
  };

  await waitFor(() => {
    if (!state()?.seats) return false;
    let n = 0;
    state().seats.forEach(() => n++);
    return n === 12 && mySeat() !== null;
  }, "12 seats synced + local seat resolved", 10_000);

  if (state().phase !== "champSelect") fail(`expected champSelect, got ${state().phase}`);

  room.send(MSG.SELECT_CHAMPION, { championId: "sela" });
  await waitFor(() => mySeat()?.championId === "sela", "champion pick reflected in schema", 5_000);

  await waitFor(() => (mySeat()?.entityId ?? 0) > 0, "champion entity spawned (champSelect over)", 30_000);

  const entityId = mySeat()!.entityId;
  const getPos = () => {
    const es = state()?.entities?.get(String(entityId));
    return es ? { x: es.x, z: es.z } : null;
  };
  await waitFor(() => getPos() !== null, "entity present in state.entities", 5_000);

  const before = getPos()!;
  const target = { x: before.x + 5, z: before.z + 3 };
  room.send(MSG.INPUT, { seq: 1, order: { kind: "move", point: target } });

  await waitFor(() => (mySeat()?.lastAckSeq ?? 0) === 1, "input seq acked (lastAckSeq=1)", 5_000);
  await waitFor(() => {
    const p = getPos();
    if (!p) return false;
    const moved = Math.hypot(p.x - before.x, p.z - before.z);
    const remaining = Math.hypot(target.x - p.x, target.z - p.z);
    return moved > 1 && remaining < Math.hypot(target.x - before.x, target.z - before.z);
  }, "authoritative movement toward the ordered point", 5_000);

  console.log(`ok: ${events} sim events fanned out so far`);
  await room.leave(true);
  console.log("SMOKE PASS");
  process.exit(0);
}

main().catch((err) => fail(String(err)));

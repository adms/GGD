import { describe, expect, it } from "vitest";
import { Decoder, Encoder, StateView, Metadata } from "@colyseus/schema";
import { MatchState, EntityState } from "@ggd/shared/protocol/schema";

describe("dbg", () => { it("per-item view", () => {
  const meta = (MatchState as unknown as Record<symbol, Record<string, unknown>>)[Symbol.metadata];
  console.log("entities meta:", JSON.stringify(meta?.["entities"]));
  const idx = (meta?.["entities"] as { index?: number } | undefined)?.index;
  console.log("entities index:", idx, "hasViewTagAtIndex:", idx !== undefined ? Metadata.hasViewTagAtIndex(meta as never, idx) : "n/a");
  const state = new MatchState();
  const enc = new Encoder(state);
  for (let i = 0; i < 4; i++) {
    const es = new EntityState();
    es.id = i; es.zone = i % 2;
    state.entities.set(String(i), es);
  }
  const v = new StateView();
  v.add(state.entities.get("0")! as never);
  const buf = Buffer.allocUnsafe(Encoder.BUFFER_SIZE);
  const shared = { offset: 1 };
  const sharedBytes = enc.encodeAll(shared, buf);
  const d0 = new Decoder(new MatchState());
  d0.decode(Buffer.from(sharedBytes), { offset: 1 });
  const ids0: number[] = []; d0.state.entities.forEach((e) => ids0.push(e.id));
  console.log("SHARED-only decoded ids", ids0);
  const bytes = enc.encodeAllView(v, shared.offset, { ...shared }, buf);
  const d = new Decoder(new MatchState());
  d.decode(bytes, { offset: 1 });
  const ids: number[] = []; d.state.entities.forEach((e) => ids.push(e.id));
  console.log("VIEW decoded ids", ids.sort());
  expect(true).toBe(true);
}); });

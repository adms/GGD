import { describe, expect, it } from "vitest";
import { Decoder, Encoder, StateView } from "@colyseus/schema";
import { MatchState, EntityState } from "@ggd/shared/protocol/schema";

describe("dbg", () => { it("per-item view", () => {
  const state = new MatchState();
  const enc = new Encoder(state);
  for (let i = 0; i < 4; i++) {
    const es = new EntityState();
    es.id = i; es.zone = i % 2;
    state.entities.set(String(i), es);
  }
  const v = new StateView();
  v.add(state.entities.get("0")! as never);
  v.add(state.entities.get("2")! as never);
  const buf = Buffer.allocUnsafe(Encoder.BUFFER_SIZE);
  const shared = { offset: 1 };
  enc.encodeAll(shared, buf);
  const bytes = enc.encodeAllView(v, shared.offset, { ...shared }, buf);
  const d = new Decoder(new MatchState());
  d.decode(bytes, { offset: 1 });
  const ids: number[] = [];
  d.state.entities.forEach((e) => ids.push(e.id));
  console.log("decoded ids", ids.sort());
  expect(true).toBe(true);
}); });

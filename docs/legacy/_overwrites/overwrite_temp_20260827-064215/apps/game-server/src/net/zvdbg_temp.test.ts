import { describe, expect, it } from "vitest";
import { Encoder, StateView } from "@colyseus/schema";
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
  const first = state.entities.get("0")!;
  v.add(first as never);
  const others = ["1","2","3"].map(k => state.entities.get(k)!);
  console.log("visible first:", v.isChangeTreeVisible((first as never as Record<symbol, never>)[Object.getOwnPropertySymbols(first).find(s=>String(s).includes("changes"))! ] as never));
  for (const o of others) {
    const sym = Object.getOwnPropertySymbols(o).find(s=>String(s).includes("changes"))!;
    console.log("visible other", (o as unknown as {id:number}).id, v.isChangeTreeVisible((o as never as Record<symbol, never>)[sym] as never));
  }
  const buf = Buffer.allocUnsafe(Encoder.BUFFER_SIZE);
  const shared = { offset: 1 };
  enc.encodeAll(shared, buf);
  const bytes = enc.encodeAllView(v, shared.offset, { ...shared }, buf);
  console.log("view bytes len", bytes.length);
  expect(true).toBe(true);
}); });

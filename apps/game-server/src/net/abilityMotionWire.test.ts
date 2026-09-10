import { expect, it } from "vitest";
import { Decoder, Encoder } from "@colyseus/schema";
import { MatchState } from "@ggd/shared/protocol/schema";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import { movementSystem } from "@ggd/shared/sim/systems/MovementSystem";
import { MatchController } from "../match/MatchController";
import { fullStateBytes } from "../testkit/wireFullState";
import { projectSnapshot } from "./snapshot";

it("transports actual drive phases and tether endpoints, then clears completed motion", () => {
  const ctl = new MatchController("motion-wire", 42, Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
    { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 });
  while (ctl.phase.phase !== "combat") ctl.tick();
  const world = ctl.world, owner = [...world.champion.keys()][0]!, t = world.transform.get(owner)!;
  const enemy = [...world.champion.keys()].find(id => world.team.get(id)!.teamId !== world.team.get(owner)!.teamId)!;
  world.setArena({ ...world.arena, zones: world.arena.zones.map(z => ({ ...z, obstacles: [] })) });
  const start = { ...world.arena.zones[t.zone]!.center }; t.pos = { ...start };
  for (const id of world.champion.keys()) {
    if (id !== owner) world.transform.get(id)!.pos = { x: start.x - 10, z: start.z + 8 };
    world.nav.get(id)!.moveTarget = null;
  }
  world.transform.get(enemy)!.pos = { x: start.x + 6, z: start.z }; world.transform.get(enemy)!.zone = t.zone; world.rebuildGrid();
  const ctx = { world, caster: owner, targets: [owner], direction: { x: 1, z: 0 }, rank: 1, origin: "ability:motion-wire", rng: world.rng };
  const read = () => {
    const state = new MatchState(); projectSnapshot(ctl, state, new Map());
    const bytes = fullStateBytes(new Encoder(state), state), decoded = new MatchState(); new Decoder(decoded).decode(bytes, { offset: 1 }); return decoded;
  };
  expect(read().entities.get(String(owner))!.motionState).toBe("");
  runEffects([{ kind: "applyBuff", applyTo: "self", duration: 3, modifiers: [], drive: { accelSec: 0.3, brakeSec: 0.2, turnFactor: 0.2, sharpTurnDot: 0.5, sharpTurnSpeed: 0.3 } }], ctx);
  world.nav.get(owner)!.moveTarget = { x: start.x, z: start.z - 8 }; movementSystem(world);
  expect(read().entities.get(String(owner))!.motionState).toBeTruthy();
  world.nav.get(owner)!.moveTarget = null;
  runEffects([{ kind: "pull", shape: "single", speed: 12, grapple: { range: 8, maxTravel: 4, hitRadius: 0.2 } }], ctx);
  const link = read().entities.get(String(enemy))!;
  expect(link.motionState).toBe("pulling"); expect(link.tetherX).toBeCloseTo(t.pos.x); expect(link.tetherZ).toBeCloseTo(t.pos.z);
  for (let i = 0; i < 20; i++) { world.tick++; movementSystem(world); }
  expect(read().entities.get(String(enemy))!).toMatchObject({ motionState: "", tetherX: 0, tetherZ: 0 });
});

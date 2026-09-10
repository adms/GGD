import { Encoder, Decoder } from "@colyseus/schema";
import { fullStateBytes } from "../testkit/wireFullState";
import { expect, it } from "vitest";
import { MatchController } from "../match/MatchController";
import { MatchState } from "@ggd/shared/protocol/schema";
import { Abilities } from "@ggd/shared/sim/content/registry";
import { castAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { communityCombatFixture } from "../../../../packages/shared/testkit/communityCombatFixture";
import { InputMailbox } from "../seat/InputMailbox";
import { projectSnapshot } from "./snapshot";
import type { Command } from "@ggd/shared/sim/intents";

it("real compiled Iori E projects separate stages, remaining input time and free recast cost", () => {
  const ctl = new MatchController("recast-wire", 1132,
    Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
    { champSelectTicks: 5, intermissionTicks: 20, combatMaxTicks: 100000, resolutionTicks: 5 });
  while (ctl.phase.phase !== "combat") ctl.tick();
  const source = communityCombatFixture("02");
  const caster = [...ctl.world.champion.keys()][0]!;
  const inst = ctl.world.abilities.get(caster)!.slots.E;
  const def = { ...source.compiled.abilityDrafts.E, id: inst.abilityId };
  Abilities.register(inst.abilityId, def as never); inst.rank = 1; inst.cooldownRemainingTicks = 0;
  ctl.world.health.get(caster)!.mana = 10000;
  expect(castAbility(ctl.world, caster, "E", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");
  const state = new MatchState(); const digest = ctl.world.digest();
  projectSnapshot(ctl, state, new Map());
  const seat = [...state.seats.values()].find(s => s.entityId === caster)!;
  expect(seat.recastStages[2]).toBe(2); expect(seat.recastWindows[2]).toBe(36);
  expect(seat.cooldowns[2]).toBe(6); expect(seat.recastFreeMask & 4).toBe(4);
  expect(inst.cooldownRemainingTicks).toBeGreaterThan(6); expect(ctl.world.digest()).toBe(digest);
  const decoded = new MatchState();
  new Decoder(decoded).decode(fullStateBytes(new Encoder(state), state), { offset: 1 });
  const wireSeat = [...decoded.seats.values()].find(s => s.entityId === caster)!;
  expect([...wireSeat.recastStages]).toEqual([...seat.recastStages]);
  expect([...wireSeat.recastWindows]).toEqual([...seat.recastWindows]);
  expect(wireSeat.recastFreeMask).toBe(seat.recastFreeMask);
  ctl.world.tick += 6; projectSnapshot(ctl, state, new Map()); expect(seat.cooldowns[2]).toBe(0);
  ctl.world.tick += 30; projectSnapshot(ctl, state, new Map());
  expect(seat.recastStages[2]).toBe(0); expect(seat.recastWindows[2]).toBe(0); expect(seat.recastFreeMask).toBe(0);
  expect(seat.cooldowns[2]).toBe(inst.cooldownRemainingTicks);
});
it("duplicate and reconnect-resend inputs cannot advance a recast", () => {
  const r = communityCombatFixture("02"); const mailbox = new InputMailbox();
  const command: Command = { kind: "castAbility", slot: "E", target: { type: "dir", dir: { x: 1, z: 0 } } };
  const send = (seq: number) => mailbox.push({ seq, commands: [command] });
  const drain = () => mailbox.drain(r.world.tick).commands.map(c => c.kind === "castAbility" ? castAbility(r.world, r.caster, c.slot, c.target) : null);
  send(1); expect(drain()).toEqual(["ok"]); r.step(8);
  mailbox.clear(); send(1); expect(drain()).toEqual([]);
  expect(r.world.abilities.get(r.caster)!.slots.E.recast?.nextStage).toBe(1);
  send(2); send(2); expect(drain()).toEqual(["ok"]);
  expect(r.world.abilities.get(r.caster)!.slots.E.recast?.nextStage).toBe(2);
});

/**
 * couch-pad-routing / couch-intent-isolation: the k-th connected pad drives
 * local player k ONLY — its own GamepadInput edge state, its own lastAimDir,
 * its own sink. Pad 2's input must never leak into player 1's stream.
 * All against injected fake pads (no hardware).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { Order, Command, CastableSlot } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import type { AimAbility } from "./AimResolver";
import {
  MultiGamepadSystem,
  connectedPadIndices,
  BTN,
  GAMEPAD_LONG_PRESS_MS,
  MOVE_LEAD,
  type GamepadCameraIntent,
  type PadState,
  type GamepadPlayerCtx,
} from "./GamepadInput";

const ABILITIES: Record<CastableSlot, AimAbility> = {
  Q: { castType: "skillshot", range: 14 },
  W: { castType: "self", range: 0.1 },
  E: { castType: "ground", range: 9 },
  R: { castType: "targeted", range: 8 },
  EX: { castType: "self", range: 0 },
  // the SIXTH slot — an active 天生技 is cast through the same paths
  PASSIVE: { castType: "self", range: 0 },
};

function pad(axes: number[], pressed: number[] = []): PadState {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }));
  return { connected: true, axes, buttons };
}

interface Recorded {
  orders: [number, Order][];
  aims: [number, Vec2][];
  commands: [number, Command][];
  cameras: [number, GamepadCameraIntent][];
  buttons: [number, number][];
  padsChanged: number[][];
}

function harness(
  players: number,
  positions: (Vec2 | null)[] = [],
  skillPoints: (player: number) => number = () => 0,
): {
  rec: Recorded;
  sys: MultiGamepadSystem;
  setPads: (pads: (PadState | null)[]) => void;
} {
  const rec: Recorded = {
    orders: [],
    aims: [],
    commands: [],
    cameras: [],
    buttons: [],
    padsChanged: [],
  };
  let pads: (PadState | null)[] = [];
  const ctx = (player: number): Omit<GamepadPlayerCtx, "lastAimDir"> => ({
    selfPos: positions[player] ?? { x: player * 100, z: 0 },
    facing: { x: 1, z: 0 },
    ability: (slot) => ABILITIES[slot],
    nearestEnemy: () => null,
    skillPoints: skillPoints(player),
  });
  const sys = new MultiGamepadSystem(
    () => players,
    {
      onOrder: (p, o) => rec.orders.push([p, o]),
      onAim: (p, a) => rec.aims.push([p, a]),
      onCommand: (p, c) => rec.commands.push([p, c]),
      onCamera: (p, cam) => rec.cameras.push([p, cam]),
      onButton: (p, b) => rec.buttons.push([p, b]),
      onPadsChanged: (i) => rec.padsChanged.push(i),
    },
    ctx,
    () => pads,
  );
  return { rec, sys, setPads: (p) => (pads = p) };
}

describe("pad -> player routing (couch-pad-routing)", () => {
  it("the k-th connected pad drives local player k", () => {
    cover("couch-pad-routing");
    const { rec, sys, setPads } = harness(2);
    // pad 0 pushes stick up (player 0 moves), pad 1 idle
    setPads([pad([0, -1, 0, 0]), pad([0, 0, 0, 0])]);
    sys.poll();
    expect(rec.orders).toHaveLength(1);
    expect(rec.orders[0]![0]).toBe(0);
    expect(rec.orders[0]![1]).toEqual({ kind: "move", point: { x: 0, z: MOVE_LEAD } });

    // now pad 1 moves too: its order is attributed to player 1, from
    // player 1's OWN position
    setPads([pad([0, -1, 0, 0]), pad([0, -1, 0, 0])]);
    sys.poll();
    const p1 = rec.orders.filter(([p]) => p === 1);
    expect(p1).toHaveLength(1);
    expect(p1[0]![1]).toEqual({ kind: "move", point: { x: 100, z: MOVE_LEAD } });
  });

  it("pad connect/disconnect fires onPadsChanged with the index list", () => {
    cover("couch-pad-routing");
    const { rec, sys, setPads } = harness(2);
    setPads([pad([0, 0, 0, 0])]);
    sys.poll();
    setPads([pad([0, 0, 0, 0]), pad([0, 0, 0, 0])]);
    sys.poll();
    sys.poll(); // no change -> no extra event
    expect(rec.padsChanged).toEqual([[0], [0, 1]]);
  });

  it("sparse pad indices still map in order (pad slots 1 and 3 -> players 0 and 1)", () => {
    cover("couch-pad-routing");
    const { rec, sys, setPads } = harness(2);
    const sparse = [null, pad([0, -1, 0, 0]), null, pad([1, 0, 0, 0])];
    expect(connectedPadIndices(sparse)).toEqual([1, 3]);
    setPads(sparse);
    sys.poll();
    expect(rec.orders.map(([p]) => p).sort()).toEqual([0, 1]);
  });

  it("raw button edges reach onButton with the player index (champ-select seam)", () => {
    cover("couch-pad-routing");
    const { rec, sys, setPads } = harness(2);
    setPads([pad([0, 0, 0, 0]), pad([0, 0, 0, 0], [BTN.A])]);
    sys.poll();
    expect(rec.buttons).toEqual([[1, BTN.A]]);
    // held button does not re-fire (edge detection is per-pad)
    sys.poll();
    expect(rec.buttons).toEqual([[1, BTN.A]]);
  });
});

describe("intent isolation (couch-intent-isolation)", () => {
  it("pad 2 casting never leaks commands/aim into player 1's stream", () => {
    cover("couch-intent-isolation");
    const { rec, sys, setPads } = harness(2);
    // pad 1 (player 1): aim right + press A (skillshot Q); pad 0 idle
    setPads([pad([0, 0, 0, 0]), pad([0, 0, 1, 0], [BTN.A])]);
    sys.poll();

    expect(rec.commands).toHaveLength(1);
    expect(rec.commands[0]![0]).toBe(1);
    expect(rec.commands[0]![1]).toEqual({
      kind: "castAbility",
      slot: "Q",
      target: { type: "dir", dir: { x: 1, z: 0 } },
    });
    expect(rec.aims).toHaveLength(1);
    expect(rec.aims[0]![0]).toBe(1);
    // player 0 got NOTHING
    expect(rec.orders.filter(([p]) => p === 0)).toHaveLength(0);
    expect(rec.commands.filter(([p]) => p === 0)).toHaveLength(0);
  });

  it("lastAimDir is per player: player 1's remembered aim never steers player 0", () => {
    cover("couch-intent-isolation");
    const { rec, sys, setPads } = harness(2);
    // frame 1: player 1 aims UP (+Z world), player 0 idle
    setPads([pad([0, 0, 0, 0]), pad([0, 0, 0, -1])]);
    sys.poll();
    // frame 2: BOTH press A with no live aim; player 0 falls back to its
    // facing (+X), player 1 to its remembered aim (+Z)
    setPads([pad([0, 0, 0, 0], [BTN.A]), pad([0, 0, 0, 0], [BTN.A])]);
    sys.poll();

    const cast0 = rec.commands.find(([p]) => p === 0)![1] as { target: { dir: Vec2 } };
    const cast1 = rec.commands.find(([p]) => p === 1)![1] as { target: { dir: Vec2 } };
    expect(cast0.target.dir.x).toBeCloseTo(1);
    expect(cast0.target.dir.z).toBeCloseTo(0);
    expect(cast1.target.dir.x).toBeCloseTo(0);
    expect(cast1.target.dir.z).toBeCloseTo(1);
  });

  /**
   * The owner's 2026-07-27 remap has to hold for EVERY seat, not just player 0.
   * These press real buttons on pad k and read the intents that come out of
   * player k's sink — the same shape as the single-pad guards.
   */
  it("the remap holds for every player index (LB=EX, RB=天生技, RT=attack, ↑=stop, ↓=recall)", () => {
    cover("couch-pad-routing");
    for (const player of [0, 1, 2, 3]) {
      const { rec, sys, setPads } = harness(4);
      const pads = [0, 1, 2, 3].map((k) =>
        pad([0, 0, 0, 0], k === player ? [BTN.LB, BTN.RB, BTN.DPAD_DOWN] : []),
      );
      setPads(pads);
      sys.poll();
      const mine = rec.commands.filter(([p]) => p === player).map(([, c]) => c);
      expect(mine).toEqual([
        expect.objectContaining({ kind: "castAbility", slot: "EX" }),
        expect.objectContaining({ kind: "castAbility", slot: "PASSIVE" }),
        { kind: "recall" },
      ]);
      // nobody else received anything
      expect(rec.commands.filter(([p]) => p !== player)).toEqual([]);

      // …and the orders half of the map, on the same seat
      const stop = harness(4);
      stop.setPads(
        [0, 1, 2, 3].map((k) => pad([0, 0, 0, 0], k === player ? [BTN.DPAD_UP] : [])),
      );
      stop.sys.poll();
      expect(stop.rec.orders).toEqual([[player, { kind: "stop" }]]);
    }
  });

  it("L3 / R3 camera ops are routed per player, never shared", () => {
    cover("couch-intent-isolation");
    const { rec, sys, setPads } = harness(2);
    setPads([pad([0, 0, 0, 0], [BTN.L3]), pad([0, 0, 0, 0], [BTN.R3])]);
    sys.poll();
    expect(rec.cameras).toEqual([
      [0, { toggleFollow: true }],
      [1, { zoomCycle: true }],
    ]);
  });

  it("a long press spends the point of the player who is HOLDING it", () => {
    cover("couch-intent-isolation");
    // only player 1 has a skill point; both hold X for well over the threshold
    const { rec, sys, setPads } = harness(2, [], (p) => (p === 1 ? 2 : 0));
    const perf = globalThis.performance;
    const realNow = perf.now.bind(perf);
    let now = 0;
    perf.now = () => now;
    try {
      setPads([pad([0, 0, 0, 0], [BTN.X]), pad([0, 0, 0, 0], [BTN.X])]);
      sys.poll(); // press edge → both CAST E
      now += GAMEPAD_LONG_PRESS_MS;
      sys.poll(); // threshold → only player 1 ranks up
      const ranks = rec.commands.filter(([, c]) => c.kind === "rankUpAbility");
      expect(ranks).toEqual([[1, { kind: "rankUpAbility", slot: "E" }]]);
    } finally {
      perf.now = realNow;
    }
  });

  it("button edge state is per pad: player 1 holding A doesn't eat player 0's press", () => {
    cover("couch-intent-isolation");
    const { rec, sys, setPads } = harness(2);
    setPads([pad([0, 0, 0, 0]), pad([0, 0, 0, 0], [BTN.A])]);
    sys.poll(); // player 1 pressed
    setPads([pad([0, 0, 0, 0], [BTN.A]), pad([0, 0, 0, 0], [BTN.A])]);
    sys.poll(); // player 0 presses while player 1 still holds
    const presses = rec.buttons.filter(([, b]) => b === BTN.A);
    expect(presses).toEqual([
      [1, BTN.A],
      [0, BTN.A],
    ]);
  });
});

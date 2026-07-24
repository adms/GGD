/**
 * client-11/12 (client-gamepad-mapping / client-gamepad-edge): twin-stick
 * gamepad play — deadzone filtering, left-stick move orders, buttons →
 * exact castAbility Command shapes per castType, RT attack-move, and
 * per-button edge detection. All against injected fake Gamepad objects
 * (no real hardware).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import type { CastableSlot } from "@ggd/shared/sim/intents";
import { buildCastCommand, type AimAbility } from "./AimResolver";
import { SLOT_BY_CODE } from "./InputCapture";
import {
  stickToWorld,
  mapGamepadFrame,
  GamepadInput,
  BTN,
  GAMEPAD_ZOOM_STEP,
  MOVE_LEAD,
  ATTACK_MOVE_LEAD,
  GROUND_CAST_MAX,
  type GamepadFrame,
  type GamepadPlayerCtx,
  type PadState,
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

function ctx(overrides: Partial<GamepadPlayerCtx> = {}): GamepadPlayerCtx {
  return {
    selfPos: { x: 10, z: 5 },
    facing: { x: 1, z: 0 },
    lastAimDir: null,
    ability: (slot) => ABILITIES[slot],
    nearestEnemy: () => null,
    ...overrides,
  };
}

const frame = (partial: Partial<GamepadFrame>): GamepadFrame => ({
  move: null,
  aim: null,
  justPressed: [],
  ...partial,
});

function fakePad(axes: number[], pressed: number[] = []): PadState {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }));
  return { connected: true, axes, buttons };
}

describe("stick deadzone + world mapping (client-12)", () => {
  it("filters deflections inside the radial deadzone", () => {
    cover("client-gamepad-edge");
    expect(stickToWorld(0.1, 0, 0.15)).toBeNull();
    expect(stickToWorld(0.07, 0.07, 0.15)).toBeNull(); // radial: len ~0.099
    expect(stickToWorld(0, 0, 0.15)).toBeNull();
  });

  it("maps pad-up to world +Z as a unit vector", () => {
    cover("client-gamepad-edge");
    const up = stickToWorld(0, -1)!;
    expect(up.x).toBeCloseTo(0);
    expect(up.z).toBeCloseTo(1);
    const diag = stickToWorld(0.5, 0.5)!;
    expect(Math.hypot(diag.x, diag.z)).toBeCloseTo(1);
    expect(diag.x).toBeCloseTo(Math.SQRT1_2);
    expect(diag.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it("a 0.1 deflection produces no order at all", () => {
    cover("client-gamepad-edge");
    const input = new GamepadInput(0, () => fakePad([0.1, 0, 0, 0]));
    const f = input.poll()!;
    expect(f.move).toBeNull();
    const intent = mapGamepadFrame(f, ctx());
    expect(intent.order).toBeUndefined();
    expect(intent.commands).toEqual([]);
  });
});

describe("twin-stick order/command mapping (client-11)", () => {
  it("left stick issues a move order MOVE_LEAD ahead of the champion", () => {
    cover("client-gamepad-mapping");
    const intent = mapGamepadFrame(frame({ move: { x: 0, z: 1 } }), ctx());
    expect(intent.order).toEqual({ kind: "move", point: { x: 10, z: 5 + MOVE_LEAD } });
  });

  it("right stick streams aim and skillshot Q uses its direction", () => {
    cover("client-gamepad-mapping");
    const aim: Vec2 = { x: 1, z: 0 };
    const intent = mapGamepadFrame(frame({ aim, justPressed: [BTN.A] }), ctx());
    expect(intent.aim).toEqual(aim);
    expect(intent.commands).toEqual([
      { kind: "castAbility", slot: "Q", target: { type: "dir", dir: { x: 1, z: 0 } } },
    ]);
  });

  it("skillshot falls back to lastAimDir, then facing", () => {
    cover("client-gamepad-mapping");
    const last = mapGamepadFrame(
      frame({ justPressed: [BTN.A] }),
      ctx({ lastAimDir: { x: 0, z: -1 } }),
    );
    expect(last.commands[0]).toMatchObject({ target: { type: "dir", dir: { x: 0, z: -1 } } });
    const facing = mapGamepadFrame(frame({ justPressed: [BTN.A] }), ctx());
    expect(facing.commands[0]).toMatchObject({ target: { type: "dir", dir: { x: 1, z: 0 } } });
  });

  it("B casts W as self", () => {
    cover("client-gamepad-mapping");
    const intent = mapGamepadFrame(frame({ justPressed: [BTN.B] }), ctx());
    expect(intent.commands).toEqual([{ kind: "castAbility", slot: "W", target: { type: "self" } }]);
  });

  it("X casts E at a ground point clamped to min(range, GROUND_CAST_MAX)", () => {
    cover("client-gamepad-mapping");
    const intent = mapGamepadFrame(
      frame({ aim: { x: 0, z: 1 }, justPressed: [BTN.X] }),
      ctx(),
    );
    // range 9 > GROUND_CAST_MAX → lands GROUND_CAST_MAX out
    expect(intent.commands).toEqual([
      {
        kind: "castAbility",
        slot: "E",
        target: { type: "point", point: { x: 10, z: 5 + GROUND_CAST_MAX } },
      },
    ]);
  });

  it("Y casts R at the nearest enemy within range (skipped when none)", () => {
    cover("client-gamepad-mapping");
    const hit = mapGamepadFrame(
      frame({ justPressed: [BTN.Y] }),
      ctx({ nearestEnemy: (_from, maxRange) => (maxRange === 8 ? 42 : null) }),
    );
    expect(hit.commands).toEqual([
      { kind: "castAbility", slot: "R", target: { type: "entity", entityId: 42 } },
    ]);
    const miss = mapGamepadFrame(frame({ justPressed: [BTN.Y] }), ctx());
    expect(miss.commands).toEqual([]);
  });

  it("RT attack-moves along the left stick (or aim) direction", () => {
    cover("client-gamepad-mapping");
    const intent = mapGamepadFrame(
      frame({ move: { x: 1, z: 0 }, justPressed: [BTN.RT] }),
      ctx(),
    );
    expect(intent.order).toEqual({
      kind: "attackMove",
      point: { x: 10 + ATTACK_MOVE_LEAD, z: 5 },
    });
  });

  it("LT basic-attacks the nearest enemy; RB stops; LB recalls; Start readies", () => {
    cover("client-gamepad-mapping");
    const lt = mapGamepadFrame(
      frame({ justPressed: [BTN.LT] }),
      ctx({ nearestEnemy: () => 7 }),
    );
    expect(lt.order).toEqual({ kind: "attackTarget", entity: 7 });
    const rest = mapGamepadFrame(frame({ justPressed: [BTN.RB, BTN.LB, BTN.START] }), ctx());
    expect(rest.order).toEqual({ kind: "stop" });
    expect(rest.commands).toEqual([{ kind: "recall" }, { kind: "ready" }]);
  });
});

describe("button edge detection (client-12)", () => {
  it("a held button fires exactly once until released", () => {
    cover("client-gamepad-edge");
    let pad = fakePad([0, 0, 0, 0], [BTN.A]);
    const input = new GamepadInput(0, () => pad);
    expect(input.poll()!.justPressed).toEqual([BTN.A]); // press edge
    expect(input.poll()!.justPressed).toEqual([]); // still held → no re-fire
    pad = fakePad([0, 0, 0, 0]);
    expect(input.poll()!.justPressed).toEqual([]); // released
    pad = fakePad([0, 0, 0, 0], [BTN.A]);
    expect(input.poll()!.justPressed).toEqual([BTN.A]); // re-press edge
  });

  it("poll returns null for an absent pad and re-arms edges", () => {
    cover("client-gamepad-edge");
    let pad: PadState | null = fakePad([0, 0, 0, 0], [BTN.A]);
    const input = new GamepadInput(0, () => pad);
    expect(input.poll()!.justPressed).toEqual([BTN.A]);
    pad = null;
    expect(input.poll()).toBeNull();
    pad = fakePad([0, 0, 0, 0], [BTN.A]);
    expect(input.poll()!.justPressed).toEqual([BTN.A]); // fresh edge after reconnect
  });
});

describe("EX skill input binding (ex-input-bind)", () => {
  it("gamepad Back, keyboard F, and the aim resolver all target the EX slot", () => {
    cover("ex-input-bind");
    // gamepad: the Back button casts the per-hero EX (self) skill
    const intent = mapGamepadFrame(frame({ justPressed: [BTN.BACK] }), ctx());
    expect(intent.commands).toEqual([
      { kind: "castAbility", slot: "EX", target: { type: "self" } },
    ]);
    // keyboard: F is bound to the EX slot (moved off T so it no longer clashes)
    expect(SLOT_BY_CODE.KeyF).toBe("EX");
    // the old T binding is gone
    expect(SLOT_BY_CODE.KeyT).toBeUndefined();
    // the shared aim resolver builds an EX cast command like any other slot
    expect(
      buildCastCommand(
        "EX",
        { castType: "self", range: 0 },
        { selfPos: { x: 0, z: 0 }, cursorGround: { x: 1, z: 1 } },
      ),
    ).toEqual({ kind: "castAbility", slot: "EX", target: { type: "self" } });
  });
});

describe("天生技 pad binding — the SIXTH slot (P0-3)", () => {
  it("d-pad UP casts the innate, and no other bound button does", () => {
    cover("ex-input-bind");
    const intent = mapGamepadFrame(frame({ justPressed: [BTN.DPAD_UP] }), ctx());
    expect(intent.commands).toEqual([
      { kind: "castAbility", slot: "PASSIVE", target: { type: "self" } },
    ]);
    // the face buttons keep their slots — the sixth slot took nothing away
    for (const [btn, slot] of [
      [BTN.A, "Q"],
      [BTN.B, "W"],
      [BTN.X, "E"],
      // Y/R is `targeted` and this ctx has no enemy — a no-target cast is
      // correctly not sent, which is a different rule and not this test's.
      [BTN.BACK, "EX"],
    ] as const) {
      expect(mapGamepadFrame(frame({ justPressed: [btn] }), ctx()).commands).toEqual([
        expect.objectContaining({ kind: "castAbility", slot }),
      ]);
    }
  });

  it("d-pad UP sends nothing when the hero's innate is not castable", () => {
    // a permanent 被動 innate (or no NN-00) resolves to null upstream
    cover("ex-input-bind");
    const intent = mapGamepadFrame(frame({ justPressed: [BTN.DPAD_UP] }), ctx({ ability: () => null }));
    expect(intent.commands).toEqual([]);
  });
});

describe("the held-shoulder modifier layer — rank-up + camera (task #197)", () => {
  // RB engages the layer only once it has been HELD (in `held`, not
  // `justPressed`), so a fresh press starts it and a later face-button press
  // reads the modifier. `held` includes the modifier without it being pressed
  // THIS frame.
  const modHeld = (justPressed: number[], extraHeld: number[] = []): GamepadFrame =>
    frame({ justPressed, held: [BTN.RB, ...extraHeld, ...justPressed] });

  it("RB + A/B/X/Y ranks up Q/W/E/R instead of casting them", () => {
    for (const [btn, slot] of [
      [BTN.A, "Q"],
      [BTN.B, "W"],
      [BTN.X, "E"],
      [BTN.Y, "R"],
    ] as const) {
      const intent = mapGamepadFrame(modHeld([btn]), ctx());
      expect(intent.commands).toEqual([{ kind: "rankUpAbility", slot }]);
    }
  });

  it("RB + shoulders/LB drive zoom and follow-toggle, never orders", () => {
    expect(mapGamepadFrame(modHeld([BTN.RT]), ctx()).camera).toEqual({ zoom: -GAMEPAD_ZOOM_STEP });
    expect(mapGamepadFrame(modHeld([BTN.LT]), ctx()).camera).toEqual({ zoom: GAMEPAD_ZOOM_STEP });
    expect(mapGamepadFrame(modHeld([BTN.LB]), ctx()).camera).toEqual({ toggleFollow: true });
    // none of these leaked a recall / stop / attack order out to the sim
    for (const b of [BTN.RT, BTN.LT, BTN.LB]) {
      expect(mapGamepadFrame(modHeld([b]), ctx()).commands).toEqual([]);
    }
  });

  it("RB + right stick free-pans the camera and does NOT aim", () => {
    const intent = mapGamepadFrame(modHeld([], []), ctx());
    // no aim while the stick pans
    const panFrame: GamepadFrame = { move: null, aim: { x: 1, z: 0 }, justPressed: [], held: [BTN.RB] };
    const panned = mapGamepadFrame(panFrame, ctx());
    expect(panned.camera).toEqual({ pan: { x: 1, z: 0 } });
    expect(panned.aim).toBeUndefined();
    expect(intent.camera).toBeUndefined(); // centred stick → no pan
  });

  it("a plain RB tap is still a clean stop (the modifier does not steal it)", () => {
    // RB pressed THIS frame (in justPressed) is the base layer, not the modifier
    const tap = mapGamepadFrame(frame({ justPressed: [BTN.RB], held: [BTN.RB] }), ctx());
    expect(tap.order).toEqual({ kind: "stop" });
    expect(tap.camera).toBeUndefined();
  });

  it("still lets you reposition (left stick move) while the modifier is held", () => {
    const intent = mapGamepadFrame(
      { move: { x: 0, z: 1 }, aim: null, justPressed: [BTN.A], held: [BTN.RB, BTN.A] },
      ctx(),
    );
    expect(intent.order?.kind).toBe("move");
    expect(intent.commands).toEqual([{ kind: "rankUpAbility", slot: "Q" }]);
  });

  it("GamepadInput.poll reports which buttons are HELD (level, not edge)", () => {
    cover("client-gamepad-edge");
    const pad = fakePad([0, 0, 0, 0], [BTN.RB, BTN.A]);
    const input = new GamepadInput(0, () => pad);
    const f = input.poll()!;
    expect(f.held).toEqual([BTN.A, BTN.RB]); // ascending button index
    // second poll: still held → held persists, justPressed clears
    expect(input.poll()!.held).toEqual([BTN.A, BTN.RB]);
    expect(input.poll()!.justPressed).toEqual([]);
  });
});

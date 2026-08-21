/**
 * client-11/12 (client-gamepad-mapping / client-gamepad-edge): twin-stick
 * gamepad play — deadzone filtering, left-stick move orders, buttons →
 * exact castAbility Command shapes per castType, RT attack-move, and
 * per-button edge detection. All against injected fake Gamepad objects
 * (no real hardware).
 */
import { describe, it, expect, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import type { CastableSlot } from "@ggd/shared/sim/intents";
import { buildCastCommand, type AimAbility } from "./AimResolver";
import { SLOT_BY_CODE } from "./InputCapture";
import { getHeldAbility, setHeldAbility } from "../ui/abilityHold";
import {
  stickToWorld,
  mapGamepadFrame,
  GamepadInput,
  GamepadSystem,
  BTN,
  GAMEPAD_LONG_PRESS_MS,
  MOVE_LEAD,
  ATTACK_MOVE_LEAD,
  GROUND_CAST_MAX,
  padCastReach,
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
    skillPoints: 0,
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

  it("X casts E at the ability's OWN effective range (GH#512 — no fixed clamp)", () => {
    cover("client-gamepad-mapping");
    const intent = mapGamepadFrame(
      frame({ aim: { x: 0, z: 1 }, justPressed: [BTN.X] }),
      ctx(),
    );
    // ⭐ 距離從 E 自己的 range 推導（測試 ctx 不帶係數 ⇒ ×1），⛔ 不是寫死的 6。
    const reach = padCastReach(ABILITIES.E, 1);
    expect(reach).toBeGreaterThan(GROUND_CAST_MAX); // 舊夾限會把它砍掉
    expect(intent.commands).toEqual([
      { kind: "castAbility", slot: "E", target: { type: "point", point: { x: 10, z: 5 + reach } } },
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

  /**
   * ⚠️ owner's 2026-07-27 ruling, NOT a regression: the triggers swapped.
   * LT is attack-move, RT is the basic attack (right trigger = primary action,
   * and #221's auto-attack demoted the manual one).
   */
  it("LT attack-moves along the left stick (or aim) direction", () => {
    cover("client-gamepad-mapping");
    const intent = mapGamepadFrame(
      frame({ move: { x: 1, z: 0 }, justPressed: [BTN.LT] }),
      ctx(),
    );
    expect(intent.order).toEqual({
      kind: "attackMove",
      point: { x: 10 + ATTACK_MOVE_LEAD, z: 5 },
    });
    // and the OLD binding is gone: RT no longer attack-moves
    const rt = mapGamepadFrame(frame({ move: { x: 1, z: 0 }, justPressed: [BTN.RT] }), ctx());
    expect(rt.order?.kind).not.toBe("attackMove");
  });

  it("RT basic-attacks the nearest enemy; d-pad ↑ stops, ↓ recalls; Start readies", () => {
    cover("client-gamepad-mapping");
    const rt = mapGamepadFrame(
      frame({ justPressed: [BTN.RT] }),
      ctx({ nearestEnemy: () => 7 }),
    );
    expect(rt.order).toEqual({ kind: "attackTarget", entity: 7 });
    // …and LT does NOT basic-attack any more (the swap really moved it)
    const lt = mapGamepadFrame(frame({ justPressed: [BTN.LT] }), ctx({ nearestEnemy: () => 7 }));
    expect(lt.order?.kind).not.toBe("attackTarget");

    const rest = mapGamepadFrame(
      frame({ justPressed: [BTN.DPAD_UP, BTN.DPAD_DOWN, BTN.START] }),
      ctx(),
    );
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
  /**
   * ⚠️ owner's 2026-07-27 ruling, NOT a regression: the EX moved from Back to
   * LB. Back/View is the smallest, most central key on the pad and the EX is
   * the round-7 ability you press at the tightest moment of a match.
   */
  it("gamepad LB, keyboard F, and the aim resolver all target the EX slot", () => {
    cover("ex-input-bind");
    // gamepad: the LEFT BUMPER casts the per-hero EX (self) skill
    const intent = mapGamepadFrame(frame({ justPressed: [BTN.LB] }), ctx());
    expect(intent.commands).toEqual([
      { kind: "castAbility", slot: "EX", target: { type: "self" } },
    ]);
    // …and Back is now bound to NOTHING at all (it is #197's, not combat's)
    const back = mapGamepadFrame(frame({ justPressed: [BTN.BACK] }), ctx());
    expect(back.commands).toEqual([]);
    expect(back.order).toBeUndefined();
    expect(back.camera).toBeUndefined();
    // the old LB binding (recall) really moved off it — LB casts, never recalls
    expect(intent.commands.some((c) => c.kind === "recall")).toBe(false);
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
  /**
   * ⚠️ owner's 2026-07-27 ruling, NOT a regression: the innate moved from the
   * d-pad to RB. The left thumb lives on the left stick and the d-pad costs you
   * your movement; a shoulder does not. 「直覺比頻率重要」.
   */
  it("RB casts the innate, and no other bound button does", () => {
    cover("ex-input-bind");
    const intent = mapGamepadFrame(frame({ justPressed: [BTN.RB] }), ctx());
    expect(intent.commands).toEqual([
      { kind: "castAbility", slot: "PASSIVE", target: { type: "self" } },
    ]);
    // RB's old base action (stop) really left it — a cast is all it does now
    expect(intent.order).toBeUndefined();
    // the face buttons keep their slots — the remap took nothing away
    for (const [btn, slot] of [
      [BTN.A, "Q"],
      [BTN.B, "W"],
      [BTN.X, "E"],
      // Y/R is `targeted` and this ctx has no enemy — a no-target cast is
      // correctly not sent, which is a different rule and not this test's.
      [BTN.LB, "EX"],
    ] as const) {
      expect(mapGamepadFrame(frame({ justPressed: [btn] }), ctx()).commands).toEqual([
        expect.objectContaining({ kind: "castAbility", slot }),
      ]);
    }
  });

  it("RB sends nothing when the hero's innate is not castable", () => {
    // a permanent 被動 innate (or no NN-00) resolves to null upstream. This is
    // the KNOWN, ACCEPTED cost of putting the innate on a shoulder: on most
    // heroes RB does nothing. It must do NOTHING — never a fallback `stop`,
    // which would make one button mean two things depending on the hero.
    cover("ex-input-bind");
    const intent = mapGamepadFrame(frame({ justPressed: [BTN.RB] }), ctx({ ability: () => null }));
    expect(intent.commands).toEqual([]);
    expect(intent.order).toBeUndefined();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * owner 2026-07-27 — THE REMAP. These replaced the held-RB modifier layer.
 * ════════════════════════════════════════════════════════════════════════════
 * Every guard below feeds a PAD FRAME in and asserts the INTENT that comes out.
 * None of them read a mapping table: `SLOT_BY_BUTTON` is private on purpose, so
 * the only way to ask "what does LB do" is to press LB.
 */
describe("owner 2026-07-27 pad remap — the whole map, one frame at a time", () => {
  it("every skill button casts ITS slot and nothing else's", () => {
    for (const [btn, slot] of [
      [BTN.A, "Q"],
      [BTN.B, "W"],
      [BTN.X, "E"],
      [BTN.LB, "EX"],
      [BTN.RB, "PASSIVE"],
    ] as const) {
      expect(mapGamepadFrame(frame({ justPressed: [btn] }), ctx()).commands).toEqual([
        expect.objectContaining({ kind: "castAbility", slot }),
      ]);
    }
    // Y is `targeted` in this fixture, so it needs an enemy to resolve
    expect(
      mapGamepadFrame(frame({ justPressed: [BTN.Y] }), ctx({ nearestEnemy: () => 3 })).commands,
    ).toEqual([expect.objectContaining({ kind: "castAbility", slot: "R" })]);
  });

  it("L3 toggles camera follow and R3 asks for the zoom/home cycle", () => {
    expect(mapGamepadFrame(frame({ justPressed: [BTN.L3] }), ctx()).camera).toEqual({
      toggleFollow: true,
    });
    expect(mapGamepadFrame(frame({ justPressed: [BTN.R3] }), ctx()).camera).toEqual({
      zoomCycle: true,
    });
    // neither leaks a sim intent — the camera is client-only
    for (const b of [BTN.L3, BTN.R3]) {
      const out = mapGamepadFrame(frame({ justPressed: [b] }), ctx());
      expect(out.commands).toEqual([]);
      expect(out.order).toBeUndefined();
    }
  });

  it("the right stick both aims AND offers the camera a pan vector", () => {
    // no modifier any more: the rig ignores `pan` while follow is locked, so
    // this is free while following and IS the free-pan once L3 unlocks it.
    const panned = mapGamepadFrame(frame({ aim: { x: 1, z: 0 } }), ctx());
    expect(panned.aim).toEqual({ x: 1, z: 0 });
    expect(panned.camera).toEqual({ pan: { x: 1, z: 0 } });
    // a centred stick asks for nothing
    expect(mapGamepadFrame(frame({}), ctx()).camera).toBeUndefined();
  });

  it("holding the RIGHT BUMPER no longer opens a second layer on anything", () => {
    // the retired modifier: RB held from a previous frame used to turn A into a
    // rank-up and LT/RT into zoom. Now RB is just the 天生技 and a held RB
    // changes nothing about what the other buttons do.
    const withRbHeld = mapGamepadFrame(
      { move: null, aim: null, justPressed: [BTN.A], held: [BTN.RB, BTN.A] },
      ctx({ skillPoints: 3 }),
    );
    expect(withRbHeld.commands).toEqual([
      expect.objectContaining({ kind: "castAbility", slot: "Q" }),
    ]);
    const ltWithRbHeld = mapGamepadFrame(
      { move: { x: 1, z: 0 }, aim: null, justPressed: [BTN.LT], held: [BTN.RB, BTN.LT] },
      ctx(),
    );
    expect(ltWithRbHeld.camera).toBeUndefined(); // no zoom off a held shoulder
    expect(ltWithRbHeld.order?.kind).toBe("attackMove");
  });
});

describe("長按 = 升級 / 說明 (owner 2026-07-27)", () => {
  /** the frame `GamepadInput.poll` emits on the poll a hold crosses 0.4 s. */
  const longFrame = (button: number): GamepadFrame =>
    frame({ held: [button], longPressed: [button], longHeld: [button] });

  it("a long press on A/B/X/Y spends a point on Q/W/E/R", () => {
    for (const [btn, slot] of [
      [BTN.A, "Q"],
      [BTN.B, "W"],
      [BTN.X, "E"],
      [BTN.Y, "R"],
    ] as const) {
      const intent = mapGamepadFrame(longFrame(btn), ctx({ skillPoints: 1 }));
      expect(intent.commands).toEqual([{ kind: "rankUpAbility", slot }]);
      expect(intent.describe).toBeUndefined(); // spending, not reading
    }
  });

  it("with NO point to spend the same hold shows that ability's description", () => {
    const intent = mapGamepadFrame(longFrame(BTN.A), ctx({ skillPoints: 0 }));
    expect(intent.commands).toEqual([]);
    expect(intent.describe).toBe("Q");
  });

  it("LB/RB always describe — EX and 天生技 have no rank a point could raise", () => {
    // the sim agrees: CommandSystem drops a rankUpAbility naming EX or PASSIVE,
    // so emitting one here would be a gesture that silently does nothing.
    for (const [btn, slot] of [
      [BTN.LB, "EX"],
      [BTN.RB, "PASSIVE"],
    ] as const) {
      const intent = mapGamepadFrame(longFrame(btn), ctx({ skillPoints: 5 }));
      expect(intent.commands).toEqual([]);
      expect(intent.describe).toBe(slot);
    }
  });

  it("releasing takes the description away (level, not edge)", () => {
    // longHeld empty = nothing held past the threshold = nothing to describe
    const released = mapGamepadFrame(frame({}), ctx({ skillPoints: 0 }));
    expect(released.describe).toBeUndefined();
  });

  it("a button with no slot never ranks anything up", () => {
    for (const b of [BTN.LT, BTN.RT, BTN.START, BTN.BACK, BTN.DPAD_UP, BTN.L3]) {
      const intent = mapGamepadFrame(longFrame(b), ctx({ skillPoints: 3 }));
      expect(intent.commands).toEqual([]);
      expect(intent.describe).toBeUndefined();
    }
  });
});

describe("長按 timing: poll owns the clock, and the CAST is never delayed", () => {
  /** a pad whose buttons we flip, plus a clock we advance by hand. */
  function heldPad(): { pad: PadState; press: (b: number[]) => void } {
    const pad = fakePad([0, 0, 0, 0]);
    return {
      pad,
      press: (b) => {
        for (let i = 0; i < pad.buttons.length; i++) {
          (pad.buttons as { pressed: boolean }[])[i]!.pressed = b.includes(i);
        }
      },
    };
  }

  it("the cast fires on the PRESS, ~0.4s before the rank-up — never after it", () => {
    cover("client-gamepad-edge");
    let now = 1000;
    const { pad, press } = heldPad();
    const input = new GamepadInput(0, () => pad, () => now);

    press([BTN.A]);
    const down = input.poll()!;
    // frame 1: the cast, IMMEDIATELY. This is the hard requirement — waiting to
    // find out whether the press becomes a long press would put 400ms of lag on
    // every ability in the game.
    expect(down.justPressed).toEqual([BTN.A]);
    expect(down.longPressed).toEqual([]);
    expect(mapGamepadFrame(down, ctx({ skillPoints: 1 })).commands).toEqual([
      expect.objectContaining({ kind: "castAbility", slot: "Q" }),
    ]);

    // still short of the threshold: nothing new
    now += GAMEPAD_LONG_PRESS_MS - 1;
    const early = input.poll()!;
    expect(early.longPressed).toEqual([]);
    expect(mapGamepadFrame(early, ctx({ skillPoints: 1 })).commands).toEqual([]);

    // crossing it: the rank-up, exactly once
    now += 1;
    const long = input.poll()!;
    expect(long.longPressed).toEqual([BTN.A]);
    expect(mapGamepadFrame(long, ctx({ skillPoints: 1 })).commands).toEqual([
      { kind: "rankUpAbility", slot: "Q" },
    ]);
  });

  it("a button held for seconds ranks up ONCE (the latch), and re-arms on release", () => {
    let now = 0;
    const { pad, press } = heldPad();
    const input = new GamepadInput(0, () => pad, () => now);
    press([BTN.B]);
    input.poll();
    let fired = 0;
    for (let i = 0; i < 60; i++) {
      now += 100; // 6 seconds of holding
      if (input.poll()!.longPressed!.includes(BTN.B)) fired += 1;
    }
    expect(fired).toBe(1);

    press([]); // release
    now += 16;
    input.poll();
    press([BTN.B]); // press again
    now += 16;
    input.poll();
    now += GAMEPAD_LONG_PRESS_MS;
    expect(input.poll()!.longPressed).toEqual([BTN.B]); // a NEW press may fire
  });

  it("a pad that disconnects mid-hold does not resolve a stale long press", () => {
    let now = 0;
    const { pad, press } = heldPad();
    let live: PadState | null = pad;
    const input = new GamepadInput(0, () => live, () => now);
    press([BTN.X]);
    input.poll();
    live = null;
    now += 10_000; // gone for ten seconds, button still physically down
    expect(input.poll()).toBeNull();
    live = pad;
    const back = input.poll()!;
    expect(back.justPressed).toEqual([BTN.X]); // a fresh press, not a 10s hold
    expect(back.longPressed).toEqual([]);
  });

  it("poll still reports which buttons are HELD (level, not edge)", () => {
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

describe("長按 without a point reaches the PLAYER, not just the intent", () => {
  afterEach(() => setHeldAbility(null));

  it("GamepadSystem pushes the described slot into ui/abilityHold, and clears it", () => {
    let now = 0;
    const pad = fakePad([0, 0, 0, 0]);
    const setPressed = (b: number[]): void => {
      for (let i = 0; i < pad.buttons.length; i++) {
        (pad.buttons as { pressed: boolean }[])[i]!.pressed = b.includes(i);
      }
    };
    const sys = new GamepadSystem(
      {
        onOrder: () => {},
        onAim: () => {},
        onCommand: () => {},
        onPadsChanged: () => {},
      },
      () => ({
        selfPos: { x: 0, z: 0 },
        facing: { x: 0, z: 1 },
        ability: (slot) => ABILITIES[slot],
        nearestEnemy: () => null,
        skillPoints: 0, // no point to spend → the hold is a description
      }),
      () => [pad],
    );
    // GamepadSystem builds its own GamepadInput off the real clock, so drive
    // that clock instead of injecting one.
    const perf = globalThis.performance;
    const realNow = perf.now.bind(perf);
    perf.now = () => now;
    try {
      setPressed([BTN.X]);
      sys.poll();
      expect(getHeldAbility()).toBeNull(); // a tap is not a hold
      now += GAMEPAD_LONG_PRESS_MS;
      sys.poll();
      expect(getHeldAbility()).toBe("E"); // ← the description panel opens
      setPressed([]);
      now += 16;
      sys.poll();
      expect(getHeldAbility()).toBeNull(); // …and closes on release
    } finally {
      perf.now = realNow;
    }
  });

  it("never clears a description the MOUSE is holding (shared global)", () => {
    setHeldAbility("R"); // a mouse-down on the R tile
    const pad = fakePad([0, 0, 0, 0]);
    const sys = new GamepadSystem(
      { onOrder: () => {}, onAim: () => {}, onCommand: () => {}, onPadsChanged: () => {} },
      () => ({
        selfPos: { x: 0, z: 0 },
        facing: { x: 0, z: 1 },
        ability: (slot) => ABILITIES[slot],
        nearestEnemy: () => null,
        skillPoints: 0,
      }),
      () => [pad],
    );
    sys.poll();
    sys.poll();
    expect(getHeldAbility()).toBe("R"); // the pad kept its hands off
  });
});

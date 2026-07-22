/**
 * mobile-01..08: Wild-Rift-style touch controls — floating joystick
 * anchor/drag/deadzone → move-order math, release semantics, multi-touch
 * identifier isolation, tap-vs-drag threshold, tap quick-cast Command shapes
 * per castType (the exact shapes the gamepad tests assert), drag-aim release
 * dir/point commands + indicator states, the cancel zone, and the basic-
 * attack button (LT semantics). Everything is driven with synthetic touch
 * records — the same {identifier, clientX, clientY} triples real TouchEvents
 * deliver — so it runs in node like every other input suite.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { Command, Order, AbilitySlot } from "@ggd/shared/sim/intents";
import type { AimAbility } from "./AimResolver";
import { MOVE_LEAD } from "./GamepadInput";
import type { PickableUnit } from "./Picking";
import {
  TouchController,
  touchFrame,
  joystickDir,
  tapCastCommand,
  aimCastCommand,
  attackTapOrder,
  nearestEnemyDir,
  AIM_START_PX,
  CANCEL_RADIUS_PX,
  JOYSTICK_RADIUS_PX,
  TOUCH_DEADZONE,
  type TouchPlayerCtx,
  type TouchEventLike,
} from "./TouchInput";

/** same ability fixture the gamepad mapping tests use (client-11) */
const ABILITIES: Record<AbilitySlot, AimAbility> = {
  Q: { castType: "skillshot", range: 14 },
  W: { castType: "self", range: 0.1 },
  E: { castType: "ground", range: 9 },
  R: { castType: "targeted", range: 8 },
  EX: { castType: "self", range: 0 },
};

function ctx(overrides: Partial<TouchPlayerCtx> = {}): TouchPlayerCtx {
  return {
    selfPos: { x: 10, z: 5 },
    facing: { x: 1, z: 0 },
    ability: (slot) => ABILITIES[slot],
    enemyUnits: () => [],
    ...overrides,
  };
}

const ev = (...touches: [id: number, x: number, y: number][]): TouchEventLike => ({
  changedTouches: touches.map(([identifier, clientX, clientY]) => ({
    identifier,
    clientX,
    clientY,
  })),
  preventDefault: () => {},
});

function harness(c: TouchPlayerCtx = ctx()): {
  ctrl: TouchController;
  orders: Order[];
  commands: Command[];
} {
  const orders: Order[] = [];
  const commands: Command[] = [];
  const ctrl = new TouchController({
    ctx: () => c,
    onOrder: (o) => orders.push(o),
    onCommand: (cmd) => commands.push(cmd),
    isJoystickArea: (clientX) => clientX < 400, // left half of an 800px canvas
  });
  return { ctrl, orders, commands };
}

describe("floating joystick (mobile-01/02)", () => {
  it("anchors at touchstart and maps the drag vector onto move orders", () => {
    cover("mobile-joystick-move");
    const { ctrl, orders } = harness();

    ctrl.canvasTouchStart(ev([1, 100, 300]));
    ctrl.poll();
    expect(touchFrame.joystick.active).toBe(true);
    expect(touchFrame.joystick.baseX).toBe(100); // anchored where the finger landed
    expect(orders).toEqual([]); // no deflection yet

    // drag right 48px (0.75 of the 64px radius) → unit dir {1,0}
    ctrl.touchMove(ev([1, 148, 300]));
    ctrl.poll();
    expect(orders.at(-1)).toEqual({
      kind: "move",
      point: { x: 10 + MOVE_LEAD, z: 5 },
    });

    // continuous: every poll while deflected issues a (coalesced) order
    ctrl.poll();
    expect(orders).toHaveLength(2);

    // drag up → world +Z (screen-up = +Z, like the gamepad stick)
    ctrl.touchMove(ev([1, 100, 252]));
    ctrl.poll();
    expect(orders.at(-1)!.kind).toBe("move");
    const pt = (orders.at(-1) as { point: { x: number; z: number } }).point;
    expect(pt.x).toBeCloseTo(10);
    expect(pt.z).toBeCloseTo(5 + MOVE_LEAD);
  });

  it("filters drags inside the radial deadzone (0.12)", () => {
    cover("mobile-joystick-move");
    const { ctrl, orders } = harness();
    ctrl.canvasTouchStart(ev([1, 100, 300]));
    ctrl.touchMove(ev([1, 104, 303])); // 5px of 64 → 0.078 < 0.12
    ctrl.poll();
    expect(orders).toEqual([]);
    expect(joystickDir(4, 3)).toBeNull();
    expect(joystickDir(JOYSTICK_RADIUS_PX * TOUCH_DEADZONE + 1, 0)).not.toBeNull();
  });

  it("release stops issuing (the last order finishes) and re-anchors next touch", () => {
    cover("mobile-joystick-release");
    const { ctrl, orders } = harness();
    ctrl.canvasTouchStart(ev([1, 100, 300]));
    ctrl.touchMove(ev([1, 164, 300]));
    ctrl.poll();
    expect(orders).toHaveLength(1);

    ctrl.touchEnd(ev([1, 164, 300]));
    ctrl.poll();
    ctrl.poll();
    expect(orders).toHaveLength(1); // nothing new — server finishes the last move
    expect(touchFrame.joystick.active).toBe(false);

    ctrl.canvasTouchStart(ev([3, 220, 180])); // new finger, new anchor
    ctrl.poll();
    expect(touchFrame.joystick.baseX).toBe(220);
    expect(touchFrame.joystick.baseY).toBe(180);
  });

  it("ignores touches on the right half (button territory)", () => {
    cover("mobile-joystick-move");
    const { ctrl } = harness();
    ctrl.canvasTouchStart(ev([1, 700, 300]));
    ctrl.poll();
    expect(touchFrame.joystick.active).toBe(false);
  });
});

describe("multi-touch identifier isolation (mobile-03)", () => {
  it("tracks the joystick and an ability drag independently by identifier", () => {
    cover("mobile-touch-isolation");
    const { ctrl, orders, commands } = harness();

    ctrl.canvasTouchStart(ev([1, 100, 300]));
    ctrl.touchMove(ev([1, 148, 300])); // joystick → east
    ctrl.buttonTouchStart("Q", { identifier: 2, clientX: 700, clientY: 300 });
    ctrl.touchMove(ev([2, 700, 240])); // ability drag → up (60px, aiming)

    ctrl.poll();
    // ability drag did NOT disturb the joystick vector
    expect(orders.at(-1)).toEqual({ kind: "move", point: { x: 14, z: 5 } });
    expect(touchFrame.aim).toMatchObject({ active: true, slot: "Q", aiming: true });

    // moving the joystick finger does not disturb the aim drag
    ctrl.touchMove(ev([1, 100, 252])); // joystick → north
    ctrl.poll();
    expect(touchFrame.aim).toMatchObject({ active: true, slot: "Q", aiming: true });

    // releasing the ability finger casts with ITS drag, joystick keeps going
    ctrl.touchEnd(ev([2, 700, 240]));
    expect(commands).toEqual([
      { kind: "castAbility", slot: "Q", target: { type: "dir", dir: { x: 0, z: 1 } } },
    ]);
    const before = orders.length;
    ctrl.poll();
    expect(orders.length).toBe(before + 1); // joystick still issuing
    expect(touchFrame.joystick.active).toBe(true);
  });

  it("a second ability finger is ignored while one is down", () => {
    cover("mobile-touch-isolation");
    const { ctrl, commands } = harness();
    ctrl.buttonTouchStart("Q", { identifier: 2, clientX: 700, clientY: 300 });
    ctrl.buttonTouchStart("W", { identifier: 3, clientX: 760, clientY: 200 });
    ctrl.touchEnd(ev([3, 760, 200])); // W finger never tracked → no W cast
    ctrl.touchEnd(ev([2, 700, 300])); // Q tap-casts
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ slot: "Q" });
  });
});

describe("tap-vs-drag threshold (mobile-04)", () => {
  it("stays a tap under AIM_START_PX and becomes aim mode beyond it", () => {
    cover("mobile-tap-threshold");
    const { ctrl, commands } = harness();

    // small wobble (10px < 18px): still a tap → quick cast on release
    ctrl.buttonTouchStart("Q", { identifier: 5, clientX: 700, clientY: 300 });
    ctrl.touchMove(ev([5, 710, 300]));
    ctrl.poll();
    expect(touchFrame.aim).toMatchObject({ active: true, slot: "Q", aiming: false });
    expect(touchFrame.indicator).toBeNull();
    ctrl.touchEnd(ev([5, 710, 300]));
    expect(commands).toHaveLength(1); // quick cast fired

    // beyond the threshold: aim mode — but still inside the cancel ring
    // (AIM_START_PX < CANCEL_RADIUS_PX), so the indicator stays hidden
    ctrl.buttonTouchStart("Q", { identifier: 6, clientX: 700, clientY: 300 });
    ctrl.touchMove(ev([6, 700, 300 - (AIM_START_PX + 4)]));
    ctrl.poll();
    expect(touchFrame.aim.aiming).toBe(true);
    expect(touchFrame.indicator).toBeNull();

    // past the cancel ring: the aim indicator arms
    ctrl.touchMove(ev([6, 700, 300 - (CANCEL_RADIUS_PX + 12)]));
    ctrl.poll();
    expect(touchFrame.aim.aiming).toBe(true);
    expect(touchFrame.aim.inCancelZone).toBe(false);
    expect(touchFrame.indicator).not.toBeNull();
    expect(commands).toHaveLength(1); // still only the first cast
  });
});

describe("tap quick cast — exact Command shapes per castType (mobile-05)", () => {
  it("skillshot Q aims at the nearest enemy, falling back to facing", () => {
    cover("mobile-quickcast-shapes");
    const units: PickableUnit[] = [{ id: 42, x: 10, z: 13, radius: 0.6 }];
    expect(tapCastCommand("Q", ABILITIES.Q, ctx({ enemyUnits: () => units }))).toEqual({
      kind: "castAbility",
      slot: "Q",
      target: { type: "dir", dir: { x: 0, z: 1 } },
    });
    // no enemy → facing (x east)
    expect(tapCastCommand("Q", ABILITIES.Q, ctx())).toEqual({
      kind: "castAbility",
      slot: "Q",
      target: { type: "dir", dir: { x: 1, z: 0 } },
    });
    expect(nearestEnemyDir({ x: 10, z: 5 }, units, 14)).toEqual({ x: 0, z: 1 });
  });

  it("self W casts on self", () => {
    cover("mobile-quickcast-shapes");
    expect(tapCastCommand("W", ABILITIES.W, ctx())).toEqual({
      kind: "castAbility",
      slot: "W",
      target: { type: "self" },
    });
  });

  it("ground E lands at min(range, 6) toward facing", () => {
    cover("mobile-quickcast-shapes");
    expect(tapCastCommand("E", ABILITIES.E, ctx())).toEqual({
      kind: "castAbility",
      slot: "E",
      target: { type: "point", point: { x: 16, z: 5 } },
    });
  });

  it("targeted R hits the nearest enemy in range, or does not send", () => {
    cover("mobile-quickcast-shapes");
    const units: PickableUnit[] = [{ id: 42, x: 14, z: 5, radius: 0.6 }];
    expect(tapCastCommand("R", ABILITIES.R, ctx({ enemyUnits: () => units }))).toEqual({
      kind: "castAbility",
      slot: "R",
      target: { type: "entity", entityId: 42 },
    });
    expect(tapCastCommand("R", ABILITIES.R, ctx())).toBeNull();
  });
});

describe("drag-aim release (mobile-06)", () => {
  it("skillshot drag: line indicator along the drag, release casts that dir", () => {
    cover("mobile-drag-aim");
    const { ctrl, commands } = harness();
    ctrl.buttonTouchStart("Q", { identifier: 3, clientX: 700, clientY: 300 });
    ctrl.touchMove(ev([3, 700, 204])); // 96px up → full deflection, dir {0,1}
    ctrl.poll();
    expect(touchFrame.indicator).toEqual({
      kind: "line",
      fromX: 10,
      fromZ: 5,
      dirX: 0,
      dirZ: 1,
      length: 14, // full skillshot range
    });
    ctrl.touchEnd(ev([3, 700, 204]));
    expect(commands).toEqual([
      { kind: "castAbility", slot: "Q", target: { type: "dir", dir: { x: 0, z: 1 } } },
    ]);
  });

  it("ground drag: disc at the drag-projected point, release casts that point", () => {
    cover("mobile-drag-aim");
    const { ctrl, commands } = harness();
    ctrl.buttonTouchStart("E", { identifier: 4, clientX: 700, clientY: 300 });
    ctrl.touchMove(ev([4, 700, 252])); // 48px up → mag 0.5 → 0.5·min(9,6) = 3 out
    ctrl.poll();
    expect(touchFrame.indicator).toEqual({ kind: "disc", x: 10, z: 8, radius: 1.2 });
    ctrl.touchEnd(ev([4, 700, 252]));
    expect(commands).toEqual([
      { kind: "castAbility", slot: "E", target: { type: "point", point: { x: 10, z: 8 } } },
    ]);
  });

  it("aimCastCommand: targeted drags bias target acquisition along the drag", () => {
    cover("mobile-drag-aim");
    const units: PickableUnit[] = [
      { id: 7, x: 10, z: 9, radius: 0.6 }, // 4 north (along the drag)
      { id: 8, x: 7, z: 5, radius: 0.6 }, // 3 west (closer, but behind the aim)
    ];
    const cmd = aimCastCommand("R", ABILITIES.R, ctx({ enemyUnits: () => units }), { x: 0, z: 1 }, 1);
    expect(cmd).toEqual({
      kind: "castAbility",
      slot: "R",
      target: { type: "entity", entityId: 7 },
    });
  });
});

describe("cancel zone (mobile-07)", () => {
  it("dragging back inside CANCEL_RADIUS_PX aborts the cast", () => {
    cover("mobile-cancel-zone");
    const { ctrl, commands } = harness();
    ctrl.buttonTouchStart("Q", { identifier: 9, clientX: 700, clientY: 300 });
    ctrl.touchMove(ev([9, 700, 240])); // out 60px → aiming
    ctrl.poll();
    expect(touchFrame.aim.inCancelZone).toBe(false);
    ctrl.touchMove(ev([9, 700, 300 - CANCEL_RADIUS_PX + 4])); // back inside
    ctrl.poll();
    expect(touchFrame.aim.inCancelZone).toBe(true);
    expect(touchFrame.indicator).toBeNull(); // indicator hides while cancelling
    ctrl.touchEnd(ev([9, 700, 300 - CANCEL_RADIUS_PX + 4]));
    expect(commands).toEqual([]);
  });

  it("touchcancel (iOS gesture interruption) never casts", () => {
    cover("mobile-cancel-zone");
    const { ctrl, commands } = harness();
    ctrl.buttonTouchStart("Q", { identifier: 9, clientX: 700, clientY: 300 });
    ctrl.touchMove(ev([9, 700, 200]));
    ctrl.touchCancel(ev([9, 700, 200]));
    ctrl.poll();
    expect(commands).toEqual([]);
    expect(touchFrame.aim.active).toBe(false);
  });
});

describe("basic-attack button (mobile-08)", () => {
  it("press = attackTarget nearest enemy (gamepad LT semantics)", () => {
    cover("mobile-attack-basic");
    const units: PickableUnit[] = [{ id: 42, x: 14, z: 5, radius: 0.6 }];
    const { ctrl, orders } = harness(ctx({ enemyUnits: () => units }));
    ctrl.buttonTouchStart("ATTACK", { identifier: 1, clientX: 760, clientY: 340 });
    expect(orders).toEqual([{ kind: "attackTarget", entity: 42 }]);
  });

  it("no enemy in BASIC_ATTACK_RANGE → no order at all", () => {
    cover("mobile-attack-basic");
    const { ctrl, orders } = harness();
    ctrl.buttonTouchStart("ATTACK", { identifier: 1, clientX: 760, clientY: 340 });
    expect(orders).toEqual([]);
    expect(attackTapOrder(ctx({ selfPos: null }))).toBeNull();
  });
});

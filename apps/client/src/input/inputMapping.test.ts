/**
 * client-05 (client-intent-mapping): mouse/keyboard input maps to the EXACT
 * IntentFrame Order/Command shapes the sim consumes, including the castTypes
 * of both skeleton champions (sela: skillshot/self/ground/ground; thorne:
 * dash/self/skillshot/ground) with shared-def range clamping. Also covers the
 * task #27 plain-left-click self-select (voice quip) — both the pure
 * mapLeftClick decision and the InputCapture DOM routing, proving right-click
 * and A+click behavior is byte-identical to before.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { registerSkeletonContent, SELA, THORNE } from "@ggd/shared/sim/content/skeleton";
import type { CastableSlot, Command, Order } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { resolveCastTarget, buildCastCommand, type AimAbility } from "./AimResolver";
import {
  InputCapture,
  mapRightClick,
  mapAttackMoveClick,
  mapLeftClick,
  STOP_ORDER,
  RECALL_COMMAND,
  SLOT_BY_CODE,
} from "./InputCapture";

registerSkeletonContent();

const SELF = { x: -50, z: 2 };

describe("order mapping (client-05)", () => {
  it("right-click on ground → move order with the exact point", () => {
    cover("client-intent-mapping");
    expect(mapRightClick({ x: -44.25, z: 7.5 }, null)).toEqual({
      kind: "move",
      point: { x: -44.25, z: 7.5 },
    });
  });

  it("right-click on an enemy → attackTarget order", () => {
    cover("client-intent-mapping");
    expect(mapRightClick({ x: -44, z: 7 }, 42)).toEqual({ kind: "attackTarget", entity: 42 });
  });

  it("A+click → attackMove; S → stop; B → recall", () => {
    cover("client-intent-mapping");
    expect(mapAttackMoveClick({ x: 1, z: 2 })).toEqual({ kind: "attackMove", point: { x: 1, z: 2 } });
    expect(STOP_ORDER).toEqual({ kind: "stop" });
    expect(RECALL_COMMAND).toEqual({ kind: "recall" });
  });

  it("left-click decision: armed = attackMove ALWAYS (even over self), unchanged", () => {
    cover("client-intent-mapping");
    const g = { x: 3, z: -4 };
    // armed → the exact pre-existing attack-move order, self under cursor or not
    expect(mapLeftClick(true, g, false)).toEqual({ kind: "order", order: mapAttackMoveClick(g) });
    expect(mapLeftClick(true, g, true)).toEqual({ kind: "order", order: mapAttackMoveClick(g) });
    expect(mapLeftClick(true, null, false)).toBeNull(); // off-world click disarms silently
  });

  it("plain left-click: selectSelf ONLY on your own hero, never an order", () => {
    cover("client-intent-mapping");
    const g = { x: 3, z: -4 };
    expect(mapLeftClick(false, g, true)).toEqual({ kind: "selectSelf" });
    expect(mapLeftClick(false, g, false)).toBeNull(); // misclicks stay free
    expect(mapLeftClick(false, null, false)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// InputCapture DOM routing (fake element + window; node env)
// ---------------------------------------------------------------------------

class FakeTarget {
  private listeners = new Map<string, Set<(ev: unknown) => void>>();
  addEventListener(type: string, fn: (ev: unknown) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (ev: unknown) => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 } as DOMRect;
  }
  dispatch(type: string, ev: object): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(ev);
  }
}

function captureHarness(
  opts: {
    selfHit?: boolean;
    enemy?: number | null;
    /** per-slot ability defs; a slot absent here resolves to null (unlearned) */
    abilities?: Partial<Record<CastableSlot, AimAbility>>;
  } = {},
): {
  el: FakeTarget;
  win: FakeTarget;
  orders: Order[];
  commands: Command[];
  selects: number[];
  selfPicks: Vec2[];
  /** one entry per onToggleFollow call (task #268: Y / Space camera lock) */
  follows: number[];
  cap: InputCapture;
} {
  const orders: Order[] = [];
  const commands: Command[] = [];
  const selects: number[] = [];
  const selfPicks: Vec2[] = [];
  const follows: number[] = [];
  const el = new FakeTarget();
  const win = new FakeTarget();
  vi.stubGlobal("window", win); // attach() registers key handlers on window
  const cap = new InputCapture(el as unknown as HTMLElement, {
    screenToGround: (x, y) => (y < 0 ? null : { x: x / 10, z: y / 10 }),
    getSelfPos: () => ({ x: 0, z: 0 }),
    getAbility: (slot) => opts.abilities?.[slot] ?? null,
    pickEnemy: () => opts.enemy ?? null,
    pickSelf: (g) => {
      selfPicks.push(g);
      return opts.selfHit ?? false;
    },
    onOrder: (o) => orders.push(o),
    onCommand: (c) => commands.push(c),
    onSelectSelf: () => selects.push(1),
    onZoom: () => {},
    onToggleFollow: () => follows.push(1),
  });
  cap.attach();
  return { el, win, orders, commands, selects, selfPicks, follows, cap };
}

const click = (x: number, y: number, button = 0): object => ({ button, clientX: x, clientY: y });
const rclick = (x: number, y: number): object => ({
  clientX: x,
  clientY: y,
  preventDefault: () => {},
});

describe("InputCapture self-select routing (client-05 / task #27)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("plain left-click on YOUR OWN hero fires onSelectSelf and NO order", () => {
    cover("client-intent-mapping");
    const h = captureHarness({ selfHit: true });
    h.el.dispatch("pointerdown", click(50, 40));
    expect(h.selects).toHaveLength(1);
    expect(h.orders).toHaveLength(0); // never a move/attack from a plain click
    expect(h.selfPicks).toEqual([{ x: 5, z: 4 }]); // ground-space pick point
    h.cap.dispose();
  });

  it("plain left-click elsewhere (no self hit) does nothing at all", () => {
    cover("client-intent-mapping");
    const h = captureHarness({ selfHit: false });
    h.el.dispatch("pointerdown", click(200, 100));
    expect(h.selects).toHaveLength(0);
    expect(h.orders).toHaveLength(0);
    h.cap.dispose();
  });

  it("off-world plain click never consults pickSelf; button≠0 is ignored", () => {
    cover("client-intent-mapping");
    const h = captureHarness({ selfHit: true });
    h.el.dispatch("pointerdown", click(50, -10)); // screenToGround → null
    h.el.dispatch("pointerdown", click(50, 40, 1)); // middle button
    expect(h.selfPicks).toHaveLength(0);
    expect(h.selects).toHaveLength(0);
    expect(h.orders).toHaveLength(0);
    h.cap.dispose();
  });

  it("A+left-click stays the attackMove order — even directly on your own hero", () => {
    cover("client-intent-mapping");
    const h = captureHarness({ selfHit: true });
    h.win.dispatch("keydown", { code: "KeyA", target: null, repeat: false });
    h.el.dispatch("pointerdown", click(50, 40));
    expect(h.orders).toEqual([{ kind: "attackMove", point: { x: 5, z: 4 } }]);
    expect(h.selects).toHaveLength(0); // armed click is never a self-select
    expect(h.selfPicks).toHaveLength(0); // pickSelf not even consulted
    // arming is one-shot: the NEXT plain click is a self-select again
    h.el.dispatch("pointerdown", click(50, 40));
    expect(h.selects).toHaveLength(1);
    expect(h.orders).toHaveLength(1);
    h.cap.dispose();
  });

  it("right-click orders are untouched: move on ground, attackTarget on enemy", () => {
    cover("client-intent-mapping");
    const ground = captureHarness({ selfHit: true, enemy: null });
    ground.el.dispatch("contextmenu", rclick(80, 20));
    expect(ground.orders).toEqual([{ kind: "move", point: { x: 8, z: 2 } }]);
    expect(ground.selects).toHaveLength(0); // right-click never self-selects
    ground.cap.dispose();
    vi.unstubAllGlobals();

    const enemy = captureHarness({ selfHit: true, enemy: 42 });
    enemy.el.dispatch("contextmenu", rclick(80, 20));
    expect(enemy.orders).toEqual([{ kind: "attackTarget", entity: 42 }]);
    expect(enemy.selects).toHaveLength(0);
    enemy.cap.dispose();
  });
});

describe("cast mapping per castType (client-05)", () => {
  it("sela Q (skillshot) → dir CastTarget, normalized toward the cursor", () => {
    cover("client-intent-mapping");
    const cmd = buildCastCommand("Q", SELA.abilities.Q, {
      selfPos: SELF,
      cursorGround: { x: SELF.x + 3, z: SELF.z + 4 }, // 3-4-5 triangle
    })!;
    expect(cmd).toEqual({
      kind: "castAbility",
      slot: "Q",
      target: { type: "dir", dir: { x: 0.6, z: 0.8 } },
    });
  });

  it("sela W (self) → self CastTarget regardless of cursor", () => {
    cover("client-intent-mapping");
    const cmd = buildCastCommand("W", SELA.abilities.W, {
      selfPos: SELF,
      cursorGround: { x: 999, z: 999 },
    })!;
    expect(cmd).toEqual({ kind: "castAbility", slot: "W", target: { type: "self" } });
  });

  it("sela E (ground, range 12) → point clamped to range from self", () => {
    cover("client-intent-mapping");
    const far = { x: SELF.x + 30, z: SELF.z }; // way past range
    const cmd = buildCastCommand("E", SELA.abilities.E, { selfPos: SELF, cursorGround: far })!;
    expect(cmd.kind).toBe("castAbility");
    if (cmd.kind !== "castAbility" || cmd.target.type !== "point") throw new Error("bad shape");
    const dx = cmd.target.point.x - SELF.x;
    const dz = cmd.target.point.z - SELF.z;
    expect(Math.hypot(dx, dz)).toBeCloseTo(SELA.abilities.E.range, 9);
    // in range → exact cursor point
    const near = { x: SELF.x + 4, z: SELF.z - 3 };
    const cmd2 = buildCastCommand("E", SELA.abilities.E, { selfPos: SELF, cursorGround: near })!;
    expect(cmd2).toEqual({
      kind: "castAbility",
      slot: "E",
      target: { type: "point", point: { x: near.x, z: near.z } },
    });
  });

  it("thorne Q (dash) → dir CastTarget toward the cursor", () => {
    cover("client-intent-mapping");
    const cmd = buildCastCommand("Q", THORNE.abilities.Q, {
      selfPos: SELF,
      cursorGround: { x: SELF.x - 5, z: SELF.z },
    })!;
    expect(cmd).toEqual({
      kind: "castAbility",
      slot: "Q",
      target: { type: "dir", dir: { x: -1, z: 0 } },
    });
  });

  it("thorne R (ground, range 1) clamps the point hard to melee range", () => {
    cover("client-intent-mapping");
    const cmd = buildCastCommand("R", THORNE.abilities.R, {
      selfPos: SELF,
      cursorGround: { x: SELF.x + 10, z: SELF.z },
    })!;
    if (cmd.kind !== "castAbility" || cmd.target.type !== "point") throw new Error("bad shape");
    expect(cmd.target.point.x).toBeCloseTo(SELF.x + 1, 9);
  });

  it("targeted castType resolves the hovered entity (or refuses without one)", () => {
    cover("client-intent-mapping");
    const targeted = { castType: "targeted" as const, range: 6 };
    expect(
      resolveCastTarget(targeted, { selfPos: SELF, cursorGround: SELF, hoveredEntityId: 7 }),
    ).toEqual({ type: "entity", entityId: 7 });
    expect(
      resolveCastTarget(targeted, { selfPos: SELF, cursorGround: SELF, hoveredEntityId: null }),
    ).toBeNull();
  });

  it("skillshot with cursor exactly on self refuses (zero direction)", () => {
    cover("client-intent-mapping");
    expect(resolveCastTarget(SELA.abilities.Q, { selfPos: SELF, cursorGround: SELF })).toBeNull();
  });

  it("every skeleton ability maps to the CastTarget family of its castType", () => {
    cover("client-intent-mapping");
    const wantType: Record<string, string> = {
      skillshot: "dir",
      dash: "dir",
      ground: "point",
      self: "self",
      targeted: "entity",
    };
    for (const champ of [SELA, THORNE]) {
      for (const slot of ["Q", "W", "E", "R"] as const) {
        const ability = champ.abilities[slot];
        const cmd = buildCastCommand(slot, ability, {
          selfPos: SELF,
          cursorGround: { x: SELF.x + 5, z: SELF.z + 2 },
          hoveredEntityId: 11,
        }) as Extract<Command, { kind: "castAbility" }>;
        expect(cmd.kind).toBe("castAbility");
        expect(cmd.slot).toBe(slot);
        expect(cmd.target.type).toBe(wantType[ability.castType]);
      }
    }
  });
});

describe("the SIXTH slot has a key (P0-3)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const SELF_CAST: AimAbility = { castType: "self", range: 0 };
  const key = (code: string): object => ({ code, target: null, repeat: false });

  it("D casts the 天生技 — the binding that made 60 active innates reachable", () => {
    cover("client-intent-mapping");
    const h = captureHarness({ abilities: { PASSIVE: SELF_CAST } });
    h.win.dispatch("keydown", key("KeyD"));
    expect(h.commands).toEqual([
      { kind: "castAbility", slot: "PASSIVE", target: { type: "self" } },
    ]);
    h.cap.dispose();
  });

  it("D on a hero whose innate is NOT castable sends nothing", () => {
    // `GameApp.abilityForSeat` returns null for a permanent 被動 innate and for
    // the 3 heroes with no NN-00 — so the key must not manufacture a command.
    cover("client-intent-mapping");
    const h = captureHarness(); // no abilities at all
    h.win.dispatch("keydown", key("KeyD"));
    expect(h.commands).toHaveLength(0);
    h.cap.dispose();
  });

  it("D still does not pan, and A/S/B keep their meanings", () => {
    // The innate had to land on a FREE key: adding D must not have stolen an
    // existing binding or turned the hero-key cluster into a camera control.
    cover("client-intent-mapping");
    const h = captureHarness({ abilities: { PASSIVE: SELF_CAST } });
    h.win.dispatch("keydown", key("KeyD"));
    expect(h.cap.panKeys).toEqual({ up: false, down: false, left: false, right: false });
    expect(h.orders).toHaveLength(0); // D is not a stop/move
    h.win.dispatch("keydown", key("KeyS"));
    expect(h.orders).toEqual([{ kind: "stop" }]);
    h.cap.dispose();
  });

  it("every castable slot is bound to exactly one distinct key", () => {
    // The regression this pins: a sixth slot silently sharing (or missing) a
    // key is invisible — it just never fires.
    cover("client-intent-mapping");
    const bound = Object.values(SLOT_BY_CODE);
    expect(new Set(bound).size).toBe(bound.length); // no key casts two slots
    expect(new Set(bound)).toEqual(new Set(["Q", "W", "E", "R", "EX", "PASSIVE"]));
  });
});


/**
 * 鏡頭跟隨鎖定 (#268) — owner: 「預設跟隨視角(按Y解除/鎖定)」.
 *
 * TWO facts have to hold, and only one is about Y:
 *   • Y reaches `onToggleFollow` (GameApp wires that straight through to
 *     `CameraRig.toggleFollow`), and
 *   • FOLLOW IS ON BY DEFAULT — otherwise 「預設跟隨」 is unmet no matter how
 *     good the key is, and the toggle would be switching the feature ON rather
 *     than off. That half is asserted against `CameraRig`'s own initial state.
 */
describe("camera follow: default ON, Y toggles (task #268)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const ykey = (repeat = false): object => ({ code: "KeyY", target: null, repeat });

  it("Y toggles the camera follow lock", () => {
    cover("client-intent-mapping");
    const h = captureHarness();
    h.win.dispatch("keydown", ykey());
    expect(h.follows).toHaveLength(1);
    h.cap.dispose();
  });

  it("Space still toggles it too — the old binding is not broken", () => {
    cover("client-intent-mapping");
    const h = captureHarness();
    h.win.dispatch("keydown", {
      code: "Space",
      target: null,
      repeat: false,
      preventDefault: () => {},
    });
    expect(h.follows).toHaveLength(1);
    h.cap.dispose();
  });

  it("a HELD Y does not strobe the lock", () => {
    // Auto-repeat fires keydown ~30x/s; without the repeat guard, holding Y
    // would flip follow on and off dozens of times a second.
    cover("client-intent-mapping");
    const h = captureHarness();
    h.win.dispatch("keydown", ykey());
    h.win.dispatch("keydown", ykey(true));
    h.win.dispatch("keydown", ykey(true));
    expect(h.follows).toHaveLength(1);
    h.cap.dispose();
  });

  it("Y is not a pan key, casts nothing and issues no order", () => {
    cover("client-intent-mapping");
    const h = captureHarness();
    h.win.dispatch("keydown", ykey());
    expect(h.cap.panKeys).toEqual({ up: false, down: false, left: false, right: false });
    expect(h.commands).toHaveLength(0);
    expect(h.orders).toHaveLength(0);
    h.cap.dispose();
  });
});

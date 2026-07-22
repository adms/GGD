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
import type { Command, Order } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { resolveCastTarget, buildCastCommand } from "./AimResolver";
import {
  InputCapture,
  mapRightClick,
  mapAttackMoveClick,
  mapLeftClick,
  STOP_ORDER,
  RECALL_COMMAND,
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

function captureHarness(opts: { selfHit?: boolean; enemy?: number | null } = {}): {
  el: FakeTarget;
  win: FakeTarget;
  orders: Order[];
  selects: number[];
  selfPicks: Vec2[];
  cap: InputCapture;
} {
  const orders: Order[] = [];
  const selects: number[] = [];
  const selfPicks: Vec2[] = [];
  const el = new FakeTarget();
  const win = new FakeTarget();
  vi.stubGlobal("window", win); // attach() registers key handlers on window
  const cap = new InputCapture(el as unknown as HTMLElement, {
    screenToGround: (x, y) => (y < 0 ? null : { x: x / 10, z: y / 10 }),
    getSelfPos: () => ({ x: 0, z: 0 }),
    getAbility: () => null,
    pickEnemy: () => opts.enemy ?? null,
    pickSelf: (g) => {
      selfPicks.push(g);
      return opts.selfHit ?? false;
    },
    onOrder: (o) => orders.push(o),
    onCommand: () => {},
    onSelectSelf: () => selects.push(1),
    onZoom: () => {},
    onToggleFollow: () => {},
  });
  cap.attach();
  return { el, win, orders, selects, selfPicks, cap };
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

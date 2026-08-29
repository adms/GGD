/**
 * TouchInput — Wild-Rift-style touch controls for iPhone (iOS Safari /
 * WKWebView; landscape).
 *
 *   LEFT half   floating virtual joystick: touchstart anchors the stick
 *               center, the drag vector (radial deadzone 0.12, radius 64px)
 *               issues continuous move orders exactly like the gamepad left
 *               stick (order move to self + dir*MOVE_LEAD, coalesced by
 *               IntentSender). Release stops ISSUING — the last order
 *               finishes, matching mouse/pad feel.
 *   RIGHT side  ability buttons Q/W/E/R + a big basic-attack button (the
 *               React chrome lives in ui/TouchControls.tsx). TAP = quick cast
 *               through the SAME buildCastCommand path the mouse and pads
 *               use; PRESS-AND-DRAG = aim mode (line/disc indicator via the
 *               render/AimIndicator seam), RELEASE casts with that aim, and
 *               dragging back into the cancel zone aborts.
 *
 * Layering mirrors GamepadInput: pure mapping helpers (unit-tested in node,
 * fed synthetic touch records — the same {identifier, clientX, clientY}
 * triples real TouchEvents deliver) + a thin `TouchController` that owns the
 * per-touch-identifier state machine and the DOM wiring. Per-frame joystick /
 * aim state rides the plain-mutable `touchFrame` (frameBus pattern — NEVER
 * React state); the React layer renders only button chrome / cooldown sweeps.
 * NO @babylonjs imports here (client-08).
 */
import { asEntityId } from "@ggd/shared/ids";
import type { CastableSlot, Command, Order } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { buildCastCommand, type AimAbility } from "./AimResolver";
import { allyPickablesFor } from "./allyTargets";
import {
  stickToWorld,
  MOVE_LEAD,
  GROUND_CAST_MAX,
  BASIC_ATTACK_RANGE,
} from "./GamepadInput";
import { pickNearestUnit, type PickableUnit } from "./Picking";

export const TOUCH_DEADZONE = 0.12;
/** joystick ring radius in CSS px — full deflection at the rim */
export const JOYSTICK_RADIUS_PX = 64;
/** finger travel beyond this = drag-aim mode (under it, release = tap cast) */
export const AIM_START_PX = 18;
/** drag distance for full aim deflection (mag 1.0) */
export const AIM_DRAG_RADIUS_PX = 96;
/** releasing an aim drag within this of the press point cancels the cast */
export const CANCEL_RADIUS_PX = 28;
/** epsilon deadzone for aim-drag normalization (guards divide-by-zero) */
const AIM_EPS = 1e-6;

/**
 * The touch buttons: every CASTABLE slot plus the basic-attack button.
 *
 * `CastableSlot`, so the SIXTH slot (the 天生技) is a real touch button and not a
 * decoration: a phone player must be able to fire everything the hero owns.
 * "PASSIVE" only ever arrives here for an `innateKind: "active"` innate — the
 * bar refuses to hand a permanent 被動 tile a press handler at all.
 */
export type TouchButton = CastableSlot | "ATTACK";

// ---------------------------------------------------------------------------
// structural touch-event shapes (real TouchEvents satisfy these; tests
// synthesize them — no jsdom needed)
// ---------------------------------------------------------------------------

export interface TouchPointLike {
  identifier: number;
  clientX: number;
  clientY: number;
}

export interface TouchEventLike {
  changedTouches: ArrayLike<TouchPointLike>;
  preventDefault?(): void;
}

// ---------------------------------------------------------------------------
// pure mapping helpers
// ---------------------------------------------------------------------------

/**
 * Joystick drag (CSS px from the anchor) → world-space unit move direction.
 * Screen-up = world +Z, screen-right = world +X — identical to the gamepad
 * stick mapping (stickToWorld handles the Y flip + radial deadzone).
 */
export function joystickDir(
  dx: number,
  dy: number,
  radius = JOYSTICK_RADIUS_PX,
  deadzone = TOUCH_DEADZONE,
): Vec2 | null {
  return stickToWorld(dx / radius, dy / radius, deadzone);
}

/** Continuous joystick move order — the gamepad left-stick semantics. */
export function touchMoveOrder(self: Vec2, dir: Vec2): Order {
  return {
    kind: "move",
    point: { x: self.x + dir.x * MOVE_LEAD, z: self.z + dir.z * MOVE_LEAD },
  };
}

/** Everything about the local player the touch mapping needs (per-frame). */
export interface TouchPlayerCtx {
  selfPos: Vec2 | null;
  /** authoritative facing (fx,fz) — tap-cast fallback direction */
  facing: Vec2 | null;
  ability(slot: CastableSlot): (AimAbility & { radius?: number }) | null;
  /** live enemy champions as pickable circles (view-space) */
  enemyUnits(): PickableUnit[];
  /**
   * ⭐ 隊友（含自己）作為可挑選的圓（GH#722）—— 友方指定技能唯一的候選來源。
   *
   * ⛔ **選用**：`TouchController` 在呼叫這一族純函式之前補上出貨的
   * `allyTargets.allyPickablesFor(0)`，所以省略它的既有呼叫端（與既有夾具）
   * 逐位元不變，而**真的觸控路徑仍然是活的**。
   */
  allyUnits?(): PickableUnit[];
}

/** Direction from self toward the nearest enemy within maxRange, or null. */
export function nearestEnemyDir(self: Vec2, units: PickableUnit[], maxRange: number): Vec2 | null {
  const id = pickNearestUnit(self, units, maxRange, null);
  if (id === null) return null;
  const u = units.find((v) => v.id === id);
  if (!u) return null;
  const dx = u.x - self.x;
  const dz = u.z - self.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-9) return null;
  return { x: dx / len, z: dz / len };
}

/**
 * TAP quick cast — resolved through buildCastCommand exactly like mouse/pad:
 *   skillshot/dash → toward the nearest enemy in range, else facing
 *   ground         → point at min(range, GROUND_CAST_MAX) toward facing
 *   self           → self
 *   targeted       → nearest enemy in range (no target → no command)
 */
export function tapCastCommand(
  slot: CastableSlot,
  ability: AimAbility,
  ctx: TouchPlayerCtx,
): Command | null {
  const self = ctx.selfPos;
  if (!self) return null;
  const facing = ctx.facing ?? { x: 0, z: 1 };
  const units = ctx.enemyUnits();
  const dir =
    ability.castType === "skillshot" || ability.castType === "dash"
      ? (nearestEnemyDir(self, units, ability.range) ?? facing)
      : facing;
  const reach = Math.min(ability.range, GROUND_CAST_MAX);
  const cursorGround = { x: self.x + dir.x * reach, z: self.z + dir.z * reach };
  const targeted = ability.castType === "targeted";
  const hovered = targeted ? pickNearestUnit(self, units, ability.range, facing) : null;
  // ⭐ GH#722 —— 兩側都送，側別由 `resolveCastTarget` 決定（⛔ 不在這裡分岔）。
  const ally = targeted
    ? pickNearestUnit(self, ctx.allyUnits?.() ?? [], ability.range, facing)
    : null;
  return buildCastCommand(slot, ability, {
    selfPos: self,
    cursorGround,
    hoveredEntityId: hovered,
    hoveredAllyId: ally,
  });
}

/**
 * DRAG-AIM release cast: `dir` is the world-space drag direction, `mag` the
 * clamped 0..1 drag magnitude (ground casts land at mag·min(range, 6)).
 */
export function aimCastCommand(
  slot: CastableSlot,
  ability: AimAbility,
  ctx: TouchPlayerCtx,
  dir: Vec2,
  mag: number,
): Command | null {
  const self = ctx.selfPos;
  if (!self) return null;
  const reach =
    ability.castType === "ground"
      ? Math.max(0.5, mag) * Math.min(ability.range, GROUND_CAST_MAX)
      : Math.min(ability.range, GROUND_CAST_MAX);
  const cursorGround = { x: self.x + dir.x * reach, z: self.z + dir.z * reach };
  const targeted = ability.castType === "targeted";
  const hovered = targeted ? pickNearestUnit(self, ctx.enemyUnits(), ability.range, dir) : null;
  // ⭐ GH#722 —— 同 `tapCastCommand`：兩側都送，側別在 `resolveCastTarget`。
  const ally = targeted ? pickNearestUnit(self, ctx.allyUnits?.() ?? [], ability.range, dir) : null;
  return buildCastCommand(slot, ability, {
    selfPos: self,
    cursorGround,
    hoveredEntityId: hovered,
    hoveredAllyId: ally,
  });
}

/** Basic-attack button — the gamepad LT semantics (attackTarget nearest). */
export function attackTapOrder(ctx: TouchPlayerCtx): Order | null {
  const self = ctx.selfPos;
  if (!self) return null;
  const id = pickNearestUnit(self, ctx.enemyUnits(), BASIC_ATTACK_RANGE, ctx.facing ?? null);
  return id === null ? null : { kind: "attackTarget", entity: asEntityId(id) };
}

// ---------------------------------------------------------------------------
// per-frame shared mutable state (frameBus pattern — never React state)
// ---------------------------------------------------------------------------

export interface TouchJoystickFrame {
  active: boolean;
  /** anchor center, CSS px (client coords) */
  baseX: number;
  baseY: number;
  /** knob position clamped to the ring, CSS px */
  knobX: number;
  knobY: number;
}

export interface TouchAimFrame {
  /** an ability button is currently pressed */
  active: boolean;
  slot: CastableSlot | null;
  /** true once the drag left the tap threshold */
  aiming: boolean;
  /** true when releasing now would cancel */
  inCancelZone: boolean;
}

/** What the render-side aim indicator should draw this frame. */
export type AimIndicatorState =
  | { kind: "line"; fromX: number; fromZ: number; dirX: number; dirZ: number; length: number }
  | { kind: "disc"; x: number; z: number; radius: number }
  // hold-to-preview (task #152): a cast-RANGE ring centred on the CASTER plus an
  // AoE disc centred on WHERE THE SHOT LANDS, while an ability button is
  // PRESSED-AND-HELD (touch finger or desktop mouse). `range`/`radius` are
  // already post-#136 `abilityRange`; a null `radius` = no AoE, disc skipped.
  //
  // ⭐ GH#415 —— `aoeX`/`aoeZ` are a SEPARATE centre from `x`/`z` on purpose.
  // owner 2026-08-19:「技能**範圍指示**應該是在**我的滑鼠上**，⛔ 不是以英雄
  // 自身座標為圓心（**施法距離**才是）」。Before this they were one point, so a
  // `ground` cast drew its blast circle under the caster's feet while the shot
  // landed at the cursor — a circle in the WRONG PLACE, which players stand by.
  // ⚠️ `aoeX`/`aoeZ` come from `resolveAoeCenter`, i.e. already clamped to range;
  // null = don't draw the AoE circle at all (skillshot corridor, or no target).
  | {
      kind: "range";
      x: number;
      z: number;
      range: number;
      radius: number | null;
      aoeX: number | null;
      aoeZ: number | null;
    }
  | null;

export interface TouchFrame {
  joystick: TouchJoystickFrame;
  aim: TouchAimFrame;
  indicator: AimIndicatorState;
}

export const touchFrame: TouchFrame = {
  joystick: { active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 },
  aim: { active: false, slot: null, aiming: false, inCancelZone: false },
  indicator: null,
};

export function resetTouchFrame(): void {
  touchFrame.joystick.active = false;
  touchFrame.aim.active = false;
  touchFrame.aim.slot = null;
  touchFrame.aim.aiming = false;
  touchFrame.aim.inCancelZone = false;
  touchFrame.indicator = null;
}

// ---------------------------------------------------------------------------
// controller — per-identifier touch state machine + DOM wiring
// ---------------------------------------------------------------------------

export interface TouchControllerDeps {
  ctx(): TouchPlayerCtx;
  onOrder(order: Order): void;
  onCommand(cmd: Command): void;
  /** left-half hit test for joystick anchoring (client coords) */
  isJoystickArea(clientX: number, clientY: number): boolean;
}

interface AbilityTouch {
  id: number;
  button: TouchButton;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  /** latched once the drag exceeds AIM_START_PX */
  aiming: boolean;
}

/** 觸控的友方候選 —— 一個裝置一雙手 ⇒ 永遠是 1P。模組層常數 ⇒ ⛔ 每幀零配置。 */
const TOUCH_ALLY_UNITS = (): PickableUnit[] => allyPickablesFor(0);

export class TouchController {
  private joyId: number | null = null;
  private joyBaseX = 0;
  private joyBaseY = 0;
  private joyCurX = 0;
  private joyCurY = 0;
  private ability: AbilityTouch | null = null;
  private disposers: (() => void)[] = [];

  constructor(private readonly deps: TouchControllerDeps) {}

  /** Wire canvas/window touch listeners (non-passive: we own the gestures). */
  attach(canvas: HTMLElement, win: Window = window): void {
    const opts: AddEventListenerOptions = { passive: false };
    const on = (target: HTMLElement | Window, type: string, fn: (ev: never) => void): void => {
      target.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(canvas, "touchstart", (ev: TouchEvent) => this.canvasTouchStart(ev));
    on(win, "touchmove", (ev: TouchEvent) => this.touchMove(ev));
    on(win, "touchend", (ev: TouchEvent) => this.touchEnd(ev));
    on(win, "touchcancel", (ev: TouchEvent) => this.touchCancel(ev));
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.joyId = null;
    this.ability = null;
    resetTouchFrame();
  }

  // ------------------------------------------------------------- events --

  /** Canvas touchstart: left-half touches anchor the floating joystick. */
  canvasTouchStart(ev: TouchEventLike): void {
    let claimed = false;
    for (let i = 0; i < ev.changedTouches.length; i++) {
      const t = ev.changedTouches[i]!;
      if (this.joyId === null && this.deps.isJoystickArea(t.clientX, t.clientY)) {
        this.joyId = t.identifier;
        this.joyBaseX = this.joyCurX = t.clientX;
        this.joyBaseY = this.joyCurY = t.clientY;
        claimed = true;
      }
    }
    // no scroll / zoom / double-tap on the game surface
    if (claimed || ev.changedTouches.length > 0) ev.preventDefault?.();
  }

  /**
   * Ability/attack button press (called by ui/TouchControls on touchstart —
   * touch events keep firing move/end at the START target and bubble to
   * window, so the controller tracks the rest by identifier).
   */
  buttonTouchStart(button: TouchButton, t: TouchPointLike): void {
    if (this.ability !== null) return; // one ability finger at a time
    if (button === "ATTACK") {
      // LT semantics — fire immediately on press, no drag state
      const order = attackTapOrder(this.deps.ctx());
      if (order) this.deps.onOrder(order);
      return;
    }
    this.ability = {
      id: t.identifier,
      button,
      startX: t.clientX,
      startY: t.clientY,
      curX: t.clientX,
      curY: t.clientY,
      aiming: false,
    };
  }

  touchMove(ev: TouchEventLike): void {
    let tracked = false;
    for (let i = 0; i < ev.changedTouches.length; i++) {
      const t = ev.changedTouches[i]!;
      if (t.identifier === this.joyId) {
        this.joyCurX = t.clientX;
        this.joyCurY = t.clientY;
        tracked = true;
      } else if (this.ability && t.identifier === this.ability.id) {
        this.ability.curX = t.clientX;
        this.ability.curY = t.clientY;
        const len = Math.hypot(t.clientX - this.ability.startX, t.clientY - this.ability.startY);
        if (len > AIM_START_PX) this.ability.aiming = true;
        tracked = true;
      }
    }
    if (tracked) ev.preventDefault?.();
  }

  touchEnd(ev: TouchEventLike): void {
    for (let i = 0; i < ev.changedTouches.length; i++) {
      const t = ev.changedTouches[i]!;
      if (t.identifier === this.joyId) {
        this.joyId = null; // stop issuing — the last move order finishes
      } else if (this.ability && t.identifier === this.ability.id) {
        this.releaseAbility(this.ability, t.clientX, t.clientY);
        this.ability = null;
      }
    }
  }

  touchCancel(ev: TouchEventLike): void {
    for (let i = 0; i < ev.changedTouches.length; i++) {
      const t = ev.changedTouches[i]!;
      if (t.identifier === this.joyId) this.joyId = null;
      else if (this.ability && t.identifier === this.ability.id) this.ability = null; // no cast
    }
  }

  /**
   * ⭐ GH#722 —— 補上出貨的友方候選來源。
   *
   * ⚠️ 這裡（**類別**）而不是 `tapCastCommand`（**純函式**）是刻意的：那一族
   * 純函式的既有夾具餵一個物件就好，而**真的觸控路徑**必須是活的。
   * ⇒ 和手把 poller 補 `feel` / `abilityRangeMult` 完全同一個形狀。
   * ⛔ 呼叫端自己給了 `allyUnits` 就用它的（測試可以覆寫）。
   *
   * ⚠️ 寫死 **1P**：一個裝置只有一雙手，`GameApp` 也只替 player 0 建這一支
   *   （`localSelfPos()` / `playerTeam(0)`）。⛔ couch 的 2..4P 是純手把，
   *   他們那一條在 `MultiGamepadSystem`（見 `allyTargets.casterOf`）。
   */
  private playerCtx(): TouchPlayerCtx {
    const base = this.deps.ctx();
    return base.allyUnits ? base : { ...base, allyUnits: TOUCH_ALLY_UNITS };
  }

  private releaseAbility(a: AbilityTouch, endX: number, endY: number): void {
    if (a.button === "ATTACK") return;
    const slot = a.button;
    const ability = this.deps.ctx().ability(slot);
    if (!ability) return;
    if (!a.aiming) {
      const cmd = tapCastCommand(slot, ability, this.playerCtx());
      if (cmd) this.deps.onCommand(cmd);
      return;
    }
    const dx = endX - a.startX;
    const dy = endY - a.startY;
    if (Math.hypot(dx, dy) <= CANCEL_RADIUS_PX) return; // cancel zone
    const dir = stickToWorld(dx / AIM_DRAG_RADIUS_PX, dy / AIM_DRAG_RADIUS_PX, AIM_EPS);
    if (!dir) return;
    const mag = Math.min(1, Math.hypot(dx, dy) / AIM_DRAG_RADIUS_PX);
    const cmd = aimCastCommand(slot, ability, this.playerCtx(), dir, mag);
    if (cmd) this.deps.onCommand(cmd);
  }

  // --------------------------------------------------------------- frame --

  /**
   * Once per rAF frame (before the IntentSender flush): issue the coalesced
   * joystick move order and publish joystick/aim state onto touchFrame.
   */
  poll(): void {
    const j = touchFrame.joystick;
    if (this.joyId !== null) {
      const dx = this.joyCurX - this.joyBaseX;
      const dy = this.joyCurY - this.joyBaseY;
      const dir = joystickDir(dx, dy);
      // knob clamped to the ring
      const len = Math.hypot(dx, dy);
      const k = len > JOYSTICK_RADIUS_PX ? JOYSTICK_RADIUS_PX / len : 1;
      j.active = true;
      j.baseX = this.joyBaseX;
      j.baseY = this.joyBaseY;
      j.knobX = this.joyBaseX + dx * k;
      j.knobY = this.joyBaseY + dy * k;
      if (dir) {
        const self = this.deps.ctx().selfPos;
        if (self) this.deps.onOrder(touchMoveOrder(self, dir));
      }
    } else {
      j.active = false;
    }
    this.publishAim();
  }

  private publishAim(): void {
    const a = touchFrame.aim;
    const t = this.ability;
    if (!t || t.button === "ATTACK") {
      a.active = false;
      a.slot = null;
      a.aiming = false;
      a.inCancelZone = false;
      touchFrame.indicator = null;
      return;
    }
    a.active = true;
    a.slot = t.button;
    a.aiming = t.aiming;
    const dx = t.curX - t.startX;
    const dy = t.curY - t.startY;
    const len = Math.hypot(dx, dy);
    a.inCancelZone = t.aiming && len <= CANCEL_RADIUS_PX;
    touchFrame.indicator = this.indicatorFor(t, dx, dy, len);
  }

  private indicatorFor(t: AbilityTouch, dx: number, dy: number, len: number): AimIndicatorState {
    if (!t.aiming || t.button === "ATTACK" || touchFrame.aim.inCancelZone) return null;
    const ctx = this.deps.ctx();
    const self = ctx.selfPos;
    const ability = ctx.ability(t.button);
    if (!self || !ability) return null;
    const dir = stickToWorld(dx / AIM_DRAG_RADIUS_PX, dy / AIM_DRAG_RADIUS_PX, AIM_EPS);
    if (!dir) return null;
    switch (ability.castType) {
      case "skillshot":
      case "dash":
        return {
          kind: "line",
          fromX: self.x,
          fromZ: self.z,
          dirX: dir.x,
          dirZ: dir.z,
          length: ability.range,
        };
      case "ground": {
        const mag = Math.min(1, len / AIM_DRAG_RADIUS_PX);
        const reach = Math.max(0.5, mag) * Math.min(ability.range, GROUND_CAST_MAX);
        return {
          kind: "disc",
          x: self.x + dir.x * reach,
          z: self.z + dir.z * reach,
          radius: ability.radius ?? 1.2,
        };
      }
      case "targeted":
        return {
          kind: "line",
          fromX: self.x,
          fromZ: self.z,
          dirX: dir.x,
          dirZ: dir.z,
          length: Math.min(ability.range, GROUND_CAST_MAX),
        };
      case "self":
        return null;
    }
  }
}

// ---------------------------------------------------------------------------
// React ⇄ GameApp seam (like ui/actions.ts): the chrome needs the live
// controller to forward button presses; GameApp registers it per match.
// ---------------------------------------------------------------------------

let active: TouchController | null = null;

export function registerTouchController(c: TouchController | null): void {
  active = c;
}

export function activeTouchController(): TouchController | null {
  return active;
}

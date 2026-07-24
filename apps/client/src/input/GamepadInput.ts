/**
 * GamepadInput — twin-stick console-MOBA controls (SMITE/Battlerite style).
 *
 * Layering (built for the local-multiplayer follow-up — N pads, N players):
 *   - `GamepadInput` — ONE instance per physical pad index; `poll()` snapshots
 *     that pad into a `GamepadFrame` (deadzoned world-space sticks + button
 *     edges). No game knowledge.
 *   - `mapGamepadFrame(frame, ctx)` — PURE mapping of one frame + one
 *     player's context (pos/facing/abilities/target query) onto Order/aim/
 *     Command shapes. Reused per local player.
 *   - `GamepadSystem` — connect/disconnect tracking; wires the most recently
 *     connected pad into the intent path (single-player wiring for now).
 *
 * Mapping: LEFT stick moves (continuous move orders, IntentSender coalesces;
 * release does NOT stop — the last point finishes, matching mouse feel).
 * RIGHT stick aims (streamed; remembered as lastAimDir). A/B/X/Y cast
 * Q/W/E/R resolved per castType exactly like the mouse AimResolver. RT
 * attack-moves, LT basic-attacks the nearest enemy, LB recalls, RB stops,
 * Back casts the per-hero EX skill, D-pad up casts the 天生技 innate (6th slot),
 * Start readies. Coexists with mouse/keyboard: both feed the same
 * IntentSender, last writer wins. NO @babylonjs imports here (client-08).
 */
import { asEntityId } from "@ggd/shared/ids";
import type { AbilitySlot, CastableSlot, Command, Order } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { abilityActivationCue } from "../ui/abilityCue";
import { buildCastCommand, type AimAbility } from "./AimResolver";
import { isPadMenuCapturing } from "./padMenuCapture";

export const GAMEPAD_DEADZONE = 0.15;
/** How far ahead of the champion a stick-move order targets. */
export const MOVE_LEAD = 4;
/** Attack-move lead distance (RT). */
export const ATTACK_MOVE_LEAD = 5;
/** Ground-targeted casts land at most this far out on a stick. */
export const GROUND_CAST_MAX = 6;
/** LT basic-attack target search radius. */
export const BASIC_ATTACK_RANGE = 12;

/** Standard-mapping button indices. */
export const BTN = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  /**
   * D-pad UP (standard mapping index 12). The 天生技's pad binding — see
   * {@link SLOT_BY_BUTTON}. The other three d-pad directions stay unbound.
   */
  DPAD_UP: 12,
} as const;

/**
 * Pad button → castable slot. Includes the SIXTH slot so the 天生技 is not a
 * keyboard-only ability: a couch player must be able to press every button the
 * hero owns, or the pad is quietly a five-slot version of the game.
 *
 * WHY THE D-PAD AND NOT A FACE BUTTON: A/B/X/Y are Q/W/E/R and Back is the EX —
 * every face button is spoken for, and re-assigning one would break the mapping
 * players already have. That leaves a stick click or the d-pad; the d-pad wins
 * because it is discrete (no accidental fire while moving), it is reachable
 * without leaving the left stick, and UP is its most findable direction. The
 * innate is a once-per-40-seconds button, not a rotation key, so the small
 * thumb move off the stick costs nothing in practice.
 */
const SLOT_BY_BUTTON: Partial<Record<number, CastableSlot>> = {
  [BTN.A]: "Q",
  [BTN.B]: "W",
  [BTN.X]: "E",
  [BTN.Y]: "R",
  [BTN.BACK]: "EX", // per-hero "EX 技能" (5th slot); no-op until unlocked
  [BTN.DPAD_UP]: "PASSIVE", // 天生技 (6th slot); owned from level 1, active kind only
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * THE HELD-SHOULDER MODIFIER LAYER (task #197)
 * ════════════════════════════════════════════════════════════════════════════
 * The base layer above spends EVERY face + shoulder + menu button, so the two
 * things a pad still could not reach — spending a skill point (rankUpAbility)
 * and steering the camera (zoom / free-pan / follow-toggle) — need a second
 * layer, not a seventh button. Holding the RIGHT BUMPER opens it:
 *
 *   RB + A/B/X/Y      →  rank up Q / W / E / R  (the `+` a mouse clicks)
 *   RB + LT / RT      →  zoom out / zoom in     (the wheel)
 *   RB + LB           →  toggle camera follow   (Space)
 *   RB + right stick  →  free-pan the camera    (arrow keys / edge-pan)
 *
 * WHY RB, AND WHY "HELD FROM A PREVIOUS FRAME". Every shoulder already has a
 * base action, so the modifier button unavoidably fires its own base action on
 * the press that starts the hold. RB's base action is `stop` — the ONE base
 * action that is safe to fire spuriously: you rank up while standing still after
 * a level, and an extra stop-order there is a no-op. (Recall on LB or an
 * attack-move on RT would not be.) The layer therefore only engages once RB has
 * been down for at least one frame — `held` contains it but `justPressed` does
 * not — so a quick RB tap is still a clean `stop`, and the base loop is skipped
 * only while the modifier is genuinely engaged.
 */
export const GAMEPAD_MODIFIER_BTN = BTN.RB;

/** Modifier layer: face button → the rankable slot its `+` raises. */
const RANK_BY_BUTTON: Partial<Record<number, AbilitySlot>> = {
  [BTN.A]: "Q",
  [BTN.B]: "W",
  [BTN.X]: "E",
  [BTN.Y]: "R",
};

/** Wheel-equivalent zoom step per modifier trigger press (see CameraRig.zoomBy). */
export const GAMEPAD_ZOOM_STEP = 120;

/** Camera ops a pad frame asks for (client-only; never a sim intent). */
export interface GamepadCameraIntent {
  /** wheel-equivalent dolly delta; positive = out, negative = in. */
  zoom?: number;
  /** continuous free-pan direction (world XZ unit vector) while the stick holds. */
  pan?: Vec2;
  /** flip the camera follow-lock this frame. */
  toggleFollow?: boolean;
}

/**
 * Radial deadzone + gamepad→world mapping. Pad up (-Y axis) is world +Z
 * (the camera looks along +Z), pad right is world +X. Returns a unit
 * direction, or null inside the deadzone.
 */
export function stickToWorld(ax: number, ay: number, deadzone = GAMEPAD_DEADZONE): Vec2 | null {
  const len = Math.sqrt(ax * ax + ay * ay);
  if (len < deadzone) return null;
  return { x: ax / len, z: -ay / len };
}

/** Minimal structural view of a Gamepad (tests inject fakes). */
export interface PadState {
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
}

/** One polled snapshot of one pad. */
export interface GamepadFrame {
  /** world-space unit move direction (left stick), null in deadzone */
  move: Vec2 | null;
  /** world-space unit aim direction (right stick), null in deadzone */
  aim: Vec2 | null;
  /** button indices that went down since the previous poll (edge detect) */
  justPressed: number[];
  /**
   * button indices held DOWN this frame (level, not edge). Optional so the
   * legend's synthetic single-button probes and older callers stay valid; the
   * modifier layer (task #197) reads it to know the RIGHT BUMPER is engaged.
   */
  held?: number[];
}

/** Everything about ONE local player the pure mapping needs. */
export interface GamepadPlayerCtx {
  selfPos: Vec2 | null;
  /** authoritative facing (fx,fz) — aim fallback of last resort */
  facing: Vec2 | null;
  /** last right-stick direction (caller-owned per-player state) */
  lastAimDir: Vec2 | null;
  ability(slot: CastableSlot): AimAbility | null;
  /** nearest valid enemy from a point, biased along aimDir when given */
  nearestEnemy(from: Vec2, maxRange: number, aimDir: Vec2 | null): number | null;
}

export interface GamepadIntent {
  order?: Order;
  /** streamed aim (right stick), when deflected */
  aim?: Vec2;
  commands: Command[];
  /** camera ops from the held-shoulder modifier layer (task #197). */
  camera?: GamepadCameraIntent;
}

/** PURE frame → intent mapping (reused per local player). */
export function mapGamepadFrame(frame: GamepadFrame, ctx: GamepadPlayerCtx): GamepadIntent {
  const commands: Command[] = [];
  let order: Order | undefined;

  const self = ctx.selfPos;
  const aimDir = frame.aim ?? ctx.lastAimDir ?? ctx.facing ?? null;

  // LEFT stick — continuous move order toward a short lead point (BOTH layers:
  // you may still reposition while ranking up / panning).
  if (frame.move && self) {
    order = {
      kind: "move",
      point: { x: self.x + frame.move.x * MOVE_LEAD, z: self.z + frame.move.z * MOVE_LEAD },
    };
  }

  // MODIFIER LAYER — RIGHT BUMPER held from a previous frame (so a plain RB tap
  // stays a clean `stop`; see GAMEPAD_MODIFIER_BTN). While engaged, the base
  // per-button loop is skipped and the right stick pans instead of aiming.
  const held = frame.held;
  if (held && held.includes(GAMEPAD_MODIFIER_BTN) && !frame.justPressed.includes(GAMEPAD_MODIFIER_BTN)) {
    let camera: GamepadCameraIntent | undefined;
    const cam = (patch: GamepadCameraIntent): void => {
      camera = { ...camera, ...patch };
    };
    for (const b of frame.justPressed) {
      const rankSlot = RANK_BY_BUTTON[b];
      if (rankSlot) {
        commands.push({ kind: "rankUpAbility", slot: rankSlot });
      } else if (b === BTN.LT) {
        cam({ zoom: (camera?.zoom ?? 0) + GAMEPAD_ZOOM_STEP }); // wheel out
      } else if (b === BTN.RT) {
        cam({ zoom: (camera?.zoom ?? 0) - GAMEPAD_ZOOM_STEP }); // wheel in
      } else if (b === BTN.LB) {
        cam({ toggleFollow: true });
      }
    }
    // right stick → free-pan (only bites once follow is off, exactly like the
    // arrow keys); a deflected stick pans, a centred one leaves `pan` unset.
    if (frame.aim) cam({ pan: frame.aim });
    const modOut: GamepadIntent = { commands };
    if (order) modOut.order = order;
    if (camera) modOut.camera = camera;
    return modOut;
  }

  for (const b of frame.justPressed) {
    const slot = SLOT_BY_BUTTON[b];
    if (slot && self) {
      const ability = ctx.ability(slot);
      if (!ability) continue;
      const dir = aimDir ?? { x: 0, z: 1 };
      const reach = Math.min(ability.range, GROUND_CAST_MAX);
      // a virtual "cursor" along the aim direction lets the mouse AimResolver
      // do the castType-specific work (skillshot dir / ground clamp / self)
      const cursorGround = { x: self.x + dir.x * reach, z: self.z + dir.z * reach };
      const hovered =
        ability.castType === "targeted" ? ctx.nearestEnemy(self, ability.range, aimDir) : null;
      const cmd = buildCastCommand(slot, ability, { selfPos: self, cursorGround, hoveredEntityId: hovered });
      if (cmd) commands.push(cmd);
    } else if (b === BTN.RT && self) {
      const dir = frame.move ?? aimDir;
      if (dir) {
        order = {
          kind: "attackMove",
          point: { x: self.x + dir.x * ATTACK_MOVE_LEAD, z: self.z + dir.z * ATTACK_MOVE_LEAD },
        };
      }
    } else if (b === BTN.LT && self) {
      const id = ctx.nearestEnemy(self, BASIC_ATTACK_RANGE, aimDir);
      if (id !== null) order = { kind: "attackTarget", entity: asEntityId(id) };
    } else if (b === BTN.RB) {
      order = { kind: "stop" };
    } else if (b === BTN.LB) {
      commands.push({ kind: "recall" });
    } else if (b === BTN.START) {
      commands.push({ kind: "ready" });
    }
  }

  const out: GamepadIntent = { commands };
  if (order) out.order = order;
  if (frame.aim) out.aim = frame.aim;
  return out;
}

/** Reads one physical pad by index (injectable for tests). */
export class GamepadInput {
  private prevPressed: boolean[] = [];

  constructor(
    readonly gamepadIndex: number,
    private readonly readPad?: () => PadState | null,
  ) {}

  private currentPad(): PadState | null {
    if (this.readPad) return this.readPad();
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    return navigator.getGamepads()[this.gamepadIndex] ?? null;
  }

  /** Snapshot the pad; null when absent/disconnected. */
  poll(): GamepadFrame | null {
    const pad = this.currentPad();
    if (!pad || !pad.connected) {
      this.prevPressed = [];
      return null;
    }
    const justPressed: number[] = [];
    const held: number[] = [];
    const pressed: boolean[] = [];
    for (let i = 0; i < pad.buttons.length; i++) {
      const down = pad.buttons[i]?.pressed === true;
      pressed.push(down);
      if (down) held.push(i);
      if (down && !this.prevPressed[i]) justPressed.push(i);
    }
    this.prevPressed = pressed;
    return {
      move: stickToWorld(pad.axes[0] ?? 0, pad.axes[1] ?? 0),
      aim: stickToWorld(pad.axes[2] ?? 0, pad.axes[3] ?? 0),
      justPressed,
      held,
    };
  }
}

/**
 * Dev/test fake-pad seam: anything pushed into `globalThis.__ggdFakePads`
 * (an array of PadState) is appended to the real navigator pads. Lets dev
 * tooling and live checks spoof N pads without hardware.
 */
export function listPadSources(): (PadState | null)[] {
  const real: (PadState | null)[] =
    typeof navigator !== "undefined" && navigator.getGamepads
      ? (navigator.getGamepads() as (PadState | null)[])
      : [];
  const fake = (globalThis as { __ggdFakePads?: (PadState | null)[] }).__ggdFakePads;
  return fake && fake.length > 0 ? [...real, ...fake] : real;
}

/** Connected pad indices (real + injected fakes), ascending. */
export function connectedPadIndices(pads: (PadState | null)[] = listPadSources()): number[] {
  const out: number[] = [];
  for (let i = 0; i < pads.length; i++) {
    if (pads[i]?.connected) out.push(i);
  }
  return out;
}

export interface GamepadSinks {
  onOrder(order: Order): void;
  onAim(aim: Vec2): void;
  onCommand(cmd: Command): void;
  /** camera op from the modifier layer (zoom / free-pan / follow-toggle). */
  onCamera?(camera: GamepadCameraIntent): void;
  /** connected pad indices changed (discrete-rate; HUD indicator) */
  onPadsChanged(indices: number[]): void;
}

/** Player context providers (the per-frame live values). */
export type GamepadCtxProvider = () => Omit<GamepadPlayerCtx, "lastAimDir">;

/**
 * Connect/disconnect tracking + single-player wiring: the most recently
 * connected pad drives the local champion. (The local-multiplayer follow-up
 * replaces this with one GamepadInput+ctx per seat.)
 */
export class GamepadSystem {
  private readonly inputs = new Map<number, GamepadInput>();
  private activeIndex: number | null = null;
  private lastAimDir: Vec2 | null = null;
  private lastIndicesKey = "";
  private readonly disposers: (() => void)[] = [];

  constructor(
    private readonly sinks: GamepadSinks,
    private readonly ctxProvider: GamepadCtxProvider,
    private readonly listPads: () => (PadState | null)[] = listPadSources,
  ) {}

  attach(): void {
    if (typeof window === "undefined") return;
    const onConnect = (ev: GamepadEvent): void => {
      this.activeIndex = ev.gamepad.index;
    };
    const onDisconnect = (ev: GamepadEvent): void => {
      if (this.activeIndex === ev.gamepad.index) this.activeIndex = null;
      this.inputs.delete(ev.gamepad.index);
    };
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    this.disposers.push(() => window.removeEventListener("gamepadconnected", onConnect));
    this.disposers.push(() => window.removeEventListener("gamepaddisconnected", onDisconnect));
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.inputs.clear();
  }

  /** Poll once per rAF frame (before IntentSender.update). */
  poll(): void {
    const pads = this.listPads();
    const indices: number[] = [];
    for (let i = 0; i < pads.length; i++) {
      if (pads[i]?.connected) indices.push(i);
    }
    const key = indices.join(",");
    if (key !== this.lastIndicesKey) {
      this.lastIndicesKey = key;
      this.sinks.onPadsChanged(indices);
    }
    if (this.activeIndex === null || !indices.includes(this.activeIndex)) {
      this.activeIndex = indices.length > 0 ? indices[indices.length - 1]! : null;
    }
    if (this.activeIndex === null) return;

    let input = this.inputs.get(this.activeIndex);
    if (!input) {
      const idx = this.activeIndex;
      input = new GamepadInput(idx, () => this.listPads()[idx] ?? null);
      this.inputs.set(idx, input);
    }
    const frame = input.poll();
    if (!frame) return;

    const intent = mapGamepadFrame(frame, { ...this.ctxProvider(), lastAimDir: this.lastAimDir });
    if (frame.aim) this.lastAimDir = frame.aim;
    if (intent.order) this.sinks.onOrder(intent.order);
    if (intent.aim) this.sinks.onAim(intent.aim);
    if (intent.camera) this.sinks.onCamera?.(intent.camera);
    for (const cmd of intent.commands) {
      // pad A/B/X/Y/Back/d-pad-up cast → same click cue as tile/key (de-duped)
      if (cmd.kind === "castAbility") abilityActivationCue(cmd.slot);
      this.sinks.onCommand(cmd);
    }
  }
}

// ---------------------------------------------------------------------------
// Couch play — N local players, one pad each
// ---------------------------------------------------------------------------

/** Per-player sinks: everything is routed by local player index (0-based). */
export interface MultiGamepadSinks {
  onOrder(player: number, order: Order): void;
  onAim(player: number, aim: Vec2): void;
  onCommand(player: number, cmd: Command): void;
  /** camera op from player k's modifier layer (zoom / free-pan / follow). */
  onCamera?(player: number, camera: GamepadCameraIntent): void;
  /** raw button edge — GameApp uses this for champ-select pad picking */
  onButton?(player: number, button: number): void;
  /** connected pad indices changed (discrete-rate; HUD + join prompts) */
  onPadsChanged(indices: number[]): void;
}

/**
 * MultiGamepadSystem — couch-play pad routing. The k-th connected pad index
 * drives local player k (player 0 additionally has mouse/keyboard; both feed
 * the same IntentSender, last writer wins). Each player gets its OWN
 * GamepadInput (edge detection) and its own lastAimDir, so one pad's input
 * can never leak into another player's intent stream.
 */
export class MultiGamepadSystem {
  private readonly inputs = new Map<number, GamepadInput>();
  private readonly lastAim = new Map<number, Vec2>();
  private lastIndicesKey = "";

  constructor(
    private readonly playerCount: () => number,
    private readonly sinks: MultiGamepadSinks,
    private readonly ctxProvider: (player: number) => Omit<GamepadPlayerCtx, "lastAimDir">,
    private readonly listPads: () => (PadState | null)[] = listPadSources,
  ) {}

  dispose(): void {
    this.inputs.clear();
    this.lastAim.clear();
  }

  /** Poll once per rAF frame (before the IntentSender flushes). */
  poll(): void {
    const pads = this.listPads();
    const indices = connectedPadIndices(pads);
    const key = indices.join(",");
    if (key !== this.lastIndicesKey) {
      this.lastIndicesKey = key;
      this.sinks.onPadsChanged(indices);
    }

    const players = Math.max(1, this.playerCount());
    // A menu owns pad 0 (the first connected pad): while the DOM focus-nav layer
    // is driving screens with it, player 0's champion must NOT also move/cast off
    // the same sticks and buttons (task #197). Couch players 1..3 keep their pads.
    const menuOwnsPad0 = isPadMenuCapturing();
    for (let player = 0; player < players; player++) {
      const padIndex = indices[player];
      if (padIndex === undefined) continue; // fewer pads than players
      let input = this.inputs.get(padIndex);
      if (!input) {
        input = new GamepadInput(padIndex, () => this.listPads()[padIndex] ?? null);
        this.inputs.set(padIndex, input);
      }
      const frame = input.poll();
      if (!frame) continue;
      // Poll ran (edges stay fresh, so releasing the menu never fires a stale
      // press), but a menu-owned pad 0 emits NOTHING to the sim this frame.
      if (player === 0 && menuOwnsPad0) continue;

      for (const b of frame.justPressed) this.sinks.onButton?.(player, b);

      const intent = mapGamepadFrame(frame, {
        ...this.ctxProvider(player),
        lastAimDir: this.lastAim.get(player) ?? null,
      });
      if (frame.aim) this.lastAim.set(player, frame.aim);
      if (intent.order) this.sinks.onOrder(player, intent.order);
      if (intent.aim) this.sinks.onAim(player, intent.aim);
      if (intent.camera) this.sinks.onCamera?.(player, intent.camera);
      for (const cmd of intent.commands) {
        // pad cast → the shared button click cue (de-duped per slot)
        if (cmd.kind === "castAbility") abilityActivationCue(cmd.slot);
        this.sinks.onCommand(player, cmd);
      }
    }
  }
}

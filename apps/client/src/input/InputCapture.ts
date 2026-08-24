/**
 * InputCapture — DOM listeners → IntentFrame-shaped orders/commands.
 *   right-click        move order (or attackTarget when over an enemy)
 *   A + left-click     attackMove order (A also swaps in the attack cursor)
 *   plain left-click   on YOUR OWN hero → onSelectSelf (select voice quip);
 *                      anywhere else it stays inert (misclicks are free)
 *   Q/W/E/R keydown    quick-cast per the champion ability's castType
 *   F                  the per-hero EX skill (5th slot)
 *   D                  the 天生技 innate (6th slot) — see SLOT_BY_CODE
 *   …and HOLDING any of those six paints the 技能範圍指引 on the floor via the
 *   shared `ui/abilityHold` seam (GH#367); keyup / blur retracts it.
 *   S stop · B recall · Space camera follow toggle · wheel zoom
 * The pure mapping helpers are exported for unit tests (client-05); the class
 * only wires DOM events onto them. NO @babylonjs imports here — the ray comes
 * in via the injected screenToGround callback.
 */
import { asEntityId } from "@ggd/shared/ids";
import type { CastableSlot, Command, Order } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { setCursorVariant } from "../cursor";
import { abilityActivationCue } from "../ui/abilityCue";
import { clearHeldAbility, setHeldAbility } from "../ui/abilityHold";
import { rangeGuide } from "../ui/rangeGuideConfig";
import { buildCastCommand, type AimAbility } from "./AimResolver";
import { cancelTwoStageCast, getTwoStageArmedSlot } from "./mouseTwoStageCast";

/** Right-click: attack the hovered enemy, otherwise move to the point. */
export function mapRightClick(ground: Vec2, hoveredEnemyId: number | null): Order {
  if (hoveredEnemyId !== null) return { kind: "attackTarget", entity: asEntityId(hoveredEnemyId) };
  return { kind: "move", point: { x: ground.x, z: ground.z } };
}

/** A + click: attack-move toward the point. */
export function mapAttackMoveClick(ground: Vec2): Order {
  return { kind: "attackMove", point: { x: ground.x, z: ground.z } };
}

export type LeftClickAction = { kind: "order"; order: Order } | { kind: "selectSelf" } | null;

/**
 * Left-click (button 0) decision. An A-armed click is ALWAYS the attack-move —
 * your own hero under the cursor never swallows it. A plain click is a
 * self-select only when your own champion is hit, and otherwise nothing: plain
 * left-click must never issue an order (MOBA convention — misclicks are free).
 */
export function mapLeftClick(
  armed: boolean,
  ground: Vec2 | null,
  selfHit: boolean,
): LeftClickAction {
  if (armed) return ground ? { kind: "order", order: mapAttackMoveClick(ground) } : null;
  return ground && selfHit ? { kind: "selectSelf" } : null;
}

export const STOP_ORDER: Order = { kind: "stop" };
export const RECALL_COMMAND: Command = { kind: "recall" };
/**
 * 陣亡投幣 (task #191) — G, the dead player's one action. Unconditional here:
 * the SIM owns the "only the dead may throw" rule and emits a
 * `coinDropRejected` reason for every refused press, so gating the key too
 * would just produce a second, silent refusal path that could disagree with the
 * server.
 *
 * ⚠️ **這段話在 2026-08-23 之前是一句承重的謊**（CLAUDE.md 第三守則）。它拿
 * 「sim 會回答每一次被拒的按鍵」當作**不設閘的理由**，而那個回答在客戶端
 * **一個消費端都沒有** —— `game-server/src/net/eventFanout.ts` 自己的註解逐字
 * 寫著「this event currently has NO client consumer」。於是每一次 G、每一次
 * 觀戰橫幅上那顆按鈕，都是**純粹的靜默**：沒有 toast、沒有嗶聲、沒有抖動。
 * ⛔ 而它不是邊角 —— 出貨經濟保證每個玩家每一場都撞得到
 * （`goldDrop.coinValue × goldDrop.coinsPerRound` 遠大於 `match.startingGold`）。
 *
 * ⭐ 現在真的有消費端了：`ui/coinThrow.recordCoinEvent()`，掛在 `GameApp` 的事件
 * 排水口上（`ui/castFeedback` 的告示管線）。⇒ 這一段的理由重新成立，
 * 而 `ui/coinThrow.test.ts` 是讓它**不能再默默失效**的那條線。
 */
export const DROP_COIN_COMMAND: Command = { kind: "dropCoin" };

/**
 * Keyboard → slot. `CastableSlot`, so the SIXTH slot (the level-1 天生技) is in
 * the same table as the other five and inherits the whole quick-cast path.
 *
 * WHY **D** FOR THE INNATE — three reasons, in order of weight:
 *
 *  1. IT IS WHERE THE SOURCE MAP PUT IT. WC3's command card is a 4×3 grid whose
 *     default hotkeys run Q W E R / D F ... — the top row is the four spells and
 *     the second row starts at D. Every one of these 108 innates IS a WC3
 *     D-slot ability (`abilities/innateActive.ts` calls them that by name), so
 *     D is not a free choice at all: it is the key the owner's own map already
 *     trained his hands on, and F was already taken for the 5th slot on exactly
 *     the same logic.
 *  2. IT IS FREE AND ADJACENT. F is EX, so the innate sits next to it under the
 *     same finger, and D is the only remaining key in the WASD home cluster not
 *     already bound (A arms attack-move, S stops, W/E are spells). No existing
 *     binding moves, so nobody's muscle memory breaks.
 *  3. IT IS NOT A MODIFIER OR A FUNCTION KEY. A binding a family member cannot
 *     find is the same silence as no binding at all.
 *
 * D is NOT the only path: the touch arc button and the gamepad D-pad-up cast
 * the same slot (`ui/TouchControls`, `input/GamepadInput`). Binding it on the
 * keyboard alone would have rebuilt the exact "works on one input tree only"
 * shape this campaign exists to delete.
 */
export const SLOT_BY_CODE: Record<string, CastableSlot> = {
  KeyQ: "Q",
  KeyW: "W",
  KeyE: "E",
  KeyR: "R",
  KeyF: "EX", // per-hero "EX 技能" (5th slot); only fires once unlocked
  KeyD: "PASSIVE", // 天生技 (6th slot) — the WC3 D-slot innate, owned from level 1
};

export interface CursorState {
  /** last pointer position in CSS px relative to the canvas */
  x: number;
  y: number;
  inside: boolean;
}

export interface PanKeys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface InputDeps {
  /** cursor → ground plane (from the camera rig); null when off-world */
  screenToGround(clientX: number, clientY: number): Vec2 | null;
  /** local champion's current (predicted) position */
  getSelfPos(): Vec2 | null;
  /** shared ability def (castType/range) for the local champion's slot */
  getAbility(slot: CastableSlot): AimAbility | null;
  /** enemy entity under a ground point (server's circle model) */
  pickEnemy(ground: Vec2): number | null;
  /** true when the LOCAL player's own champion is under the ground point */
  pickSelf(ground: Vec2): boolean;
  onOrder(order: Order): void;
  onCommand(cmd: Command): void;
  /** plain left-click landed on your own champion (select voice; no order) */
  onSelectSelf(): void;
  onZoom(deltaY: number): void;
  onToggleFollow(): void;
}

export class InputCapture {
  readonly cursor: CursorState = { x: 0, y: 0, inside: false };
  readonly panKeys: PanKeys = { up: false, down: false, left: false, right: false };
  private attackMoveArmed = false;
  private disposers: (() => void)[] = [];
  /**
   * The ability key currently held down (GH#367) — our stake in the GLOBAL
   * `ui/abilityHold` store, which the mouse tiles, the touch bar and the pad all
   * write to as well. Kept so `blur`/`dispose` can retract exactly what THIS
   * keyboard put there and nothing else (same rule as `PadDescribeHold`).
   */
  private heldKeySlot: CastableSlot | null = null;

  /**
   * Arm/disarm the attack-move AND mirror it onto the mouse cursor: while A is
   * armed the arena surface shows the crimson reticle instead of the blade
   * (cursor/, task #54a), so the pending order is visible where the player is
   * actually looking. Every assignment to `attackMoveArmed` goes through here
   * so the two can never disagree — which is the entire failure mode (a stuck
   * reticle after the click resolves). `setCursorVariant` is a DOM-safe no-op
   * outside a browser, so the node-env unit tests are unaffected.
   */
  private setAttackArmed(armed: boolean): void {
    this.attackMoveArmed = armed;
    setCursorVariant(armed ? "attack" : null);
  }

  constructor(
    private readonly el: HTMLElement,
    private readonly deps: InputDeps,
  ) {}

  attach(): void {
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: string,
      fn: (ev: never) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      target.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };

    on(this.el, "contextmenu", (ev: MouseEvent) => {
      ev.preventDefault();
      this.trackCursor(ev);
      // 二段施放瞄準中 → 右鍵是「取消」(GH#639)，⛔ 不是移動/攻擊指令。
      if (cancelTwoStageCast()) return;
      const ground = this.ground(ev);
      if (!ground) return;
      this.setAttackArmed(false);
      this.deps.onOrder(mapRightClick(ground, this.deps.pickEnemy(ground)));
    });

    on(this.el, "pointerdown", (ev: PointerEvent) => {
      this.trackCursor(ev);
      if (ev.button !== 0) return;
      // 二段施放的第二下 (GH#639)：瞄準中的場景左鍵就是「施放」，⛔ 永遠不落到
      // 自選／攻擊移動那條路（吃掉這一下，不論解析成不成功）。
      if (this.castTwoStage(ev)) return;
      const armed = this.attackMoveArmed;
      this.setAttackArmed(false);
      const ground = this.ground(ev);
      // pickSelf is only consulted for a PLAIN click — an armed click is
      // always the attack-move, even right on top of your own hero
      const selfHit = !armed && ground !== null && this.deps.pickSelf(ground);
      const action = mapLeftClick(armed, ground, selfHit);
      if (!action) return;
      if (action.kind === "order") this.deps.onOrder(action.order);
      else this.deps.onSelectSelf();
    });

    on(this.el, "pointermove", (ev: PointerEvent) => this.trackCursor(ev));
    on(this.el, "pointerleave", () => {
      this.cursor.inside = false;
    });

    on(this.el, "wheel", (ev: WheelEvent) => {
      ev.preventDefault();
      this.deps.onZoom(ev.deltaY);
    }, { passive: false });

    on(window, "keydown", (ev: KeyboardEvent) => this.onKeyDown(ev));
    on(window, "keyup", (ev: KeyboardEvent) => {
      this.setPanKey(ev.code, false);
      // 放開技能鍵 → 收掉範圍指引 (GH#367)
      const slot = SLOT_BY_CODE[ev.code];
      if (slot) this.releaseHeldKey(slot);
    });
    on(window, "blur", () => {
      this.panKeys.up = this.panKeys.down = this.panKeys.left = this.panKeys.right = false;
      // Alt-tabbing away eats the keyup, so without this the range guide would
      // stay painted on the floor for the rest of the match.
      if (this.heldKeySlot) this.releaseHeldKey(this.heldKeySlot);
    });
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    // leaving a match with A still armed must not strand the reticle on the
    // lobby screens, where there is no canvas and no order to place
    this.setAttackArmed(false);
    // …and the same for a key still held at the moment the match tears down.
    if (this.heldKeySlot) this.releaseHeldKey(this.heldKeySlot);
    // 瞄準到一半拆場 —— 武裝狀態是模組級的，留著會漏進下一場 (GH#639)。
    cancelTwoStageCast();
  }

  /**
   * 二段施放的**第二段** (GH#639)。回傳 true = 這一下已被瞄準模式吃掉。
   *
   * 解析走**同一支** `buildCastCommand` —— 與鍵盤 quick-cast 完全同一條路，
   * 所以「圈畫在哪」與「技能落在哪」永遠是同一個答案（GH#415 的那條規矩）。
   *
   *   · 點在世界外（screenToGround 落空）→ 吞掉這一下，**維持瞄準**
   *   · `targeted` 而點下處沒有目標／方向零向量 → 拒絕音，**維持瞄準**
   *     （玩家還沒施放；取消是他自己的手勢：再點鈕或右鍵）
   *   · 解析成功 → 送出 command、解除瞄準（伺服器的 castBegin/castRejected
   *     照舊走 `ui/castFeedback` 那條回饋線）
   */
  private castTwoStage(ev: PointerEvent): boolean {
    const slot = getTwoStageArmedSlot();
    if (slot === null) return false;
    const ground = this.ground(ev);
    if (!ground) return true;
    const ability = this.deps.getAbility(slot);
    const selfPos = this.deps.getSelfPos();
    if (!ability || !selfPos) {
      abilityActivationCue(slot, { denied: true });
      cancelTwoStageCast();
      return true;
    }
    const cmd = buildCastCommand(slot, ability, {
      selfPos,
      cursorGround: ground,
      hoveredEntityId: this.deps.pickEnemy(ground),
    });
    if (!cmd) {
      abilityActivationCue(slot, { denied: true });
      return true;
    }
    this.deps.onCommand(cmd);
    abilityActivationCue(slot, {});
    cancelTwoStageCast();
    return true;
  }

  /** Retract our stake in the shared held-ability store — never anyone else's. */
  private releaseHeldKey(slot: CastableSlot): void {
    if (this.heldKeySlot === slot) this.heldKeySlot = null;
    clearHeldAbility(slot);
  }

  private onKeyDown(ev: KeyboardEvent): void {
    // don't steal keys from HUD inputs
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    const slot = SLOT_BY_CODE[ev.code];
    if (slot && !ev.repeat) {
      // 鍵盤 quick-cast 立即出手 ⇒ 任何還掛著的滑鼠二段瞄準就過時了 (GH#639)。
      // ⚠️ 只清瞄準狀態，quick-cast 自身的流程一格不動。
      cancelTwoStageCast();
      // quick-cast at the current cursor position
      const ability = this.deps.getAbility(slot);
      const selfPos = this.deps.getSelfPos();
      const ground = this.cursor.inside
        ? this.deps.screenToGround(this.cursor.x, this.cursor.y)
        : null;
      if (ability && selfPos) {
        const cursorGround = ground ?? selfPos;
        const cmd = buildCastCommand(slot, ability, {
          selfPos,
          cursorGround,
          hoveredEntityId: this.deps.pickEnemy(cursorGround),
        });
        if (cmd) this.deps.onCommand(cmd);
      }
      // Button feedback for the KEY press: a click cue (de-duped so the same
      // activation can't double with an on-screen tile press), refusal-toned
      // when the slot isn't a learned/available ability. Sound only — no visual
      // (the key has no on-screen face); haptic is a mobile no-op on desktop.
      abilityActivationCue(slot, { denied: !ability });
      // 技能範圍指引 (GH#367). The SAME seam the touch bar, the mouse tiles and
      // the pad already write — ⛔ NOT a second preview path. Everything
      // downstream (`GameApp.resolveHoldPreview` → post-`envFactor("abilityRange")`
      // radius → `AimIndicator`) is reached by setting this one slot.
      //
      // ⚠️ Unconditional, NOT gated on `ability`: this line is what makes the
      // guide a TEACHING tool (owner cited LoL's 新手模式). `resolveHoldPreview`
      // already answers an unlearned slot with null and draws nothing, so a
      // second gate here would only be a copy of that rule, free to drift.
      this.heldKeySlot = slot;
      // ⭐ owner 2026-08-22（他標為最高優先，而且回報了**兩次**）：
      //    「**戰鬥回合按下QWER出現技能說明遮住戰鬥畫面**」
      // ⛔ 這一行以前是 `setHeldAbility(slot)` —— intent 預設 `"full"` ⇒ 頂端整條
      //    說明橫幅拉出來蓋住戰鬥畫面。⭐ **按下是施放，⛔ 不是閱讀。**
      // ⚠️ 2026-08-22 第一次修的時候只改了滑鼠（AbilityBar）與觸控（TouchControls）——
      //    ⛔ 漏掉鍵盤這條，而 owner 用的正是鍵盤。
      setHeldAbility(slot, "aim");
    }

    switch (ev.code) {
      case "Escape":
        // 二段瞄準的第三條取消手勢 (GH#679)：再點格＝取消、右鍵＝取消，Esc 也要是 ——
        // 它是玩家「退出目前模式」的通用鍵。⚠️ 只清瞄準；A 武裝/面板各自的 Esc 行為一格不動。
        cancelTwoStageCast();
        break;
      case "KeyA":
        this.setAttackArmed(true);
        break;
      case "KeyS":
        this.setAttackArmed(false);
        this.deps.onOrder(STOP_ORDER);
        break;
      case "KeyB":
        this.deps.onCommand(RECALL_COMMAND);
        break;
      case "KeyG":
        // 丟 100 金 — free of the WASD cluster, next to the movement hand, and
        // not a modifier or function key (the three rules above SLOT_BY_CODE).
        if (!ev.repeat) this.deps.onCommand(DROP_COIN_COMMAND);
        break;
      case "Space":
        ev.preventDefault();
        this.deps.onToggleFollow();
        break;
      case "KeyY":
        // 鏡頭跟隨鎖定 (#268). The owner asked for Y by name — 「預設跟隨視角
        // (按Y解除/鎖定)」 — and Y is kept ALONGSIDE Space rather than replacing
        // it: Space is what this client has always used and what the ONE
        // existing legend row documents, so removing it would break the hands
        // of the only person who has played this build. Both call the same
        // toggle, so there is no second follow state to drift.
        //
        // ⚠️ NOT in SLOT_BY_CODE and NOT a pan key: Y sits outside the WASD
        // cluster and outside the ability row, so it steals nothing.
        if (!ev.repeat) this.deps.onToggleFollow();
        break;
      default:
        this.setPanKey(ev.code, true);
    }
  }

  private setPanKey(code: string, down: boolean): void {
    // arrow keys pan; WASD is reserved for game keys (A attack-move, S stop,
    // W/E abilities, D the 天生技) — matching MOBA conventions.
    if (code === "ArrowUp") this.panKeys.up = down;
    else if (code === "ArrowDown") this.panKeys.down = down;
    else if (code === "ArrowLeft") this.panKeys.left = down;
    else if (code === "ArrowRight") this.panKeys.right = down;
  }

  private trackCursor(ev: MouseEvent): void {
    const rect = this.el.getBoundingClientRect();
    this.cursor.x = ev.clientX - rect.left;
    this.cursor.y = ev.clientY - rect.top;
    this.cursor.inside = true;
  }

  private ground(ev: MouseEvent): Vec2 | null {
    const rect = this.el.getBoundingClientRect();
    return this.deps.screenToGround(ev.clientX - rect.left, ev.clientY - rect.top);
  }
}

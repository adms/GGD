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
 * ════════════════════════════════════════════════════════════════════════════
 * THE MAP (owner's 2026-07-27 ruling — this REPLACED the original scheme)
 * ════════════════════════════════════════════════════════════════════════════
 *   左搖桿  移動        右搖桿  瞄準
 *   A → Q    B → W    X → E    Y → R
 *   LB → EX          RB → 天生技
 *   RT → 基本攻擊    LT → attack-move
 *   長按 A/B/X/Y → 升級該技能（有技能點時）／顯示技能說明（沒點數時）
 *   長按 LB / RB → 顯示 EX / 天生技說明（那兩格沒有等級可加）
 *   D-pad ↑ stop    ↓ recall    ← → 留給選單導航（task #197）
 *   L3 切換鏡頭跟隨   R3 鏡頭拉遠一級／繞回預設（歸位）
 *   START ready      BACK 空著（記分板是 #197 的事）
 *
 * LEFT stick moves (continuous move orders, IntentSender coalesces; release
 * does NOT stop — the last point finishes, matching mouse feel). RIGHT stick
 * aims (streamed; remembered as lastAimDir) and, once L3 has unlocked follow,
 * also free-pans the camera. A/B/X/Y/LB/RB cast their slot resolved per
 * castType exactly like the mouse AimResolver. Coexists with mouse/keyboard:
 * both feed the same IntentSender, last writer wins — and the KEYBOARD map is
 * untouched by all of this (still QWER + F for the EX + D for the innate).
 * NO @babylonjs imports here (client-08).
 */
import { asEntityId } from "@ggd/shared/ids";
// 手把手感（GH#520）——⭐ 五個常數的**唯一**來源。⛔ 這支檔案不再自己寫字面值。
import {
  Configs,
  DEFAULT_GAMEPAD_FEEL_POLICY,
  GAMEPAD_DOC_ID,
  resolveGamepadFeel,
  type ConfigGamepadDoc,
  type GamepadFeelPolicyDoc,
} from "@ggd/shared/content";
import type { CastableSlot, Command, CoreAbilitySlot, Order } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { abilityActivationCue } from "../ui/abilityCue";
import { getHeldAbility, setHeldAbility } from "../ui/abilityHold";
import { rangeGuide } from "../ui/rangeGuideConfig";
import { envFactor } from "../ui/displayFinal";
import {
  buildCastCommand,
  setCursorlessAim,
  setCursorlessTarget,
  type AimAbility,
} from "./AimResolver";
import { isPadMenuCapturing } from "./padMenuCapture";

export type GamepadFeel = GamepadFeelPolicyDoc;

/**
 * 出貨手感 —— **⛔ 不是一組寫死的常數，是 `config.gamepad@1` 的保險絲**（GH#520）。
 *
 * 在這一版之前，死區／兩個前導距離／搜敵半徑／長按門檻是五個 module-level
 * `export const`：owner 想把死區調鬆一格，要改程式 + 重建 client 映像 + 重新部署
 * （第一守則）。現在它們住在 `content/config/gamepad.json`，這一族只是
 * 「內容還沒載完 / 載失敗」時的回退值 —— 而回退值逐字等於出貨值，
 * 所以那個回退**不改變任何行為**。
 */
export const DEFAULT_GAMEPAD_FEEL: GamepadFeel = { ...DEFAULT_GAMEPAD_FEEL_POLICY };

/**
 * 生效中的手把手感 —— 後台 overlay ?? `content/config/gamepad.json` ?? 出貨預設。
 *
 * ⭐ 和 `aimAssistMobPenalty()`（`config.combat-feel@1`）以及 `CameraRig` 讀
 * `config.camera@1` 是**同一條路**：每次呼叫都重讀，所以後台存檔之後玩家
 * 重整一次分頁就生效，⛔ 不必重建映像。
 */
export function activeGamepadFeel(): GamepadFeel {
  return resolveGamepadFeel(Configs.tryGet(GAMEPAD_DOC_ID) as ConfigGamepadDoc | undefined);
}

/**
 * ⚠️ 以下五個匯出是**出貨值的別名**，留著給還沒改讀即時設定的呼叫端
 * （`ui/inputMode` 的預設參數、`input/TouchInput` 的觸控路徑、以及測試夾具）。
 * ⛔ 它們**不會**跟著後台變 —— 手把自己的每一條路都已經改讀 {@link activeGamepadFeel}。
 * ⛔ 也不要在這裡重打數字：它們從 {@link DEFAULT_GAMEPAD_FEEL} 推導，
 * 手打一份就是第四個住處，而第四個住處一定會過期。
 */
export const GAMEPAD_DEADZONE = DEFAULT_GAMEPAD_FEEL.deadzone;
/** How far ahead of the champion a stick-move order targets. */
export const MOVE_LEAD = DEFAULT_GAMEPAD_FEEL.moveLead;
/** Attack-move lead distance (RT). */
export const ATTACK_MOVE_LEAD = DEFAULT_GAMEPAD_FEEL.attackMoveLead;
/**
 * ⚠️ **LEGACY — 手把已經不用它了（GH#512）。** 留著只因為 `input/TouchInput`
 * 的 tap / drag-aim 兩條路還匯入它（拖曳有自己的 0..1 magnitude 語意）。
 *
 * 它原本是手把地面型技能的**硬夾限**：`Math.min(ability.range, 6)`。量到的代價是
 * 出貨 70 支 `ground` 技能裡 **42 支**的實際射程（`range × abilityRange`）大於 6，
 * 也就是**手把玩家打不到自己技能卡上寫的距離**，而且畫面上沒有任何東西說得出來。
 * 現在的夾限由 {@link padCastReach} 從技能自己的 `range` 推導。
 */
export const GROUND_CAST_MAX = 6;

/**
 * 手把的「虛擬游標」要放多遠 —— 就是這支技能**真的打得到**的最遠處。
 *
 * ⭐ 從技能自己的 `range` × 出貨 combat-env 的 `abilityRange` 係數推導，
 * ⛔ 不是一個寫死的常數。伺服器對 `ground` 的夾限用的正是
 * `resolveAbilityRange(world, def.range)`（`sim/abilities/abilitySystem`），
 * 對 `targeted` 的 out-of-range 判定也是同一個值 ⇒ 這裡算出來的距離
 * 與伺服器會接受的距離是**同一個公式**，⛔ 不是第二份會分岔的規則。
 */
export function padCastReach(ability: AimAbility, abilityRangeMult: number): number {
  const mult = Number.isFinite(abilityRangeMult) && abilityRangeMult > 0 ? abilityRangeMult : 1;
  return ability.range * mult;
}

/** LT basic-attack target search radius. */
export const BASIC_ATTACK_RANGE = DEFAULT_GAMEPAD_FEEL.basicAttackRange;

/**
 * Button indices of the W3C **Standard Gamepad** mapping (`Gamepad.buttons[]`),
 * which every XInput-class pad reports in a browser:
 *
 *   0-3   A B X Y (bottom, right, left, top of the face cluster)
 *   4-7   LB RB LT RT
 *   8-9   Back/View, Start/Menu
 *   10    LEFT STICK PRESSED  (L3)
 *   11    RIGHT STICK PRESSED (R3)
 *   12-15 D-pad up, down, left, right
 *
 * L3/R3 are 10/11 straight out of that spec order — NOT guessed. The 12-15
 * d-pad block is independently confirmed by `input/padFocusNav`'s `NAV_DPAD`,
 * which has been reading exactly those four indices for the menu layer.
 */
export const BTN = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  /**
   * Back/View. DELIBERATELY UNBOUND since the 2026-07-27 remap: it used to be
   * the EX and is now free. The owner's map earmarks it for 「記分板（按住顯
   * 示）」, which is a HUD panel that does not exist yet — that belongs to task
   * #197 (pad drives the whole UI flow), not here. Left listed so the legend's
   * probe reports "nothing" for it honestly rather than not knowing it exists.
   */
  BACK: 8,
  START: 9,
  /** left stick pressed — camera follow toggle (was RB + LB). */
  L3: 10,
  /** right stick pressed — zoom notch / camera home (was RB + LT/RT). */
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  /**
   * D-pad ← →. Bound to NOTHING in combat ON PURPOSE: they are reserved for
   * menu navigation in task #197, and a direction that steers a champion in
   * combat and a menu everywhere else is the ambiguity that task has to solve
   * once, globally. Declared here so the reservation is visible at the map.
   */
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

/**
 * Pad button → castable slot. All SIX slots are on the pad: a couch player must
 * be able to press every button the hero owns, or the pad is quietly a
 * four-slot version of the game.
 *
 * WHY EX MOVED OFF BACK ONTO LB (owner, 2026-07-27). Back/View is the smallest,
 * most central, hardest-to-reach key on the whole controller — you cannot press
 * it without breaking your grip. The EX is the ability that unlocks in round 7
 * and gets pressed at the tightest moment of the match. The hardest button on
 * the pad is the wrong home for the thing you press when it matters most.
 *
 * WHY 天生技 MOVED OFF D-PAD ↑ ONTO RB (owner, 2026-07-27). The left thumb
 * lives on the left stick; reaching the d-pad means LETTING GO OF MOVEMENT.
 * A shoulder does not.
 *
 * ⚠️ THE KNOWN, ACCEPTED COST: most heroes' 天生技 is a permanent 被動 (the
 * dashed-border tile of #166), so for them RB casts nothing at all — `ability()`
 * returns null and no command is sent. The owner's ruling is 「直覺比頻率重要」.
 *
 * ⚠️ DO NOT "OPTIMISE" THIS INTO A CONTEXTUAL BUTTON — i.e. do not make RB mean
 * 天生技 for the heroes that have an active one and `stop` (or anything else)
 * for the rest. One button doing different things on different heroes is the
 * single most confusing thing a pad map can do; a button that is honestly inert
 * on your hero is learnable in one round. A long press on RB still explains
 * itself (it shows the 天生技's description — see the long-press block below),
 * which is a better answer to "why did nothing happen" than a second meaning.
 */
const SLOT_BY_BUTTON: Partial<Record<number, CastableSlot>> = {
  [BTN.A]: "Q",
  [BTN.B]: "W",
  [BTN.X]: "E",
  [BTN.Y]: "R",
  [BTN.LB]: "EX", // per-hero "EX 技能" (5th slot); no-op until unlocked
  [BTN.RB]: "PASSIVE", // 天生技 (6th slot); owned from level 1, active kind only
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LONG PRESS = 升級 / 說明  (replaces the retired held-shoulder modifier layer)
 * ════════════════════════════════════════════════════════════════════════════
 * The old scheme reached rank-up and the camera through a held RIGHT BUMPER
 * modifier (RB + A/B/X/Y, RB + LT/RT, RB + LB). That layer is GONE — RB is the
 * 天生技 now, and a modifier you have to hold is a second mapping to memorise.
 * Everything it did has a home of its own:
 *
 *   rank up Q/W/E/R  →  LONG PRESS the very button that casts it (below)
 *   zoom             →  R3
 *   follow toggle    →  L3
 *   free-pan         →  the right stick, once L3 has unlocked follow
 *
 * WHY LONG PRESS, AND WHY IT COSTS NOTHING TO LEARN: you already know A is Q.
 * Holding A ranks up Q. There is no second table.
 *
 * ⚠️ THE CAST IS NEVER DELAYED. The cast fires on the PRESS EDGE, exactly as it
 * always did, and the rank-up fires later off a separate edge — so holding A to
 * rank up Q also casts Q. That is a deliberate trade: waiting ~0.4 s to find out
 * whether a press was "cast" or "rank up" would put a quarter-second of input
 * lag on every ability in an action game, to save an occasional wasted cast in
 * the calm moment right after a level-up. Immediacy wins; do not "fix" this by
 * deferring the cast.
 */
/**
 * How long a button must be down before it counts as a long press —— **出貨值**。
 *
 * ⚠️ 這是保險絲，⛔ 不是執行期真的在用的那個值：`GamepadInput.poll()` 每一幀
 * 從 {@link activeGamepadFeel} 讀 `longPressMs`（GH#520，後台調得到）。
 *
 * 出貨值落在兩個真實的邊界之間：戰鬥中一次刻意的重按輕鬆超過 200ms（門檻再低
 * 就會在打架時誤加技能點，而點數花掉不能退），而超過 ~500ms 玩家已經斷定
 * 「沒反應」而放手。它也和 `padFocusNav.NAV_INITIAL_DELAY_MS` 夠接近，
 * 讓「按住一拍」在整個產品裡是同一個手勢。
 */
export const GAMEPAD_LONG_PRESS_MS = DEFAULT_GAMEPAD_FEEL.longPressMs;

/**
 * Long press → the rankable slot it spends a point on. Only the FOUR core
 * slots are here: EX (LB) is unlocked by the round-7 event and 天生技 (RB) is
 * owned at rank 1 from spawn — neither has a rank a point can raise (the sim
 * agrees: `CommandSystem` drops a `rankUpAbility` naming EX or the innate). A
 * long press on those two therefore always falls through to the description,
 * rather than sending a command that would be silently thrown away.
 */
const RANK_BY_LONG_PRESS: Partial<Record<number, CoreAbilitySlot>> = {
  [BTN.A]: "Q",
  [BTN.B]: "W",
  [BTN.X]: "E",
  [BTN.Y]: "R",
};

/** Camera ops a pad frame asks for (client-only; never a sim intent). */
export interface GamepadCameraIntent {
  /**
   * R3 — step the camera one notch further out, or home it. The notch counter
   * and the reset live in `input/padCamera` (the rig owns the dolly, and this
   * mapping is pure), which is also where "歸位" is defined.
   */
  zoomCycle?: true;
  /** continuous free-pan direction (world XZ unit vector) while the stick holds. */
  pan?: Vec2;
  /** flip the camera follow-lock this frame (L3). */
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
  /** button indices held DOWN this frame (level, not edge). */
  held?: number[];
  /**
   * Buttons that crossed {@link GAMEPAD_LONG_PRESS_MS} ON THIS POLL — an EDGE,
   * fired exactly once per physical press (see `GamepadInput.poll`). This is
   * what spends a skill point, so a repeat would spend the whole level's worth
   * of points in three frames.
   */
  longPressed?: number[];
  /**
   * Buttons currently held PAST the threshold (level, not edge) — the "still
   * holding it" state the description preview follows, so releasing the button
   * takes the panel away. Superset of `longPressed` on the frame it fires.
   */
  longHeld?: number[];
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
  /**
   * Unspent skill points this player is holding (`seat.unspentPoints`). It is
   * REQUIRED, not optional-with-a-default, on purpose: it is the one thing that
   * decides whether a long press spends a point or explains the ability, and a
   * silent `?? 0` default would let a caller forget to wire it and ship a
   * rank-up gesture that can never fire. Let the compiler ask.
   */
  skillPoints: number;
  /**
   * 出貨 combat-env 的 `abilityRange` 係數（task #136 / GH#512）。省略 = 1。
   *
   * ⚠️ 它**不是**由 ctxProvider 提供的：`GamepadSystem` / `MultiGamepadSystem`
   * 在 poll 的當下從 `ui/displayFinal` 的即時表讀進來（operator 隨時可以改），
   * 所以 `mapGamepadFrame` 本身維持**純函式**——測試餵一個數字就好。
   */
  abilityRangeMult?: number;
  /**
   * 生效中的手把手感（GH#520）。省略 = 出貨值。
   *
   * ⚠️ 它和 `abilityRangeMult` 同一個理由**不由 ctxProvider 提供**：
   * `GamepadSystem` / `MultiGamepadSystem` 在 poll 的當下從 `Configs` 讀進來
   * （operator 隨時可以改），所以 `mapGamepadFrame` 本身維持**純函式** ——
   * 測試餵一個物件就好。
   */
  feel?: GamepadFeel;
}

export interface GamepadIntent {
  order?: Order;
  /** streamed aim (right stick), when deflected */
  aim?: Vec2;
  commands: Command[];
  /** camera ops (L3 follow toggle / R3 zoom-home / right-stick free-pan). */
  camera?: GamepadCameraIntent;
  /**
   * The slot whose DESCRIPTION should be showing right now — a long press with
   * no point to spend (or on a slot that has no rank at all). Level, not edge:
   * absent means "nothing held", which is what takes the panel back down. The
   * systems below push it into `ui/abilityHold`, the same seam the touch hold
   * (#152) and the mouse-down on an ability tile use.
   */
  describe?: CastableSlot;
  /**
   * 目前 `describe` 那一格的**瞄準方向**（單位向量），GH#512。系統層把它推進
   * `AimResolver.setCursorlessAim`，長按預覽的 AoE 圓心才會落在搖桿指的方向上
   * ——⛔ 而不是滑鼠游標（手把玩家從來沒有游標）。
   */
  describeAim?: Vec2;
  /**
   * `describe` 那一格**這一幀會打到誰**（GH#519）—— 指定型技能的軟鎖定目標，
   * 沒鎖到人／不是指定型 → null。
   *
   * ⭐ **它跟真的按下去時挑目標用的是同一支 `ctx.nearestEnemy(self, reach, aimDir)`**，
   * 同一個 `padCastReach` 夾限、同一個方向偏壓。⛔ 不在這裡另寫一次「大概是誰」——
   * 兩份挑法遲早分岔，而分岔的樣子是**畫面高亮 A、技能飛向 B**，兩邊看起來都對
   * （失敗形態⑤）。
   *
   * ⚠️ 這一格是**每幀**解的，不是按下那一刻才解：#519 的整個重點就是玩家在**按下之前**
   * 要看得到答案。系統層把它推進 `AimResolver.setCursorlessTarget`。
   */
  describeTarget?: number | null;
  /**
   * 這一幀被**拒絕**的技能鍵，GH#512。按下去但沒有產生任何 command：技能還沒學／
   * EX 還沒解鎖（`ctx.ability` 回 null）、或 `targeted` 找不到目標。
   *
   * ⚠️ 在此之前這種按壓是**完全靜音**的 —— 沒有聲音、沒有句子、沒有震動，
   * 跟一個掉包的封包長得一模一樣（就是 castFeedback 檔頭那個 P7 的形狀）。
   * 系統層對每一格叫一次 `abilityActivationCue(slot, { denied: true })`，
   * 那條路自己會接上 `castAnnounce` → `predictCastReject` 的句子。
   */
  refused?: CastableSlot[];
}

/** PURE frame → intent mapping (reused per local player). */
export function mapGamepadFrame(frame: GamepadFrame, ctx: GamepadPlayerCtx): GamepadIntent {
  const commands: Command[] = [];
  const refused: CastableSlot[] = [];
  let order: Order | undefined;

  const self = ctx.selfPos;
  const aimDir = frame.aim ?? ctx.lastAimDir ?? ctx.facing ?? null;
  const rangeMult = ctx.abilityRangeMult ?? 1;
  // ⭐ 手感五格從後台讀（GH#520）。⛔ 這個函式裡不可以再出現一個字面距離。
  const feel = ctx.feel ?? DEFAULT_GAMEPAD_FEEL;

  let camera: GamepadCameraIntent | undefined;
  const cam = (patch: GamepadCameraIntent): void => {
    camera = { ...camera, ...patch };
  };

  // LEFT stick — continuous move order toward a short lead point.
  if (frame.move && self) {
    order = {
      kind: "move",
      point: {
        x: self.x + frame.move.x * feel.moveLead,
        z: self.z + frame.move.z * feel.moveLead,
      },
    };
  }

  // RIGHT stick — aims AND offers the same deflection as a camera free-pan. The
  // rig sums `panVec` with the arrow-key/edge sources and, like them, only
  // applies it while follow is OFF (CameraRig.update), so this costs nothing in
  // the normal following case and is the whole free-pan story once L3 unlocks
  // it. That is why no modifier is needed to pan any more.
  if (frame.aim) cam({ pan: frame.aim });

  for (const b of frame.justPressed) {
    const slot = SLOT_BY_BUTTON[b];
    if (slot) {
      if (!self) continue; // 還沒有英雄位置 —— 這一按什麼都不是,連拒絕都不是
      const ability = ctx.ability(slot);
      // ⭐ 沒學／沒解鎖也要**答一聲**（GH#512）：靜音跟掉包分不出來。
      if (!ability) {
        refused.push(slot);
        continue;
      }
      const dir = aimDir ?? { x: 0, z: 1 };
      // ⭐ 虛擬游標放在**這支技能真的打得到的最遠處**，⛔ 不是寫死的 6
      //   —— 出貨 70 支 ground 技能有 42 支的實際射程超過 6（見 GROUND_CAST_MAX）。
      const reach = padCastReach(ability, rangeMult);
      // a virtual "cursor" along the aim direction lets the mouse AimResolver
      // do the castType-specific work (skillshot dir / ground clamp / self)
      const cursorGround = { x: self.x + dir.x * reach, z: self.z + dir.z * reach };
      // ⚠️ `targeted` 的搜尋半徑也走同一個 `reach`：伺服器的 out-of-range 判定用的
      //   就是 `range × abilityRange`,拿卡面值去挑目標會挑到一個必定被拒的敵人。
      const hovered = ability.castType === "targeted" ? ctx.nearestEnemy(self, reach, aimDir) : null;
      const cmd = buildCastCommand(slot, ability, { selfPos: self, cursorGround, hoveredEntityId: hovered });
      if (cmd) commands.push(cmd);
      else refused.push(slot); // targeted 沒目標／方向退化成零向量
    } else if (b === BTN.LT && self) {
      // LT = attack-move (owner, 2026-07-27: the triggers swapped)
      const dir = frame.move ?? aimDir;
      if (dir) {
        order = {
          kind: "attackMove",
          point: {
            x: self.x + dir.x * feel.attackMoveLead,
            z: self.z + dir.z * feel.attackMoveLead,
          },
        };
      }
    } else if (b === BTN.RT && self) {
      // RT = basic attack. The right trigger is the primary action everywhere
      // else on a console, and #221's auto-attack means the manual one is now a
      // correction rather than a rotation key.
      const id = ctx.nearestEnemy(self, feel.basicAttackRange, aimDir);
      if (id !== null) order = { kind: "attackTarget", entity: asEntityId(id) };
    } else if (b === BTN.DPAD_UP) {
      order = { kind: "stop" };
    } else if (b === BTN.DPAD_DOWN) {
      commands.push({ kind: "recall" });
    } else if (b === BTN.L3) {
      cam({ toggleFollow: true });
    } else if (b === BTN.R3) {
      cam({ zoomCycle: true });
    } else if (b === BTN.START) {
      commands.push({ kind: "ready" });
    }
  }

  // ── LONG PRESS ───────────────────────────────────────────────────────────
  // Level first: while a skill button is held past the threshold AND that hold
  // is not going to spend a point, the ability explains itself. Same semantics
  // as the touch hold (#152) and a mouse-down on an ability tile.
  let describe: CastableSlot | undefined;
  for (const b of frame.longHeld ?? []) {
    const slot = SLOT_BY_BUTTON[b];
    if (!slot) continue;
    if (RANK_BY_LONG_PRESS[b] && ctx.skillPoints > 0) continue; // this hold is a rank-up
    describe = slot;
  }
  // Edge: spend the point. Fires once per physical press (see poll), and only
  // when there is a point to spend — otherwise the hold stays a description.
  for (const b of frame.longPressed ?? []) {
    const rankSlot = RANK_BY_LONG_PRESS[b];
    if (rankSlot && ctx.skillPoints > 0) commands.push({ kind: "rankUpAbility", slot: rankSlot });
  }

  const out: GamepadIntent = { commands };
  if (order) out.order = order;
  if (frame.aim) out.aim = frame.aim;
  if (camera) out.camera = camera;
  if (describe) {
    out.describe = describe;
    // 預覽圓心的方向來源（GH#512）。⛔ 沒有方向時不寫 —— 讓下游維持滑鼠那條路。
    if (aimDir) out.describeAim = aimDir;
    // ⭐ GH#519 ——「這一發會打誰」。⛔ 跟按下去那條路共用同一支挑選函式與同一個
    //   夾限（`padCastReach`），所以畫面上高亮的那個人，就是 command 會鎖住的那個人。
    const held = ctx.ability(describe);
    out.describeTarget =
      held && held.castType === "targeted" && self
        ? ctx.nearestEnemy(self, padCastReach(held, rangeMult), aimDir)
        : null;
  }
  if (refused.length > 0) out.refused = refused;
  return out;
}

/**
 * The pad's stake in the GLOBAL held-ability store (`ui/abilityHold`), which it
 * shares with the mouse and the touch bar. It may only ever clear what IT set —
 * blindly writing `null` every frame would rip a mouse-held description off the
 * screen while the player is still holding the tile.
 */
class PadDescribeHold {
  private mine: CastableSlot | null = null;

  /**
   * @param aim 這一幀的瞄準方向。⭐ 它推進 `AimResolver.setCursorlessAim`，
   *   長按預覽的 AoE 圓心才會落在搖桿指的方向上（GH#512）——⛔ 而不是滑鼠游標，
   *   純手把玩家從來沒有動過滑鼠，那個圈會畫在他自己腳下。
   *   ⚠️ 它跟 held slot **同一個生命週期**：按住寫、放開／拔掉手把清掉，
   *   ⛔ 不留一個過期的方向去污染滑鼠玩家的預覽。
   * @param target 這一幀軟鎖定到的實體（GH#519）。⚠️ **一定要在 `setCursorlessAim`
   *   之後才寫**：那一支收到 null 方向時會把目標一起清掉，順序反過來就等於每一幀
   *   都把剛寫進去的目標抹掉一次。
   */
  set(slot: CastableSlot | null, aim: Vec2 | null = null, target: number | null = null): void {
    setCursorlessAim(slot ? aim : null);
    setCursorlessTarget(slot ? target : null);
    if (slot === this.mine) return;
    // ⭐ 同 `InputCapture` —— 按下是**施放**，⛔ 不是閱讀（owner 2026-08-22）。
    if (slot) setHeldAbility(slot, "aim");
    else if (getHeldAbility() === this.mine) setHeldAbility(null);
    this.mine = slot;
  }
}

/** Monotonic-ish clock for the long-press timer (injectable for tests). */
function defaultNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** Reads one physical pad by index (injectable for tests). */
export class GamepadInput {
  private prevPressed: boolean[] = [];
  /** when each button went down (ms on `now`'s clock); index-aligned. */
  private downAt: number[] = [];
  /**
   * Per-button LATCH: has this press already fired its long press? Cleared on
   * RELEASE, never on time — that is the whole debounce. Without it a held
   * button crosses the threshold on every subsequent poll too and dumps a
   * level's worth of skill points in a few frames.
   */
  private longFired: boolean[] = [];

  constructor(
    readonly gamepadIndex: number,
    private readonly readPad?: () => PadState | null,
    private readonly now: () => number = defaultNow,
    /**
     * 生效中的手感（GH#520）—— **每一次 poll 都重讀**，⛔ 不是建構時抓一次快照。
     * 抓快照的話 operator 在後台改了死區，已經插著的那支手把要拔掉重插才會跟上。
     */
    private readonly feel: () => GamepadFeel = activeGamepadFeel,
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
      // A pad that comes back re-arms EVERY edge, including the long-press
      // timers: a button that was down when it vanished must not resolve as a
      // multi-second hold the instant it reappears.
      this.prevPressed = [];
      this.downAt = [];
      this.longFired = [];
      return null;
    }
    const now = this.now();
    const feel = this.feel();
    const justPressed: number[] = [];
    const held: number[] = [];
    const longPressed: number[] = [];
    const longHeld: number[] = [];
    const pressed: boolean[] = [];
    for (let i = 0; i < pad.buttons.length; i++) {
      const down = pad.buttons[i]?.pressed === true;
      pressed.push(down);
      if (!down) {
        this.longFired[i] = false; // release re-arms the latch
        continue;
      }
      held.push(i);
      if (!this.prevPressed[i]) {
        justPressed.push(i);
        this.downAt[i] = now;
        this.longFired[i] = false;
      }
      if (now - (this.downAt[i] ?? now) >= feel.longPressMs) {
        if (!this.longFired[i]) {
          this.longFired[i] = true;
          longPressed.push(i);
        }
        longHeld.push(i);
      }
    }
    this.prevPressed = pressed;
    return {
      move: stickToWorld(pad.axes[0] ?? 0, pad.axes[1] ?? 0, feel.deadzone),
      aim: stickToWorld(pad.axes[2] ?? 0, pad.axes[3] ?? 0, feel.deadzone),
      justPressed,
      held,
      longPressed,
      longHeld,
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
  /** camera op (L3 follow toggle / R3 zoom-home / right-stick free-pan). */
  onCamera?(camera: GamepadCameraIntent): void;
  /** connected pad indices changed (discrete-rate; HUD indicator) */
  onPadsChanged(indices: number[]): void;
}

/** Player context providers (the per-frame live values). */
export type GamepadCtxProvider = () => Omit<
  GamepadPlayerCtx,
  "lastAimDir" | "abilityRangeMult" | "feel"
>;

/** 生效中手感的來源（GH#520）。預設讀 `Configs`，測試注入一個物件就好。 */
export type GamepadFeelProvider = () => GamepadFeel;

/**
 * 即時 `abilityRange` 係數的來源（GH#512）。預設讀 `ui/displayFinal` 的
 * singleton —— 那一份由 `GameApp` 每幀用權威的 `MatchState.combatEnvJson`
 * 同步，所以 operator 在後台改一次，手把的射程當場跟著動，
 * ⛔ 不需要重新部署，也⛔ 不會有第二份會過期的抄本。
 */
export type AbilityRangeMultProvider = () => number;

const liveAbilityRangeMult: AbilityRangeMultProvider = () => envFactor("abilityRange");

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
  private readonly describeHold = new PadDescribeHold();

  constructor(
    private readonly sinks: GamepadSinks,
    private readonly ctxProvider: GamepadCtxProvider,
    private readonly listPads: () => (PadState | null)[] = listPadSources,
    private readonly abilityRangeMult: AbilityRangeMultProvider = liveAbilityRangeMult,
    private readonly gamepadFeel: GamepadFeelProvider = activeGamepadFeel,
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
    this.describeHold.set(null);
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
    if (this.activeIndex === null) {
      this.describeHold.set(null); // pad gone → its description panel goes too
      return;
    }

    let input = this.inputs.get(this.activeIndex);
    if (!input) {
      const idx = this.activeIndex;
      input = new GamepadInput(idx, () => this.listPads()[idx] ?? null, defaultNow, () =>
        this.gamepadFeel(),
      );
      this.inputs.set(idx, input);
    }
    const frame = input.poll();
    if (!frame) {
      this.describeHold.set(null);
      return;
    }

    const intent = mapGamepadFrame(frame, {
      ...this.ctxProvider(),
      lastAimDir: this.lastAimDir,
      abilityRangeMult: this.abilityRangeMult(),
      feel: this.gamepadFeel(),
    });
    if (frame.aim) this.lastAimDir = frame.aim;
    if (intent.order) this.sinks.onOrder(intent.order);
    if (intent.aim) this.sinks.onAim(intent.aim);
    if (intent.camera) this.sinks.onCamera?.(intent.camera);
    // long press with no point to spend → the ability explains itself (#152's
    // description panel + floor telegraph), and releasing takes it away.
    this.describeHold.set(
      intent.describe ?? null,
      intent.describeAim ?? null,
      intent.describeTarget ?? null,
    );
    for (const cmd of intent.commands) {
      // pad A/B/X/Y/LB/RB cast → same click cue as tile/key (de-duped)
      if (cmd.kind === "castAbility") abilityActivationCue(cmd.slot);
      this.sinks.onCommand(cmd);
    }
    // ⭐ 按空了也要答一聲（GH#512）：同一條 cue 漏斗,`denied` 走 uiDenied +
    //   震動 + `castAnnounce`(→`predictCastReject`) 的句子。⛔ 不要另造一條。
    for (const slot of intent.refused ?? []) abilityActivationCue(slot, { denied: true });
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
  /** camera op for player k (L3 follow / R3 zoom-home / right-stick pan). */
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
  /**
   * ONE describe-hold, for local player 0. `ui/abilityHold` is a singleton that
   * drives the single top-of-screen description panel + the floor telegraph, so
   * it belongs to the seat those two are drawn for. A couch player 1-3 holding a
   * button would otherwise yank player 0's panel around — a shared global is not
   * something four pads can each own a quarter of.
   */
  private readonly describeHold = new PadDescribeHold();

  constructor(
    private readonly playerCount: () => number,
    private readonly sinks: MultiGamepadSinks,
    private readonly ctxProvider: (
      player: number,
    ) => Omit<GamepadPlayerCtx, "lastAimDir" | "abilityRangeMult" | "feel">,
    private readonly listPads: () => (PadState | null)[] = listPadSources,
    private readonly abilityRangeMult: AbilityRangeMultProvider = liveAbilityRangeMult,
    private readonly gamepadFeel: GamepadFeelProvider = activeGamepadFeel,
  ) {}

  dispose(): void {
    this.inputs.clear();
    this.lastAim.clear();
    this.describeHold.set(null);
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
        input = new GamepadInput(padIndex, () => this.listPads()[padIndex] ?? null, defaultNow, () =>
          this.gamepadFeel(),
        );
        this.inputs.set(padIndex, input);
      }
      const frame = input.poll();
      if (!frame) {
        if (player === 0) this.describeHold.set(null);
        continue;
      }
      // Poll ran (edges stay fresh, so releasing the menu never fires a stale
      // press), but a menu-owned pad 0 emits NOTHING to the sim this frame.
      if (player === 0 && menuOwnsPad0) {
        this.describeHold.set(null);
        continue;
      }

      for (const b of frame.justPressed) this.sinks.onButton?.(player, b);

      const intent = mapGamepadFrame(frame, {
        ...this.ctxProvider(player),
        lastAimDir: this.lastAim.get(player) ?? null,
        abilityRangeMult: this.abilityRangeMult(),
        feel: this.gamepadFeel(),
      });
      if (frame.aim) this.lastAim.set(player, frame.aim);
      if (intent.order) this.sinks.onOrder(player, intent.order);
      if (intent.aim) this.sinks.onAim(player, intent.aim);
      if (intent.camera) this.sinks.onCamera?.(player, intent.camera);
      if (player === 0) {
        this.describeHold.set(
          intent.describe ?? null,
          intent.describeAim ?? null,
          intent.describeTarget ?? null,
        );
      }
      for (const cmd of intent.commands) {
        // pad cast → the shared button click cue (de-duped per slot)
        if (cmd.kind === "castAbility") abilityActivationCue(cmd.slot);
        this.sinks.onCommand(player, cmd);
      }
      // 按空了的那一格也要答一聲（GH#512）——⛔ 靜音跟掉包分不出來。
      for (const slot of intent.refused ?? []) abilityActivationCue(slot, { denied: true });
    }
  }
}

/**
 * audio/fireRingWindow — "how many seconds are left on the round clock at the
 * moment the 火環 actually starts burning". ONE number, DERIVED from the same
 * `config.match@1` document the game-server arms the ring from, never authored
 * twice.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS (task #132, false-completion shape S3)
 * ---------------------------------------------------------------------------
 * The tension bed and the minimap danger rim are CUES FOR A MECHANIC. The
 * mechanic ignites at `match.fireRing.startSec` of combat-elapsed time; the
 * round clock the HUD shows counts DOWN from `match.combatMaxSec`. So the
 * moment the burn begins is, in the clock the client actually has:
 *
 *     phaseSecondsLeft === combatMaxSec - fireRing.startSec
 *
 * That relationship used to be a literal `30` in audio/scene.ts. The shipped
 * config is 240 / 180 → 60, so for months the BGM swapped to the tension bed
 * and the minimap rim started pulsing THIRTY SECONDS AFTER champions had
 * already begun burning to death. No error, no crash, no failing test: the cue
 * simply pointed at the wrong instant. Exactly the pathology this batch exists
 * to kill — green, tested, on disk, and wrong on screen.
 *
 * Nothing tied the constant to the config, so nothing could notice. Two guards
 * now do:
 *   1. this derivation, so editing `config.match.json` moves the cue with the
 *      mechanic (see {@link fireRingWindowSec});
 *   2. {@link noteFireRingIgnition}, a RUNTIME tripwire fed by the sim's own
 *      `fireRingStart` event — if the derived instant and the real instant ever
 *      part company again, the console says so with both numbers.
 *
 * ---------------------------------------------------------------------------
 * GH#186 —— ⛔ 一個從 config 重新推導出來的**預測**永遠會漂
 * ---------------------------------------------------------------------------
 * 那個 tripwire 真的響了（GH#186：sim 剩 35s 點火、客戶端算出 40s）。而它**不是**
 * 一次手滑，是這個形狀的必然結果：`combatMaxSec - startSec` 只是一份**預測**，
 * 而真正決定點火時刻的權威在伺服器，它至少有三個這份預測看不到的修正項 ——
 *
 *   · **決賽回合**（`match/PairedDuels.ts` 的 `ROYALE_FIRE_RING_START_SEC` 180 s
 *     ＋ `ROYALE_COMBAT_SEC` 210 s）：真實窗口 30 s，這份預測算出 120 s ⇒ **早 90 秒**；
 *   · **殭屍王延長**（`boss.extendCombatSec` / `boss.delayFireRingSec` 各自可調，
 *     兩格不相等時窗口就跟著位移）；
 *   · 任何未來只動一半時鐘的規則。
 *
 * ⭐ 所以 cue 現在**讀權威自己的數字**：`MatchState.fireRingTicks` 與
 * `MatchState.fireRingRadius` 每一個 snapshot 都在線上（`net/RoomStore` 的
 * `hudStore`），⛔ 不必再猜。判準與小地圖危險圈**完全同一條**
 * （`ui/hud/minimapMath.ts` 的 `dangerRimSpecFor`）：**圈開始縮了沒有** ——
 * 於是床與圈是一個決定，不是兩個會各自腐爛的推導。
 *
 * config 推導留下來當**離線 / 未連線時的後備**（單元測試、骨架開機、還沒進場的
 * 分頁），而 {@link noteFireRingIgnition} 從「唯一的守衛」降級成**對帳警報**：
 * 它現在說的是「你的 config 預測與權威對不起來」，⛔ 不再是「cue 錯了」。
 *
 * ---------------------------------------------------------------------------
 * WHY `FIRE_RING_SEC` IS AN `export let` AND MUST STAY ONE
 * ---------------------------------------------------------------------------
 * ⚠️ 這一段以前寫著「`ui/hud/Minimap.tsx` imports `FIRE_RING_SEC` and does
 * arithmetic on it」—— **那是假的**（第三守則）。#195 把危險圈改成讀複製回來的
 * 半徑之後，小地圖就再也沒有碰過這個值，而
 * `ui/hud/minimapFireRing.test.ts` 有一條守衛**明文禁止**它回去
 * （`expect(src).not.toMatch(/FIRE_RING_SEC/)`）。
 *
 * 今天唯一的讀者是 `audio/scene.ts` 的 `sceneForMatch`（它也把這個名字再
 * re-export 出去給歷史 import 路徑）。它仍然是 `export let`，因為它是一個
 * **每幀重新解析**的活值：ESM named import 是 live binding，所以 re-export 的
 * 那一份會跟著動。⛔ 改回 `const`、或把它抄進別的模組，就等於把它凍在
 * 「連線之前那一刻的預測」上。
 *
 * The value starts at the no-ring fallback and is re-resolved every time
 * {@link fireRingWindowSec} runs — which is on every `sceneForMatch` call, i.e.
 * at least once per HUD clock second of a live match. ⭐ That cadence is also
 * where the 「休眠半徑」 observation below is taken, and it is enough by a wide
 * margin: the ring sits dormant for `fireRing.startSec` (60 s shipped), so it is
 * observed dozens of times before it moves. `subscribeContentBoot`
 * additionally refreshes it the instant the content registries are populated,
 * so a page that never enters a match still holds the authored number.
 */
import { Configs } from "@ggd/shared/content";
import type { ConfigMatchDoc } from "@ggd/shared/content";
import { subscribeContentBoot } from "../content/bootContent";
import { hudStore } from "../net/RoomStore";
import { COMBAT_PHASE } from "./combatBedGate";

/**
 * Fallback window when the content tree carries NO fire ring (a skeleton boot,
 * a unit test, or an operator who authored no `match.fireRing` block). There is
 * no burn to cue in that case, so this is the legacy generic "the round clock
 * is about to run out" pressure window — deliberately the historical 30 s, so
 * removing the ring from content restores the pre-#132 behaviour exactly
 * instead of silently muting the tension bed.
 */
export const NO_RING_FALLBACK_SEC = 30;

/**
 * Fallback shrink duration when the content tree carries no ring (see
 * {@link NO_RING_FALLBACK_SEC}). Matches the schema's own `shrinkSec` default,
 * so a skeleton boot animates the band over the same 20 s the sim would.
 */
export const DEFAULT_SHRINK_SEC = 20;

/** The seconds fields of `config.match@1`'s `match` block that this consumes. */
export interface FireRingClockSource {
  combatMaxSec?: number;
  fireRing?: { startSec?: number; shrinkSec?: number } | undefined;
}

/**
 * PURE core: seconds left on the combat clock when the ring ignites.
 *
 *   • no ring authored            → {@link NO_RING_FALLBACK_SEC}
 *   • ring ignites at/after the
 *     phase cap (startSec >= max) → 0, i.e. NEVER cue it. The phase force-ends
 *                                   before the ring can burn anything, so a
 *                                   tension bed would be lying. (The `config@1`
 *                                   schema is supposed to forbid this; we do
 *                                   not trust it, because `Configs.tryGet` is
 *                                   not re-validated at read time.)
 *   • otherwise                   → combatMaxSec - startSec
 */
export function fireRingWindowSecFrom(m: FireRingClockSource | null | undefined): number {
  const combatMaxSec = m?.combatMaxSec;
  const startSec = m?.fireRing?.startSec;
  if (typeof combatMaxSec !== "number" || !Number.isFinite(combatMaxSec)) return NO_RING_FALLBACK_SEC;
  if (typeof startSec !== "number" || !Number.isFinite(startSec)) return NO_RING_FALLBACK_SEC;
  const window = combatMaxSec - startSec;
  if (!(window > 0)) return 0;
  // A ring that ignites at t=0 would burn for the whole phase; clamp to the
  // phase length so the number can never exceed the clock it is compared to.
  return Math.min(combatMaxSec, window);
}

/**
 * Seconds left on the combat clock when the fire ring ignites. LIVE BINDING —
 * see the header. Read it, never re-declare it.
 */
export let FIRE_RING_SEC: number = NO_RING_FALLBACK_SEC;

// ---------------------------------------------------------------------------
// THE AUTHORITY'S OWN NUMBERS (GH#186)
// ---------------------------------------------------------------------------

/** The four `MatchState` fields the cue reads back off the wire. */
export interface FireRingWireState {
  /** `hudStore.phase` — the cue only exists inside live combat. */
  phase: string;
  /** the HUD's combat countdown, seconds */
  phaseSecondsLeft: number;
  /** `MatchState.fireRingTicks` — the sim's combat-elapsed ring counter; -1 = disarmed */
  fireRingTicks: number;
  /** `MatchState.fireRingRadius` — the ring's CURRENT world radius */
  fireRingRadius: number;
}

/**
 * PURE core: the cue window the WIRE implies, or `null` when the wire cannot
 * answer (not in combat, no ring armed, nothing observed yet) and the caller
 * must fall back to the config prediction.
 *
 * `dormantRadius` is the LARGEST radius seen so far this combat phase. While
 * the ring is dormant the sim replicates the zone boundary unchanged
 * (`sim/fireRing.ts` `currentFireRingRadius`), so 「最大值」 IS 「還沒點火時的
 * 半徑」 — the ring only ever contracts. That makes 「圈縮了沒有」 a comparison
 * against a number we observed rather than one we assumed, which is the whole
 * point: no arena geometry, no `startSec`, no round number, nothing to drift.
 *
 * The two answers:
 *   · **closing** → the cue is ON *now*, so hand back the current
 *     `phaseSecondsLeft`. `sceneForMatch` tests `phaseSecondsLeft <= window`,
 *     which is then true this frame and every later frame of the round (the
 *     clock only falls). ⛔ Deliberately NOT a latched constant — a latch would
 *     have to be re-armed per round and would go stale exactly like the
 *     prediction it replaces.
 *   · **armed but dormant** → 0, i.e. NEVER cue. `sceneForMatch` guards
 *     `phaseSecondsLeft > 0`, so 0 can never switch the bed on.
 *
 * `ignited` is the one-shot `fireRingStart` event having been seen this phase
 * (see {@link noteFireRingIgnition}). Belt and braces: the event lands one tick
 * BEFORE the radius has visibly moved, so honouring it puts the bed swap
 * exactly on the ignition beat instead of one snapshot late.
 */
export function fireRingWindowSecFromWire(
  w: FireRingWireState,
  dormantRadius: number,
  ignited: boolean,
): number | null {
  if (w.phase !== COMBAT_PHASE) return null;
  if (!(w.fireRingTicks >= 0)) return null; // disarmed → the config fallback is all there is
  if (ignited) return Math.max(0, w.phaseSecondsLeft);
  if (!(w.fireRingRadius > 0) || !(dormantRadius > 0)) return null;
  if (!(w.fireRingRadius < dormantRadius)) return 0; // armed, not closing → cue OFF
  return Math.max(0, w.phaseSecondsLeft);
}

/**
 * Largest ring radius observed during the CURRENT combat phase, and whether the
 * ignition event has been seen in it. Both are cleared the moment the phase
 * leaves combat or the ring disarms, so entering the next round starts from
 * nothing — which is what makes the 決賽回合 (a 180 s ignition inside a 210 s
 * round) resolve on its own numbers instead of inheriting round N−1's.
 *
 * ⚠️ KNOWN, ACCEPTED LIMIT: a client that joins MID-ROUND while the ring is
 * sitting on its 第一段 plateau (`stage1Radius`, held from `shrinkSec` until
 * `stage2StartSec`) seeds `dormantRadius` at the plateau and therefore reads
 * 「not closing」 until 第二段 starts moving. It is a reconnect-only window, it
 * self-heals, and the alternative — believing the prediction — is the 90-second
 * lie this whole section exists to remove.
 */
let dormantRadius = 0;
let ignitedThisPhase = false;

/**
 * Re-resolve {@link FIRE_RING_SEC} and return it.
 *
 * RESOLUTION ORDER — authority first, prediction only as a fallback:
 *   1. the replicated ring state ({@link fireRingWindowSecFromWire});
 *   2. `combatMaxSec - fireRing.startSec` off `config.match@1`, for every
 *      context with no live match: unit tests, a skeleton boot, the lobby.
 *
 * A Map lookup, a store read and two subtractions — no I/O, safe to call per
 * frame. Callers that want the pure forms (tests, replay tooling) should use
 * {@link fireRingWindowSecFrom} / {@link fireRingWindowSecFromWire}.
 */
export function fireRingWindowSec(): number {
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  const derived =
    doc?.schema === "config@1" ? fireRingWindowSecFrom(doc.match) : NO_RING_FALLBACK_SEC;
  FIRE_RING_SHRINK_SEC = doc?.schema === "config@1" ? fireRingShrinkSecFrom(doc.match) : DEFAULT_SHRINK_SEC;

  const w = hudStore.getState();
  if (w.phase !== COMBAT_PHASE || !(w.fireRingTicks >= 0)) {
    dormantRadius = 0;
    ignitedThisPhase = false;
  } else if (w.fireRingRadius > dormantRadius) {
    dormantRadius = w.fireRingRadius;
  }
  const observed = fireRingWindowSecFromWire(
    { phase: w.phase, phaseSecondsLeft: w.phaseSecondsLeft, fireRingTicks: w.fireRingTicks, fireRingRadius: w.fireRingRadius },
    dormantRadius,
    ignitedThisPhase,
  );

  FIRE_RING_SEC = observed ?? derived;
  return FIRE_RING_SEC;
}

// ---------------------------------------------------------------------------
// THE SHRINK DURATION — a SECOND derived number, deliberately not overloaded
// onto the first (task #195)
// ---------------------------------------------------------------------------

/**
 * PURE core: how long the ring takes to close, in seconds.
 *
 * This is NOT {@link FIRE_RING_SEC} and must never be folded into it. They
 * answer different questions and are 40 vs 20 under the shipped config:
 * `FIRE_RING_SEC` is "how much round clock is left when the ring ignites"
 * (`audio/scene.ts` compares `phaseSecondsLeft` against it; `Minimap.tsx`
 * divides by it for the rim's urgency ramp), while this is "how long the
 * contraction lasts" (the flame band's animation length). Overloading one
 * scalar would make the bed swap and the visual disagree the moment the owner
 * retunes either number — the #132 pathology, one layer down.
 */
export function fireRingShrinkSecFrom(m: FireRingClockSource | null | undefined): number {
  const s = m?.fireRing?.shrinkSec;
  return typeof s === "number" && Number.isFinite(s) && s > 0 ? s : DEFAULT_SHRINK_SEC;
}

/**
 * Seconds the fire ring takes to contract to its minimum. LIVE BINDING, for the
 * same reason {@link FIRE_RING_SEC} is one — read it, never re-declare it.
 */
export let FIRE_RING_SHRINK_SEC: number = DEFAULT_SHRINK_SEC;

// Content boot populates `Configs` asynchronously; latch the authored number
// the moment it lands so a client sitting in the lobby already holds it.
// Passive (a Set.add) — it does NOT kick a load off, so importing the audio
// layer in a test still fetches nothing.
subscribeContentBoot(() => {
  fireRingWindowSec();
});
// ...and resolve once at import time, for the case where boot already settled.
fireRingWindowSec();

// ---------------------------------------------------------------------------
// RUNTIME TRIPWIRE — the sim's own event vs. this derivation
// ---------------------------------------------------------------------------

/** How far the observed ignition may sit from the derived one before we shout.
 *  `phaseSecondsLeft` is a ceil() of a 30 Hz tick counter and the event is
 *  drained on a render frame, so ±1 s is ordinary quantisation. 1.5 s is the
 *  smallest threshold that never fires on rounding alone. */
const DRIFT_TOLERANCE_SEC = 1.5;

let driftReported = false;

/**
 * Called from the per-frame combat-SFX mapper when the sim's `fireRingStart`
 * event arrives — the ONE moment where the client is told, by the authority,
 * exactly when the ring began to burn.
 *
 * TWO JOBS since GH#186, and only the second one is new:
 *
 *  ① **It arms the cue.** This event IS the ignition, so the bed swaps here —
 *     one tick before the replicated radius has visibly moved. That is the half
 *     that used to be missing: the cue was driven by a prediction and this
 *     function only complained about it.
 *
 *  ② **It reconciles config against the authority.** The `config.match@1`
 *     prediction is still the offline fallback, so it still matters that it is
 *     right, and a disagreement still names a real defect somewhere —
 *     `content/config/config.match.json`, the host's round-length override, or
 *     a rule that moves one clock and not the other (決賽回合 is exactly that:
 *     `ROYALE_FIRE_RING_START_SEC` / `ROYALE_COMBAT_SEC` are hard-coded in
 *     `apps/game-server/src/match/PairedDuels.ts`, so the doc cannot predict it).
 *     ⛔ It is no longer 「the cue is wrong」 — the cue now follows ①.
 *
 * A silent mismatch is the failure mode, so the alarm is `console.error`, and
 * it is one-shot so a 210 s 決賽 does not spam the console every match.
 *
 * @param phaseSecondsLeft the HUD's combat clock at the instant of ignition
 */
export function noteFireRingIgnition(phaseSecondsLeft: number): void {
  // ① arm the cue FIRST — a bad/absent clock must not cost us the swap, and
  // this latch is what makes the bed land on the ignition beat.
  ignitedThisPhase = true;
  if (driftReported) return;
  if (!Number.isFinite(phaseSecondsLeft)) return;
  // No clock (not connected, phase not running, or a synthetic event in a unit
  // test) → nothing to compare against. A real ignition always happens with
  // seconds still on the combat timer, so this only suppresses noise, never a
  // genuine drift: a ring that ignites at 5 s left against a derived 0 still
  // trips the alarm below.
  if (!(phaseSecondsLeft > 0)) return;
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  // ⛔ 對帳要拿**預測**去比,不是拿 `fireRingWindowSec()` —— 後者現在回的就是
  // 權威自己的數字,和自己比永遠相等,於是這個警報會變成一條**結構上不可能響**的
  // 死程式(第二守則失敗形態④)。
  const derived =
    doc?.schema === "config@1" ? fireRingWindowSecFrom(doc.match) : NO_RING_FALLBACK_SEC;
  if (Math.abs(phaseSecondsLeft - derived) <= DRIFT_TOLERANCE_SEC) return;
  driftReported = true;
  console.error(
    `[fireRing] CONFIG DRIFT (GH#186): the sim ignited the ring with ${phaseSecondsLeft}s left on ` +
      `the combat clock, but config.match@1 predicts ${derived}s ` +
      `(combatMaxSec - fireRing.startSec) — ${Math.round(phaseSecondsLeft - derived)}s apart. ` +
      `The tension BGM now follows the SIM, so the cue itself is correct; what is wrong is the ` +
      `prediction every offline surface still reads. Fix content/config/config.match.json, or the ` +
      `server-side rule that moves one clock and not the other — do not paper over it.`,
  );
}

/** Test-only: re-arm the one-shot drift alarm and drop the per-phase latches. */
export function __resetFireRingDriftAlarm(): void {
  driftReported = false;
  dormantRadius = 0;
  ignitedThisPhase = false;
}

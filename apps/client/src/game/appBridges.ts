import { hideBodyFor } from "../render/scriptedHide";
import { moveBodyFor } from "../render/scriptedMove";
/**
 * appBridges — GameApp **注給子系統的接線**（GH#838）。
 *
 * ⭐ 為什麼這兩支住同一個檔：它們是**同一個職責** —— 「GameApp 知道 registry／
 * 隊伍在哪，子系統只拿一個函式」。而它們住這裡而不是 `GameApp.ts`，理由是
 * 第〇·七守則的棘輪（`gameAppSplit.test.ts`：那個檔只能變短）——
 * ⚠️ 它在 2026-08-28 當場咬到「又在這個檔加一行」。
 * ⛔ 這個檔不是雜物櫃：進來的東西要符合上面那一句職責，否則另開檔。
 */

import type { SfxRelation } from "../audio/spatial";

export function footstepRelationOf(
  id: number,
  localId: number | null,
  teamOf: (entityId: number) => number | null,
): SfxRelation {
  if (localId === null) return "third";
  if (id === localId) return "self";
  const mine = teamOf(localId);
  const theirs = teamOf(id);
  if (mine === null || theirs === null) return "third";
  return mine === theirs ? "ally" : "enemy";
}

/* ── GH#838 M4：演出腳本 → 英雄動畫脈衝 ─────────────────────────────────
 * 特效層知道「要演什麼」，⛔ 不知道 view 從哪來（同 vfxDoc 的注入理由）。
 * view 不在（實體剛離場）⇒ 安靜跳過，⛔ 不擲例外（一次 throw 會帶走同一批
 * 後面每一個事件，GH#608）。 */
export interface AnimPulseTarget {
  pulse(
    kind: "attack" | "cast" | "hurt",
    nowMs: number,
    opts?: { windowMs?: number; clipWindowMs?: number; restartClip?: boolean },
  ): void;
}

/** 只要問得出「這個 id 的英雄 view 是誰」就夠了（出貨傳 `EntityViewRegistry`）。 */
export interface ChampionViewLookup {
  getChampionView(id: number): AnimPulseTarget | undefined;
}

export function makeAnimPulseBridge(
  views: ChampionViewLookup,
  /** 毫秒時鐘。出貨用 `performance.now`；測試注一個假的。 */
  now: () => number = () => performance.now(),
): (id: number, kind: "attack" | "cast" | "hurt", opts?: { clipWindowMs?: number }) => void {
  return (id, kind, opts) => {
    views.getChampionView(id)?.pulse(kind, now(), opts);
  };
}


/* ── GH#838 N6：演出用的暫時隱形 ────────────────────────────────────────
 * ⚠️ 這不是權威隱身（`ENTITY_FLAG.INVISIBLE`）—— 那一格會讓伺服器索敵拒絕鎖定。
 * 這裡只是客戶端的一格 alpha 覆寫，由 `render/scriptedHide` 記「到什麼時候」，
 * 再由 `EntityViewRegistry` 在**每一次 sync** 的同一個合成點乘進去。 */
export function makeHideBodyBridge(
  now: () => number = () => performance.now(),
): (id: number, durationMs: number) => void {
  return (id, durationMs) => hideBodyFor(id, durationMs, now());
}

/**
 * ⭐ M1 逐刀瞬移 / M3 升空曲線（GH#838，超究武神霸斬）。
 * ⚠️ 與 `hideBody` 同一個形狀：⭐ 只記「誰、偏移多少、到什麼時候」，
 * 由 `EntityViewRegistry` 在同一個合成點加進去，⛔ 而且自己會過期。
 */
export function makeMoveBodyBridge(
  now: () => number,
): (id: number, offset: { x: number; y: number; z: number }, durationMs: number, arc: boolean) => void {
  return (id, offset, durationMs, arc) => moveBodyFor(id, offset, durationMs, arc, now());
}

/**
 * ⭐ 演出腳本要的**全部**接縫，一次給齊（GH#838）。
 * GameApp 只寫一行 `...makeScriptFxBridges(this.views)` —— 第〇·七守則的
 * 「一行接線」病的正解是**讓那一行不隨功能數成長**，⛔ 不是每加一個機制多一行。
 */
export function makeScriptFxBridges(
  views: ChampionViewLookup,
  now: () => number = () => performance.now(),
): {
  pulseAnim: (id: number, kind: "attack" | "cast" | "hurt", opts?: { clipWindowMs?: number }) => void;
  hideBody: (id: number, durationMs: number) => void;
  /** ⭐ M1 逐刀瞬移 / M3 升空曲線（GH#838）—— **只動畫面**的位移。 */
  moveBody: (
    id: number,
    offset: { x: number; y: number; z: number },
    durationMs: number,
    arc: boolean,
  ) => void;
} {
  return {
    pulseAnim: makeAnimPulseBridge(views, now),
    hideBody: makeHideBodyBridge(now),
    moveBody: makeMoveBodyBridge(now),
  };
}

/**
 * K3 GH#638 —— 另一場地的演出不可外漏。
 * owner：「另外一個場地的聲音、語音、震動、閃爍等畫面不應該影響到目前場地」。
 *
 * 兩個 zone 各發一發 screenShake ＋ 一顆音效事件，斷言只有同 zone 的到達。
 * shake 數的是**真的** `ScreenFxLayer` 的 `addShake` 呼叫（⛔ 不是手搭的假 sink）；
 * 音效走出貨的判準（`cueEventZone` × `zoneAllowsCue` × 真的 `VisibleZones`）——
 * GameApp 建構不出來（WebGL），所以決策抽成純函式，與 GH#612 同一個理由。
 *
 * ── 突變紀錄（一批一條）────────────────────────────────────────────────────
 *  · `screenCueViewportMask` 拿掉 zone 不同即丟棄那一行（`vz !== cueZone`）
 *    → 紅：「兩 zone 各一發 screenShake ⇒ 只有同 zone 的格子抖」（[2,2]≠[1,1]）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { ScreenFxLayer } from "../vfx/ScreenFxLayer";
import { DEFAULT_SCREEN_FX_LIMITS, dispatchScreenCue } from "./screenFx";
import { cueEventZone, zoneAllowsCue } from "../audio/spatialPolicy";
import { VisibleZones } from "../net/zoneVisibility";

/** sim 真的送的 broadcast shake 形狀（`sim/effects/clientCues.ts`，含 `zone`）。 */
function shakeCue(zone: number): Record<string, unknown> & { broadcast: boolean; subjects: readonly number[] } {
  return {
    broadcast: true,
    subjects: [],
    caster: 10,
    zone,
    amplitude: DEFAULT_SCREEN_FX_LIMITS.shakeMaxAmplitude,
    durationSec: DEFAULT_SCREEN_FX_LIMITS.shakeMaxSec,
  };
}

let live: ScreenFxLayer[] = [];
afterEach(() => {
  for (const l of live) l.dispose();
  live = [];
});

describe("K3 GH#638 另一場地的演出不可外漏", () => {
  it("兩 zone 各一發 screenShake ⇒ 只有同 zone 的格子抖（觀戰格跟著觀看的 zone）", () => {
    const shakes = [0, 0];
    const layers = shakes.map(
      (_, p) =>
        new ScreenFxLayer({
          host: null,
          limits: DEFAULT_SCREEN_FX_LIMITS,
          reducedMotion: false,
          addShake: () => {
            shakes[p]!++;
          },
        }),
    );
    live = layers;
    const viewers = [10, 20];
    const viewerZones = [0, 1]; // 第 2 格在觀戰 zone 1 —— 跟著觀看目標，⛔ 不是寫死本地
    dispatchScreenCue("screenShake", shakeCue(0), viewers, layers, viewerZones);
    dispatchScreenCue("screenShake", shakeCue(1), viewers, layers, viewerZones);
    expect(shakes, "broadcast 也只進觀看那個 zone 的格子").toEqual([1, 1]);
  });

  it("兩 zone 各一顆音效事件 ⇒ 只有本地觀看 zone 的放行；歸不了戶 = 放行", () => {
    const viewing = new VisibleZones();
    viewing.begin();
    viewing.add(0);
    viewing.end();
    const zoneOf = (id: number): number | null => (id === 10 ? 0 : id === 20 ? 1 : null);
    // 出貨的 `damage` 形狀：zone 由空間表（EVENT_SPATIAL）的實體欄位推導
    const near = cueEventZone("damage", { target: 10, source: 10 }, zoneOf);
    const far = cueEventZone("damage", { target: 20, source: 20 }, zoneOf);
    expect([zoneAllowsCue(near, viewing), zoneAllowsCue(far, viewing)]).toEqual([true, false]);
    // fail-open：歸不了戶的事件照舊播（與 VisibleZones 同一個失效方向）
    expect(zoneAllowsCue(cueEventZone("damage", {}, zoneOf), viewing)).toBe(true);
  });
});

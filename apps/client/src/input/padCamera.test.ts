/**
 * R3 is the only camera control the 2026-07-27 pad map has left for zoom, so it
 * has to carry both halves of 「鏡頭歸位 / 縮放」. These drive `PadCameraControl`
 * against a FAKE RIG that behaves like the real one (`CameraRig.zoomBy` clamps
 * the dolly to [DOLLY_MIN, DOLLY_MAX] after scaling the wheel delta by 0.02) and
 * assert what the camera actually does, not what the class stores.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_CAMERA } from "@ggd/shared/content";
import { join } from "node:path";
import {
  GAMEPAD_ZOOM_NOTCHES,
  GAMEPAD_ZOOM_STEP,
  PadCameraControl,
  type PadCameraRig,
} from "./padCamera";

/**
 * The real rig's clamp + scale. NOT imported: `render/CameraRig` pulls in
 * @babylonjs, and `input/` may not (client-08).
 *
 * ⭐ 這裡**推導**自 `DEFAULT_CAMERA`（GH#332 之後那四個數字住在
 * `config.camera@1`），⛔ 不再是四個抄過來的字面量。
 *
 * ⚠️ 它本來是這樣寫的：
 *     const DOLLY_MAX = 40;
 *     expect(src).toContain(`DOLLY_MAX = ${DOLLY_MAX}`);
 * —— **掃原始碼字串代替行為**（CLAUDE.md 失敗形態⑥）。那條有兩個毛病：
 *   ① 它證明不了任何行為，只證明某個字出現在某個檔案裡；
 *   ② 數字一搬家（常數 → 後台欄位）它就只能紅，而且訊息完全誤導
 *      （「rig 的常數不對」，真相是「那個常數已經不存在了，這是對的」）。
 * ⇒ 現在改成從**同一份出貨預設**推導。真正還需要盯著原始碼的只剩「滾輪那一行
 * 有沒有乘上設定裡的 wheelStep」—— 那是一個接線，掃字串是它唯一便宜的驗法。
 */
const DOLLY_MIN = DEFAULT_CAMERA.minDolly;
const DOLLY_MAX = DEFAULT_CAMERA.maxDolly;
const DOLLY_MAX_DEAD = DEFAULT_CAMERA.maxDollyDead;
/** ⭐ GH#361：預設是它**自己的一格**，⛔ 不再是 `minDolly` 的別名。 */
const DOLLY_DEFAULT = DEFAULT_CAMERA.defaultDolly;
const WHEEL_SCALE = DEFAULT_CAMERA.wheelStep;
/** 一節往「離預設遠」的方向走：出貨預設在最遠端 ⇒ 往內（負）。 */
const AWAY_SIGN = DOLLY_DEFAULT >= DOLLY_MAX ? -1 : 1;

it("the rig reads its clamps AND its default from config.camera", () => {
  const src = readFileSync(join(__dirname, "..", "render", "CameraRig.ts"), "utf8");
  // 接線：滾輪要乘**設定裡的**步進，⛔ 不是一個寫死的 0.02。
  expect(src).toContain("wheelDeltaY * c.wheelStep");
  // 夾限的兩端都要來自設定（`cameraLimits()`），⛔ 不是模組層級的常數。
  expect(src).toContain("Math.max(c.minDolly");
  expect(src).toContain("this.dead ? c.maxDollyDead : c.maxDolly");
  // ⭐ 開局距離也一樣走設定（GH#361）。⛔ 不是模組載入時凍結的 DOLLY_DEFAULT。
  expect(src).toContain("this.dolly = cameraLimits().defaultDolly");
  // ⭐ 出貨的最遠視野**比最近遠**——這是唯一會讓滾輪整個失效的組合。
  expect(DOLLY_MAX).toBeGreaterThan(DOLLY_MIN);
  expect(DOLLY_MAX_DEAD).toBeGreaterThanOrEqual(DOLLY_MAX);
  // ⭐ 預設必須落在區間裡，否則一進場就會被夾走。
  expect(DOLLY_DEFAULT).toBeGreaterThanOrEqual(DOLLY_MIN);
  expect(DOLLY_DEFAULT).toBeLessThanOrEqual(DOLLY_MAX);
});

function fakeRig(): PadCameraRig & { dolly: number } {
  return {
    dolly: DOLLY_DEFAULT,
    followLock: true,
    zoomAwaySign: AWAY_SIGN,
    zoomBy(wheelDeltaY: number) {
      this.dolly = Math.min(DOLLY_MAX, Math.max(DOLLY_MIN, this.dolly + wheelDeltaY * WHEEL_SCALE));
    },
    homeZoom() {
      this.dolly = DOLLY_DEFAULT; // 絕對賦值，跟真的 rig 一樣
    },
    toggleFollow() {
      this.followLock = !this.followLock;
    },
  };
}

/** 「離預設更遠」在**目前設定下**是哪個方向 —— 出貨是往內，#31a 是往外。 */
function movedAway(dolly: number): boolean {
  return AWAY_SIGN < 0 ? dolly < DOLLY_DEFAULT : dolly > DOLLY_DEFAULT;
}

describe("R3 — 鏡頭歸位 / 縮放", () => {
  it("each press steps the camera one notch AWAY from the default", () => {
    const rig = fakeRig();
    const pad = new PadCameraControl();
    const seen: number[] = [];
    for (let i = 0; i < GAMEPAD_ZOOM_NOTCHES; i++) {
      pad.apply(rig, { zoomCycle: true });
      seen.push(rig.dolly);
    }
    // monotonically AWAY from the default (out under #31a, in since GH#361)
    expect(seen).toEqual([...seen].sort((a, b) => (a - b) * AWAY_SIGN));
    expect(movedAway(rig.dolly)).toBe(true);
    expect(rig.dolly).toBeCloseTo(
      DOLLY_DEFAULT + AWAY_SIGN * GAMEPAD_ZOOM_NOTCHES * GAMEPAD_ZOOM_STEP * WHEEL_SCALE,
    );
  });

  it("the press after the last notch HOMES: default distance, back on the hero", () => {
    const rig = fakeRig();
    rig.followLock = false; // the player had panned away
    const pad = new PadCameraControl();
    for (let i = 0; i < GAMEPAD_ZOOM_NOTCHES; i++) pad.apply(rig, { zoomCycle: true });
    expect(rig.dolly).not.toBeCloseTo(DOLLY_DEFAULT);

    pad.apply(rig, { zoomCycle: true });
    expect(rig.dolly).toBe(DOLLY_DEFAULT); // 歸位, exactly — not "roughly back"
    expect(rig.followLock).toBe(true); // …and following again
  });

  it("歸位從**任何**距離都一下到位（含觀戰被拉到最遠的那一端）", () => {
    // ⚠️ 以前這是一個「夠大的相對量」(-8000)，而它只在「預設＝最近」時是對的：
    //    撞牆會停在 minDolly。GH#361 之後預設不在端點上，所以歸位必須是
    //    **絕對賦值**（rig.homeZoom）。這一條就是釘那個差別。
    const rig = fakeRig();
    const pad = new PadCameraControl();
    rig.dolly = DOLLY_MAX_DEAD; // 陣亡觀戰時被拉到最遠
    for (let i = 0; i < GAMEPAD_ZOOM_NOTCHES + 1; i++) pad.apply(rig, { zoomCycle: true });
    expect(rig.dolly).toBe(DOLLY_DEFAULT);
  });

  it("the cycle wraps forever (a second lap behaves like the first)", () => {
    const rig = fakeRig();
    const pad = new PadCameraControl();
    for (let i = 0; i < GAMEPAD_ZOOM_NOTCHES + 1; i++) pad.apply(rig, { zoomCycle: true });
    expect(rig.dolly).toBe(DOLLY_DEFAULT);
    pad.apply(rig, { zoomCycle: true });
    expect(movedAway(rig.dolly)).toBe(true); // lap 2 starts stepping away again
  });
});

describe("L3 — 鏡頭跟隨開關", () => {
  it("toggles follow, and only follow", () => {
    const rig = fakeRig();
    const pad = new PadCameraControl();
    pad.apply(rig, { toggleFollow: true });
    expect(rig.followLock).toBe(false);
    expect(rig.dolly).toBe(DOLLY_DEFAULT); // no zoom side-effect
    pad.apply(rig, { toggleFollow: true });
    expect(rig.followLock).toBe(true);
  });

  it("re-locking follow restarts the zoom lap (L3 is also 'put me back')", () => {
    const rig = fakeRig();
    const pad = new PadCameraControl();
    for (let i = 0; i < GAMEPAD_ZOOM_NOTCHES; i++) pad.apply(rig, { zoomCycle: true });
    pad.apply(rig, { toggleFollow: true }); // off
    pad.apply(rig, { toggleFollow: true }); // back on → fresh lap
    pad.apply(rig, { zoomCycle: true });
    expect(movedAway(rig.dolly)).toBe(true); // stepped away, did NOT home
  });

  it("an empty intent does nothing at all", () => {
    const rig = fakeRig();
    new PadCameraControl().apply(rig, {});
    expect(rig.dolly).toBe(DOLLY_DEFAULT);
    expect(rig.followLock).toBe(true);
  });
});

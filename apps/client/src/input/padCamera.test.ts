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
  GAMEPAD_ZOOM_HOME_DELTA,
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
const DOLLY_DEFAULT = DOLLY_MIN;
const WHEEL_SCALE = DEFAULT_CAMERA.wheelStep;

it("the rig reads its clamps from config.camera, and 歸位 uses the same floor", () => {
  const src = readFileSync(join(__dirname, "..", "render", "CameraRig.ts"), "utf8");
  // 接線：滾輪要乘**設定裡的**步進，⛔ 不是一個寫死的 0.02。
  expect(src).toContain("wheelDeltaY * c.wheelStep");
  // 夾限的兩端都要來自設定（`cameraLimits()`），⛔ 不是模組層級的常數。
  expect(src).toContain("Math.max(c.minDolly");
  expect(src).toContain("this.dead ? c.maxDollyDead : c.maxDolly");
  expect(src).toContain("DOLLY_DEFAULT = DOLLY_MIN");
  // ⭐ 出貨的最遠視野**比最近遠**——這是唯一會讓滾輪整個失效的組合。
  expect(DOLLY_MAX).toBeGreaterThan(DOLLY_MIN);
  expect(DOLLY_MAX_DEAD).toBeGreaterThanOrEqual(DOLLY_MAX);
});

function fakeRig(): PadCameraRig & { dolly: number } {
  return {
    dolly: DOLLY_DEFAULT,
    followLock: true,
    zoomBy(wheelDeltaY: number) {
      this.dolly = Math.min(DOLLY_MAX, Math.max(DOLLY_MIN, this.dolly + wheelDeltaY * WHEEL_SCALE));
    },
    toggleFollow() {
      this.followLock = !this.followLock;
    },
  };
}

describe("R3 — 鏡頭歸位 / 縮放", () => {
  it("each press steps the camera further out", () => {
    const rig = fakeRig();
    const pad = new PadCameraControl();
    const seen: number[] = [];
    for (let i = 0; i < GAMEPAD_ZOOM_NOTCHES; i++) {
      pad.apply(rig, { zoomCycle: true });
      seen.push(rig.dolly);
    }
    expect(seen).toEqual([...seen].sort((a, b) => a - b)); // monotonically out
    expect(rig.dolly).toBeGreaterThan(DOLLY_DEFAULT);
    expect(rig.dolly).toBeCloseTo(
      DOLLY_DEFAULT + GAMEPAD_ZOOM_NOTCHES * GAMEPAD_ZOOM_STEP * WHEEL_SCALE,
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

  it("the home delta really reaches the clamp from the WIDEST zoom-out", () => {
    // the spectator clamp (DOLLY_MAX_DEAD = 90) is the worst case the constant
    // has to cover; a delta that lands short would leave the camera stranded.
    const rig = fakeRig();
    rig.dolly = DOLLY_MAX_DEAD;
    rig.zoomBy(GAMEPAD_ZOOM_HOME_DELTA);
    expect(rig.dolly).toBe(DOLLY_DEFAULT);
  });

  it("the cycle wraps forever (a second lap behaves like the first)", () => {
    const rig = fakeRig();
    const pad = new PadCameraControl();
    for (let i = 0; i < GAMEPAD_ZOOM_NOTCHES + 1; i++) pad.apply(rig, { zoomCycle: true });
    expect(rig.dolly).toBe(DOLLY_DEFAULT);
    pad.apply(rig, { zoomCycle: true });
    expect(rig.dolly).toBeGreaterThan(DOLLY_DEFAULT); // lap 2 starts stepping out
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
    expect(rig.dolly).toBeGreaterThan(DOLLY_DEFAULT); // stepped out, did NOT home
  });

  it("an empty intent does nothing at all", () => {
    const rig = fakeRig();
    new PadCameraControl().apply(rig, {});
    expect(rig.dolly).toBe(DOLLY_DEFAULT);
    expect(rig.followLock).toBe(true);
  });
});

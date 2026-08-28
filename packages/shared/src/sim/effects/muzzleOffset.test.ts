/**
 * GH#838 N1 —— 槍口偏移（JASS `PolarProjectionBJ(loc, d, facing)`）的守衛。
 *
 * 09-04 龜派氣功的三個東西都在**槍口 +150wc3u**（j:31903/31905/31924），
 * ⛔ 不在腳下。⭐ 驗**機制**（有沒有沿面向推、方向解不到時不亂推、環心跟著動），
 * ⛔ 不驗數字（2.75 是內容，住 ability JSON）。
 *
 * 突變（2026-08-28）：把 `offsetAlongFacing` 的回傳改成 `p` ⇒ ①③ 紅。
 */
import { describe, it, expect } from "vitest";
import { modelFxInstancesFromFrame } from "./modelFxPlacement";

const AT_ORIGIN = { x: 0, z: 0 };
const FACING_X = { x: 1, z: 0 };

describe("GH#838 N1 槍口偏移", () => {
  it("① 沿**面向**把起點推出去（⛔ 不是留在腳下）", () => {
    const none = modelFxInstancesFromFrame(
      { path: "forward", distance: 5 },
      { origin: AT_ORIGIN, facing: FACING_X },
    );
    const pushed = modelFxInstancesFromFrame(
      { path: "forward", distance: 5, offsetForwardU: 3 },
      { origin: AT_ORIGIN, facing: FACING_X },
    );
    expect(pushed[0]!.origin.x, "起點沒有被推出去").toBeGreaterThan(none[0]!.origin.x);
    // 推的方向要是**面向**，⛔ 不是世界軸
    const diag = modelFxInstancesFromFrame(
      { path: "forward", distance: 5, offsetForwardU: 3 },
      { origin: AT_ORIGIN, facing: { x: 0, z: 1 } },
    );
    expect(diag[0]!.origin.z).toBeGreaterThan(0);
    expect(Math.abs(diag[0]!.origin.x)).toBeLessThan(1e-9);
  });

  it("② 面向解不到 ⇒ **不推**（⛔ 不猜一個 +x —— 那會把落點丟到沒有人指定的方向）", () => {
    const a = modelFxInstancesFromFrame(
      { path: "forward", distance: 5, offsetForwardU: 3 },
      { origin: AT_ORIGIN },
    );
    // 沒有 facing 時 forward 本來就解不出方向 ⇒ 零個實例；改用 static 驗起點
    const b = modelFxInstancesFromFrame(
      { path: "static", offsetForwardU: 3 },
      { origin: AT_ORIGIN },
    );
    expect(a.length).toBe(0);
    expect(b[0]!.origin).toEqual(AT_ORIGIN);
  });

  it("③ radial 的**環心**跟著推（⛔ 不是每一具各推一次 —— 那會把環拉成一團）", () => {
    const ring = modelFxInstancesFromFrame(
      { path: "radial", distance: 4, count: 4, offsetForwardU: 10 },
      { origin: AT_ORIGIN, facing: FACING_X },
    );
    expect(ring.length).toBe(4);
    for (const i of ring) expect(i.origin.x).toBeCloseTo(10, 6);
  });

  it("④ 缺席 ⇒ 逐位元同以前（這一格是嚴格的 no-op）", () => {
    const before = modelFxInstancesFromFrame(
      { path: "static", count: 3, spacing: 2 },
      { origin: AT_ORIGIN, facing: FACING_X },
    );
    const zero = modelFxInstancesFromFrame(
      { path: "static", count: 3, spacing: 2, offsetForwardU: 0 },
      { origin: AT_ORIGIN, facing: FACING_X },
    );
    expect(zero).toEqual(before);
  });
});

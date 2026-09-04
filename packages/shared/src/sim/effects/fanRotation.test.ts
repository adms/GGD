/**
 * ⭐⭐ 【扇形旋轉表】的閘 —— ⛔ 表打錯一個字要紅，⛔ 不是「畫面上偏了 3 度」。
 *
 * ⭐ 這一支**可以**用 `Math.cos`／`Math.sin`：`sim/purity.test.ts:44` 的掃描母體
 * 逐字排除 `.test.ts`（`!p.endsWith(".test.ts")`）。
 * ⇒ ⭐ 出貨那一份是純的常數表，而**重算它的權利留在測試裡** ——
 *   這正是「一份算得出來的資料」該有的形狀（第〇·四守則：值只有一個住處，
 *   ⛔ 而那個住處要有一條會紅的閘守著）。
 *
 * MUTATION LOG（落地前實跑，見 commit 訊息）。
 */
import { describe, it, expect } from "vitest";
import {
  FAN_UNIT_ROTATION,
  FAN_STEP_DEG,
  FAN_MAX_TOTAL_DEG,
  fanDirections,
} from "./fanRotation";
import { modelFxInstancesFromFrame } from "./modelFxPlacement";

const deg = (v: { x: number; z: number }): number => (Math.atan2(v.z, v.x) * 180) / Math.PI;
const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) < eps;

describe("扇形旋轉表（GH#916）", () => {
  it("★★ ⭐ 361 格逐位元等於 `Math.cos/​sin` 重算的結果", () => {
    expect(FAN_UNIT_ROTATION.length, "⛔ 表長度變了 —— 0…180° / 0.5° 應該是 361 格").toBe(361);
    const bad: string[] = [];
    for (let i = 0; i < FAN_UNIT_ROTATION.length; i++) {
      const a = (i * FAN_STEP_DEG * Math.PI) / 180;
      const [c, s] = FAN_UNIT_ROTATION[i]!;
      // ⚠️ 表是 round(…, 15) 產的 ⇒ 比對用同一個精度，⛔ 不是逐位元 ===
      if (!near(c, Math.cos(a), 1e-14) || !near(s, Math.sin(a), 1e-14)) {
        bad.push(`[${i}] ${i * FAN_STEP_DEG}° 表=(${c}, ${s}) 應為 (${Math.cos(a)}, ${Math.sin(a)})`);
      }
    }
    expect(
      bad.slice(0, 8),
      [
        `⛔⛔ 這 ${bad.length} 格與重算的結果對不上。`,
        "⭐ 表是**產生的常數**（見 fanRotation.ts 檔頭）—— ⛔ 不要手改它。",
        "⇒ 重產：python3 -c \"import math;[print(f'  [{round(math.cos(math.radians(i*0.5)),15)+0.0!r}, " +
          "{round(math.sin(math.radians(i*0.5)),15)+0.0!r}],') for i in range(361)]\"",
      ].join("\n"),
    ).toEqual([]);
  });

  it("⭐ 量尺自證：已知的四個角度取得到，⛔ 而且錯的取不到", () => {
    // 0° / 22.5° / 45° / 90° / 180°
    expect(FAN_UNIT_ROTATION[0]).toEqual([1, 0]);
    expect(near(FAN_UNIT_ROTATION[45]![0]!, Math.SQRT2 / 2 + 0.2168, 1e-3)).toBe(true); // cos22.5≈0.9239
    expect(near(FAN_UNIT_ROTATION[90]![0]!, Math.SQRT1_2)).toBe(true); // cos45
    expect(near(FAN_UNIT_ROTATION[180]![0]!, 0, 1e-15)).toBe(true); // cos90
    expect(near(FAN_UNIT_ROTATION[360]![0]!, -1)).toBe(true); // cos180
  });

  it("★★ ⭐⭐ 原作 A09I：`count:3, spreadDeg:45` ⇒ **facing−45 · facing · facing+45**", () => {
    // facing = +x（0°）
    const dirs = fanDirections({ x: 1, z: 0 }, 3, 45);
    expect(dirs.length).toBe(3);
    const angles = dirs.map(deg).map((a) => Math.round(a * 1e6) / 1e6);
    expect(
      angles,
      [
        "⛔⛔ 這正是 `tpl-dragon-serpent.spreadDeg` 的 `inert` 逐字說的那件事：",
        "  「原作 A09I 的**兩條側龍正是 facing±45**」——",
        "  ⛔ 而 radial 給的是朝三方的星爆（0/120/240），⛔ 不是扇。",
      ].join("\n"),
    ).toEqual([-45, 0, 45]);
  });

  it("★ ⭐ 偶數臂：`count:2, spreadDeg:45` ⇒ **±22.5°**（⛔ 不是 ±22 / ±23 那種不對稱）", () => {
    const angles = fanDirections({ x: 1, z: 0 }, 2, 45).map(deg).map((a) => Math.round(a * 1e6) / 1e6);
    expect(
      angles,
      "⛔ 半度解析度就是為了這一條 —— 整度表會把 ±22.5 湊成一個歪掉的扇",
      ).toEqual([-22.5, 22.5]);
  });

  it("★ ⭐ 跟著面向轉（⛔ 不是像 radial 那樣固定在世界 +x）", () => {
    // facing = +z（90°）⇒ 三臂應該是 45 / 90 / 135
    const angles = fanDirections({ x: 0, z: 1 }, 3, 45).map(deg).map((a) => Math.round(a * 1e6) / 1e6);
    expect(angles).toEqual([45, 90, 135]);
  });

  it("⭐ 總張角夾在 180° —— ⛔ 壓縮間距，不丟臂", () => {
    const dirs = fanDirections({ x: 1, z: 0 }, 5, 170); // 想要 4×170 = 680°
    expect(dirs.length, "⛔ 一條臂都不可以掉 —— 少一條龍玩家看得見").toBe(5);
    const angles = dirs.map(deg);
    const span = Math.max(...angles) - Math.min(...angles);
    expect(span).toBeLessThanOrEqual(FAN_MAX_TOTAL_DEG + 1e-9);
  });

  it("⭐ 退化：面向解不到 ⇒ 空陣列（⛔ 不是猜一個 +x）", () => {
    expect(fanDirections(undefined, 3, 45)).toEqual([]);
    expect(fanDirections({ x: 0, z: 0 }, 3, 45)).toEqual([]);
  });

  it("⭐ `count:1` ⇒ 就是面向本身（＝逐位元同 `path:\"forward\"`）", () => {
    expect(fanDirections({ x: 3, z: 0 }, 1, 45)).toEqual([{ x: 1, z: 0 }]);
  });

  it("⭐ 回傳的每一個都是**單位**向量（⛔ 下游 travel 靠它，長度歪掉射程就歪）", () => {
    for (const d of fanDirections({ x: 2, z: 5 }, 4, 30)) {
      expect(near(Math.sqrt(d.x * d.x + d.z * d.z), 1, 1e-12)).toBe(true);
    }
  });
});

/**
 * ⭐⭐ **接縫** —— ⛔ 上面那 9 條驗的是幾何，這一節驗的是「幾何有沒有被接上」。
 * CLAUDE.md 失敗形態⑪逐字：「兩條對的守衛，組合是空的」。
 */
describe("`path:\"fan\"` 真的走得到擺位（GH#916 接縫）", () => {
  /**
   * ⛔⛔ **這一節在 2026-09-04 被自己推翻過一次，留著當紀錄。**
   * 第一版斷言「三個**不同方向**」—— 那是照模板 `inert` 散文做的**近似**。
   * ⭐ 逐行讀 war3map.j 之後才知道原作是**起點排成弧、方向全部平行**：
   *   j:44068/44069 生成點在 `facing±45`（半徑 200），
   *   ⭐ 而 j:44070 的 `CreateNUnitsAtLoc(…, GetUnitFacing(施法者))` 說三具**同一個 facing**。
   * ⇒ 現在斷言的是**那個**。
   */
  const ARC_R = 4; // offsetForwardU（弧半徑）

  it("★★ ⭐ 原作 A09I：起點在 facing±45 的弧上，⛔ 而三具方向**平行**", () => {
    const out = modelFxInstancesFromFrame(
      { path: "fan", count: 3, spreadDeg: 45, distance: 10, offsetForwardU: ARC_R },
      { origin: { x: 0, z: 0 }, facing: { x: 1, z: 0 } },
    );
    expect(out.length, "⛔ 不是 3 具 ⇒ count 沒有被 `spread` 母體收進去").toBe(3);

    // ⭐ 方向：三具**一模一樣**（= 面向）
    const dirs = out.map((i) => [Math.round(i.dir!.x * 1e6), Math.round(i.dir!.z * 1e6)]);
    expect(
      dirs,
      "⛔⛔ 三具的方向不一樣 ⇒ 這是**方向扇**，而原作 j:44070 逐字是同一個 facing",
    ).toEqual([[1e6, 0], [1e6, 0], [1e6, 0]]);

    // ⭐ 起點：排在半徑 ARC_R 的弧上，角度 −45 / 0 / +45
    const at = out.map((i) => Math.round((Math.atan2(i.origin.z, i.origin.x) * 180) / Math.PI));
    expect(at, "⛔ 起點沒有排成弧 ⇒ fan 分支沒被叫到，或半徑讀錯了").toEqual([-45, 0, 45]);
    for (const i of out) {
      expect(Math.round(Math.sqrt(i.origin.x ** 2 + i.origin.z ** 2) * 1e6) / 1e6).toBe(ARC_R);
    }
  });

  it("★ ⭐ 反方向：`radial` 是**星爆**（方向散開、起點同一點）—— ⛔ 兩者必須不同", () => {
    const radial = modelFxInstancesFromFrame(
      { path: "radial", count: 3, distance: 10 },
      { origin: { x: 0, z: 0 }, facing: { x: 1, z: 0 } },
    );
    const angles = radial.map((i) => Math.round((Math.atan2(i.dir!.z, i.dir!.x) * 180) / Math.PI));
    expect(new Set(angles)).toEqual(new Set([0, 120, -120]));
    // radial 的起點全部在原點（⛔ 不散開），fan 反過來 —— 兩者剛好互補
    expect(radial.every((i) => i.origin.x === 0 && i.origin.z === 0)).toBe(true);
  });

  it("⭐ 弧跟著面向轉（⛔ 而 radial 的相位固定在世界 +x）", () => {
    const out = modelFxInstancesFromFrame(
      { path: "fan", count: 3, spreadDeg: 45, distance: 10, offsetForwardU: ARC_R },
      { origin: { x: 0, z: 0 }, facing: { x: 0, z: 1 } },
    );
    const at = out.map((i) => Math.round((Math.atan2(i.origin.z, i.origin.x) * 180) / Math.PI));
    expect(at).toEqual([45, 90, 135]);
    // 方向也跟著轉，而且仍然三具一致
    expect(out.every((i) => Math.abs(i.dir!.z - 1) < 1e-9 && Math.abs(i.dir!.x) < 1e-9)).toBe(true);
  });
});

/**
 * GH#838 M3 —— 升空曲線（JASS `SetUnitFlyHeightBJ`）的守衛。
 *
 * 01-04 超究武神霸斬的收尾把三個身體拉到 1000 wc3u 再急墜（rate 5000/4000/3800）——
 * 單一個 `heightU` 表達不了「升上去再掉下來」，而那是那一招的招牌節拍。
 *
 * ⭐ 驗**機制**（會不會隨時間動、兩端夾不夾得住、順序錯了會不會被擋），
 * ⛔ 不驗數字（曲線的值是內容，住 content/vfx-scripts/）。
 * 突變（2026-08-28）：把 `sampleHeightKeys` 的內插改成永遠回 `keys[0].h` ⇒ ①② 紅。
 */
import { describe, it, expect } from "vitest";
import { sampleHeightKeys } from "../render/modelFxRig";
import { zVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";

const RISE_FALL = [
  { t: 0, h: 0 },
  { t: 0.4, h: 6 },
  { t: 0.9, h: 0 },
] as const;

describe("GH#838 M3 升空曲線", () => {
  it("① 高度會隨時間變 —— 升上去再掉下來（⛔ 不是一個固定值）", () => {
    const mid = sampleHeightKeys(RISE_FALL, 0.4);
    expect(mid, "峰值那一刻沒有升起來").toBeGreaterThan(sampleHeightKeys(RISE_FALL, 0));
    expect(sampleHeightKeys(RISE_FALL, 0.9), "後段沒有掉回來").toBeLessThan(mid);
  });

  it("② 逐段線性 —— 兩格之間的中點就在兩端之間（⛔ 不是階梯跳）", () => {
    const a = sampleHeightKeys(RISE_FALL, 0.1);
    const b = sampleHeightKeys(RISE_FALL, 0.3);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(6);
  });

  it("③ 兩端夾住 —— 生成前與壽命後都不會外插出瘋掉的高度", () => {
    expect(sampleHeightKeys(RISE_FALL, -5)).toBe(0);
    expect(sampleHeightKeys(RISE_FALL, 999)).toBe(0);
    expect(sampleHeightKeys([], 1)).toBe(0);
  });

  it("④ schema 擋住沒排序的 keys（客戶端每幀取樣時⛔不排序）", () => {
    const bad = zVfxScriptDoc.safeParse({
      id: "t",
      schema: "vfx-script@1",
      abilityId: "godie-hart.r",
      segments: [
        {
          kind: "modelFx",
          on: "castStart",
          modelKey: "imported.doom",
          path: "static",
          lifeSec: 1,
          heightKeys: [
            { t: 0.5, h: 1 },
            { t: 0.2, h: 3 },
          ],
        },
      ],
    });
    expect(bad.success, "順序錯的 heightKeys 竟然過了 schema").toBe(false);
  });
});

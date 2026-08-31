/**
 * ⭐⭐ GH#803 —— **一顆模型自己帶的粒子**（`model@1.fxEmitters`）。
 *
 * ── 這條守衛存在的理由（⛔ 它驗的是「玩家看得到」那一半）───────────────────
 * 原作的一顆 `.mdx` 是「geoset ＋ 它自己的 PRE2 粒子」，而
 * `convert_stock_model.py` **只轉 geoset** ⇒ 出貨 `.glb` 是那顆模型的**一半**，
 * ⛔ 而它看起來完全正常（只是灰的）。2026-08-31 直接解 MPQ 的 `.mdx` 量到：
 * `ReviveHuman` 的 5 張貼圖 **4 張 sat 0.000–0.066**，⭐ 而金色住在 PRE2 的
 * `segment_color[0] = (1.000, 0.890, 0.459)` ⇒ **sat 0.541**。
 *
 * ── ⭐ 承重的那一行，與突變 ───────────────────────────────────────────────
 * `modelFxRig.spawn()` 出生時的
 *   `for (const vid of doc.fxEmitters ?? []) this.opts.spawnTrail(vid, …)`
 * 拿掉它 ⇒ 整支功能消失（金色一個像素都不會出現），⭐ 而 tsc 綠、
 * ⛔ 其他每一條特效測試也全綠 —— 這正是失敗形態⑧的形狀。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 註解掉 spawn() 裡那個 for 迴圈 → 「模型出生時放出自己宣告的 emitter」紅
 *   · 把 `?? true` 改成 `?? false` → 「缺席 ＝ 預設啟動」紅
 *   · 把 `modelFxDocFor` 改成手挑欄位（投影掉 fxEmitters）→ 第一條紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ModelFxRig, modelFxDocFor, type ModelFxModelDoc } from "./modelFxRig";
import type { ModelFxSpawnEvent } from "./modelFxPath";

const ROOT = resolve(__dirname, "../../../..");

/** headless：⛔ 不解碼 glb，只要 rig 走完 spawn 的那條路。 */
function rigWith(doc: ModelFxModelDoc | null, enabled?: boolean) {
  const fired: string[] = [];
  const rig = new ModelFxRig(new Scene(new NullEngine()), {
    resolveModel: () => doc,
    loadContainer: async () => null,
    spawnTrail: (vfxId) => fired.push(vfxId),
    ...(enabled !== undefined ? { modelFxEmittersEnabled: enabled } : {}),
  });
  return { rig, fired };
}

const EV: ModelFxSpawnEvent = {
  modelKey: "m",
  instances: [{ x: 1, z: 2, lifeSec: 1 }],
} as never;

const BASE: ModelFxModelDoc = { glbPath: "assets/x.glb", scale: 1 } as never;

describe("GH#803 模型自己帶的原作粒子", () => {
  it("量尺先自證：⛔ 沒有 fxEmitters 的模型一顆都不放（今天的行為，逐位元不變）", () => {
    const { rig, fired } = rigWith(BASE);
    rig.spawn(EV);
    expect(fired).toEqual([]);
  });

  it("★ ⭐ **模型出生時放出自己宣告的 emitter**（拿掉那一行 ⇒ 金色永遠不出現）", () => {
    const { rig, fired } = rigWith({ ...BASE, fxEmitters: ["fx.a", "fx.b"] });
    rig.spawn(EV);
    expect(fired, "⛔ spawn() 沒有放出 `model@1.fxEmitters` —— 那顆模型只出貨了一半").toEqual([
      "fx.a",
      "fx.b",
    ]);
  });

  it("⭐ 缺席 ＝ **預設啟動**（第〇·六守則），明確關掉才是止血閥", () => {
    const on = rigWith({ ...BASE, fxEmitters: ["fx.a"] });
    on.rig.spawn(EV);
    expect(on.fired, "⛔ 缺席應該是 true —— `?? false` 會讓整條線出貨即死").toEqual(["fx.a"]);

    const off = rigWith({ ...BASE, fxEmitters: ["fx.a"] }, false);
    off.rig.spawn(EV);
    expect(off.fired, "⛔ 關掉之後仍然放 ⇒ 那格開關是裝飾").toEqual([]);
  });

  it("⭐ `modelFxDocFor` ⛔ 不投影 —— 在 `model@1` 上加第三格 fx 欄位要**零行接線**", () => {
    const doc = { glbPath: "a", scale: 1, fxEmitters: ["fx.z"] } as never;
    expect(
      modelFxDocFor(doc)?.fxEmitters,
      "⛔ 接縫又開始手挑欄位了（GH#607 就是這樣掉了 fxLongAxis / fxSpawnHeight）",
    ).toEqual(["fx.z"]);
  });

  it("⭐ 出貨內容真的用了它，⛔ 而且掛的是**量到有彩度**的那幾顆", () => {
    const f = resolve(ROOT, "content/models/w3x.stock.revivehuman.json");
    expect(existsSync(f)).toBe(true);
    const ids: string[] = JSON.parse(readFileSync(f, "utf8")).fxEmitters ?? [];
    expect(ids.length, "⛔ 一顆都沒掛 ⇒ 機制在而內容沒用它（第一·五守則）").toBeGreaterThan(0);
    for (const id of ids) {
      const v = resolve(ROOT, `content/vfx/${id}.json`);
      expect(existsSync(v), `⛔ ${id} 指到一份不存在的 vfx`).toBe(true);
      const d = JSON.parse(readFileSync(v, "utf8"));
      const stops: number[][] = [
        (d.color?.start ?? []) as number[],
        ...((d.colorStops ?? []) as [number, number[]][]).map((s) => s[1]),
      ];
      const best = Math.max(
        ...stops
          .filter((c) => c.length >= 3)
          .map((c) => {
            const mx = Math.max(c[0]!, c[1]!, c[2]!);
            return mx === 0 ? 0 : (mx - Math.min(c[0]!, c[1]!, c[2]!)) / mx;
          }),
        0,
      );
      // ⭐ 這是整張票的**點**：出貨 .glb 的 5 張貼圖 4 張 sat 0.000–0.066，
      //   而掛上來的粒子必須帶著 mesh 沒有的彩度 —— ⛔ 否則掛了也還是灰的。
      expect(best, `⛔ ${id} 的 sat 只有 ${best.toFixed(3)} —— 它補不回金色`).toBeGreaterThan(0.3);
    }
  });
});

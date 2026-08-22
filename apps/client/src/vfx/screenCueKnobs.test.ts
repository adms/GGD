/**
 * GH#549 —— `config.screen-fx@1` 的**去向**：後台那一份真的夾得住畫面回饋。
 *
 * ⚠️ 這條守衛補的是一個**死旋鈕**（第一·五守則的形狀）：在 2026-08-22 之前
 * `content/config/screen-fx.json` 的 10 格已經有 Zod、有出貨值、有欄位定義，
 * 而 `ScreenFxLayer.setLimits()` 在整個 repo **只有測試在呼叫** ——
 * 也就是操作者存得起來、重整讀得回來、遊戲一輩子看不到。
 * 每一個零件都是對的，只有它們的組合是空的，⛔ 沒有任何既有的守衛會紅。
 *
 * ⭐ 所以這裡斷言的**不是**「`resolveScreenFx` 回傳 0.55」（那是屬性，而且那一段
 * 本來就是對的）。斷言的是：同一發技能寫的閃爍、同一個 `VfxSystem`，
 * **只因為後台那一格填了 0，畫面上就真的不再有那一發**（行為）。
 *
 * ⛔ 一個數字都沒有進斷言（第二守則：驗機制不驗數字）—— 期望值全部從
 * `DEFAULT_SCREEN_FX` 推導，出貨值哪天被 owner 調過，這一支不會用錯誤的訊息紅。
 *
 * 突變（一條，最承重）：`VfxSystem` 建構子的 `this.screenFx.setLimits(cue.limits)`
 * 拿掉 ⇒ 第一條紅（上界退回編譯進映像的常數，而**畫面上看起來完全正常**）。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import {
  Configs,
  DEFAULT_SCREEN_FX,
  SCREEN_FX_DOC_ID,
  SCREEN_FX_SCHEMA_TAG,
  zConfigScreenFxDoc,
  type ScreenFxPolicy,
} from "@ggd/shared/content";
import { VfxSystem } from "./VfxSystem";

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});
afterEach(() => {
  Configs.clear();
});

const CTX = { entityPos: (): { x: number; z: number } => ({ x: 3, z: 4 }) };
const ev = (type: string, data: Record<string, unknown>): EventMessage => ({ type, tick: 1, data });

/** 後台存下來的那一份（走出貨的 Zod，⛔ 不是手搭一個物件 —— 失敗形態⑤）。 */
function shipDoc(over: Partial<ScreenFxPolicy> = {}): void {
  Configs.register(
    zConfigScreenFxDoc.parse({
      id: SCREEN_FX_DOC_ID,
      schema: SCREEN_FX_SCHEMA_TAG,
      ...DEFAULT_SCREEN_FX,
      ...over,
    }),
  );
}

/**
 * 一發**超過**出貨上界的閃爍（理想鄉反彈的受害者那一道就是 0.62 > 0.55）。
 *
 * ⛔⛔ **這個夾具在 2026-08-23 之前是 `{ spec: {…} }`**（GH#608）—— 一個
 * **出貨路徑從來不產生**的形狀：sim 送的是**攤平**的
 * `{colorRgb, peakAlpha, durationSec, broadcast, subjects, caster, zone}`。
 * ⇒ 這兩條測試一路綠著，而線上每一發 `screenFlash` 都在客戶端**擲 TypeError**
 * （第二守則失敗形態⑤：被測的不是出貨的那個）。
 * ⭐ 現在的形狀與 `sim/effects/clientCues.ts` 的 `ScreenFlashEvent` 逐格相同 ——
 * ⛔ 改了那一邊而忘了這裡，`screenCueContract.test.ts` 會用**真的** sim 事件抓到。
 */
const LOUD_FLASH = {
  colorRgb: [255, 232, 160],
  peakAlpha: 1,
  durationSec: 0.3,
  broadcast: true,
  subjects: [],
  caster: 1,
  zone: 0,
};

describe("config.screen-fx@1 真的到得了畫面 (GH#549)", () => {
  it("★ 後台把閃爍上界關到 0 ⇒ 技能寫的閃爍一發都不出（對照組：出貨值下它出得來）", () => {
    shipDoc();
    const on = new VfxSystem(scene, CTX);
    on.handleEvent(ev("screenFlash", LOUD_FLASH), 1000);
    // 對照組。少了它，「setLimits 永遠關掉一切」的壞實作也會過（失敗形態④）。
    expect(on.screenFxLayer.liveFlashes).toBeGreaterThan(0);
    on.dispose();

    Configs.clear();
    shipDoc({ flashMaxAlpha: 0 });
    const off = new VfxSystem(scene, CTX);
    off.handleEvent(ev("screenFlash", LOUD_FLASH), 1000);
    expect(
      off.screenFxLayer.liveFlashes,
      "後台把 flashMaxAlpha 關到 0，畫面上還是閃了 —— setLimits 沒有接上出貨文件",
    ).toBe(0);
    off.dispose();
  });

  it("特效文字的全域字級倍率乘得進去（技能寫的是相對值）", () => {
    const mult = DEFAULT_SCREEN_FX.floatingTextScale * 2;
    shipDoc({ floatingTextScale: mult });
    const vfx = new VfxSystem(scene, CTX);
    // ⭐ sim 送的是**一串錨**（`subjects: [{id,x,z}]`），⛔ 不是舊夾具的 `at: 1`。
    vfx.handleEvent(
      ev("floatingText", {
        text: "1Hit",
        sizeScale: 1,
        subjects: [{ id: 1, x: 3, z: 4 }],
        caster: 1,
        zone: 0,
      }),
      1000,
    );
    const live = (vfx.floatingTextEntries as readonly { active: boolean; sizeScale: number }[])
      .filter((e) => e.active);
    expect(live).toHaveLength(1);
    expect(live[0]!.sizeScale).toBeCloseTo(mult);
    vfx.dispose();
  });
});

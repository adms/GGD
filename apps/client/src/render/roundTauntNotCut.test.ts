/**
 * 回合勝利語音不再被畫面的節拍切掉（owner 2026-08-14）。
 *
 * > 「回合勝利 語音還沒播完 就會進商店 語音也被截斷」
 *
 * ## 這個缺陷的算術（實測，⛔ 不是估的）
 *
 * · 嘲諷在 `ROUND_TAUNT_DELAY_MS` = **2200ms** 才開口
 * · 舊的節拍 `ROUND_PRESENT_MS` = **3600ms** 就把整個舞台收掉，
 *   而 `clear()` 會 `taunt.cancel()` → `el.pause()`
 * ⇒ 嘲諷只有 **1.4 秒**的空檔。
 * · `ffprobe` 量 60 支剪輯：中位 **3.29s** · p90 **4.14s** · max **4.64s**
 * ⇒ **59/60（98%）被切在一半。**
 *
 * ⭐ 修法不是「把秒數調大」——那只是把 98% 變成 40%。修法是**畫面的節拍不該
 * 決定嘴巴什麼時候閉上**：`clear({ cancelVoice: false })`。
 *
 * ⚠️ 這一條驗的是**行為**：`cancel` 這個 spy 有沒有真的被呼叫。
 * ⛔ 不是驗「有一個叫 cancelVoice 的參數存在」（失敗形態⑦）。
 */
import { describe, it, expect, vi } from "vitest";
import { RoundWinnerStage, type RoundTauntPort } from "./RoundWinnerStage";
import { ROUND_TAUNT_DELAY_MS } from "./victoryPresentation";
import { DEFAULT_VICTORY_PODIUM } from "@ggd/shared/content/schema/victoryPodium";
import type { ModelDoc } from "@ggd/shared/content";

/** 模型文件不是這條守衛的主題 —— 和 `RoundWinnerStage.test.ts` 同一個最小夾具。 */
const DOC = { id: "m.win", glbPath: "/x.glb", scale: 1, clipMap: {} } as unknown as ModelDoc;

const fakeEl = () => ({
  style: {} as Record<string, string>,
  appendChild: vi.fn(),
  remove: vi.fn(),
  children: [] as unknown[],
});

function harness() {
  const taunt: RoundTauntPort = { playRound: () => Promise.resolve(null), cancel: vi.fn() };
  const stage = new RoundWinnerStage({
    host: { appendChild: vi.fn() } as unknown as HTMLElement,
    createCanvas: () => fakeEl() as unknown as HTMLCanvasElement,
    createElement: () => fakeEl() as unknown as HTMLElement,
    createPreview: () => ({ show: vi.fn(), dispose: vi.fn() }),
    taunt,
  });
  stage.show(DOC, { championId: "sela", round: 2 });
  return { stage, cancel: taunt.cancel as ReturnType<typeof vi.fn> };
}

describe("回合勝利語音不被畫面的節拍切掉", () => {
  it("⛔ 節拍結束／進商店時收掉畫面，但**不按停還在講的那句話**", () => {
    const { stage, cancel } = harness();
    // GameApp 在「台上時間到」與「相位離開 resolution（＝進商店）」兩條路
    // 都走這一個呼叫，**不帶參數** —— 安全的那一邊是預設值。
    stage.clear();
    expect(cancel, "畫面的節拍把嘴按停了 —— 這就是 owner 聽到的截斷").not.toHaveBeenCalled();
  });

  it("★ dispose（離開比賽／換場）仍然要按停 —— 語音不可以跟著你走出這一場", () => {
    const { stage, cancel } = harness();
    stage.dispose();
    expect(cancel).toHaveBeenCalled();
  });

  it("★ 台上停留時間是欄位不是常數，而且長到蓋得住嘴巴（不是保命符，是不打架）", () => {
    // ⚠️ 從 spec 推導，⛔ 不抄 5.5 這個字面值（第二守則：不驗數字驗機制）。
    const holdMs = DEFAULT_VICTORY_PODIUM.roundPresentSec * 1000;
    // 舊的寫死值是 3600 —— 比嘴巴開口的時間只多 1.4 秒。
    expect(holdMs - ROUND_TAUNT_DELAY_MS).toBeGreaterThan(1400);
  });
});

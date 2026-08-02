/**
 * 英靈殿「宣言」語音 (GH#256 的英靈殿那半) 的守衛。
 *
 * 這一組守的不是音效品質，是**誠實**：
 *
 *  ① 播放點真的接到 per-champion 語音 —— 而且接的是**那一隻英雄的 id**。
 *     壞掉的樣子：接了，但傳的是常數 / 上一隻英雄 → 每一隻都用同一個聲音講話，
 *     而 owner 要的是「該角色的自己語音」。這是失敗形態 ② 的變形。
 *  ② `hasFamousQuoteVo` **現在必須回 false**。119 隻英雄的 `quote` 欄位是空的，
 *     所以任何回 true 的版本都是在說謊。#139/#142 做完之後，改這一支就是那兩張單
 *     的驗收動作，而這條測試會逼人來改它。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const playSpy = vi.fn<(id: string) => Promise<boolean>>();
vi.mock("../../../audio/championVoice", () => ({
  playChampionSelectVoice: (id: string) => playSpy(id),
}));

const {
  playValhallaDeclaration,
  hasFamousQuoteVo,
  DECLARATION_PROVENANCE_NOTE,
} = await import("./valhallaDeclaration");

beforeEach(() => {
  playSpy.mockReset();
  playSpy.mockResolvedValue(true);
});

describe("GH#256 英靈殿展示時發出該角色自己的語音", () => {
  it("播放的是**這一隻**英雄的 id，不是一個常數", async () => {
    await playValhallaDeclaration("godie-hblm");
    await playValhallaDeclaration("godie-efur");
    expect(playSpy.mock.calls.map((c) => c[0])).toEqual(["godie-hblm", "godie-efur"]);
  });

  it("回報的來源是 `champion-voice` —— 而不是假裝自己播了名言", async () => {
    const r = await playValhallaDeclaration("godie-hblm");
    expect(r.source).toBe("champion-voice");
    expect(r.played).toBe(true);
  });

  it("混音器鎖住（沒出聲）時回 `silent`，不是謊稱播過", async () => {
    playSpy.mockResolvedValue(false);
    const r = await playValhallaDeclaration("godie-hblm");
    expect(r.source).toBe("silent");
    expect(r.played).toBe(false);
  });

  it("空 id 直接靜音，不會拿一個空字串去敲語音系統", async () => {
    const r = await playValhallaDeclaration("");
    expect(r).toEqual({ source: "silent", played: false });
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("⚠️ 名言 VO **還不存在** —— 這一條紅了代表 #139/#142 做完了，去改實作", () => {
    expect(hasFamousQuoteVo("godie-hblm")).toBe(false);
  });

  it("出處說明點名了那兩張未完成的單，畫面上不會有人誤會", () => {
    expect(DECLARATION_PROVENANCE_NOTE).toContain("#139");
    expect(DECLARATION_PROVENANCE_NOTE).toContain("#142");
  });
});

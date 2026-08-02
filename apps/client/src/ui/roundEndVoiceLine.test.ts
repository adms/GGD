/**
 * GH#256 —— 「回合勝利第一名說什麼」這個決策點的守衛。
 *
 * ⚠️ 稽核實測:全 repo 沒有任何測試引用 `roundWinLine` 或 `quoteEnabled`,
 * **把 `RoundEndVoice.tsx` 的整個閘門與退回分支刪掉,一條都不會紅**(失敗形態 ③)。
 * 原因是那段決策原本活在 `useEffect` 的閉包裡:client 的 vitest 跑 node env,
 * `renderToStaticMarkup` 又不執行 effect,所以它結構上驗不到。修法是把它變成
 * 一支注入播放器的 `speakRoundEnd` —— 元件只剩「在相位邊緣呼叫它一次」。
 *
 * 這裡驗的是**三個模式各自真的放了什麼**(哪個 port 被呼叫、帶什麼參數),
 * 不是「有一個叫 roundWinLine 的欄位存在」(失敗形態 ④/⑦)。
 */
import { describe, it, expect } from "vitest";
import {
  speakRoundEnd,
  ROUND_END_VOICE_PORTS,
  type RoundEndVoicePorts,
} from "./RoundEndVoice";
import { DEFAULT_VICTORY_PODIUM } from "@ggd/shared/content/schema/victoryPodium";

/** 記帳用的假播放器。`hasQuote` = 這位英雄有沒有名言剪輯。 */
function ports(hasQuote: boolean) {
  const calls = { quote: [] as string[], taunt: [] as string[], contextual: [] as string[] };
  const p: RoundEndVoicePorts = {
    playQuote: (id) => {
      calls.quote.push(id);
      return Promise.resolve(hasQuote);
    },
    playTaunt: (id, round) => {
      calls.taunt.push(`${id}@${round}`);
      return Promise.resolve(null);
    },
    playContextual: (id) => {
      calls.contextual.push(id);
    },
  };
  return { p, calls };
}

describe("回合勝利的台詞是一個欄位,而且三個模式真的不一樣 (round-win-line)", () => {
  it("both(出貨預設):放名言,嘲諷留給舞台在 t=2200ms 放", async () => {
    const { p, calls } = ports(true);
    await speakRoundEnd("hero-a", 3, "both", p);
    expect(calls.quote).toEqual(["hero-a"]);
    // 這裡**不可以**也放嘲諷 —— 舞台已經在放了,兩份會疊在一起。
    expect(calls.taunt).toEqual([]);
  });

  it("taunt:名言整個不放(嘲諷是舞台的事)", async () => {
    const { p, calls } = ports(true);
    await speakRoundEnd("hero-a", 3, "taunt", p);
    expect(calls.quote).toEqual([]);
    expect(calls.taunt).toEqual([]);
  });

  it("quote + 該英雄有名言:只放名言,不補嘲諷", async () => {
    const { p, calls } = ports(true);
    await speakRoundEnd("hero-a", 3, "quote", p);
    expect(calls.quote).toEqual(["hero-a"]);
    expect(calls.taunt).toEqual([]);
  });

  it("quote + 該英雄沒有名言:退回嘲諷,不是一片安靜", async () => {
    const { p, calls } = ports(false);
    await speakRoundEnd("hero-b", 7, "quote", p);
    expect(calls.quote).toEqual(["hero-b"]);
    // 帶著同一個 round —— 嘲諷是 championId+round 決定性雜湊出來的,
    // 傳錯回合數會讓這台機器聽到跟別人不一樣的那一句。
    expect(calls.taunt).toEqual(["hero-b@7"]);
  });

  it("both + 該英雄沒有名言:**不**補嘲諷(舞台本來就會放,補了會變兩次)", async () => {
    const { p, calls } = ports(false);
    await speakRoundEnd("hero-b", 7, "both", p);
    expect(calls.taunt).toEqual([]);
  });

  it("名言的 promise 炸了也不會吞掉勝利宣言", async () => {
    const calls: string[] = [];
    await speakRoundEnd("hero-c", 1, "both", {
      playQuote: () => Promise.reject(new Error("network")),
      playTaunt: () => Promise.resolve(null),
      playContextual: (id) => calls.push(id),
    });
    expect(calls).toEqual(["hero-c"]);
  });

  it("勝利宣言不受這個欄位管 —— 三個模式都放", async () => {
    for (const mode of ["taunt", "quote", "both"] as const) {
      const { p, calls } = ports(true);
      await speakRoundEnd("hero-d", 2, mode, p);
      expect(calls.contextual, `mode=${mode}`).toEqual(["hero-d"]);
    }
  });

  it("不傳 mode 時走的是出貨預設 both(而不是某個寫死的分支)", async () => {
    expect(DEFAULT_VICTORY_PODIUM.roundWinLine).toBe("both");
    const { p, calls } = ports(true);
    await speakRoundEnd("hero-e", 5, undefined, p);
    expect(calls.quote).toEqual(["hero-e"]);
  });

  it("出貨的那一組 port 真的接到三個播放器(不是空殼)", () => {
    expect(typeof ROUND_END_VOICE_PORTS.playQuote).toBe("function");
    expect(typeof ROUND_END_VOICE_PORTS.playTaunt).toBe("function");
    expect(typeof ROUND_END_VOICE_PORTS.playContextual).toBe("function");
  });
});

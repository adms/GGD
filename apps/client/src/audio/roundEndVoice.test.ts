/**
 * GH#527 —— owner 2026-08-22:「回合結束只播放角色自己語音，不要播放機械語音，
 * 重複播放太吵了」。
 *
 * ⚠️ 這一條讀的是**真的播放佇列**：三支出貨播放器（`nameVoice` 名言 / TTS、
 * `contextualVoice` 的 victory / 英雄語音包、`victoryTaunt` 嘲諷 / TTS）各自
 * 用真的類別建起來，用出貨的呼叫順序打一拍，然後數「誰的元素真的被 play 了」。
 * ⛔ 不是掃字串，⛔ 也不是斷言政策函式回傳什麼 —— 那兩種對「閘沒有被接上去」
 * 都是綠的（失敗形態③）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChampionNameVoice } from "./nameVoice";
import { ContextualVoicePlayer } from "./contextualVoice";
import { VictoryTauntPlayer } from "./victoryTaunt";
import { closeRoundEndVoiceBeat, openRoundEndVoiceBeat, resetRoundEndVoice } from "./roundEndVoice";
import type { ChampionVoicePack } from "./selectVoiceLadder";

const CHAMP = "godie-e001";
const UNMUTED = { master: 1, bgm: 1, sfx: 1, muted: false };
const PACK = {
  champions: {
    [CHAMP]: {
      engine: "cosyvoice3",
      variant: "cv3-0.5b",
      sharedFrom: null,
      lines: { victory: [{ clip: `assets/audio/voices/lines/${CHAMP}/victory.mp3`, text: "", lang: "ja", durationSec: 1, speakerSim: null }] },
    },
  },
} as unknown as ChampionVoicePack;
const QUOTES = { quotes: { [CHAMP]: { jpQuote: "うそだ！", clip: `assets/audio/voices/quotes/${CHAMP}.mp3` } } };
const TAUNTS = {
  roundWin: { [CHAMP]: { name: "x", lines: [{ id: "t1", file: `assets/audio/voice-taunt/round/${CHAMP}-1.mp3`, text: "嘲諷" }] } },
  roundWinFallback: [],
  matchWin: [],
};

function el() {
  const e = { src: "", volume: 1, currentTime: 0, onended: null, plays: [] as string[] };
  return Object.assign(e, { play: vi.fn(() => (e.plays.push(e.src), Promise.resolve())), pause: vi.fn() });
}
const json = (body: unknown) => () =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);

/** One round-end beat, played through the shipped call ORDER (名言 → 宣言 → 嘲諷). */
async function beat() {
  const pack: string[] = [];
  const audio = { isUnlocked: true, volumes: () => UNMUTED, playClip: (p: string) => (pack.push(p), true) };
  const contextual = new ContextualVoicePlayer({ audio, packLoader: () => Promise.resolve(PACK), rng: () => 0 });
  await contextual.warm();
  const quoteEl = el();
  // `silent: false` on BOTH TTS players: the #62 test-mode silence would make
  // them mute anyway, and a guard that passes because the thing was never going
  // to sound is 失敗形態⑤ (被測的不是出貨的那個).
  const quote = new ChampionNameVoice({ audio, silent: false, fetchFn: json(QUOTES), createAudio: () => quoteEl, warn: () => {} });
  const tauntEl = el();
  const taunt = new VictoryTauntPlayer({
    audio, silent: false, createAudio: () => tauntEl, fetchFn: json(TAUNTS),
    schedule: (fn) => (fn(), null), cancelSchedule: () => {}, warn: () => {},
  });
  await quote.playQuote(CHAMP);
  contextual.playContextual(CHAMP, "victory");
  await taunt.playRound(CHAMP, 1);
  return { pack, quoteEl, tauntEl };
}

describe("回合結束的語音 (GH#527)", () => {
  beforeEach(() => resetRoundEndVoice());

  it("這一拍開著：只出一句，而且是角色自己語音包的那一句", async () => {
    openRoundEndVoiceBeat();
    const { pack, quoteEl, tauntEl } = await beat();
    expect(pack).toEqual([`assets/audio/voices/lines/${CHAMP}/victory.mp3`]);
    expect(quoteEl.plays, "名言是 macOS say 的 TTS —— 機械語音").toEqual([]);
    expect(tauntEl.plays, "嘲諷是 macOS say 的 TTS —— 機械語音").toEqual([]);
  });

  it("這一拍關著：比賽結束／選角那些呼叫端一個位元都沒被動到", async () => {
    closeRoundEndVoiceBeat();
    const { pack, quoteEl, tauntEl } = await beat();
    expect(pack.length + quoteEl.plays.length + tauntEl.plays.length).toBe(3);
  });
});

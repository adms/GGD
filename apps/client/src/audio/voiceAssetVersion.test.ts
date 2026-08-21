/**
 * GH#70 —— 兩條 `HTMLAudioElement` 語音路徑要帶 `?h=<contentVersion>`。
 *
 * 這是**承重**的一條：edge 的 `map $arg_h $content_cache` 只認 query 上的 `h`，
 * 空的就是 `no-cache`。所以「有沒有 stamp」＝ names/quotes/voice-taunt 這 830 個
 * 檔（11.1 MB）每次載入要不要整批 revalidate。⛔ 它上一次被漏掉，正是因為
 * `nameVoice.test.ts` / `victoryTaunt.test.ts` 從來沒有斷言過 `el.src`。
 *
 * ⚠️ 斷言讀的是**最終** `el.src`（真的送去播的那個字串），⛔ 不是 `url()`。
 */
import { describe, it, expect, afterEach } from "vitest";
import { ChampionNameVoice, type NameVoiceElement } from "./nameVoice";
import { VictoryTauntPlayer, type TauntElement } from "./victoryTaunt";
import { setContentAssetVersion } from "../content/assetVersion";
import { DEFAULT_AUDIO_VOLUMES } from "./audioSettings";

const CV = "cv_gh70test";
const audio = { isUnlocked: true, volumes: () => DEFAULT_AUDIO_VOLUMES };

/** One stub standing in for both layers' single reused element. */
function stubEl(): NameVoiceElement & TauntElement {
  return {
    src: "",
    volume: 0,
    currentTime: 0,
    onended: null,
    play: () => Promise.resolve(),
    pause: () => undefined,
  };
}

const json = (doc: unknown) => () =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(doc) } as Response);

afterEach(() => setContentAssetVersion(null));

describe("GH#70 語音資產帶內容雜湊", () => {
  it("稱號／全名／名言的 el.src 帶 ?h=，manifest 落地前逐位元不變", async () => {
    const el = stubEl();
    const make = (): ChampionNameVoice =>
      new ChampionNameVoice({
        audio,
        silent: false,
        createAudio: () => el,
        fetchFn: json({
          champions: { hero: { spokenLine: "x", clip: "assets/audio/voices/names/hero.mp3" } },
        }),
      });

    // manifest 還沒落地 ⇒ 裸 URL（＝這次改動之前的行為，一個位元都沒動）
    expect(await make().play("hero")).toBe(true);
    expect(el.src).toBe("/content/assets/audio/voices/names/hero.mp3");

    setContentAssetVersion(CV);
    expect(await make().play("hero")).toBe(true);
    expect(el.src).toBe(`/content/assets/audio/voices/names/hero.mp3?h=${CV}`);
  });

  it("嘲諷 clip 的 el.src 也帶 ?h=", async () => {
    const el = stubEl();
    setContentAssetVersion(CV);
    const player = new VictoryTauntPlayer({
      audio,
      silent: false,
      createAudio: () => el,
      fetchFn: json({
        roundWin: {},
        roundWinFallback: [],
        matchWin: [{ id: "m1", file: "assets/audio/voice-taunt/m1.mp3", text: "吃雞" }],
      }),
    });
    expect(await player.playMatch("match-1", 0)).not.toBeNull();
    expect(el.src).toBe(`/content/assets/audio/voice-taunt/m1.mp3?h=${CV}`);
  });
});

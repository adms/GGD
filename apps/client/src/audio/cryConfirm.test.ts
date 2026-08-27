/**
 * GH#744 — the champ-select CONFIRM call-out must end with a cry, not with a
 * `say` render of a sentence the character cannot speak (`_voice-casting.md`
 * §8.3: keep the 名言 TEXT on screen, play the cry).
 *
 * ⭐ EVERYTHING HERE IS THE SHIPPING ARTICLE. The champion voice pack, the name
 * manifest and the quote pack are read off `content/` and parsed by the shipping
 * parsers; the clip order comes out of the shipping `ChampionNameVoice.play()`.
 * ⛔ Not one payload is hand-built — the whole point of #744 is that each part
 * was individually fine and only the PAIRING was missing (失敗形態⑧), so a test
 * that assembles its own pack would re-measure a fictional channel (形態⑤).
 *
 * Load-bearing line: `confirmTailClip`'s `packClips(...)[0]?.clip ?? quoteClip`.
 * Mutation (2026-08-27): replaced with `return quoteClip` ⇒ this file goes red
 * naming 皮卡丘 and the TTS sentence it fell back to. Restored via `cp`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { CRY_VOICE_CHAMPIONS, confirmTailClip } from "./cryConfirm";
import {
  ChampionNameVoice,
  QUOTE_VO_MANIFEST_PATH,
  NAME_VO_MANIFEST_PATH,
  type NameVoiceAudioPort,
  type NameVoiceElement,
} from "./nameVoice";
import { VOICE_PACK_MANIFEST_PATH, voicePackFromDoc } from "./selectVoiceLadder";
import { DEFAULT_AUDIO_VOLUMES } from "./audioSettings";

const CONTENT = resolve(fileURLToPath(new URL("../../../../content", import.meta.url)));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(resolve(CONTENT, rel), "utf8")) as unknown;

const SHIPPED_PACK = readJson(VOICE_PACK_MANIFEST_PATH);
const SHIPPED_NAMES = readJson(NAME_VO_MANIFEST_PATH);
const SHIPPED_QUOTES = readJson(QUOTE_VO_MANIFEST_PATH);

/** Play the shipping confirm call-out for `champId`; returns the clips, in order. */
async function confirmClips(champId: string, withPack: boolean): Promise<string[]> {
  const plays: string[] = [];
  const el: NameVoiceElement = {
    src: "",
    volume: 1,
    currentTime: 0,
    onended: null,
    play() {
      plays.push(el.src);
      return Promise.resolve();
    },
    pause() {},
  };
  const audio: NameVoiceAudioPort = {
    get isUnlocked() {
      return true;
    },
    volumes: () => ({ ...DEFAULT_AUDIO_VOLUMES }),
  };
  const vo = new ChampionNameVoice({
    audio,
    createAudio: () => el,
    warn: () => {},
    packLoader: withPack ? () => Promise.resolve(voicePackFromDoc(SHIPPED_PACK)) : undefined,
    fetchFn: (url) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(url.includes(QUOTE_VO_MANIFEST_PATH) ? SHIPPED_QUOTES : SHIPPED_NAMES),
      } as unknown as Response),
  });
  await vo.play(champId);
  // The chain advances on `onended`; walk it to the end of the call-out.
  for (let i = 0; i < 8 && el.onended; i++) el.onended();
  return plays;
}

describe("cry champions' confirm call-out (GH#744)", () => {
  it("ends with the champion's own cry, and would have said the TTS sentence without the pack", async () => {
    cover("cry-confirm-tail");
    // 皮卡丘 — 「plausibly the most recognisable sound in the entire roster」.
    const withPack = await confirmClips("godie-ofar", true);
    const withoutPack = await confirmClips("godie-ofar", false);

    const tail = withPack.at(-1)!;
    expect(tail).toBe("/content/assets/audio/voices/lines/godie-ofar/quote.mp3");
    // …and that is a CHANGE: the same shipping path without a pack still plays
    // the macOS `say` render, so this assertion cannot pass by accident.
    expect(withoutPack.at(-1)).toMatch(/\/voices\/quotes\/godie-ofar\.mp3$/);
    expect(tail).not.toBe(withoutPack.at(-1));
    // the 稱號→全名 halves are untouched — only the third segment moved.
    expect(withPack.slice(0, -1)).toEqual(withoutPack.slice(0, -1));
  });

  it("leaves every speaking champion on the synthesised 名言", async () => {
    cover("cry-confirm-non-cry-untouched");
    // 夏娜 speaks; her call-out must be byte-identical with and without the pack.
    expect(await confirmClips("godie-e008", true)).toEqual(
      await confirmClips("godie-e008", false),
    );
  });

  it("routes all seven cry champions to a cry that is really on disk", () => {
    cover("cry-confirm-roster-coverage");
    const pack = voicePackFromDoc(SHIPPED_PACK);
    for (const id of CRY_VOICE_CHAMPIONS) {
      const clip = confirmTailClip(id, `assets/audio/voices/quotes/${id}.mp3`, pack);
      expect(clip, `${id} fell back to the TTS sentence`).toBe(
        `assets/audio/voices/lines/${id}/quote.mp3`,
      );
      expect(() => readFileSync(resolve(CONTENT, clip!))).not.toThrow();
    }
  });

  it("pins the cry roster to the shipped casting plan", () => {
    cover("cry-confirm-roster-pinned");
    const plan = readJson("assets/audio/voices/_voice-casting-plan.json") as {
      champions: Record<string, { identity?: { voiceClass?: string } }>;
    };
    const cast = Object.entries(plan.champions)
      .filter(([, v]) => v.identity?.voiceClass === "cry")
      .map(([id]) => id);
    // ⛔ If this fails, the casting plan changed — edit CRY_VOICE_CHAMPIONS to
    // match it, never the other way round.
    expect([...CRY_VOICE_CHAMPIONS].sort()).toEqual(cast.sort());
  });
});

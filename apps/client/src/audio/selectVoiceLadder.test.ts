/**
 * task #27 (reopened): the click-your-hero fallback LADDER. Covers rung order
 * and the "first non-empty rung wins, rungs never merge" rule, the generated
 * voice-pack parser (the drop-in contract), the no-immediate-repeat pick, the
 * 稱號 exclusion that keeps two different characters from sharing a cue, and
 * the pinned missing-clip exclusion.
 *
 * The on-disk half — that the ladder really answers for all 113 champions with
 * files that exist — is selectVoiceCoverage.test.ts.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  EXCLUDED_NAME_CLIPS,
  VOICE_PACK_MANIFEST_PATH,
  packSelectClips,
  pickSelectClip,
  resolveSelectVoice,
  selectVoiceGain,
  selectVoiceLadder,
  voicePackFromDoc,
  type SelectVoiceInputs,
} from "./selectVoiceLadder";
import { championVoicesFromDoc, blizzardManifestFromDoc } from "./championVoice";
import { championNamesFromDoc, championQuotesFromDoc } from "./nameVoice";

const VOICES = championVoicesFromDoc({
  champions: {
    quipper: { select: ["assets/audio/sfx/quip.mp3"], source: "map-quip", soundset: null },
    plain: { select: [], source: "none", soundset: "Naisha" },
    setted: { select: [], source: "none", soundset: "HeroPaladin" },
    nameless: { select: [], source: "none", soundset: null },
  },
});

const BLIZZARD = blizzardManifestFromDoc({
  units: {
    Hpal: { champId: "setted", clips: { what: ["assets/blizzard-local/hpal-what1.mp3"] } },
  },
});

const NAMES = championNamesFromDoc({
  champions: {
    plain: {
      zhName: "甲 - 一號",
      spokenLine: "甲‖イチゴウ",
      jaName: "イチゴウ",
      clip: "assets/audio/voices/names/plain.mp3",
      voSegments: [
        { part: "title", clip: "assets/audio/voices/names/plain.title.mp3" },
        { part: "name", clip: "assets/audio/voices/names/plain.name.mp3" },
      ],
    },
    setted: {
      zhName: "乙 - 二號",
      spokenLine: "乙‖ニゴウ",
      jaName: "ニゴウ",
      clip: "assets/audio/voices/names/setted.mp3",
      voSegments: [{ part: "name", clip: "assets/audio/voices/names/setted.name.mp3" }],
    },
    quipper: {
      zhName: "丙 - 三號",
      spokenLine: "丙‖サンゴウ",
      jaName: "サンゴウ",
      clip: "assets/audio/voices/names/quipper.mp3",
      voSegments: [{ part: "name", clip: "assets/audio/voices/names/quipper.name.mp3" }],
    },
  },
});

const QUOTES = championQuotesFromDoc({
  quotes: {
    plain: { jpQuote: "いくぞ", clip: "assets/audio/voices/quotes/plain.mp3" },
    setted: { jpQuote: "ふむ", clip: "assets/audio/voices/quotes/setted.mp3" },
    quipper: { jpQuote: "はい", clip: "assets/audio/voices/quotes/quipper.mp3" },
    nameless: { jpQuote: "だれ？", clip: "assets/audio/voices/quotes/nameless.mp3" },
  },
});

function inputs(over: Partial<SelectVoiceInputs> = {}): SelectVoiceInputs {
  return {
    voices: VOICES,
    pack: null,
    blizzard: null,
    names: NAMES,
    quotes: QUOTES,
    ...over,
  };
}

const PACK_DOC = {
  champions: {
    plain: {
      engine: "cosyvoice3",
      variant: "base",
      lines: {
        select: [
          { clip: "assets/audio/voices/champions/plain/select-1.mp3", text: "なに？", lang: "ja", durationSec: 0.9, speakerSim: 0.81 },
          { clip: "content/assets/audio/voices/champions/plain/select-2.mp3", text: "うん", lang: "ja" },
        ],
        battlecry: [{ clip: "assets/audio/voices/champions/plain/battlecry.mp3" }],
      },
    },
  },
};

describe("select-voice ladder — rung order", () => {
  it("takes the first NON-EMPTY rung and never merges two rungs", () => {
    cover("voice-select-ladder");
    // an authored map quip outranks everything, even with all other rungs full
    const quip = resolveSelectVoice("quipper", inputs({ pack: voicePackFromDoc(PACK_DOC), blizzard: BLIZZARD }));
    expect(quip?.tier).toBe("authored");
    expect(quip?.clips).toEqual(["assets/audio/sfx/quip.mp3"]);

    // generated outranks the copyright-gated soundset: the shipping answer is
    // what the owner must hear on a gated build, not the crutch.
    const gen = resolveSelectVoice("plain", inputs({ pack: voicePackFromDoc(PACK_DOC), blizzard: BLIZZARD }));
    expect(gen?.tier).toBe("generated");
    expect(gen?.clips).toHaveLength(2);

    // no pack: the gated soundset rung answers on a full-assets build …
    expect(resolveSelectVoice("setted", inputs({ blizzard: BLIZZARD }))?.tier).toBe("soundset");
    // … and the SAME champion answers with its name clip on the public tier.
    const publicTier = resolveSelectVoice("setted", inputs());
    expect(publicTier?.tier).toBe("name");
    expect(publicTier?.clips).toEqual(["assets/audio/voices/names/setted.name.mp3"]);

    // no name entry at all → the 名言 floor, which exists for all 113.
    const floor = resolveSelectVoice("nameless", inputs());
    expect(floor?.tier).toBe("quote");
    expect(floor?.clips).toEqual(["assets/audio/voices/quotes/nameless.mp3"]);

    // the rungs a champion did not use are still reported, for diagnostics
    expect(selectVoiceLadder("nameless", inputs()).map((r) => r.tier)).toEqual([
      "authored",
      "generated",
      "soundset",
      "name",
      "quote",
    ]);
  });

  it("is silent ONLY when every rung is empty — never when content exists", () => {
    cover("voice-select-ladder");
    expect(resolveSelectVoice("ghost", inputs())).toBeNull();
    expect(
      resolveSelectVoice("plain", { voices: null, pack: null, blizzard: null, names: null, quotes: null }),
    ).toBeNull();
    // …but a champion missing from EVERY manifest except the quote pack still speaks
    expect(
      resolveSelectVoice("plain", { voices: null, pack: null, blizzard: null, names: null, quotes: QUOTES })?.tier,
    ).toBe("quote");
  });
});

describe("select-voice ladder — the name rung", () => {
  it("pools the 全名 half only: a shared 稱號 must not answer for two characters", () => {
    cover("voice-select-name-rung");
    const rung = resolveSelectVoice("plain", inputs());
    expect(rung?.tier).toBe("name");
    // `plain` HAS a title segment; it is deliberately not pooled — 妙蛙種子 and
    // 妙蛙花 share the 稱號 種子神奇寶貝 and ship a byte-identical title clip.
    expect(rung?.clips).toEqual(["assets/audio/voices/names/plain.name.mp3"]);
  });

  it("drops a pinned missing clip so the champion falls through to its 名言", () => {
    cover("voice-select-name-rung");
    expect(EXCLUDED_NAME_CLIPS.has("assets/audio/voices/names/godie-e00j.name.mp3")).toBe(true);
    const names = championNamesFromDoc({
      champions: {
        plain: {
          zhName: "甲", spokenLine: "甲", jaName: "イチ",
          clip: "assets/audio/voices/names/godie-e00j.mp3",
          voSegments: [{ part: "name", clip: "assets/audio/voices/names/godie-e00j.name.mp3" }],
        },
      },
    });
    const rung = resolveSelectVoice("plain", inputs({ names }));
    expect(rung?.tier).toBe("quote");
  });

  it("falls back to the single canonical clip on a pre-#120 manifest", () => {
    cover("voice-select-name-rung");
    const names = championNamesFromDoc({
      champions: { plain: { zhName: "甲", spokenLine: "", jaName: "イチ", clip: "/content/assets/audio/voices/names/plain.mp3" } },
    });
    expect(resolveSelectVoice("plain", inputs({ names }))?.clips).toEqual([
      "assets/audio/voices/names/plain.mp3",
    ]);
  });
});

describe("generated voice pack — the drop-in contract", () => {
  it("parses lines.select, normalizes mount spellings, and ignores other categories", () => {
    cover("voice-select-pack");
    expect(VOICE_PACK_MANIFEST_PATH).toBe("assets/audio/voices/champions/MANIFEST.json");
    const pack = voicePackFromDoc(PACK_DOC);
    expect(packSelectClips(pack, "plain")).toEqual([
      "assets/audio/voices/champions/plain/select-1.mp3",
      "assets/audio/voices/champions/plain/select-2.mp3",
    ]);
    expect(pack?.champions["plain"]?.lines["battlecry"]).toHaveLength(1);
    expect(pack?.champions["plain"]?.engine).toBe("cosyvoice3");
    expect(pack?.champions["plain"]?.lines["select"]?.[0]?.speakerSim).toBe(0.81);
    // an unmeasured clip carries null rather than a fake 0
    expect(pack?.champions["plain"]?.lines["select"]?.[1]?.speakerSim).toBeNull();
    expect(packSelectClips(pack, "absent")).toEqual([]);
  });

  it("degrades to an empty rung on junk, an empty pack, or a 404 — never a throw", () => {
    cover("voice-select-pack");
    expect(voicePackFromDoc(null)).toBeNull();
    expect(voicePackFromDoc({ champions: {} })?.champions).toEqual({});
    expect(voicePackFromDoc("nope")).toBeNull();
    // entries that carry nothing playable contribute no clips
    const junk = voicePackFromDoc({
      champions: { a: { lines: { select: [{ clip: "" }, 7, null] } }, b: 3, c: { lines: 9 } },
    });
    expect(packSelectClips(junk, "a")).toEqual([]);
    expect(packSelectClips(junk, "c")).toEqual([]);
    expect(resolveSelectVoice("plain", inputs({ pack: junk }))?.tier).toBe("name");
  });
});

describe("select-voice pick + gain", () => {
  it("never repeats the previous clip while the pool has another option", () => {
    cover("voice-select-ladder");
    const pool = ["a.mp3", "b.mp3", "c.mp3"];
    // rng always picks index 0 of whatever it is handed
    expect(pickSelectClip(pool, () => 0, "a.mp3")).toBe("b.mp3");
    expect(pickSelectClip(pool, () => 0, null)).toBe("a.mp3");
    // a one-clip pool has no choice — that is the pool's limit, not a bug
    expect(pickSelectClip(["only.mp3"], () => 0, "only.mp3")).toBe("only.mp3");
    // rng at the top of the range stays in bounds
    expect(pickSelectClip(pool, () => 0.999999, null)).toBe("c.mp3");
    expect(pickSelectClip([], Math.random)).toBeNull();
  });

  it("plays the −16 LUFS TTS rungs at the call-out's own 0.95, source audio at 1", () => {
    cover("voice-select-ladder");
    expect(selectVoiceGain("name")).toBe(0.95);
    expect(selectVoiceGain("quote")).toBe(0.95);
    expect(selectVoiceGain("authored")).toBe(1);
    expect(selectVoiceGain("generated")).toBe(1);
    expect(selectVoiceGain("soundset")).toBe(1);
  });
});

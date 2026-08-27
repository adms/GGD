/**
 * task #35: champ-select confirm speaks the champion's call-out.
 * task #120: the call-out is deliberately MIXED-LANGUAGE — the 稱號 in a Chinese
 * voice, then the 全名 in Kyoko — played as two clips back-to-back on the single
 * reused element.
 *
 * Covers the tolerant manifest parse (incl. `voSegments`), the cached single-
 * flight fetch, clip-path resolution/normalization (single-clip + segment list),
 * the unlock gate, the master + SFX mute gates (neither burns the double-fire
 * guard), the ~1 s per-champion guard, the 稱號→全名 sequence, the "new call-out
 * supersedes the previous chain" single-element rule, graceful degradation when
 * a half is missing or its clip will not play, and full silent degradation when
 * the pack is missing. The mixer is a stub of the narrow read-only
 * NameVoiceAudioPort — this layer never touches the WebAudio graph.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import {
  ChampionNameVoice,
  NAME_VO_CLIP_DIR,
  NAME_VO_GUARD_MS,
  NAME_VO_MANIFEST_PATH,
  QUOTE_VO_CLIP_DIR,
  QUOTE_VO_MANIFEST_PATH,
  championNamesFromDoc,
  championQuotesFromDoc,
  nameClipFor,
  nameSegmentsFor,
  normalizeNameClipPath,
  quoteClipFor,
  quoteEntryFor,
  type NameVoiceAudioPort,
  type NameVoiceElement,
} from "./nameVoice";
import { DEFAULT_AUDIO_VOLUMES } from "./audioSettings";

// ---------------------------------------------------------------------------
// stubs
// ---------------------------------------------------------------------------

const DIR = NAME_VO_CLIP_DIR;
const QDIR = QUOTE_VO_CLIP_DIR;
/** 火霧戰士 - 夏娜: the user's canonical example — 稱號 (zh) + 全名 (ja). */
const E008_TITLE = `${DIR}/godie-e008.title.mp3`;
const E008_NAME = `${DIR}/godie-e008.name.mp3`;
/** task #139 — 夏娜's famous quote clip, played as the THIRD confirm segment. */
const E008_QUOTE = `${QDIR}/godie-e008.mp3`;

/** The quote pack (task #139): e008 has a quote; sela deliberately does not. */
const QUOTES = {
  id: "champion-quotes-ja",
  quotes: {
    "godie-e008": {
      name: "夏娜",
      character: "灼眼のシャナ",
      gender: "female",
      jpQuote: "うるさいうるさいうるさい！",
      romaji: "Urusai urusai urusai!",
      zhGloss: "囉唆囉唆囉唆！",
      real: true,
      clip: E008_QUOTE,
    },
  },
};

const MANIFEST = {
  id: "champion-names-ja",
  champions: {
    // both halves — the mixed-language call-out
    "godie-e008": {
      zhName: "火霧戰士 - 夏娜",
      spokenLine: "フレイムヘイズ・シャナ。",
      jaName: "シャナ",
      reading: "Flame Haze Shana",
      confidence: "high",
      evidence: "灼眼のシャナ",
      clip: `${DIR}/godie-e008.mp3`,
      voSegments: [
        { part: "title", lang: "zh-TW", voice: "Tingting", text: "火霧戰士", clip: E008_TITLE },
        { part: "name", lang: "ja-JP", voice: "Kyoko", text: "夏娜", clip: E008_NAME },
      ],
    },
    // titleless — the 全名 half only (graceful single-segment)
    sela: {
      zhName: "Sela, the Ember Sage",
      spokenLine: "Sela, the Ember Sage.",
      jaName: "",
      reading: "Sela",
      confidence: "high",
      evidence: "en",
      clip: `${DIR}/sela.mp3`,
      voSegments: [
        { part: "name", lang: "ja-JP", voice: "Kyoko", text: "Sela, the Ember Sage", clip: `${DIR}/sela.name.mp3` },
      ],
    },
    // pre-#120 entry: no voSegments, a /content/-prefixed clip → single-clip fallback
    "godie-u010": {
      zhName: "邪眼師 - 飛影",
      jaName: "ヒエイ",
      reading: "Hiei",
      confidence: "high",
      evidence: "幽☆遊☆白書",
      clip: "/content/assets/audio/voices/names/godie-u010.mp3",
    },
    // no `clip`, no `voSegments` — the path is derived from the id
    "godie-e001": { zhName: "龍宮禮奈", jaName: "リュウグウレナ", confidence: "high" },
  },
};

interface MixerStub {
  audio: NameVoiceAudioPort;
  state: { unlocked: boolean; muted: boolean; sfxMuted: boolean };
}

function mixer(): MixerStub {
  const state = { unlocked: true, muted: false, sfxMuted: false };
  return {
    state,
    audio: {
      get isUnlocked() {
        return state.unlocked;
      },
      volumes: () => ({ ...DEFAULT_AUDIO_VOLUMES, muted: state.muted, sfxMuted: state.sfxMuted }),
    },
  };
}

interface ElementStub extends NameVoiceElement {
  plays: string[];
  pauses: number;
  volumes: number[];
  /** simulate the current clip finishing → fire the chain to the next half */
  end(): void;
}

/** `rejectIf(src)` → this clip's `play()` rejects (a blocked/404 half). */
function element(rejectIf?: (src: string) => boolean): ElementStub {
  const el: ElementStub = {
    src: "",
    volume: 1,
    currentTime: 0,
    onended: null,
    plays: [],
    pauses: 0,
    volumes: [],
    play() {
      el.plays.push(el.src);
      el.volumes.push(el.volume);
      return rejectIf && rejectIf(el.src)
        ? Promise.reject(new Error("blocked"))
        : Promise.resolve();
    },
    pause() {
      el.pauses++;
    },
    end() {
      const cb = el.onended;
      if (cb) cb();
    },
  };
  return el;
}

interface Harness {
  vo: ChampionNameVoice;
  el: ElementStub;
  mix: MixerStub;
  urls: string[];
  clock: { t: number };
}

function harness(
  doc: unknown = MANIFEST,
  ok = true,
  el: ElementStub = element(),
  quoteDoc: unknown = QUOTES,
): Harness {
  const mix = mixer();
  const urls: string[] = [];
  const clock = { t: 1000 };
  const vo = new ChampionNameVoice({
    audio: mix.audio,
    fetchFn: (url) => {
      urls.push(url);
      // The confirm path fetches BOTH packs (names + quotes); route by URL so
      // each parser gets its own doc.
      const body = url.includes(QUOTE_VO_MANIFEST_PATH) ? quoteDoc : doc;
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(body),
      } as unknown as Response);
    },
    now: () => clock.t,
    createAudio: () => el,
    warn: () => {},
  });
  return { vo, el, mix, urls, clock };
}

/** flush the microtask queue so a rejected `play()`'s `.catch` runs. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// manifest shape
// ---------------------------------------------------------------------------

describe("championNamesFromDoc", () => {
  it("parses entries, voSegments, and derives a clip path when the doc omits one", () => {
    cover("name-vo-manifest-shape");
    const m = championNamesFromDoc(MANIFEST);
    expect(m).not.toBeNull();
    expect(m!.champions["godie-e008"]!.jaName).toBe("シャナ");
    expect(m!.champions["godie-e008"]!.confidence).toBe("high");
    // the two mixed-language halves survive, in order, normalized onto the mount
    expect(m!.champions["godie-e008"]!.voSegments.map((s) => s.clip)).toEqual([
      E008_TITLE,
      E008_NAME,
    ]);
    // an entry with no clip and no voSegments still derives the single clip path
    expect(m!.champions["godie-e001"]!.clip).toBe(`${NAME_VO_CLIP_DIR}/godie-e001.mp3`);
    expect(m!.champions["godie-e001"]!.voSegments).toEqual([]);
  });

  it("rejects junk docs, skips empty entries, and tolerates junk voSegments", () => {
    cover("name-vo-manifest-tolerant");
    expect(championNamesFromDoc(null)).toBeNull();
    expect(championNamesFromDoc({})).toBeNull();
    expect(championNamesFromDoc({ champions: 7 })).toBeNull();
    const m = championNamesFromDoc({
      champions: {
        a: { jaName: "" }, // nothing to say → dropped
        b: null,
        c: { jaName: "セラ", confidence: "bogus" }, // survives via jaName
        d: { voSegments: [{ clip: "assets/x.name.mp3" }] }, // survives via voSegments alone
        e: { jaName: "エフ", voSegments: 42 }, // junk voSegments → []
      },
    });
    expect(Object.keys(m!.champions).sort()).toEqual(["c", "d", "e"]);
    expect(m!.champions["c"]!.confidence).toBe("low"); // unknown → most cautious
    expect(m!.champions["d"]!.voSegments.map((s) => s.clip)).toEqual(["assets/x.name.mp3"]);
    expect(m!.champions["e"]!.voSegments).toEqual([]);
  });

  it("normalizes every clip-path spelling onto the mount, single-clip and segments", () => {
    cover("name-vo-clip-path");
    const m = championNamesFromDoc(MANIFEST);
    expect(nameClipFor(m, "godie-u010")).toBe(`${NAME_VO_CLIP_DIR}/godie-u010.mp3`);
    expect(normalizeNameClipPath("content/assets/x.mp3")).toBe("assets/x.mp3");
    expect(normalizeNameClipPath("/assets/x.mp3")).toBe("assets/x.mp3");
    expect(normalizeNameClipPath("  ")).toBeNull();
    expect(nameClipFor(m, "nope")).toBeNull(); // unmapped champion = silence
    // the sequence: voSegments when present, else the single clip, else []
    expect(nameSegmentsFor(m, "godie-e008")).toEqual([E008_TITLE, E008_NAME]);
    expect(nameSegmentsFor(m, "godie-u010")).toEqual([`${NAME_VO_CLIP_DIR}/godie-u010.mp3`]);
    expect(nameSegmentsFor(m, "nope")).toEqual([]);
  });

  it("parses the quote pack tolerantly and resolves clip/entry by id (task #139)", () => {
    cover("name-vo-quote-shape");
    expect(championQuotesFromDoc(null)).toBeNull();
    expect(championQuotesFromDoc({})).toBeNull();
    expect(championQuotesFromDoc({ quotes: 7 })).toBeNull();
    const q = championQuotesFromDoc({
      quotes: {
        "godie-e008": { jpQuote: "うるさい！", zhGloss: "囉唆！", gender: "female", clip: `${QDIR}/godie-e008.mp3` },
        blank: { jpQuote: "" }, // nothing to say/show → dropped
        derived: { jpQuote: "テスト", gender: "bogus" }, // clip derived, gender → neutral
        coined: { jpQuote: "オリジナル", real: false }, // explicit original line
      },
    });
    expect(Object.keys(q!.quotes).sort()).toEqual(["coined", "derived", "godie-e008"]);
    expect(q!.quotes["derived"]!.gender).toBe("neutral"); // unknown → neutral
    expect(q!.quotes["derived"]!.clip).toBe(`${QUOTE_VO_CLIP_DIR}/derived.mp3`); // derived
    expect(q!.quotes["derived"]!.real).toBe(true); // defaults true
    expect(q!.quotes["coined"]!.real).toBe(false); // only explicit false marks a coined line
    // accessors: clip normalized onto the mount, full entry, null when unmapped
    expect(quoteClipFor(q, "godie-e008")).toBe(`${QDIR}/godie-e008.mp3`);
    expect(quoteEntryFor(q, "godie-e008")!.zhGloss).toBe("囉唆！");
    expect(quoteClipFor(q, "nope")).toBeNull();
    expect(quoteEntryFor(q, "nope")).toBeNull();
    expect(quoteClipFor(null, "godie-e008")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// playback
// ---------------------------------------------------------------------------

describe("ChampionNameVoice.play", () => {
  it("speaks 稱號 (zh) → 全名 (ja) → 名言 (quote) in order — one sequence per confirm", async () => {
    cover("name-vo-mixlang-sequence");
    const h = harness();
    // confirm → the 稱號 half starts immediately
    expect(await h.vo.play("godie-e008")).toBe(true);
    expect(h.el.plays).toEqual([`/content/${E008_TITLE}`]);
    // when it ends, the 全名 half follows on the same element — 稱號 FIRST
    h.el.end();
    expect(h.el.plays).toEqual([`/content/${E008_TITLE}`, `/content/${E008_NAME}`]);
    // task #139 — after the 全名, the famous quote plays as the THIRD segment
    h.el.end();
    expect(h.el.plays).toEqual([`/content/${E008_TITLE}`, `/content/${E008_NAME}`, `/content/${E008_QUOTE}`]);
    // the last segment does not chain further
    h.el.end();
    expect(h.el.plays).toHaveLength(3);

    // a titleless, quote-less champion speaks the 全名 alone — no 稱號, no 名言
    h.clock.t += NAME_VO_GUARD_MS;
    expect(await h.vo.play("sela")).toBe(true);
    expect(h.el.plays.at(-1)).toBe(`/content/${DIR}/sela.name.mp3`);
    h.el.end();
    expect(h.el.plays.filter((p) => p.includes("sela"))).toEqual([`/content/${DIR}/sela.name.mp3`]);
  });

  it("appends the quote even when a champion has ONLY a quote (no name mapping)", async () => {
    cover("name-vo-quote-only");
    // a champion absent from the names pack but present in the quote pack still
    // speaks — the quote is the whole call-out.
    const quoteOnly = { quotes: { "godie-solo": { jpQuote: "テスト", clip: `${QDIR}/godie-solo.mp3` } } };
    const h = harness(MANIFEST, true, element(), quoteOnly);
    expect(await h.vo.play("godie-solo")).toBe(true);
    expect(h.el.plays).toEqual([`/content/${QDIR}/godie-solo.mp3`]);
  });

  it("skips a half whose clip will not play and still speaks the rest", async () => {
    cover("name-vo-mixlang-degrade");
    // the 稱號 clip is blocked (404 / autoplay); the 全名 half must still play
    const el = element((src) => src.endsWith(".title.mp3"));
    const h = harness(MANIFEST, true, el);
    expect(await h.vo.play("godie-e008")).toBe(true);
    await flush(); // let the rejected 稱號 play() advance the chain
    expect(h.el.plays).toEqual([`/content/${E008_TITLE}`, `/content/${E008_NAME}`]);
  });

  it("caches the manifest fetch and honours the ~1 s double-fire guard", async () => {
    cover("name-vo-confirm-plays-once");
    const h = harness();
    expect(await h.vo.play("godie-e008")).toBe(true);
    h.el.end(); // 全名
    h.el.end(); // 名言 — complete the sequence (稱號 + 全名 + quote)
    expect(h.el.plays).toHaveLength(3);
    // both packs fetched once (names + quotes), single-flight cached thereafter
    expect(h.urls).toEqual([
      `/content/${NAME_VO_MANIFEST_PATH}`,
      `/content/${QUOTE_VO_MANIFEST_PATH}`,
    ]);

    // same-champion double confirm inside the guard → no new sequence
    h.clock.t += 1;
    expect(await h.vo.play("godie-e008")).toBe(false);
    expect(h.el.plays).toHaveLength(3);

    // past the guard it speaks again, without re-fetching either manifest
    h.clock.t += NAME_VO_GUARD_MS;
    expect(await h.vo.play("godie-e008")).toBe(true);
    expect(h.el.plays[3]).toBe(`/content/${E008_TITLE}`);
    expect(h.urls).toHaveLength(2);
  });

  it("reserves the guard synchronously so concurrent confirms cannot double-fire", async () => {
    cover("name-vo-guard-sync");
    const h = harness();
    const [a, b] = await Promise.all([h.vo.play("godie-e008"), h.vo.play("godie-e008")]);
    expect([a, b]).toEqual([true, false]);
    expect(h.el.plays).toEqual([`/content/${E008_TITLE}`]); // only one sequence started
  });

  it("a new call-out supersedes the previous chain instead of overlapping it", async () => {
    cover("name-vo-single-voice");
    const h = harness();
    await h.vo.play("godie-e008"); // starts the 稱號 half…
    await h.vo.play("sela"); // …preempted before the 全名 half fires
    expect(h.el.plays).toEqual([`/content/${E008_TITLE}`, `/content/${DIR}/sela.name.mp3`]);
    expect(h.el.pauses).toBe(2); // every confirm pauses the single shared element once

    // the superseded e008 chain must NOT resurrect its 全名 if a stale end fires
    h.el.end();
    expect(h.el.plays).toEqual([`/content/${E008_TITLE}`, `/content/${DIR}/sela.name.mp3`]);
  });

  it("stays silent while muted and does not burn the guard", async () => {
    cover("name-vo-mute-suppresses");
    const h = harness();
    h.mix.state.muted = true;
    expect(await h.vo.play("godie-e008")).toBe(false);
    h.mix.state.muted = false;
    h.mix.state.sfxMuted = true;
    expect(await h.vo.play("godie-e008")).toBe(false);
    expect(h.el.plays).toEqual([]);
    expect(h.urls).toEqual([]); // muted never even fetches

    // un-muting immediately afterwards still speaks: the guard was not burned
    h.mix.state.sfxMuted = false;
    expect(await h.vo.play("godie-e008")).toBe(true);
    expect(h.el.plays).toEqual([`/content/${E008_TITLE}`]);
    expect(h.el.volumes[0]).toBeCloseTo(
      DEFAULT_AUDIO_VOLUMES.master * DEFAULT_AUDIO_VOLUMES.sfx * 0.95,
      5,
    );
  });

  it("stays silent before the autoplay unlock, and for unmapped/missing packs", async () => {
    cover("name-vo-silent-degrade");
    const locked = harness();
    locked.mix.state.unlocked = false;
    expect(await locked.vo.play("godie-e008")).toBe(false);
    expect(locked.urls).toEqual([]);

    const mapped = harness();
    expect(await mapped.vo.play("")).toBe(false);
    expect(await mapped.vo.play("godie-not-in-pack")).toBe(false);
    expect(mapped.el.plays).toEqual([]);

    const missing = harness(null, false); // 404: pack never generated
    expect(await missing.vo.play("godie-e008")).toBe(false);
    expect(missing.el.plays).toEqual([]);
  });

  it("is a no-op where the DOM has no Audio element (node/SSR)", async () => {
    cover("name-vo-no-dom");
    const mix = mixer();
    const vo = new ChampionNameVoice({
      audio: mix.audio,
      fetchFn: () => Promise.resolve({ ok: true, json: () => Promise.resolve(MANIFEST) } as unknown as Response),
      createAudio: () => null,
      warn: () => {},
    });
    expect(await vo.play("godie-e008")).toBe(false);
  });

  // task #62: the out-of-graph name call-out must also honour the force-silence
  // gate — the reused `new Audio()` element is never created, so nothing plays
  // even when the mixer is unlocked, unmuted and a real element factory is given.
  it("is silent in test mode: the HTMLAudioElement is never created", async () => {
    cover("audio-test-silence");
    const mix = mixer();
    const el = element();
    const vo = new ChampionNameVoice({
      audio: mix.audio,
      silent: true, // force-silence wins over the provided createAudio
      fetchFn: () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(MANIFEST) } as unknown as Response),
      createAudio: () => el,
      warn: () => {},
    });
    expect(await vo.play("godie-e008")).toBe(false);
    expect(el.plays).toEqual([]);
    expect(el.pauses).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// task #139 — playQuote: the quote-ONLY path (settlement + round-end beats)
// ---------------------------------------------------------------------------

describe("ChampionNameVoice.playQuote", () => {
  it("plays ONLY the quote clip — no 稱號→全名 call-out — and fetches only the quote pack", async () => {
    cover("name-vo-quote-only-play");
    const h = harness();
    expect(await h.vo.playQuote("godie-e008")).toBe(true);
    expect(h.el.plays).toEqual([`/content/${E008_QUOTE}`]); // the quote clip alone
    h.el.end();
    expect(h.el.plays).toHaveLength(1); // a single-clip sequence never chains
    // the quote path warms ONLY the quote pack, never the names manifest
    expect(h.urls).toEqual([`/content/${QUOTE_VO_MANIFEST_PATH}`]);
  });

  it("silently skips a champion with no quote clip yet (partial-roster pack)", async () => {
    cover("name-vo-quote-missing-skip");
    const h = harness();
    // sela is in the NAMES pack but deliberately absent from the QUOTES pack
    expect(await h.vo.playQuote("sela")).toBe(false);
    expect(await h.vo.playQuote("godie-not-in-any-pack")).toBe(false);
    expect(h.el.plays).toEqual([]);
  });

  it("honours the ~1 s per-champion double-fire guard (no double-play)", async () => {
    cover("name-vo-quote-guard");
    const h = harness();
    expect(await h.vo.playQuote("godie-e008")).toBe(true);
    h.clock.t += 1;
    expect(await h.vo.playQuote("godie-e008")).toBe(false); // inside the guard
    expect(h.el.plays).toHaveLength(1);
    h.clock.t += NAME_VO_GUARD_MS;
    expect(await h.vo.playQuote("godie-e008")).toBe(true); // past the guard, plays again
    expect(h.el.plays).toHaveLength(2);
  });

  it("uses a guard key independent of the confirm call-out for the same champion", async () => {
    cover("name-vo-quote-guard-independent");
    const h = harness();
    // a champ-select confirm sets the CALL-OUT guard for e008…
    expect(await h.vo.play("godie-e008")).toBe(true);
    // …which must NOT suppress the settlement/round quote for the same champ
    expect(await h.vo.playQuote("godie-e008")).toBe(true);
    expect(h.el.plays.at(-1)).toBe(`/content/${E008_QUOTE}`);
  });

  it("stays silent while muted (no fetch, no guard burn) and before the unlock", async () => {
    cover("name-vo-quote-gates");
    const h = harness();
    h.mix.state.sfxMuted = true;
    expect(await h.vo.playQuote("godie-e008")).toBe(false);
    expect(h.urls).toEqual([]); // muted never even fetches
    // un-muting immediately still speaks: the guard was not burned
    h.mix.state.sfxMuted = false;
    expect(await h.vo.playQuote("godie-e008")).toBe(true);

    const locked = harness();
    locked.mix.state.unlocked = false;
    expect(await locked.vo.playQuote("godie-e008")).toBe(false);
    expect(locked.urls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// the real generated manifest carries the mixed-language pair per champion
// ---------------------------------------------------------------------------

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CONTENT = resolve(HERE, "../../../../content");

interface RealSegment {
  part: string;
  lang: string;
  voice: string;
  text: string;
  clip: string;
}
interface RealEntry {
  zhTitle: string | null;
  zhFullName: string;
  voSegments: RealSegment[];
}
interface RealDoc {
  voMixlang: { zhVoice: string; jaVoice: string };
  champions: Record<string, RealEntry>;
}

describe("the generated MANIFEST carries a zh-稱號 + ja-全名 clip per champion", () => {
  it("every champion lists a Kyoko 全名 clip, titled ones a Chinese 稱號 clip first", () => {
    cover("name-vo-mixlang-manifest");
    const doc = JSON.parse(readFileSync(`${CONTENT}/${NAME_VO_MANIFEST_PATH}`, "utf8")) as RealDoc;
    const zhVoice = doc.voMixlang.zhVoice;
    const jaVoice = doc.voMixlang.jaVoice;
    expect(jaVoice).toBe("Kyoko"); // the 全名 is always the Japanese voice
    expect(zhVoice).not.toBe("Kyoko"); // the 稱號 is a distinct Chinese voice

    const ids = Object.keys(doc.champions);
    // ⭐ GH#744 / GH#811 —— 這裡以前是 `expect(ids.length).toBeGreaterThan(100)`，
    // 一個「有讀到真的檔案」的粗略下界。2026-08-27 呼名產生器把 47 位退休英雄的
    // 讀音搬到 `retiredCasting`（英雄文件在 `content/_legacy/champions/`），
    // 於是 `champions` 從 118 掉到 71，而那個下界**用錯誤的訊息**紅了：
    // 它看起來在說「產生器少寫了 47 位」，實際上是「那 47 位下架了」。
    //
    // ⇒ 換成**關係**：這一份要覆蓋的就是**出貨名單**，一位不多一位不少。
    // 少一位 ⇒ 那位英雄的呼名是啞的；多一位 ⇒ 退休的沒有被搬走。兩種都會紅，
    // 而且訊息指名是誰。⛔ 不是一個要有人記得往下調的數字。
    const liveDocs = readdirSync(`${CONTENT}/champions`)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => f.slice(0, -5));
    expect(ids.slice().sort()).toEqual(liveDocs.slice().sort());

    for (const id of ids) {
      const e = doc.champions[id]!;
      expect(e.voSegments.length, `${id} has ≥1 vo segment`).toBeGreaterThan(0);

      // the LAST half is always the 全名, spoken by Kyoko, in its own .name clip
      const name = e.voSegments.at(-1)!;
      expect(name.part, `${id} last segment is the 全名`).toBe("name");
      expect(name.voice, `${id} 全名 voice`).toBe(jaVoice);
      expect(name.text, `${id} 全名 text is the Chinese 全名`).toBe(e.zhFullName);
      expect(name.clip, `${id} 全名 clip`).toBe(`${NAME_VO_CLIP_DIR}/${id}.name.mp3`);

      if (e.zhTitle) {
        // a titled champion opens with the 稱號 in the Chinese voice, .title clip
        const title = e.voSegments[0]!;
        expect(title.part, `${id} first segment is the 稱號`).toBe("title");
        expect(title.voice, `${id} 稱號 voice is Chinese`).toBe(zhVoice);
        expect(title.text, `${id} 稱號 text is the Chinese 稱號`).toBe(e.zhTitle);
        expect(title.clip, `${id} 稱號 clip`).toBe(`${NAME_VO_CLIP_DIR}/${id}.title.mp3`);
        expect(e.voSegments.length, `${id} is 稱號 then 全名`).toBe(2);
      } else {
        expect(e.voSegments.length, `${id} titleless → 全名 only`).toBe(1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// the real generated quote pack (task #139)
// ---------------------------------------------------------------------------

interface RealQuoteEntry {
  gender: string;
  jpQuote: string;
  zhGloss: string;
  real: boolean;
  clip: string;
}
interface RealQuoteDoc {
  coverage: { names: number; ids: number; real: number; original: number };
  quotes: Record<string, RealQuoteEntry>;
}

describe("the generated quotes.json is a well-formed quote pack", () => {
  it("parses, covers the roster, and every entry has a line + a derived clip", () => {
    cover("name-vo-quote-manifest");
    const doc = JSON.parse(
      readFileSync(`${CONTENT}/${QUOTE_VO_MANIFEST_PATH}`, "utf8"),
    ) as RealQuoteDoc;

    // the tolerant client parser accepts the real file
    const m = championQuotesFromDoc(doc);
    expect(m).not.toBeNull();

    const ids = Object.keys(doc.quotes);
    expect(ids.length).toBe(doc.coverage.ids);
    // The pack now covers ALL champions (task #142), not just the 48 roster —
    // 113 ids across 92 distinct display names (twins share a name/quote).
    expect(doc.coverage.ids).toBeGreaterThanOrEqual(113);
    expect(doc.coverage.names).toBeGreaterThan(0);
    expect(doc.coverage.real + doc.coverage.original).toBe(ids.length);

    let real = 0;
    for (const id of ids) {
      const e = doc.quotes[id]!;
      expect(e.jpQuote, `${id} has a spoken line`).toBeTruthy();
      expect(["male", "female", "neutral"], `${id} gender`).toContain(e.gender);
      // the clip path is the id's own clip under the quotes dir
      expect(e.clip, `${id} clip`).toBe(`${QUOTE_VO_CLIP_DIR}/${id}.mp3`);
      expect(quoteClipFor(m, id), `${id} resolves its clip`).toBe(`${QUOTE_VO_CLIP_DIR}/${id}.mp3`);
      if (e.real) real++;
    }
    expect(real).toBe(doc.coverage.real);
  });
});

/**
 * GH#583 —— **名言停得下來**。這一層走 `HTMLAudioElement`，⛔ 不在 WebAudio 圖上，
 * 所以 `stopSustainedSfx()` / `stopAllVoices()` / 場景切換逐位元都碰不到它；
 * 在 `cancel()` 之前，回合結算的名言（素材 mean 2.4s / **max 9.99s**）會整句講完、
 * 跨過商店、跨過離開房間、跨進練習模式，而**沒有任何按鈕停得掉**。
 */
describe("ChampionNameVoice.cancel (name-vo-cancel, GH#583)", () => {
  it("停掉正在講的那一句，並且把 onended 鏈斷掉", async () => {
    cover("name-vo-cancel");
    const h = harness();
    expect(await h.vo.playQuote("godie-e008")).toBe(true);
    expect(h.el.plays.length).toBe(1); // 名言正在響
    const pausesBefore = h.el.pauses;

    h.vo.cancel();

    // ⭐ `pause()` 是關鍵:只 bump `seq` 只擋得住**下一段**,擋不住**正在響的這一段**,
    // 而正在響的這一段正是玩家聽到的那個。
    expect(h.el.pauses).toBe(pausesBefore + 1);
    expect(h.el.onended).toBeNull();
    // 取消之後,舊的 chain 已經作廢 —— 再 end() 一次不會推出第二個 clip
    h.el.end();
    expect(h.el.plays.length).toBe(1);
  });
});

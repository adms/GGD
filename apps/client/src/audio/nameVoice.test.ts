/**
 * task #35: champ-select confirm speaks the champion's Japanese full name.
 *
 * Covers the tolerant manifest parse, the cached single-flight fetch, clip-path
 * resolution/normalization (incl. the derived fallback), the unlock gate, the
 * master + SFX mute gates (neither burns the double-fire guard), the ~1 s
 * per-champion guard (exactly ONE clip per confirm), the "new call-out replaces
 * the previous" single-element rule, and full silent degradation when the pack
 * is missing. The mixer is a stub of the narrow read-only NameVoiceAudioPort —
 * this layer never touches the WebAudio graph.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  ChampionNameVoice,
  NAME_VO_CLIP_DIR,
  NAME_VO_GUARD_MS,
  NAME_VO_MANIFEST_PATH,
  championNamesFromDoc,
  nameClipFor,
  normalizeNameClipPath,
  type NameVoiceAudioPort,
  type NameVoiceElement,
} from "./nameVoice";
import { DEFAULT_AUDIO_VOLUMES } from "./audioSettings";

// ---------------------------------------------------------------------------
// stubs
// ---------------------------------------------------------------------------

const MANIFEST = {
  id: "champion-names-ja",
  champions: {
    "godie-o02l": {
      zhName: "神騎寶貝 - 皮卡丘",
      jaName: "ピカチュウ",
      reading: "Pikachuu",
      confidence: "high",
      evidence: "ポケットモンスター",
      clip: "assets/audio/voices/names/godie-o02l.mp3",
    },
    "godie-u010": {
      zhName: "邪眼師 - 飛影",
      jaName: "ヒエイ",
      reading: "Hiei",
      confidence: "high",
      evidence: "幽☆遊☆白書",
      clip: "/content/assets/audio/voices/names/godie-u010.mp3",
    },
    // no `clip` — the path is derived from the id
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
}

function element(): ElementStub {
  const el: ElementStub = {
    src: "",
    volume: 1,
    currentTime: 0,
    plays: [],
    pauses: 0,
    volumes: [],
    play() {
      el.plays.push(el.src);
      el.volumes.push(el.volume);
      return Promise.resolve();
    },
    pause() {
      el.pauses++;
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

function harness(doc: unknown = MANIFEST, ok = true): Harness {
  const mix = mixer();
  const el = element();
  const urls: string[] = [];
  const clock = { t: 1000 };
  const vo = new ChampionNameVoice({
    audio: mix.audio,
    fetchFn: (url) => {
      urls.push(url);
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(doc),
      } as unknown as Response);
    },
    now: () => clock.t,
    createAudio: () => el,
    warn: () => {},
  });
  return { vo, el, mix, urls, clock };
}

// ---------------------------------------------------------------------------
// manifest shape
// ---------------------------------------------------------------------------

describe("championNamesFromDoc", () => {
  it("parses entries and derives a clip path when the doc omits one", () => {
    cover("name-vo-manifest-shape");
    const m = championNamesFromDoc(MANIFEST);
    expect(m).not.toBeNull();
    expect(m!.champions["godie-o02l"]!.jaName).toBe("ピカチュウ");
    expect(m!.champions["godie-o02l"]!.confidence).toBe("high");
    expect(m!.champions["godie-e001"]!.clip).toBe(`${NAME_VO_CLIP_DIR}/godie-e001.mp3`);
  });

  it("rejects junk docs and skips entries with no reading", () => {
    cover("name-vo-manifest-tolerant");
    expect(championNamesFromDoc(null)).toBeNull();
    expect(championNamesFromDoc({})).toBeNull();
    expect(championNamesFromDoc({ champions: 7 })).toBeNull();
    const m = championNamesFromDoc({
      champions: { a: { jaName: "" }, b: null, c: { jaName: "セラ", confidence: "bogus" } },
    });
    expect(Object.keys(m!.champions)).toEqual(["c"]);
    expect(m!.champions["c"]!.confidence).toBe("low"); // unknown → most cautious
  });

  it("normalizes every content-path spelling onto the mount", () => {
    cover("name-vo-clip-path");
    const m = championNamesFromDoc(MANIFEST);
    expect(nameClipFor(m, "godie-u010")).toBe(`${NAME_VO_CLIP_DIR}/godie-u010.mp3`);
    expect(normalizeNameClipPath("content/assets/x.mp3")).toBe("assets/x.mp3");
    expect(normalizeNameClipPath("/assets/x.mp3")).toBe("assets/x.mp3");
    expect(normalizeNameClipPath("  ")).toBeNull();
    expect(nameClipFor(m, "nope")).toBeNull(); // unmapped champion = silence
  });
});

// ---------------------------------------------------------------------------
// playback
// ---------------------------------------------------------------------------

describe("ChampionNameVoice.play", () => {
  it("plays the mapped clip once per confirm and caches the manifest fetch", async () => {
    cover("name-vo-confirm-plays-once");
    const h = harness();
    expect(await h.vo.play("godie-o02l")).toBe(true);
    expect(h.el.plays).toEqual(["/content/assets/audio/voices/names/godie-o02l.mp3"]);
    expect(h.urls).toEqual([`/content/${NAME_VO_MANIFEST_PATH}`]);

    // same-tick double confirm (double click / re-render) → still exactly one
    h.clock.t += 1;
    expect(await h.vo.play("godie-o02l")).toBe(false);
    expect(h.el.plays).toHaveLength(1);

    // past the guard the same champion speaks again, without re-fetching
    h.clock.t += NAME_VO_GUARD_MS;
    expect(await h.vo.play("godie-o02l")).toBe(true);
    expect(h.el.plays).toHaveLength(2);
    expect(h.urls).toHaveLength(1);
  });

  it("reserves the guard synchronously so concurrent confirms cannot double-fire", async () => {
    cover("name-vo-guard-sync");
    const h = harness();
    const [a, b] = await Promise.all([h.vo.play("godie-o02l"), h.vo.play("godie-o02l")]);
    expect([a, b]).toEqual([true, false]);
    expect(h.el.plays).toHaveLength(1);
  });

  it("switching pick replaces the previous call-out instead of overlapping", async () => {
    cover("name-vo-single-voice");
    const h = harness();
    await h.vo.play("godie-o02l");
    await h.vo.play("godie-u010");
    expect(h.el.plays).toEqual([
      "/content/assets/audio/voices/names/godie-o02l.mp3",
      "/content/assets/audio/voices/names/godie-u010.mp3",
    ]);
    expect(h.el.pauses).toBe(2); // every start pauses the single shared element
  });

  it("stays silent while muted and does not burn the guard", async () => {
    cover("name-vo-mute-suppresses");
    const h = harness();
    h.mix.state.muted = true;
    expect(await h.vo.play("godie-o02l")).toBe(false);
    h.mix.state.muted = false;
    h.mix.state.sfxMuted = true;
    expect(await h.vo.play("godie-o02l")).toBe(false);
    expect(h.el.plays).toEqual([]);
    expect(h.urls).toEqual([]); // muted never even fetches

    // un-muting immediately afterwards still speaks: the guard was not burned
    h.mix.state.sfxMuted = false;
    expect(await h.vo.play("godie-o02l")).toBe(true);
    expect(h.el.plays).toHaveLength(1);
    expect(h.el.volumes[0]).toBeCloseTo(
      DEFAULT_AUDIO_VOLUMES.master * DEFAULT_AUDIO_VOLUMES.sfx * 0.95,
      5,
    );
  });

  it("stays silent before the autoplay unlock, and for unmapped/missing packs", async () => {
    cover("name-vo-silent-degrade");
    const locked = harness();
    locked.mix.state.unlocked = false;
    expect(await locked.vo.play("godie-o02l")).toBe(false);
    expect(locked.urls).toEqual([]);

    const mapped = harness();
    expect(await mapped.vo.play("")).toBe(false);
    expect(await mapped.vo.play("godie-not-in-pack")).toBe(false);
    expect(mapped.el.plays).toEqual([]);

    const missing = harness(null, false); // 404: pack never generated
    expect(await missing.vo.play("godie-o02l")).toBe(false);
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
    expect(await vo.play("godie-o02l")).toBe(false);
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
    expect(await vo.play("godie-o02l")).toBe(false);
    expect(el.plays).toEqual([]);
    expect(el.pauses).toBe(0);
  });
});

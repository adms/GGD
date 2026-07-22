/**
 * task #27: click-your-hero select quips. Covers the cached config fetch, the
 * random authored-clip pick, the ~2.5 s per-champion cooldown, the unlock +
 * SFX-mute gates (neither burns the cooldown), the dev-only blizzard-local
 * "what" fallback for source:"none" champions (single cached, 404-tolerant
 * probe), and full silent degradation when neither source exists. The mixer is
 * a stub of the narrow VoiceAudioPort; the playClip seam itself is exercised
 * over the fake WebAudio graph in AudioSystem.test.ts.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  BLIZZARD_MANIFEST_PATH,
  CHAMPION_VOICES_PATH,
  ChampionVoicePlayer,
  SELECT_VOICE_COOLDOWN_MS,
  blizzardManifestFromDoc,
  blizzardWhatClips,
  championVoicesFromDoc,
  normalizeClipPath,
  pickVoiceClip,
  type VoiceAudioPort,
} from "./championVoice";

// ---------------------------------------------------------------------------
// stubs
// ---------------------------------------------------------------------------

const CONFIG = {
  champions: {
    sela: {
      select: ["assets/audio/voice/sela-sel1.mp3", "assets/audio/voice/sela-sel2.mp3"],
      source: "map-quip",
      soundset: null,
    },
    thorne: {
      select: ["assets/audio/voice/thorne-sel1.mp3"],
      source: "map-quip",
      soundset: null,
    },
    uther: { select: [], source: "none", soundset: "HeroPaladin" },
  },
};

const MANIFEST = {
  units: {
    Hpal: {
      champId: "uther",
      clips: {
        what: ["assets/blizzard-local/sound/hpal-what1.mp3", "assets/blizzard-local/sound/hpal-what2.mp3"],
        yes: ["assets/blizzard-local/sound/hpal-yes1.mp3"],
      },
    },
  },
};

interface AudioStub {
  audio: VoiceAudioPort;
  played: string[];
  state: { unlocked: boolean; muted: boolean; sfxMuted: boolean };
}

function stubAudio(over: Partial<AudioStub["state"]> = {}): AudioStub {
  const state = { unlocked: true, muted: false, sfxMuted: false, ...over };
  const played: string[] = [];
  const audio: VoiceAudioPort = {
    get isUnlocked() {
      return state.unlocked;
    },
    volumes: () => ({ muted: state.muted, sfxMuted: state.sfxMuted }),
    playClip: (path) => {
      played.push(path);
      return true;
    },
  };
  return { audio, played, state };
}

/** fetch stub serving config/manifest (either can be "missing" → 404). */
function stubFetch(opts: { config?: unknown; manifest?: unknown } = {}): {
  fetchFn: (url: string) => Promise<Response>;
  counts: Record<string, number>;
} {
  const counts: Record<string, number> = {};
  const fetchFn = (url: string): Promise<Response> => {
    counts[url] = (counts[url] ?? 0) + 1;
    const body =
      url.endsWith(CHAMPION_VOICES_PATH) ? opts.config
      : url.endsWith(BLIZZARD_MANIFEST_PATH) ? opts.manifest
      : undefined;
    if (body === undefined) return Promise.resolve({ ok: false, status: 404 } as Response);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);
  };
  return { fetchFn, counts };
}

function build(opts: {
  audio?: VoiceAudioPort;
  config?: unknown;
  manifest?: unknown;
  now?: () => number;
  rng?: () => number;
  blizzardFallback?: boolean;
}): { player: ChampionVoicePlayer; counts: Record<string, number> } {
  const { fetchFn, counts } = stubFetch({ config: opts.config, manifest: opts.manifest });
  const player = new ChampionVoicePlayer({
    audio: opts.audio ?? stubAudio().audio,
    fetchFn,
    now: opts.now ?? (() => 0),
    rng: opts.rng ?? (() => 0),
    blizzardFallback: opts.blizzardFallback ?? true,
    warn: () => {},
  });
  return { player, counts };
}

// ---------------------------------------------------------------------------
// authored select clips
// ---------------------------------------------------------------------------

describe("champion select voice — authored clips (voice-select-config)", () => {
  it("plays a random select clip from the config through playClip", async () => {
    cover("voice-select-config");
    const { audio, played } = stubAudio();
    const { player } = build({ audio, config: CONFIG, rng: () => 0 });
    await expect(player.playSelect("sela")).resolves.toBe(true);
    expect(played).toEqual(["assets/audio/voice/sela-sel1.mp3"]);
  });

  it("rng drives the pick: high rng takes the last clip", async () => {
    cover("voice-select-config");
    const { audio, played } = stubAudio();
    const { player } = build({ audio, config: CONFIG, rng: () => 0.999 });
    await player.playSelect("sela");
    expect(played).toEqual(["assets/audio/voice/sela-sel2.mp3"]);
  });

  it("caches the config fetch: many loads/plays → ONE request", async () => {
    cover("voice-select-config");
    const { audio } = stubAudio();
    let t = 0;
    const { player, counts } = build({ audio, config: CONFIG, now: () => t });
    await player.load();
    await player.load();
    await player.playSelect("sela");
    t += SELECT_VOICE_COOLDOWN_MS;
    await player.playSelect("sela");
    const configUrls = Object.keys(counts).filter((u) => u.endsWith(CHAMPION_VOICES_PATH));
    expect(configUrls).toHaveLength(1);
    expect(counts[configUrls[0]!]).toBe(1);
  });

  it("normalizes absolute-mount spellings onto the content-relative path", async () => {
    cover("voice-select-config");
    const { audio, played } = stubAudio();
    const { player } = build({
      audio,
      config: { champions: { sela: { select: ["/content/assets/audio/voice/x.mp3"], source: "map-quip", soundset: null } } },
    });
    await player.playSelect("sela");
    expect(played).toEqual(["assets/audio/voice/x.mp3"]);
  });
});

// ---------------------------------------------------------------------------
// cooldown gating
// ---------------------------------------------------------------------------

describe("champion select voice — cooldown (voice-select-cooldown)", () => {
  it("a second click inside ~2.5 s is silent; after the window it speaks again", async () => {
    cover("voice-select-cooldown");
    let t = 1000;
    const { audio, played } = stubAudio();
    const { player } = build({ audio, config: CONFIG, now: () => t });
    await expect(player.playSelect("sela")).resolves.toBe(true);
    t += SELECT_VOICE_COOLDOWN_MS - 1;
    await expect(player.playSelect("sela")).resolves.toBe(false); // still cooling
    t += 1; // exactly the cooldown boundary
    await expect(player.playSelect("sela")).resolves.toBe(true);
    expect(played).toHaveLength(2);
  });

  it("cooldowns are PER champion — another hero speaks immediately", async () => {
    cover("voice-select-cooldown");
    const { audio, played } = stubAudio();
    const { player } = build({ audio, config: CONFIG, now: () => 0 });
    await expect(player.playSelect("sela")).resolves.toBe(true);
    await expect(player.playSelect("thorne")).resolves.toBe(true);
    await expect(player.playSelect("sela")).resolves.toBe(false);
    expect(played).toEqual([
      "assets/audio/voice/sela-sel1.mp3",
      "assets/audio/voice/thorne-sel1.mp3",
    ]);
  });

  it("the slot is reserved synchronously: a same-frame double-click is one voice", async () => {
    cover("voice-select-cooldown");
    const { audio, played } = stubAudio();
    const { player } = build({ audio, config: CONFIG, now: () => 0 });
    const [a, b] = await Promise.all([player.playSelect("sela"), player.playSelect("sela")]);
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect(played).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// unlock + mute gates
// ---------------------------------------------------------------------------

describe("champion select voice — unlock/mute gates (voice-select-gates)", () => {
  it("no-ops while the mixer is autoplay-locked, WITHOUT burning the cooldown", async () => {
    cover("voice-select-gates");
    const { audio, played, state } = stubAudio({ unlocked: false });
    const { player } = build({ audio, config: CONFIG, now: () => 0 });
    await expect(player.playSelect("sela")).resolves.toBe(false);
    expect(played).toHaveLength(0);
    state.unlocked = true; // first gesture arrives — same timestamp still plays
    await expect(player.playSelect("sela")).resolves.toBe(true);
  });

  it("respects the SFX mute and the master mute (cooldown not burned)", async () => {
    cover("voice-select-gates");
    const { audio, played, state } = stubAudio({ sfxMuted: true });
    const { player } = build({ audio, config: CONFIG, now: () => 0 });
    await expect(player.playSelect("sela")).resolves.toBe(false);
    state.sfxMuted = false;
    state.muted = true;
    await expect(player.playSelect("sela")).resolves.toBe(false);
    expect(played).toHaveLength(0);
    state.muted = false; // unmute → speaks right away (no cooldown burned)
    await expect(player.playSelect("sela")).resolves.toBe(true);
    expect(played).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// blizzard-local fallback + silent degradation
// ---------------------------------------------------------------------------

describe("champion select voice — soundset fallback (voice-blizzard-fallback)", () => {
  it('source:"none" probes the manifest and plays a random clips.what path', async () => {
    cover("voice-blizzard-fallback");
    const { audio, played } = stubAudio();
    const { player } = build({ audio, config: CONFIG, manifest: MANIFEST, rng: () => 0.6 });
    await expect(player.playSelect("uther")).resolves.toBe(true);
    expect(played).toEqual(["assets/blizzard-local/sound/hpal-what2.mp3"]);
  });

  it("the manifest probe is a single cached fetch across clicks", async () => {
    cover("voice-blizzard-fallback");
    const { audio } = stubAudio();
    let t = 0;
    const { player, counts } = build({ audio, config: CONFIG, manifest: MANIFEST, now: () => t });
    await player.playSelect("uther");
    t += SELECT_VOICE_COOLDOWN_MS;
    await player.playSelect("uther");
    const manifestUrls = Object.keys(counts).filter((u) => u.endsWith(BLIZZARD_MANIFEST_PATH));
    expect(manifestUrls).toHaveLength(1);
    expect(counts[manifestUrls[0]!]).toBe(1);
  });

  it("fallback disabled (prod build) → source:none stays silent, manifest never fetched", async () => {
    cover("voice-blizzard-fallback");
    const { audio, played } = stubAudio();
    const { player, counts } = build({
      audio,
      config: CONFIG,
      manifest: MANIFEST,
      blizzardFallback: false,
    });
    await expect(player.playSelect("uther")).resolves.toBe(false);
    expect(played).toHaveLength(0);
    expect(Object.keys(counts).some((u) => u.endsWith(BLIZZARD_MANIFEST_PATH))).toBe(false);
  });

  it("missing config AND missing manifest (both 404) → silent no-op, no throw", async () => {
    cover("voice-blizzard-fallback");
    const { audio, played } = stubAudio();
    const { player } = build({ audio }); // neither file served
    await expect(player.playSelect("sela")).resolves.toBe(false);
    expect(played).toHaveLength(0);
  });

  it("manifest 404 with source:none → silence; garbage docs parse to null", async () => {
    cover("voice-blizzard-fallback");
    const { audio, played } = stubAudio();
    const { player } = build({ audio, config: CONFIG }); // manifest 404s
    await expect(player.playSelect("uther")).resolves.toBe(false);
    expect(played).toHaveLength(0);
    expect(championVoicesFromDoc(null)).toBeNull();
    expect(championVoicesFromDoc({ nope: 1 })).toBeNull();
    expect(blizzardManifestFromDoc("x")).toBeNull();
    expect(blizzardManifestFromDoc({ units: 3 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

describe("champion voice pure helpers (voice-select-config)", () => {
  it("pickVoiceClip is uniform-indexed and empty-safe; whatClips finds by champId", () => {
    cover("voice-select-config");
    expect(pickVoiceClip([], () => 0.5)).toBeNull();
    expect(pickVoiceClip(["a", "b", "c"], () => 0)).toBe("a");
    expect(pickVoiceClip(["a", "b", "c"], () => 0.99)).toBe("c");
    const manifest = blizzardManifestFromDoc(MANIFEST)!;
    expect(blizzardWhatClips(manifest, "uther")).toEqual(MANIFEST.units.Hpal.clips.what);
    expect(blizzardWhatClips(manifest, "sela")).toEqual([]);
    expect(blizzardWhatClips(null, "uther")).toEqual([]);
    expect(normalizeClipPath("content/assets/a.mp3")).toBe("assets/a.mp3");
    expect(normalizeClipPath("/assets/a.mp3")).toBe("assets/a.mp3");
    expect(normalizeClipPath("  ")).toBeNull();
    expect(normalizeClipPath(null)).toBeNull();
  });
});

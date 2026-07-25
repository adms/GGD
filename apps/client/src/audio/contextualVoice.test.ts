/**
 * contextualVoice — the event→category combat-voice dispatcher. Covers the
 * three properties the task pins: (1) no spam (per-category / per-champ / global
 * throttle), (2) all mixer gates inherited (unlock / mute / test-silence → no
 * play, no cooldown burn), (3) fall-through — an absent pack or an unpacked
 * champion / category no-ops instead of throwing.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ContextualVoicePlayer, policyFor } from "./contextualVoice";
import type { ChampionVoicePack } from "./selectVoiceLadder";
import type { VoiceAudioPort } from "./championVoice";
import type { SfxPlayOptions } from "./AudioSystem";

function clip(name: string) {
  return { clip: name, text: "", lang: "ja", durationSec: 1, speakerSim: null };
}

const PACK: ChampionVoicePack = {
  champions: {
    "godie-e001": {
      engine: "cosyvoice3",
      variant: "cv3-0.5b",
      lines: {
        "skill-name.q": [clip("assets/audio/voices/lines/godie-e001/skill-name.q.mp3")],
        crit: [clip("assets/audio/voices/lines/godie-e001/crit.mp3")],
        hurt: [clip("assets/audio/voices/lines/godie-e001/hurt.mp3")],
        "hurt-heavy": [clip("assets/audio/voices/lines/godie-e001/hurt-heavy.mp3")],
        "kill-1": [clip("assets/audio/voices/lines/godie-e001/kill-1.mp3")],
        "first-blood": [clip("assets/audio/voices/lines/godie-e001/first-blood.mp3")],
        victory: [clip("assets/audio/voices/lines/godie-e001/victory.mp3")],
        stun: [clip("assets/audio/voices/lines/godie-e001/stun.mp3")],
      },
    },
  },
};

/** Fake mixer port that records every playClip and lets tests flip the gates. */
class FakeAudio implements VoiceAudioPort {
  isUnlocked = true;
  muted = false;
  sfxMuted = false;
  played: string[] = [];
  volumes(): { muted: boolean; sfxMuted?: boolean } {
    return { muted: this.muted, sfxMuted: this.sfxMuted };
  }
  playClip(path: string, _opts?: SfxPlayOptions): boolean {
    this.played.push(path);
    return true;
  }
}

function make(now: () => number, rng: () => number = () => 0) {
  const audio = new FakeAudio();
  const player = new ContextualVoicePlayer({
    audio,
    now,
    rng,
    packLoader: () => Promise.resolve(PACK),
  });
  return { audio, player };
}

describe("contextualVoice throttle + gates", () => {
  let t = 0;
  const now = () => t;
  beforeEach(() => {
    t = 0;
  });

  it("fires a category clip once the pack is warm", async () => {
    cover("contextual-voice");
    const { audio, player } = make(now);
    await player.warm();
    expect(player.playContextual("godie-e001", "crit")).toBe(true);
    expect(audio.played).toEqual(["assets/audio/voices/lines/godie-e001/crit.mp3"]);
  });

  it("no-ops (no throw) when the pack is not warmed yet", () => {
    cover("contextual-voice");
    const { audio, player } = make(now);
    expect(player.playContextual("godie-e001", "crit")).toBe(false);
    expect(audio.played).toEqual([]);
  });

  it("no-ops for a champion / category absent from the pack", async () => {
    cover("contextual-voice");
    const { audio, player } = make(now);
    await player.warm();
    expect(player.playContextual("godie-zzzz", "crit")).toBe(false); // unpacked hero
    expect(player.playContextual("godie-e001", "poison")).toBe(false); // dormant category
    expect(audio.played).toEqual([]);
  });

  it("hurt fires at most once per 1.5 s (spec: an auto every 0.7 s must NOT grunt every hit)", async () => {
    cover("contextual-voice");
    const { audio, player } = make(now, () => 0); // rng 0 always passes prob 0.35
    await player.warm();
    // t=0 hurt fires; t=700 blocked (cooldown 1500); t=1600 fires again.
    expect(player.playContextual("godie-e001", "hurt")).toBe(true);
    t = 700;
    expect(player.playContextual("godie-e001", "hurt")).toBe(false);
    t = 1600;
    expect(player.playContextual("godie-e001", "hurt")).toBe(true);
    expect(audio.played).toHaveLength(2);
  });

  it("celebratory kill lines preempt the global one-voice-per-beat gap", async () => {
    cover("contextual-voice");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    // A normal cast at t=0 takes the global slot...
    expect(player.playContextual("godie-e001", "skill-name.q")).toBe(true);
    t = 100; // well inside GLOBAL_MIN_GAP_MS (1200)
    // ...a normal crit is throttled by the global gap...
    expect(player.playContextual("godie-e001", "crit")).toBe(false);
    // ...but a kill line preempts it and is always heard.
    expect(player.playContextual("godie-e001", "kill-1")).toBe(true);
    expect(player.playContextual("godie-e001", "first-blood")).toBe(true);
    expect(audio.played).toContain("assets/audio/voices/lines/godie-e001/kill-1.mp3");
    expect(audio.played).toContain("assets/audio/voices/lines/godie-e001/first-blood.mp3");
  });

  it("the per-category probability gate blocks when the rng roll fails", async () => {
    cover("contextual-voice");
    // crit prob is 0.25 → an rng of 0.9 fails the roll and nothing plays.
    const { audio, player } = make(now, () => 0.9);
    await player.warm();
    expect(player.playContextual("godie-e001", "crit")).toBe(false);
    expect(audio.played).toEqual([]);
  });

  it("inherits the mute gate — a muted session plays nothing and burns no cooldown", async () => {
    cover("contextual-voice");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    audio.sfxMuted = true;
    expect(player.playContextual("godie-e001", "crit")).toBe(false);
    audio.sfxMuted = false;
    // cooldown was NOT burned while muted → it fires immediately now.
    expect(player.playContextual("godie-e001", "crit")).toBe(true);
    expect(audio.played).toHaveLength(1);
  });

  it("inherits the unlock gate — a locked mixer plays nothing", async () => {
    cover("contextual-voice");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    audio.isUnlocked = false;
    expect(player.playContextual("godie-e001", "kill-1")).toBe(false); // even celebratory
    expect(audio.played).toEqual([]);
  });
});

describe("policyFor", () => {
  it("maps each dispatched category to its tuning", () => {
    cover("contextual-voice");
    expect(policyFor("skill-name.q").cooldownMs).toBe(3000);
    expect(policyFor("skill-name.ex").prob).toBe(0.5);
    expect(policyFor("kill-3").preempt).toBe(true);
    expect(policyFor("first-blood").preempt).toBe(true);
    expect(policyFor("unstoppable").preempt).toBe(true);
    expect(policyFor("crit").prob).toBe(0.25);
    // hurt + hurt-heavy share one cooldown bucket so heavy preempts light.
    expect(policyFor("hurt").bucket).toBe("hurt");
    expect(policyFor("hurt-heavy").bucket).toBe("hurt");
    expect(policyFor("stun").prob).toBe(0.6);
  });
});

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
        // Tier-1 categories, incl. a 2-variant set for the de-dup re-roll test.
        "attack-light": [
          clip("assets/audio/voices/lines/godie-e001/attack-light.0.mp3"),
          clip("assets/audio/voices/lines/godie-e001/attack-light.1.mp3"),
        ],
        "attack-heavy": [clip("assets/audio/voices/lines/godie-e001/attack-heavy.mp3")],
        block: [clip("assets/audio/voices/lines/godie-e001/block.mp3")],
        dodge: [clip("assets/audio/voices/lines/godie-e001/dodge.mp3")],
        sprint: [clip("assets/audio/voices/lines/godie-e001/sprint.mp3")],
        healed: [clip("assets/audio/voices/lines/godie-e001/healed.mp3")],
        hum: [clip("assets/audio/voices/lines/godie-e001/hum.mp3")],
        curse: [clip("assets/audio/voices/lines/godie-e001/curse.mp3")],
        quote: [clip("assets/audio/voices/lines/godie-e001/quote.mp3")],
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
  /** the still-sounding clips' onEnded callbacks, keyed by src (de-dup tests). */
  pending = new Map<string, () => void>();
  /** when true, playClip refuses (returns false) without recording. */
  refuse = false;
  volumes(): { muted: boolean; sfxMuted?: boolean } {
    return { muted: this.muted, sfxMuted: this.sfxMuted };
  }
  playClip(path: string, opts?: SfxPlayOptions): boolean {
    if (this.refuse) return false;
    this.played.push(path);
    if (opts?.onEnded) this.pending.set(path, opts.onEnded);
    return true;
  }
  /** Simulate a clip finishing — fires its onEnded so the de-dup entry clears. */
  finish(path: string): void {
    const cb = this.pending.get(path);
    if (cb) {
      this.pending.delete(path);
      cb();
    }
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
    const hurtClip = "assets/audio/voices/lines/godie-e001/hurt.mp3";
    // t=0 hurt fires; t=700 blocked (cooldown 1500); t=1600 fires again.
    expect(player.playContextual("godie-e001", "hurt")).toBe(true);
    audio.finish(hurtClip); // the ~1 s grunt ends before the next hit's window
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

  it("a champion with NO kill pack falls through silently (#234)", async () => {
    cover("contextual-voice");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    // 63 of the 114 champion docs have no generated pack at all, and even a
    // packed champion may be missing a category. Every kill category must be a
    // silent no-op for them — never a throw, and never another hero's voice.
    for (const cat of [
      "first-blood",
      "kill-1",
      "kill-2",
      "kill-3",
      "kill-4",
      "kill-5",
      "unstoppable",
    ]) {
      expect(player.playContextual("godie-nopack", cat)).toBe(false);
    }
    // the packed champion is missing kill-2..kill-5 / unstoppable in this
    // fixture: those fall through too, while the ones it HAS still fire.
    for (const cat of ["kill-2", "kill-3", "unstoppable"]) {
      expect(player.playContextual("godie-e001", cat)).toBe(false);
    }
    expect(audio.played).toEqual([]); // nothing substituted, nothing borrowed
    expect(player.playContextual("godie-e001", "kill-1")).toBe(true);
    expect(audio.played).toEqual(["assets/audio/voices/lines/godie-e001/kill-1.mp3"]);
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

  it("attack-light is deliberately low-prob + high-cooldown (owner hard rule)", () => {
    cover("contextual-voice");
    // A basic auto fires WINDUP ~1.4×/s; only a tiny prob + a long cooldown keep
    // it from washing the channel. This is the load-bearing tuning of T1.
    expect(policyFor("attack-light").prob).toBe(0.08);
    expect(policyFor("attack-light").cooldownMs).toBe(12000);
    expect(policyFor("attack-light").preempt).toBe(false);
  });

  it("gives every new T1 category a policy (none fall through to a surprise)", () => {
    cover("contextual-voice");
    for (const cat of [
      "quote",
      "attack-light",
      "attack-heavy",
      "block",
      "dodge",
      "sprint",
      "healed",
      "hum",
      "curse",
    ]) {
      const p = policyFor(cat);
      expect(p.prob).toBeGreaterThan(0);
      expect(p.prob).toBeLessThanOrEqual(1);
      expect(p.preempt).toBe(false); // no T1 line preempts the celebratory lock
    }
  });
});

describe("Tier-1 categories + anti-pollution (voice-binding-design.md §三)", () => {
  let t = 0;
  const now = () => t;
  beforeEach(() => {
    t = 0;
  });

  it("dispatches each new T1 category on its signal (rng passes every roll)", async () => {
    cover("contextual-voice");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    // one category per global beat — advance past the 1.5 s champ gap each time.
    for (const cat of ["attack-heavy", "block", "dodge", "sprint", "healed", "curse", "quote"]) {
      expect(player.playContextual("godie-e001", cat)).toBe(true);
      t += 2_000;
    }
    expect(audio.played).toHaveLength(7);
  });

  it("a basic-attack burst does NOT wash: attack-light stays throttled", async () => {
    cover("contextual-voice");
    // rng 0 always passes the 0.08 prob, so ONLY the 12 s cooldown gates it —
    // this proves the throttle, not luck, keeps a ~0.7 s auto from shouting.
    const { audio, player } = make(now, () => 0);
    await player.warm();
    let fired = 0;
    // 20 windups over 14 s (a windup ~every 0.7 s) → at most two lines.
    for (let i = 0; i < 20; i++) {
      if (player.playContextual("godie-e001", "attack-light")) fired++;
      t += 700;
    }
    expect(fired).toBeLessThanOrEqual(2);
  });

  it("the SAME clip never overlaps itself, and clears on onEnded so it can replay", async () => {
    cover("contextual-voice");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    // t=0: attack-heavy fires and is now in-flight.
    expect(player.playContextual("godie-e001", "attack-heavy")).toBe(true);
    const clipPath = "assets/audio/voices/lines/godie-e001/attack-heavy.mp3";
    expect(audio.played).toEqual([clipPath]);
    // t=4000: past every throttle (cd 3000), but the clip is STILL sounding →
    // the in-flight de-dup skips it (no overlap, no second copy).
    t = 4_000;
    expect(player.playContextual("godie-e001", "attack-heavy")).toBe(false);
    expect(audio.played).toHaveLength(1);
    // the clip finishes → its activeClips entry clears.
    audio.finish(clipPath);
    // t=8000: past throttle AND no longer in-flight → it can play again.
    t = 8_000;
    expect(player.playContextual("godie-e001", "attack-heavy")).toBe(true);
    expect(audio.played).toEqual([clipPath, clipPath]);
  });

  it("a de-dup skip does NOT burn throttle state", async () => {
    cover("contextual-voice");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    const clipPath = "assets/audio/voices/lines/godie-e001/attack-heavy.mp3";
    // t=0: real play — throttle (global/champ/cooldown) is committed at t=0.
    expect(player.playContextual("godie-e001", "attack-heavy")).toBe(true);
    // t=4000: still in-flight → de-dup SKIP. If the skip wrongly burned throttle,
    // it would stamp the cooldowns at 4000.
    t = 4_000;
    expect(player.playContextual("godie-e001", "attack-heavy")).toBe(false);
    // clip ends; only 300 ms after the skip.
    audio.finish(clipPath);
    t = 4_300;
    // 4300 ms since the ONLY real play (t=0) — past every gap/cooldown, so this
    // fires. It could only be blocked if the t=4000 skip had stamped the champ
    // gap (4300-4000 = 300 < 1500). It plays → the skip preserved throttle.
    expect(player.playContextual("godie-e001", "attack-heavy")).toBe(true);
    expect(audio.played).toEqual([clipPath, clipPath]);
  });

  it("a synchronously-refused play does not leak an activeClips entry", async () => {
    cover("contextual-voice");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    audio.refuse = true;
    // play refused (returns false) — the entry must be released, not left stuck.
    expect(player.playContextual("godie-e001", "block")).toBe(false);
    audio.refuse = false;
    t = 4_000; // past the block cooldown
    // if the refused call had leaked, this would be de-dup-skipped; it must play.
    expect(player.playContextual("godie-e001", "block")).toBe(true);
    expect(audio.played).toEqual(["assets/audio/voices/lines/godie-e001/block.mp3"]);
  });

  it("reset() clears the in-flight de-dup set", async () => {
    cover("contextual-voice");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    expect(player.playContextual("godie-e001", "dodge")).toBe(true);
    // reset drops everything incl. the pack, so re-warm before replaying.
    player.reset();
    await player.warm();
    t = 4_000;
    // the dodge clip is no longer tracked as in-flight → plays again cleanly.
    expect(player.playContextual("godie-e001", "dodge")).toBe(true);
    expect(audio.played).toHaveLength(2);
  });
});

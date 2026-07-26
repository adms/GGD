/**
 * voiceAudience — the #223 fix, proved end to end.
 *
 * The owner's report was 「敵人被我攻擊沒發出受傷或死亡等語音」: hurt / hurt-heavy /
 * defeat were hard-gated to `target === localId`, so the arena only ever spoke
 * in your own voice. These tests pin the four properties the fix has to hold:
 *
 *   1. an ENEMY taking damage DOES produce a hurt line — for the ENEMY's
 *      champion, not yours (the actual bug);
 *   2. a KILLING BLOW on an enemy produces `defeat` for THAT champion;
 *   3. a burst of damage across many bodies does NOT exceed the throttle — a
 *      widened audience must not become a cacophony;
 *   4. the same clip never overlaps itself.
 *
 * They run the REAL ContextualVoicePlayer against the same FakeAudio port
 * contextualVoice.test.ts uses, so "dispatches" here means "was handed to the
 * mixer", not "a branch exists". The GameApp glue that feeds these functions is
 * pinned separately by GameApp.voiceWiring.test.ts (GameApp cannot be
 * instantiated headlessly).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ContextualVoicePlayer } from "./contextualVoice";
import {
  damageVoiceCandidate,
  deathVoiceCandidate,
  orderVoiceCandidates,
  voiceAudienceOf,
  voiceProbScale,
  voicePriority,
  VOICE_FAR,
  type VoiceCandidate,
} from "./voiceAudience";
import type { ChampionVoicePack } from "./selectVoiceLadder";
import type { VoiceAudioPort } from "./championVoice";
import type { SfxPlayOptions } from "./AudioSystem";

// ── fixture ────────────────────────────────────────────────────────────────
// A full 12-body arena: entity id 10 is the local player, 11..15 are teammates,
// 20..25 are enemies. Champion ids are 1:1 with entity ids so a played clip path
// names the champion that spoke, which is the whole point of test 1 and 2.
const LOCAL = 10;
const ALLY = 11;
const ENEMY = 20;
const OTHER_ENEMY = 21;
const OTHER_ALLY = 12;

const ENTITIES = [10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25];
const champOf = (id: number): string => `godie-e${id}`;
const TEAM_OF = (id: number): number | null => (id < 20 ? 0 : 1);

function clip(name: string) {
  return { clip: name, text: "", lang: "ja", durationSec: 1, speakerSim: null };
}
function src(id: number, cat: string): string {
  return `assets/audio/voices/lines/${champOf(id)}/${cat}.mp3`;
}

const PACK: ChampionVoicePack = {
  champions: Object.fromEntries(
    ENTITIES.map((id) => [
      champOf(id),
      {
        engine: "cosyvoice3",
        variant: "cv3-0.5b",
        // its OWN pack, not borrowed across a 變身 form link (see resolveVoicePackId)
        sharedFrom: null,
        lines: {
          hurt: [clip(src(id, "hurt"))],
          "hurt-heavy": [clip(src(id, "hurt-heavy"))],
          defeat: [clip(src(id, "defeat"))],
          crit: [clip(src(id, "crit"))],
        },
      },
    ]),
  ),
};

/** Fake mixer port (same shape as contextualVoice.test.ts). */
class FakeAudio implements VoiceAudioPort {
  isUnlocked = true;
  muted = false;
  sfxMuted = false;
  played: string[] = [];
  pending = new Map<string, () => void>();
  volumes(): { muted: boolean; sfxMuted?: boolean } {
    return { muted: this.muted, sfxMuted: this.sfxMuted };
  }
  playClip(path: string, opts?: SfxPlayOptions): boolean {
    this.played.push(path);
    if (opts?.onEnded) this.pending.set(path, opts.onEnded);
    return true;
  }
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

/** The GameApp flush, minus GameApp: order the frame's lines, then dispatch. */
function flush(player: ContextualVoicePlayer, cands: readonly (VoiceCandidate | null)[]): number {
  let fired = 0;
  for (const c of orderVoiceCandidates(cands.filter((c): c is VoiceCandidate => c !== null))) {
    if (player.playContextual(c.champId, c.category, { probScale: c.probScale, preempt: c.preempt }))
      fired++;
  }
  return fired;
}

/** A damage packet landing on `victim`, dealt by `attacker`. */
function hit(
  victim: number,
  attacker: number,
  opts: { amount?: number; maxHp?: number; killingBlow?: boolean; distance?: number } = {},
) {
  return damageVoiceCandidate({
    champId: champOf(victim),
    speaker: victim,
    counterpart: attacker,
    localId: LOCAL,
    teamOf: TEAM_OF,
    amount: opts.amount ?? 40,
    victimMaxHp: opts.maxHp ?? 1_000,
    killingBlow: opts.killingBlow ?? false,
    distance: opts.distance ?? 3,
  });
}

// ── 1. the bug the owner filed ─────────────────────────────────────────────
describe("#223 an enemy taking damage DOES dispatch hurt", () => {
  let t = 0;
  const now = () => t;
  beforeEach(() => {
    t = 0;
  });

  it("the ENEMY's own champion grunts when the local player hits it", async () => {
    cover("voice-audience-223");
    const { audio, player } = make(now);
    await player.warm();
    const c = hit(ENEMY, LOCAL);
    // The old code produced NOTHING here: target !== localId was the whole gate.
    expect(c).not.toBeNull();
    expect(c!.champId).toBe(champOf(ENEMY)); // the victim speaks, not the attacker
    expect(c!.category).toBe("hurt");
    expect(c!.audience).toBe("engaged"); // you are the other end of this event
    expect(flush(player, [c])).toBe(1);
    expect(audio.played).toEqual([src(ENEMY, "hurt")]);
  });

  it("an ALLY being hit by an enemy also speaks (the gate hid them too)", async () => {
    cover("voice-audience-223");
    const { audio, player } = make(now);
    await player.warm();
    const c = damageVoiceCandidate({
      champId: champOf(ALLY),
      speaker: ALLY,
      counterpart: ENEMY,
      localId: LOCAL,
      teamOf: TEAM_OF,
      amount: 40,
      victimMaxHp: 1_000,
      killingBlow: false,
      distance: 4,
    });
    expect(c!.audience).toBe("ally"); // neither party is you → background band
    expect(flush(player, [c])).toBe(1);
    expect(audio.played).toEqual([src(ALLY, "hurt")]);
  });

  it("your OWN grunt is unchanged: full probability, top band", () => {
    cover("voice-audience-223");
    const c = hit(LOCAL, ENEMY);
    expect(c!.audience).toBe("self");
    expect(c!.probScale).toBe(1); // never de-weighted, never distance-damped
    expect(c!.priority).toBeGreaterThan(hit(ENEMY, LOCAL)!.priority);
  });

  it("heavy/light is judged against the VICTIM'S max hp, not the local hero's", () => {
    cover("voice-audience-223");
    // 300 damage is a chip on a 3000-hp bruiser and a near-execute on a 1000-hp
    // squishy. Reading the local player's max hp (the old code) got both wrong
    // the moment the victim was not you.
    expect(hit(ENEMY, LOCAL, { amount: 300, maxHp: 3_000 })!.category).toBe("hurt");
    expect(hit(ENEMY, LOCAL, { amount: 300, maxHp: 1_000 })!.category).toBe("hurt-heavy");
    // a killing blow is always heavy, whatever the fraction
    expect(hit(ENEMY, LOCAL, { amount: 1, maxHp: 3_000, killingBlow: true })!.category).toBe(
      "hurt-heavy",
    );
  });

  it("a non-champion victim (mob / guardian / flower) stays silent, never throws", () => {
    cover("voice-audience-223");
    expect(
      damageVoiceCandidate({
        champId: null, // championIdForEntity returns null for #215 喪標麥可 etc.
        speaker: 999,
        counterpart: LOCAL,
        localId: LOCAL,
        teamOf: TEAM_OF,
        amount: 40,
        victimMaxHp: 500,
        killingBlow: false,
        distance: 2,
      }),
    ).toBeNull();
  });

  it("a zero-damage packet says nothing (absorbed / 0-roll hits)", () => {
    cover("voice-audience-223");
    expect(hit(ENEMY, LOCAL, { amount: 0 })).toBeNull();
  });
});

// ── 2. the death cry ───────────────────────────────────────────────────────
describe("#223 a killing blow on an enemy dispatches defeat for THAT champion", () => {
  let t = 0;
  const now = () => t;
  beforeEach(() => {
    t = 0;
  });

  it("the enemy YOU killed cries out in its own voice", async () => {
    cover("voice-audience-223");
    const { audio, player } = make(now);
    await player.warm();
    const d = deathVoiceCandidate({
      champId: champOf(ENEMY),
      speaker: ENEMY,
      counterpart: LOCAL, // DeathSystem's `killer`
      localId: LOCAL,
      teamOf: TEAM_OF,
      distance: 4,
    });
    expect(d!.champId).toBe(champOf(ENEMY));
    expect(d!.category).toBe("defeat");
    expect(d!.audience).toBe("engaged");
    expect(flush(player, [d])).toBe(1);
    expect(audio.played).toEqual([src(ENEMY, "defeat")]);
  });

  it("that cry PREEMPTS the global gap, so the kill you made is never swallowed", async () => {
    cover("voice-audience-223");
    const { audio, player } = make(now);
    await player.warm();
    // A grunt takes the arena-wide 1.2 s slot at t=0 …
    expect(flush(player, [hit(OTHER_ENEMY, OTHER_ALLY, { distance: 6 })])).toBe(1);
    t = 200; // … well inside GLOBAL_MIN_GAP_MS …
    // … and your kill still lands, because defeat preempts for self/engaged.
    const d = deathVoiceCandidate({
      champId: champOf(ENEMY),
      speaker: ENEMY,
      counterpart: LOCAL,
      localId: LOCAL,
      teamOf: TEAM_OF,
      distance: 4,
    });
    expect(d!.preempt).toBe(true);
    expect(flush(player, [d])).toBe(1);
    expect(audio.played).toContain(src(ENEMY, "defeat"));
  });

  it("a STRANGER's death does not preempt — only lines about you jump the queue", () => {
    cover("voice-audience-223");
    const d = deathVoiceCandidate({
      champId: champOf(OTHER_ENEMY),
      speaker: OTHER_ENEMY,
      counterpart: OTHER_ALLY, // someone else's kill, elsewhere
      localId: LOCAL,
      teamOf: TEAM_OF,
      distance: 12,
    });
    expect(d!.audience).toBe("enemy");
    expect(d!.preempt).toBe(false);
  });

  it("your own death is still the top band", () => {
    cover("voice-audience-223");
    const d = deathVoiceCandidate({
      champId: champOf(LOCAL),
      speaker: LOCAL,
      counterpart: ENEMY,
      localId: LOCAL,
      teamOf: TEAM_OF,
      distance: 0,
    });
    expect(d!.audience).toBe("self");
    expect(d!.preempt).toBe(true);
  });
});

// ── 3. no cacophony ────────────────────────────────────────────────────────
describe("#223 a burst across many entities does NOT exceed the throttle", () => {
  let t = 0;
  const now = () => t;
  beforeEach(() => {
    t = 0;
  });

  it("12 bodies trading blows for 6 s cannot exceed one line per 1.2 s", async () => {
    cover("voice-audience-223");
    // rng 0 passes EVERY probability roll, so nothing here is luck: what caps
    // the channel is the throttle, exactly as it must in a real teamfight.
    const { audio, player } = make(now, () => 0);
    await player.warm();
    let fired = 0;
    // 60 frames × 100 ms: every champion is hit by an enemy every frame.
    for (let frame = 0; frame < 60; frame++) {
      const cands = ENTITIES.map((victim) =>
        damageVoiceCandidate({
          champId: champOf(victim),
          speaker: victim,
          counterpart: victim < 20 ? ENEMY : ALLY,
          localId: LOCAL,
          teamOf: TEAM_OF,
          amount: 40,
          victimMaxHp: 1_000,
          killingBlow: false,
          distance: 5,
        }),
      );
      fired += flush(player, cands);
      t += 100;
    }
    // 720 damage packets. GLOBAL_MIN_GAP_MS = 1200 over 6 s → at most 6 lines.
    expect(fired).toBeLessThanOrEqual(6);
    expect(fired).toBeGreaterThan(0); // …and the fight is not SILENT either
    expect(audio.played).toHaveLength(fired);
  });

  it("the LOCAL player's own grunt wins the contested slot, not whoever drained first", async () => {
    cover("voice-audience-223");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    // Packet order deliberately puts three strangers BEFORE the local player:
    // unsorted, the first one would take the 1.2 s slot and yours would be lost.
    const cands = [
      hit(OTHER_ENEMY, OTHER_ALLY, { distance: 8 }),
      hit(OTHER_ALLY, OTHER_ENEMY, { distance: 9 }),
      hit(ENEMY, LOCAL, { distance: 3 }),
      hit(LOCAL, ENEMY, { distance: 0 }),
    ];
    flush(player, cands);
    expect(audio.played[0]).toBe(src(LOCAL, "hurt")); // self band goes first
  });

  it("distant unrelated champions are dropped outright, not merely quietened", () => {
    cover("voice-audience-223");
    // Past the far cutoff a stranger's line is NOT dispatched at all, so it can
    // never contest the global slot the near fight needs.
    expect(voiceProbScale("third", VOICE_FAR + 1)).toBe(0);
    expect(hit(OTHER_ENEMY, OTHER_ALLY, { distance: VOICE_FAR + 5 })).toBeNull();
    // …but your own reaction and your opponent's are never distance-culled.
    expect(voiceProbScale("self", 999)).toBe(1);
    expect(hit(ENEMY, LOCAL, { distance: 999 })).not.toBeNull();
  });

  it("the band ladder is strict: self > engaged > enemy > ally > third", () => {
    cover("voice-audience-223");
    // Bands never overlap, so a FAR line from a higher band still outranks a
    // point-blank one from a lower band (the SFX layer's rule, same reason).
    expect(voicePriority("self", 30)).toBeGreaterThan(voicePriority("engaged", 0));
    expect(voicePriority("engaged", 30)).toBeGreaterThan(voicePriority("enemy", 0));
    expect(voicePriority("enemy", 30)).toBeGreaterThan(voicePriority("ally", 0));
    expect(voicePriority("ally", 30)).toBeGreaterThan(voicePriority("third", 0));
    // probability is de-weighted the same way, and NEVER above 1 (this layer
    // only ducks; it can't make a line louder than the owner's own tuning).
    for (const a of ["self", "engaged", "enemy", "ally", "third"] as const) {
      expect(voiceProbScale(a, 0)).toBeGreaterThan(0);
      expect(voiceProbScale(a, 0)).toBeLessThanOrEqual(1);
    }
    expect(voiceProbScale("third", 0)).toBeLessThan(voiceProbScale("engaged", 0));
  });

  it("one champion says ONE thing per frame however many packets hit it", () => {
    cover("voice-audience-223");
    const cands = [
      hit(ENEMY, LOCAL, { distance: 9 }),
      hit(ENEMY, LOCAL, { distance: 3 }), // nearer → higher priority, wins
      hit(ENEMY, LOCAL, { distance: 7 }),
    ].filter((c): c is VoiceCandidate => c !== null);
    const ordered = orderVoiceCandidates(cands);
    expect(ordered).toHaveLength(1);
    expect(ordered[0]!.priority).toBe(Math.max(...cands.map((c) => c.priority)));
  });

  it("a dead/spectating player (localId null) hears an evenly quiet arena", () => {
    cover("voice-audience-223");
    // No body → no relation and no listener distance; everything demotes to the
    // quiet band rather than guessing which fight the spectator cares about.
    expect(
      voiceAudienceOf({ speaker: ENEMY, counterpart: ALLY, localId: null, teamOf: TEAM_OF }),
    ).toBe("third");
  });
});

// ── 4. the same clip never overlaps itself ─────────────────────────────────
describe("#223 the same clip never overlaps itself", () => {
  let t = 0;
  const now = () => t;
  beforeEach(() => {
    t = 0;
  });

  it("a widened enemy grunt still in flight is SKIPPED, and replays once it ends", async () => {
    cover("voice-audience-223");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    const clipPath = src(ENEMY, "hurt");
    expect(flush(player, [hit(ENEMY, LOCAL)])).toBe(1);
    expect(audio.played).toEqual([clipPath]);
    // t=4000 is past every throttle layer, but the clip is STILL sounding, so
    // the in-flight de-dup skips it — no overlap, no queued second copy.
    t = 4_000;
    expect(flush(player, [hit(ENEMY, LOCAL)])).toBe(0);
    expect(audio.played).toEqual([clipPath]);
    // it finishes → it can be heard again.
    audio.finish(clipPath);
    t = 8_000;
    expect(flush(player, [hit(ENEMY, LOCAL)])).toBe(1);
    expect(audio.played).toEqual([clipPath, clipPath]);
  });

  it("the de-dup is PER CLIP, so two DIFFERENT champions are capped by the global gap", async () => {
    cover("voice-audience-223");
    // Stated explicitly so the guarantee is not read as stronger than it is:
    // activeClips is keyed on the resolved src, which embeds the champion id, so
    // champion A's grunt and champion B's grunt are different entries and the
    // de-dup does NOT separate them. What keeps them from stacking is the
    // arena-wide 1.2 s gap — which is why widening the audience needed the
    // priority sort, not just the de-dup.
    const { audio, player } = make(now, () => 0);
    await player.warm();
    expect(flush(player, [hit(ENEMY, LOCAL), hit(OTHER_ENEMY, LOCAL)])).toBe(1);
    expect(audio.played).toHaveLength(1); // the second one lost the slot, not the de-dup
    t = 2_000; // past the global gap → the other champion is now audible
    expect(flush(player, [hit(OTHER_ENEMY, LOCAL)])).toBe(1);
    expect(audio.played).toHaveLength(2);
  });

  it("all mixer gates still apply to a widened line (#14 toggle / #62 silence / unlock)", async () => {
    cover("voice-audience-223");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    audio.sfxMuted = true;
    expect(flush(player, [hit(ENEMY, LOCAL)])).toBe(0);
    audio.isUnlocked = false;
    audio.sfxMuted = false;
    expect(flush(player, [hit(ENEMY, LOCAL)])).toBe(0);
    expect(audio.played).toEqual([]);
    // …and no cooldown was burnt while gated: it fires the moment it's allowed.
    audio.isUnlocked = true;
    expect(flush(player, [hit(ENEMY, LOCAL)])).toBe(1);
  });

  it("a champion with no voice pack falls through silently, never throws", async () => {
    cover("voice-audience-223");
    const { audio, player } = make(now, () => 0);
    await player.warm();
    const c = damageVoiceCandidate({
      champId: "godie-not-in-pack",
      speaker: 77,
      counterpart: LOCAL,
      localId: LOCAL,
      teamOf: TEAM_OF,
      amount: 40,
      victimMaxHp: 1_000,
      killingBlow: false,
      distance: 3,
    });
    expect(() => flush(player, [c])).not.toThrow();
    expect(audio.played).toEqual([]);
  });
});

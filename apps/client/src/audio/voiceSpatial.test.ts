/**
 * audio/voiceSpatial — GEOMETRY + THE OWNER'S RULE, asserted as numbers.
 *
 * "the voice is spatialised now" is not a claim a test can be built on: it stays
 * green with the sign inverted, with a width 100× too small to hear, and with
 * the whole field anchored to the wrong body. So every assertion below pins a
 * SIGN and a MAGNITUDE against hand-computable geometry, and the two design
 * constraints the owner stated in words are pinned as their own cases:
 *
 *   「只有自己的才是全播放」  → SELF is 1.0, un-panned, un-filtered, and — the
 *                              part that is easy to get wrong — INDEPENDENT OF
 *                              DISTANCE.
 *   「不可以把戰場弄安靜」    → the measured level of every OTHER band at real
 *                              engagement ranges, with a floor asserted rather
 *                              than described.
 *
 * ⚠️ **這個檔量的是幾何，⛔ 不是混音政策**（GH#339 之後）。`voiceSpatialMix` 現在
 * 會再乘上一個後台可調的「其他角色語音倍率」（出貨 0.5），所以下面每一個手算的
 * 幾何期望值都會被那一格等比縮放。⇒ `beforeEach` 把政策釘成 **1（＝不衰減）**，
 * 讓這裡的每一條斷言仍然在講它本來要講的那件事：**距離／關係／方向的法則**。
 * ⛔ 不要改成把 0.5 乘進 6 個期望值 —— 那會讓出貨數值在測試裡多一個沒有守衛的
 * 住處（第二守則：驗機制、不驗數字），而且 owner 每次調那一格都要改這個檔。
 * 倍率本身有它自己的守衛：`voiceOtherGain.test.ts`。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_AUDIO_MIX } from "@ggd/shared/content";
import { applyAudioMixDoc } from "./voiceMixPolicy";
import { cover } from "@ggd/shared/testkit/cover";
import {
  audienceToRelation,
  SELF_VOICE_MIX,
  voicePlayOptions,
  voiceSpatialMix,
} from "./voiceSpatial";
import {
  distanceGain,
  panForOffset,
  PAN_SKIP,
  RELATION_GAIN,
  VOICE_FAR,
  VOICE_NEAR,
  type SpatialListener,
} from "./spatial";
import { VOICE_FAR as AUDIENCE_VOICE_FAR, type VoiceAudience } from "./voiceAudience";

/**
 * 把 GH#339 的「其他角色語音倍率」釘成 1，這個檔才量得到**純幾何**。
 * ⚠️ 政策是模組級單例，⛔ 一定要每一條前面重設 —— 別的檔設過的值會漏過來。
 */
beforeEach(() => {
  applyAudioMixDoc({ ...DEFAULT_AUDIO_MIX, voice: { othersGain: 1 } });
});

/** Listener at the origin with both anchors coincident (normal combat). */
const AT_ORIGIN: SpatialListener = { levelX: 0, levelZ: 0, dirX: 0, dirZ: 0 };

const ALL: VoiceAudience[] = ["self", "engaged", "enemy", "ally", "third"];

function mixAt(audience: VoiceAudience, x: number, z = 0, l: SpatialListener = AT_ORIGIN) {
  return voiceSpatialMix(l, { category: "hurt", audience, pos: { x, z } });
}

// ---------------------------------------------------------------------------
// 「只有自己的才是全播放」
// ---------------------------------------------------------------------------

describe("SELF is full playback — the owner's rule, as a branch (voice-spatial-self)", () => {
  it("is exactly 1.0, centred and unfiltered", () => {
    cover("voice-spatial-self");
    const m = mixAt("self", 0, 0)!;
    expect(m.volume).toBe(1);
    expect(m.pan).toBe(0);
    expect(m.lowpassHz).toBeNull();
    expect(m).toEqual(SELF_VOICE_MIX);
  });

  it("DOES NOT DEPEND ON DISTANCE — your body may be anywhere on the map", () => {
    cover("voice-spatial-self");
    // a leap in flight, a dash, a teleport, a reconcile snap, free-pan and the
    // settlement freeze all put your body a long way from the listener anchors
    // for a frame or more. None of them may make YOUR OWN voice quieter.
    for (const [x, z] of [
      [0, 0],
      [7.5, 0],
      [-30, 0],
      [0, 40],
      [999, -999],
      [1e6, 1e6],
    ] as const) {
      const m = mixAt("self", x, z)!;
      expect(m.volume, `self at (${x},${z})`).toBe(1);
      expect(m.pan).toBe(0);
      expect(m.lowpassHz).toBeNull();
    }
    // the same holds past the far cutoff, which culls every other band
    expect(mixAt("self", VOICE_FAR * 10, 0)).not.toBeNull();
  });

  it("does not even need a listener or a position to be full", () => {
    cover("voice-spatial-self");
    expect(voiceSpatialMix(null, { category: "hurt", audience: "self", pos: null })).toEqual(SELF_VOICE_MIX);
    expect(voiceSpatialMix(AT_ORIGIN, { category: "hurt", audience: "self", pos: null })).toEqual(SELF_VOICE_MIX);
    // NaN can never reach an AudioParam through this branch either
    expect(voiceSpatialMix(AT_ORIGIN, { category: "hurt", audience: "self", pos: { x: NaN, z: 0 } })).toEqual(
      SELF_VOICE_MIX,
    );
  });

  it("allocates NO panner and NO filter — one node, the pre-#259 cost", () => {
    cover("voice-spatial-self");
    const opts = voicePlayOptions(SELF_VOICE_MIX);
    expect(opts.volume).toBe(1);
    expect("pan" in opts).toBe(false); // |0| < PAN_SKIP ⇒ omitted, not zeroed
    expect("lowpassHz" in opts).toBe(false);
  });

  it("is the ONLY band that is flat — engaged is full-WEIGHTED, not flat", () => {
    cover("voice-spatial-self");
    // engaged shares RELATION_GAIN 1.0 with self, and that is deliberate; what
    // it does NOT share is the exemption from geometry. The enemy you are
    // fighting is still somewhere, and you should be able to hear where.
    expect(RELATION_GAIN.victim).toBe(RELATION_GAIN.self);
    const engaged = mixAt("engaged", 7.5, 0)!;
    expect(engaged.volume).toBeLessThan(1);
    expect(Math.abs(engaged.pan)).toBeGreaterThan(PAN_SKIP);
  });
});

// ---------------------------------------------------------------------------
// audience → relation
// ---------------------------------------------------------------------------

describe("the audience→relation map is explicit, not a cast (voice-spatial-relation)", () => {
  it("maps every band, and engaged→victim is the load-bearing row", () => {
    cover("voice-spatial-relation");
    expect(audienceToRelation("self")).toBe("self");
    expect(audienceToRelation("engaged")).toBe("victim");
    expect(audienceToRelation("enemy")).toBe("enemy");
    expect(audienceToRelation("ally")).toBe("ally");
    expect(audienceToRelation("third")).toBe("third");
    // total: no band may fall through to undefined
    for (const a of ALL) expect(RELATION_GAIN[audienceToRelation(a)]).toBeGreaterThan(0);
  });

  it("never amplifies — every band's relation weight is ≤ 1", () => {
    cover("voice-spatial-relation");
    // sfxVoiceMultiplier does NOT clamp above 1, and hurt/defeat are among the
    // loudest clips in the pack: a >1 here would clip the SFX bus on the exact
    // events that matter most.
    for (const a of ALL) expect(RELATION_GAIN[audienceToRelation(a)]).toBeLessThanOrEqual(1);
    for (const a of ALL) {
      const m = mixAt(a, 3, 0);
      expect(m!.volume).toBeLessThanOrEqual(1);
      expect(m!.volume).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 「不可以把戰場弄安靜」 — the measured table
// ---------------------------------------------------------------------------

describe("the battlefield stays populated — measured levels (voice-spatial-loudness)", () => {
  it("keeps the ENGAGED enemy clearly audible at every duel range", () => {
    cover("voice-spatial-loudness");
    // A duel is fought inside ~8 u (basic-attack ranges are 1.5–7 u). The enemy
    // you are trading blows with must never fall to "background".
    for (const d of [2, 4, 6, 8]) {
      expect(mixAt("engaged", d, 0)!.volume, `engaged at ${d}u`).toBeGreaterThanOrEqual(0.84);
    }
    // and even at the cutoff it is a THIRD of full level, not a whisper
    expect(mixAt("engaged", VOICE_FAR, 0)!.volume).toBeGreaterThan(0.37);
  });

  it("keeps unrelated bands present rather than deleting them", () => {
    cover("voice-spatial-loudness");
    // 12 u is "the other fight in your own zone" — audible, clearly further off
    expect(mixAt("enemy", 12, 0)!.volume).toBeGreaterThan(0.5);
    expect(mixAt("ally", 12, 0)!.volume).toBeGreaterThan(0.38);
    expect(mixAt("third", 12, 0)!.volume).toBeGreaterThan(0.28);
  });

  it("is GENTLER than the SFX curve at every range — a voice is information", () => {
    cover("voice-spatial-loudness");
    for (const d of [7, 10, 14, 20, 30]) {
      expect(distanceGain(d, "voice"), `voice vs focus at ${d}u`).toBeGreaterThan(
        distanceGain(d, "focus"),
      );
      expect(distanceGain(d, "voice")).toBeGreaterThan(distanceGain(d, "texture"));
    }
    // …and flat inside a duel's own spacing, so a fight never ducks itself
    expect(distanceGain(VOICE_NEAR, "voice")).toBe(1);
  });

  it("the measured table, pinned (this is what the owner drags the slider over)", () => {
    cover("voice-spatial-loudness");
    const table: Record<number, number> = {
      6: 1.0,
      8: 0.8415,
      12: 0.6598,
      16: 0.5552,
      20: 0.4856,
      30: 0.3807,
    };
    for (const [d, want] of Object.entries(table)) {
      expect(distanceGain(Number(d), "voice"), `voice gain at ${d}u`).toBeCloseTo(want, 3);
    }
  });
});

// ---------------------------------------------------------------------------
// direction + depth
// ---------------------------------------------------------------------------

describe("direction and depth come from the SAME laws as the SFX (voice-spatial-geometry)", () => {
  it("6 u to the left is −0.476, its mirror is +0.476 — the shared pan law", () => {
    cover("voice-spatial-geometry");
    expect(mixAt("enemy", -6, 0)!.pan).toBeCloseTo(panForOffset(-6), 9);
    expect(mixAt("enemy", 6, 0)!.pan).toBeCloseTo(+0.4764, 3);
    expect(mixAt("enemy", -6, 0)!.pan).toBeCloseTo(-0.4764, 3);
  });

  it("up-screen darkens, toward-camera never does (the asymmetry is the cue)", () => {
    cover("voice-spatial-geometry");
    expect(mixAt("enemy", 0, 10)!.lowpassHz).toBeLessThan(15000);
    expect(mixAt("enemy", 0, -10)!.lowpassHz).toBeNull();
    expect(mixAt("enemy", 0, 1)!.lowpassHz).toBeNull(); // under the skip threshold
  });

  it("uses the SPLIT listener: level from the body, direction from the camera", () => {
    cover("voice-spatial-geometry");
    // camera panned 10 u right of the body — a speaker ON the body must still be
    // at full distance-gain (level anchor) while reading LEFT (direction anchor).
    const split: SpatialListener = { levelX: 0, levelZ: 0, dirX: 10, dirZ: 0 };
    const m = voiceSpatialMix(split, { category: "hurt", audience: "enemy", pos: { x: 0, z: 0 } })!;
    expect(m.volume).toBeCloseTo(RELATION_GAIN.enemy, 9); // distance 0 from the BODY
    expect(m.pan).toBeCloseTo(panForOffset(-10), 9); // 10 u left of the FRAME
  });
});

// ---------------------------------------------------------------------------
// the cutoff, and who is exempt from it
// ---------------------------------------------------------------------------

describe("the far cutoff is the cross-zone rule (voice-spatial-cutoff)", () => {
  it("drops an unrelated speaker past 30 u — the other duel zone is ≥ 32 u out", () => {
    cover("voice-spatial-cutoff");
    for (const a of ["enemy", "ally", "third"] as const) {
      expect(mixAt(a, VOICE_FAR + 0.1, 0), `${a} past cutoff`).toBeNull();
      expect(mixAt(a, 32, 0)).toBeNull(); // the minimum cross-zone distance
      expect(mixAt(a, VOICE_FAR - 0.1, 0)).not.toBeNull();
    }
  });

  it("never drops self or engaged — your own fight is about YOU, not where it is", () => {
    cover("voice-spatial-cutoff");
    const far = mixAt("engaged", 60, 0)!;
    expect(far).not.toBeNull();
    // pulled to the cutoff: level floors at the 30 u value, bearing preserved
    expect(far.volume).toBeCloseTo(distanceGain(VOICE_FAR, "voice"), 2);
    expect(far.pan).toBeGreaterThan(0);
    expect(mixAt("self", 1e6, 0)).toEqual(SELF_VOICE_MIX);
  });

  it("the MIX cutoff and the DISPATCH cutoff are the same number", () => {
    cover("voice-spatial-cutoff");
    // If they ever diverge, one of the two layers becomes dead code: a candidate
    // that survives voiceProbScale only to be nulled by the mix (a wasted slot),
    // or a mix that never sees anything past a shorter dispatch cutoff.
    expect(AUDIENCE_VOICE_FAR).toBe(VOICE_FAR);
  });
});

// ---------------------------------------------------------------------------
// degraded inputs
// ---------------------------------------------------------------------------

describe("degraded inputs stay audible, never louder (voice-spatial-degraded)", () => {
  it("an unresolvable position plays CENTRED rather than not at all", () => {
    cover("voice-spatial-degraded");
    const m = voiceSpatialMix(AT_ORIGIN, { category: "hurt", audience: "enemy", pos: null })!;
    expect(m).not.toBeNull();
    expect(m.volume).toBe(RELATION_GAIN.enemy);
    expect(m.pan).toBe(0);
    expect(m.lowpassHz).toBeNull();
  });

  it("a non-finite coordinate can never reach an AudioParam", () => {
    cover("voice-spatial-degraded");
    for (const bad of [NaN, Infinity, -Infinity]) {
      const m = voiceSpatialMix(AT_ORIGIN, { category: "hurt", audience: "enemy", pos: { x: bad, z: 0 } })!;
      expect(Number.isFinite(m.volume)).toBe(true);
      expect(Number.isFinite(m.pan)).toBe(true);
      expect(m.lowpassHz).toBeNull();
    }
  });

  it("SPECTATING drops the relation duck but keeps the geometry", () => {
    cover("voice-spatial-degraded");
    // with no body of your own, voiceAudienceOf demotes EVERY speaker to third,
    // so keeping the 0.45 duck would mute the whole arena at the one moment the
    // player has nothing to do but listen to it.
    const alive = voiceSpatialMix(AT_ORIGIN, { category: "hurt", audience: "third", pos: { x: 8, z: 0 } })!;
    const dead = voiceSpatialMix(AT_ORIGIN, { category: "hurt", audience: "third",
      pos: { x: 8, z: 0 },
      spectating: true,
    })!;
    expect(dead.volume).toBeGreaterThan(alive.volume);
    expect(dead.pan).toBeCloseTo(alive.pan, 9); // direction unchanged
    // and it is never louder than the pre-#259 behaviour, which was a flat 1.0
    expect(dead.volume).toBeLessThanOrEqual(1);
    expect(dead.volume).toBeCloseTo(distanceGain(8, "voice"), 6);
  });

  it("voicePlayOptions omits inaudible fields instead of rounding them", () => {
    cover("voice-spatial-degraded");
    const near = voicePlayOptions(mixAt("enemy", 0.1, 0)!); // |pan| < PAN_SKIP
    expect("pan" in near).toBe(false);
    expect("lowpassHz" in near).toBe(false);
    const placed = voicePlayOptions(mixAt("enemy", 6, 10)!);
    expect(placed.pan).toBeGreaterThan(PAN_SKIP);
    expect(placed.lowpassHz).toBeGreaterThan(80);
    expect(placed.volume).toBeGreaterThan(0);
  });
});

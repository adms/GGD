/**
 * tform-14 — the planner half of 「變身前/後共用就好」.
 *
 * These are the properties the generator relies on. The end-to-end assertion —
 * all 50 first-open-roster champions actually resolve to a non-empty combat
 * voice pack in the SHIPPED manifest — lives in
 * apps/client/src/audio/combatVoiceCoverage.test.ts, because that is where the
 * reader (`packClips`) lives.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { CHAMPION_FORM_PAIRS, counterpartFormId } from "./championForms";
import {
  applyFormVoiceShares,
  planFormVoiceShares,
  type FormVoiceShare,
} from "./voiceFormSharing";

/** A real pair whose ALTERNATE is the one with clips today (悟空 / 超級賽亞人 #09). */
const ALT_DONOR = { base: "godie-ogrh", alt: "godie-o00x" };
/** A real pair whose BASE is the one with clips today (Saber #20). */
const BASE_DONOR = { base: "godie-e002", alt: "godie-e00l" };

function shareFor(shares: readonly FormVoiceShare[], id: string): FormVoiceShare | undefined {
  return shares.find((s) => s.championId === id);
}

describe("planFormVoiceShares — both directions across a w3x form pair", () => {
  it("lends the ALTERNATE's pack to a base with none (today's ten regressions)", () => {
    cover("transform-forms-voice-share");
    const shares = planFormVoiceShares([ALT_DONOR.alt]);
    const s = shareFor(shares, ALT_DONOR.base);
    expect(s, "悟空 must borrow 超級賽亞人's pack").toBeDefined();
    expect(s?.sharedFrom).toBe(ALT_DONOR.alt);
    expect(s?.direction).toBe("alternate-to-base");
    expect(s?.heroNumber).toBe("09");
  });

  it("lends the BASE's pack to an alternate with none (what #119's morph needs)", () => {
    const shares = planFormVoiceShares([BASE_DONOR.base]);
    const s = shareFor(shares, BASE_DONOR.alt);
    expect(s, "the 風王結界 body must borrow Saber's pack").toBeDefined();
    expect(s?.sharedFrom).toBe(BASE_DONOR.base);
    expect(s?.direction).toBe("base-to-alternate");
  });

  it("never lends to a champion that has its OWN pack", () => {
    const shares = planFormVoiceShares([ALT_DONOR.base, ALT_DONOR.alt]);
    expect(shares.map((s) => s.championId)).not.toContain(ALT_DONOR.base);
    expect(shares.map((s) => s.championId)).not.toContain(ALT_DONOR.alt);
  });

  it("lends nothing when NEITHER half has a pack — silence, not a throw", () => {
    expect(() => planFormVoiceShares([])).not.toThrow();
    expect(planFormVoiceShares([])).toEqual([]);
    // A champion in no pair at all is simply never named.
    const orphan = "godie-zombiex";
    expect(counterpartFormId(orphan)).toBeNull();
    expect(shareFor(planFormVoiceShares([orphan]), orphan)).toBeUndefined();
  });

  it("names at most one side of any pair, and always its real counterpart", () => {
    const everyDonor = CHAMPION_FORM_PAIRS.map((p) => p.alternateId);
    const shares = planFormVoiceShares(everyDonor);
    expect(shares).toHaveLength(CHAMPION_FORM_PAIRS.length);
    for (const s of shares) {
      expect(counterpartFormId(s.championId), `${s.championId} ← ${s.sharedFrom}`).toBe(
        s.sharedFrom,
      );
    }
    // sorted by championId so the generated manifest diff is stable
    expect(shares.map((s) => s.championId)).toEqual([...shares.map((s) => s.championId)].sort());
  });

  it("is unaffected by the ORDER the owned ids arrive in", () => {
    const owned = CHAMPION_FORM_PAIRS.map((p) => p.alternateId);
    const a = planFormVoiceShares(owned);
    const b = planFormVoiceShares([...owned].reverse());
    expect(a).toEqual(b);
  });
});

describe("applyFormVoiceShares", () => {
  const entries = {
    [ALT_DONOR.alt]: { lines: { victory: ["alt.mp3"] } },
    [BASE_DONOR.base]: { lines: { victory: ["base.mp3"] } },
  };

  it("stamps the borrowed entry with its donor and keeps the donor's clips", () => {
    const out = applyFormVoiceShares(entries, planFormVoiceShares(Object.keys(entries)));
    expect(out[ALT_DONOR.base]).toEqual({
      lines: { victory: ["alt.mp3"] },
      sharedFrom: ALT_DONOR.alt,
    });
    expect(out[BASE_DONOR.alt]).toEqual({
      lines: { victory: ["base.mp3"] },
      sharedFrom: BASE_DONOR.base,
    });
  });

  it("leaves an owner's entry byte-identical and UNSTAMPED", () => {
    const out = applyFormVoiceShares(entries, planFormVoiceShares(Object.keys(entries)));
    expect(out[ALT_DONOR.alt]).toEqual(entries[ALT_DONOR.alt]);
    expect(out[ALT_DONOR.alt]).not.toHaveProperty("sharedFrom");
    // and the input map is not mutated
    expect(Object.keys(entries).sort()).toEqual([ALT_DONOR.alt, BASE_DONOR.base].sort());
  });

  it("refuses to shadow a real pack even if a stale plan names its owner", () => {
    const stale: FormVoiceShare[] = [
      {
        championId: ALT_DONOR.alt,
        sharedFrom: BASE_DONOR.base,
        heroNumber: "09",
        direction: "base-to-alternate",
      },
    ];
    const out = applyFormVoiceShares(entries, stale);
    expect(out[ALT_DONOR.alt]).toEqual(entries[ALT_DONOR.alt]);
  });

  it("degrades to no entry (not a throw) when the donor is gone", () => {
    const stale: FormVoiceShare[] = [
      {
        championId: ALT_DONOR.base,
        sharedFrom: "godie-nosuch",
        heroNumber: "09",
        direction: "alternate-to-base",
      },
    ];
    let out: Record<string, unknown> = {};
    expect(() => {
      out = applyFormVoiceShares(entries, stale);
    }).not.toThrow();
    expect(out[ALT_DONOR.base]).toBeUndefined();
  });
});

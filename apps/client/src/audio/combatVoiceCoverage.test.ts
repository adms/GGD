/**
 * tform-15 — THE REGRESSION THAT WAS MISSING.
 *
 * Task #249 swapped ten first-open-roster slots from a champion's TRANSFORMED
 * body back to its base. `content/assets/audio/voices/lines/` had been generated
 * against the OLD roster, so it held exactly those ten ALTERNATES and none of
 * the ten bases — and nothing failed. Ten of the fifty playable champions went
 * to production with no combat voice at all: no skill call-out, no hurt grunt,
 * no kill line, no death cry. The select CLICK still answered (its ladder has
 * name/quote rungs under the pack), which is precisely why the hole was quiet.
 *
 * This test closes it at the level that matters — the REAL shipped manifest,
 * read through the REAL reader (`packClips`), for the REAL tracked roster — and
 * it NAMES the silent champions when it fails, because "expected 51 to be 51"
 * would send the next person hunting.
 *
 * It does not care HOW a champion resolves. The build-time share baked by
 * `tools/voice-gen/index-lines.mjs` and the runtime resolution in
 * `resolveVoicePackId` both satisfy it, and both read the same closed 26-pair
 * `Eme1`/`Emeu` table, so they cannot disagree about who lends to whom.
 *
 * ── 2026-07-30: THE SAME HOLE REOPENED, AND IS NOW PINNED ──────────────────
 * The owner opened two more heroes (`starterChampions` 51 → 53) and the corpus
 * did not move: `VOICE_GAP` below is the exact, measured list of roster ids
 * that resolve to NOTHING today. They are registered, not papered over — see
 * that constant for what it costs to close the gap and what the alternative is.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { readStarterRoster } from "@ggd/shared/testkit/starterRoster";
import { CHAMPION_FORM_PAIRS, counterpartFormId } from "@ggd/shared/content/championForms";
import {
  VOICE_PACK_MANIFEST_PATH,
  packClips,
  resolveVoicePackId,
  voicePackFromDoc,
  type ChampionVoicePack,
} from "./selectVoiceLadder";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../.."); // src/audio -> apps/client -> apps -> repo root
const CONTENT = join(ROOT, "content");

const PACK = voicePackFromDoc(
  JSON.parse(readFileSync(join(CONTENT, VOICE_PACK_MANIFEST_PATH), "utf8")),
);
const ROSTER = readStarterRoster(ROOT);

/**
 * The categories a champion must be able to speak to be audible in a fight.
 * `select` is the click; the rest are the contextual layer's load-bearing cues
 * across a whole round — a cast, a hit taken, a kill, a death, a win.
 */
const COMBAT_CATEGORIES = [
  "select",
  "skill-name.q",
  "skill-name.w",
  "skill-name.e",
  "skill-name.r",
  "skill-name.ex",
  "hurt",
  "hurt-heavy",
  "kill-1",
  "defeat",
  "victory",
] as const;

/** Ids the manifest carries clips of its OWN for (not borrowed). */
function ownPackIds(pack: ChampionVoicePack | null): Set<string> {
  const out = new Set<string>();
  for (const [id, entry] of Object.entries(pack?.champions ?? {})) {
    if (!entry.sharedFrom) out.add(id);
  }
  return out;
}

/**
 * ── REGISTERED GAP: roster ids with NO combat voice at all ─────────────────
 *
 * These champions really do fight in silence right now. This is a RATCHET, not
 * an excuse: the assertions below pin the gap EXACTLY, so the suite goes red
 * both when a voiced champion loses its pack AND when one of these two gains
 * one (at which point delete it from here). `it.fails` at the bottom of this
 * describe is the second half of the ratchet — it holds the DESIRED state (all
 * 53 audible) and turns red the moment the whole gap closes.
 *
 * WHY IT IS NOT FIXED HERE. Both are halves of a 變身 pair whose OTHER half is
 * also empty (`godie-e00s`/`godie-e010`, `godie-ucrl`/`godie-u034`), so the
 * form share — the mechanism that rescued the ten champions of #249 — has no
 * donor to borrow from. Nothing in the ladder covers the CONTEXTUAL layer
 * either: rungs 4/5 (name / 名言) answer the select CLICK only, and
 * `contextualVoice.ts` reads this pack and nothing else. So the only honest
 * fix is generating real clips.
 *
 * WHAT CLOSING IT COSTS (measured 2026-07-30):
 *   2 champions × 46 authored lines = 92 CosyVoice3 clips, plus a casting
 *   decision (`content/assets/audio/voices/_voice-casting-plan.json` has 48
 *   entries and neither of these), plus a reference take
 *   (`content/assets/audio/voices/references/` holds none for either). Then:
 *     pnpm voice:index    # tools/voice-gen/index-lines.mjs → MANIFEST.json
 *     pnpm content:build
 *   The 51 champions that DO have packs each own 46 mp3s under
 *   `content/assets/audio/voices/lines/<id>/`; these two have no directory.
 *
 * THE ALTERNATIVE IS ON THE TABLE: dropping the two ids back out of
 * `starterChampions` until the clips exist is a one-line change and makes this
 * gap disappear. That is an owner call, not a test-author call.
 */
const VOICE_GAP: readonly string[] = ["godie-e00s", "godie-ucrl"];

/** The gap, rendered the way the failure message renders a silent champion. */
function labelSilent(id: string): string {
  const counterpart = counterpartFormId(id);
  return counterpart ? `${id} (counterpart ${counterpart} has none either)` : id;
}

/** Roster ids that resolve to no clip at all for `category`. */
function silentFor(category: string): string[] {
  return ROSTER.filter((id) => packClips(PACK, id, category).length === 0);
}

describe("every first-open-roster champion has a combat voice", () => {
  it("names every mute champion, and the list is exactly the registered gap", () => {
    cover("transform-forms-voice-coverage");
    // ⛔ 不釘死一個數字 —— 名單長度是 starter.go 的事實（見 starterRosterSize）。
    //    這裡真正要擋的是「解析壞掉回一個空陣列」，那才會讓整條測試空轉全綠。
    expect(ROSTER.length, "starter.go 解析不出英雄 —— 這條測試會空轉").toBeGreaterThan(20);
    expect(PACK, "the shipped voice-pack manifest must parse").not.toBeNull();
    // A pin for ids no longer on the roster is dead weight that would hide a
    // real regression, so rolling the roster back must also fail here.
    for (const id of VOICE_GAP) {
      expect(ROSTER, `${id} is pinned as a known voice gap but is not on the roster`).toContain(id);
    }

    const silent = silentFor("select");
    expect(
      silent.map(labelSilent),
      `the set of first-open-roster champions with NO combat voice (no skill call-out, no ` +
        `hurt grunt, no kill line, no death cry) is not the registered gap.\n  measured: ${
          silent.join(", ") || "(none)"
        }\n  registered VOICE_GAP: ${VOICE_GAP.join(", ")}\n  ` +
        `A champion that APPEARED here is a regression. A champion that DISAPPEARED means ` +
        `its clips landed — delete it from VOICE_GAP and from the it.fails ratchet below.`,
    ).toEqual(VOICE_GAP.map(labelSilent));
  });

  it("gives every voiced champion the whole load-bearing category set, not just the click", () => {
    const gaps: string[] = [];
    for (const id of ROSTER) {
      if (VOICE_GAP.includes(id)) continue; // registered above; asserted in full below
      const missing = COMBAT_CATEGORIES.filter((c) => packClips(PACK, id, c).length === 0);
      if (missing.length > 0) gaps.push(`${id}: ${missing.join(", ")}`);
    }
    expect(gaps, `combat categories missing:\n  ${gaps.join("\n  ")}`).toEqual([]);
  });

  /**
   * THE RATCHET. Its body is the state we WANT — every roster champion audible
   * in every load-bearing category. Vitest expects it to fail; the day the two
   * gap champions get clips it will pass, and `it.fails` turns that into a RED
   * "expected to fail, but passed". Delete this test and `VOICE_GAP` together
   * when that happens. (`it.fails`, not `it.skip`: skip means "we don't know",
   * this means "we know, and it is nailed down".)
   */
  it.fails("KNOWN GAP — not every roster champion is voiced yet (delete when closed)", () => {
    const gaps: string[] = [];
    for (const id of ROSTER) {
      const missing = COMBAT_CATEGORIES.filter((c) => packClips(PACK, id, c).length === 0);
      if (missing.length > 0) gaps.push(`${id}: ${missing.join(", ")}`);
    }
    expect(gaps).toEqual([]);
  });

  it("points every resolved clip at a file that exists on disk", () => {
    const missing: string[] = [];
    for (const id of ROSTER) {
      for (const cat of COMBAT_CATEGORIES) {
        for (const c of packClips(PACK, id, cat)) {
          if (!existsSync(join(CONTENT, c.clip))) missing.push(`${id}/${cat} → ${c.clip}`);
        }
      }
    }
    expect(missing, `resolved clips absent from content/:\n  ${missing.join("\n  ")}`).toEqual([]);
  });
});

describe("the form share, on the real content tree", () => {
  it("is what carries the ten champions #249 swapped in", () => {
    cover("transform-forms-voice-shared");
    // These ten are the whole regression: the corpus holds their ALTERNATE.
    const swappedIn = [
      ["godie-ewar", "godie-e007"], // #12 天地志狼
      ["godie-h02v", "godie-h02u"], // #92 草泥馬
      ["godie-hgam", "godie-h02r"], // #90 妙蛙種子
      ["godie-hjai", "godie-h020"], // #04 莉娜因巴斯
      ["godie-nbbc", "godie-n01c"], // #08 勇者小呆
      ["godie-nsjs", "godie-n00p"], // #18 南野秀一
      ["godie-ogrh", "godie-o00x"], // #09 悟空
      ["godie-udre", "godie-u01u"], // #11 索隆
      ["godie-umal", "godie-u00l"], // #25 拳四郎
      ["godie-uvng", "godie-u010"], // #38 飛影
    ] as const;
    const own = ownPackIds(PACK);
    for (const [base, alt] of swappedIn) {
      expect(ROSTER, `${base} must be on the roster`).toContain(base);
      expect(own.has(base), `${base} is expected to have NO clips of its own`).toBe(false);
      expect(own.has(alt), `${alt} is expected to be the donor`).toBe(true);
      const resolved = resolveVoicePackId(PACK, base);
      expect(resolved).toEqual({ id: alt, sharedFrom: alt });
      expect(packClips(PACK, base, "skill-name.q").length).toBeGreaterThan(0);
    }
  });

  it("works in the OTHER direction too — an alternate borrowing from its base", () => {
    // What #119's morph needs: the player transforms into a body with no clips.
    const own = ownPackIds(PACK);
    const baseDonors = CHAMPION_FORM_PAIRS.filter(
      (p) => own.has(p.baseId) && !own.has(p.alternateId),
    );
    expect(
      baseDonors.length,
      "the content tree must still contain at least one base→alternate case",
    ).toBeGreaterThan(0);
    for (const p of baseDonors) {
      expect(resolveVoicePackId(PACK, p.alternateId)).toEqual({
        id: p.baseId,
        sharedFrom: p.baseId,
      });
      expect(packClips(PACK, p.alternateId, "victory").length).toBeGreaterThan(0);
    }
  });

  it("never shadows a champion that has its own pack", () => {
    for (const id of ownPackIds(PACK)) {
      expect(resolveVoicePackId(PACK, id), `${id} owns clips and must answer with them`).toEqual({
        id,
        sharedFrom: null,
      });
      // and its clips are its own files, never the counterpart's
      for (const c of packClips(PACK, id, "victory")) {
        expect(c.clip).toContain(`/${id}/`);
      }
    }
  });

  it("degrades to silence, not a throw, when neither half has a pack", () => {
    const own = ownPackIds(PACK);
    const orphanPairs = CHAMPION_FORM_PAIRS.filter(
      (p) => !own.has(p.baseId) && !own.has(p.alternateId),
    );
    expect(orphanPairs.length, "expected some pairs with no clips on either side").toBeGreaterThan(
      0,
    );
    for (const p of orphanPairs) {
      expect(() => packClips(PACK, p.baseId, "victory")).not.toThrow();
      expect(packClips(PACK, p.baseId, "victory")).toEqual([]);
      expect(resolveVoicePackId(PACK, p.alternateId)).toBeNull();
    }
    // Which of these orphan pairs are actually SHIPPED decides whether the
    // graceful degradation above is a harmless gap or a live bug. Until
    // 2026-07-30 the answer was "none", and this line asserted exactly that.
    // It is now the registered VOICE_GAP and nothing else — so a third silent
    // champion reaching champ-select still fails here, loudly and by name.
    const shipped = orphanPairs
      .filter((p) => ROSTER.includes(p.baseId) || ROSTER.includes(p.alternateId))
      .map((p) => (ROSTER.includes(p.baseId) ? p.baseId : p.alternateId))
      .sort(); // CHAMPION_FORM_PAIRS declaration order is not the roster's
    expect(
      shipped,
      `these 變身 pairs have no clips on EITHER side yet are on the shipped roster, so the ` +
        `form share has no donor and the champion is mute in combat: ${shipped.join(", ")}. ` +
        `Only the registered VOICE_GAP may appear here.`,
    ).toEqual([...VOICE_GAP].sort());
  });

  it("degrades for a champion in no form pair at all", () => {
    expect(counterpartFormId("godie-nosuch")).toBeNull();
    expect(resolveVoicePackId(PACK, "godie-nosuch")).toBeNull();
    expect(packClips(PACK, "godie-nosuch", "victory")).toEqual([]);
    expect(packClips(null, "godie-ogrh", "victory")).toEqual([]);
    expect(packClips(PACK, "", "victory")).toEqual([]);
  });
});

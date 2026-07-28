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

describe("every first-open-roster champion has a combat voice", () => {
  it("resolves a non-empty pack for all 51, and names the mute ones if not", () => {
    cover("transform-forms-voice-coverage");
    expect(ROSTER).toHaveLength(51);
    expect(PACK, "the shipped voice-pack manifest must parse").not.toBeNull();

    const silent: string[] = [];
    for (const id of ROSTER) {
      if (packClips(PACK, id, "select").length === 0) {
        const counterpart = counterpartFormId(id);
        silent.push(counterpart ? `${id} (counterpart ${counterpart} has none either)` : id);
      }
    }
    expect(
      silent,
      `these first-open-roster champions have NO combat voice — they will fight in total ` +
        `silence (no skill call-out, no hurt grunt, no kill line, no death cry):\n  ` +
        silent.join("\n  "),
    ).toEqual([]);
  });

  it("gives all 51 every load-bearing combat category, not just the click", () => {
    const gaps: string[] = [];
    for (const id of ROSTER) {
      const missing = COMBAT_CATEGORIES.filter((c) => packClips(PACK, id, c).length === 0);
      if (missing.length > 0) gaps.push(`${id}: ${missing.join(", ")}`);
    }
    expect(gaps, `combat categories missing:\n  ${gaps.join("\n  ")}`).toEqual([]);
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
      // …and none of them is on the shipped roster, which is why this is a gap
      // and not a live bug.
      expect(ROSTER).not.toContain(p.baseId);
    }
  });

  it("degrades for a champion in no form pair at all", () => {
    expect(counterpartFormId("godie-nosuch")).toBeNull();
    expect(resolveVoicePackId(PACK, "godie-nosuch")).toBeNull();
    expect(packClips(PACK, "godie-nosuch", "victory")).toEqual([]);
    expect(packClips(null, "godie-ogrh", "victory")).toEqual([]);
    expect(packClips(PACK, "", "victory")).toEqual([]);
  });
});

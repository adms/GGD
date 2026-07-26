/**
 * task #27 (reopened) — the PROOF half: run the real ladder over the real
 * `content/` tree and assert the property the task is about.
 *
 *   • PUBLIC tier (no copyright-gated overlay): all 113 champions answer, and
 *     every clip the ladder can name is a file that exists on disk. This is the
 *     number the family actually plays against; the previous answer was 16/113.
 *   • Two DIFFERENT characters never answer with the same audio file. The
 *     content tree does contain byte-identical clips, but only between duplicate
 *     docs of the SAME character (#113) — so a click still says who you are.
 *   • `EXCLUDED_NAME_CLIPS` equals the set of name-manifest clips actually
 *     missing from disk, so the pin cannot rot in either direction.
 *   • The shipped voice-pack manifest template parses and contributes nothing.
 *
 * Reads the authored files by DIRECT path (like championVoices.test.ts) so it
 * is green both before and after `content:build`.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { championVoicesFromDoc } from "./championVoice";
import { championNamesFromDoc, championQuotesFromDoc } from "./nameVoice";
import { baseFormIdOf } from "@ggd/shared/content/championForms";
import {
  EXCLUDED_NAME_CLIPS,
  VOICE_PACK_MANIFEST_PATH,
  resolveSelectVoice,
  resolveVoicePackId,
  voicePackFromDoc,
  type SelectVoiceInputs,
  type SelectVoiceTier,
} from "./selectVoiceLadder";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(join(CONTENT, rel), "utf8"));
}

const VOICES = championVoicesFromDoc(readJson("config/champion-voices.json"));
const NAMES = championNamesFromDoc(readJson("assets/audio/voices/names/MANIFEST.json"));
const QUOTES = championQuotesFromDoc(readJson("assets/audio/voices/quotes/quotes.json"));
const PACK = voicePackFromDoc(readJson(VOICE_PACK_MANIFEST_PATH));

/** The tier the family actually plays on ggd.adms.ai: no gated overlay. */
const PUBLIC: SelectVoiceInputs = {
  voices: VOICES,
  pack: PACK,
  blizzard: null,
  names: NAMES,
  quotes: QUOTES,
};

const CHAMP_IDS = Object.keys(VOICES?.champions ?? {});

function sha(rel: string): string {
  return createHash("sha256").update(readFileSync(join(CONTENT, rel))).digest("hex");
}

describe("select-voice coverage on the PUBLIC tier", () => {
  it("answers for every champion, with files that exist", () => {
    cover("voice-select-coverage");
    // 115 since task #249 imported godie-o02n (曹操孟德's BASE unit O02N).
    expect(CHAMP_IDS).toHaveLength(115);

    const silent: string[] = [];
    const missing: string[] = [];
    const byTier: Record<string, number> = {};
    for (const id of CHAMP_IDS) {
      const rung = resolveSelectVoice(id, PUBLIC);
      if (!rung) {
        silent.push(id);
        continue;
      }
      byTier[rung.tier] = (byTier[rung.tier] ?? 0) + 1;
      for (const clip of rung.clips) {
        if (!existsSync(join(CONTENT, clip))) missing.push(`${id}: ${clip}`);
      }
    }
    expect(silent).toEqual([]);
    expect(missing).toEqual([]);
    // The composition is asserted, not just the total: a regression that
    // silently promoted the 名言 floor over the name rung would keep 114/114.
    // The generated voice pack (51 CosyVoice3 heroes) now answers rung 2 for the
    // 42 packed heroes without an authored map-quip; authored stays 16, and the
    // 42 are drawn out of what was previously the name rung (95 → 54, task #184).
    // name 54 → 55: task #249 imported godie-o02n (曹操孟德's BASE unit O02N),
    // which answers on the name rung exactly like its 天下號令 form.
    //
    // generated 42 → 57, name 55 → 40 (owner 2026-07-26 「變身前/後共用就好」):
    // a champion with no pack of its own now answers with its w3x FORM
    // COUNTERPART's, so 15 more champions climb off the TTS name rung onto a
    // real cloned voice. 51 packs cover 66 champions across the 26 pairs; the
    // 15 are the shares that are not ALSO map-quip champions (rung 1 still
    // wins) and that appear in this 115-key config.
    expect(byTier).toEqual({ authored: 16, generated: 57, name: 40, quote: 2 });
  });

  it("never gives two DIFFERENT characters the same audio file — outside the two the w3x already shared", () => {
    cover("voice-select-coverage");
    // A champion's "character" is its 名言 pack `name`: equal for the duplicate
    // docs of one character (#113), different for everyone else. The content
    // tree DOES hold byte-identical clips — 20 groups of them — and every one
    // is a character duplicated across hero numbers, so a click still says who
    // you are. Grouped by file content, not by path, because that is the
    // property a listener has.
    const quotes = QUOTES?.quotes ?? {};
    const byFile = new Map<
      string,
      { tier: SelectVoiceTier; who: Set<string>; ids: Set<string>; clip: string }
    >();
    for (const id of CHAMP_IDS) {
      const rung = resolveSelectVoice(id, PUBLIC);
      if (!rung) continue;
      for (const clip of rung.clips) {
        const key = sha(clip);
        const slot = byFile.get(key) ?? {
          tier: rung.tier,
          who: new Set<string>(),
          ids: new Set<string>(),
          clip,
        };
        slot.who.add(quotes[id]?.name ?? id);
        slot.ids.add(id);
        byFile.set(key, slot);
      }
    }
    // Two halves of ONE w3x transform pair sharing a clip is not a collision —
    // it is the point (owner 2026-07-26 「變身前/後共用就好」). 妙蛙種子 and its
    // 超進化 妙蛙花 are one character with two 名言 names, proven by the map's own
    // Eme1/Emeu + unsf evidence, so collapse each pair onto its base before
    // asking whether two DIFFERENT characters are sharing audio.
    const collisions = [...byFile.values()].filter(
      (s) => new Set([...s.ids].map(baseFormIdOf)).size > 1 && s.who.size > 1,
    );

    // The rungs THIS task added are clean: no two characters share a clip.
    expect(collisions.filter((c) => c.tier !== "authored")).toEqual([]);

    // The authored rung is not, and the exception is pinned rather than scoped
    // away: the w3x itself binds one quip to two heroes (16 champions, 13
    // distinct clips — see docs/todo/champion-voices.md). That is inherited
    // source content and predates this ladder; fixing it means re-cutting map
    // audio, not changing a fallback. Neither pair sits in the curated roster
    // today, so it cannot be heard as a collision inside one match.
    expect(
      collisions
        .map((c) => `${c.clip} = ${[...c.who].sort().join(" / ")}`)
        .sort(),
    ).toEqual([
      "assets/audio/sfx/dogdie.mp3 = 清蒸 飛鼠先生 / 飛鼠先生",
      "assets/audio/sfx/kickme.mp3 = 打我阿笨蛋 / 鬼王達",
    ]);
  });

  it("pins EXCLUDED_NAME_CLIPS to the clips actually missing from disk", () => {
    cover("voice-select-coverage");
    const declared = [...EXCLUDED_NAME_CLIPS].sort();
    const actual = new Set<string>();
    for (const entry of Object.values(NAMES?.champions ?? {})) {
      for (const seg of entry.voSegments) {
        if (!existsSync(join(CONTENT, seg.clip))) actual.add(seg.clip);
      }
      if (!existsSync(join(CONTENT, entry.clip))) actual.add(entry.clip);
    }
    // Equality both ways: regenerating godie-e00j.name.mp3 must delete the pin,
    // and a newly-lost clip must be added, or a champion goes quiet unnoticed.
    expect([...actual].sort()).toEqual(declared);
  });
});

describe("the generated voice pack, as shipped today", () => {
  it("populates 51 CosyVoice3 heroes and drives a live generated rung", () => {
    cover("voice-select-pack");
    expect(PACK).not.toBeNull();
    // The voice-gen indexer folded the lines/ corpus in: 51 packed champions,
    // each with a non-empty synthesized select pool.
    expect(Object.keys(PACK?.champions ?? {})).toHaveLength(51);
    for (const [id, entry] of Object.entries(PACK?.champions ?? {})) {
      expect(entry.lines["select"]?.length, `${id} select pool`).toBeGreaterThan(0);
    }

    // Rung 2 now answers for exactly the packed heroes that have no authored
    // map-quip (authored wins over generated), and every such hero's clip is a
    // real file on disk — the #184 monoculture break.
    const generated: string[] = [];
    for (const id of CHAMP_IDS) {
      const rung = resolveSelectVoice(id, PUBLIC);
      if (rung?.tier === "generated") {
        generated.push(id);
        for (const clip of rung.clips) {
          expect(existsSync(join(CONTENT, clip)), `${id} → ${clip}`).toBe(true);
        }
      }
    }
    const authoredIds = new Set(
      Object.entries(VOICES?.champions ?? {})
        .filter(([, v]) => v.source === "map-quip" && v.select.length > 0)
        .map(([id]) => id),
    );
    // "Packed" now means RESOLVABLE, not "a key in the manifest": a champion
    // with no pack of its own reaches one through its w3x form counterpart
    // (resolveVoicePackId, owner 2026-07-26 「變身前/後共用就好」). Computed from
    // the same resolver the player hears, so this stays an equality both ways
    // rather than a number someone has to keep in step.
    const packedNonAuthored = CHAMP_IDS.filter(
      (id) => !authoredIds.has(id) && resolveVoicePackId(PACK, id) !== null,
    );
    expect(generated.sort()).toEqual(packedNonAuthored.sort());
    expect(generated.length).toBe(57);
  });
});

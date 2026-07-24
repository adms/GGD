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
import {
  EXCLUDED_NAME_CLIPS,
  VOICE_PACK_MANIFEST_PATH,
  resolveSelectVoice,
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
    expect(CHAMP_IDS).toHaveLength(113);

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
    // silently promoted the 名言 floor over the name rung would keep 113/113.
    expect(byTier).toEqual({ authored: 16, name: 95, quote: 2 });
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
    const byFile = new Map<string, { tier: SelectVoiceTier; who: Set<string>; clip: string }>();
    for (const id of CHAMP_IDS) {
      const rung = resolveSelectVoice(id, PUBLIC);
      if (!rung) continue;
      for (const clip of rung.clips) {
        const key = sha(clip);
        const slot = byFile.get(key) ?? { tier: rung.tier, who: new Set<string>(), clip };
        slot.who.add(quotes[id]?.name ?? id);
        byFile.set(key, slot);
      }
    }
    const collisions = [...byFile.values()].filter((s) => s.who.size > 1);

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
  it("is a parseable template that contributes nothing yet", () => {
    cover("voice-select-pack");
    expect(PACK).not.toBeNull();
    expect(Object.keys(PACK?.champions ?? {})).toEqual([]);
    // With rung 2 empty, nothing about the answers above depends on it — which
    // is exactly what makes writing that file a drop-in for the voice-gen lane.
    const tiers = new Set<SelectVoiceTier>();
    for (const id of CHAMP_IDS) {
      const rung = resolveSelectVoice(id, PUBLIC);
      if (rung) tiers.add(rung.tier);
    }
    expect(tiers.has("generated")).toBe(false);
  });
});

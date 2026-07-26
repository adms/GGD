#!/usr/bin/env tsx
/**
 * tools/voice-gen/index-lines.mjs — fold the generated CosyVoice3 voice line
 * corpus (content/assets/audio/voices/lines/) into the drop-in client contract
 * content/assets/audio/voices/champions/MANIFEST.json (schema
 * audio.champion-voice-pack@1), tasks #27 (click) + #184 (distinctiveness) +
 * the contextual combat-voice layer.
 *
 * WHAT IT WRITES. One MANIFEST.json entry per COMPLETE hero. Each entry's
 * `lines` is keyed by ALL 46 authoritative categories (skill-name×{q,w,e,r,ex},
 * respond×{ok,no}, and the 39 singletons) PLUS a synthesized "select" pool that
 * the rung-2 click reads. Every clip object points DIRECTLY at the lines/ file
 * (`assets/audio/voices/lines/<id>/<cat>.mp3`) — the manifest's informational
 * clipRoot is never joined onto it, so nothing is copied or symlinked; the full
 * clip path wins in normalizeVoiceClipPath.
 *
 * ENUMERATION, NOT GLOB. The 46 keys are expanded from CATEGORIES.json, never a
 * directory glob — a glob would pull reference.wav, takes/*.mp3 and .method
 * sidecars into the pool. status.json is the per-clip source of truth
 * (text/lang/current.seconds/current.hash/current.bytes).
 *
 * COMPLETENESS GATE. A hero ships only when every one of its 46 category mp3s
 * exists on disk AND status.lines[cat].current is present AND the on-disk byte
 * size matches status.current.bytes. A mismatch or a missing clip FAILS the
 * build (never ships a corrupt/absent clip silently). The gate is on-disk
 * reality + status.json, NOT ROSTER.json's `counts.generated` — that snapshot
 * lags the last generation pass (skill-name lines land after it is written).
 *
 * FORM SHARING —「變身前/後共用就好」 (owner 2026-07-26, task #249). A base and
 * its alternate are ONE character (the map's own `Eme1`/`Emeu` + `unsf` names
 * say so), so after the per-hero pass every pair with clips on exactly ONE side
 * lends them to the other: the entry is a copy of the donor's, stamped
 * `sharedFrom`, with the clip paths still pointing at the DONOR's files. Nothing
 * is copied, symlinked or re-encoded. Both directions happen for real today —
 * ten alternate→base (the #249 roster swap left the ten swapped-in bases mute)
 * and nine base→alternate (what the #119 morph will need). The plan comes from
 * `packages/shared/src/content/voiceFormSharing.ts`, which reads the closed
 * 26-pair table; this file only applies it. That is why the script runs under
 * `tsx` rather than bare node.
 *
 * A shared entry is NOT a generation status. `ROSTER.json` and the admin voice
 * page still show these champions as having no clips of their own, because they
 * do not — the share is a playback fallback, and conflating the two would
 * fabricate generation status.
 *
 * DETERMINISTIC. Champion keys and category keys are sorted so the git diff is
 * stable and reviewable. Run before `pnpm content:build`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFormVoiceShares,
  planFormVoiceShares,
} from "../../packages/shared/src/content/voiceFormSharing.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const LINES_DIR = join(REPO, "content/assets/audio/voices/lines");
const OUT_PATH = join(REPO, "content/assets/audio/voices/champions/MANIFEST.json");
/** Clip paths are content-mount relative; the client strips no prefix here. */
const CLIP_BASE = "assets/audio/voices/lines";

/**
 * The select-pool source categories: short (<=2s per CATEGORIES.json maxSeconds)
 * click-acknowledge lines. `quote` is DELIBERATELY excluded — it is the rung-5
 * floor and the #120/#139/#142 champ-select payoff, not a spammable ack.
 */
const SELECT_SOURCE_CATEGORIES = ["taunt", "respond.ok", "respond.no", "love", "thanks", "puzzled"];
const SELECT_CATEGORY = "select";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Expand CATEGORIES.json to the authoritative 46-key list (never a glob). */
function canonicalCategories(cats) {
  const out = [];
  for (const c of cats.categories) {
    if (c.expand === "abilitySlots") {
      for (const s of cats.expansions.abilitySlots) out.push(`${c.id}.${s}`);
    } else if (c.expand === "okNo") {
      for (const s of cats.expansions.okNo) out.push(`${c.id}.${s}`);
    } else {
      out.push(c.id);
    }
  }
  return out;
}

function fail(msg) {
  console.error(`[voice:index] FAIL — ${msg}`);
  process.exit(1);
}

function main() {
  if (!existsSync(LINES_DIR)) {
    fail(`lines dir not found: ${LINES_DIR} (nothing to index)`);
  }
  const cats = readJson(join(LINES_DIR, "CATEGORIES.json"));
  const roster = readJson(join(LINES_DIR, "ROSTER.json"));
  const CANON = canonicalCategories(cats);
  if (CANON.length !== 46) fail(`expected 46 categories, expanded ${CANON.length}`);

  const champions = {};
  let shipped = 0;
  let skipped = 0;

  for (const champ of roster.champions) {
    const id = champ.championId;
    const dir = join(LINES_DIR, id);
    const statusPath = join(dir, "status.json");
    if (!existsSync(statusPath)) {
      skipped++;
      console.warn(`[voice:index] skip ${id}: no status.json`);
      continue;
    }
    const status = readJson(statusPath);
    const statusLines = status.lines ?? {};

    // Completeness gate: all 46 clips present + status.current + byte match.
    const problems = [];
    const clipByCat = {};
    for (const cat of CANON) {
      const mp3 = join(dir, `${cat}.mp3`);
      const entry = statusLines[cat];
      if (!existsSync(mp3)) {
        problems.push(`missing mp3 ${cat}`);
        continue;
      }
      if (!entry || !entry.current) {
        problems.push(`no status.current ${cat}`);
        continue;
      }
      const cur = entry.current;
      const size = statSync(mp3).size;
      if (typeof cur.bytes === "number" && cur.bytes !== size) {
        problems.push(`byte mismatch ${cat}: status=${cur.bytes} disk=${size}`);
        continue;
      }
      const seconds = typeof cur.seconds === "number" && Number.isFinite(cur.seconds) ? cur.seconds : 0;
      clipByCat[cat] = {
        clip: `${CLIP_BASE}/${id}/${cat}.mp3`,
        text: typeof entry.text === "string" ? entry.text : "",
        lang: typeof entry.lang === "string" ? entry.lang : "ja",
        durationSec: seconds,
        speakerSim: null,
        hash: typeof cur.hash === "string" ? cur.hash : null,
      };
    }

    // A hero listed in the roster but incomplete on disk is a HARD failure only
    // if it is PARTIALLY present (a corrupt drop); a hero with nothing is simply
    // not ready and is skipped. Here every roster hero is expected complete, so
    // any problem fails the build — a silent half-ship is the exact defect the
    // gate exists to prevent.
    if (problems.length > 0) {
      fail(`${id} incomplete: ${problems.slice(0, 6).join("; ")}${problems.length > 6 ? " …" : ""}`);
    }

    // Synthesize the select pool from the short ack categories (never quote).
    const select = [];
    for (const cat of SELECT_SOURCE_CATEGORIES) {
      const c = clipByCat[cat];
      if (c) select.push({ ...c });
    }
    if (select.length === 0) fail(`${id}: select pool empty (no ack clips)`);

    // Build the lines map: all 46 categories, category keys SORTED, plus select.
    const lines = {};
    lines[SELECT_CATEGORY] = select;
    for (const cat of [...CANON].sort()) {
      lines[cat] = [clipByCat[cat]];
    }

    champions[id] = {
      engine: roster.engine?.name ?? "cosyvoice3",
      variant: roster.engine?.version ?? "cv3-0.5b",
      lines,
    };
    shipped++;
  }

  // FORM SHARING. Every pair with clips on exactly ONE side lends them to the
  // other, in whichever direction the corpus happens to sit. The borrowed entry
  // is the donor's, stamped `sharedFrom`, so its clip paths still point at the
  // donor's files — nothing is copied. A champion that owns a pack is never
  // named, so a real recorded asset can never be shadowed by a borrowed one.
  const shares = planFormVoiceShares(Object.keys(champions));
  const withShares = applyFormVoiceShares(champions, shares);
  const landed = shares.filter((s) => withShares[s.championId]);

  // Sort champion keys for a stable diff.
  const sortedChamps = {};
  for (const id of Object.keys(withShares).sort()) sortedChamps[id] = withShares[id];

  const manifest = {
    id: "champion-voice-pack",
    schema: "audio.champion-voice-pack@1",
    note:
      "GENERATED by tools/voice-gen/index-lines.mjs from content/assets/audio/voices/lines/. " +
      "Per-champion CosyVoice3 cloned voice pack. Drives the rung-2 select click " +
      "(selectVoiceLadder.ts, lines.select[].clip) AND the contextual combat-voice " +
      "layer (contextualVoice.ts, lines[<category>]). Do not hand-edit; re-run `pnpm voice:index`.",
    generator: "tools/voice-gen/index-lines.mjs",
    clipRoot: "assets/audio/voices/lines",
    loudness:
      "CosyVoice3 cv3-0.5b clone, per-line takes; clips point directly at lines/ (verified by status.json bytes+hash).",
    selectSourceCategories: SELECT_SOURCE_CATEGORIES,
    categoryCount: CANON.length,
    /** Champions with clips of their OWN under lines/. */
    generatedCount: shipped,
    /** Champions speaking with their w3x form counterpart's pack (see formShares). */
    sharedCount: landed.length,
    /** Total entries a client can resolve = generatedCount + sharedCount. */
    championCount: shipped + landed.length,
    formSharesNote:
      "「變身前/後共用就好」 (owner 2026-07-26, task #249): a base and its ALTERNATE form are ONE " +
      "character per the map's Eme1/Emeu + unsf evidence, so one pack serves both. Each entry below " +
      "carries `sharedFrom` and its clip paths point at the DONOR's files — nothing was copied. " +
      "This is a PLAYBACK fallback, not a generation status: ROSTER.json still (correctly) shows " +
      "these champions as having no clips of their own.",
    formShares: landed,
    champions: sortedChamps,
  };

  writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const byDir = landed.reduce((m, s) => ((m[s.direction] = (m[s.direction] ?? 0) + 1), m), {});
  console.log(
    `[voice:index] wrote ${OUT_PATH}\n  ${shipped} champions shipped, ${skipped} skipped, ${CANON.length} categories each + select pool.` +
      `\n  ${landed.length} form-shared entries (${JSON.stringify(byDir)}):` +
      landed.map((s) => `\n    ${s.championId} ← ${s.sharedFrom}  #${s.heroNumber}`).join(""),
  );
}

main();

/** sha256 helper kept for provenance parity (unused in the emit path). */
export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

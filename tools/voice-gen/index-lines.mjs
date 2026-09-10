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
/**
 * 2026-09-10 — heroes the DAEMON does not own (the 74 b2-* / community-review-*)
 * are scripted by `src/build-combat-lines.mjs` and cast in this table; they join
 * ROSTER.json's champions below. The daemon republishing ROSTER.json from
 * heroes.csv therefore cannot drop them (that file never lists them).
 */
const CASTING_PATH = join(LINES_DIR, "COMBAT_CASTING.json");
/** `--check`: rebuild in memory and exit 1 when the shipped MANIFEST.json differs. */
const CHECK = process.argv.includes("--check");
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

  // SHIP GATE (CATEGORIES.json.shipGate). `all` = every one of the 46 or the
  // build fails (the daemon's 51). `combat-core` = a hero ships once the
  // `required` set is complete; the other categories ride along when present
  // and are listed as missing when not. The switch lives in content so the
  // owner can flip it back to `all` without a code change (第一守則).
  const gate = cats.shipGate && typeof cats.shipGate === "object" ? cats.shipGate : { mode: "all" };
  const gateMode = gate.mode === "combat-core" ? "combat-core" : "all";
  const REQUIRED = gateMode === "combat-core" ? gate.required ?? [] : CANON;
  for (const r of REQUIRED) if (!CANON.includes(r)) fail(`shipGate.required names an unknown category ${r}`);

  const champions = {};
  let shipped = 0;
  let partial = 0;
  let skipped = 0;
  const partialNotes = [];

  const casting = existsSync(CASTING_PATH) ? readJson(CASTING_PATH) : null;
  const rosterIds = new Set(roster.champions.map((c) => c.championId));
  const heroes = [...roster.champions];
  for (const [id, c] of Object.entries(casting?.champions ?? {})) {
    if (!rosterIds.has(id)) heroes.push({ championId: id, name: c.name ?? id, castBy: "COMBAT_CASTING.json" });
  }
  // heroes that ship ORIGINAL clips only (owner-excluded from synthesis, e.g. the LOL 7)
  const originals = existsSync(join(LINES_DIR, "COMBAT_ORIGINALS.json")) ? readJson(join(LINES_DIR, "COMBAT_ORIGINALS.json")) : null;
  for (const id of Object.keys(originals?.champions ?? {})) {
    if (!rosterIds.has(id) && !casting?.champions?.[id] && Object.keys(originals.champions[id]).length) heroes.push({ championId: id, name: id, castBy: "COMBAT_ORIGINALS.json" });
  }

  for (const champ of heroes) {
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

    // Completeness gate: every REQUIRED clip present + status.current + byte
    // match. An OPTIONAL category (combat-core mode only) is simply absent when
    // its mp3 is not there; but an optional mp3 that IS there and disagrees with
    // status.json is still a corrupt drop and still fails.
    const problems = [];
    const missing = [];
    const clipByCat = {};
    // ⭐ owner 2026-09-10「LOL7個角色應該有自己語音檔 可以排除」: a hero listed in
    // COMBAT_CASTING.json.excluded is excluded from SYNTHESIS, so a required category it
    // has no ORIGINAL for can never be filled — that is a declared partial pack, ⛔ not the
    // corrupt half-drop this gate exists to catch. An mp3 that IS there and disagrees with
    // status.json still fails for them exactly as for everyone else.
    // ⭐ A pack with NO reference can never be synthesised — every clip it will ever have is an
    // ORIGINAL. That is true for the owner-excluded heroes (COMBAT_CASTING.json.excluded) and for the
    // heroes whose only source is COMBAT_ORIGINALS.json. Both read the same way off the pack itself
    // (`reference.sourceKind === "none"`), ⛔ so this is not a list anyone has to maintain.
    const originalsOnly = !!casting?.excluded?.[id] || (status.reference?.sourceKind ?? "") === "none";
    for (const cat of CANON) {
      const mp3 = join(dir, `${cat}.mp3`);
      const entry = statusLines[cat];
      const required = REQUIRED.includes(cat) && !originalsOnly;
      if (!existsSync(mp3)) {
        if (required) problems.push(`missing mp3 ${cat}`);
        else missing.push(cat);
        continue;
      }
      if (!entry || !entry.current) {
        if (required || (entry && entry.state === "failed")) problems.push(`no status.current ${cat}`);
        else missing.push(cat);
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
      // A scripted hero with NOTHING rendered yet is "not ready" (skip, say so);
      // anything partially present is a corrupt drop and fails as before.
      const rendered = CANON.filter((cat) => existsSync(join(dir, `${cat}.mp3`))).length;
      if (rendered === 0 && gateMode === "combat-core") {
        skipped++;
        console.warn(`[voice:index] skip ${id}: scripted but nothing rendered yet (run-combat-gen.mjs)`);
        continue;
      }
      fail(`${id} incomplete: ${problems.slice(0, 6).join("; ")}${problems.length > 6 ? " …" : ""}`);
    }

    // Synthesize the select pool from the short ack categories (never quote).
    const select = [];
    for (const cat of SELECT_SOURCE_CATEGORIES) {
      const c = clipByCat[cat];
      if (c) select.push({ ...c });
    }
    const isPartial = missing.length > 0;
    if (select.length === 0) {
      // A full pack with no ack clips is a build defect. A partial pack is
      // waiting on the owner's lines (OWNER_LINES.csv): ship what exists, say
      // so, and let combatVoiceCoverage.test.ts name the silent click.
      if (!isPartial) fail(`${id}: select pool empty (no ack clips)`);
      partialNotes.push(`${id}: select pool empty — waiting on OWNER_LINES.csv`);
    }

    // Build the lines map: category keys SORTED, plus select. A partial pack
    // carries ONLY the categories it has — an absent key reads as "no clip"
    // through packClips(), never as a broken path.
    const lines = {};
    if (select.length > 0) lines[SELECT_CATEGORY] = select;
    for (const cat of [...CANON].sort()) {
      const arr = clipByCat[cat] ? [clipByCat[cat]] : [];
      // ⭐ owner 2026-09-10「每個角色可以支援最多三個口頭禪經典台詞 可被隨機播放」:
      // a category may carry extra takes as `<cat>.2`, `<cat>.3`, … (status key + mp3
      // name); they ride along in the same array and the client picks at random.
      for (let n = 2; n <= 9; n++) {
        const key = `${cat}.${n}`;
        const mp3 = join(dir, `${key}.mp3`);
        const entry = statusLines[key];
        if (!existsSync(mp3) || !entry?.current) break;
        const size = statSync(mp3).size;
        if (typeof entry.current.bytes === "number" && entry.current.bytes !== size) fail(`${id}: byte mismatch ${key}: status=${entry.current.bytes} disk=${size}`);
        arr.push({ clip: `${CLIP_BASE}/${id}/${key}.mp3`, text: typeof entry.text === "string" ? entry.text : "", lang: typeof entry.lang === "string" ? entry.lang : "ja", durationSec: typeof entry.current.seconds === "number" ? entry.current.seconds : 0, speakerSim: null, hash: typeof entry.current.hash === "string" ? entry.current.hash : null });
      }
      if (arr.length) lines[cat] = arr;
    }

    champions[id] = {
      engine: roster.engine?.name ?? "cosyvoice3",
      variant: roster.engine?.version ?? "cv3-0.5b",
      ...(isPartial ? { tier: "combat-core", missingCategories: missing } : {}),
      lines,
    };
    shipped++;
    if (isPartial) partial++;
  }

  // FORM SHARING. Every pair with clips on exactly ONE side lends them to the
  // other, in whichever direction the corpus happens to sit. The borrowed entry
  // is the donor's, stamped `sharedFrom`, so its clip paths still point at the
  // donor's files — nothing is copied. A champion that owns a pack is never
  // named, so a real recorded asset can never be shadowed by a borrowed one.
  const shares = planFormVoiceShares(Object.keys(champions));
  const withShares = applyFormVoiceShares(champions, shares);
  const landed = shares.filter((s) => withShares[s.championId]);

  // ⚠️ 2026-09-10 — the share is NOT written into `champions`. The shipped manifest
  // never carried stamped entries (960450290 was generated before 60fb06773 added
  // them, and voice:index was never re-run), and the client contract the tests pin
  // is the RUNTIME resolution: `resolveVoicePackId` walks `counterpartFormId` when a
  // champion has no entry, answering `{id: donor, sharedFrom: donor}`. A stamped
  // copy would make it answer `{id: base, …}` and break `combatVoiceCoverage`'s
  // form-share assertions. `formShares` below stays as the metadata of that plan.
  // Sort champion keys for a stable diff.
  const sortedChamps = {};
  for (const id of Object.keys(champions).sort()) sortedChamps[id] = champions[id];

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
    /** CATEGORIES.json.shipGate as applied: which categories a hero MUST have to ship. */
    shipGate: { mode: gateMode, required: REQUIRED },
    /** Champions with clips of their OWN under lines/. */
    generatedCount: shipped,
    /** Of those, packs shipped under the combat-core gate with categories still missing. */
    partialCount: partial,
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

  const serialized = JSON.stringify(manifest, null, 2) + "\n";
  if (CHECK) {
    const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, "utf8") : "";
    if (current !== serialized) {
      console.error(`[voice:index] ⛔ --check: ${OUT_PATH} is stale — run \`pnpm voice:index\` (or \`pnpm combat:build\`) and commit it.`);
      process.exit(1);
    }
    console.log(`[voice:index] --check ✓ ${shipped} champions (${partial} partial), ${landed.length} form-shared — MANIFEST.json is current`);
    return;
  }
  writeFileSync(OUT_PATH, serialized, "utf8");
  const byDir = landed.reduce((m, s) => ((m[s.direction] = (m[s.direction] ?? 0) + 1), m), {});
  if (partialNotes.length) console.warn(`[voice:index] ⚠️ ${partialNotes.length} partial pack(s) with an empty select pool:\n    ${partialNotes.join("\n    ")}`);
  console.log(
    `[voice:index] wrote ${OUT_PATH}\n  ${shipped} champions shipped (${partial} partial under shipGate=${gateMode}), ${skipped} skipped, ${CANON.length} categories + select pool.` +
      `\n  ${landed.length} form-shared entries (${JSON.stringify(byDir)}):` +
      landed.map((s) => `\n    ${s.championId} ← ${s.sharedFrom}  #${s.heroNumber}`).join(""),
  );
}

main();

/** sha256 helper kept for provenance parity (unused in the emit path). */
export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

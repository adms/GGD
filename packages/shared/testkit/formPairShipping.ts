/**
 * WHICH 變身 PAIRS ARE STILL OPERATIONAL — one derivation, shared by the four
 * transform suites.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * owner 2026-08-13 moved every unreleased hero out of the operating content:
 * 「你可不可以把沒開放的英雄資料包含技能都放到一個 legacy 區 預設不要再被讀取到了」.
 * `content/_legacy/` is NOT in `COLLECTION_NAMES`, so the engine cannot see it —
 * a champion in there has no doc, no registry entry, and no reachable transform.
 *
 * `CHAMPION_FORM_PAIRS` is unaffected by that move and must stay unaffected: it
 * is the w3x map's own `Eme1`/`Emeu` table, pinned against
 * `TRANSFORM_FORMS.json`. What changed is not "which pairs the map declares" but
 * "which of them are currently shipped". So the four suites that used to iterate
 * all 26 now iterate {@link shippedFormPairs}, and the archived half is asserted
 * to be genuinely absent rather than skipped.
 *
 * ---------------------------------------------------------------------------
 * THE INVARIANT THAT MATTERS MORE THAN THE COUNT
 * ---------------------------------------------------------------------------
 * A pair must migrate WHOLESALE. Base shipped + alternate archived is the state
 * that kills a room: `spawnChampion` binds the base's ability ids, the player
 * presses the transform, and `Registry.get()` throws inside the snapshot builder
 * 30 times a second for all six players. {@link splitFormPairsByShipping}
 * reports that state as {@link FormPairShipping.halfMigrated} so every caller
 * fails on it instead of quietly iterating a smaller set — the counts here are
 * derived, but this one is a hard structural rule.
 *
 * Everything below is read from the content DIRECTORIES, never from a written
 * down number: re-shipping a hero flips its pair back on its own.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAMPION_FORM_PAIRS, type ChampionFormPair } from "../src/content/championForms";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `content/`, from this file. */
export const CONTENT_ROOT = join(HERE, "../../../content");

/** The archive owner 2026-08-13 created. Deliberately outside `COLLECTION_NAMES`. */
export const LEGACY_ROOT = join(CONTENT_ROOT, "_legacy");

function docIdsIn(dir: string, optional = false): ReadonlySet<string> {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch (err) {
    // `content/champions` missing is a broken checkout and must scream. The
    // ARCHIVE missing is a legitimate future state (everything re-shipped), and
    // an ENOENT there would be a stack trace where the useful failure is a
    // NAMED one — "this archived id is in neither tree" — from the callers.
    if (!optional) throw err;
    return new Set();
  }
  return new Set(
    files
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => f.slice(0, -".json".length)),
  );
}

/**
 * Champion doc ids the engine can currently load, by FILENAME.
 *
 * Filename, not the `id` field, on purpose: this set answers "which side of the
 * legacy move is this doc on", and the suites that care about `id` correctness
 * (championFormsResolve) ask the registry instead. The two questions are
 * separate and conflating them is how a typo'd `id` passes a file sweep.
 */
export const OPERATIONAL_CHAMPION_FILE_IDS: ReadonlySet<string> = docIdsIn(
  join(CONTENT_ROOT, "champions"),
);

/** Champion doc ids parked in `content/_legacy/champions`. */
export const LEGACY_CHAMPION_FILE_IDS: ReadonlySet<string> = docIdsIn(
  join(LEGACY_ROOT, "champions"),
  true,
);

export interface FormPairShipping {
  /** Both halves are in `content/champions` — the engine can reach this pair. */
  readonly shipped: readonly ChampionFormPair[];
  /** Both halves are in `content/_legacy/champions` — archived wholesale. */
  readonly archived: readonly ChampionFormPair[];
  /**
   * Halves on OPPOSITE sides of the move, or a half on neither side. Always
   * empty in a healthy tree; every caller asserts that, because this is the
   * state that throws inside the per-tick snapshot builder.
   */
  readonly halfMigrated: readonly string[];
}

/** Partition the w3x pair table by where each half's doc currently lives. */
export function splitFormPairsByShipping(
  pairs: readonly ChampionFormPair[] = CHAMPION_FORM_PAIRS,
): FormPairShipping {
  const shipped: ChampionFormPair[] = [];
  const archived: ChampionFormPair[] = [];
  const halfMigrated: string[] = [];
  const where = (id: string): "shipped" | "archived" | "missing" =>
    OPERATIONAL_CHAMPION_FILE_IDS.has(id)
      ? "shipped"
      : LEGACY_CHAMPION_FILE_IDS.has(id)
        ? "archived"
        : "missing";
  for (const pair of pairs) {
    const b = where(pair.baseId);
    const a = where(pair.alternateId);
    if (b === "shipped" && a === "shipped") shipped.push(pair);
    else if (b === "archived" && a === "archived") archived.push(pair);
    else {
      halfMigrated.push(
        `${pair.heroNumber} ${pair.abilityName}: base ${pair.baseId} is ${b} but ` +
          `alternate ${pair.alternateId} is ${a} — a transform pair must move wholesale`,
      );
    }
  }
  return { shipped, archived, halfMigrated };
}

/** Convenience: the shipped half of the partition. */
export const shippedFormPairs = (): readonly ChampionFormPair[] =>
  splitFormPairsByShipping().shipped;

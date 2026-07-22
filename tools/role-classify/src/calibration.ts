/**
 * The CALIBRATION SET — champions whose role a human read off the actual kit,
 * independently of this classifier, before it existed.
 *
 * These four came out of the task #47 starter-set curation, where each kit was
 * read by hand to prove the roster IS differentiated even though `role` says
 * otherwise. They are the only labels here not produced by the thing they are
 * checking, which is exactly what makes them worth keeping: if a heuristic
 * tweak breaks one of these, the tweak is wrong, not the label.
 *
 * Kept deliberately small and sourced, not padded out with the classifier's
 * own confident guesses — a calibration set you generated from the model under
 * test measures nothing.
 */
export interface CalibrationCase {
  id: string;
  expected: string;
  /** what a human saw in the kit — the reason the label is trustworthy. */
  rationale: string;
}

export const CALIBRATION: readonly CalibrationCase[] = [
  {
    id: "godie-hpb1",
    expected: "tank",
    rationale: "640 hp (roster top 10%) and a 50% damage-reduction barrier on R",
  },
  {
    id: "godie-h020",
    expected: "mage",
    rationale: "textbook burst mage — INT-scaling nukes on a 6524 mana pool",
  },
  {
    id: "godie-etyr",
    expected: "support",
    rationale: "enchanter/healer — cleanse, heal and an ally aura",
  },
  {
    id: "godie-e001",
    expected: "assassin",
    rationale: "stealth assassin — 隱形 opener into single-target burst",
  },
];

/**
 * Roles a human wrote by hand in the content tree. The two CC0 stand-ins were
 * authored with real roles before the importer ever ran, so they are held out
 * of the backfill entirely — but the report still scores them, because a model
 * that disagrees with both hand-written labels is worth looking at twice.
 */
export const HAND_AUTHORED: readonly string[] = ["sela", "thorne"];

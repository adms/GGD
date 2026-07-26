/**
 * voiceFormSharing — 「變身前/後共用就好」 as a pure, testable plan.
 *
 * ---------------------------------------------------------------------------
 * THE BUG IT CLOSES
 * ---------------------------------------------------------------------------
 * Task #249 proved from the map's own `Eme1`/`Emeu` fields that ten of the fifty
 * first-open-roster slots were shipping a champion's TRANSFORMED body as if it
 * were the hero, and swapped them back to their base. But the generated combat
 * voice corpus — `content/assets/audio/voices/lines/` — had been generated
 * against the OLD roster, so it holds exactly those ten ALTERNATES and none of
 * the ten bases. After the swap, ten of the fifty playable champions had no
 * combat voice at all (`tform-13`).
 *
 * The asset answer would be 460 more CosyVoice clips. The owner ruled
 * 2026-07-26 「變身前/後共用就好」, and that ruling is not a shortcut — it is the
 * finding of #249 applied to audio. A base and its alternate are ONE character:
 * the map says so in `unsf`, where every base is the bare 編號 「(NN)」 and every
 * alternate names the form 「(NN變身名)」. 悟空 and 超級賽亞人-悟空 have one voice
 * because they are one person.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE IS (and what it is not)
 * ---------------------------------------------------------------------------
 * A PLANNER, not a player. Given the set of champion ids that own a generated
 * voice pack, it returns the list of counterpart ids that should BORROW one, and
 * from whom. It reads the closed 26-pair table in `championForms.ts` — the
 * `Eme1`/`Emeu` link re-derived by an independent binary parser with 0
 * mismatches — and never a name, a mesh or a 編號 heuristic.
 *
 * The plan is applied at BUILD time by `tools/voice-gen/index-lines.mjs`, which
 * writes the borrowed entries into `champions/MANIFEST.json` alongside the
 * generated ones, each stamped `sharedFrom`. Build-time was chosen over a
 * runtime lookup fallback for three reasons:
 *
 *   1. INSPECTABLE. The share shows up as a reviewable diff in the manifest and
 *      as a `formShares` block in its header, so "why does 悟空 sound like this"
 *      is answered by reading a file, not by re-deriving a code path.
 *   2. CANNOT SILENTLY MISS. A runtime fallback is invisible when it fails —
 *      the champion is simply quiet, which is exactly the failure mode that went
 *      unnoticed here. A build-time mapping is asserted by
 *      `combatVoiceCoverage.test.ts` over the SHIPPED artifact, so a future
 *      roster change that reopens the hole fails a test and names the champions.
 *   3. ONE READER. `packClips()` keeps its single, dumb lookup. Adding a second
 *      resolution path inside it would mean two places can decide what a
 *      champion says, and the runtime one would mask a stale manifest.
 *
 * ---------------------------------------------------------------------------
 * DIRECTION-AGNOSTIC ON PURPOSE
 * ---------------------------------------------------------------------------
 * The plan does not care which half of a pair is the hero. Whichever side has
 * clips donates to the side that does not:
 *
 *   • alternate → base  — today's ten regressions (悟空 borrows from 超級賽亞人).
 *   • base → alternate  — nine pairs today, and the direction that matters when
 *     the transform mechanic ships (#119): the moment a player morphs into
 *     `godie-e00l`, the alternate needs a voice and only the base has one.
 *
 * Both directions are live in the shipped manifest right now, so neither is a
 * hypothetical waiting for a test to invent it.
 *
 * A pair where BOTH halves have their own pack shares nothing — a real recorded
 * asset is never shadowed by a borrowed one. A pair where NEITHER half has one
 * shares nothing either, and the champion stays silent through this layer rather
 * than throwing; the select ladder's name/quote rungs still answer the click.
 */
import { CHAMPION_FORM_PAIRS } from "./championForms";

/** Which way a borrowed pack travels across a w3x form pair. */
export type FormShareDirection = "alternate-to-base" | "base-to-alternate";

/** One champion borrowing its counterpart's voice pack. */
export interface FormVoiceShare {
  /** The champion that had NO pack of its own and now speaks. */
  readonly championId: string;
  /** The counterpart whose generated clips it borrows. */
  readonly sharedFrom: string;
  /** The task #11 hero 編號 both halves share, e.g. "09". */
  readonly heroNumber: string;
  readonly direction: FormShareDirection;
}

/**
 * The shares to add, given the ids that OWN a generated pack.
 *
 * Deterministic: ordered by `championId` so the generated manifest diff is
 * stable. Ids outside the 26-pair table are ignored — they have no counterpart
 * and there is nothing to borrow.
 */
export function planFormVoiceShares(idsWithOwnPack: Iterable<string>): FormVoiceShare[] {
  const owned = new Set(idsWithOwnPack);
  const shares: FormVoiceShare[] = [];
  for (const pair of CHAMPION_FORM_PAIRS) {
    const hasBase = owned.has(pair.baseId);
    const hasAlt = owned.has(pair.alternateId);
    // Both → nothing to lend. Neither → nothing to lend FROM.
    if (hasBase === hasAlt) continue;
    shares.push(
      hasAlt
        ? {
            championId: pair.baseId,
            sharedFrom: pair.alternateId,
            heroNumber: pair.heroNumber,
            direction: "alternate-to-base",
          }
        : {
            championId: pair.alternateId,
            sharedFrom: pair.baseId,
            heroNumber: pair.heroNumber,
            direction: "base-to-alternate",
          },
    );
  }
  shares.sort((a, b) => (a.championId < b.championId ? -1 : a.championId > b.championId ? 1 : 0));
  return shares;
}

/**
 * Apply a plan to a champion→entry map, returning a NEW map.
 *
 * The borrowed entry is a shallow copy of the donor's with `sharedFrom` stamped
 * on it, so its clip paths keep pointing at the donor's files on disk — nothing
 * is copied, symlinked or re-encoded. Entries that already exist are passed
 * through UNTOUCHED and un-stamped, so "has `sharedFrom`" reads as "this pack is
 * borrowed" everywhere downstream. The overwrite guard is belt-and-suspenders:
 * `planFormVoiceShares` never names an owner, and this refuses to shadow one
 * even if a stale plan did.
 */
export function applyFormVoiceShares<T extends object>(
  entries: Readonly<Record<string, T>>,
  shares: readonly FormVoiceShare[],
): Record<string, T> {
  const out: Record<string, T> = { ...entries };
  for (const share of shares) {
    if (out[share.championId]) continue; // never shadow a real pack
    const donor = entries[share.sharedFrom];
    if (!donor) continue; // donor vanished — degrade to silence, never throw
    out[share.championId] = { ...donor, sharedFrom: share.sharedFrom };
  }
  return out;
}

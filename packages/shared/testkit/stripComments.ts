/**
 * stripComments — the ONE correct way to blind a source scan to prose.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS (found while writing the #272 wiring guard)
 * ---------------------------------------------------------------------------
 * Several guards in this repo prove a piece of WIRING exists by reading a
 * source file and matching the line that carries the feature (the alternative —
 * instantiating GameApp or a Colyseus Room headlessly — is not possible). Every
 * one of them must strip comments first, or the module doc explaining the line
 * would satisfy the assertion against a file where the line had been deleted.
 *
 * The obvious way to do that is TWO passes — "remove every block comment, then
 * remove every line comment" — and it is WRONG in a way that fails silently and
 * in the dangerous direction.
 *
 * MEASURED, on apps/client/src/GameApp.ts at the time of writing. Line 489 is a
 * LINE comment that mentions a glob:
 *
 *     // render (double-star) may not read it (client-08), so the entity …
 *
 * Written literally, that glob is a slash-star-star — which the block-comment
 * pass reads as an OPENING delimiter, running to the next closing delimiter
 * 231 lines later. Every line in between vanished from the scanned text,
 * including `this.connStats.noteSent(msg.seq, performance.now())`. A guard
 * asserting that call exists failed on correct code; worse, a guard asserting
 * something must NOT be present would have PASSED on code that still had it.
 *
 * This project writes such globs constantly in prose (render, ui/hud,
 * packages/shared/src/sim …), so the trap is not exotic — it is one glob away
 * at all times.
 *
 * THE FIX is a single left-to-right pass with an alternation, so whichever
 * comment opens FIRST wins: a line comment that happens to contain a
 * slash-star is consumed as a line comment, and a block comment that contains
 * a double-slash is consumed as a block.
 *
 * WHAT IT STILL DOES NOT DO, honestly: it does not parse strings, template
 * literals or regex literals, so a URL like "https:" + "//x" loses its tail.
 * That is acceptable for these guards — they match code shapes, not string
 * contents — but it is a reason to point a guard at a distinctive statement
 * rather than at a URL or a message string.
 */

/** JS/TS comments, whichever opens first — block, else line. */
const COMMENT = new RegExp("/\\*[\\s\\S]*?\\*/|//[^\\n]*", "g");

/**
 * Remove every comment from a source string so a wiring guard can only match
 * real code. See the module doc for why this is one pass and not two.
 */
export function stripComments(src: string): string {
  return src.replace(COMMENT, "");
}

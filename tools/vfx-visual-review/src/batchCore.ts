import type { ReviewReport } from "./review.js";

export interface ProofFrame {
  file: string;
  atMs: number;
  label: string;
  diagnosticOnly?: boolean;
}

/**
 * Keep model cost bounded: preserve temporal endpoints and evenly sample the
 * semantic event frames selected by the renderer. Diagnostic-only frames are
 * never positive review evidence. One-frame cases are returned as-is and are
 * held for humans instead of being padded with duplicate pixels.
 */
export function selectReviewFrames(frames: readonly ProofFrame[], maxFrames = 18): ProofFrame[] {
  if (!Number.isInteger(maxFrames) || maxFrames < 2 || maxFrames > 18) {
    throw new Error("maxFrames must be an integer between 2 and 18");
  }
  const eligible = frames
    .filter((frame) => !frame.diagnosticOnly)
    .map((frame, sourceIndex) => ({ frame, sourceIndex }))
    .sort((left, right) => left.frame.atMs - right.frame.atMs || left.sourceIndex - right.sourceIndex)
    .filter((entry, index, ordered) => index === 0 || entry.frame.atMs !== ordered[index - 1]!.frame.atMs)
    .map((entry) => entry.frame);
  if (eligible.length <= maxFrames) return [...eligible];
  const last = eligible.length - 1;
  const indexes = Array.from(
    { length: maxFrames },
    (_, index) => Math.round((index * last) / (maxFrames - 1)),
  );
  return [...new Set(indexes)].map((index) => eligible[index]!);
}

/**
 * The browser proof already contains event-selected frames, so its distinct
 * timestamp count is the safest complexity signal. Ordinary runtime skills
 * are capped at eight; the named cinematic/combination set may use up to
 * eighteen.
 */
export function adaptiveReviewFrameBudget(
  frames: readonly ProofFrame[],
  strictVisual: boolean,
  override: number | null = null,
): number {
  if (override !== null) {
    if (!Number.isInteger(override) || override < 2 || override > 18) {
      throw new Error("frame budget override must be an integer between 2 and 18");
    }
    return override;
  }
  const distinctTimes = new Set(
    frames.filter((frame) => !frame.diagnosticOnly).map((frame) => frame.atMs),
  ).size;
  return Math.max(2, Math.min(strictVisual ? 18 : 8, distinctTimes));
}

/** Only genuine uncertainty gets a second, more expensive inference pass. */
export function shouldEscalate(report: ReviewReport): boolean {
  if (report.classification !== "needs-human-review") return false;
  if (report.modelResult.overall === "uncertain") return true;
  if (report.modelResult.confidence < report.policy.minConfidence) return true;
  return report.policy.requiredChecks.some((key) => report.modelResult.checks[key].status === "uncertain");
}

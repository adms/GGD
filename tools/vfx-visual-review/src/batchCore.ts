import type { ReviewReport } from "./review.js";

export interface ProofFrame {
  file: string;
  atMs: number;
  label: string;
  diagnosticOnly?: boolean;
}

/**
 * Keep model cost bounded: preserve temporal endpoints and evenly sample at
 * most two interior phases. Diagnostic-only frames are never positive review
 * evidence. One-frame cases are returned as-is and are held for humans by the
 * batch runner instead of being padded with duplicate pixels.
 */
export function selectReviewFrames(frames: readonly ProofFrame[], maxFrames = 4): ProofFrame[] {
  if (!Number.isInteger(maxFrames) || maxFrames < 2 || maxFrames > 4) {
    throw new Error("maxFrames must be an integer between 2 and 4");
  }
  const eligible = frames.filter((frame) => !frame.diagnosticOnly);
  if (eligible.length <= maxFrames) return [...eligible];
  const last = eligible.length - 1;
  const indexes = maxFrames === 2
    ? [0, last]
    : maxFrames === 3
      ? [0, Math.round(last / 2), last]
      : [0, Math.round(last / 3), Math.round((last * 2) / 3), last];
  return [...new Set(indexes)].map((index) => eligible[index]!);
}

/** Only genuine uncertainty gets a second, more expensive inference pass. */
export function shouldEscalate(report: ReviewReport): boolean {
  if (report.classification !== "needs-human-review") return false;
  if (report.modelResult.overall === "uncertain") return true;
  if (report.modelResult.confidence < report.policy.minConfidence) return true;
  return report.policy.requiredChecks.some((key) => report.modelResult.checks[key].status === "uncertain");
}

export function localLlmEnabled(flag: boolean, environment: string | undefined): boolean {
  return flag || (environment !== undefined && ["1", "true", "yes", "on"].includes(environment.toLowerCase()));
}

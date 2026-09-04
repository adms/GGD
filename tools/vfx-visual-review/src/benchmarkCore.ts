export type BenchmarkExpectation = "pass" | "not-pass";

export interface BenchmarkObservation {
  model: string;
  caseId: string;
  expected: BenchmarkExpectation;
  status: "completed" | "unavailable" | "error";
  overall?: "pass" | "fail" | "uncertain";
  durationMs?: number;
  totalTokens?: number;
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index]!;
}

export function summarizeBenchmark(model: string, observations: readonly BenchmarkObservation[]) {
  const relevant = observations.filter((entry) => entry.model === model);
  const completed = relevant.filter((entry) => entry.status === "completed" && entry.overall !== undefined);
  const correct = completed.filter((entry) =>
    entry.expected === "pass" ? entry.overall === "pass" : entry.overall !== "pass",
  );
  const falseAccepts = completed.filter((entry) => entry.expected === "not-pass" && entry.overall === "pass");
  const falseRejects = completed.filter((entry) => entry.expected === "pass" && entry.overall !== "pass");
  const durations = completed.flatMap((entry) => entry.durationMs === undefined ? [] : [entry.durationMs]);
  const tokens = completed.flatMap((entry) => entry.totalTokens === undefined ? [] : [entry.totalTokens]);
  return {
    model,
    attempts: relevant.length,
    completed: completed.length,
    unavailable: relevant.filter((entry) => entry.status === "unavailable").length,
    errors: relevant.filter((entry) => entry.status === "error").length,
    availability: relevant.length === 0 ? null : completed.length / relevant.length,
    labelledAccuracy: completed.length === 0 ? null : correct.length / completed.length,
    falseAccepts: falseAccepts.length,
    falseRejects: falseRejects.length,
    latencyMs: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: durations.length === 0 ? null : Math.max(...durations),
    },
    totalTokens: {
      mean: tokens.length === 0 ? null : Math.round(tokens.reduce((sum, value) => sum + value, 0) / tokens.length),
      max: tokens.length === 0 ? null : Math.max(...tokens),
    },
  };
}

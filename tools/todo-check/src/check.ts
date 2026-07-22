/** Validation logic for the TODO/test gate (pure, unit-tested). */
import { CATEGORIES, STATUSES, type TodoItem } from "./parse";

export interface StaticReport {
  ok: boolean;
  errors: string[];
  counts: { total: number; byStatus: Record<string, number> };
}

/** Static checks: shape, uniqueness, valid enums. Runs before any code. */
export function checkStatic(items: TodoItem[], parseErrors: string[]): StaticReport {
  const errors: string[] = [...parseErrors];
  const seenId = new Map<string, string>();
  const seenTest = new Map<string, string>();
  const byStatus: Record<string, number> = {};

  for (const it of items) {
    const at = `${it.file}:${it.line}`;
    if (!it.id) errors.push(`${at} empty ID`);
    if (!it.item) errors.push(`${at} (${it.id}) empty item description`);
    if (!it.testId) errors.push(`${at} (${it.id}) missing Test ID — every item needs a test`);
    if (!CATEGORIES.includes(it.category as never))
      errors.push(`${at} (${it.id}) invalid category "${it.category}"`);
    if (!STATUSES.includes(it.status as never))
      errors.push(`${at} (${it.id}) invalid status "${it.status}"`);

    if (it.id) {
      const prev = seenId.get(it.id);
      if (prev) errors.push(`duplicate ID "${it.id}" (${prev} and ${at})`);
      else seenId.set(it.id, at);
    }
    if (it.testId) {
      const prev = seenTest.get(it.testId);
      if (prev) errors.push(`duplicate Test ID "${it.testId}" (${prev} and ${at})`);
      else seenTest.set(it.testId, at);
    }
    byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
  }

  return { ok: errors.length === 0, errors, counts: { total: items.length, byStatus } };
}

export interface RuntimeReport {
  ok: boolean;
  errors: string[];
  uncoveredDone: TodoItem[];
  orphanBeacons: string[];
  coveredCount: number;
}

/**
 * Runtime gate: every item marked `done` must have had its `test_id` covered
 * (executed + passed) in this run. `pending`/`in-progress`/`deferred` are exempt.
 */
export function checkRuntime(items: TodoItem[], coveredTestIds: Set<string>): RuntimeReport {
  const errors: string[] = [];
  const uncoveredDone: TodoItem[] = [];
  const known = new Set(items.map((i) => i.testId).filter(Boolean));

  for (const it of items) {
    if (it.status === "done" && it.testId && !coveredTestIds.has(it.testId)) {
      uncoveredDone.push(it);
      errors.push(
        `${it.file}:${it.line} (${it.id}) is "done" but its test "${it.testId}" did not run+pass`,
      );
    }
  }

  const orphanBeacons = [...coveredTestIds].filter((t) => !known.has(t));
  return {
    ok: errors.length === 0,
    errors,
    uncoveredDone,
    orphanBeacons,
    coveredCount: coveredTestIds.size,
  };
}

/** Parse an NDJSON coverage file's contents into a set of covered test ids. */
export function parseCoverage(ndjson: string): Set<string> {
  const out = new Set<string>();
  for (const line of ndjson.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t) as { cover?: unknown };
      if (typeof obj.cover === "string") out.add(obj.cover);
    } catch {
      // ignore malformed lines
    }
  }
  return out;
}

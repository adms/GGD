/**
 * codexPlan — reads the ICON PLAN that `tools/icon-gen/src/plan.py --write`
 * publishes at `content/config/icon-plan.json`.
 *
 * WHY THE CODEX NEEDS IT. Before this, the broken-data table said "768 沒有圖示"
 * under a note holding three HAND-TYPED numbers (695 stock / 2 map-custom / 168
 * orphans) that were simply wrong — 111 of that 695 were the map author's own
 * art at stock-looking paths, already extracted. A number nobody recomputes
 * rots. Everything here is read from the plan file, which is regenerated from
 * the live tree, so the table cannot drift from reality again.
 *
 * It also lets the table tell the three cases apart, which is the difference
 * between a to-do list and a wall of noise:
 *
 *   DROPPED   deliberately never generated (recipe books under the NO-CRAFTING
 *             ruling, unnamed entries, inert entries). Not a gap — a decision.
 *   BLOCKED   must not be generated yet (third-party IP). A held gate.
 *   BACKLOG   the honest remainder: real content that really has no picture.
 *
 * TWO PAGES READ IT THROUGH THIS ONE READER — the in-game codex bar and 後台管理's
 * ICON 生成追蹤 (task #102) — which is why the file sits in packages/shared
 * rather than beside the codex page it was written for. "Excluded" has exactly
 * one definition, task #72's, and exactly one parser: this one.
 *
 * TOLERANT, like the rest of the codex: the plan is OPTIONAL. A checkout that
 * has never run the planner loads fine and simply gets the smaller, unsplit
 * report — the file is an explanation, never a dependency.
 */

/** One drop/block rule and the entries it caught. */
export interface CodexPlanBucket {
  readonly label: string;
  readonly note: string;
  readonly ids: readonly string[];
}

export interface CodexPlanCounts {
  readonly docs: number;
  readonly have: number;
  readonly drop: number;
  readonly blocked: number;
  readonly generate: number;
  readonly tier1: number;
  readonly tier2: number;
}

export interface CodexPlan {
  readonly templateVersion: string;
  readonly contentDigest: string;
  readonly counts: CodexPlanCounts;
  /** importer resolution → how many missing entries came from it */
  readonly provenance: Readonly<Record<string, number>>;
  readonly dropped: Readonly<Record<string, CodexPlanBucket>>;
  readonly blocked: Readonly<Record<string, CodexPlanBucket>>;
  /** doc id → the rule that dropped it (flattened for O(1) lookup) */
  readonly dropReason: ReadonlyMap<string, string>;
  readonly blockReason: ReadonlyMap<string, string>;
}

export const PLAN_URL = "/content/config/icon-plan.json";

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function buckets(raw: unknown): Record<string, CodexPlanBucket> {
  const out: Record<string, CodexPlanBucket> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const ids = Array.isArray(v.ids) ? v.ids.filter((x): x is string => typeof x === "string") : [];
    out[key] = {
      label: typeof v.label === "string" ? v.label : key,
      note: typeof v.note === "string" ? v.note : "",
      ids,
    };
  }
  return out;
}

function flatten(bs: Record<string, CodexPlanBucket>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, bucket] of Object.entries(bs)) {
    for (const id of bucket.ids) out.set(id, key);
  }
  return out;
}

/**
 * Parse a fetched plan document. Returns null for anything that is not a plan
 * — a 404, an empty file, or a future schema this build does not understand.
 * Never throws: the codex must render without it.
 */
export function parsePlan(raw: unknown): CodexPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;
  if (doc.schema !== "config.icon-plan@1") return null;
  const counts = (doc.counts as Record<string, unknown> | undefined)?.total as
    | Record<string, unknown>
    | undefined;
  if (!counts) return null;
  const dropped = buckets(doc.dropped);
  const blocked = buckets(doc.blocked);
  const provenance: Record<string, number> = {};
  if (doc.provenance && typeof doc.provenance === "object") {
    for (const [k, v] of Object.entries(doc.provenance as Record<string, unknown>)) {
      if (typeof v === "number") provenance[k] = v;
    }
  }
  return {
    templateVersion: typeof doc.templateVersion === "string" ? doc.templateVersion : "?",
    contentDigest: typeof doc.contentDigest === "string" ? doc.contentDigest : "?",
    counts: {
      docs: num(counts.docs),
      have: num(counts.have),
      drop: num(counts.drop),
      blocked: num(counts.blocked),
      generate: num(counts.generate),
      tier1: num(counts.tier1),
      tier2: num(counts.tier2),
    },
    provenance,
    dropped,
    blocked,
    dropReason: flatten(dropped),
    blockReason: flatten(blocked),
  };
}

export type PlanFetchFn = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Fetch + parse. Resolves to null on any failure — never rejects. */
export async function loadPlan(fetchFn?: PlanFetchFn, url = PLAN_URL): Promise<CodexPlan | null> {
  const f = fetchFn ?? ((u: string) => fetch(u));
  try {
    const res = await f(url);
    if (!res.ok) return null;
    return parsePlan(await res.json());
  } catch {
    return null;
  }
}

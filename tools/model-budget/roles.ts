/**
 * roles — resolve which per-import GATE a model is judged against, and score a
 * measurement against it.
 *
 * The role of a model is NOT re-derived here. emit_report.ts already traces
 * where every .glb is used (champion modelKey, arena decor[], the real
 * intermission layout module, login, dev-overlay) and writes the resulting
 * `role` onto each model row in content/assets/model-budget/report.json. This
 * module reads that field, so the guard and the report can never disagree about
 * what a file IS. For a freshly-converted model that is not in content yet (an
 * importer staging directory), the caller passes `--role` explicitly — that is
 * the authoritative signal at import time, since the importer knows what it is
 * assigning the model to.
 *
 * The GATES themselves (the numbers, and the arithmetic behind each) live in
 * limits.ts and are the single source of budget truth.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GATES, verdict, type Gate, type Verdict } from "./limits";
import type { GlbMetrics } from "./glb";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../..");
export const CONTENT = path.join(ROOT, "content");
export const REPORT = path.join(CONTENT, "assets/model-budget/report.json");

export type Role = Gate["role"];
export const ROLE_NAMES: Role[] = GATES.map((g) => g.role);

export function gateFor(role: string): Gate | undefined {
  return GATES.find((g) => g.role === role);
}

/** content-relative path a glb file maps to, e.g. assets/models/champions/blocky-knight.glb */
export function contentUrl(file: string): string {
  const rel = path.relative(CONTENT, path.resolve(file));
  return rel.split(path.sep).join("/");
}

export interface ReportModel {
  path: string;
  role: string;
  worstCount: number;
  triangles: number;
  maxTextureEdge: number;
  broken: string;
}

let reportCache: any | undefined;
function loadReport(): any | null {
  if (reportCache === undefined) {
    reportCache = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, "utf8")) : null;
  }
  return reportCache;
}

/**
 * Does the report still describe the sources it was derived from?
 *
 * ⭐ GH#389 — this used to be `source.mtime > report.generatedAt`, and it was
 * wrong twice over. (1) The report no longer carries a clock at all, because a
 * timestamp in a checked-in artefact makes it dirty on every run. (2) mtime was
 * never the right question anyway: a deploy or a `git checkout` resets every
 * file's mtime without changing a byte, so the timestamp test flags a correctly
 * built tree as stale — the standalone page's own comment says exactly this and
 * uses Content-Length instead. Here we can do better than the page can: hash the
 * sources and compare against what the report recorded.
 */
export function reportFreshness(): { present: boolean; stale: boolean; sourcesDigest?: string } {
  const r = loadReport();
  if (!r) return { present: false, stale: true };
  let stale = false;
  for (const s of r.sources ?? []) {
    const abs = path.join(ROOT, s.path);
    // A source that has since been DELETED is a change too — emit_report skips
    // missing paths, so its absence would silently drop a row from `sources`.
    if (!fs.existsSync(abs) || sha256Of(abs) !== s.sha256) stale = true;
  }
  return { present: true, stale, sourcesDigest: r.sourcesDigest };
}

/** Same truncation as emit_report.ts writes — ⛔ the two must agree or nothing matches. */
function sha256Of(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
}

/** Look a file's traced role up in the generated report, or null if not found. */
export function roleFromReport(file: string): ReportModel | null {
  const r = loadReport();
  if (!r) return null;
  const url = contentUrl(file);
  const m = r.models.find((x: any) => x.path === url);
  return m
    ? {
        path: m.path,
        role: m.role,
        worstCount: m.worstCount ?? 1,
        triangles: m.triangles,
        maxTextureEdge: m.maxTextureEdge,
        broken: m.broken ?? "",
      }
    : null;
}

export interface AxisScore {
  key: "triangles" | "drawCalls" | "maxTextureEdge" | "animChannels";
  label: string;
  value: number;
  warn: number;
  limit: number;
  verdict: Verdict;
}

export interface Scored {
  role: string;
  gate: Gate;
  axes: AxisScore[];
  worst: Verdict;
}

/** Score a measured glb against a role's gate — the same four axes the report uses. */
export function scoreAgainst(m: GlbMetrics, gate: Gate): Scored {
  const axes: AxisScore[] = [
    {
      key: "triangles",
      label: "每實例三角面",
      value: m.triangles,
      warn: gate.tris.warn,
      limit: gate.tris.limit,
      verdict: verdict(m.triangles, gate.tris.warn, gate.tris.limit),
    },
    {
      key: "drawCalls",
      label: "每模型 mesh / draw call",
      value: m.meshes,
      warn: gate.meshes.warn,
      limit: gate.meshes.limit,
      verdict: verdict(m.meshes, gate.meshes.warn, gate.meshes.limit),
    },
    {
      key: "maxTextureEdge",
      label: "貼圖最長邊 (px)",
      value: m.maxTextureEdge,
      warn: gate.texEdge.warn,
      limit: gate.texEdge.limit,
      verdict: verdict(m.maxTextureEdge, gate.texEdge.warn, gate.texEdge.limit),
    },
    {
      key: "animChannels",
      label: "每幀動畫通道",
      value: m.channelsPerFrame,
      warn: gate.channels.warn,
      limit: gate.channels.limit,
      verdict: verdict(m.channelsPerFrame, gate.channels.warn, gate.channels.limit),
    },
  ];
  const rank: Record<Verdict, number> = { ok: 0, warn: 1, over: 2 };
  const worst = axes.reduce<Verdict>((w, a) => (rank[a.verdict] > rank[w] ? a.verdict : w), "ok");
  return { role: gate.role, gate, axes, worst };
}

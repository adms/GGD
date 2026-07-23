/**
 * worklist — the OFFLINE BATCH-OPTIMISER ENTRYPOINT. It reads task #99's
 * published report, lists every asset that is over its budget threshold, writes
 * a machine-readable OPTIMISE WORKLIST, and can hand that list straight to the
 * optimiser (optimize.ts).
 *
 *   pnpm budget:worklist                       # write the worklist, print a summary
 *   pnpm budget:worklist --over-only           # only HARD-LIMIT breaches, not warnings
 *   pnpm budget:worklist --optimize            # then run the optimiser DRY-RUN on the list
 *   pnpm budget:worklist --optimize --apply    # …and write the optimised tree (never in place)
 *
 * ─ WHAT "OVER THE THRESHOLD" MEANS, AND WHY THE LIST IS HONEST ────────────────
 * The report already scored every model against its ROLE gate (limits.ts) and
 * every scene against its same-screen cap. This tool does NOT re-measure; it
 * classifies those verdicts into the only two buckets that matter for a batch
 * pass:
 *
 *   items[]          assets the offline optimiser can actually shrink — an
 *                    oversized TEXTURE (resize) or too much GEOMETRY (decimate,
 *                    #115's stage). Each carries the concrete action + target.
 *   needsReauthor[]  assets that ARE over budget but on an axis no automated
 *                    pass can fix — draw-call count or per-frame animation
 *                    channels. Decimating a texture will not remove a mesh; the
 *                    only fix is re-authoring. Listing these as "optimise" work
 *                    would be a lie, so they are named separately.
 *   broken[]         zero-/near-zero-geometry emitters: pure draw-call overhead,
 *                    nothing to optimise. Named so they are not silently dropped.
 *
 * The candidacy threshold is the WARNING LINE by default (matching the user's
 * ask: "a warning line, and offline-optimise anything over the threshold"), so
 * the 1024² champion textures that sit at warn — the real VRAM win — are
 * queued. `--over-only` restricts to hard-limit breaches.
 *
 * ─ THE WORKLIST IS AN INPUT, NOT AN ACTION ───────────────────────────────────
 * Writing the worklist changes nothing shipping. `--optimize` invokes optimize.ts
 * on the queued .glb paths, and even that defaults to a DRY RUN — the optimiser
 * writes to a separate tree and never in place (see optimize.ts). Adoption stays
 * a separate human act. The admin 模型預算 page produces the SAME schema
 * (model-budget/optimise-worklist@1) from the same report, so an operator can
 * queue from the console and run this tool against the downloaded file.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { CONTENT, REPORT, ROOT } from "./roles";

const OPTIMIZE = path.join(ROOT, "tools/model-budget/optimize.ts");
const DEFAULT_OUT = path.join(CONTENT, "assets/model-budget/optimize-worklist.json");

export const WORKLIST_SCHEMA = "model-budget/optimise-worklist@1";

// ---- report shape (only the fields this tool reads) -------------------------

type Verdict = "ok" | "warn" | "over";

/** Which gate axis each report verdict key maps to, and how the optimiser (if
 *  at all) addresses it. `null` fix ⇒ no automated pass can help. */
const AXIS: Record<string, { gate: "tris" | "meshes" | "texEdge" | "channels"; fix: "geometry" | "texture" | null }> = {
  triangles: { gate: "tris", fix: "geometry" },
  drawCalls: { gate: "meshes", fix: null },
  maxTextureEdge: { gate: "texEdge", fix: "texture" },
  animChannels: { gate: "channels", fix: null },
};

interface ReportModel {
  id: string;
  path: string;
  role: string;
  triangles: number | null;
  drawCalls: number | null;
  animChannels: number | null;
  maxTextureEdge: number | null;
  vramBytes: number | null;
  worstCount?: number;
  broken?: string;
  verdicts?: Record<string, Verdict>;
}
interface ReportGate {
  role: string;
  tris: { warn: number; limit: number };
  meshes: { warn: number; limit: number };
  texEdge: { warn: number; limit: number };
  channels: { warn: number; limit: number };
}
interface ReportScreen {
  id: string;
  label?: string;
  verdicts?: Record<string, Verdict>;
}
export interface BudgetReportLike {
  schema?: string;
  generatedAt?: string;
  models: ReportModel[];
  gates: ReportGate[];
  screens: ReportScreen[];
}

// ---- worklist shape ---------------------------------------------------------

export interface WorklistBreach {
  metric: string;
  tier: "warn" | "over";
  value: number | null;
  warn: number | null;
  limit: number | null;
}
export type WorklistAction =
  | { kind: "texture-resize"; fromEdge: number; targetEdge: number; estVramSavedBytes: number }
  | { kind: "geometry-decimate"; fromTris: number; targetTris: number; requires: string };
export interface WorklistItem {
  id: string;
  path: string;
  role: string;
  worstCount: number;
  vramBytes: number | null;
  triangles: number | null;
  breaches: WorklistBreach[];
  /** what the offline optimiser will attempt — always ≥ 1 for an item */
  actions: WorklistAction[];
  /** breached axes no automated pass can fix (draw calls / anim channels) */
  manual: string[];
}
export interface Worklist {
  schema: string;
  generatedAt: string;
  generatedBy: string;
  threshold: "warn" | "over";
  source: { report: string; generatedAt: string; schema: string };
  items: WorklistItem[];
  needsReauthor: { id: string; path: string; role: string; metrics: string[] }[];
  broken: { id: string; path: string; kind: string }[];
  screensOverCap: { id: string; label: string; over: string[] }[];
  totals: {
    scanned: number;
    queued: number;
    needsReauthor: number;
    broken: number;
    screensOverCap: number;
    estVramSavedBytes: number;
  };
}

// ---- pure builder -----------------------------------------------------------

/** Largest power of two ≤ n — the resize target must be a real mip-friendly edge. */
const floorPow2 = (n: number): number => 1 << Math.floor(Math.log2(Math.max(1, n)));

/** A verdict at or past the candidacy threshold. warn-threshold accepts warn+over. */
function meets(v: Verdict | undefined, threshold: "warn" | "over"): v is "warn" | "over" {
  if (v === "over") return true;
  if (v === "warn") return threshold === "warn";
  return false;
}

/**
 * Turn a scored report into an actionable worklist. PURE: no fs, no clock — the
 * admin page runs the same classification over the same report in the browser,
 * so the two must agree by construction rather than by luck.
 */
export function buildWorklist(
  report: BudgetReportLike,
  opts: { threshold?: "warn" | "over"; now?: string; by?: string } = {},
): Worklist {
  const threshold = opts.threshold ?? "warn";
  const gateOf = new Map(report.gates.map((g) => [g.role, g]));

  const items: WorklistItem[] = [];
  const needsReauthor: Worklist["needsReauthor"] = [];
  const broken: Worklist["broken"] = [];

  for (const m of report.models) {
    if (m.broken) {
      broken.push({ id: m.id, path: m.path, kind: m.broken });
      continue;
    }
    const gate = gateOf.get(m.role);
    const verdicts = m.verdicts ?? {};
    const value: Record<string, number | null> = {
      triangles: m.triangles,
      drawCalls: m.drawCalls,
      maxTextureEdge: m.maxTextureEdge,
      animChannels: m.animChannels,
    };

    const breaches: WorklistBreach[] = [];
    const actions: WorklistAction[] = [];
    const manual: string[] = [];

    for (const [metric, spec] of Object.entries(AXIS)) {
      const v = verdicts[metric];
      if (!meets(v, threshold)) continue;
      const bound = gate ? gate[spec.gate] : undefined;
      breaches.push({
        metric,
        tier: v,
        value: value[metric] ?? null,
        warn: bound?.warn ?? null,
        limit: bound?.limit ?? null,
      });
      if (spec.fix === null) {
        manual.push(metric);
        continue;
      }
      if (spec.fix === "texture" && gate) {
        const fromEdge = m.maxTextureEdge ?? 0;
        const targetEdge = floorPow2(gate.texEdge.warn);
        if (fromEdge > targetEdge) {
          // VRAM (RGBA8 + mip) scales with edge²; the resize touches the image
          // portion of the model, so scale its recorded VRAM by the area ratio.
          const ratio = (targetEdge / fromEdge) ** 2;
          const estVramSavedBytes = Math.max(0, Math.round((m.vramBytes ?? 0) * (1 - ratio)));
          actions.push({ kind: "texture-resize", fromEdge, targetEdge, estVramSavedBytes });
        }
      } else if (spec.fix === "geometry" && gate) {
        const fromTris = m.triangles ?? 0;
        const targetTris = gate.tris.warn;
        if (fromTris > targetTris) {
          actions.push({
            kind: "geometry-decimate",
            fromTris,
            targetTris,
            requires: "geometry deps (#115) — tools/model-budget/optimize/bootstrap-geometry.sh",
          });
        }
      }
    }

    if (breaches.length === 0) continue;
    if (actions.length > 0) {
      items.push({
        id: m.id,
        path: m.path,
        role: m.role,
        worstCount: m.worstCount ?? 1,
        vramBytes: m.vramBytes ?? null,
        triangles: m.triangles ?? null,
        breaches,
        actions,
        manual,
      });
    } else {
      needsReauthor.push({ id: m.id, path: m.path, role: m.role, metrics: breaches.map((b) => b.metric) });
    }
  }

  // heaviest first: VRAM dominates the frame, triangles break ties.
  items.sort((a, b) => (b.vramBytes ?? 0) - (a.vramBytes ?? 0) || (b.triangles ?? 0) - (a.triangles ?? 0));
  needsReauthor.sort((a, b) => a.id.localeCompare(b.id));
  broken.sort((a, b) => a.id.localeCompare(b.id));

  const screensOverCap = report.screens
    .map((s) => ({
      id: s.id,
      label: s.label ?? s.id,
      over: Object.entries(s.verdicts ?? {})
        .filter(([, v]) => v === "over")
        .map(([k]) => k),
    }))
    .filter((s) => s.over.length > 0);

  const estVramSavedBytes = items.reduce(
    (n, it) => n + it.actions.reduce((s, a) => s + (a.kind === "texture-resize" ? a.estVramSavedBytes : 0), 0),
    0,
  );

  return {
    schema: WORKLIST_SCHEMA,
    generatedAt: opts.now ?? new Date().toISOString(),
    generatedBy: opts.by ?? "tools/model-budget/worklist.ts (task #99)",
    threshold,
    source: {
      report: "content/assets/model-budget/report.json",
      generatedAt: report.generatedAt ?? "",
      schema: report.schema ?? "",
    },
    items,
    needsReauthor,
    broken,
    screensOverCap,
    totals: {
      scanned: report.models.length,
      queued: items.length,
      needsReauthor: needsReauthor.length,
      broken: broken.length,
      screensOverCap: screensOverCap.length,
      estVramSavedBytes,
    },
  };
}

// ---- CLI --------------------------------------------------------------------

interface Args {
  report: string;
  out: string;
  overOnly: boolean;
  json: boolean;
  optimize: boolean;
  apply: boolean;
  geometry: boolean;
}

function fail(msg: string): never {
  process.stderr.write(`worklist: ${msg}\n`);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    report: REPORT,
    out: DEFAULT_OUT,
    overOnly: false,
    json: false,
    optimize: false,
    apply: false,
    geometry: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]!;
    if (t === "--report") a.report = path.resolve(argv[++i] ?? fail("--report needs a path"));
    else if (t === "--out") a.out = path.resolve(argv[++i] ?? fail("--out needs a path"));
    else if (t === "--over-only") a.overOnly = true;
    else if (t === "--json") a.json = true;
    else if (t === "--optimize" || t === "--run") a.optimize = true;
    else if (t === "--apply") a.apply = true;
    else if (t === "--geometry") a.geometry = true;
    else if (t === "--help" || t === "-h") {
      process.stdout.write(
        "usage: tsx tools/model-budget/worklist.ts [--over-only] [--out FILE] [--report FILE]\n" +
          "  [--optimize [--apply] [--geometry]] [--json]\n" +
          "reads the model-budget report, writes an optimise worklist, and (with --optimize)\n" +
          "hands the queued .glb paths to optimize.ts (dry-run unless --apply, never in place).\n",
      );
      process.exit(0);
    } else fail(`unknown arg ${t}`);
  }
  return a;
}

const MB = 1024 * 1024;
const mb = (n: number): string => (n / MB).toFixed(2);

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.report)) {
    fail(
      `no report at ${path.relative(ROOT, args.report)} — run 'pnpm --filter @ggd/model-budget budget:report' first`,
    );
  }
  let report: BudgetReportLike;
  try {
    report = JSON.parse(fs.readFileSync(args.report, "utf8")) as BudgetReportLike;
  } catch (e) {
    fail(`report is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(report.models) || !Array.isArray(report.gates)) {
    fail("report is missing models[] or gates[] — is it a model-budget report?");
  }

  const worklist = buildWorklist(report, { threshold: args.overOnly ? "over" : "warn" });

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(worklist, null, 2) + "\n");

  if (args.json) {
    process.stdout.write(JSON.stringify(worklist, null, 2) + "\n");
  } else {
    const t = worklist.totals;
    process.stdout.write(
      `optimise worklist — threshold=${worklist.threshold} (${args.overOnly ? "hard limits only" : "warning line"})\n` +
        `scanned ${t.scanned} models · ${t.queued} queued for the optimiser · ` +
        `${t.needsReauthor} need re-authoring · ${t.broken} broken · ${t.screensOverCap} scene(s) over cap\n` +
        `estimated texture VRAM saving if applied: ${mb(t.estVramSavedBytes)} MB\n\n`,
    );
    for (const it of worklist.items.slice(0, 20)) {
      const acts = it.actions
        .map((a) =>
          a.kind === "texture-resize"
            ? `texture ${a.fromEdge}²→${a.targetEdge}² (~${mb(a.estVramSavedBytes)} MB)`
            : `geometry ${a.fromTris}→≤${a.targetTris} tris (#115)`,
        )
        .join(", ");
      const manual = it.manual.length > 0 ? `  [also needs re-author: ${it.manual.join(", ")}]` : "";
      process.stdout.write(`• ${it.path}  [${it.role} ×${it.worstCount}]  ${acts}${manual}\n`);
    }
    if (worklist.items.length > 20) process.stdout.write(`  …and ${worklist.items.length - 20} more\n`);
    process.stdout.write(`\nwrote ${path.relative(ROOT, args.out)}\n`);
    if (!args.optimize && worklist.items.length > 0) {
      process.stdout.write(`to run the optimiser on this list (dry run):  pnpm --filter @ggd/model-budget budget:worklist --optimize\n`);
    }
  }

  // ---- hand the queue to the optimiser (optional) ----
  if (args.optimize && worklist.items.length > 0) {
    const paths = worklist.items.map((it) => path.join(CONTENT, it.path)).filter((p) => fs.existsSync(p));
    if (paths.length === 0) {
      process.stderr.write("worklist: none of the queued .glb paths exist on disk — nothing to optimise\n");
      process.exit(1);
    }
    const optArgs = [OPTIMIZE, ...paths];
    if (args.apply) optArgs.push("--apply");
    if (args.geometry) optArgs.push("--geometry");
    process.stdout.write(
      `\ninvoking optimiser on ${paths.length} queued model(s) (${args.apply ? "APPLY" : "dry run"}${args.geometry ? ", +geometry" : ""})…\n`,
    );
    try {
      execFileSync("npx", ["tsx", ...optArgs], { cwd: ROOT, stdio: "inherit" });
    } catch {
      process.stderr.write("worklist: the optimiser reported a non-zero exit — inspect the output above\n");
      process.exit(1);
    }
  }
}

// run only as a CLI, never on import (the pure builder is imported by tests)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}

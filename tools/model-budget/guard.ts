/**
 * guard — the IMPORT-TIME gate. Answers one question about one model at the
 * moment it enters: does this .glb fit the budget for the role it will play, or
 * must it go through the offline optimiser first?
 *
 *   pnpm exec tsx tools/model-budget/guard.ts <glb-or-dir>... [options]
 *   pnpm budget:guard content/assets/models/champions --role champion
 *
 * Options:
 *   --role R      champion | arena-decor | intermission-prop | hero-prop | vfx-model
 *                 Authoritative when given (the importer knows what it is
 *                 assigning). Required for files not yet referenced by content.
 *   --warn-only   never exit non-zero; report only (for surveying the tree).
 *   --json        machine-readable output (one object).
 *   --quiet       print only the models that warn or breach.
 *
 * WHERE THIS SITS RELATIVE TO emit_report.ts --check. They are different tools
 * for different moments:
 *   • guard is POINT-OF-IMPORT: "does THIS file fit its gate?" — file-level,
 *     role-aware, and it names the exact optimiser action for each breach. The
 *     importer / a human runs it the instant a model is converted, so an
 *     oversized asset is caught here, not in a profiler two weeks later.
 *   • emit_report --check is the CI RATCHET: "did the whole tree regress past an
 *     accepted baseline?" — it stays quiet on today's known stand-in debt (#81)
 *     and fires only on a NEW regression.
 * Run against existing content, guard will of course also show that known debt;
 * `--warn-only` downgrades it so a survey does not exit non-zero.
 *
 * The optimiser can automate two of the four axes SAFELY — texture edge (resize)
 * and triangles (skin-aware decimation). Draw-call and animation-channel
 * breaches are NOT auto-fixable without changing what the model is (merging
 * primitives, dropping a skeleton), so guard flags them for the manual playbook
 * rather than pretending a batch job will fix them.
 */
import fs from "node:fs";
import path from "node:path";

import { measureGlb, type GlbMetrics } from "./glb";
import {
  ROLE_NAMES,
  gateFor,
  reportFreshness,
  roleFromReport,
  scoreAgainst,
  type AxisScore,
  type Role,
  type Scored,
} from "./roles";

interface Args {
  files: string[];
  role: Role | null;
  warnOnly: boolean;
  json: boolean;
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { files: [], role: null, warnOnly: false, json: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]!;
    if (t === "--role") {
      const r = argv[++i];
      if (!r || !ROLE_NAMES.includes(r as Role)) fail(`--role must be one of: ${ROLE_NAMES.join(", ")}`);
      a.role = r as Role;
    } else if (t === "--warn-only") a.warnOnly = true;
    else if (t === "--json") a.json = true;
    else if (t === "--quiet") a.quiet = true;
    else if (t === "--help" || t === "-h") {
      printHelp();
      process.exit(0);
    } else if (t.startsWith("-")) fail(`unknown flag ${t}`);
    else a.files.push(t);
  }
  if (a.files.length === 0) fail("give at least one .glb file or a directory");
  return a;
}

function fail(msg: string): never {
  process.stderr.write(`guard: ${msg}\n`);
  process.exit(2);
}

function printHelp(): void {
  process.stdout.write(
    "usage: tsx tools/model-budget/guard.ts <glb-or-dir>... [--role R] [--warn-only] [--json] [--quiet]\n" +
      `roles: ${ROLE_NAMES.join(", ")}\n`,
  );
}

function walk(p: string, out: string[]): void {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) walk(path.join(p, e), out);
  } else if (p.endsWith(".glb")) out.push(p);
}

/** The optimiser action that clears a breached axis, or a manual note. */
function actionFor(axis: AxisScore, gate: ReturnType<typeof gateFor>): string {
  if (axis.verdict === "ok") return "";
  switch (axis.key) {
    case "maxTextureEdge": {
      // target the warn edge (the actionable line), rounded down to a power of two
      const target = 1 << Math.floor(Math.log2(gate!.texEdge.warn));
      return `optimise 貼圖 ${axis.value}→${target}px (VRAM ↓${(1 - (target * target) / (axis.value * axis.value)).toLocaleString(undefined, { style: "percent" })})`;
    }
    case "triangles":
      return `optimise 幾何抽面 ${axis.value}→≤${gate!.tris.warn} (skin-aware，需 --geometry)`;
    case "drawCalls":
      return `manual：合併同材質 primitive / 減少節點（批次工具不會自動改 draw call，見 playbook 步驟 1）`;
    case "animChannels":
      return `manual：擺設/道具應無骨架，或烘焙精簡動畫（見 playbook 步驟 4-5）`;
    default:
      return "";
  }
}

interface FileResult {
  file: string;
  role: string;
  roleSource: "flag" | "report" | "unresolved";
  metrics: GlbMetrics;
  scored: Scored | null;
  broken: string;
}

function evaluate(file: string, args: Args): FileResult {
  const m = measureGlb(file);
  const broken = m.triangles === 0 ? "zero-geometry" : m.triangles <= 30 ? "near-zero" : "";

  let role: string | null = args.role;
  let roleSource: FileResult["roleSource"] = args.role ? "flag" : "unresolved";
  if (!role) {
    const fromReport = roleFromReport(file);
    if (fromReport && fromReport.role !== "unused") {
      role = fromReport.role;
      roleSource = "report";
    }
  }
  const gate = role ? gateFor(role) : undefined;
  return {
    file,
    role: role ?? "(unresolved)",
    roleSource,
    metrics: m,
    scored: gate ? scoreAgainst(m, gate) : null,
    broken,
  };
}

const V_MARK: Record<string, string> = { ok: "  ok ", warn: "WARN ", over: "OVER!" };

function printHuman(r: FileResult, args: Args): void {
  const rel = path.relative(process.cwd(), r.file);
  if (r.broken) {
    process.stdout.write(
      `\n${rel}\n  role=${r.role}  ⚠ ${r.broken === "zero-geometry" ? "0 幾何 — mdx 粒子發射器沒轉出任何面 (#98)，這不是便宜資產，是壞的" : "幾何近乎為零，仍吃 draw call 與材質 — 純開銷 (#98)"}\n`,
    );
    return;
  }
  if (!r.scored) {
    // unresolved role: show the numbers against every gate so a human can see it
    if (args.quiet) return;
    process.stdout.write(
      `\n${rel}\n  role UNRESOLVED — not referenced by content and no --role given.\n` +
        `  tris ${r.metrics.triangles} · meshes ${r.metrics.meshes} · texEdge ${r.metrics.maxTextureEdge} · chan ${r.metrics.channelsPerFrame}\n` +
        `  pass --role <${ROLE_NAMES.join("|")}> to gate it.\n`,
    );
    return;
  }
  if (args.quiet && r.scored.worst === "ok") return;
  const tag = r.scored.worst === "over" ? "OVER" : r.scored.worst === "warn" ? "WARN" : "ok";
  process.stdout.write(`\n${rel}  role=${r.role}${r.roleSource === "flag" ? "" : ` (${r.roleSource})`}  → ${tag}\n`);
  for (const a of r.scored.axes) {
    const act = actionFor(a, r.scored.gate);
    process.stdout.write(
      `  ${V_MARK[a.verdict]} ${a.label.padEnd(20)} ${String(a.value).padStart(7)}  warn ${a.warn} / limit ${a.limit}${act ? `   → ${act}` : ""}\n`,
    );
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const files: string[] = [];
  for (const f of args.files) {
    if (!fs.existsSync(f)) fail(`no such path: ${f}`);
    walk(f, files);
  }
  if (files.length === 0) fail("no .glb files found under the given paths");
  files.sort();

  // Warn once if role resolution will rely on a stale report.
  if (!args.role) {
    const fresh = reportFreshness();
    if (!fresh.present) {
      process.stderr.write(
        "guard: no report.json — role auto-detection is unavailable. Pass --role, or run `pnpm budget:report` first.\n",
      );
    } else if (fresh.stale) {
      process.stderr.write(
        "guard: report.json no longer matches a source it derives from — roles may be stale. Consider `pnpm budget:report`.\n",
      );
    }
  }

  const results = files.map((f) => evaluate(f, args));

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          tool: "model-budget/guard",
          role: args.role,
          results: results.map((r) => ({
            file: r.file,
            role: r.role,
            roleSource: r.roleSource,
            broken: r.broken || undefined,
            worst: r.scored?.worst ?? null,
            metrics: {
              triangles: r.metrics.triangles,
              meshes: r.metrics.meshes,
              maxTextureEdge: r.metrics.maxTextureEdge,
              channelsPerFrame: r.metrics.channelsPerFrame,
              vramBytes: r.metrics.vramBytes,
            },
            axes: r.scored?.axes ?? null,
          })),
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    for (const r of results) printHuman(r, args);
  }

  const breached = results.filter((r) => r.scored?.worst === "over" || r.broken).length;
  const warned = results.filter((r) => r.scored?.worst === "warn").length;
  const unresolved = results.filter((r) => !r.scored && !r.broken).length;

  if (!args.json) {
    process.stdout.write(
      `\nguard: ${results.length} model(s) — ${breached} breaching/broken, ${warned} warning, ${unresolved} unresolved\n`,
    );
    if (breached > 0 && !args.warnOnly) {
      process.stdout.write(
        "→ send the breaching models to the offline optimiser (review the dry run first):\n" +
          "    pnpm budget:optimize <paths> --role <role>            # dry run\n" +
          "    pnpm budget:optimize <paths> --role <role> --apply    # write to a separate tree\n",
      );
    }
  }

  if (args.warnOnly) process.exit(0);
  // Unresolved role is a usage problem (exit 2); a real breach is a gate failure (1).
  if (unresolved > 0 && breached === 0) process.exit(2);
  process.exit(breached > 0 ? 1 : 0);
}

main();

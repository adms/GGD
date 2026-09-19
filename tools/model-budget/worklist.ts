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
 *   items[]          assets the offline optimiser can actually act on — an
 *                    oversized TEXTURE (resize), too much GEOMETRY (decimate,
 *                    #115's stage), or too many DRAW CALLS (merge, GH#1198 /
 *                    #1175). Each carries the concrete action + target.
 *   needsReauthor[]  assets that ARE over budget but on an axis no automated
 *                    pass can fix — today that is per-frame ANIMATION CHANNELS
 *                    only: `optimize.ts` has no trim stage, so the only fix is
 *                    re-authoring. Listing these as "optimise" work would be a
 *                    lie, so they are named separately.
 *   broken[]         zero-/near-zero-geometry emitters: pure draw-call overhead,
 *                    nothing to optimise. Named so they are not silently dropped.
 *
 * ─ ⛔⛔ 「draw call 沒有自動解」在 GH#1198／#1175 之後是**假的** ────────────────
 * ⚠️ 這份檔頭在 2026-09-19 之前逐字寫著 draw call「no automated pass can fix」,
 * 而那句話在合併 stage 出貨之後就過期了 —— ⭐ 而**沒有任何東西變紅**
 * （CLAUDE.md 第三守則：一句在它到期之後還活著的散文）。今天的事實是：
 *
 * | stage | 它做什麼 | 畫面 | 誰在用 |
 * |---|---|---|---|
 * | `--merge` | 把**渲染狀態逐位元組相同**的 primitive 接成一塊 | ⭐ **一個像素都不變** | ⭐ 本檔排的 `draw-merge` |
 * | `--atlas` | 重排貼圖版面再縮小每一格 | ⛔ **會變**（要人審） | ⛔ 本檔**不排**（見下） |
 *
 * ⇒ ⭐ 一個 draw call 超標的模型現在排進 `items[]`，動作是 `draw-merge`，
 *   而 `--optimize` 會**真的帶上 `--merge`** 去跑它（⛔ 不帶就是 CLAUDE.md 失敗形態⑧：
 *   工單說得出這件事做得到，而它叫的那支指令從來不做）。
 *
 * ⚠️⚠️ ⭐ **「排得進來」⛔ 不等於「接得動」**：接不接得起來只有 worker 的乾跑探針
 * 答得出來（判準住上游 `glb_draw_state`），而本檔是**純函式、⛔ 不跑 exec**。
 * ⇒ `draw-merge` 是一個**候選**：優化器探針說接不動（每塊畫法都不同／全是半透明）
 * 就會誠實拒絕，⛔ 一個位元組都不寫。⭐ 被拒絕的那些**真的**只剩 `--atlas` 或重做 ——
 * 2026-09-19 實測：#1198 那 8 顆 ou99 全部落在這一格（17/10/10/9/9/8/8/7 draws，
 * `--merge` 救回 **0** 顆）。⇒ ⛔ 不要把「已排入」讀成「已解決」。
 *
 * ⛔ `--atlas` 刻意**不**排進工單：它會改變畫面 ⇒ 依 CLAUDE.md 第一·四之零，
 * 它要走人審，⛔ 不屬於「按一下就跑完」的批次。
 *
 * The candidacy threshold is the WARNING LINE by default (matching the user's
 * ask: "a warning line, and offline-optimise anything over the threshold"), so
 * the 1024² champion textures that sit at warn — the real VRAM win — are
 * queued. `--over-only` restricts to hard-limit breaches.
 *
 * ─ ⭐ 為什麼這一份**留著** `generatedAt`（GH#395）────────────────────────────
 * GH#389 把 `report.json` 的時鐘換成了 `sourcesDigest`，而這一份**刻意不跟進**。
 * 判準是「它的 `--check` 需不需要逐位元組？」——它沒有 `--check`，而且不該有：
 *
 *   · report.json 是**推導出來的量測**（同樣的輸入必然給同樣的輸出），所以它的
 *     身分只能是輸入的摘要，而任何時鐘都會讓那條新鮮度閘退化成模糊比對;
 *   · 這一份是**操作員的收據** —— 「我在這個時候，照這個門檻，排了這一批」。
 *     它由 `pnpm budget:worklist`（或後台那一頁）**按下去才產生**，⛔ 沒有任何
 *     build / CI / deploy 步驟會重跑它 ⇒ 它不會製造 `git status` 噪音。
 *     同一份報告用 `--over-only` 排兩次是**兩張不同的工單**，而分辨它們的正是
 *     那格時間。⛔ 拿掉它會讓兩份工單長得一模一樣。
 *
 * ⚠️ 它仍然**不可以**被拿來比大小判新舊（`source.mtime > report.generatedAt`
 * 那種寫法在 GH#389 被拆掉過一次，理由寫在 `roles.ts`）。它是給人讀的日期，
 * ⛔ 不是一個判斷的輸入。`sourcesDigest` 才是「這批工單對應哪一份報告」的答案。
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

/** How the optimiser (if at all) addresses one breached axis. */
export type AxisFix = "geometry" | "texture" | "draws" | null;

/**
 * Which gate axis each report verdict key maps to, and how the optimiser
 * addresses it. `null` fix ⇒ no automated pass can help, ⇒ `needsReauthor`.
 *
 * ⭐ ⛔ 這張表有**第二個住處** —— `apps/admin/src/assets/modelBudget.ts` 的
 * `OPTIMISABLE` ＋ `MANUAL_AXES`（後台那一頁在瀏覽器裡跑同一份分類，⛔ 不能 import
 * 這一支：本檔吃 `node:fs`／`node:child_process`）。⇒ 兩處一致由一條會紅的守衛釘住：
 * `worklist.test.ts` 的「兩處的軸表逐軸一致」。⛔ 改一邊而不改另一邊 ⇒ 紅。
 */
export const AXIS: Record<string, { gate: "tris" | "meshes" | "texEdge" | "channels"; fix: AxisFix }> = {
  triangles: { gate: "tris", fix: "geometry" },
  // GH#1198／#1175：合併 stage 出貨之後這一格⛔ 不再是 null（檔頭有完整理由）。
  drawCalls: { gate: "meshes", fix: "draws" },
  maxTextureEdge: { gate: "texEdge", fix: "texture" },
  // ⚠️ `trimClips.ts` 存在,⛔ 但它**沒有接進 optimize.ts** ⇒ 對批次而言仍然無解。
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
  /** content-derived id of the report's inputs (GH#389 replaced `generatedAt`). */
  sourcesDigest?: string;
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
  | { kind: "geometry-decimate"; fromTris: number; targetTris: number; requires: string }
  /** GH#1198／#1175 —— ⭐ 候選,⛔ 不是承諾（接不接得動由 worker 探針說了算,見檔頭）。 */
  | { kind: "draw-merge"; fromDraws: number; targetDraws: number; requires: string };
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
  /** breached axes no automated pass can fix (today: anim channels only) */
  manual: string[];
}
export interface Worklist {
  schema: string;
  generatedAt: string;
  generatedBy: string;
  threshold: "warn" | "over";
  source: { report: string; sourcesDigest: string; schema: string };
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

/**
 * ⭐ 合併候選的 `requires` —— ⛔ 它要說出**這件事可能不成立**，⛔ 不是只說指令。
 * （CLAUDE.md：一個只講「做得到」的欄位會被下一輪讀成「已解決」。）
 */
export const MERGE_REQUIRES =
  "optimize.ts --merge（接畫法相同的 primitive，⭐ 像素不變）—— " +
  "⚠️ 候選：接不動（每塊畫法都不同／全是半透明）時優化器會誠實拒絕，那時只剩 --atlas 或重做";

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
      } else if (spec.fix === "draws" && gate) {
        const fromDraws = m.drawCalls ?? 0;
        const targetDraws = gate.meshes.warn;
        if (fromDraws > targetDraws) {
          actions.push({ kind: "draw-merge", fromDraws, targetDraws, requires: MERGE_REQUIRES });
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
      sourcesDigest: report.sourcesDigest ?? "",
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

/**
 * ⭐ 工單 → 優化器 CLI 旗標。⛔ 它抽成純函式**只為了一件事：讓這條接線有守衛** ——
 * 住在 `main()` 裡的時候沒有任何測試碰得到它，⛔ 而它正是 CLAUDE.md 第二守則
 * 失敗形態⑧的形狀：**工單說得出「draw call 修得了」，而它叫的那支指令從來不帶
 * `--merge`** ⇒ 排進去的每一顆都靜靜地什麼都不做，⭐ 而兩邊看起來都是對的。
 */
export function optimiserFlags(
  items: readonly WorklistItem[],
  opts: { apply: boolean; geometry: boolean },
): string[] {
  const flags: string[] = [];
  if (opts.apply) flags.push("--apply");
  if (opts.geometry) flags.push("--geometry");
  if (items.some((it) => it.actions.some((a) => a.kind === "draw-merge"))) flags.push("--merge");
  return flags;
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
        .map((a) => {
          if (a.kind === "texture-resize") return `texture ${a.fromEdge}²→${a.targetEdge}² (~${mb(a.estVramSavedBytes)} MB)`;
          if (a.kind === "geometry-decimate") return `geometry ${a.fromTris}→≤${a.targetTris} tris (#115)`;
          // ⭐ 「候選」兩個字是刻意的 —— 接不接得動只有 worker 探針答得出來。
          return `draws ${a.fromDraws}→≤${a.targetDraws} merge 候選 (#1198)`;
        })
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
    // ⭐ 排了 `draw-merge` 就**一定**要帶 `--merge` —— optimize.ts 的合併 stage 只在
    //   `args.merge` 為真時才跑（判準住 `optimiserFlags`，⛔ 這裡沒有第二份）。
    const flags = optimiserFlags(worklist.items, { apply: args.apply, geometry: args.geometry });
    const optArgs = [OPTIMIZE, ...paths, ...flags];
    const wantsMerge = flags.includes("--merge");
    process.stdout.write(
      `\ninvoking optimiser on ${paths.length} queued model(s) (${args.apply ? "APPLY" : "dry run"}${args.geometry ? ", +geometry" : ""}${wantsMerge ? ", +merge" : ""})…\n`,
    );
    try {
      execFileSync(process.execPath, ["--import", "tsx", ...optArgs], { cwd: ROOT, stdio: "inherit" });
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

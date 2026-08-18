/**
 * modelBudget — 模型預算 (task #102's admin page) reads task #99's MEASUREMENT
 * REPORT. It does not measure anything.
 *
 * THE ONE RULE. #99 owns the triangle counter, the texture/VRAM accounting, the
 * usage tracer and the same-screen budget. A second implementation of any of
 * those would diverge from #99's within a day, and two disagreeing numbers are
 * worth less than one — which defeats the entire reason this page was asked
 * for (「讓我知道你真的有在作事」). So every metric rendered by the page comes out
 * of the published report, verbatim. What lives HERE is only:
 *
 *   • a tolerant reader for that report                       (parseBudgetReport)
 *   • the report ↔ live-content reconciliation                (reconcile)
 *   • the staleness verdict built from it                     (budgetHealth)
 *   • formatting                                              (fmtInt / fmtBytes)
 *
 * WHY THE READER IS FIELD-PROBING RATHER THAN STRICT. This page was written
 * alongside #99, not after it, so it must not hard-code one spelling of
 * "triangles" and silently render an empty table when #99 picks another. Each
 * metric is read from a small set of accepted keys and, crucially, a metric that
 * is ABSENT stays `null` and prints as 「未量測」 — never as 0. A zero that means
 * "not measured" is exactly the silent lie the page exists to prevent.
 *
 * WHY THE URL IS A LIST PLUS AN OVERRIDE. Same reason. The candidates mirror
 * the convention #101 established (content/assets/<console>/<file>.json, served
 * by the same mount the game reads), and the operator can point the page at any
 * URL if #99 publishes elsewhere. The page always states which URL answered.
 *
 * Pure: no fetch, no React, no clock. useModelBudget.ts does the I/O.
 */

// --------------------------------------------------------------- where ------

/**
 * Probed in order; the first one that parses as a report wins. Ordered by how
 * closely it matches the console convention already in the tree
 * (content/assets/icon-console/style-spec.json).
 */
export const BUDGET_CANDIDATE_URLS: readonly string[] = [
  "/content/assets/model-budget/report.json",
  "/content/assets/model-budget/budget.json",
  "/content/assets/model-console/report.json",
  "/content/assets/models/budget.json",
  "/content/config/model-budget.json",
];

/** Where the live model inventory comes from (content, not a measurement). */
export const MODEL_INDEX_URL = "/content/models/_index.json";

/** What an operator runs to produce the report (task #99 owns the tool). */
export const BUDGET_TOOL_HINT = "task #99 的量測工具（models 預算報告產生器）";

// -------------------------------------------------------------- reading -----

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
/** A number, or null when the field is absent/unusable. NEVER 0-as-unknown. */
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
/** First present numeric value among `keys`; null when none of them is a number. */
function pickNum(d: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    const n = numOrNull(d[k]);
    if (n !== null) return n;
  }
  return null;
}
function pickStr(d: Record<string, unknown>, keys: readonly string[]): string {
  for (const k of keys) {
    const s = str(d[k]);
    if (s !== "") return s;
  }
  return "";
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Accepted spellings, widest first. Adding one here is cheaper than a re-run. */
const K_TRIANGLES = ["triangles", "tris", "triangleCount", "faceCount", "faces"] as const;
const K_VERTICES = ["vertices", "verts", "vertexCount"] as const;
const K_TEX_BYTES = ["textureBytes", "texBytes", "textureSize", "texturesBytes"] as const;
const K_TEX_COUNT = ["textureCount", "textures", "texCount"] as const;
const K_VRAM = ["vramBytes", "vram", "vramCost", "gpuBytes"] as const;
const K_DRAWS = ["drawCalls", "draws", "submeshes", "meshCount"] as const;
const K_CHANNELS = ["animChannels", "channels", "channelsPerFrame"] as const;
const K_TEX_EDGE = ["maxTextureEdge", "texEdge", "maxEdge"] as const;
const K_WORST = ["worstCount", "simultaneous", "worst"] as const;
const K_FILE_BYTES = ["fileBytes", "bytes", "size", "glbBytes"] as const;
const K_USED_BY = ["usedBy", "usage", "users", "referencedBy"] as const;

const VERDICTS: readonly BudgetVerdict[] = ["over", "warn", "ok", "unknown"];
/** Read the report's `verdicts` object, keeping only real verdict strings. */
function readVerdicts(raw: unknown): Record<string, BudgetVerdict> {
  const d = rec(raw);
  if (!d) return {};
  const out: Record<string, BudgetVerdict> = {};
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string" && (VERDICTS as readonly string[]).includes(v)) out[k] = v as BudgetVerdict;
  }
  return out;
}

/** How one measured value sits against its gate, as SCORED BY THE REPORT. */
export type BudgetVerdict = "over" | "warn" | "ok" | "unknown";

/** One row of #99's per-model measurement. Every metric may be null. */
export interface BudgetModelRow {
  readonly id: string;
  /** the .glb this row measured, as recorded by the report */
  readonly path: string;
  /** the role gate the report scored this model against (champion, arena-decor…) */
  readonly role: string;
  readonly triangles: number | null;
  readonly vertices: number | null;
  readonly textureBytes: number | null;
  readonly textureCount: number | null;
  readonly vramBytes: number | null;
  readonly drawCalls: number | null;
  readonly animChannels: number | null;
  /** largest texture edge in pixels — the axis the optimiser resizes */
  readonly maxTextureEdge: number | null;
  readonly fileBytes: number | null;
  /** worst-case simultaneous copies on one screen (12 seats, 50 trees…) */
  readonly worstCount: number | null;
  /** WHERE IT IS USED — traced by #99, rendered here as-is */
  readonly usedBy: readonly string[];
  /**
   * The report's OWN verdict per gated axis. This is authoritative: the page
   * shows "over threshold" from here rather than re-scoring against a coarse
   * report-level limit that would call every champion green.
   */
  readonly verdicts: Readonly<Record<string, BudgetVerdict>>;
  /** non-empty when the report flagged the geometry as broken (zero/near-zero) */
  readonly broken: string;
  /** anything the report flagged about this model */
  readonly note: string;
}

/** A per-role gate as published by the report — the target for the optimiser. */
export interface BudgetGate {
  readonly role: string;
  readonly texEdgeWarn: number | null;
  readonly trisWarn: number | null;
}

/** A budget line: the limit and the warning line that go with a metric. */
export interface BudgetLimit {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly limit: number | null;
  readonly warn: number | null;
}

/** One same-screen scenario and what it actually costs. */
export interface BudgetScreen {
  readonly id: string;
  readonly label: string;
  /** model ids counted into this screen, with their instance counts */
  readonly models: readonly { readonly id: string; readonly count: number }[];
  readonly triangles: number | null;
  readonly textureBytes: number | null;
  readonly vramBytes: number | null;
  readonly drawCalls: number | null;
  /** per-screen overrides; fall back to the report-level limits when absent */
  readonly limits: readonly BudgetLimit[];
  readonly note: string;
}

/** The digest of a file the report was derived from (same idea as #101's spec). */
export interface BudgetSource {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number | null;
}

export interface BudgetReport {
  readonly schema: string;
  /**
   * Content-derived identity of the inputs this report was measured from.
   * ⭐ GH#389 replaced `generatedAt` with it: a clock in a checked-in artefact
   * dirties the tree on every run, and "when" was never the question the page
   * asks — "are these still the same bytes?" is.
   */
  readonly sourcesDigest: string;
  readonly generatedBy: string;
  readonly sources: readonly BudgetSource[];
  readonly limits: readonly BudgetLimit[];
  readonly screens: readonly BudgetScreen[];
  readonly models: readonly BudgetModelRow[];
  /** per-role gates (optimise targets); empty when the report omits them */
  readonly gates: readonly BudgetGate[];
  /** the URL that actually answered — printed on the page */
  readonly url: string;
}

function readLimit(raw: unknown): BudgetLimit | null {
  const d = rec(raw);
  if (!d) return null;
  const key = pickStr(d, ["key", "metric", "id"]);
  if (key === "") return null;
  return {
    key,
    label: pickStr(d, ["label", "name"]) || key,
    unit: pickStr(d, ["unit"]),
    limit: pickNum(d, ["limit", "max", "cap", "budget"]),
    warn: pickNum(d, ["warn", "warning", "soft", "warnAt"]),
  };
}

/**
 * Limits may arrive as a list of rows OR as an object keyed by metric
 * (`{triangles: {limit, warn}}`). Both are common; neither is worth a re-run.
 */
function readLimits(raw: unknown): BudgetLimit[] {
  const list = arr(raw)
    .map(readLimit)
    .filter((l): l is BudgetLimit => l !== null);
  if (list.length > 0) return list;
  const d = rec(raw);
  if (!d) return [];
  const out: BudgetLimit[] = [];
  for (const [key, value] of Object.entries(d)) {
    const v = rec(value);
    if (v) {
      out.push({
        key,
        label: pickStr(v, ["label", "name"]) || key,
        unit: pickStr(v, ["unit"]),
        limit: pickNum(v, ["limit", "max", "cap", "budget"]),
        warn: pickNum(v, ["warn", "warning", "soft", "warnAt"]),
      });
      continue;
    }
    const n = numOrNull(value);
    if (n !== null) out.push({ key, label: key, unit: "", limit: n, warn: null });
  }
  return out;
}

/** `usedBy` may be strings or `{id,label,kind}` rows — both collapse to a label. */
function readUsedBy(raw: unknown): string[] {
  return arr(raw)
    .map((u) => {
      if (typeof u === "string") return u;
      const d = rec(u);
      if (!d) return "";
      const label = pickStr(d, ["label", "name", "id", "ref"]);
      const kind = pickStr(d, ["kind", "type", "collection"]);
      return kind && label ? `${kind}/${label}` : label;
    })
    .filter((s) => s !== "");
}

function readModel(raw: unknown): BudgetModelRow | null {
  const d = rec(raw);
  if (!d) return null;
  const id = pickStr(d, ["id", "model", "modelId", "doc"]);
  const path = pickStr(d, ["path", "glbPath", "file", "glb"]);
  if (id === "" && path === "") return null;
  return {
    id: id || path,
    path,
    role: pickStr(d, ["role", "gate", "kind"]),
    triangles: pickNum(d, K_TRIANGLES),
    vertices: pickNum(d, K_VERTICES),
    textureBytes: pickNum(d, K_TEX_BYTES),
    // `textures` is a count in some shapes and an array in others
    textureCount: pickNum(d, K_TEX_COUNT) ?? (Array.isArray(d["textures"]) ? d["textures"].length : null),
    vramBytes: pickNum(d, K_VRAM),
    drawCalls: pickNum(d, K_DRAWS),
    animChannels: pickNum(d, K_CHANNELS),
    maxTextureEdge: pickNum(d, K_TEX_EDGE),
    fileBytes: pickNum(d, K_FILE_BYTES),
    worstCount: pickNum(d, K_WORST),
    usedBy: readUsedBy(K_USED_BY.map((k) => d[k]).find((v) => Array.isArray(v))),
    verdicts: readVerdicts(d["verdicts"]),
    broken: pickStr(d, ["broken"]),
    note: pickStr(d, ["note", "notes", "warning", "flag"]),
  };
}

/** Read the report's role gates; the optimiser targets the `warn` edges. */
function readGate(raw: unknown): BudgetGate | null {
  const d = rec(raw);
  if (!d) return null;
  const role = pickStr(d, ["role", "id", "name"]);
  if (role === "") return null;
  const texEdge = rec(d["texEdge"]);
  const tris = rec(d["tris"]);
  return {
    role,
    texEdgeWarn: texEdge ? pickNum(texEdge, ["warn"]) : pickNum(d, ["texEdgeWarn"]),
    trisWarn: tris ? pickNum(tris, ["warn"]) : pickNum(d, ["trisWarn"]),
  };
}

function readScreen(raw: unknown): BudgetScreen | null {
  const d = rec(raw);
  if (!d) return null;
  const id = pickStr(d, ["id", "screen", "scene", "key"]);
  if (id === "") return null;
  const models = arr(d["models"] ?? d["contents"] ?? d["entries"])
    .map((m) => {
      if (typeof m === "string") return { id: m, count: 1 };
      const r = rec(m);
      if (!r) return null;
      const mid = pickStr(r, ["id", "model", "modelId"]);
      if (mid === "") return null;
      return { id: mid, count: pickNum(r, ["count", "instances", "n"]) ?? 1 };
    })
    .filter((m): m is { id: string; count: number } => m !== null);
  return {
    id,
    label: pickStr(d, ["label", "name", "title"]) || id,
    models,
    triangles: pickNum(d, K_TRIANGLES),
    textureBytes: pickNum(d, K_TEX_BYTES),
    vramBytes: pickNum(d, K_VRAM),
    drawCalls: pickNum(d, K_DRAWS),
    limits: readLimits(d["limits"] ?? d["budget"] ?? d["caps"]),
    note: pickStr(d, ["note", "notes"]),
  };
}

function readSources(raw: unknown): BudgetSource[] {
  return arr(raw)
    .map((s) => {
      const d = rec(s);
      if (!d) return null;
      const path = pickStr(d, ["path", "file"]);
      if (path === "") return null;
      return {
        path,
        sha256: pickStr(d, ["sha256", "sha", "hash", "digest"]),
        bytes: pickNum(d, ["bytes", "size"]),
      };
    })
    .filter((s): s is BudgetSource => s !== null);
}

/**
 * Parse a fetched document into a report. Returns null when it is not one —
 * a 404 body, an unrelated JSON file, or a report with no model rows at all
 * (which would render as a convincing but empty budget).
 *
 * The schema string is RECORDED, not enforced: refusing an unknown version
 * would turn "#99 bumped the version" into "the page shows nothing and does not
 * say why", and the page's whole contract is to explain itself.
 */
export function parseBudgetReport(raw: unknown, url: string): BudgetReport | null {
  const d = rec(raw);
  if (!d) return null;
  const models = arr(d["models"] ?? d["entries"] ?? d["rows"])
    .map(readModel)
    .filter((m): m is BudgetModelRow => m !== null);
  if (models.length === 0) return null;
  return {
    schema: str(d["schema"]),
    sourcesDigest: pickStr(d, ["sourcesDigest", "sourceDigest", "inputsDigest"]),
    generatedBy: pickStr(d, ["generatedBy", "tool", "by"]),
    sources: readSources(d["sources"]),
    limits: readLimits(d["limits"] ?? d["budget"] ?? d["caps"]),
    screens: arr(d["screens"] ?? d["scenes"])
      .map(readScreen)
      .filter((s): s is BudgetScreen => s !== null),
    models,
    gates: arr(d["gates"]).map(readGate).filter((g): g is BudgetGate => g !== null),
    url,
  };
}

// ------------------------------------------------- live model inventory -----

/** One model doc as it exists in the content tree RIGHT NOW (not a measurement). */
export interface LiveModel {
  readonly id: string;
  readonly path: string;
  /** `_index.json`'s hash of the parsed doc — moves when the doc is edited */
  readonly hash: string;
}

/** Read `{entries:[{id,path,hash}]}` off `models/_index.json`. */
export function parseModelIndex(raw: unknown): LiveModel[] {
  const list = rec(raw)?.["entries"];
  if (!Array.isArray(list)) return [];
  const out: LiveModel[] = [];
  for (const row of list) {
    const d = rec(row);
    const id = d ? str(d["id"]) : "";
    const path = d ? str(d["path"]) : "";
    if (id !== "" && path !== "") out.push({ id, path, hash: d ? str(d["hash"]) : "" });
  }
  return out;
}

// ------------------------------------------------------- reconciliation -----

export interface Reconciliation {
  /** model ids present in BOTH the live tree and the report */
  readonly measured: readonly string[];
  /** live model docs the report never measured — the honest work list */
  readonly unmeasured: readonly string[];
  /** report rows with no live model doc — the report predates a deletion */
  readonly orphaned: readonly string[];
  readonly liveTotal: number;
  readonly reportTotal: number;
  /** measured / liveTotal × 100; 0 when nothing is live yet */
  readonly percent: number;
}

/**
 * Compare what the report covers against what the content tree actually holds.
 *
 * This is NOT a second measurement — it is set arithmetic over two id lists,
 * and it is the only mechanical way the page can tell "the report is current"
 * from "the report was written before those twelve models landed".
 */
export function reconcile(
  live: readonly LiveModel[],
  report: BudgetReport | null,
): Reconciliation {
  const liveIds = new Set(live.map((m) => m.id));
  const reportIds = new Set((report?.models ?? []).map((m) => m.id));
  const measured: string[] = [];
  const unmeasured: string[] = [];
  for (const m of live) (reportIds.has(m.id) ? measured : unmeasured).push(m.id);
  const orphaned = [...reportIds].filter((id) => !liveIds.has(id)).sort();
  return {
    measured: measured.sort(),
    unmeasured: unmeasured.sort(),
    orphaned,
    liveTotal: live.length,
    reportTotal: reportIds.size,
    percent: live.length === 0 ? 0 : (measured.length / live.length) * 100,
  };
}

// ------------------------------------------------------------- verdict ------

export type HealthLevel = "missing" | "stale" | "unknown" | "ok";

export interface HealthNote {
  readonly id: string;
  readonly level: HealthLevel;
  readonly text: string;
  /** the concrete next action, when there is one */
  readonly fix: string;
}

export interface BudgetHealthInput {
  readonly report: BudgetReport | null;
  readonly recon: Reconciliation;
  /** URLs probed, in order, so the page can say where it looked */
  readonly tried: readonly string[];
  /** the live index itself failed to load — nothing below can be trusted */
  readonly indexFailed: boolean;
}

/**
 * The page's own verdict on whether its numbers may be believed.
 *
 * DECLARING STALENESS IS THE FEATURE. A budget page that renders last week's
 * triangle counts under today's roster is worse than one that renders nothing,
 * because it is believed. Every branch below therefore produces a note; "ok" is
 * the only one that lets the numbers stand unqualified.
 */
export function budgetHealth(input: BudgetHealthInput): HealthNote[] {
  const notes: HealthNote[] = [];
  const { report, recon } = input;

  if (input.indexFailed) {
    notes.push({
      id: "index-unreachable",
      level: "unknown",
      text: "讀不到 /content/models/_index.json —— 無法得知目前有哪些模型，因此也無法判斷報告是否過期。",
      fix: "確認內容掛載 /content 有在服務（開發時由 admin vite 直接讀 repo）。",
    });
  }

  if (report === null) {
    notes.push({
      id: "no-report",
      level: "missing",
      text:
        "任務 #99 的量測報告尚未發布，所以本頁沒有任何三角面數、貼圖大小或 VRAM 數字可以顯示。" +
        "下面列出的是內容樹裡實際存在的模型清單（這是內容，不是量測），每一列都標為「尚未量測」。",
      fix: `執行 ${BUDGET_TOOL_HINT}，把報告寫到 ${BUDGET_CANDIDATE_URLS[0]}；或在上方欄位貼上它實際發布的網址。已嘗試：${input.tried.join(" · ")}`,
    });
    return notes;
  }

  if (recon.unmeasured.length > 0) {
    notes.push({
      id: "unmeasured",
      level: "stale",
      text: `報告涵蓋 ${recon.measured.length} / ${recon.liveTotal} 個模型；有 ${recon.unmeasured.length} 個模型文件從未被量測過。`,
      fix: "重新執行 #99 的量測，讓報告追上目前的內容樹。",
    });
  }
  if (recon.orphaned.length > 0) {
    notes.push({
      id: "orphaned",
      level: "stale",
      text: `報告裡有 ${recon.orphaned.length} 列指向已經不存在的模型文件（${recon.orphaned.slice(0, 5).join("、")}${recon.orphaned.length > 5 ? " …" : ""}）。`,
      fix: "重新執行 #99 的量測。",
    });
  }
  if (report.limits.length === 0 && report.screens.every((s) => s.limits.length === 0)) {
    notes.push({
      id: "no-limits",
      level: "unknown",
      text: "報告沒有帶上限與警戒線，所以本頁只能顯示成本，無法判斷任何一個畫面是否超支。",
      fix: "在 #99 的報告加入 limits（每個指標的 limit 與 warn）。",
    });
  }
  if (report.screens.length === 0) {
    notes.push({
      id: "no-screens",
      level: "unknown",
      text: "報告沒有同畫面（same-screen）預算，因此無法回答「一場戰鬥同時出現這些模型會不會爆」。",
      fix: "在 #99 的報告加入 screens（每個場景包含哪些模型、各幾個）。",
    });
  }
  if (notes.length === 0) {
    notes.push({
      id: "ok",
      level: "ok",
      text: `報告涵蓋內容樹裡全部 ${recon.liveTotal} 個模型，沒有遺漏也沒有孤兒列。`,
      fix: "",
    });
  }
  return notes;
}

// ----------------------------------------------------------- budget math ----

/**
 * Where one measured value sits against its limit. `unknown` when either side
 * is missing — a missing limit must never render as "within budget".
 */
export function verdictFor(value: number | null, limit: BudgetLimit | undefined): BudgetVerdict {
  if (value === null || limit === undefined) return "unknown";
  if (limit.limit !== null && value > limit.limit) return "over";
  if (limit.warn !== null && value > limit.warn) return "warn";
  if (limit.limit === null && limit.warn === null) return "unknown";
  return "ok";
}

/** Per-screen limits win over the report-level ones; neither is invented. */
export function limitFor(
  report: BudgetReport | null,
  screen: BudgetScreen | null,
  key: string,
): BudgetLimit | undefined {
  return (
    screen?.limits.find((l) => l.key === key) ?? report?.limits.find((l) => l.key === key)
  );
}

/** The report's own verdict for one model axis (over/warn/ok), or unknown. */
export function modelVerdict(row: BudgetModelRow, key: string): BudgetVerdict {
  return row.verdicts[key] ?? "unknown";
}
/** True when the report scored ANY axis of this model over its hard limit. */
export function isOverThreshold(row: BudgetModelRow): boolean {
  return Object.values(row.verdicts).some((v) => v === "over");
}

/**
 * Order models heaviest-first — the ask is a table sorted heavy→light. VRAM is
 * the dimension that actually fills a frame, so it leads; triangles break ties;
 * an UNMEASURED model (both null) always sinks to the bottom, never floats up as
 * if it were free.
 */
export function sortModelsHeavyToLight(models: readonly BudgetModelRow[]): BudgetModelRow[] {
  const weight = (m: BudgetModelRow): [number, number] => [m.vramBytes ?? -1, m.triangles ?? -1];
  return [...models].sort((a, b) => {
    const [av, at] = weight(a);
    const [bv, bt] = weight(b);
    return bv - av || bt - at || a.id.localeCompare(b.id);
  });
}

/** Models the report scored over a hard limit, heaviest first. */
export function overThresholdModels(report: BudgetReport | null): BudgetModelRow[] {
  if (!report) return [];
  return sortModelsHeavyToLight(report.models.filter(isOverThreshold));
}

// ------------------------------------------------ offline optimise worklist --

/**
 * The worklist the 「排入離線最佳化」button hands to task #99's offline optimiser
 * (tools/model-budget/worklist.ts writes the SAME schema from the same report,
 * so the console and the CLI agree by construction). The page only PRODUCES this
 * list — the actual decimation is #115's optimiser, run offline, never here.
 */
export const OPTIMISE_WORKLIST_SCHEMA = "model-budget/optimise-worklist@1";

export type OptimiseAction =
  | { readonly kind: "texture-resize"; readonly fromEdge: number; readonly targetEdge: number; readonly estVramSavedBytes: number }
  | { readonly kind: "geometry-decimate"; readonly fromTris: number; readonly targetTris: number; readonly requires: string };

export interface OptimiseItem {
  readonly id: string;
  readonly path: string;
  readonly role: string;
  readonly worstCount: number;
  readonly vramBytes: number | null;
  readonly triangles: number | null;
  readonly actions: readonly OptimiseAction[];
  /** breached axes no automated pass fixes (draw calls / anim channels) */
  readonly manual: readonly string[];
}

export interface OptimiseWorklist {
  readonly schema: string;
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly threshold: "warn" | "over";
  readonly source: { readonly report: string; readonly sourcesDigest: string; readonly schema: string };
  readonly items: readonly OptimiseItem[];
  readonly totals: { readonly queued: number; readonly estVramSavedBytes: number };
}

const floorPow2 = (n: number): number => (n < 1 ? 1 : 1 << Math.floor(Math.log2(n)));

/** Which report verdict keys the offline optimiser can act on, and how. */
const OPTIMISABLE: Record<string, "texture" | "geometry"> = {
  maxTextureEdge: "texture",
  triangles: "geometry",
};
/** Axes no automated pass fixes — carried as manual re-authoring work. */
const MANUAL_AXES = ["drawCalls", "animChannels"] as const;

/**
 * Classify the report into the optimiser's actionable queue. Candidacy is the
 * WARNING LINE by default (matching "a warning line, and optimise anything over
 * the threshold"); a model is queued only when the optimiser can actually shrink
 * it (oversized texture or excess geometry). A model that is over budget only on
 * draw calls or animation channels is NOT queued — decimating a texture cannot
 * remove a mesh, and pretending otherwise is the silent lie the whole console
 * exists to avoid.
 *
 * Pure and deterministic: the same report yields the same worklist as
 * tools/model-budget/worklist.ts.
 */
export function buildOptimiseWorklist(
  report: BudgetReport | null,
  opts: { threshold?: "warn" | "over"; ids?: readonly string[]; now?: string } = {},
): OptimiseWorklist {
  const threshold = opts.threshold ?? "warn";
  const meets = (v: BudgetVerdict): boolean => v === "over" || (v === "warn" && threshold === "warn");
  const gateOf = new Map(report?.gates.map((g) => [g.role, g]) ?? []);
  const pick = opts.ids ? new Set(opts.ids) : null;

  const items: OptimiseItem[] = [];
  for (const m of report?.models ?? []) {
    if (m.broken !== "") continue;
    if (pick && !pick.has(m.id)) continue;
    const gate = gateOf.get(m.role);
    const actions: OptimiseAction[] = [];
    for (const [axis, fix] of Object.entries(OPTIMISABLE)) {
      if (!meets(modelVerdict(m, axis))) continue;
      if (fix === "texture" && gate?.texEdgeWarn != null && m.maxTextureEdge != null) {
        const targetEdge = floorPow2(gate.texEdgeWarn);
        if (m.maxTextureEdge > targetEdge) {
          const ratio = (targetEdge / m.maxTextureEdge) ** 2;
          actions.push({
            kind: "texture-resize",
            fromEdge: m.maxTextureEdge,
            targetEdge,
            estVramSavedBytes: Math.max(0, Math.round((m.vramBytes ?? 0) * (1 - ratio))),
          });
        }
      } else if (fix === "geometry" && gate?.trisWarn != null && m.triangles != null && m.triangles > gate.trisWarn) {
        actions.push({
          kind: "geometry-decimate",
          fromTris: m.triangles,
          targetTris: gate.trisWarn,
          requires: "geometry deps (#115)",
        });
      }
    }
    if (actions.length === 0) continue;
    items.push({
      id: m.id,
      path: m.path,
      role: m.role,
      worstCount: m.worstCount ?? 1,
      vramBytes: m.vramBytes,
      triangles: m.triangles,
      actions,
      manual: MANUAL_AXES.filter((a) => meets(modelVerdict(m, a))),
    });
  }
  items.sort((a, b) => (b.vramBytes ?? 0) - (a.vramBytes ?? 0) || (b.triangles ?? 0) - (a.triangles ?? 0));

  return {
    schema: OPTIMISE_WORKLIST_SCHEMA,
    generatedAt: opts.now ?? new Date().toISOString(),
    generatedBy: "apps/admin 模型預算 (queue offline optimise)",
    threshold,
    source: {
      report: report?.url ?? "",
      sourcesDigest: report?.sourcesDigest ?? "",
      schema: report?.schema ?? "",
    },
    items,
    totals: {
      queued: items.length,
      estVramSavedBytes: items.reduce(
        (n, it) => n + it.actions.reduce((s, a) => s + (a.kind === "texture-resize" ? a.estVramSavedBytes : 0), 0),
        0,
      ),
    },
  };
}

// ---------------------------------------------------------- formatting ------

/** An unmeasured metric prints as 未量測 — never as 0. */
export function fmtInt(n: number | null): string {
  return n === null ? "未量測" : Math.round(n).toLocaleString("en-US");
}

export function fmtBytes(n: number | null): string {
  if (n === null) return "未量測";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Age of a timestamp in a form an operator can act on. "" when unparseable. */
export function ageText(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} 小時前`;
  return `${Math.round(hours / 24)} 天前`;
}

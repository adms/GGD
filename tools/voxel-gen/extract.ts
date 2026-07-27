/**
 * voxel:extract — 規格 §5.2 的地端第一支命令。
 *
 *   pnpm voxel:extract                     read the champion icons, write the table
 *   pnpm voxel:extract --in <dir>          read reference images from elsewhere
 *   pnpm voxel:extract --out <dir>         write the table elsewhere
 *   pnpm voxel:extract --json              print the JSON to stdout as well
 *
 * Reads reference images and writes a 裁決表 in two forms:
 *   <out>/_voxel-extract.data.json   machine — the full drafts, for batch three
 *   <out>/_voxel-extract.csv         human   — one line per champion, sortable
 *
 * ── WHY BOTH, AND WHY THE CSV IS NOT A RENDERING OF THE JSON ────────────────
 * The JSON carries the whole barcode; the CSV carries the DECISION. 規格 §4.3
 * says the 後台 shows the owner only SUSPECT + FAIL + DUPLICATE and folds PASS
 * away, so the human artefact has to be readable without a viewer — a CSV opens
 * in anything, sorts by verdict, and can be pasted into a message. Both come
 * out of the same `VerdictRow[]`, so they cannot disagree.
 *
 * ── NO CLOCK, NO NETWORK, NO WRITES OUTSIDE `--out` ─────────────────────────
 * The report contains no timestamp on purpose: re-running on an unchanged
 * corpus must produce a byte-identical file, so a diff means the ARTWORK moved,
 * not that the command ran again. Nothing here reads or writes anything under
 * `content/`, so no `pnpm content:build` is implied.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adjudicate, extractBarcode, type ExtractDraft, type VerdictRow } from "./barcodeExtract";
import { decodePng, looksLikePng } from "./pngRead";
import type { BarcodeVerdict } from "@ggd/shared/content/voxelSkin";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../..");
export const DEFAULT_IN_DIR = path.join(REPO_ROOT, "content/assets/icons/champions");
export const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "docs");
export const JSON_BASENAME = "_voxel-extract.data.json";
export const CSV_BASENAME = "_voxel-extract.csv";
export const REPORT_SCHEMA = "voxel-extract@1";

/** Champion id for a reference image — the file stem, which is how the icon
 *  corpus is already keyed (`godie-e001.png` → `godie-e001`). */
export function championIdFromFile(file: string): string {
  return path.basename(file, path.extname(file));
}

/**
 * Every reference image in a directory, sorted by name.
 *
 * Non-PNG files are INCLUDED rather than filtered out. A `.webp` icon is not
 * "not a reference image", it is a reference image this decoder cannot read
 * yet — and a census that silently omits it reports 86 of 142 champions as if
 * that were the whole roster. It comes back as a FAIL row with the reason
 * spelled out, which is a fact the owner can act on.
 */
export function listReferenceImages(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) continue;
    const ext = path.extname(name).toLowerCase();
    if (ext !== ".png" && ext !== ".webp" && ext !== ".jpg" && ext !== ".jpeg") continue;
    out.push(full);
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Read + extract ONE file, turning any decode failure into a FAIL row rather
 *  than an exception that would abort the whole census at file 3 of 142. */
export function draftForFile(file: string, inDir: string): ExtractDraft {
  const championId = championIdFromFile(file);
  const refImage = path.relative(inDir, file);
  try {
    const bytes = new Uint8Array(fs.readFileSync(file));
    if (!looksLikePng(bytes)) {
      throw new Error(`不是 PNG（${path.extname(file) || "無副檔名"}）—— 目前只支援 PNG 參考圖`);
    }
    return extractBarcode(championId, refImage, decodePng(bytes));
  } catch (err) {
    return {
      championId,
      refImage,
      barcode: null,
      verdict: "FAIL",
      reasons: [`解碼失敗：${err instanceof Error ? err.message : String(err)}`],
      metrics: {
        foregroundRatio: 0,
        bboxHeightRatio: 0,
        maxPairwiseDeltaE: 0,
        rawRunCount: 0,
        bandCount: 0,
        framesDropped: 0,
        distinctColors: 0,
      },
      hash: "",
      tones: [],
    };
  }
}

export interface ExtractReport {
  schema: string;
  inDir: string;
  counts: Record<BarcodeVerdict, number> & { total: number };
  rows: VerdictRow[];
}

export function buildReport(inDir: string): ExtractReport {
  const files = listReferenceImages(inDir);
  const rows = adjudicate(files.map((f) => draftForFile(f, inDir)));
  const counts = { PASS: 0, SUSPECT: 0, FAIL: 0, DUPLICATE: 0, total: rows.length };
  for (const r of rows) counts[r.verdict]++;
  return { schema: REPORT_SCHEMA, inDir: path.relative(REPO_ROOT, inDir), counts, rows };
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

/** RFC 4180 quoting. A reason string contains commas and full-width brackets;
 *  an unquoted CSV would shift every column right of it. */
function csvCell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER = [
  "championId",
  "verdict",
  "refImage",
  "bands",
  // How many runs the image produced BEFORE they were squeezed into eleven
  // slots. A busy 64×64 icon can yield forty; that the draft then has eleven
  // bands is an artefact of the slot count, not a reading of the character —
  // and a human triaging the table has to be able to see that.
  "rawRuns",
  "maxPairwiseDeltaE",
  "foregroundRatio",
  "bboxHeightRatio",
  "framesDropped",
  "hash",
  "duplicateOf",
  "bandHexes",
  "reasons",
] as const;

export function toCsv(rows: readonly VerdictRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    const hexes = r.tones.map((t) => `${t.slot}=${t.hex}`).join(" ");
    lines.push(
      [
        csvCell(r.championId),
        csvCell(r.verdict),
        csvCell(r.refImage),
        csvCell(r.metrics.bandCount),
        csvCell(r.metrics.rawRunCount),
        csvCell(r.metrics.maxPairwiseDeltaE.toFixed(2)),
        csvCell(r.metrics.foregroundRatio.toFixed(4)),
        csvCell(r.metrics.bboxHeightRatio.toFixed(4)),
        csvCell(r.metrics.framesDropped),
        csvCell(r.hash),
        csvCell(r.duplicateOf),
        csvCell(hexes),
        csvCell(r.reasons.join(" ｜ ")),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Drop the `counts` Maps that never survive JSON anyway, and keep the field
 *  order stable so the file diffs cleanly between runs. */
export function toJson(report: ExtractReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}

export interface WriteResult {
  jsonPath: string;
  csvPath: string;
  report: ExtractReport;
}

export function writeReport(inDir: string, outDir: string): WriteResult {
  const report = buildReport(inDir);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, JSON_BASENAME);
  const csvPath = path.join(outDir, CSV_BASENAME);
  fs.writeFileSync(jsonPath, toJson(report));
  fs.writeFileSync(csvPath, toCsv(report.rows));
  return { jsonPath, csvPath, report };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : null;
}

function main(): void {
  const argv = process.argv.slice(2);
  const inDir = path.resolve(argValue(argv, "--in") ?? DEFAULT_IN_DIR);
  const outDir = path.resolve(argValue(argv, "--out") ?? DEFAULT_OUT_DIR);
  if (!fs.existsSync(inDir)) {
    console.error(`voxel:extract — 找不到參考圖目錄 ${inDir}`);
    process.exit(1);
  }
  const { jsonPath, csvPath, report } = writeReport(inDir, outDir);
  const c = report.counts;
  for (const row of report.rows) {
    if (row.verdict === "PASS") continue; // §4.3 — PASS 摺疊起來
    console.log(`${row.verdict.padEnd(9)} ${row.championId.padEnd(16)} ${row.reasons.join(" ｜ ")}`);
  }
  console.log(
    `\n${c.total} 張參考圖：PASS ${c.PASS} · SUSPECT ${c.SUSPECT} · FAIL ${c.FAIL} · DUPLICATE ${c.DUPLICATE}`,
  );
  console.log(`裁決表 → ${path.relative(REPO_ROOT, jsonPath)}  ${path.relative(REPO_ROOT, csvPath)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();

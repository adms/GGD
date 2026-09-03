#!/usr/bin/env -S node --import tsx

/**
 * Import the one-click VFX Forge browser batch into durable review evidence.
 *
 * The browser owns real WebGL capture. This script owns the repeatable,
 * fail-closed handoff: exact 42/46 scope, unique IDs, decoded image files and a
 * compact manifest that the deterministic skill audit can consume.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SKILL_ACCEPTANCE_CANDIDATES,
  SKILL_ACCEPTANCE_THEME_IDS,
} from "../../apps/editor/src/forge/skillAcceptanceCatalog";
import type { VisualAcceptanceMachineIssue } from "../../apps/editor/src/vfx-forge/visualAcceptanceIssues";
import type { BackdropTimelineAudit } from "../../apps/editor/src/vfx-forge/VfxForgeStage";
import { classifyImportedVisualAcceptance } from "./visualProofImport";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const inputPath = positional[0] ? resolve(positional[0]) : null;
const checkOnly = process.argv.includes("--check");
const selfTest = process.argv.includes("--self-test");
const requireReview = process.argv.includes("--require-review");
const OUT_DIR = join(ROOT, "docs/_reports/editor-skill-basic-visual-proof");
const FRAME_DIR = join(OUT_DIR, "frames");
const MANIFEST = join(OUT_DIR, "manifest.json");

if (!selfTest && !inputPath) fail("usage: pnpm skillforge:visual-proof:import -- <browser-export.json>");
if (inputPath && !existsSync(inputPath)) fail(`input not found: ${inputPath}`);

const source = (selfTest ? {
  schema: "ggd-editor-basic-visual-proof@1",
  issueClassifier: "ggd-editor-visual-issue-rules@1",
  generatedAt: "self-test",
  themes: SKILL_ACCEPTANCE_THEME_IDS.size,
  documents: SKILL_ACCEPTANCE_CANDIDATES.length,
  cases: SKILL_ACCEPTANCE_CANDIDATES.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    status: "blocked",
    blockers: ["self-test"],
    frames: [],
    humanVerdict: "pending",
    humanScore: null,
    humanNote: "",
  })),
} : JSON.parse(readFileSync(inputPath!, "utf8"))) as {
  schema?: unknown;
  generatedAt?: unknown;
  themes?: unknown;
  documents?: unknown;
  cases?: unknown;
  issueClassifier?: unknown;
};
if (source.schema !== "ggd-editor-basic-visual-proof@1") fail(`unexpected schema: ${String(source.schema)}`);
if (source.issueClassifier !== "ggd-editor-visual-issue-rules@1") {
  fail(`unexpected issue classifier: ${String(source.issueClassifier)}`);
}
if (source.themes !== SKILL_ACCEPTANCE_THEME_IDS.size || source.documents !== SKILL_ACCEPTANCE_CANDIDATES.length) {
  fail(`scope mismatch: ${String(source.themes)} themes / ${String(source.documents)} documents`);
}
if (!Array.isArray(source.cases)) fail("cases must be an array");

const byId = new Map<string, Record<string, unknown>>();
for (const value of source.cases) {
  if (!value || typeof value !== "object") fail("every case must be an object");
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) fail("case is missing id");
  if (byId.has(id)) fail(`duplicate case id: ${id}`);
  byId.set(id, row);
}
const expected = new Set(SKILL_ACCEPTANCE_CANDIDATES.map((row) => row.id));
const missing = [...expected].filter((id) => !byId.has(id));
const extra = [...byId.keys()].filter((id) => !expected.has(id));
if (missing.length || extra.length || byId.size !== expected.size) {
  fail(`acceptance IDs drifted; missing=[${missing.join(",")}] extra=[${extra.join(",")}]`);
}

if (!checkOnly && !selfTest) mkdirSync(FRAME_DIR, { recursive: true });
const cases = SKILL_ACCEPTANCE_CANDIDATES.map((candidate) => {
  const row = byId.get(candidate.id)!;
  const status = row.status;
  if (status !== "captured" && status !== "blocked" && status !== "failed") {
    fail(`${candidate.id}: invalid status ${String(status)}`);
  }
  const verdict = row.humanVerdict;
  if (verdict !== "pending" && verdict !== "pass" && verdict !== "fail") {
    fail(`${candidate.id}: invalid humanVerdict ${String(verdict)}`);
  }
  const score = row.humanScore;
  const humanNote = typeof row.humanNote === "string" ? row.humanNote : "";
  const numericScore = typeof score === "number" ? score : Number.NaN;
  if (score !== null && score !== undefined && (!Number.isInteger(numericScore) || numericScore < 0 || numericScore > 10)) {
    fail(`${candidate.id}: humanScore must be an integer from 0 to 10 or null`);
  }
  if (verdict !== "pending" && (score === null || score === undefined || humanNote.trim().length === 0)) {
    fail(`${candidate.id}: completed human verdict requires score and note`);
  }
  if (requireReview && status === "captured" && verdict === "pending") {
    fail(`${candidate.id}: captured evidence still awaits human review`);
  }
  const rawFrames = Array.isArray(row.frames) ? row.frames : [];
  if (status === "captured" && rawFrames.length === 0) fail(`${candidate.id}: captured without framebuffer`);
  if (status === "blocked" && rawFrames.length > 0) fail(`${candidate.id}: blocked must not carry review frames`);
  if (rawFrames.length === 0 && verdict !== "pending") fail(`${candidate.id}: human verdict requires framebuffer evidence`);
  const frames = rawFrames.map((frameValue, index) => {
    if (!frameValue || typeof frameValue !== "object") fail(`${candidate.id}: frame ${index + 1} is not an object`);
    const frame = frameValue as Record<string, unknown>;
    const dataUrl = typeof frame.dataUrl === "string" ? frame.dataUrl : "";
    const match = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) fail(`${candidate.id}: frame ${index + 1} has no supported image data URL`);
    const extension = match[1] === "jpeg" ? "jpg" : match[1];
    const atMs = Number.isFinite(frame.atMs) ? Math.max(0, Math.round(Number(frame.atMs))) : 0;
    const fileName = `${safe(candidate.id)}-${String(index + 1).padStart(2, "0")}-${atMs}ms.${extension}`;
    const absolute = join(FRAME_DIR, fileName);
    const bytes = Buffer.from(match[2]!, "base64");
    if (bytes.length < 100) fail(`${candidate.id}: frame ${index + 1} image is unexpectedly small`);
    const diagnosticOnly = frame.diagnosticOnly === true;
    if (status === "captured" && diagnosticOnly) fail(`${candidate.id}: captured cannot use diagnostic-only evidence`);
    if (status === "failed" && !diagnosticOnly) fail(`${candidate.id}: failed framebuffer must be diagnostic-only`);
    if (diagnosticOnly && verdict === "pass") fail(`${candidate.id}: diagnostic-only evidence cannot receive a pass verdict`);
    if (!checkOnly && !selfTest) writeFileSync(absolute, bytes);
    return {
      label: typeof frame.label === "string" ? frame.label : `frame ${index + 1}`,
      atMs,
      view: frame.view === "top" ? "top" : "side",
      framing: frame.framing === "detail" ? "detail" : "gameplay",
      frameAudit: frame.frameAudit ?? null,
      diagnosticOnly,
      file: relative(OUT_DIR, absolute),
      bytes: bytes.length,
    };
  });
  const blockers = Array.isArray(row.blockers) ? row.blockers.map(String) : [];
  const audit = row.audit && typeof row.audit === "object" ? row.audit as BackdropTimelineAudit : null;
  const classified = classifyImportedVisualAcceptance({
    status,
    blockers,
    audit,
    frames,
    proofSource: row.proofSource,
  });
  if (status === "captured" && classified.proofSource === undefined) {
    fail(`${candidate.id}: captured evidence is missing a supported proofSource`);
  }
  const { machineIssues, proofSource } = classified;
  if (!selfTest) assertMachineIssues(candidate.id, row.machineIssues, machineIssues);
  const basicVisualFallback = parseBasicVisualFallback(candidate.id, row.basicVisualFallback);
  return {
    id: candidate.id,
    name: candidate.name,
    status,
    blockers,
    audit,
    frames,
    proofSource,
    basicVisualFallback,
    machineIssues,
    humanVerdict: verdict,
    humanScore: score ?? null,
    humanNote,
  };
});

const manifest = {
  schema: "ggd-editor-basic-visual-proof-manifest@1",
  sourceFile: inputPath ? basename(inputPath) : "self-test",
  sourceGeneratedAt: typeof source.generatedAt === "string" ? source.generatedAt : null,
  importedAt: taipeiMinute(),
  themes: SKILL_ACCEPTANCE_THEME_IDS.size,
  documents: SKILL_ACCEPTANCE_CANDIDATES.length,
  summary: {
    captured: cases.filter((row) => row.status === "captured").length,
    blocked: cases.filter((row) => row.status === "blocked").length,
    failed: cases.filter((row) => row.status === "failed").length,
    humanPass: cases.filter((row) => row.humanVerdict === "pass").length,
    humanFail: cases.filter((row) => row.humanVerdict === "fail").length,
    humanPending: cases.filter((row) => row.humanVerdict === "pending").length,
    humanReviewedCaptured: cases.filter((row) => row.status === "captured" && row.humanVerdict !== "pending").length,
    capturedAwaitingReview: cases.filter((row) => row.status === "captured" && row.humanVerdict === "pending").length,
    machineIssueCounts: countBy(cases.flatMap((row) => row.machineIssues.map((issue) => issue.code))),
    ownerCounts: countBy(cases.flatMap((row) => row.machineIssues.map((issue) => issue.owner))),
  },
  cases,
};

const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
if (selfTest) {
  console.log(`PASS visual proof importer self-test · ${manifest.themes}/${manifest.documents}`);
} else if (checkOnly) {
  if (!existsSync(MANIFEST) || readFileSync(MANIFEST, "utf8") !== encoded) {
    fail(`${relative(ROOT, MANIFEST)} is stale; re-import ${basename(inputPath!)}`);
  }
  console.log(`PASS visual proof import · ${manifest.themes}/${manifest.documents}`);
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST, encoded);
  console.log(
    `WROTE ${relative(ROOT, MANIFEST)} · ` +
    `${manifest.summary.captured} captured / ${manifest.summary.blocked} blocked / ${manifest.summary.failed} failed`,
  );
}

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function parseBasicVisualFallback(
  id: string,
  value: unknown,
): { readonly fromVfxId: string; readonly toVfxId: string; readonly reason: "requires-host-bone" } | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object") fail(`${id}: invalid basicVisualFallback`);
  const row = value as Record<string, unknown>;
  if (
    typeof row.fromVfxId !== "string" || row.fromVfxId.length === 0 ||
    typeof row.toVfxId !== "string" || row.toVfxId.length === 0 ||
    row.reason !== "requires-host-bone"
  ) fail(`${id}: invalid basicVisualFallback receipt`);
  return {
    fromVfxId: row.fromVfxId,
    toVfxId: row.toVfxId,
    reason: "requires-host-bone",
  };
}

function assertMachineIssues(
  id: string,
  supplied: unknown,
  computed: readonly VisualAcceptanceMachineIssue[],
): void {
  if (!Array.isArray(supplied)) fail(`${id}: missing deterministic machineIssues`);
  const suppliedCodes = supplied.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const code = (value as Record<string, unknown>).code;
    return typeof code === "string" ? [code] : [];
  });
  const computedCodes = computed.map((issue) => issue.code);
  if (JSON.stringify(suppliedCodes) !== JSON.stringify(computedCodes)) {
    fail(`${id}: machine issue drift; supplied=[${suppliedCodes.join(",")}] computed=[${computedCodes.join(",")}]`);
  }
}

function countBy(values: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]),
  );
}

function taipeiMinute(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}+08:00`;
}

function fail(message: string): never {
  throw new Error(`FAIL ${message}`);
}

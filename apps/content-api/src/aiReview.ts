/**
 * Local AI change-control ledger.
 *
 * GH#664 Phase 2 progress: AI-authored mechanics / animation / VFX are held as
 * hash-locked proposals until a human verdict. GH#838's eight named scenes are
 * capability fixtures and are permanently non-promotable.
 *
 * AI-authored candidates are material under docs/_review, never live content.
 * A human verdict is bound to the exact review hash: candidate JSON plus every
 * screenshot, GPU receipt and explanation the reviewer actually saw.
 * Promotion is a separate operation and the caller must still revalidate the
 * candidate and compare its base hash immediately before writing content.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hashDoc, stableStringify, type CollectionName } from "@ggd/shared/content";

export const VFX_FORGE_ACCEPTANCE_IDS = new Set([
  "godie-hjai.e",
  "godie-hjai.r",
  "godie-hart.r",
  "godie-nbbc.r",
  "godie-nbbc.e",
  "godie-ogrh.r",
  "godie-e002.ex",
  "godie-hvsh.r",
]);

export type AiProposalPurpose = "production-candidate" | "editor-capability-fixture";
export type AiVerdict = "approve" | "reject" | "pass" | "fail";

export interface AiProposalTarget {
  collection: CollectionName;
  id: string;
}

export interface AiVisualEvidence {
  label: string;
  dataUrl: string;
  atMs: number;
  view: "side" | "top";
  /** Optional only while reading legacy @1/@2 proposals. New @3 submissions require it. */
  frameAudit?: {
    litShare: number;
    highlightShare: number;
    brightShare: number;
    nearWhiteShare: number;
    dominantBrightShare: number;
    dominantNonBackgroundShare: number;
    localWhiteCardShare: number;
    diagnosticCheckerShare: number;
    unsafe: false;
    reason?: string;
  };
}

export interface AiVisualAuditReceipt {
  schema: "ggd-vfx-visual-audit@1" | "ggd-vfx-visual-audit@2" | "ggd-vfx-visual-audit@3";
  safe: true;
  autoVisualScore: number;
  sampledFrames: number;
  peakParticleCount: number;
  peakSystemCount: number;
  worstAtMs: number;
  worst: {
    litShare: number;
    highlightShare: number;
    brightShare: number;
    nearWhiteShare: number;
    dominantBrightShare: number;
    dominantNonBackgroundShare: number;
    localWhiteCardShare: number;
    /** Added in @2; @3 also treats blue-channel readback as the same checker family. */
    diagnosticCheckerShare?: number;
    unsafe: false;
    reason?: string;
  };
  suspects: string[];
}

export interface AiChangeProposal {
  schema: "ggd-ai-change-proposal@1";
  key: string;
  target: AiProposalTarget;
  purpose: AiProposalPurpose;
  promotable: boolean;
  source: "ai-assisted-editor";
  summary: string;
  evidence: string[];
  visualEvidence: AiVisualEvidence[];
  /** GPU sweep that produced the score. Required for every new VFX proposal. */
  visualAudit?: AiVisualAuditReceipt;
  autoVisualScore?: number;
  candidate: Record<string, unknown>;
  candidateHash: string;
  /** Exact source bytes observed before authoring; null means this is a create. */
  sourceBaseSha256: string | null;
  /** The only operation the generic review route is allowed to execute. */
  authoringOperation: AiAuthoringOperation;
  /** SHA-256 over source pin + operation + expected outputs. */
  authoringOperationDigest: string;
  /** Outputs that must be reproduced exactly before promotion is recorded. */
  expectedOutputs: AiExpectedOutput[];
  /** Candidate + all human-visible review material. Verdicts bind this, not only candidateHash. */
  reviewHash: string;
  baseHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiChangeVerdict {
  schema: "ggd-ai-change-verdict@1";
  key: string;
  candidateHash: string;
  reviewHash: string;
  sourceBaseSha256: string | null;
  authoringOperation: AiAuthoringOperation;
  authoringOperationDigest: string;
  expectedOutputs: AiExpectedOutput[];
  verdict: AiVerdict;
  reviewer: string;
  note: string;
  humanVisualScore?: number;
  decidedAt: string;
}

export interface AiPromotion {
  schema: "ggd-ai-change-promotion@1";
  key: string;
  candidateHash: string;
  reviewHash: string;
  sourceBaseSha256: string | null;
  authoringOperationDigest: string;
  promotedAt: string;
  outputHash: string;
}

export type AiProposalStatus =
  | "pending-review"
  | "changed-after-review"
  | "approved"
  | "rejected"
  | "promoted"
  | "fixture-pending"
  | "fixture-passed"
  | "fixture-failed";

export interface AiProposalQueueItem extends AiChangeProposal {
  verdict: AiChangeVerdict | null;
  promotion: AiPromotion | null;
  status: AiProposalStatus;
}

interface SubmitInput {
  target: AiProposalTarget;
  purpose: AiProposalPurpose;
  candidate: Record<string, unknown>;
  baseHash: string | null;
  sourceBaseSha256: string | null;
  summary?: string;
  evidence?: string[];
  visualEvidence?: unknown;
  visualAudit?: unknown;
  autoVisualScore?: number;
}

export interface AiAuthoringOperation {
  schema: "ggd-ai-authoring-operation@1";
  kind: "document-upsert";
  target: AiProposalTarget;
}

export interface AiExpectedOutput {
  collection: CollectionName;
  id: string;
  contentHash: string;
}

interface VerdictLedger {
  schema: "ggd-ai-change-verdict-ledger@1";
  entries: Record<string, AiChangeVerdict>;
}

interface PromotionLedger {
  schema: "ggd-ai-change-promotion-ledger@1";
  entries: Record<string, AiPromotion>;
}

const EMPTY_VERDICTS: VerdictLedger = { schema: "ggd-ai-change-verdict-ledger@1", entries: {} };
const EMPTY_PROMOTIONS: PromotionLedger = { schema: "ggd-ai-change-promotion-ledger@1", entries: {} };

function atomicJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tmp, file);
}

function readLedger<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return structuredClone(fallback);
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function score(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error(`${field} 必須是 0～10 的數字`);
  }
  return value;
}

function visualFrameAudit(value: unknown, index: number): NonNullable<AiVisualEvidence["frameAudit"]> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`visualEvidence.${index}.frameAudit 必須是物件`);
  }
  const raw = value as Record<string, unknown>;
  if (raw.unsafe !== false) throw new Error(`visualEvidence.${index}.frameAudit.unsafe 必須為 false`);
  const reason = raw.reason;
  if (reason !== undefined && (typeof reason !== "string" || reason.length > 800)) {
    throw new Error(`visualEvidence.${index}.frameAudit.reason 最多 800 字`);
  }
  return {
    litShare: boundedNumber(raw, "litShare", 0, 1),
    highlightShare: boundedNumber(raw, "highlightShare", 0, 1),
    brightShare: boundedNumber(raw, "brightShare", 0, 1),
    nearWhiteShare: boundedNumber(raw, "nearWhiteShare", 0, 1),
    dominantBrightShare: boundedNumber(raw, "dominantBrightShare", 0, 1),
    dominantNonBackgroundShare: boundedNumber(raw, "dominantNonBackgroundShare", 0, 1),
    localWhiteCardShare: boundedNumber(raw, "localWhiteCardShare", 0, 1),
    diagnosticCheckerShare: boundedNumber(raw, "diagnosticCheckerShare", 0, 1),
    unsafe: false,
    ...(typeof reason === "string" && reason.trim() !== "" ? { reason: reason.trim() } : {}),
  };
}

function visualEvidenceFrames(value: unknown): AiVisualEvidence[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("visualEvidence 必須是陣列");
  if (value.length > 4) throw new Error("視覺證據最多 4 張");
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error(`visualEvidence.${index} 必須是物件`);
    }
    const frame = raw as Record<string, unknown>;
    const label = typeof frame.label === "string" ? frame.label.trim() : "";
    if (label === "" || label.length > 80) throw new Error(`visualEvidence.${index}.label 必須是 1～80 字`);
    const atMs = frame.atMs;
    if (typeof atMs !== "number" || !Number.isFinite(atMs) || atMs < 0 || atMs > 30_000) {
      throw new Error(`visualEvidence.${index}.atMs 必須是 0～30000`);
    }
    if (frame.view !== "side" && frame.view !== "top") {
      throw new Error(`visualEvidence.${index}.view 必須是 side 或 top`);
    }
    const dataUrl = frame.dataUrl;
    if (typeof dataUrl !== "string" || dataUrl.length > 400_000 ||
      !/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
      throw new Error(`visualEvidence.${index}.dataUrl 必須是 400KB 以下的 PNG/WebP data URL`);
    }
    const frameAudit = visualFrameAudit(frame.frameAudit, index);
    return {
      label,
      dataUrl,
      atMs: Math.round(atMs),
      view: frame.view,
      ...(frameAudit ? { frameAudit } : {}),
    };
  });
}

function boundedNumber(
  record: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
  integer = false,
): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max ||
    (integer && !Number.isInteger(value))) {
    throw new Error(`visualAudit.${field} 必須是 ${min}～${max}${integer ? " 的整數" : ""}`);
  }
  return value;
}

function visualAuditReceipt(value: unknown): AiVisualAuditReceipt | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("visualAudit 必須是物件");
  }
  const raw = value as Record<string, unknown>;
  if (!["ggd-vfx-visual-audit@1", "ggd-vfx-visual-audit@2", "ggd-vfx-visual-audit@3"].includes(String(raw.schema))) {
    throw new Error("visualAudit.schema 不支援");
  }
  const auditSchema = raw.schema as AiVisualAuditReceipt["schema"];
  if (raw.safe !== true) throw new Error("visualAudit 必須是完整時間軸 GPU 掃描通過的收據");
  const worstRaw = raw.worst;
  if (typeof worstRaw !== "object" || worstRaw === null || Array.isArray(worstRaw)) {
    throw new Error("visualAudit.worst 必須是物件");
  }
  const worst = worstRaw as Record<string, unknown>;
  if (worst.unsafe !== false) throw new Error("visualAudit.worst.unsafe 必須為 false");
  const reason = worst.reason;
  if (reason !== undefined && (typeof reason !== "string" || reason.length > 800)) {
    throw new Error("visualAudit.worst.reason 最多 800 字");
  }
  if (!Array.isArray(raw.suspects) || raw.suspects.length > 8 ||
    raw.suspects.some((item) => typeof item !== "string" || item.length > 500)) {
    throw new Error("visualAudit.suspects 最多 8 筆，每筆最多 500 字");
  }
  return {
    schema: auditSchema,
    safe: true,
    autoVisualScore: boundedNumber(raw, "autoVisualScore", 0, 10),
    sampledFrames: boundedNumber(raw, "sampledFrames", 1, 10_000, true),
    peakParticleCount: boundedNumber(raw, "peakParticleCount", 0, 1_000_000, true),
    peakSystemCount: boundedNumber(raw, "peakSystemCount", 0, 100_000, true),
    worstAtMs: boundedNumber(raw, "worstAtMs", 0, 30_000),
    worst: {
      litShare: boundedNumber(worst, "litShare", 0, 1),
      highlightShare: boundedNumber(worst, "highlightShare", 0, 1),
      brightShare: boundedNumber(worst, "brightShare", 0, 1),
      nearWhiteShare: boundedNumber(worst, "nearWhiteShare", 0, 1),
      dominantBrightShare: boundedNumber(worst, "dominantBrightShare", 0, 1),
      dominantNonBackgroundShare: boundedNumber(worst, "dominantNonBackgroundShare", 0, 1),
      localWhiteCardShare: boundedNumber(worst, "localWhiteCardShare", 0, 1),
      ...(auditSchema === "ggd-vfx-visual-audit@2" || auditSchema === "ggd-vfx-visual-audit@3"
        ? { diagnosticCheckerShare: boundedNumber(worst, "diagnosticCheckerShare", 0, 1) }
        : {}),
      unsafe: false,
      ...(typeof reason === "string" && reason.trim() !== "" ? { reason: reason.trim() } : {}),
    },
    suspects: [...raw.suspects] as string[],
  };
}

type ReviewMaterial = Pick<AiChangeProposal,
  "target" | "purpose" | "summary" | "evidence" | "visualEvidence" | "visualAudit" |
  "autoVisualScore" | "candidateHash" | "baseHash" | "sourceBaseSha256" |
  "authoringOperation" | "authoringOperationDigest" | "expectedOutputs"
>;

function sha256(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function authoringBindings(
  target: AiProposalTarget,
  candidateHash: string,
  sourceBaseSha256: string | null,
): Pick<AiChangeProposal, "sourceBaseSha256" | "authoringOperation" | "authoringOperationDigest" | "expectedOutputs"> {
  const authoringOperation: AiAuthoringOperation = {
    schema: "ggd-ai-authoring-operation@1",
    kind: "document-upsert",
    target,
  };
  const expectedOutputs: AiExpectedOutput[] = [{ ...target, contentHash: candidateHash }];
  return {
    sourceBaseSha256,
    authoringOperation,
    authoringOperationDigest: sha256({ sourceBaseSha256, authoringOperation, expectedOutputs }),
    expectedOutputs,
  };
}

export function aiProposalReviewHash(material: ReviewMaterial): string {
  return hashDoc({
    target: material.target,
    purpose: material.purpose,
    summary: material.summary,
    evidence: material.evidence,
    visualEvidence: material.visualEvidence,
    visualAudit: material.visualAudit ?? null,
    autoVisualScore: material.autoVisualScore ?? null,
    candidateHash: material.candidateHash,
    baseHash: material.baseHash,
    sourceBaseSha256: material.sourceBaseSha256,
    authoringOperation: material.authoringOperation,
    authoringOperationDigest: material.authoringOperationDigest,
    expectedOutputs: material.expectedOutputs,
  });
}

function normalizeProposal(raw: AiChangeProposal): AiChangeProposal {
  // Proposal JSON lives on the local filesystem and may be inspected or
  // edited outside the server. Never trust its self-reported candidate hash:
  // recomputing it makes any such edit invalidate the verdict instead of
  // letting a stale hash authorize different bytes.
  const candidateHash = hashDoc(raw.candidate);
  const sourceBaseSha256 = typeof raw.sourceBaseSha256 === "string" || raw.sourceBaseSha256 === null
    ? raw.sourceBaseSha256
    : null;
  const proposal = {
    ...raw,
    visualEvidence: raw.visualEvidence ?? [],
    candidateHash,
    ...authoringBindings(raw.target, candidateHash, sourceBaseSha256),
  };
  return { ...proposal, reviewHash: aiProposalReviewHash(proposal) };
}

export function aiProposalKey(target: AiProposalTarget): string {
  return `${target.collection}:${target.id}`;
}

function fileStem(key: string): string {
  if (!/^[a-z0-9-]+:[a-z0-9][a-z0-9._-]*$/.test(key)) throw new Error(`AI proposal key 不合法：${key}`);
  return key.replace(":", "--");
}

export class AiReviewStore {
  private readonly proposalsDir: string;
  private readonly verdictsFile: string;
  private readonly promotionsFile: string;

  constructor(readonly reviewRoot: string) {
    this.proposalsDir = join(reviewRoot, "ai-proposals");
    this.verdictsFile = join(reviewRoot, "ai-verdicts.json");
    this.promotionsFile = join(reviewRoot, "ai-promotions.json");
  }

  submit(input: SubmitInput): AiChangeProposal {
    const key = aiProposalKey(input.target);
    const now = new Date().toISOString();
    const existing = this.readProposal(key);
    const forcedFixture = input.target.collection === "vfx-scripts" && VFX_FORGE_ACCEPTANCE_IDS.has(input.target.id);
    const purpose: AiProposalPurpose = forcedFixture ? "editor-capability-fixture" : input.purpose;
    const visualEvidence = visualEvidenceFrames(input.visualEvidence);
    const visualAudit = visualAuditReceipt(input.visualAudit);
    if (input.target.collection === "vfx-scripts") {
      const minimum = forcedFixture ? 2 : 1;
      if (visualEvidence.length < minimum) {
        throw new Error(forcedFixture
          ? "八招能力驗收至少需要 2 張候選畫面證據"
          : "VFX 上線候選至少需要 1 張候選畫面證據");
      }
      if (!visualAudit) throw new Error("VFX 候選必須包含完整時間軸 GPU 視覺稽核收據");
      if (visualAudit.schema !== "ggd-vfx-visual-audit@3") {
        throw new Error("VFX 候選的舊視覺稽核會漏掉棋盤貼圖，必須由 Editor 以 @3 重新掃描");
      }
      if (visualEvidence.some((frame) => frame.frameAudit === undefined)) {
        throw new Error("VFX 候選每張關鍵格都必須包含 @3 GPU 畫面稽核，禁止只依賴時間軸抽樣");
      }
    }
    const autoVisualScore = score(input.autoVisualScore, "autoVisualScore");
    if (visualAudit && autoVisualScore !== undefined && visualAudit.autoVisualScore !== autoVisualScore) {
      throw new Error("autoVisualScore 必須與 visualAudit.autoVisualScore 相同");
    }
    const candidateHash = hashDoc(input.candidate);
    const material = {
      schema: "ggd-ai-change-proposal@1" as const,
      key,
      target: input.target,
      purpose,
      promotable: purpose === "production-candidate",
      source: "ai-assisted-editor" as const,
      summary: String(input.summary ?? "").trim(),
      evidence: (input.evidence ?? []).filter((item): item is string => typeof item === "string" && item.trim() !== ""),
      visualEvidence,
      ...(visualAudit ? { visualAudit } : {}),
      ...(autoVisualScore === undefined ? {} : { autoVisualScore }),
      candidate: input.candidate,
      candidateHash,
      baseHash: input.baseHash,
      ...authoringBindings(input.target, candidateHash, input.sourceBaseSha256),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const proposal: AiChangeProposal = {
      ...material,
      reviewHash: aiProposalReviewHash(material),
    };
    atomicJson(join(this.proposalsDir, `${fileStem(key)}.json`), proposal);
    return proposal;
  }

  decide(input: {
    key: string;
    candidateHash: string;
    reviewHash: string;
    verdict: AiVerdict;
    reviewer: string;
    note: string;
    humanVisualScore?: number;
  }): AiChangeVerdict {
    const proposal = this.readProposal(input.key);
    if (!proposal) throw new Error(`找不到 AI 候選：${input.key}`);
    if (proposal.candidateHash !== input.candidateHash) {
      throw new Error("候選內容已變更；這次裁決不能套到新版本");
    }
    if (proposal.reviewHash !== input.reviewHash) {
      throw new Error("候選擷圖／稽核收據已變更；請重新檢視後再裁決");
    }
    const fixture = proposal.purpose === "editor-capability-fixture";
    if (proposal.target.collection === "vfx-scripts") {
      const minimum = fixture ? 2 : 1;
      if ((proposal.visualEvidence ?? []).length < minimum) {
        throw new Error(fixture ? "八招能力驗收缺少 2 張候選畫面證據" : "VFX 候選缺少候選畫面證據");
      }
      if (!proposal.visualAudit) throw new Error("VFX 候選缺少 GPU 完整時間軸稽核收據，請由 Editor 重新送審");
      const positiveVerdict = fixture ? "pass" : "approve";
      if (proposal.visualAudit.schema !== "ggd-vfx-visual-audit@3" && input.verdict === positiveVerdict) {
        throw new Error("VFX 候選仍是會漏掉棋盤貼圖的舊稽核，請由 Editor 重新送審");
      }
      if ((proposal.visualEvidence ?? []).some((frame) => frame.frameAudit === undefined) && input.verdict === positiveVerdict) {
        throw new Error("VFX 候選的關鍵格沒有逐張 GPU 稽核，請由 Editor 重新送審");
      }
    }
    const allowed = fixture ? new Set<AiVerdict>(["pass", "fail"]) : new Set<AiVerdict>(["approve", "reject"]);
    if (!allowed.has(input.verdict)) {
      throw new Error(fixture ? "驗收樣本只能判定 pass/fail" : "上線候選只能判定 approve/reject");
    }
    const reviewer = input.reviewer.trim();
    const note = input.note.trim();
    if (reviewer === "") throw new Error("人工審查者必填");
    if (note === "") throw new Error("人工審查意見必填");
    const humanVisualScore = score(input.humanVisualScore, "humanVisualScore");
    if (proposal.target.collection === "vfx-scripts" && humanVisualScore === undefined) {
      throw new Error(fixture ? "八招驗收必須填 0～10 肉眼分數" : "VFX 候選必須填 0～10 肉眼分數");
    }
    const entry: AiChangeVerdict = {
      schema: "ggd-ai-change-verdict@1",
      key: input.key,
      candidateHash: input.candidateHash,
      reviewHash: input.reviewHash,
      sourceBaseSha256: proposal.sourceBaseSha256,
      authoringOperation: proposal.authoringOperation,
      authoringOperationDigest: proposal.authoringOperationDigest,
      expectedOutputs: proposal.expectedOutputs,
      verdict: input.verdict,
      reviewer,
      note,
      ...(humanVisualScore === undefined ? {} : { humanVisualScore }),
      decidedAt: new Date().toISOString(),
    };
    const ledger = readLedger(this.verdictsFile, EMPTY_VERDICTS);
    ledger.entries[input.key] = entry;
    atomicJson(this.verdictsFile, ledger);
    return entry;
  }

  promotionCandidate(key: string, candidateHash: string, reviewHash: string): AiChangeProposal {
    const item = this.queue().items.find((candidate) => candidate.key === key);
    if (!item) throw new Error(`找不到 AI 候選：${key}`);
    if (!item.promotable || item.purpose === "editor-capability-fixture") {
      throw new Error("這是編輯器能力驗收樣本，永遠不能 Promote 到遊戲內容");
    }
    if (item.target.collection === "vfx-scripts" && (
      item.visualAudit?.schema !== "ggd-vfx-visual-audit@3" ||
      item.visualEvidence.some((frame) => frame.frameAudit === undefined)
    )) {
      throw new Error("VFX 候選仍是舊稽核或缺少逐張關鍵格稽核，禁止 Promote");
    }
    if (item.candidateHash !== candidateHash) throw new Error("候選 hash 已變更，請重新審查");
    if (item.reviewHash !== reviewHash) throw new Error("候選審查材料已變更，請重新審查");
    if (item.status !== "approved") throw new Error(`候選尚未通過人工核准（目前 ${item.status}）`);
    return item;
  }

  recordPromotion(key: string, candidateHash: string, reviewHash: string, outputHash: string): AiPromotion {
    const proposal = this.readProposal(key);
    if (!proposal) throw new Error(`找不到 AI 候選：${key}`);
    const entry: AiPromotion = {
      schema: "ggd-ai-change-promotion@1",
      key,
      candidateHash,
      reviewHash,
      sourceBaseSha256: proposal.sourceBaseSha256,
      authoringOperationDigest: proposal.authoringOperationDigest,
      outputHash,
      promotedAt: new Date().toISOString(),
    };
    const ledger = readLedger(this.promotionsFile, EMPTY_PROMOTIONS);
    ledger.entries[key] = entry;
    atomicJson(this.promotionsFile, ledger);
    return entry;
  }

  queue(): { counts: Record<AiProposalStatus, number>; items: AiProposalQueueItem[] } {
    const verdicts = readLedger(this.verdictsFile, EMPTY_VERDICTS).entries;
    const promotions = readLedger(this.promotionsFile, EMPTY_PROMOTIONS).entries;
    const items = this.readAllProposals().map((proposal): AiProposalQueueItem => {
      const normalized = normalizeProposal(proposal);
      const verdict = verdicts[proposal.key] ?? null;
      const promotion = promotions[proposal.key] ?? null;
      return { ...normalized, verdict, promotion, status: statusOf(normalized, verdict, promotion) };
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const counts = Object.fromEntries([
      "pending-review",
      "changed-after-review",
      "approved",
      "rejected",
      "promoted",
      "fixture-pending",
      "fixture-passed",
      "fixture-failed",
    ].map((status) => [status, items.filter((item) => item.status === status).length])) as Record<AiProposalStatus, number>;
    return { counts, items };
  }

  readProposal(key: string): AiChangeProposal | null {
    const file = join(this.proposalsDir, `${fileStem(key)}.json`);
    return existsSync(file)
      ? normalizeProposal(JSON.parse(readFileSync(file, "utf8")) as AiChangeProposal)
      : null;
  }

  private readAllProposals(): AiChangeProposal[] {
    if (!existsSync(this.proposalsDir)) return [];
    return readdirSync(this.proposalsDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => normalizeProposal(
        JSON.parse(readFileSync(join(this.proposalsDir, name), "utf8")) as AiChangeProposal,
      ));
  }
}

function statusOf(
  proposal: AiChangeProposal,
  verdict: AiChangeVerdict | null,
  promotion: AiPromotion | null,
): AiProposalStatus {
  if (promotion?.candidateHash === proposal.candidateHash && promotion.reviewHash === proposal.reviewHash &&
    promotion.sourceBaseSha256 === proposal.sourceBaseSha256 &&
    promotion.authoringOperationDigest === proposal.authoringOperationDigest) return "promoted";
  if (verdict !== null &&
    (verdict.candidateHash !== proposal.candidateHash || verdict.reviewHash !== proposal.reviewHash ||
      verdict.sourceBaseSha256 !== proposal.sourceBaseSha256 ||
      verdict.authoringOperationDigest !== proposal.authoringOperationDigest ||
      sha256(verdict.authoringOperation ?? null) !== sha256(proposal.authoringOperation) ||
      sha256(verdict.expectedOutputs ?? null) !== sha256(proposal.expectedOutputs))) {
    return "changed-after-review";
  }
  if (proposal.purpose === "editor-capability-fixture") {
    if (verdict?.verdict === "pass") return "fixture-passed";
    if (verdict?.verdict === "fail") return "fixture-failed";
    return "fixture-pending";
  }
  if (verdict?.verdict === "approve") return "approved";
  if (verdict?.verdict === "reject") return "rejected";
  return "pending-review";
}

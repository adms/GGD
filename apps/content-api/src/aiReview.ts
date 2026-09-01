/**
 * Local AI change-control ledger.
 *
 * GH#664 Phase 2 progress: AI-authored mechanics / animation / VFX are held as
 * hash-locked proposals until a human verdict. GH#838's eight named scenes are
 * capability fixtures and are permanently non-promotable.
 *
 * AI-authored candidates are material under docs/_review, never live content.
 * A human verdict is bound to the exact candidate hash.  Promotion is a
 * separate operation and the caller must still revalidate the candidate and
 * compare its base hash immediately before writing content.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hashDoc, type CollectionName } from "@ggd/shared/content";

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

export interface AiChangeProposal {
  schema: "ggd-ai-change-proposal@1";
  key: string;
  target: AiProposalTarget;
  purpose: AiProposalPurpose;
  promotable: boolean;
  source: "ai-assisted-editor";
  summary: string;
  evidence: string[];
  autoVisualScore?: number;
  candidate: Record<string, unknown>;
  candidateHash: string;
  baseHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiChangeVerdict {
  schema: "ggd-ai-change-verdict@1";
  key: string;
  candidateHash: string;
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
  summary?: string;
  evidence?: string[];
  autoVisualScore?: number;
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
    const proposal: AiChangeProposal = {
      schema: "ggd-ai-change-proposal@1",
      key,
      target: input.target,
      purpose,
      promotable: purpose === "production-candidate",
      source: "ai-assisted-editor",
      summary: String(input.summary ?? "").trim(),
      evidence: (input.evidence ?? []).filter((item): item is string => typeof item === "string" && item.trim() !== ""),
      ...(score(input.autoVisualScore, "autoVisualScore") === undefined
        ? {}
        : { autoVisualScore: input.autoVisualScore }),
      candidate: input.candidate,
      candidateHash: hashDoc(input.candidate),
      baseHash: input.baseHash,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    atomicJson(join(this.proposalsDir, `${fileStem(key)}.json`), proposal);
    return proposal;
  }

  decide(input: {
    key: string;
    candidateHash: string;
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
    const fixture = proposal.purpose === "editor-capability-fixture";
    const allowed = fixture ? new Set<AiVerdict>(["pass", "fail"]) : new Set<AiVerdict>(["approve", "reject"]);
    if (!allowed.has(input.verdict)) {
      throw new Error(fixture ? "驗收樣本只能判定 pass/fail" : "上線候選只能判定 approve/reject");
    }
    const reviewer = input.reviewer.trim();
    const note = input.note.trim();
    if (reviewer === "") throw new Error("人工審查者必填");
    if (note === "") throw new Error("人工審查意見必填");
    const humanVisualScore = score(input.humanVisualScore, "humanVisualScore");
    if (fixture && humanVisualScore === undefined) throw new Error("八招驗收必須填 0～10 肉眼分數");
    const entry: AiChangeVerdict = {
      schema: "ggd-ai-change-verdict@1",
      key: input.key,
      candidateHash: input.candidateHash,
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

  promotionCandidate(key: string, candidateHash: string): AiChangeProposal {
    const item = this.queue().items.find((candidate) => candidate.key === key);
    if (!item) throw new Error(`找不到 AI 候選：${key}`);
    if (!item.promotable || item.purpose === "editor-capability-fixture") {
      throw new Error("這是編輯器能力驗收樣本，永遠不能 Promote 到遊戲內容");
    }
    if (item.candidateHash !== candidateHash) throw new Error("候選 hash 已變更，請重新審查");
    if (item.status !== "approved") throw new Error(`候選尚未通過人工核准（目前 ${item.status}）`);
    return item;
  }

  recordPromotion(key: string, candidateHash: string, outputHash: string): AiPromotion {
    const entry: AiPromotion = {
      schema: "ggd-ai-change-promotion@1",
      key,
      candidateHash,
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
      const verdict = verdicts[proposal.key] ?? null;
      const promotion = promotions[proposal.key] ?? null;
      return { ...proposal, verdict, promotion, status: statusOf(proposal, verdict, promotion) };
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
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as AiChangeProposal : null;
  }

  private readAllProposals(): AiChangeProposal[] {
    if (!existsSync(this.proposalsDir)) return [];
    return readdirSync(this.proposalsDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(readFileSync(join(this.proposalsDir, name), "utf8")) as AiChangeProposal);
  }
}

function statusOf(
  proposal: AiChangeProposal,
  verdict: AiChangeVerdict | null,
  promotion: AiPromotion | null,
): AiProposalStatus {
  if (promotion?.candidateHash === proposal.candidateHash) return "promoted";
  if (verdict !== null && verdict.candidateHash !== proposal.candidateHash) return "changed-after-review";
  if (proposal.purpose === "editor-capability-fixture") {
    if (verdict?.verdict === "pass") return "fixture-passed";
    if (verdict?.verdict === "fail") return "fixture-failed";
    return "fixture-pending";
  }
  if (verdict?.verdict === "approve") return "approved";
  if (verdict?.verdict === "reject") return "rejected";
  return "pending-review";
}

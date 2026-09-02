export type AiProposalPurpose = "production-candidate" | "editor-capability-fixture";

export type AiProposalStatus =
  | "pending-review"
  | "changed-after-review"
  | "approved"
  | "rejected"
  | "promoted"
  | "fixture-pending"
  | "fixture-passed"
  | "fixture-failed";

export interface AiReviewEvidenceFrame {
  readonly label: string;
  readonly dataUrl: string;
  readonly atMs: number;
  readonly view: "side" | "top";
}

export interface AiReviewQueueItem {
  readonly key: string;
  readonly target: { readonly collection: string; readonly id: string };
  readonly purpose: AiProposalPurpose;
  readonly promotable: boolean;
  readonly summary: string;
  readonly evidence: readonly string[];
  readonly visualEvidence: readonly AiReviewEvidenceFrame[];
  readonly autoVisualScore?: number;
  readonly candidate: Record<string, unknown>;
  readonly candidateHash: string;
  readonly baseHash: string | null;
  readonly updatedAt: string;
  readonly status: AiProposalStatus;
  readonly verdict: {
    readonly verdict: "approve" | "reject" | "pass" | "fail";
    readonly reviewer: string;
    readonly note: string;
    readonly humanVisualScore?: number;
    readonly decidedAt: string;
  } | null;
  readonly promotion: { readonly promotedAt: string } | null;
}

export interface AiReviewQueue {
  readonly counts: Partial<Record<AiProposalStatus, number>>;
  readonly items: readonly AiReviewQueueItem[];
}

export function isCapabilityFixture(item: AiReviewQueueItem): boolean {
  return item.purpose === "editor-capability-fixture";
}

/**
 * A fixture proves the editor can assemble a scene. It can never become live
 * content. Production candidates must still have an approval bound to the
 * exact candidate hash before this button is offered.
 */
export function canPromoteAiProposal(item: AiReviewQueueItem): boolean {
  return !isCapabilityFixture(item) && item.promotable && item.status === "approved";
}

export function decisionLabels(item: AiReviewQueueItem): {
  readonly positive: string;
  readonly negative: string;
  readonly positiveVerdict: "approve" | "pass";
  readonly negativeVerdict: "reject" | "fail";
} {
  return isCapabilityFixture(item)
    ? {
        positive: "✅ 驗收通過（只證明編輯器能力）",
        negative: "⛔ 驗收未通過",
        positiveVerdict: "pass",
        negativeVerdict: "fail",
      }
    : {
        positive: "☑️ 核准候選（尚未套用）",
        negative: "⛔ 否決候選",
        positiveVerdict: "approve",
        negativeVerdict: "reject",
      };
}

export function statusText(status: AiProposalStatus): string {
  const labels: Record<AiProposalStatus, string> = {
    "pending-review": "⏳ 等待人工審查",
    "changed-after-review": "⚠️ 審查後內容已變更",
    approved: "☑️ 已核准（尚未套用）",
    rejected: "⛔ 已否決",
    promoted: "✅ 已套用",
    "fixture-pending": "🧪 等待能力驗收",
    "fixture-passed": "🧪 能力驗收通過（永遠不可套用）",
    "fixture-failed": "🧪 能力驗收未通過",
  };
  return labels[status];
}

export function parseHumanVisualScore(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10 ? parsed : null;
}

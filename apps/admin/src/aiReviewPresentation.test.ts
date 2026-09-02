import { describe, expect, it } from "vitest";
import {
  canPromoteAiProposal,
  decisionLabels,
  parseHumanVisualScore,
  type AiReviewQueueItem,
} from "./aiReviewPresentation";

function item(overrides: Partial<AiReviewQueueItem> = {}): AiReviewQueueItem {
  return {
    key: "vfx-scripts:hero.q",
    target: { collection: "vfx-scripts", id: "hero.q" },
    purpose: "production-candidate",
    promotable: true,
    summary: "候選",
    evidence: [],
    visualEvidence: [],
    candidate: {},
    candidateHash: "sha256:candidate",
    baseHash: null,
    updatedAt: "2026-09-02T00:00:00.000Z",
    status: "approved",
    verdict: null,
    promotion: null,
    ...overrides,
  };
}

describe("AI 投稿批核呈現規則", () => {
  it("能力驗收樣本即使 pass 也永遠不能套用", () => {
    const fixture = item({
      purpose: "editor-capability-fixture",
      promotable: false,
      status: "fixture-passed",
    });
    expect(canPromoteAiProposal(fixture)).toBe(false);
    expect(decisionLabels(fixture)).toMatchObject({
      positiveVerdict: "pass",
      negativeVerdict: "fail",
    });
  });

  it("只有已核准的 production candidate 可以進入獨立 Promote", () => {
    expect(canPromoteAiProposal(item())).toBe(true);
    expect(canPromoteAiProposal(item({ status: "pending-review" }))).toBe(false);
    expect(canPromoteAiProposal(item({ promotable: false }))).toBe(false);
    expect(decisionLabels(item())).toMatchObject({
      positiveVerdict: "approve",
      negativeVerdict: "reject",
    });
  });

  it("肉眼評分只接受 0 到 10", () => {
    expect(parseHumanVisualScore("0")).toBe(0);
    expect(parseHumanVisualScore("7.5")).toBe(7.5);
    expect(parseHumanVisualScore("10")).toBe(10);
    expect(parseHumanVisualScore("-1")).toBeNull();
    expect(parseHumanVisualScore("11")).toBeNull();
    expect(parseHumanVisualScore("")).toBeNull();
  });
});

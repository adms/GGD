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
    visualAudit: {
      schema: "ggd-vfx-visual-audit@3",
      safe: true,
      autoVisualScore: 8,
      sampledFrames: 30,
      peakParticleCount: 100,
      peakSystemCount: 4,
      worstAtMs: 900,
      worst: {
        litShare: 0.1,
        highlightShare: 0.02,
        brightShare: 0.01,
        nearWhiteShare: 0,
        dominantBrightShare: 0,
        dominantNonBackgroundShare: 0,
        localWhiteCardShare: 0,
        diagnosticCheckerShare: 0,
        unsafe: false,
      },
      suspects: [],
    },
    candidate: {},
    candidateHash: "sha256:candidate",
    reviewHash: "sha256:review",
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
    expect(canPromoteAiProposal(item({
      visualAudit: { ...item().visualAudit!, schema: "ggd-vfx-visual-audit@1" },
    }))).toBe(false);
    expect(canPromoteAiProposal(item({
      visualEvidence: [{ label: "old", dataUrl: "data:image/webp;base64,AA==", atMs: 1, view: "side" }],
    }))).toBe(false);
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

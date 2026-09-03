import { describe, expect, it } from "vitest";
import { classifyVisualAcceptanceIssues } from "./visualAcceptanceIssues";

const codes = (blockers: readonly string[], status: "captured" | "blocked" | "failed" = "failed") =>
  classifyVisualAcceptanceIssues({ status, blockers }).map((issue) => issue.code);

describe("46 技能視覺驗收自動根因分類", () => {
  it("把已知 framebuffer、角色、事件與逾時失敗交給固定規則", () => {
    expect(codes(["局部紅／紫棋盤載體佔畫面 0.1%"])).toContain("FRAMEBUFFER_CARRIER");
    expect(codes(["單一高亮色塊覆蓋 68.0%，疑似模型／貼圖底板"]))
      .toContain("FRAMEBUFFER_CARRIER");
    expect(codes(["角色模型在 framebuffer 退化為 98.9% 純白"])).toContain("ACTOR_TEXTURE_COLLAPSE");
    expect(codes(["角色 · imported.hero 3D 模型在真實 framebuffer 僅改變 0 像素"]))
      .toContain("ACTOR_NOT_VISIBLE");
    expect(codes(["沒有可由目前 VFX 事件詞彙觸發的基本演出"], "blocked"))
      .toContain("UNSUPPORTED_EVENT_BRICK");
    expect(codes(["純被動的真正觸發點尚不能由 vfx-script@1 選取：onEvade"], "blocked"))
      .toContain("UNSUPPORTED_EVENT_BRICK");
    expect(codes(["20 秒內未能完成載入／真 Sim／素材收據"]))
      .toEqual(expect.arrayContaining(["CAPTURE_TIMEOUT", "SIM_PREVIEW"]));
  });

  it("未知失敗仍 fail closed，不交給語言模型自由猜測", () => {
    expect(codes(["unclassified gpu error"])).toEqual(["GPU_CAPTURE"]);
    expect(codes(["unclassified authoring gap"], "blocked")).toEqual(["AUTHORING_BLOCKER"]);
  });

  it("把已證明來源安全但肉眼仍呈格狀的 Telegraph 留給 Editor 修美術", () => {
    const issueCodes = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      frames: [{ frameAudit: {
        litShare: 0.02, highlightShare: 0, brightShare: 0, nearWhiteShare: 0,
        dominantBrightShare: 0, dominantNonBackgroundShare: 0,
        localWhiteCardShare: 0, diagnosticCheckerShare: 0.002, unsafe: false,
        reason: "Telegraph 格狀圖樣已通過同格剝離；不是遺失貼圖，但玩家畫面仍須人工裁決",
      } }],
    }).map((issue) => issue.code);
    expect(issueCodes).toContain("PRESENTATION_ARTIFACT");
    expect(issueCodes).not.toContain("FRAMEBUFFER_CARRIER");
  });

  it("只有實際擷取成功且低分才標記清晰度，不能冒充美術裁決", () => {
    const issueCodes = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      audit: {
        safe: true,
        autoVisualScore: 2,
        sampledFrames: 1,
        peakParticleCount: 1,
        peakSystemCount: 1,
        worstAtMs: 0,
        suspects: [],
        worst: {
          litShare: 0.1,
          highlightShare: 0.1,
          brightShare: 0,
          nearWhiteShare: 0,
          dominantBrightShare: 0,
          dominantNonBackgroundShare: 0.1,
          localWhiteCardShare: 0,
          diagnosticCheckerShare: 0.004,
          unsafe: false,
        },
      },
    }).map((issue) => issue.code);
    expect(issueCodes).toEqual(["LOW_VISUAL_HYGIENE"]);
  });

  it("關鍵格比 timeline 抽樣更差時取最低分，不能漏掉瞬間爆版", () => {
    const issueCodes = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      audit: {
        safe: true, autoVisualScore: 8, sampledFrames: 2,
        peakParticleCount: 0, peakSystemCount: 0, worstAtMs: 0, suspects: [],
        worst: {
          litShare: 0, highlightShare: 0, brightShare: 0, nearWhiteShare: 0,
          dominantBrightShare: 0, dominantNonBackgroundShare: 0,
          localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
        },
      },
      frames: [{ frameAudit: {
        litShare: 0.8, highlightShare: 0.8, brightShare: 0.8, nearWhiteShare: 0.7,
        dominantBrightShare: 0.6, dominantNonBackgroundShare: 0,
        localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
      } }],
    }).map((issue) => issue.code);
    expect(issueCodes).toEqual(["LOW_VISUAL_HYGIENE"]);
  });
});

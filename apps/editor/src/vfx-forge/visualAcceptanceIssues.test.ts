import { describe, expect, it } from "vitest";
import {
  classifyVisualAcceptanceIssues,
  classifyVisualRemediationScope,
  shouldAutomaticallyRetryVisualCase,
  visualAcceptanceHygieneScore,
} from "./visualAcceptanceIssues";

const codes = (blockers: readonly string[], status: "captured" | "blocked" | "failed" = "failed") =>
  classifyVisualAcceptanceIssues({ status, blockers }).map((issue) => issue.code);

describe("46 技能視覺驗收自動根因分類", () => {
  it("大方向錯誤由 Editor 修，純細緻美術調整才交人工", () => {
    expect(classifyVisualRemediationScope("藍色光束顏色錯成黃色，方向也相反"))
      .toBe("editor-major-fix");
    expect(classifyVisualRemediationScope("光球太大遮住角色，亮度也可再微調"))
      .toBe("editor-major-fix");
    expect(classifyVisualRemediationScope("尾焰密度與鏡頭手感想再細修"))
      .toBe("human-fine-tuning");
    expect(classifyVisualRemediationScope("畫面感覺普通"))
      .toBe("needs-triage");
  });

  it("只重試暫態 renderer 問題，不重跑缺少 Main 積木", () => {
    expect(shouldAutomaticallyRetryVisualCase([{
      code: "ACTOR_TEXTURE_COLLAPSE",
      severity: "blocker",
      owner: "editor-then-main",
      summary: "cold actor",
      nextAction: "retry",
    }])).toBe(true);
    expect(shouldAutomaticallyRetryVisualCase([{
      code: "LOW_VISUAL_HYGIENE",
      severity: "medium",
      owner: "editor",
      summary: "bad frame",
      nextAction: "retry",
    }])).toBe(true);
    expect(shouldAutomaticallyRetryVisualCase([{
      code: "MISSING_VISUAL_BRICK",
      severity: "blocker",
      owner: "main",
      summary: "missing beam",
      nextAction: "main",
    }])).toBe(false);
  });

  it("時間軸掃描漏掉但證據格判定不安全時仍路由 framebuffer blocker", () => {
    const issueCodes = classifyVisualAcceptanceIssues({
      status: "failed",
      blockers: [],
      frames: [{ frameAudit: {
        litShare: 0.17,
        presentationPixelShare: 0.24,
        highlightShare: 0.03,
        brightShare: 0.001,
        nearWhiteShare: 0,
        dominantBrightShare: 0,
        dominantNonBackgroundShare: 0.04,
        localWhiteCardShare: 0,
        diagnosticCheckerShare: 0,
        unsafe: true,
        reason: "疑似大面積不透明模型／貼圖載體",
      } }],
    }).map((issue) => issue.code);
    expect(issueCodes).toContain("FRAMEBUFFER_CARRIER");
  });

  it("把已知 framebuffer、角色、事件與逾時失敗交給固定規則", () => {
    expect(codes(["局部紅／紫棋盤載體佔畫面 0.1%"])).toContain("FRAMEBUFFER_CARRIER");
    expect(codes(["單一高亮色塊覆蓋 68.0%，疑似模型／貼圖底板"]))
      .toContain("FRAMEBUFFER_CARRIER");
    expect(codes(["單一非背景色塊覆蓋 25.7%，疑似預告幾何或彩色貼圖底板"]))
      .toContain("FRAMEBUFFER_CARRIER");
    expect(codes(["角色模型在 framebuffer 退化為 98.9% 純白"])).toContain("ACTOR_TEXTURE_COLLAPSE");
    expect(codes(["角色 · imported.hero 3D 模型在真實 framebuffer 僅改變 0 像素"]))
      .toContain("ACTOR_NOT_VISIBLE");
    expect(codes(["機器契約缺少可重用事件 onEvade"], "blocked"))
      .toContain("UNSUPPORTED_EVENT_BRICK");
    expect(codes(["Main 缺少可重用、可定時的時間停止視覺積木"], "captured"))
      .toContain("MISSING_VISUAL_BRICK");
    expect(codes(["20 秒內未能完成載入／真 Sim／素材收據"]))
      .toEqual(expect.arrayContaining(["CAPTURE_TIMEOUT", "SIM_PREVIEW"]));
  });

  it("vfx-script 沒有直連 hook 只是 Editor 路由資訊，不得誣指 Main 缺積木", () => {
    const issueCodes = codes([
      "純被動的真正觸發點尚不能由 vfx-script@1 選取：onEvade",
    ], "blocked");
    expect(issueCodes).not.toContain("UNSUPPORTED_EVENT_BRICK");
    expect(issueCodes).toEqual(["AUTHORING_BLOCKER"]);
  });

  it("模型自帶 emitter 不吃 instance 參數時歸 Main，且不再另報 Editor 低清晰度", () => {
    const issues = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [
        "Main 缺少 modelFx 自帶 fxEmitters 繼承該次 instance 的 scale/scaleAxis/yaw/tint/alpha；目前固定黃色核心無法由 Editor 組成藍白光束。",
      ],
      frames: [{ frameAudit: {
        litShare: 0.7, highlightShare: 0.7, brightShare: 0.5, nearWhiteShare: 0.4,
        dominantBrightShare: 0.5, dominantNonBackgroundShare: 0.5,
        localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
      } }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "MISSING_VISUAL_BRICK",
      owner: "main",
      brickId: "solid-beam",
    });
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

  it("同格 A/B 證明是 Main 共用打擊粒子時歸 Main，且不重複產生低清晰度 issue", () => {
    const issues = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      frames: [{ frameAudit: {
        litShare: 0.02, highlightShare: 0, brightShare: 0, nearWhiteShare: 0,
        dominantBrightShare: 0, dominantNonBackgroundShare: 0,
        localWhiteCardShare: 0, diagnosticCheckerShare: 0.008, unsafe: false,
        reason: "Main 預設打擊粒子 A/B 已定位紅／紫平面載體；玩家畫面不可直接通過",
      } }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "PRESENTATION_ARTIFACT", owner: "main" });
  });

  it("只有 Main 粒子與 Telegraph 疊加才越線時標成雙方接縫，不誣指單邊", () => {
    const issues = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      frames: [{ frameAudit: {
        litShare: 0.02, highlightShare: 0, brightShare: 0, nearWhiteShare: 0,
        dominantBrightShare: 0, dominantNonBackgroundShare: 0,
        localWhiteCardShare: 0, diagnosticCheckerShare: 0.008, unsafe: false,
        reason: "Main 預設打擊粒子與 Telegraph 必須同時剝離才解除載體門檻；屬混合呈現問題，玩家畫面不可直接通過",
      } }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "PRESENTATION_ARTIFACT", owner: "editor-then-main" });
  });

  it("同格 A/B 定位到 Main 施法預告積木群時仍歸共用積木，不逐招修 Editor", () => {
    const issues = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      frames: [{ frameAudit: {
        litShare: 0.04, highlightShare: 0.02, brightShare: 0.01, nearWhiteShare: 0,
        dominantBrightShare: 0, dominantNonBackgroundShare: 0,
        localWhiteCardShare: 0, diagnosticCheckerShare: 0.001, unsafe: false,
        reason: "Main 施法預告積木群 A/B 已定位紅／紫平面載體；玩家畫面不可直接通過",
      } }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "PRESENTATION_ARTIFACT", owner: "main" });
  });

  it("只有實際擷取成功且低分才標記清晰度，不能冒充美術裁決", () => {
    const issueCodes = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      audit: {
        safe: true,
        autoVisualScore: 2,
        sampledFrames: 1,
        elapsedMs: 1,
        gpuReadbacks: 1,
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
        safe: true, autoVisualScore: 8, sampledFrames: 2, elapsedMs: 2, gpuReadbacks: 2,
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

  it("不把隔離層的大型合法範圍圈誤當成實戰構圖失敗", () => {
    const issueCodes = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      audit: {
        safe: true, autoVisualScore: 0, sampledFrames: 2, elapsedMs: 2, gpuReadbacks: 2,
        peakParticleCount: 0, peakSystemCount: 0, worstAtMs: 0, suspects: [],
        worst: {
          litShare: 0.04, highlightShare: 0.01, brightShare: 0, nearWhiteShare: 0,
          dominantBrightShare: 0, dominantNonBackgroundShare: 0.2,
          localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
          reason: "施法範圍 Telegraph 已通過同格剝離驗證；素材層未檢出底板",
        },
      },
      frames: [{ frameAudit: {
        litShare: 0.02, highlightShare: 0.003, brightShare: 0, nearWhiteShare: 0,
        dominantBrightShare: 0, dominantNonBackgroundShare: 0.01,
        localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
      } }],
    }).map((issue) => issue.code);
    expect(issueCodes).toEqual([]);
  });

  it("UI 與分類器共用實戰關鍵格最低分，不顯示隔離層的假 0 分", () => {
    expect(visualAcceptanceHygieneScore({
      audit: {
        safe: true, autoVisualScore: 0, sampledFrames: 2, elapsedMs: 2, gpuReadbacks: 2,
        peakParticleCount: 0, peakSystemCount: 0, worstAtMs: 0, suspects: [],
        worst: {
          litShare: 0.04, highlightShare: 0.01, brightShare: 0, nearWhiteShare: 0,
          dominantBrightShare: 0, dominantNonBackgroundShare: 0.2,
          localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
        },
      },
      frames: [{ frameAudit: {
        litShare: 0.02, highlightShare: 0.003, brightShare: 0, nearWhiteShare: 0,
        dominantBrightShare: 0, dominantNonBackgroundShare: 0.01,
        localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
      } }],
    })).toBe(9.5);
  });

  it("事件有送出但畫面完全空白仍必須失敗，不得用衛生 10 分冒充視覺驗收", () => {
    const issueCodes = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      proofSource: "runtime-effect-graph",
      audit: {
        safe: true, autoVisualScore: 10, sampledFrames: 2, elapsedMs: 2, gpuReadbacks: 2,
        peakParticleCount: 0, peakSystemCount: 3,
        presentationEventCount: 1, semanticActionCount: 0, peakPresentationPixelShare: 0,
        worstAtMs: 0, suspects: [],
        worst: {
          litShare: 0, highlightShare: 0, brightShare: 0, nearWhiteShare: 0,
          dominantBrightShare: 0, dominantNonBackgroundShare: 0,
          localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
        },
      },
    }).map((issue) => issue.code);
    expect(issueCodes).toEqual(["NO_VISIBLE_PRESENTATION"]);
  });

  it("Main 已明確缺少必要視覺積木時，不再把同一個空白結果重複歸咎 Editor", () => {
    const issueCodes = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: ["Main 缺少可重用、透明安全的連續實心光束視覺積木"],
      proofSource: "editor-effect-graph-preview",
      audit: {
        safe: true, autoVisualScore: 10, sampledFrames: 2, elapsedMs: 2, gpuReadbacks: 2,
        peakParticleCount: 0, peakSystemCount: 0,
        presentationEventCount: 1, semanticActionCount: 0, peakPresentationPixelShare: 0,
        worstAtMs: 0, suspects: [],
        worst: {
          litShare: 0, highlightShare: 0, brightShare: 0, nearWhiteShare: 0,
          dominantBrightShare: 0, dominantNonBackgroundShare: 0,
          localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
        },
      },
    }).map((issue) => issue.code);
    expect(issueCodes).toEqual(["MISSING_VISUAL_BRICK"]);
  });

  it("每個缺視覺積木問題都有穩定 brickId，讓機器能按共同缺口分組", () => {
    const solidBeam = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: ["Main 缺少可重用、透明安全的連續實心寬光束視覺積木"],
    });
    const unknown = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: ["Main 缺少可重用、可定時的時間停止視覺積木"],
    });
    expect(solidBeam).toEqual([
      expect.objectContaining({ code: "MISSING_VISUAL_BRICK", brickId: "solid-beam" }),
    ]);
    expect(unknown).toEqual([
      expect.objectContaining({ code: "MISSING_VISUAL_BRICK", brickId: "unclassified-visual-brick" }),
    ]);
  });

  it("呈現層真的畫出像素時不回報空白演出", () => {
    const issueCodes = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      proofSource: "editor-basic-script",
      audit: {
        safe: true, autoVisualScore: 10, sampledFrames: 2, elapsedMs: 2, gpuReadbacks: 2,
        peakParticleCount: 0, peakSystemCount: 1,
        presentationEventCount: 1, semanticActionCount: 0, peakPresentationPixelShare: 0.002,
        worstAtMs: 0, suspects: [],
        worst: {
          litShare: 0, highlightShare: 0, brightShare: 0, nearWhiteShare: 0,
          dominantBrightShare: 0, dominantNonBackgroundShare: 0,
          localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
        },
      },
    }).map((issue) => issue.code);
    expect(issueCodes).toEqual([]);
  });

  it("專屬角色動作可以作為非 framebuffer 的可見演出證據", () => {
    const issueCodes = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      proofSource: "editor-basic-script",
      audit: {
        safe: true, autoVisualScore: 10, sampledFrames: 2, elapsedMs: 2, gpuReadbacks: 2,
        peakParticleCount: 0, peakSystemCount: 0,
        presentationEventCount: 0, semanticActionCount: 1, peakPresentationPixelShare: 0,
        worstAtMs: 0, suspects: [],
        worst: {
          litShare: 0, highlightShare: 0, brightShare: 0, nearWhiteShare: 0,
          dominantBrightShare: 0, dominantNonBackgroundShare: 0,
          localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
        },
      },
    }).map((issue) => issue.code);
    expect(issueCodes).toEqual([]);
  });

  it("角色有動作也不能掩蓋已派送 VFX 事件卻完全沒畫出的錯誤", () => {
    const issueCodes = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      proofSource: "editor-basic-script",
      audit: {
        safe: true, autoVisualScore: 10, sampledFrames: 2, elapsedMs: 2, gpuReadbacks: 2,
        peakParticleCount: 0, peakSystemCount: 1,
        presentationEventCount: 1, semanticActionCount: 2, peakPresentationPixelShare: 0,
        worstAtMs: 0, suspects: [],
        worst: {
          litShare: 0, highlightShare: 0, brightShare: 0, nearWhiteShare: 0,
          dominantBrightShare: 0, dominantNonBackgroundShare: 0,
          localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
        },
      },
    }).map((issue) => issue.code);
    expect(issueCodes).toEqual(["NO_VISIBLE_PRESENTATION"]);
  });

  it("舊證據沒有演出計數時不倒推結論，避免把缺資料誤當成空白技能", () => {
    const issueCodes = classifyVisualAcceptanceIssues({
      status: "captured",
      blockers: [],
      proofSource: "runtime-effect-graph",
      audit: {
        safe: true, autoVisualScore: 10, sampledFrames: 2, elapsedMs: 2, gpuReadbacks: 2,
        peakParticleCount: 0, peakSystemCount: 3, worstAtMs: 0, suspects: [],
        worst: {
          litShare: 0, highlightShare: 0, brightShare: 0, nearWhiteShare: 0,
          dominantBrightShare: 0, dominantNonBackgroundShare: 0,
          localWhiteCardShare: 0, diagnosticCheckerShare: 0, unsafe: false,
        },
      },
    }).map((issue) => issue.code);
    expect(issueCodes).toEqual([]);
  });
});

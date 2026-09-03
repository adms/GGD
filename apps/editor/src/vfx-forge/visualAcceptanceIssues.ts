import type { BackdropTimelineAudit } from "./VfxForgeStage";
import { automaticVisualHygieneScore, type BackdropFrameAudit } from "./backdropFrameAudit";

export type VisualAcceptanceIssueCode =
  | "FRAMEBUFFER_CARRIER"
  | "PRESENTATION_ARTIFACT"
  | "ACTOR_TEXTURE_COLLAPSE"
  | "ACTOR_NOT_VISIBLE"
  | "APPEARANCE_STAND_IN"
  | "UNSUPPORTED_EVENT_BRICK"
  | "MISSING_VISUAL_BRICK"
  | "ACTION_TIMELINE"
  | "REPLACEMENT_POLICY"
  | "SIM_PREVIEW"
  | "CAPTURE_TIMEOUT"
  | "LOW_VISUAL_HYGIENE"
  | "GPU_CAPTURE"
  | "NO_VISIBLE_PRESENTATION"
  | "AUTHORING_BLOCKER";

export interface VisualAcceptanceMachineIssue {
  readonly code: VisualAcceptanceIssueCode;
  readonly severity: "blocker" | "high" | "medium";
  readonly owner: "editor" | "main" | "editor-then-main";
  readonly summary: string;
  readonly nextAction: string;
}

export interface VisualAcceptanceIssueInput {
  readonly status: "captured" | "blocked" | "failed";
  readonly blockers: readonly string[];
  readonly audit?: BackdropTimelineAudit | null;
  readonly frames?: readonly { readonly frameAudit?: BackdropFrameAudit | null }[];
  readonly proofSource?: "acceptance-fixture" | "editor-basic-script" | "runtime-effect-graph";
}

/**
 * Deterministic first-pass triage for the 42-theme / 46-document visual run.
 *
 * This is deliberately a rule engine, not an LLM judgement.  It routes a
 * repeated technical failure to the right owner and leaves composition,
 * timing, colour and source fidelity to the human 0-10 review.
 */
export function classifyVisualAcceptanceIssues(
  input: VisualAcceptanceIssueInput,
): readonly VisualAcceptanceMachineIssue[] {
  const text = input.blockers.join("\n");
  const frameAudits = (input.frames ?? []).flatMap((frame) =>
    frame.frameAudit ? [frame.frameAudit] : [],
  );
  const issues: VisualAcceptanceMachineIssue[] = [];
  const add = (issue: VisualAcceptanceMachineIssue): void => {
    if (!issues.some((current) => current.code === issue.code)) issues.push(issue);
  };

  if (
    /紅[／/]紫棋盤|透明底板外露|未去背貼圖|白色底板|不安全的貼圖底板|單一(?:高亮|非背景)色塊|高亮像素/u.test(text) ||
    input.audit?.worst.unsafe === true ||
    frameAudits.some((frame) => frame.unsafe)
  ) {
    add({
      code: "FRAMEBUFFER_CARRIER",
      severity: "blocker",
      owner: "editor-then-main",
      summary: "實際 framebuffer 出現棋盤或不透明載體",
      nextAction: "Editor 先定位時間點與使用組合；若單一 Main primitive 仍可重現，再附失敗幀回報 Main。",
    });
  }
  if (
    input.status === "captured" &&
    [input.audit?.worst, ...frameAudits].some((frame) =>
      frame?.unsafe === false &&
      /(?:Telegraph 格狀圖樣|同格剝離已定位呈現層異常)/u.test(frame.reason ?? ""),
    )
  ) {
    add({
      code: "PRESENTATION_ARTIFACT",
      severity: "high",
      owner: "editor",
      summary: "來源安全的呈現層仍造成棋盤、底板或過曝，不宜直接出現在遊戲畫面",
      nextAction: "Editor 改用乾淨 primitive 或調整配色／密度後單項重跑；不可因來源收據安全而自動通過。",
    });
  }
  if (/純白|白色 bootstrap|角色貼圖.*退化|3D 角色材質/u.test(text)) {
    add({
      code: "ACTOR_TEXTURE_COLLAPSE",
      severity: "blocker",
      owner: "editor-then-main",
      summary: "角色模型／材質在真 Renderer 畫面退化",
      nextAction: "Editor 自動冷載入重試；仍失敗時附模型 ID、純白比例與失敗幀交 Main 查資產或材質。",
    });
  }
  if (/3D 模型在真實 framebuffer 僅改變\s*0\s*像素/u.test(text)) {
    add({
      code: "ACTOR_NOT_VISIBLE",
      severity: "blocker",
      owner: "editor-then-main",
      summary: "角色 GLB 已採用但真實 framebuffer 沒有畫出任何角色像素",
      nextAction: "Editor 先執行有界冷場景重掛；重試仍為 0 像素才附模型與 bounds 回報 Main。",
    });
  }
  if (/替身|stand-?in/u.test(text)) {
    add({
      code: "APPEARANCE_STAND_IN",
      severity: "high",
      owner: "main",
      summary: "角色仍使用替身外觀；可檢查特效機制，但不能通過角色忠實度",
      nextAction: "保留並標記診斷圖；Main 日後提供正式模型後重跑最終外觀驗收。",
    });
  }
  if (
    /機器契約缺少.*事件|未知事件積木|missing runtime event brick/iu.test(text)
  ) {
    add({
      code: "UNSUPPORTED_EVENT_BRICK",
      severity: "blocker",
      owner: "main",
      summary: "Main 機器契約真的缺少可重用且帶來源資訊的 runtime 事件積木",
      nextAction: "Main 補權威事件與 provenance；Editor 再接時間軸選項，禁止用假 cast 代替。",
    });
  }
  if (/Main 缺少.*(?:連續實心光束|視覺積木)|missing visual brick/iu.test(text)) {
    add({
      code: "MISSING_VISUAL_BRICK",
      severity: "blocker",
      owner: "main",
      summary: "現有 Main primitive 無法組出驗收指定的視覺文法",
      nextAction: "Main 提供可重用、透明安全且具必要尺寸／方向參數的 primitive；Editor 只負責用積木排時間軸與配色，不能以每招專用資產或粒子珠串假裝完成。",
    });
  }
  if (/ACTION_|角色動作|攻擊動作|傷害節點.*動畫|位移節點.*動畫/u.test(text)) {
    add({
      code: "ACTION_TIMELINE",
      severity: "high",
      owner: "editor",
      summary: "角色動作沒有對齊施法、傷害或位移節點",
      nextAction: "Editor 依動作模板自動補齊並重新擷取；多段技逐傷害點驗證。",
    });
  }
  if (/尚不可取代|replacementPolicy|trigger:channel/iu.test(text)) {
    add({
      code: "REPLACEMENT_POLICY",
      severity: "blocker",
      owner: "main",
      summary: "預設演出與自訂腳本沒有可驗證的取代通道",
      nextAction: "Main 公開 trigger:channel 取代契約；Editor 不疊播兩份演出。",
    });
  }
  if (/真 Sim|SimWorld|cast-review|技能試放/u.test(text)) {
    add({
      code: "SIM_PREVIEW",
      severity: "blocker",
      owner: "editor-then-main",
      summary: "真 Sim 預覽路徑沒有產生可驗證事件",
      nextAction: "Editor 先核對 preview adapter；若事件本身缺失，再以完整 trace 回報 Main。",
    });
  }
  if (/超過\s*\d+\s*秒|\d+\s*秒內未能完成|逾時|timeout/iu.test(text)) {
    add({
      code: "CAPTURE_TIMEOUT",
      severity: "high",
      owner: "editor",
      summary: "批次載入或 GPU 擷取超過有界時間",
      nextAction: "Editor 保留該招並繼續批次，單獨重跑冷載入與擷取診斷。",
    });
  }
  const evidenceScores = frameAudits.map(automaticVisualHygieneScore);
  const lowestHygiene = Math.min(input.audit?.autoVisualScore ?? 10, ...evidenceScores);
  if (input.status === "captured" && lowestHygiene < 4) {
    add({
      code: "LOW_VISUAL_HYGIENE",
      severity: "medium",
      owner: "editor",
      summary: `畫面雖可擷取，但時間軸／關鍵格最低清晰度只有 ${lowestHygiene}/10`,
      nextAction: "人工檢查構圖、遮擋與格狀外觀；不可把素材安全分數當成美術通過。",
    });
  }
  const measuredPresentation = input.audit?.presentationEventCount !== undefined &&
    input.audit.semanticActionCount !== undefined &&
    input.audit.peakPresentationPixelShare !== undefined;
  const presentationCount = (input.audit?.presentationEventCount ?? 0) +
    (input.audit?.semanticActionCount ?? 0);
  const renderedVfx = (input.audit?.peakPresentationPixelShare ?? 0) > 0;
  const renderedActorAction = (input.audit?.semanticActionCount ?? 0) > 0;
  const dispatchedVfx = (input.audit?.presentationEventCount ?? 0) > 0;
  const missingPresentation = dispatchedVfx ? !renderedVfx : !renderedActorAction && !renderedVfx;
  if (
    input.status === "captured" &&
    input.proofSource !== undefined &&
    measuredPresentation &&
    missingPresentation
  ) {
    add({
      code: "NO_VISIBLE_PRESENTATION",
      severity: "high",
      owner: "editor",
      summary: presentationCount > 0
        ? `已消費 ${input.audit?.presentationEventCount ?? 0} 個 VFX 事件，但呈現層仍為 0 像素` +
          (renderedActorAction ? "；角色動作存在，不能掩蓋特效未繪製" : "且沒有專屬角色動作")
        : "已完成真 Sim 與 GPU 擷取，但選定路徑沒有技能演出或專屬角色動作",
      nextAction: input.proofSource === "runtime-effect-graph"
        ? "在原本被動 hook 內用 no-code effect graph 加入安全 spawnVfx／角色反應，再重跑；禁止偽造成主動 cast。"
        : "檢查 Editor 腳本的 trigger、時間軸與 renderer dispatch，確認積木真的被播放後重跑。",
    });
  }
  if (issues.length === 0 && input.status === "failed") {
    add({
      code: "GPU_CAPTURE",
      severity: "high",
      owner: "editor",
      summary: "GPU／framebuffer 擷取失敗，尚未命中已知規則",
      nextAction: "保存原始錯誤與診斷幀，新增可重現規則後再分類，不交給 LLM 猜測。",
    });
  }
  if (issues.length === 0 && input.status === "blocked") {
    add({
      code: "AUTHORING_BLOCKER",
      severity: "high",
      owner: "editor-then-main",
      summary: "no-code 組裝或證據路徑遭未分類阻塞",
      nextAction: "先由 Editor 檢查表單／配方；只有缺通用積木時才開 Main 票。",
    });
  }
  return issues;
}

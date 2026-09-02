import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Models,
  zodIssues,
  type CollectionIndex,
  type FieldIssue,
} from "@ggd/shared/content";
import { resolveAppearance } from "@ggd/shared/content/import/resolvedAppearance";
import {
  zVfxScriptDoc,
  type VfxScriptDoc,
  type VfxScriptSegment,
} from "@ggd/shared/content/schema/vfxScript";
import { Abilities, Champions, type CastableSlot } from "@ggd/shared/sim";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import { api, ApiValidationError, type AiVisualEvidence } from "../api/client";
import { issuesToErrorMap, type ErrorMap } from "../store";
import { sameJson, useUndoHistory } from "../history";
import {
  newScript,
  newSegment,
  reactionTriggerOf,
  scheduleSimEvents,
  segmentFromAsset,
  timelineDurationMs,
  triggerCuesFromSim,
  type AssetDrop,
  type AssetPlacement,
  type ForgeAbility,
} from "./model";
import {
  createSimPreviewController,
  type CastPreviewTrace,
  type ReactionPreviewTrace,
} from "../preview/PreviewController";
import { ensurePreviewContentReady } from "../preview/previewContent";
import { submitVfxScriptProposal } from "./writeback";
import { VfxAssetPalette } from "./VfxAssetPalette";
import { VfxForgePreview, type VfxForgePreviewHandle } from "./VfxForgePreview";
import type { VfxForgeStageMode } from "./VfxForgeStage";
import { VfxTimeline } from "./VfxTimeline";
import { SegmentInspector } from "./SegmentInspector";
import {
  AssetSafetyGate,
  UnsafeVfxAssetError,
  allAssetRefsVerifiedSafe,
  assetKey,
  assetRefsFromScript,
  type AssetSafetyResult,
} from "./assetSafety";
import {
  VFX_FORGE_RECIPES,
  buildVfxForgeRecipe,
  type VfxForgeRecipeId,
} from "./recipes";
import { acceptanceFixtureFor, VFX_FORGE_ACCEPTANCE } from "./acceptanceFixtures";
import { acceptanceSourceFor } from "./acceptanceSources";
import { AcceptanceSourcePanel } from "./AcceptanceSourcePanel";
import { reviewAppearances } from "./appearanceReview";
import { visualHygieneTriage } from "./backdropFrameAudit";
import { passivePresentationRules } from "../passivePresentationPrinciples";
import { PassivePresentationPanel } from "../PassivePresentationPanel";
import {
  actionAnimationIssues,
  activationConflictForAbility,
  activationModeForAbility,
  completeActionAnimations,
  hasAutoCompletableActionIssue,
  hasAuthoritativeRapidMultiStrike,
} from "./actionAnimationPrinciples";
import { simTraceReviewState } from "./simTraceReview";
import {
  PRESENTATION_RECEIPT,
  unsupportedReplacementClaims,
} from "./presentationContract";

const simPreview = createSimPreviewController();

// GH#838 progress: these eight scenes prove the Forge can compose the required
// visual grammar. They are Editor fixtures, not game-content candidates; the
// GH#664 gate therefore permits pass/fail evidence but never Promote.

export function VfxForgePage() {
  const indexes = useForgeIndexes();
  const assetSafetyGate = useMemo(() => new AssetSafetyGate(api), []);
  const [abilityId, setAbilityId] = useState("godie-hart.r");
  const [abilityInput, setAbilityInput] = useState("godie-hart.r");
  // Use a real shipped 3D champion as the default opponent. `godie-e00r` looks
  // plausible but resolved-appearance@1 correctly identifies it as the rogue
  // stand-in; screenshots of that body are not valid visual proof.
  const [targetChampionId, setTargetChampionId] = useState("godie-e001");
  const [ability, setAbility] = useState<ForgeAbility | null>(null);
  const draftHistory = useUndoHistory<VfxScriptDoc | null>(null, sameJson);
  const draft = draftHistory.value;
  // This is the file/profile snapshot that was loaded. A submitted proposal is
  // not a saved/live version and must never replace this restore baseline.
  const [loadedOriginal, setLoadedOriginal] = useState<VfxScriptDoc | null>(null);
  const [lastSubmittedHash, setLastSubmittedHash] = useState<string | null>(null);
  const [isAcceptanceFixture, setIsAcceptanceFixture] = useState(false);
  const [acceptanceStartedFromBlank, setAcceptanceStartedFromBlank] = useState(false);
  const [authoringActions, setAuthoringActions] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [seekRevision, setSeekRevision] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewMode, setPreviewMode] = useState<VfxForgeStageMode>("runtime");
  const [status, setStatus] = useState("載入中…");
  const [serverErrors, setServerErrors] = useState<ErrorMap>({});
  const [trace, setTrace] = useState<CastPreviewTrace | ReactionPreviewTrace | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [assetSafety, setAssetSafety] = useState<Map<string, AssetSafetyResult | "checking">>(new Map());
  const [visualEvidence, setVisualEvidence] = useState<AiVisualEvidence[]>([]);
  const previewRef = useRef<VfxForgePreviewHandle>(null);

  const championId = abilityId.includes(".") ? abilityId.slice(0, abilityId.lastIndexOf(".")) : "";
  const previewContent = useQuery({
    queryKey: ["preview-runtime-content"],
    queryFn: ensurePreviewContentReady,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  const runtimeChampion = useMemo(
    () => previewContent.data && championId
      ? Champions.tryGet(championId as ChampionId) ?? null
      : null,
    [championId, previewContent.data],
  );
  const runtimeAbility = useMemo(
    () => previewContent.data
      ? Abilities.tryGet(abilityId as AbilityId) as ForgeAbility | undefined
      : undefined,
    [abilityId, previewContent.data],
  );
  const runtimeTarget = useMemo(
    () => previewContent.data
      ? Champions.tryGet(targetChampionId as ChampionId) ?? null
      : null,
    [previewContent.data, targetChampionId],
  );
  const casterAppearance = useMemo(
    () => runtimeChampion
      ? resolveAppearance(runtimeChampion.id, runtimeChampion, Models.tryGet(runtimeChampion.modelKey))
      : null,
    [runtimeChampion],
  );
  const targetAppearance = useMemo(
    () => runtimeTarget
      ? resolveAppearance(runtimeTarget.id, runtimeTarget, Models.tryGet(runtimeTarget.modelKey))
      : null,
    [runtimeTarget],
  );
  const appearanceReview = useMemo(
    () => reviewAppearances(casterAppearance, targetAppearance),
    [casterAppearance, targetAppearance],
  );
  const reactionTrigger = useMemo(
    () => runtimeAbility ? reactionTriggerOf(runtimeAbility) : null,
    [runtimeAbility],
  );
  const acceptanceSource = useMemo(() => acceptanceSourceFor(abilityId), [abilityId]);
  const passiveRules = useMemo(() => passivePresentationRules(ability), [ability]);
  const acceptanceMirrorEvidenceBlocked = acceptanceSource !== null &&
    runtimeChampion !== null && runtimeTarget !== null && runtimeChampion.id === runtimeTarget.id;
  const reviewEvidenceIssues = [
    ...appearanceReview.issues,
    ...(acceptanceMirrorEvidenceBlocked ? ["八招驗收的施法者與敵方目標不可使用同一名英雄"] : []),
  ];
  const reviewEvidenceAllowed = appearanceReview.allowed && !acceptanceMirrorEvidenceBlocked;

  const existingIds = useMemo(
    () => new Set(indexes.scripts.data?.entries.map((e) => e.id) ?? []),
    [indexes.scripts.data],
  );

  useEffect(() => {
    let live = true;
    setStatus(`載入 ${abilityId}…`);
    setPlaying(false);
    setPlayheadMs(0);
    setServerErrors({});
    setVisualEvidence([]);
    // A trace is candidate-bound evidence. Never let the previous ability's
    // accepted SimWorld run keep review controls open while this one loads.
    setTrace(null);
    setTraceError(null);
    void (async () => {
      try {
        const abilityDoc = await api.doc<ForgeAbility>("abilities", abilityId);
        const fixture = acceptanceFixtureFor(abilityId);
        const exists = existingIds.has(abilityId);
        const script = fixture ?? (exists
          ? await api.doc<VfxScriptDoc>("vfx-scripts", abilityId)
          : newScript(abilityId, reactionTriggerOf(abilityDoc)));
        if (!live) return;
        setAbility(abilityDoc);
        draftHistory.reset(script);
        setLoadedOriginal(script);
        setLastSubmittedHash(null);
        setIsAcceptanceFixture(fixture !== null);
        setAcceptanceStartedFromBlank(false);
        setAuthoringActions(fixture ? [`載入只讀參考樣本：${abilityId}`] : [`載入技能：${abilityId}`]);
        setSelected(0);
        setStatus(fixture
          ? "已載入 Editor 驗收樣本；不屬於遊戲 content，且永遠不可 Promote"
          : exists ? "已載入；修改只能提交 AI 批核" : "尚無正式腳本；可建立 AI 上線候選，但不會直接寫入 content");
      } catch (e) {
        if (!live) return;
        setAbility(null);
        draftHistory.reset(null);
        setStatus(`載入失敗：${String(e)}`);
      }
    })();
    return () => { live = false; };
  }, [abilityId, existingIds, draftHistory.reset]);

  useEffect(() => {
    setTrace(null);
    setTraceError(null);
    if (!ability || !runtimeChampion || !previewContent.data) return;
    try {
      const ticks = Math.ceil((Math.max(0, ability.castTimeSec ?? 0) + 20) * 30);
      if (reactionTrigger === "reflectSuccess") {
        setTrace(simPreview.triggerReflectSuccess(runtimeChampion, ability.id as AbilityId, {
          level: PREVIEW_AUTHOR_LEVEL,
          rank: 1,
          ticks,
        }));
      } else if (ability.slot) {
        setTrace(simPreview.castAbility(runtimeChampion, ability.slot as CastableSlot, {
          level: PREVIEW_AUTHOR_LEVEL,
          rank: 1,
          ticks,
        }));
      }
    } catch (error) {
      setTraceError(String(error));
    }
  }, [ability, previewContent.data, reactionTrigger, runtimeChampion]);

  useEffect(() => {
    if (typeof globalThis.addEventListener !== "function") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) { event.preventDefault(); draftHistory.redo(); setVisualEvidence([]); }
      else if (key === "z") { event.preventDefault(); draftHistory.undo(); setVisualEvidence([]); }
      else if (key === "y") { event.preventDefault(); draftHistory.redo(); setVisualEvidence([]); }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [draftHistory.redo, draftHistory.undo]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(loadedOriginal),
    [draft, loadedOriginal],
  );
  const inlineErrors: ErrorMap = useMemo(() => {
    if (!draft) return {};
    const parsed = zVfxScriptDoc.safeParse(draft);
    return parsed.success ? {} : issuesToErrorMap(zodIssues(parsed.error) as FieldIssue[]);
  }, [draft]);
  const errors = useMemo(() => mergeErrors(inlineErrors, serverErrors), [inlineErrors, serverErrors]);
  const errorCount = Object.keys(errors).length;
  const draftAssetRefs = useMemo(() => draft ? assetRefsFromScript(draft) : [], [draft]);
  const scriptSafety = useQuery({
    queryKey: ["vfx-script-asset-safety", ...draftAssetRefs.map(assetKey)],
    queryFn: () => draft ? assetSafetyGate.checkScript(draft) : Promise.resolve([]),
    enabled: draft !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const assetBlockers = (scriptSafety.data ?? []).filter((result) => !result.safe);
  const assetAuditPending = draftAssetRefs.length > 0 && scriptSafety.isPending;
  const assetPreviewAllowed = !scriptSafety.isPending && !scriptSafety.error &&
    allAssetRefsVerifiedSafe(draftAssetRefs, scriptSafety.data);
  const activationConflict = useMemo(
    () => activationConflictForAbility(ability),
    [ability],
  );
  const schedule = useMemo(
    () => trace ? scheduleSimEvents(trace.events, abilityId) : [],
    [abilityId, trace],
  );
  const cues = useMemo(
    () => ability ? triggerCuesFromSim(schedule, runtimeAbility ?? ability) : [],
    [ability, runtimeAbility, schedule],
  );
  const simReview = useMemo(
    () => simTraceReviewState(
      trace,
      traceError ?? (previewContent.error ? String(previewContent.error) : null),
    ),
    [previewContent.error, trace, traceError],
  );
  const actionIssues = useMemo(
    () => draft
      ? actionAnimationIssues(draft, {
          allowRapidBarrage: hasAuthoritativeRapidMultiStrike(ability),
          activationMode: activationModeForAbility(ability),
          requiredTimelineCues: cues,
        })
      : [],
    [ability, cues, draft],
  );

  // Acceptance references are immutable capability examples. Once the real
  // SimWorld trace reveals strike/projectile cues, deterministically fold the
  // corresponding actor pulses into the reference itself instead of asking an
  // author to press a repair button on every load. From-blank authoring remains
  // untouched; its normal add/recipe paths already apply the same rule.
  useEffect(() => {
    if (!isAcceptanceFixture || acceptanceStartedFromBlank || ability?.id !== abilityId || cues.length === 0) return;
    const completed = acceptanceFixtureFor(abilityId, cues);
    if (!completed || (draft && sameJson(draft, completed))) return;
    draftHistory.reset(completed);
    setLoadedOriginal(completed);
    setStatus("驗收參考已依真 SimWorld 傷害節點自動補齊角色攻擊／受擊動作");
  }, [ability?.id, abilityId, acceptanceStartedFromBlank, cues, draft, draftHistory.reset, isAcceptanceFixture]);
  const replacementBlockers = useMemo(
    () => draft ? unsupportedReplacementClaims(draft) : [],
    [draft],
  );
  const replacementBlocked = replacementBlockers.length > 0;
  const canAutoCompleteActionIssues = hasAutoCompletableActionIssue(actionIssues);
  const durationMs = useMemo(() => (draft ? timelineDurationMs(draft, cues) : 1000), [cues, draft]);
  const selectedIndex = draft ? Math.min(selected, draft.segments.length - 1) : 0;
  const stop = useCallback(() => setPlaying(false), []);
  const onTime = useCallback((ms: number) => setPlayheadMs(ms), []);

  useEffect(() => {
    if (!scriptSafety.data) return;
    setAssetSafety((previous) => {
      const next = new Map(previous);
      for (const result of scriptSafety.data) next.set(assetKey(result.asset), result);
      return next;
    });
  }, [scriptSafety.data]);

  const mutate = (fn: (doc: VfxScriptDoc) => VfxScriptDoc): void => {
    draftHistory.commit((doc) => (doc ? fn(doc) : doc));
    setServerErrors({});
    // Evidence is candidate-bound. Never let a screenshot of the previous
    // JSON survive an edit and appear beside a new hash in human review.
    setVisualEvidence([]);
  };
  const recordAction = (action: string): void => {
    setAuthoringActions((previous) => previous[previous.length - 1] === action ? previous : [...previous, action]);
  };
  const probeAsset = (asset: AssetDrop): void => {
    const key = assetKey(asset);
    if (assetSafety.has(key)) return;
    setAssetSafety((previous) => new Map(previous).set(key, "checking"));
    void assetSafetyGate.check(asset).then((result) => {
      setAssetSafety((previous) => new Map(previous).set(key, result));
    });
  };
  /**
   * Check a palette page in small deterministic batches.  This avoids asking
   * an LLM to judge a texture and avoids 150 simultaneous image decodes, while
   * still leaving every individual asset fail-closed until its own receipt has
   * landed.
   */
  const probeAssets = (assets: readonly AssetDrop[]): void => {
    const pending = assets.filter((asset) => !assetSafety.has(assetKey(asset)));
    if (pending.length === 0) return;
    setAssetSafety((previous) => {
      const next = new Map(previous);
      for (const asset of pending) next.set(assetKey(asset), "checking");
      return next;
    });
    void (async () => {
      const BATCH_SIZE = 4;
      for (let start = 0; start < pending.length; start += BATCH_SIZE) {
        const batch = pending.slice(start, start + BATCH_SIZE);
        const results = await Promise.all(batch.map((asset) => assetSafetyGate.check(asset)));
        setAssetSafety((previous) => {
          const next = new Map(previous);
          for (const result of results) next.set(assetKey(result.asset), result);
          return next;
        });
      }
    })();
  };
  const addAsset = async (asset: AssetDrop, placement?: AssetPlacement): Promise<void> => {
    const key = assetKey(asset);
    setAssetSafety((previous) => new Map(previous).set(key, "checking"));
    const result = await assetSafetyGate.check(asset);
    setAssetSafety((previous) => new Map(previous).set(key, result));
    if (!result.safe) {
      setStatus(`⛔ 已阻擋 ${asset.id}：${result.summary}${result.detail ? ` · ${result.detail}` : ""}`);
      return;
    }
    mutate((doc) => ({
      ...doc,
      segments: completeActionAnimations(
        [...doc.segments, segmentFromAsset(asset, placement, reactionTrigger)],
        { activationMode: activationModeForAbility(ability), requiredTimelineCues: cues },
      ),
    }));
    recordAction(`拖入素材：${asset.collection}/${asset.id}`);
    setSelected(draft?.segments.length ?? 0);
    setStatus(`素材去背通過：${asset.id}`);
  };
  const addKind = (kind: VfxScriptSegment["kind"]): void => {
    mutate((doc) => ({
      ...doc,
      segments: completeActionAnimations(
        [...doc.segments, newSegment(kind, reactionTrigger)],
        { activationMode: activationModeForAbility(ability), requiredTimelineCues: cues },
      ),
    }));
    recordAction(`新增時間軸積木：${kind}`);
    setSelected(draft?.segments.length ?? 0);
  };
  const addRecipe = async (id: VfxForgeRecipeId): Promise<void> => {
    if (!draft || !ability) return;
    const activationMode = activationModeForAbility(ability);
    const segments = buildVfxForgeRecipe(id, { includeModelCore: false, activationMode });
    const candidate: VfxScriptDoc = {
      ...draft,
      segments: completeActionAnimations(
        [...draft.segments, ...segments],
        { activationMode, requiredTimelineCues: cues },
      ),
    };
    const checks = await assetSafetyGate.checkScript(candidate);
    const blocker = checks.find((item) => !item.safe);
    if (blocker) {
      setStatus(`⛔ 組合未加入：${blocker.asset.id} · ${blocker.summary}`);
      return;
    }
    mutate(() => candidate);
    recordAction(`加入可重用組合：${id}`);
    setSelected(draft.segments.length);
    setStatus("已加入透明安全的可重用演出積木；每一塊都可在時間軸單獨調整");
  };

  const save = async (): Promise<void> => {
    if (!draft || !simReview.ready || errorCount > 0 || assetAuditPending || assetBlockers.length > 0 || actionIssues.length > 0 || replacementBlocked || activationConflict) return;
    if (!reviewEvidenceAllowed) {
      setStatus(`⛔ 外觀證據無效：${reviewEvidenceIssues.join("；")}`);
      return;
    }
    const requiredEvidence = isAcceptanceFixture ? 2 : 1;
    if (visualEvidence.length < requiredEvidence) {
      setStatus(isAcceptanceFixture
        ? "⛔ 八招能力驗收至少要擷取 2 張完整技能演出畫面"
        : "⛔ VFX 候選至少要擷取 1 張完整技能演出畫面");
      return;
    }
    setStatus("以完整技能演出掃描未去背底板…");
    try {
      const visual = await previewRef.current?.auditBackdropTimeline();
      if (!visual) throw new Error("實際遊戲畫面尚未載入，禁止略過底板檢查");
      if (!visual.safe) {
        setStatus(
          `⛔ 禁止儲存：${visual.worst.reason ?? "實際畫面出現底板"} · ` +
          `${(visual.worstAtMs / 1000).toFixed(3)}秒` +
          (visual.suspects.length ? ` · 疑似 ${visual.suspects[0]}` : ""),
        );
        return;
      }
      setStatus(
        `未檢出不透明底板（${visual.sampledFrames}格）；` +
        `自動衛生 ${visual.autoVisualScore}/10（${visualHygieneTriage(visual.autoVisualScore)}），提交人工批核佇列…`,
      );
      const result = await submitVfxScriptProposal(
        draft,
        assetSafetyGate,
        isAcceptanceFixture ? "editor-capability-fixture" : "production-candidate",
        api,
        {
          summary: isAcceptanceFixture
            ? "八招 VFX Forge 表達能力驗收；只評估編輯器，不得套用遊戲主程式"
            : "VFX Forge AI 輔助調整候選",
          evidence: [
            ...(acceptanceSource ? [
              `owner-target:${acceptanceSource.ownerTarget}`,
              `main-current:${acceptanceSource.main.summary}`,
              `jass-summary:${acceptanceSource.jass.summary}`,
              `jass-locust:${acceptanceSource.jass.locustComposition}`,
              `source-resolution:${acceptanceSource.resolution.alignment}:${acceptanceSource.resolution.note}`,
            ] : []),
            ...(acceptanceSource?.jass.references ?? []),
            ...(acceptanceStartedFromBlank ? [`editor-from-blank:${abilityId}`] : []),
            `preview-target:${targetChampionId}`,
            ...appearanceReview.receipts,
            ...authoringActions.map((action, index) => `editor-action:${index + 1}:${action}`),
          ],
          visualEvidence,
          visualAudit: {
            schema: "ggd-vfx-visual-audit@3",
            safe: true,
            autoVisualScore: visual.autoVisualScore,
            sampledFrames: visual.sampledFrames,
            peakParticleCount: visual.peakParticleCount,
            peakSystemCount: visual.peakSystemCount,
            worstAtMs: visual.worstAtMs,
            worst: {
              litShare: visual.worst.litShare,
              highlightShare: visual.worst.highlightShare,
              brightShare: visual.worst.brightShare,
              nearWhiteShare: visual.worst.nearWhiteShare,
              dominantBrightShare: visual.worst.dominantBrightShare,
              dominantNonBackgroundShare: visual.worst.dominantNonBackgroundShare,
              localWhiteCardShare: visual.worst.localWhiteCardShare,
              diagnosticCheckerShare: visual.worst.diagnosticCheckerShare,
              unsafe: false,
              ...(visual.worst.reason ? { reason: visual.worst.reason } : {}),
            },
            suspects: [...visual.suspects],
          },
          // Framebuffer hygiene is only triage. The admin still requires a
          // human score and note for Owner/JASS/main fidelity before verdict.
          autoVisualScore: visual.autoVisualScore,
        },
      );
      setLastSubmittedHash(result.proposal.candidateHash);
      setStatus(
        result.proposal.promotable
          ? `已送人工批核，尚未套用 · ${result.proposal.candidateHash}`
          : `已送八招能力驗收，伺服器已鎖定不可 Promote · ${result.proposal.candidateHash}`,
      );
    } catch (e) {
      if (e instanceof ApiValidationError) {
        setServerErrors(issuesToErrorMap(e.issues));
        setStatus(`伺服器拒絕：${e.issues.length} 個欄位錯誤`);
      } else if (e instanceof UnsafeVfxAssetError) {
        setStatus(`⛔ 素材去背守衛拒絕儲存：${e.message}`);
      } else setStatus(`儲存失敗：${String(e)}`);
    }
  };

  const choose = (id: string): void => {
    setAbilityInput(id);
    setAbilityId(id);
  };
  const startAcceptanceFromBlank = (): void => {
    const blank = newScript(abilityId, reactionTrigger);
    draftHistory.reset(blank);
    setLoadedOriginal(blank);
    setLastSubmittedHash(null);
    setSelected(0);
    setPlaying(false);
    setPlayheadMs(0);
    setAcceptanceStartedFromBlank(true);
    setAuthoringActions([`從空白畫布開始：${abilityId}`]);
    setVisualEvidence([]);
    setStatus("空白畫布已建立；請用資源拖拉、積木與時間軸重建，完成後才能提交能力驗收");
  };
  const restoreAcceptanceReference = (): void => {
    const fixture = acceptanceFixtureFor(abilityId);
    if (!fixture) return;
    draftHistory.reset(fixture);
    setLoadedOriginal(fixture);
    setLastSubmittedHash(null);
    setSelected(0);
    setPlaying(false);
    setPlayheadMs(0);
    setAcceptanceStartedFromBlank(false);
    setAuthoringActions([`載入只讀參考樣本：${abilityId}`]);
    setVisualEvidence([]);
    setStatus("已載入只讀驗收參考；必須按「從空白重建」並實際操作後，才可提交能力驗收");
  };

  const fixtureWorkflowBlocked = isAcceptanceFixture && !acceptanceStartedFromBlank;
  const requiredVisualEvidence = isAcceptanceFixture ? 2 : 1;
  const visualEvidenceBlocked = visualEvidence.length < requiredVisualEvidence;

  const captureVisualEvidence = async (): Promise<void> => {
    if (replacementBlocked) {
      setStatus("⛔ Main 尚未支援 trigger:channel 取代；預設動作與腳本動作會重播，禁止當成驗收證據");
      return;
    }
    if (!simReview.ready) {
      setStatus(`⛔ 不可擷取批核證據：${simReview.reason}`);
      return;
    }
    if (!assetPreviewAllowed) {
      setStatus("⛔ 素材安全收據尚未全部通過，預覽與擷圖保持鎖定");
      return;
    }
    if (!reviewEvidenceAllowed) {
      setStatus(`⛔ 不可擷取批核證據：${reviewEvidenceIssues.join("；")}`);
      return;
    }
    if (previewMode !== "runtime") {
      setStatus("⛔ 視覺證據必須在「完整技能演出」模式擷取");
      return;
    }
    if (visualEvidence.length >= 4) {
      setStatus("視覺證據最多 4 張；請先刪除不需要的畫面");
      return;
    }
    try {
      const frame = await previewRef.current?.captureVisualEvidence(
        `${abilityId} vs ${targetChampionId} · ${(playheadMs / 1000).toFixed(3)}秒 · 證據${visualEvidence.length + 1}`,
      );
      if (!frame) throw new Error("預覽尚未準備完成");
      setVisualEvidence((current) => [...current, frame]);
      recordAction(`擷取視覺證據：${frame.view}/${(frame.atMs / 1000).toFixed(3)}秒`);
      setStatus(`已擷取候選畫面 ${visualEvidence.length + 1}/4；修改 JSON 會自動清除舊證據`);
    } catch (error) {
      setStatus(`⛔ 擷取視覺證據失敗：${String(error)}`);
    }
  };

  return (
    <main className="vfx-forge">
      <header className="vfx-forge-head">
        <div>
          <h1>✨ GGD 特效工坊 <small>VFX Forge</small></h1>
          <p>只編輯純演出候選；AI 修改先進後台批核，通過前絕不寫入遊戲 content。</p>
        </div>
        <div className="vfx-forge-save">
          <span className={errorCount || assetBlockers.length || actionIssues.length || replacementBlocked || activationConflict ? "error" : ""}>
            {status}{dirty ? " · 未提交變更" : ""}{lastSubmittedHash ? ` · 最近送審 ${lastSubmittedHash}` : ""}
          </span>
          <button type="button" disabled={!draftHistory.canUndo} onClick={() => { draftHistory.undo(); setVisualEvidence([]); }} title="復原（Ctrl/Cmd+Z）">↶ 復原</button>
          <button type="button" disabled={!draftHistory.canRedo} onClick={() => { draftHistory.redo(); setVisualEvidence([]); }} title="重做（Ctrl/Cmd+Shift+Z）">↷ 重做</button>
          <button type="button" disabled={!dirty} onClick={() => { if (loadedOriginal) { draftHistory.commit(loadedOriginal); setVisualEvidence([]); } }}>還原載入版</button>
          <button
            type="button"
            disabled={!dirty || !simReview.ready || errorCount > 0 || assetAuditPending || assetBlockers.length > 0 || actionIssues.length > 0 || replacementBlocked || activationConflict !== null || !reviewEvidenceAllowed || fixtureWorkflowBlocked || visualEvidenceBlocked}
            title={fixtureWorkflowBlocked
              ? "八招必須從空白畫布用 Editor 重建，不能直接提交預置 JSON"
              : !simReview.ready ? simReview.reason
              : replacementBlocked ? "Main 尚未支援腳本動作取代同一 trigger:channel 的預設動作"
              : !reviewEvidenceAllowed ? reviewEvidenceIssues.join("；")
              : visualEvidenceBlocked ? `送審前還需要 ${requiredVisualEvidence - visualEvidence.length} 張完整技能演出畫面` : undefined}
            onClick={() => void save()}
          >
            {assetAuditPending ? "檢查貼圖中…" : isAcceptanceFixture ? "提交能力驗收" : "提交 AI 批核"}
          </button>
        </div>
      </header>

      <section className="vfx-ability-picker">
        <label>技能 ID <input list="vfx-ability-ids" value={abilityInput} onChange={(e) => setAbilityInput(e.target.value)} /></label>
        <datalist id="vfx-ability-ids">{indexes.abilities.data?.entries.map((e) => <option key={e.id} value={e.id} />)}</datalist>
        <button type="button" onClick={() => choose(abilityInput.trim())}>載入</button>
        <label>
          驗收目標
          <select value={targetChampionId} onChange={(event) => { setTargetChampionId(event.target.value); setVisualEvidence([]); }}>
            {indexes.champions.data?.entries.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.id}</option>
            ))}
          </select>
        </label>
        {VFX_FORGE_ACCEPTANCE.map(([id, label]) => <button type="button" className={abilityId === id ? "active" : ""} key={id} onClick={() => choose(id)}>{label}</button>)}
      </section>

      <PassivePresentationPanel rules={passiveRules} />

      {!reviewEvidenceAllowed ? (
        <section className="vfx-blocker" role="alert">
          <b>⛔ 外觀證據不可批核</b>
          <span>
            {reviewEvidenceIssues.join("；")}。仍可預覽機制，但不可擷取或送出會讓審查者誤認為有效對戰畫面的證據。
          </span>
        </section>
      ) : null}

      {isAcceptanceFixture ? (
        <section className="vfx-blocker" role="status">
          <b>🧪 Editor 能力驗收樣本</b>
          <span>
            這八招只驗收工坊能否做出對應演出。預置內容只能當參考；必須從空白畫布重建並留下操作證據，候選才可送審。後台只能判定通過／失敗，Promote 端點也會拒絕。
          </span>
          <button type="button" onClick={startAcceptanceFromBlank}>從空白重建</button>
          <button type="button" onClick={restoreAcceptanceReference}>載入參考</button>
        </section>
      ) : (
        <section className="vfx-reaction-info" aria-label="AI 修改上線政策">
          <b>🧑‍⚖️ AI 修改需人工批核</b>
          <span>提交只建立候選。後台核准綁定此版 JSON 雜湊；任何後續修改都必須重新審查，核准後仍需另外按 Promote 才會套用。</span>
        </section>
      )}

      {isAcceptanceFixture && acceptanceSource ? <AcceptanceSourcePanel source={acceptanceSource} /> : null}

      {previewContent.data ? (
        <section className="vfx-effective-limits" aria-label="實際生效的 VFX 上限">
          <b>實際生效上限（{previewContent.data.limitsSource === "target-profile" ? "正式站同源 profile" : "目前 runtime resolver"}）</b>
          <span>單系統 {previewContent.data.limits.maxParticlesPerSystem} 顆</span>
          <span>每秒 {previewContent.data.limits.maxRatePerSystem} 顆</span>
          <span>Ribbon {previewContent.data.limits.maxActiveRibbons} 條／停止後 ≤ {previewContent.data.limits.ribbonFadeBudgetSec}s</span>
          <span>場景 VFX ≤ {previewContent.data.limits.hardMaxLifeSec}s／hard-cap {previewContent.data.limits.hardCapScope}</span>
          <span>一次性發射器 {Number.isFinite(previewContent.data.limits.maxOneShotEmitters) ? previewContent.data.limits.maxOneShotEmitters : "無上限"}</span>
          <span>回合清理 {previewContent.data.limits.roundPurgeMode}</span>
          {previewContent.data.limitsReceipt ? (
            <span>上限收據 {previewContent.data.limitsReceipt.limitProfileId} · {previewContent.data.limitsReceipt.resolverFingerprint}</span>
          ) : null}
          {previewContent.data.limitWarnings.map((warning) => <span className="warning" key={warning}>⚠️ {warning}</span>)}
        </section>
      ) : null}

      <section className="vfx-recipes" aria-label="可重用特效組合">
        <b>可重用組合</b>
        <span>像 JASS helper 一樣展開成標準積木；每招自動帶施展動作，時間軸的傷害／位移節點必須配角色動作。普通斬擊一動作只配 Main 收據中的一個 single-arc；只有三段以上、分時且小型的明確極速連斬可例外。舊 slash 積木每顆會噴26個月牙，工坊仍會阻擋。</span>
        {VFX_FORGE_RECIPES.map((recipe) => (
          <button key={recipe.id} type="button" title={recipe.description} onClick={() => void addRecipe(recipe.id)}>
            {recipe.label}
          </button>
        ))}
      </section>

      {reactionTrigger === "reflectSuccess" ? (
        <section className="vfx-reaction-info" aria-label="被動反應試放方式">
          <b>真實反彈試放</b>
          <span>工坊會先用玩家施法路徑開啟正式反彈技能，再注入一發敵方魔法攻擊；反彈、被動鉤子、七段班表與時序全部取自 SimWorld 事件。</span>
        </section>
      ) : null}

      <section className="vfx-preview-mode" aria-label="特效預覽模式">
        <b>預覽模式</b>
        <button
          type="button"
          className={previewMode === "runtime" ? "active" : ""}
          onClick={() => { setPlaying(false); setPlayheadMs(0); setPreviewMode("runtime"); }}
        >
          完整技能演出
        </button>
        <button
          type="button"
          className={previewMode === "script" ? "active" : ""}
          onClick={() => { setPlaying(false); setPlayheadMs(0); setPreviewMode("script"); }}
        >
          只看腳本層
        </button>
        <span>
          {previewMode === "runtime"
            ? "真 Sim 事件＋ability JSON＋目前未儲存的 VFX Script draft"
            : "隔離檢查目前 VFX Script；不代表技能視覺驗收通過"}
        </span>
      </section>

      {trace && "runtimeCompatible" in trace && !trace.runtimeCompatible ? (
        <section className="vfx-blocker" role="alert">
          <b>⛔ 主程式 provenance 接縫尚未通過</b>
          <span>{trace.runtimeIssue ?? "真事件已發生，但目前遊戲播放器尚無法把它歸屬到這份腳本。"}；請擴充 shared provenance 契約，工坊不會合成假事件。</span>
        </section>
      ) : null}

      {traceError ? <section className="vfx-blocker" role="alert"><b>⛔ SimWorld 試放失敗</b><span>{traceError}</span></section> : null}
      {previewContent.error ? <section className="vfx-blocker" role="alert"><b>⛔ Runtime 內容圖載入失敗</b><span>{String(previewContent.error)}</span></section> : null}
      {trace && !trace.accepted ? (
        <section className="vfx-blocker" role="alert"><b>⛔ 真 IntentFrame 被拒</b><span>{trace.reason ?? "unknown"}；工坊不會自行合成成功事件。</span></section>
      ) : null}
      {simReview.pending ? (
        <section className="vfx-blocker" role="status"><b>⏳ 真 Sim 動作稽核尚未就緒</b><span>{simReview.reason}；完成前禁止擷取與送審。</span></section>
      ) : null}

      {assetBlockers.length > 0 ? (
        <section className="vfx-blocker" role="alert">
          <b>⛔ 去背守衛禁止儲存／匯出</b>
          <span>{assetBlockers.map((item) => `${item.asset.id}：${item.summary}${item.detail ? `（${item.detail}）` : ""}`).join("；")}</span>
        </section>
      ) : null}
      {scriptSafety.error ? (
        <section className="vfx-blocker" role="alert"><b>⛔ 素材安全檢查失敗</b><span>{String(scriptSafety.error)}</span></section>
      ) : null}

      {actionIssues.length > 0 ? (
        <section className="vfx-blocker" role="alert">
          <b>⛔ 角色動作／斬擊配對未通過</b>
          <span>{actionIssues.map((issue) => `${issue.code}：${issue.message}`).join("；")}</span>
          {canAutoCompleteActionIssues ? (
            <button
              type="button"
              onClick={() => {
                mutate((doc) => ({
                  ...doc,
                  segments: completeActionAnimations(doc.segments, {
                    activationMode: activationModeForAbility(ability),
                    requiredTimelineCues: cues,
                  }),
                }));
                recordAction("依技能模板原則補齊施展／攻擊動作");
              setStatus("已補齊可安全推定的角色動作；假觸發、舊26發月牙與 Main replacement blocker 仍會個別阻擋");
              }}
            >
              自動補角色動作
            </button>
          ) : null}
        </section>
      ) : null}

      {replacementBlocked ? (
        <section className="vfx-blocker" role="alert">
          <b>⛔ Main 動作取代接縫尚未出貨</b>
          <span>
            收據 {PRESENTATION_RECEIPT.fingerprint} 明確回報 replacementPolicy={PRESENTATION_RECEIPT.replacementPolicy.status}。
            目前候選會占用 {replacementBlockers.map((claim) =>
              `${claim.trigger}:${claim.channel}${claim.strikeIndex === undefined ? "" : `#${claim.strikeIndex}`}`
            ).join("、")}；若繼續送審，Main 預設動作與腳本動作會同時播放。仍可編輯與預覽，但禁止擷取證據及送審。
          </span>
        </section>
      ) : null}

      {activationConflict ? (
        <section className="vfx-blocker" role="alert">
          <b>⛔ 技能啟用方式與說明衝突</b>
          <span>{activationConflict.code}：{activationConflict.message}</span>
        </section>
      ) : null}

      {draft && ability ? (
        <>
          <div className="vfx-forge-workspace">
            <VfxAssetPalette
              models={indexes.models.data}
              vfx={indexes.vfx.data}
              onAdd={addAsset}
              safety={assetSafety}
              onProbe={probeAsset}
              onProbeAll={probeAssets}
            />
            <section className="vfx-forge-center">
              {assetPreviewAllowed ? (
                <VfxForgePreview
                  ref={previewRef}
                  script={draft}
                  ability={ability}
                  schedule={schedule}
                  durationMs={durationMs}
                  playheadMs={playheadMs}
                  seekRevision={seekRevision}
                  playing={playing}
                  caster={runtimeChampion}
                  target={runtimeTarget}
                  mode={previewMode}
                  onTime={onTime}
                  onStop={stop}
                  onDropAsset={(asset, placement) => { void addAsset(asset, placement); }}
                  canCaptureEvidence={simReview.ready && !replacementBlocked && reviewEvidenceAllowed && previewMode === "runtime" && visualEvidence.length < 4}
                  onCaptureEvidence={() => void captureVisualEvidence()}
                />
              ) : (
                <section className="vfx-blocker" role="alert">
                  <b>⛔ 預覽已鎖定</b>
                  <span>
                    {scriptSafety.error
                      ? `素材安全檢查失敗：${String(scriptSafety.error)}`
                      : assetBlockers.length > 0
                        ? `不合格素材：${assetBlockers.map((item) => item.asset.id).join("、")}`
                        : "正在取得目前腳本每一個模型／粒子素材的去背安全收據。"}
                  </span>
                </section>
              )}
              <section className="vfx-visual-evidence" aria-label="候選視覺證據">
                <header>
                  <div>
                    <b>候選畫面證據 {visualEvidence.length}/{requiredVisualEvidence}（最多 4）</b>
                    <small>完整技能演出 · 綁定本次候選；任何 JSON 修改都會清空</small>
                  </div>
                  <button type="button" disabled={!simReview.ready || replacementBlocked || !assetPreviewAllowed || !reviewEvidenceAllowed || previewMode !== "runtime" || visualEvidence.length >= 4} onClick={() => void captureVisualEvidence()}>
                    📷 擷取目前格
                  </button>
                </header>
                {visualEvidence.length === 0 ? <p>在關鍵幀擷取側視／俯視或不同階段，送審後會直接顯示在後台單頁。</p> : (
                  <div className="vfx-evidence-grid">
                    {visualEvidence.map((frame, index) => (
                      <figure key={`${frame.view}:${frame.atMs}:${index}`}>
                        <img src={frame.dataUrl} alt={frame.label} />
                        <figcaption>{frame.view === "side" ? "側視" : "俯視"} · {(frame.atMs / 1000).toFixed(3)}秒</figcaption>
                        <button type="button" onClick={() => setVisualEvidence((frames) => frames.filter((_, i) => i !== index))}>移除</button>
                      </figure>
                    ))}
                  </div>
                )}
              </section>
              <VfxTimeline
                script={draft}
                cues={cues}
                durationMs={durationMs}
                playheadMs={playheadMs}
                playing={playing}
                selected={selectedIndex}
                onSelect={setSelected}
                onSeek={(ms) => {
                  setPlaying(false);
                  setPlayheadMs(ms);
                  // Repaint even when the author enters the same timestamp:
                  // layout/fullscreen may have cleared WebGL while the logical
                  // playhead stayed unchanged.
                  setSeekRevision((revision) => revision + 1);
                }}
                onTogglePlay={() => setPlaying((v) => !v)}
                onRestart={() => { setPlaying(false); setPlayheadMs(0); }}
                onStep={(frames) => {
                  setPlaying(false);
                  setPlayheadMs((ms) => Math.max(0, Math.min(durationMs, ms + frames * PREVIEW_FRAME_MS)));
                }}
                onAddKind={addKind}
                onDropAsset={(asset) => { void addAsset(asset); }}
              />
            </section>
            <SegmentInspector
              segment={draft.segments[selectedIndex]!}
              index={selectedIndex}
              count={draft.segments.length}
              errors={stripSegmentErrorPrefix(errors, selectedIndex)}
              onChange={(segment) => {
                mutate((doc) => ({ ...doc, segments: doc.segments.map((s, i) => i === selectedIndex ? segment : s) }));
                recordAction(`調整第 ${selectedIndex + 1} 段：${segment.kind}`);
              }}
              onSelect={setSelected}
              onDelete={() => {
                mutate((doc) => ({ ...doc, segments: doc.segments.filter((_, i) => i !== selectedIndex) }));
                recordAction(`刪除第 ${selectedIndex + 1} 段`);
                setSelected(Math.max(0, selectedIndex - 1));
              }}
              onMove={(delta) => {
                mutate((doc) => {
                  const to = selectedIndex + delta;
                  const segments = [...doc.segments];
                  [segments[selectedIndex], segments[to]] = [segments[to]!, segments[selectedIndex]!];
                  return { ...doc, segments };
                });
                recordAction(`移動第 ${selectedIndex + 1} 段：${delta < 0 ? "往前" : "往後"}`);
                setSelected(selectedIndex + delta);
              }}
            />
          </div>
          <section className="vfx-script-meta">
            <label>JASS 出處／換算備註<textarea rows={4} value={draft.notes ?? ""} onChange={(e) => mutate((doc) => ({ ...doc, notes: e.target.value || undefined }))} /></label>
            <div>
              <b>實際觸發班表</b>
              <small>{previewContent.data ? `${previewContent.data.contentVersion} · ${trace?.events.length ?? 0} events · ${cues.length} triggers` : "載入 Runtime 內容圖…"}</small>
              {cues.map((c, i) => <code key={i}>{(c.atMs / 1000).toFixed(3)}s {c.label}</code>)}
            </div>
          </section>
        </>
      ) : <p className="vfx-loading">{status}</p>}
    </main>
  );
}

/** High enough to legally learn every ordinary slot; rank-up rules still run. */
const PREVIEW_AUTHOR_LEVEL = 18;
const PREVIEW_FRAME_MS = 1000 / 60;

function useForgeIndexes(): Record<"scripts" | "abilities" | "champions" | "models" | "vfx", ReturnType<typeof useIndex>> {
  return {
    scripts: useIndex("vfx-scripts"),
    abilities: useIndex("abilities"),
    champions: useIndex("champions"),
    models: useIndex("models"),
    vfx: useIndex("vfx"),
  };
}

function useIndex(collection: "vfx-scripts" | "abilities" | "champions" | "models" | "vfx") {
  return useQuery<CollectionIndex>({ queryKey: ["index", collection], queryFn: () => api.index(collection) });
}

function mergeErrors(a: ErrorMap, b: ErrorMap): ErrorMap {
  const out: ErrorMap = { ...a };
  for (const [path, messages] of Object.entries(b)) out[path] = [...(out[path] ?? []), ...messages];
  return out;
}

function stripSegmentErrorPrefix(errors: ErrorMap, index: number): ErrorMap {
  const prefix = `segments.${index}.`;
  const out: ErrorMap = {};
  for (const [path, messages] of Object.entries(errors)) {
    if (path.startsWith(prefix)) out[path.slice(prefix.length)] = messages;
  }
  return out;
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  zodIssues,
  type CollectionIndex,
  type FieldIssue,
} from "@ggd/shared/content";
import {
  zVfxScriptDoc,
  type VfxScriptDoc,
  type VfxScriptSegment,
} from "@ggd/shared/content/schema/vfxScript";
import { Abilities, Champions, type CastableSlot } from "@ggd/shared/sim";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import { api, ApiValidationError } from "../api/client";
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
  assetKey,
  assetRefsFromScript,
  type AssetSafetyResult,
} from "./assetSafety";
import {
  CLASSIC_BEAM_MODEL_KEY,
  VFX_FORGE_RECIPES,
  abilityUsesModel,
  buildVfxForgeRecipe,
  type VfxForgeRecipeId,
} from "./recipes";
import { acceptanceFixtureFor, VFX_FORGE_ACCEPTANCE } from "./acceptanceFixtures";

const simPreview = createSimPreviewController();

// GH#838 progress: these eight scenes prove the Forge can compose the required
// visual grammar. They are Editor fixtures, not game-content candidates; the
// GH#664 gate therefore permits pass/fail evidence but never Promote.

export function VfxForgePage() {
  const indexes = useForgeIndexes();
  const assetSafetyGate = useMemo(() => new AssetSafetyGate(api), []);
  const [abilityId, setAbilityId] = useState("godie-hart.r");
  const [abilityInput, setAbilityInput] = useState("godie-hart.r");
  const [targetChampionId, setTargetChampionId] = useState("sela");
  const [ability, setAbility] = useState<ForgeAbility | null>(null);
  const draftHistory = useUndoHistory<VfxScriptDoc | null>(null, sameJson);
  const draft = draftHistory.value;
  const [original, setOriginal] = useState<VfxScriptDoc | null>(null);
  const [isAcceptanceFixture, setIsAcceptanceFixture] = useState(false);
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
  const reactionTrigger = useMemo(
    () => runtimeAbility ? reactionTriggerOf(runtimeAbility) : null,
    [runtimeAbility],
  );

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
    void (async () => {
      try {
        const abilityDoc = await api.doc<ForgeAbility>("abilities", abilityId);
        const fixture = acceptanceFixtureFor(abilityId);
        const exists = existingIds.has(abilityId);
        const script = fixture ?? (exists ? await api.doc<VfxScriptDoc>("vfx-scripts", abilityId) : newScript(abilityId));
        if (!live) return;
        setAbility(abilityDoc);
        draftHistory.reset(script);
        setOriginal(script);
        setIsAcceptanceFixture(fixture !== null);
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
      if (key === "z" && event.shiftKey) { event.preventDefault(); draftHistory.redo(); }
      else if (key === "z") { event.preventDefault(); draftHistory.undo(); }
      else if (key === "y") { event.preventDefault(); draftHistory.redo(); }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [draftHistory.redo, draftHistory.undo]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(original), [draft, original]);
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
  const schedule = useMemo(
    () => trace ? scheduleSimEvents(trace.events, abilityId) : [],
    [abilityId, trace],
  );
  const cues = useMemo(
    () => ability ? triggerCuesFromSim(schedule, runtimeAbility ?? ability) : [],
    [ability, runtimeAbility, schedule],
  );
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
  };
  const probeAsset = (asset: AssetDrop): void => {
    const key = assetKey(asset);
    if (assetSafety.has(key)) return;
    setAssetSafety((previous) => new Map(previous).set(key, "checking"));
    void assetSafetyGate.check(asset).then((result) => {
      setAssetSafety((previous) => new Map(previous).set(key, result));
    });
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
    mutate((doc) => ({ ...doc, segments: [...doc.segments, segmentFromAsset(asset, placement)] }));
    setSelected(draft?.segments.length ?? 0);
    setStatus(`素材去背通過：${asset.id}`);
  };
  const addKind = (kind: VfxScriptSegment["kind"]): void => {
    mutate((doc) => ({ ...doc, segments: [...doc.segments, newSegment(kind)] }));
    setSelected(draft?.segments.length ?? 0);
  };
  const addRecipe = async (id: VfxForgeRecipeId): Promise<void> => {
    if (!draft || !ability) return;
    const coreAlreadyOwned = abilityUsesModel(ability, CLASSIC_BEAM_MODEL_KEY);
    const segments = buildVfxForgeRecipe(id, { includeModelCore: !coreAlreadyOwned });
    const candidate: VfxScriptDoc = { ...draft, segments: [...draft.segments, ...segments] };
    const checks = await assetSafetyGate.checkScript(candidate);
    const blocker = checks.find((item) => !item.safe);
    if (blocker) {
      setStatus(`⛔ 組合未加入：${blocker.asset.id} · ${blocker.summary}`);
      return;
    }
    mutate(() => candidate);
    setSelected(draft.segments.length);
    setStatus(coreAlreadyOwned
      ? "ability 已擁有 ReviveHuman MDL 主體；只加入粒子輔助層，避免重複繪製"
      : "已加入 MDL 主體＋粒子輔助層；每一塊都可在時間軸單獨調整");
  };

  const save = async (): Promise<void> => {
    if (!draft || errorCount > 0 || assetAuditPending || assetBlockers.length > 0) return;
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
      setStatus(`底板掃描通過（${visual.sampledFrames}格），提交人工批核佇列…`);
      const result = await submitVfxScriptProposal(
        draft,
        assetSafetyGate,
        isAcceptanceFixture ? "editor-capability-fixture" : "production-candidate",
        api,
        {
          summary: isAcceptanceFixture
            ? "八招 VFX Forge 表達能力驗收；只評估編輯器，不得套用遊戲主程式"
            : "VFX Forge AI 輔助調整候選",
        },
      );
      setOriginal(draft);
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

  return (
    <main className="vfx-forge">
      <header className="vfx-forge-head">
        <div>
          <h1>✨ GGD 特效工坊 <small>VFX Forge</small></h1>
          <p>只編輯純演出候選；AI 修改先進後台批核，通過前絕不寫入遊戲 content。</p>
        </div>
        <div className="vfx-forge-save">
          <span className={errorCount || assetBlockers.length ? "error" : ""}>{status}{dirty ? " · 未儲存" : ""}</span>
          <button type="button" disabled={!draftHistory.canUndo} onClick={draftHistory.undo} title="復原（Ctrl/Cmd+Z）">↶ 復原</button>
          <button type="button" disabled={!draftHistory.canRedo} onClick={draftHistory.redo} title="重做（Ctrl/Cmd+Shift+Z）">↷ 重做</button>
          <button type="button" disabled={!dirty} onClick={() => { if (original) draftHistory.commit(original); }}>還原存檔版</button>
          <button type="button" disabled={!dirty || errorCount > 0 || assetAuditPending || assetBlockers.length > 0} onClick={() => void save()}>
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
          <select value={targetChampionId} onChange={(event) => setTargetChampionId(event.target.value)}>
            {indexes.champions.data?.entries.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.id}</option>
            ))}
          </select>
        </label>
        {VFX_FORGE_ACCEPTANCE.map(([id, label]) => <button type="button" className={abilityId === id ? "active" : ""} key={id} onClick={() => choose(id)}>{label}</button>)}
      </section>

      {isAcceptanceFixture ? (
        <section className="vfx-blocker" role="status">
          <b>🧪 Editor 能力驗收樣本</b>
          <span>這八招只驗收工坊能否做出對應演出。候選存放於審查材料區，不是遊戲內容；後台只能判定通過／失敗，Promote 端點也會拒絕。</span>
        </section>
      ) : (
        <section className="vfx-reaction-info" aria-label="AI 修改上線政策">
          <b>🧑‍⚖️ AI 修改需人工批核</b>
          <span>提交只建立候選。後台核准綁定此版 JSON 雜湊；任何後續修改都必須重新審查，核准後仍需另外按 Promote 才會套用。</span>
        </section>
      )}

      {previewContent.data ? (
        <section className="vfx-effective-limits" aria-label="實際生效的 VFX 上限">
          <b>實際生效上限</b>
          <span>單系統 {previewContent.data.limits.maxParticlesPerSystem} 顆</span>
          <span>每秒 {previewContent.data.limits.maxRatePerSystem} 顆</span>
          <span>Ribbon {previewContent.data.limits.maxActiveRibbons} 條／停止後 ≤ {previewContent.data.limits.ribbonFadeBudgetSec}s</span>
          <span>場景 VFX ≤ {previewContent.data.limits.hardMaxLifeSec}s</span>
          <span>一次性發射器 {Number.isFinite(previewContent.data.limits.maxOneShotEmitters) ? previewContent.data.limits.maxOneShotEmitters : "無上限"}</span>
          <span>回合清理 {previewContent.data.limits.roundPurgeMode}</span>
        </section>
      ) : null}

      <section className="vfx-recipes" aria-label="可重用特效組合">
        <b>可重用組合</b>
        <span>像 JASS helper 一樣展開成標準積木；MDL 是主體，粒子只做輔助。</span>
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

      {assetBlockers.length > 0 ? (
        <section className="vfx-blocker" role="alert">
          <b>⛔ 去背守衛禁止儲存／匯出</b>
          <span>{assetBlockers.map((item) => `${item.asset.id}：${item.summary}${item.detail ? `（${item.detail}）` : ""}`).join("；")}</span>
        </section>
      ) : null}
      {scriptSafety.error ? (
        <section className="vfx-blocker" role="alert"><b>⛔ 素材安全檢查失敗</b><span>{String(scriptSafety.error)}</span></section>
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
            />
            <section className="vfx-forge-center">
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
                onDropAsset={addAsset}
              />
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
                onDropAsset={addAsset}
              />
            </section>
            <SegmentInspector
              segment={draft.segments[selectedIndex]!}
              index={selectedIndex}
              count={draft.segments.length}
              errors={stripSegmentErrorPrefix(errors, selectedIndex)}
              onChange={(segment) => mutate((doc) => ({ ...doc, segments: doc.segments.map((s, i) => i === selectedIndex ? segment : s) }))}
              onSelect={setSelected}
              onDelete={() => {
                mutate((doc) => ({ ...doc, segments: doc.segments.filter((_, i) => i !== selectedIndex) }));
                setSelected(Math.max(0, selectedIndex - 1));
              }}
              onMove={(delta) => {
                mutate((doc) => {
                  const to = selectedIndex + delta;
                  const segments = [...doc.segments];
                  [segments[selectedIndex], segments[to]] = [segments[to]!, segments[selectedIndex]!];
                  return { ...doc, segments };
                });
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

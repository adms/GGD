import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { writeVfxScript } from "./writeback";
import { VfxAssetPalette } from "./VfxAssetPalette";
import { VfxForgePreview } from "./VfxForgePreview";
import type { VfxForgeStageMode } from "./VfxForgeStage";
import { VfxTimeline } from "./VfxTimeline";
import { SegmentInspector } from "./SegmentInspector";

const ACCEPTANCE = [
  ["godie-hjai.e", "04-03 龍破斬"],
  ["godie-hjai.r", "04-04 神滅斬"],
  ["godie-hart.r", "01-04 超究武神霸斬"],
  ["godie-nbbc.r", "08-04 阿邦快速劍X"],
  ["godie-nbbc.e", "08-03 龍鬥氣砲咒文"],
  ["godie-ogrh.r", "09-04 龜派氣功"],
  ["godie-e002.ex", "20-002 理想鄉EX"],
  ["godie-hvsh.r", "48-04 騎英之手綱"],
] as const;

const simPreview = createSimPreviewController();

export function VfxForgePage() {
  const qc = useQueryClient();
  const indexes = useForgeIndexes();
  const [abilityId, setAbilityId] = useState("godie-hart.r");
  const [abilityInput, setAbilityInput] = useState("godie-hart.r");
  const [targetChampionId, setTargetChampionId] = useState("sela");
  const [ability, setAbility] = useState<ForgeAbility | null>(null);
  const draftHistory = useUndoHistory<VfxScriptDoc | null>(null, sameJson);
  const draft = draftHistory.value;
  const [original, setOriginal] = useState<VfxScriptDoc | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [selected, setSelected] = useState(0);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewMode, setPreviewMode] = useState<VfxForgeStageMode>("runtime");
  const [status, setStatus] = useState("載入中…");
  const [serverErrors, setServerErrors] = useState<ErrorMap>({});
  const [trace, setTrace] = useState<CastPreviewTrace | ReactionPreviewTrace | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);

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
        const exists = existingIds.has(abilityId);
        const script = exists ? await api.doc<VfxScriptDoc>("vfx-scripts", abilityId) : newScript(abilityId);
        if (!live) return;
        setAbility(abilityDoc);
        draftHistory.reset(script);
        setOriginal(script);
        setIsNew(!exists);
        setSelected(0);
        setStatus(exists ? "已載入" : "尚無腳本；儲存時只會新增 vfx-scripts 文件");
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

  const mutate = (fn: (doc: VfxScriptDoc) => VfxScriptDoc): void => {
    draftHistory.commit((doc) => (doc ? fn(doc) : doc));
    setServerErrors({});
  };
  const addAsset = (asset: AssetDrop, placement?: AssetPlacement): void => {
    mutate((doc) => ({ ...doc, segments: [...doc.segments, segmentFromAsset(asset, placement)] }));
    setSelected(draft?.segments.length ?? 0);
  };
  const addKind = (kind: VfxScriptSegment["kind"]): void => {
    mutate((doc) => ({ ...doc, segments: [...doc.segments, newSegment(kind)] }));
    setSelected(draft?.segments.length ?? 0);
  };

  const save = async (): Promise<void> => {
    if (!draft || errorCount > 0) return;
    setStatus("驗證並寫回中…");
    try {
      const result = await writeVfxScript(draft, api, isNew ? "create" : "put");
      setOriginal(draft);
      setIsNew(false);
      setStatus(`已儲存 content/vfx-scripts/${draft.id}.json · ${result.hash}`);
      void qc.invalidateQueries({ queryKey: ["index", "vfx-scripts"] });
    } catch (e) {
      if (e instanceof ApiValidationError) {
        setServerErrors(issuesToErrorMap(e.issues));
        setStatus(`伺服器拒絕：${e.issues.length} 個欄位錯誤`);
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
          <p>只編輯純演出腳本；傷害、段數與結算時序仍以 ability JSON 為真相。</p>
        </div>
        <div className="vfx-forge-save">
          <span className={errorCount ? "error" : ""}>{status}{dirty ? " · 未儲存" : ""}</span>
          <button type="button" disabled={!draftHistory.canUndo} onClick={draftHistory.undo} title="復原（Ctrl/Cmd+Z）">↶ 復原</button>
          <button type="button" disabled={!draftHistory.canRedo} onClick={draftHistory.redo} title="重做（Ctrl/Cmd+Shift+Z）">↷ 重做</button>
          <button type="button" disabled={!dirty} onClick={() => { if (original) draftHistory.commit(original); }}>還原存檔版</button>
          <button type="button" disabled={!dirty || errorCount > 0} onClick={() => void save()}>儲存腳本</button>
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
        {ACCEPTANCE.map(([id, label]) => <button type="button" className={abilityId === id ? "active" : ""} key={id} onClick={() => choose(id)}>{label}</button>)}
      </section>

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

      {draft && ability ? (
        <>
          <div className="vfx-forge-workspace">
            <VfxAssetPalette models={indexes.models.data} vfx={indexes.vfx.data} onAdd={addAsset} />
            <section className="vfx-forge-center">
              <VfxForgePreview
                script={draft}
                ability={ability}
                schedule={schedule}
                durationMs={durationMs}
                playheadMs={playheadMs}
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
                onSeek={(ms) => { setPlaying(false); setPlayheadMs(ms); }}
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

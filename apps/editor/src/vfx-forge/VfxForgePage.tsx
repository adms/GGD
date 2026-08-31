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
import { api, ApiValidationError } from "../api/client";
import { issuesToErrorMap, type ErrorMap } from "../store";
import {
  deriveTriggerCues,
  newScript,
  newSegment,
  segmentFromAsset,
  timelineDurationMs,
  type AssetDrop,
  type AssetPlacement,
  type ForgeAbility,
} from "./model";
import { writeVfxScript } from "./writeback";
import { VfxAssetPalette } from "./VfxAssetPalette";
import { VfxForgePreview } from "./VfxForgePreview";
import { VfxTimeline } from "./VfxTimeline";
import { SegmentInspector } from "./SegmentInspector";

const ACCEPTANCE = [
  ["godie-hart.r", "01-04 超究武神霸斬"],
  ["godie-hjai.e", "04-03 龍破斬"],
  ["godie-e002.ex", "20-002 理想鄉EX"],
] as const;

export function VfxForgePage() {
  const qc = useQueryClient();
  const indexes = useForgeIndexes();
  const combo = useQuery({ queryKey: ["vfx-forge-combo"], queryFn: () => api.doc("config", "combo-strikes") });
  const [abilityId, setAbilityId] = useState("godie-hart.r");
  const [abilityInput, setAbilityInput] = useState("godie-hart.r");
  const [ability, setAbility] = useState<ForgeAbility | null>(null);
  const [draft, setDraft] = useState<VfxScriptDoc | null>(null);
  const [original, setOriginal] = useState<VfxScriptDoc | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [selected, setSelected] = useState(0);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("載入中…");
  const [serverErrors, setServerErrors] = useState<ErrorMap>({});

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
        setDraft(script);
        setOriginal(script);
        setIsNew(!exists);
        setSelected(0);
        setStatus(exists ? "已載入" : "尚無腳本；儲存時只會新增 vfx-scripts 文件");
      } catch (e) {
        if (!live) return;
        setAbility(null);
        setDraft(null);
        setStatus(`載入失敗：${String(e)}`);
      }
    })();
    return () => { live = false; };
  }, [abilityId, existingIds]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(original), [draft, original]);
  const inlineErrors: ErrorMap = useMemo(() => {
    if (!draft) return {};
    const parsed = zVfxScriptDoc.safeParse(draft);
    return parsed.success ? {} : issuesToErrorMap(zodIssues(parsed.error) as FieldIssue[]);
  }, [draft]);
  const errors = useMemo(() => mergeErrors(inlineErrors, serverErrors), [inlineErrors, serverErrors]);
  const errorCount = Object.keys(errors).length;
  const cues = useMemo(() => (ability ? deriveTriggerCues(ability, combo.data) : []), [ability, combo.data]);
  const durationMs = useMemo(() => (draft ? timelineDurationMs(draft, cues) : 1000), [cues, draft]);
  const selectedIndex = draft ? Math.min(selected, draft.segments.length - 1) : 0;
  const stop = useCallback(() => setPlaying(false), []);
  const onTime = useCallback((ms: number) => setPlayheadMs(ms), []);

  const mutate = (fn: (doc: VfxScriptDoc) => VfxScriptDoc): void => {
    setDraft((doc) => (doc ? fn(doc) : doc));
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
          <button type="button" disabled={!dirty} onClick={() => { if (original) setDraft(original); }}>還原</button>
          <button type="button" disabled={!dirty || errorCount > 0} onClick={() => void save()}>儲存腳本</button>
        </div>
      </header>

      <section className="vfx-ability-picker">
        <label>技能 ID <input list="vfx-ability-ids" value={abilityInput} onChange={(e) => setAbilityInput(e.target.value)} /></label>
        <datalist id="vfx-ability-ids">{indexes.abilities.data?.entries.map((e) => <option key={e.id} value={e.id} />)}</datalist>
        <button type="button" onClick={() => choose(abilityInput.trim())}>載入</button>
        {ACCEPTANCE.map(([id, label]) => <button type="button" className={abilityId === id ? "active" : ""} key={id} onClick={() => choose(id)}>{label}</button>)}
      </section>

      {abilityId === "godie-e002.ex" ? (
        <section className="vfx-blocker" role="alert">
          <b>⛔ 主程式前置：缺少 `defenseSuccess` 觸發器</b>
          <span>理想鄉EX由反彈成功觸發；目前 schema 無法誠實表達。工坊不會拿 cast/strike 近似，需由 GGD main 補觸發器後再完成。</span>
        </section>
      ) : null}

      {draft && ability ? (
        <>
          <div className="vfx-forge-workspace">
            <VfxAssetPalette models={indexes.models.data} vfx={indexes.vfx.data} onAdd={addAsset} />
            <section className="vfx-forge-center">
              <VfxForgePreview
                script={draft}
                ability={ability}
                cues={cues}
                durationMs={durationMs}
                playheadMs={playheadMs}
                playing={playing}
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
            <div><b>實際觸發班表</b>{cues.map((c, i) => <code key={i}>{(c.atMs / 1000).toFixed(3)}s {c.label}</code>)}</div>
          </section>
        </>
      ) : <p className="vfx-loading">{status}</p>}
    </main>
  );
}

function useForgeIndexes(): Record<"scripts" | "abilities" | "models" | "vfx", ReturnType<typeof useIndex>> {
  return {
    scripts: useIndex("vfx-scripts"),
    abilities: useIndex("abilities"),
    models: useIndex("models"),
    vfx: useIndex("vfx"),
  };
}

function useIndex(collection: "vfx-scripts" | "abilities" | "models" | "vfx") {
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

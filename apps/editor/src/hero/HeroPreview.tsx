import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { defaultParamsFor, paramsSchemaFor, type HeroProject, type HeroSlot } from "@ggd/shared/content";
import { isVfxScriptCall, zVfxScriptSegment, type VfxScriptAuthoredDoc, type VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import type { VfxSubtypeDoc } from "@ggd/shared/content/schema/vfxSubtype";
import { FormRenderer } from "../form/FormRenderer";
import { walkZod } from "../form/walk";
import type { ErrorMap } from "../store";
import { ensurePreviewContentReady } from "../preview/previewContent";
import { SimEventTimeline } from "../forge/SimEventTimeline";
import { VfxForgePreview } from "../vfx-forge/VfxForgePreview";
import { VfxTimeline } from "../vfx-forge/VfxTimeline";
import { newSegment, reactionTriggerOf, scheduleSimEvents, segmentFromAsset, triggerCuesFromSim } from "../vfx-forge/model";
import type { HeroValidationResult } from "./validation";
import { editHeroProject, fieldOwner } from "./projectModel";
import type { VfxForgeStageOptions } from "../vfx-forge/VfxForgeStage";
export type FrozenHeroPreviewContent = Pick<VfxForgeStageOptions, "fetchDoc" | "resolveAssetUrl"> & { limitWarnings: readonly string[] };

export function HeroPreview({ project, slot, result, current, editable, errors, onChange, frozenContent, vfxSubtypes = [] }: {
  project: HeroProject; slot: HeroSlot; result: HeroValidationResult;
  current: boolean; editable: boolean; errors: ErrorMap; onChange(project: HeroProject): void;
  frozenContent?: FrozenHeroPreviewContent;
  vfxSubtypes?: readonly VfxSubtypeDoc[];
}) {
  const ready = useQuery({ queryKey: ["preview-content"], queryFn: ensurePreviewContentReady, staleTime: Infinity, enabled: !frozenContent });
  const contentReady = frozenContent ?? ready.data;
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState(0);
  const [seekRevision, setSeekRevision] = useState(0);
  const compiled = result.compiled!;
  const ability = compiled.abilityDrafts[slot];
  const scenario = result.scenarios.find((entry) => entry.slot === slot);
  const schedule = useMemo(() => scheduleSimEvents(scenario?.events ?? [], ability.id), [ability.id, scenario]);
  const cues = useMemo(() => triggerCuesFromSim(schedule, ability), [schedule, ability]);
  const durationMs = Math.max(1000, (scenario?.ticks ?? 30) * 1000 / 30);
  const stageScript = useMemo<VfxScriptDoc>(() => compiled.vfxScripts.find((entry) => entry.abilityId === ability.id)
    ?? { id: ability.id, schema: "vfx-script@1", abilityId: ability.id, segments: [] }, [compiled.vfxScripts, ability.id]);
  const script = project.presentation.slots[slot].script ?? { ...stageScript, segments: [] };
  const events = useMemo(() => schedule.map(({ atMs, event }) => ({ ...event, tick: Math.round(atMs * 30 / 1000) })), [schedule]);
  const stop = useCallback(() => setPlaying(false), []);
  const seek = (ms: number) => { setPlaying(false); setPlayheadMs(Math.max(0, Math.min(durationMs, ms))); setSeekRevision((value) => value + 1); };
  useEffect(() => { setPlaying(false); setPlayheadMs(0); }, [result.revision, slot, current]);
  const prefix = `presentation.slots.${slot}.script`;
  const locked = fieldOwner(project, "presentation", prefix) === "locked";
  const changeScript = (next: VfxScriptAuthoredDoc) => onChange(editHeroProject(project, "presentation", prefix, next.segments.length ? next : null));
  const selectedEntry = script.segments[selected];
  const selectedSubtype = selectedEntry && isVfxScriptCall(selectedEntry) ? vfxSubtypes.find((doc) => doc.id === selectedEntry.call.subtype) : undefined;
  return <section className="hero-preview" aria-label={`${slot} 技能試玩與演出`}>
    <h3>技能試玩與演出</h3>
    {!current ? <p role="status">目前畫面保留第 {result.revision} 版結果；這次修改通過檢查後才可重播。</p> : null}
    {!frozenContent && ready.error ? <p role="alert">演出內容載入失敗：{String(ready.error)}</p> : contentReady ? <VfxForgePreview
      key={`${slot}/${compiled.champion.modelKey}`}
      script={stageScript} ability={ability} schedule={schedule} durationMs={durationMs}
      frozenContent={frozenContent}
      playheadMs={playheadMs} seekRevision={seekRevision} playing={playing && current}
      caster={compiled.champion} target={compiled.champion} mode="runtime" onTime={setPlayheadMs} onStop={stop}
      onDropAsset={editable && !locked ? (asset, placement) => changeScript({ ...script, segments: [...script.segments, segmentFromAsset(asset, placement, reactionTriggerOf(ability))] }) : undefined}
    /> : <p>正在載入場景、模型與演出內容…</p>}
    {contentReady?.limitWarnings.map((warning) => <p key={warning} role="status">{warning}</p>)}
    <SimEventTimeline events={events} durationMs={durationMs} playheadMs={playheadMs} playing={playing && current} onSeek={seek} onTogglePlay={() => current && setPlaying((value) => !value)} />
    {editable ? <fieldset disabled={locked}><legend>事件驅動的演出時間軸</legend>
      <p>演出依實際施法、命中與連段事件觸發；不會改動技能傷害。未觀察到觸發事件的段落不會播放。</p>
      <label>加入特效子型<select aria-label="加入特效子型" value="" onChange={(event) => {
        if (!vfxSubtypes.some((doc) => doc.id === event.target.value)) return;
        setSelected(script.segments.length);
        changeScript({ ...script, segments: [...script.segments, { call: { subtype: event.target.value, params: {} } }] });
      }}><option value="">選擇已支援的特效子型…</option>{vfxSubtypes.map((doc) => <option key={doc.id} value={doc.id}>{doc.label}</option>)}</select></label>
      <label><input type="checkbox" checked={script.yields?.includes("caster.castFx") ?? false} onChange={(event) => changeScript({ ...script, yields: event.target.checked ? ["caster.castFx"] : [] })} />由此演出接管預設施法裝飾（保留範圍與施法提示）</label>
      <VfxTimeline script={script} subtypes={vfxSubtypes} cues={cues} durationMs={durationMs} playheadMs={playheadMs} playing={playing}
        selected={selected} onSelect={setSelected} onSeek={seek} onTogglePlay={() => current && setPlaying((value) => !value)}
        onRestart={() => seek(0)} onStep={(frames) => seek(playheadMs + frames * 1000 / 60)}
        onAddKind={(kind) => { setSelected(script.segments.length); changeScript({ ...script, segments: [...script.segments, newSegment(kind, reactionTriggerOf(ability))] }); }}
        onDropAsset={(asset) => changeScript({ ...script, segments: [...script.segments, segmentFromAsset(asset, undefined, reactionTriggerOf(ability))] })} />
      {selectedEntry ? <>
        {isVfxScriptCall(selectedEntry) ? selectedSubtype ? <><h4>{selectedSubtype.label}</h4><p>只儲存個別覆寫；投稿時固定子型版本與展開後的演出。</p>
          <FormRenderer node={walkZod(paramsSchemaFor(selectedSubtype))} value={{ ...defaultParamsFor(selectedSubtype), ...selectedEntry.call.params }} dataPath={`${prefix}.segments.${selected}.call.params`} errors={errors} onChange={(path, value) => onChange(editHeroProject(project, "presentation", path, value))} />
        </> : <p role="alert">這份特效子型不在目前目錄，原呼叫已保留；請移除或選擇可用子型後再投稿。</p> : <FormRenderer node={walkZod(zVfxScriptSegment)} value={selectedEntry} dataPath={`${prefix}.segments.${selected}`} errors={errors} onChange={(path, value) => onChange(editHeroProject(project, "presentation", path, value))} />}
        <button type="button" onClick={() => changeScript({ ...script, segments: script.segments.filter((_, index) => index !== selected) })}>移除選取的演出段落</button>
      </> : null}
    </fieldset> : null}
  </section>;
}

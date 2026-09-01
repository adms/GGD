import type { VfxScriptDoc, VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import { VFX_FORGE_SEGMENT_KINDS, decodeAssetDrag, segmentTimes, type AssetDrop, type TriggerCue } from "./model";

export function VfxTimeline({
  script,
  cues,
  durationMs,
  playheadMs,
  playing,
  selected,
  onSelect,
  onSeek,
  onTogglePlay,
  onRestart,
  onStep,
  onAddKind,
  onDropAsset,
}: {
  script: VfxScriptDoc;
  cues: readonly TriggerCue[];
  durationMs: number;
  playheadMs: number;
  playing: boolean;
  selected: number;
  onSelect(index: number): void;
  onSeek(ms: number): void;
  onTogglePlay(): void;
  onRestart(): void;
  onStep(frames: -1 | 1): void;
  onAddKind(kind: VfxScriptSegment["kind"]): void;
  onDropAsset(asset: AssetDrop): void;
}) {
  const times = segmentTimes(script, cues);
  return (
    <section
      className="vfx-timeline"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDrop={(e) => {
        e.preventDefault();
        const asset = decodeAssetDrag(e.dataTransfer.getData("application/x-ggd-vfx-asset"));
        if (asset) onDropAsset(asset);
      }}
    >
      <header className="vfx-timeline-head">
        <div>
          <button type="button" onClick={onRestart}>↺</button>
          <button type="button" onClick={() => onStep(-1)} title="後退一個 1/60 秒畫格">−1f</button>
          <button type="button" onClick={onTogglePlay}>{playing ? "❚❚" : "▶"}</button>
          <button type="button" onClick={() => onStep(1)} title="前進一個 1/60 秒畫格">+1f</button>
          <strong>{(playheadMs / 1000).toFixed(2)}s</strong>
          <label className="vfx-exact-time">
            精確秒數
            <input
              type="number"
              min={0}
              max={durationMs / 1000}
              step={1 / 60}
              value={(Math.min(durationMs, playheadMs) / 1000).toFixed(3)}
              onChange={(e) => onSeek(Math.max(0, Math.min(durationMs, Number(e.target.value) * 1000)))}
            />
          </label>
        </div>
        <div className="vfx-add-kinds">
          {VFX_FORGE_SEGMENT_KINDS.map((kind) => <button type="button" key={kind} onClick={() => onAddKind(kind)}>+ {kind}</button>)}
        </div>
      </header>
      <input
        className="vfx-scrubber"
        type="range"
        min={0}
        max={durationMs}
        step={1000 / 60}
        value={Math.min(durationMs, playheadMs)}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <div className="vfx-ruler">
        {cues.map((cue, i) => (
          <span key={`${cue.on}-${cue.strikeIndex ?? 0}-${i}`} style={{ left: `${(cue.atMs / durationMs) * 100}%` }} title={`${cue.label} ${(cue.atMs / 1000).toFixed(2)}s`} />
        ))}
      </div>
      <div className="vfx-tracks">
        {script.segments.map((seg, i) => {
          const occurrences = times.filter((x) => x.segmentIndex === i);
          return (
            <button type="button" className={`vfx-track${selected === i ? " active" : ""}`} key={`${i}-${seg.kind}`} onClick={() => onSelect(i)}>
              <b>{i + 1}. {seg.kind}</b>
              <small>{seg.on}{seg.strikeIndex ? ` #${seg.strikeIndex}` : ""} · +{seg.atMs ?? 0}ms</small>
              <span className="vfx-track-line">
                {occurrences.map((at, n) => <i key={n} style={{ left: `${(at.atMs / durationMs) * 100}%` }} title={at.label} />)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

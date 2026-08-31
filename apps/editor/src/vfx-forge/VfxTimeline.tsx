import type { VfxScriptDoc, VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import { decodeAssetDrag, segmentTimes, type AssetDrop, type TriggerCue } from "./model";

const KINDS: VfxScriptSegment["kind"][] = [
  "modelFx", "vfx", "floatingText", "screenFlash", "screenShake", "sound", "anim", "hideBody",
];

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
          <button type="button" onClick={onTogglePlay}>{playing ? "❚❚" : "▶"}</button>
          <strong>{(playheadMs / 1000).toFixed(2)}s</strong>
        </div>
        <div className="vfx-add-kinds">
          {KINDS.map((kind) => <button type="button" key={kind} onClick={() => onAddKind(kind)}>+ {kind}</button>)}
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

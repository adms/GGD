import type { VfxScriptDoc, VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import type { AnimPulse } from "@ggd/shared/content/animPulse";
import {
  VFX_FORGE_SEGMENT_KINDS,
  decodeAssetDrag,
  recommendedEvidenceTimes,
  segmentTimes,
  type AssetDrop,
  type TriggerCue,
} from "./model";

const ACTOR_LABEL = { caster: "施法者", target: "目標" } as const;
const PULSE_LABEL = {
  attack: "攻擊",
  cast: "施法",
  hurt: "受擊",
  guard: "格擋",
  dodge: "迴避",
} as const satisfies Record<AnimPulse, string>;
export const SEGMENT_KIND_LABEL = {
  modelFx: "3D 模型特效",
  vfx: "粒子特效",
  floatingText: "浮動文字",
  screenFlash: "畫面閃光",
  screenShake: "鏡頭震動",
  sound: "音效",
  anim: "角色動作",
  bodyMove: "角色位移",
  hideBody: "隱藏角色",
} as const satisfies Record<VfxScriptSegment["kind"], string>;

const TRIGGER_LABEL = {
  castStart: "施法起手",
  castEffect: "技能結算",
  strike: "連段傷害",
  projectileSpawn: "投射物生成",
  projectileHit: "投射物命中",
  reflectSuccess: "反彈成功",
} as const satisfies Record<VfxScriptSegment["on"], string>;

export function segmentTriggerSummary(segment: VfxScriptSegment): string {
  if (segment.on === "strike") {
    return segment.strikeIndex === undefined ? "每段傷害" : `第 ${segment.strikeIndex} 段傷害`;
  }
  return TRIGGER_LABEL[segment.on];
}

/** Human-readable track identity; authors must not open JSON to distinguish two actor rows. */
export function segmentTrackSummary(segment: VfxScriptSegment): string {
  switch (segment.kind) {
    case "anim":
      return `角色動作 · ${ACTOR_LABEL[segment.at ?? "target"]}${PULSE_LABEL[segment.pulse]}`;
    case "bodyMove":
      return `角色位移 · ${ACTOR_LABEL[segment.at ?? "caster"]}${segment.mode === "arc" ? "弧線" : "瞬移"}`;
    case "hideBody":
      return `隱藏角色 · ${ACTOR_LABEL[segment.at ?? "caster"]}`;
    case "vfx":
      return `粒子特效 · ${segment.vfxId}`;
    case "modelFx":
      return `3D 模型特效 · ${segment.modelKey}`;
    case "floatingText":
      return `浮動文字 · ${segment.text}`;
    case "screenFlash":
      return "畫面閃光";
    case "screenShake":
      return "鏡頭震動";
    case "sound":
      return `音效 · ${segment.soundKey}`;
  }
}

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
  const evidenceTimes = recommendedEvidenceTimes(script, cues);
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
          {VFX_FORGE_SEGMENT_KINDS.map((kind) => (
            <button
              type="button"
              key={kind}
              data-kind={kind}
              title={`新增 ${SEGMENT_KIND_LABEL[kind]}（${kind}）`}
              onClick={() => onAddKind(kind)}
            >
              + {SEGMENT_KIND_LABEL[kind]}
            </button>
          ))}
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
      <div className="vfx-keyframes" aria-label="建議關鍵格">
        <span>建議關鍵格</span>
        {evidenceTimes.map((time) => (
          <button
            type="button"
            key={`${time.atMs}:${time.label}`}
            title={time.label}
            onClick={() => onSeek(time.atMs)}
          >
            {(time.atMs / 1000).toFixed(3)}s
          </button>
        ))}
      </div>
      <div className="vfx-tracks">
        {script.segments.map((seg, i) => {
          const occurrences = times.filter((x) => x.segmentIndex === i);
          return (
            <button type="button" className={`vfx-track${selected === i ? " active" : ""}`} key={`${i}-${seg.kind}`} onClick={() => onSelect(i)}>
              <b>{i + 1}. {segmentTrackSummary(seg)}</b>
              <small title={`on:${seg.on}`}>{segmentTriggerSummary(seg)} · +{seg.atMs ?? 0}ms</small>
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

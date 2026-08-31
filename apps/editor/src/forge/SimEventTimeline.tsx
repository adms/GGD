import { useMemo } from "react";
import {
  simTimelineEventSummary,
  simTimelineEventsAt,
  type SimTimelineEvent,
} from "./simTimeline";

const SIM_TICK_MS = 1000 / 30;
const FRAME_MS = 1000 / 60;

/**
 * Controlled timeline shared with the Babylon stage. Scrubbing, playback and
 * frame stepping therefore move the real 3D replay, not a second data-only
 * cursor that can drift away from what the author sees.
 */
export function SimEventTimeline({
  events,
  durationMs,
  playheadMs,
  playing,
  onSeek,
  onTogglePlay,
}: {
  events: readonly SimTimelineEvent[];
  durationMs: number;
  playheadMs: number;
  playing: boolean;
  onSeek(ms: number): void;
  onTogglePlay(): void;
}) {
  const boundedDuration = Math.max(FRAME_MS, durationMs);
  const boundedPlayhead = Math.max(0, Math.min(boundedDuration, playheadMs));
  const simTick = Math.max(0, Math.round(boundedPlayhead / SIM_TICK_MS));
  const current = useMemo(() => simTimelineEventsAt(events, simTick), [events, simTick]);
  const step = (frames: number): void => {
    onSeek(Math.max(0, Math.min(boundedDuration, boundedPlayhead + frames * FRAME_MS)));
  };

  return (
    <section className="forge-sim-timeline" aria-label="真 Sim 與 3D 共用時間軸">
      <header>
        <div>
          <h4>真 Sim × 3D 共用時間軸</h4>
          <p className="forge-note">只播放 SimWorld 真正 emit 的事件；scrub、1/60 逐格與畫面使用同一個 playhead。</p>
        </div>
        <strong>{boundedPlayhead.toFixed(0)}ms · Sim tick {simTick}</strong>
      </header>
      <div className="forge-sim-controls">
        <button type="button" onClick={() => onSeek(0)}>↺</button>
        <button type="button" onClick={() => step(-1)} disabled={boundedPlayhead <= 0}>−1 frame</button>
        <button
          type="button"
          onClick={() => {
            if (boundedPlayhead >= boundedDuration) onSeek(0);
            onTogglePlay();
          }}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button type="button" onClick={() => step(1)} disabled={boundedPlayhead >= boundedDuration}>+1 frame</button>
        <input
          type="range"
          min={0}
          max={boundedDuration}
          step={FRAME_MS}
          value={boundedPlayhead}
          aria-label="Sim 與 3D 播放位置"
          onChange={(event) => onSeek(Number(event.target.value))}
        />
      </div>
      <div className="forge-sim-ruler" aria-label="事件分布">
        {events.map((event, index) => {
          const atMs = event.tick * SIM_TICK_MS;
          return (
            <span
              key={`${event.tick}-${event.type}-${index}`}
              className={event.tick === simTick ? "active" : atMs < boundedPlayhead ? "past" : ""}
              style={{ left: `${Math.min(100, (atMs / boundedDuration) * 100)}%` }}
              title={`${atMs.toFixed(0)}ms · ${event.type} · ${simTimelineEventSummary(event)}`}
            />
          );
        })}
      </div>
      <div className="forge-sim-current" aria-live="polite">
        {current.length === 0 ? <span>這一個 Sim tick 沒有事件</span> : current.map((event, index) => (
          <article key={`${event.type}-${index}`}>
            <b>{event.type}</b>
            <code>{simTimelineEventSummary(event)}</code>
          </article>
        ))}
      </div>
      <details>
        <summary>全部 {events.length} 筆事件</summary>
        <ol className="forge-sim-event-list">
          {events.map((event, index) => (
            <li key={`${event.tick}-${event.type}-${index}`} className={event.tick === simTick ? "active" : ""}>
              <button type="button" onClick={() => onSeek(event.tick * SIM_TICK_MS)}>
                <code>{event.tick}</code> <b>{event.type}</b> {simTimelineEventSummary(event)}
              </button>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

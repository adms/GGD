import { useEffect, useMemo, useState } from "react";
import {
  simTimelineEventSummary,
  simTimelineEventsAt,
  simTimelineMaxTick,
  type SimTimelineEvent,
} from "./simTimeline";

const SIM_TICKS_PER_SECOND = 30;

export function SimEventTimeline({ events }: { events: readonly SimTimelineEvent[] }) {
  const maxTick = useMemo(() => simTimelineMaxTick(events), [events]);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setPlayhead(0);
    setPlaying(false);
  }, [events]);

  useEffect(() => {
    if (!playing) return;
    const timer = globalThis.setInterval(() => {
      setPlayhead((tick) => {
        if (tick >= maxTick) {
          setPlaying(false);
          return maxTick;
        }
        return tick + 1;
      });
    }, 1000 / SIM_TICKS_PER_SECOND);
    return () => globalThis.clearInterval(timer);
  }, [maxTick, playing]);

  const current = useMemo(() => simTimelineEventsAt(events, playhead), [events, playhead]);
  const step = (delta: number): void => {
    setPlaying(false);
    setPlayhead((tick) => Math.max(0, Math.min(maxTick, tick + delta)));
  };

  return (
    <section className="forge-sim-timeline" aria-label="真 Sim 事件時間軸">
      <header>
        <div>
          <h4>真 Sim 事件時間軸</h4>
          <p className="forge-note">只顯示 SimWorld 真正 emit 的事件；目前是資料 scrub，3D 場景倒帶仍等共用 render bridge。</p>
        </div>
        <strong>{playhead} tick · {(playhead / SIM_TICKS_PER_SECOND).toFixed(2)}s</strong>
      </header>
      <div className="forge-sim-controls">
        <button type="button" onClick={() => { setPlaying(false); setPlayhead(0); }}>↺</button>
        <button type="button" onClick={() => step(-1)} disabled={playhead <= 0}>−1 tick</button>
        <button
          type="button"
          onClick={() => {
            if (playhead >= maxTick) setPlayhead(0);
            setPlaying((value) => !value);
          }}
          disabled={maxTick <= 0}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button type="button" onClick={() => step(1)} disabled={playhead >= maxTick}>+1 tick</button>
        <input
          type="range"
          min={0}
          max={Math.max(1, maxTick)}
          step={1}
          value={playhead}
          aria-label="Sim 事件播放位置"
          onChange={(event) => { setPlaying(false); setPlayhead(Number(event.target.value)); }}
        />
      </div>
      <div className="forge-sim-ruler" aria-label="事件分布">
        {events.map((event, index) => (
          <span
            key={`${event.tick}-${event.type}-${index}`}
            className={event.tick === playhead ? "active" : event.tick < playhead ? "past" : ""}
            style={{ left: `${maxTick === 0 ? 0 : (event.tick / maxTick) * 100}%` }}
            title={`${event.tick} · ${event.type} · ${simTimelineEventSummary(event)}`}
          />
        ))}
      </div>
      <div className="forge-sim-current" aria-live="polite">
        {current.length === 0 ? <span>這一 tick 沒有事件</span> : current.map((event, index) => (
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
            <li key={`${event.tick}-${event.type}-${index}`} className={event.tick === playhead ? "active" : ""}>
              <button type="button" onClick={() => { setPlaying(false); setPlayhead(event.tick); }}>
                <code>{event.tick}</code> <b>{event.type}</b> {simTimelineEventSummary(event)}
              </button>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

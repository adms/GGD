/**
 * ReplayControls (task #175) — the transport bar the owner uses to diagnose a
 * playtest. It gives him what he actually needs and the task names explicitly:
 * play/pause, a seek bar (drag to any tick), speed control, and 「跳到第 N 回合」.
 * A replay he cannot scrub is a video, and he can already record his screen.
 *
 * THE DIVERGENCE ALARM lives here too, as a full-bleed red banner. When the
 * server reports a mismatch the overlay STOPS being a transport bar and becomes
 * the alarm: it names the tick, shows the expected/actual digests, and states
 * the most likely cause in 繁體中文. There is no "dismiss and keep watching" —
 * everything after a divergence is a match that never happened.
 */
import { useEffect, useMemo, useRef } from "react";
import type { Room } from "colyseus.js";
import type { MatchState } from "@ggd/shared/protocol/schema";
import {
  REPLAY_MSG,
  type ReplayControlAction,
  type ReplayDivergedMessage,
  type ReplayRefusedMessage,
  type ReplayStatusMessage,
} from "@ggd/shared/protocol/replay";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, GOLD } from "../theme";
import { replayStore, useReplayStore } from "./replayStore";

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;

/** Bind a replay room's messages into the store; returns an unsubscribe. */
export function bindReplayRoom(room: Room<MatchState>): () => void {
  replayStore.getState().reset();
  const offStatus = room.onMessage(REPLAY_MSG.STATUS, (m: ReplayStatusMessage) =>
    replayStore.getState().setStatus(m),
  );
  const offRefused = room.onMessage(REPLAY_MSG.REFUSED, (m: ReplayRefusedMessage) =>
    replayStore.getState().setRefused(m),
  );
  const offDiverged = room.onMessage(REPLAY_MSG.DIVERGED, (m: ReplayDivergedMessage) =>
    replayStore.getState().setDiverged(m),
  );
  return () => {
    offStatus?.();
    offRefused?.();
    offDiverged?.();
  };
}

function send(room: Room<MatchState> | null, action: ReplayControlAction): void {
  room?.send(REPLAY_MSG.CONTROL, action);
}

function fmtClock(tick: number): string {
  const sec = Math.floor(tick / 30);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function ReplayControls({ room }: { room: Room<MatchState> | null }): React.JSX.Element | null {
  const status = useReplayStore((s) => s.status);
  const refused = useReplayStore((s) => s.refused);
  const diverged = useReplayStore((s) => s.diverged);
  const seekBusy = useRef(false);

  // Local seek state so dragging the bar is smooth (commit on release).
  const combatRounds = useMemo(
    () => (status ? [...new Set(status.rounds.filter((r) => r.phase === "intermission").map((r) => r.round))] : []),
    [status],
  );

  useEffect(() => {
    seekBusy.current = status?.seeking ?? false;
  }, [status?.seeking]);

  // REFUSED — the recording cannot be played on this build. This is a first
  // class outcome, not an error: name why, and offer nothing else.
  if (refused) {
    return (
      <Banner tone="warn" title="⚠ 無法播放這份回放">
        {refused.message}
        {refused.expected && (
          <div style={{ marginTop: 6, color: TEXT_DIM, fontSize: 12 }}>
            錄製：{refused.expected}　目前：{refused.actual ?? "—"}
          </div>
        )}
      </Banner>
    );
  }

  return (
    <>
      {diverged && (
        <Banner tone="alarm" title={`■ 回放與錄影不一致 — 已於第 ${diverged.tick} 幀停止`}>
          {diverged.message}
          <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 12, color: TEXT_DIM }}>
            {diverged.kind === "sim" ? "模擬" : "主控"} digest
            expected {diverged.kind === "sim" ? diverged.expectedWorld : diverged.expectedHost}　/　actual{" "}
            {diverged.kind === "sim" ? diverged.actualWorld : diverged.actualHost}
          </div>
        </Banner>
      )}
      {status && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 18,
            transform: "translateX(-50%)",
            zIndex: 40,
            width: "min(760px, 94vw)",
            background: PANEL_BG,
            border: PANEL_BORDER,
            borderRadius: 12,
            padding: "10px 14px",
            color: TEXT_MAIN,
            backdropFilter: "blur(6px)",
            pointerEvents: diverged ? "none" : "auto",
            opacity: diverged ? 0.5 : 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => send(room, { action: status.playing ? "pause" : "play" })}
              disabled={status.finished || !!diverged}
              style={btn(status.playing)}
              aria-label={status.playing ? "暫停" : "播放"}
            >
              {status.finished ? "▮▮" : status.playing ? "❚❚" : "►"}
            </button>
            <button onClick={() => send(room, { action: "restart" })} style={btn(false)} aria-label="從頭">
              ↺
            </button>
            <span style={{ fontFamily: "monospace", fontSize: 13, minWidth: 96 }}>
              {fmtClock(status.tick)} / {fmtClock(status.lastTick)}
            </span>
            <input
              type="range"
              min={0}
              max={status.lastTick}
              value={status.tick}
              onChange={(e) => send(room, { action: "seekTick", tick: Number(e.target.value) })}
              disabled={status.seeking}
              style={{ flex: 1, accentColor: GOLD }}
              aria-label="時間軸"
            />
            {status.seeking && <span style={{ fontSize: 12, color: TEXT_DIM }}>快轉中…</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: TEXT_DIM }}>速度</span>
            {SPEEDS.map((sp) => (
              <button
                key={sp}
                onClick={() => send(room, { action: "speed", speed: sp })}
                style={chip(status.speed === sp)}
              >
                {sp}×
              </button>
            ))}
            <span style={{ width: 1, height: 16, background: "rgba(120,140,190,.3)", margin: "0 4px" }} />
            <span style={{ fontSize: 12, color: TEXT_DIM }}>回合</span>
            {combatRounds.map((r) => (
              <button key={r} onClick={() => send(room, { action: "seekRound", round: r })} style={chip(false)}>
                第 {r} 場
              </button>
            ))}
            {status.truncated && (
              <span style={{ fontSize: 12, color: "#e0a13a", marginLeft: "auto" }}>錄影不完整（伺服器中途結束）</span>
            )}
            {status.finished && !diverged && (
              <span style={{ fontSize: 12, color: "#47cc6a", marginLeft: "auto" }}>✓ 已驗證：整場逐幀吻合</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "warn" | "alarm";
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const bg = tone === "alarm" ? "rgba(120, 20, 24, 0.96)" : "rgba(80, 60, 12, 0.96)";
  const border = tone === "alarm" ? "1px solid #e5483f" : "1px solid #e0a13a";
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        width: "min(720px, 94vw)",
        background: bg,
        border,
        borderRadius: 10,
        padding: "12px 16px",
        color: "#fff",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function btn(active: boolean): React.CSSProperties {
  return {
    width: 40,
    height: 34,
    borderRadius: 8,
    border: PANEL_BORDER,
    background: active ? "rgba(242, 198, 55, 0.18)" : "rgba(255,255,255,0.05)",
    color: TEXT_MAIN,
    fontSize: 15,
    cursor: "pointer",
  };
}
function chip(active: boolean): React.CSSProperties {
  return {
    padding: "3px 9px",
    borderRadius: 999,
    border: active ? "1px solid #f2c637" : PANEL_BORDER,
    background: active ? "rgba(242, 198, 55, 0.18)" : "transparent",
    color: active ? GOLD : TEXT_MAIN,
    fontSize: 12,
    cursor: "pointer",
  };
}

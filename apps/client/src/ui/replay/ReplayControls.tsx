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
 *
 * ⭐ GH#114 —— 這一列的控制項全部要有音訊回饋，⛔ 沒有「內部頁」豁免。
 *
 * 上一輪把回放頁歸類成「內部工具」而跳過它，那是判錯：`ui/GlobalChrome.tsx` 的
 * 檔頭自己寫著「That page is not a corner: it is THE page the owner screenshots
 * for playtest feedback.」—— 同一個理由讓 #14 的音訊開關與 #66 的版本徽章被補進
 * 這棵樹，同一個理由讓 transport 屬於**玩家面前**那一桶。
 *
 * ⛔ 所以這個檔案裡不可以再出現裸的 `<button>`：一律走 `ui/SfxButton`
 * （drop-in，hover→uiHoverCyber、click→uiClick、press-scale + ripple，
 * 而且 forward 全部 button props）。守衛 `replayTransportSfx.test.ts` 掃這個檔，
 * 裸 `<button` 一顆就紅。
 *
 * ⚠️ 拉桿（`<input type="range">`）換不成 `SfxButton`，所以它**手動**接：
 * hover 用**素的** `uiHover` 滴答（`buttonSfx` 檔頭：賽博殘響留給按鈕、其他欄位
 * 元件用素的那顆），而放開才出聲 —— `onChange` 在拖曳中每一格都會送一次 seek，
 * 掛在那上面等於一串機關槍。
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
import { audioSystem } from "../../audio";
import { SfxButton } from "../SfxButton";
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
            <SfxButton
              onClick={() => send(room, { action: status.playing ? "pause" : "play" })}
              disabled={status.finished || !!diverged}
              style={btn(status.playing)}
              aria-label={status.playing ? "暫停" : "播放"}
              // 播/停是一顆開關,不是一次確認 → uiToggle(SfxButton 的 clickSfx
              // 覆寫,⛔ 不是疊在 uiClick 上面)
              clickSfx="uiToggle"
            >
              {status.finished ? "▮▮" : status.playing ? "❚❚" : "►"}
            </SfxButton>
            <SfxButton onClick={() => send(room, { action: "restart" })} style={btn(false)} aria-label="從頭">
              ↺
            </SfxButton>
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
              // ⛔ 不掛在 onChange 上:拖曳中每一格都會觸發一次
              onPointerEnter={() => audioSystem.playSfx("uiHover")}
              onPointerUp={() => {
                audioSystem.unlock(); // 第一次真實手勢解鎖 autoplay,同 buttonSfx
                audioSystem.playSfx("uiClick");
              }}
              onKeyUp={() => audioSystem.playSfx("uiClick")}
              style={{ flex: 1, accentColor: GOLD }}
              aria-label="時間軸"
            />
            {status.seeking && <span style={{ fontSize: 12, color: TEXT_DIM }}>快轉中…</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: TEXT_DIM }}>速度</span>
            {SPEEDS.map((sp) => (
              <SfxButton
                key={sp}
                onClick={() => send(room, { action: "speed", speed: sp })}
                style={chip(status.speed === sp)}
                // 一排互斥的段落選擇 → uiTabSwitch(同 buttonSfx 對 segmented
                // control 的約定),⛔ 不是通用的 click 嗶聲
                clickSfx="uiTabSwitch"
                aria-pressed={status.speed === sp}
              >
                {sp}×
              </SfxButton>
            ))}
            <span style={{ width: 1, height: 16, background: "rgba(120,140,190,.3)", margin: "0 4px" }} />
            <span style={{ fontSize: 12, color: TEXT_DIM }}>回合</span>
            {combatRounds.map((r) => (
              <SfxButton key={r} onClick={() => send(room, { action: "seekRound", round: r })} style={chip(false)}>
                第 {r} 場
              </SfxButton>
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

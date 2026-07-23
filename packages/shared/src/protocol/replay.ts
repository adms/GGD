/**
 * The replay-viewer wire protocol (task #175).
 *
 * A recorded match is played back by RE-RUNNING it on the server and projecting
 * the result into the ordinary `MatchState` schema, so the client renders a
 * replay with the same renderer, the same interpolation buffer and the same HUD
 * it uses for a live match. Only these few control/status messages are new;
 * everything a viewer sees rides the channels that already existed.
 */

export const REPLAY_MSG = {
  /** viewer -> server: transport controls */
  CONTROL: "replayControl",
  /** server -> viewer: playback position + rate + the recording's identity */
  STATUS: "replayStatus",
  /** server -> viewer: this recording cannot be played on this build, and why */
  REFUSED: "replayRefused",
  /** server -> viewer: the replay disagreed with what was recorded; STOPPED */
  DIVERGED: "replayDiverged",
} as const;

export type ReplayControlAction =
  | { action: "play" }
  | { action: "pause" }
  /** 0.25 .. 8; the server clamps. */
  | { action: "speed"; speed: number }
  | { action: "seekTick"; tick: number }
  /** Jump to the start of a round's intermission (the shop beat before it). */
  | { action: "seekRound"; round: number }
  | { action: "restart" };

/** A phase/round boundary, so the viewer can offer 「跳到第 N 回合」. */
export interface ReplayRoundMarker {
  tick: number;
  phase: string;
  round: number;
}

export interface ReplayStatusMessage {
  matchId: string;
  /** Wall-clock start of the ORIGINAL match, not of this playback. */
  startedAt: string;
  tick: number;
  /** Last tick the recording carries; the seek bar's right edge. */
  lastTick: number;
  playing: boolean;
  speed: number;
  /** True while a seek is fast-forwarding (the viewer shows a spinner). */
  seeking: boolean;
  /** True once playback reached the end of the recording without diverging. */
  finished: boolean;
  /** The recording was cut short (server died mid-match); it is still playable. */
  truncated: boolean;
  rounds: ReplayRoundMarker[];
  contentVersion: string;
  buildStamp: string;
  seats: { seatId: number; teamId: number; displayName: string; isBot: boolean }[];
}

export interface ReplayRefusedMessage {
  code: string;
  /** 繁體中文, shown verbatim. */
  message: string;
  expected?: string;
  actual?: string;
}

export interface ReplayDivergedMessage {
  tick: number;
  kind: "sim" | "host";
  expectedWorld: number;
  actualWorld: number;
  expectedHost: number;
  actualHost: number;
  /** 繁體中文 explanation naming the most likely cause. */
  message: string;
}

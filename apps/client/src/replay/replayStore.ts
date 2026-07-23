/**
 * Replay viewer state (task #175) — a tiny store the ReplayControls overlay
 * subscribes to. It mirrors the server's ReplayStatus / Diverged / Refused
 * messages so the transport bar and the divergence alarm are pure functions of
 * it. Deliberately separate from the HUD store (RoomStore): a replay reuses the
 * whole match renderer, but its CONTROLS are their own concern.
 */
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type {
  ReplayDivergedMessage,
  ReplayRefusedMessage,
  ReplayStatusMessage,
} from "@ggd/shared/protocol/replay";

export interface ReplayViewState {
  /** null until the first status arrives (or a refusal replaces it). */
  status: ReplayStatusMessage | null;
  /** Set when the recording cannot be played on this build — playback never starts. */
  refused: ReplayRefusedMessage | null;
  /** Set on the first digest disagreement — playback has STOPPED here. */
  diverged: ReplayDivergedMessage | null;
  setStatus(s: ReplayStatusMessage): void;
  setRefused(r: ReplayRefusedMessage): void;
  setDiverged(d: ReplayDivergedMessage): void;
  reset(): void;
}

export const replayStore = createStore<ReplayViewState>((set) => ({
  status: null,
  refused: null,
  diverged: null,
  setStatus: (status) => set({ status }),
  setRefused: (refused) => set({ refused }),
  setDiverged: (diverged) => set({ diverged }),
  reset: () => set({ status: null, refused: null, diverged: null }),
}));

export function useReplayStore<T>(selector: (s: ReplayViewState) => T): T {
  return useStore(replayStore, selector);
}

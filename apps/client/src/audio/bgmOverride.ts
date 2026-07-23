/**
 * audio/bgmOverride — a tiny framework-free registry of "a screen wants THIS
 * background bed while it is on screen" requests (task #134).
 *
 * WHY IT EXISTS. The `AudioDirector` owns the ONE bed and computes the scene as
 * a pure function of discrete store state (auth→menu, lobby, room, match phases
 * …). But the ranked ladder is not a store `screen` of its own — it is a panel
 * that lives inside the lobby — so there is no discrete projection for "the
 * leaderboard is showing". Rather than teach the pure scene mapping about a UI
 * panel, the panel DECLARES its wish here on mount and drops it on unmount, and
 * the director layers the most-recent live wish over whatever it computed. The
 * bed the ladder asked for (`menuNocturne`, the serene nocturne that used to be
 * the login screen's second theme) plays while it is up, and the previous bed
 * returns the moment it leaves.
 *
 * WHY A REGISTRY AND NOT `playBgm` FROM THE PANEL. `playBgm` must have exactly
 * ONE caller or two effects fight over the crossfade. This keeps the director
 * the single writer — a screen only states intent, never touches the mixer.
 *
 * Ref-counted by a unique token so a StrictMode double-mount, or two screens
 * asking at once, resolve deterministically (last request wins) and a single
 * unmount can never strand the override. Pub/sub over an immutable snapshot,
 * same shape as audioSettings; ui/useAudio adapts it to React via
 * useSyncExternalStore. No React, no WebAudio here.
 */
import type { AudioScene } from "./types";

interface OverrideEntry {
  token: number;
  scene: AudioScene;
}

export class BgmOverrideStore {
  private stack: OverrideEntry[] = [];
  private nextToken = 1;
  private readonly listeners = new Set<() => void>();

  /** Declare a bed to play while the caller is mounted; returns its release token. */
  request(scene: AudioScene): number {
    const token = this.nextToken++;
    this.stack = [...this.stack, { token, scene }];
    this.emit();
    return token;
  }

  /** Drop a previously-requested override. Idempotent — an unknown token no-ops. */
  release(token: number): void {
    const next = this.stack.filter((e) => e.token !== token);
    if (next.length === this.stack.length) return;
    this.stack = next;
    this.emit();
  }

  /** The bed the most-recent live override asks for, or null if none is active. */
  current(): AudioScene | null {
    const top = this.stack[this.stack.length - 1];
    return top ? top.scene : null;
  }

  /** Subscribe to any change; returns an unsubscriber. */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }
}

/** Process-wide override registry — written by mounted screens, read by AudioDirector. */
export const bgmOverride = new BgmOverrideStore();

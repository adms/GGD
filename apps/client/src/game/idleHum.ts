/**
 * 🎵 閒置哼歌的 latch（從 GameApp 抽出 —— `gameAppSplit.test.ts` 的 4,000 行線）。
 *
 * Roll the idle "hum" line once the LOCAL player has been silent for
 * `HUM_IDLE_MS`. The idle latch is the real gate; the per-category cooldown
 * (20 s) + low prob keep it from chattering between fights. Client-only, and
 * the shared throttle/de-dup layer still applies inside `playContextualVoice`.
 *
 * ⭐ Re-arm the latch to nowMs whether or not the roll fires, so a blocked
 * roll waits another full idle window instead of retrying every frame.
 */
import { playContextualVoice } from "../audio/contextualVoice";
import { championIdForEntity } from "./gameAppQueries";
import { HUM_IDLE_MS } from "./gameAppTypes";

export class IdleHum {
  private lastActivityMs = -Infinity;

  /** Mark the local player active NOW, resetting the idle latch (voice §三). */
  noteActivity(): void {
    this.lastActivityMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  tick(nowMs: number, localId: number | null): void {
    if (localId === null) return;
    if (nowMs - this.lastActivityMs < HUM_IDLE_MS) return;
    const champ = championIdForEntity(localId);
    if (!champ) return;
    this.lastActivityMs = nowMs;
    playContextualVoice(champ, "hum");
  }
}

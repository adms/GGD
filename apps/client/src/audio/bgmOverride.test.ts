/**
 * audio/bgmOverride — the "a mounted screen wants this bed" registry (task #134),
 * and the wiring that makes the ranked ladder play the serene `menuNocturne`.
 *
 * The registry is pure/observable, so its ref-counting is unit-tested directly.
 * The React wiring (LeaderboardPanel declares the wish, AudioDirector prefers it
 * over the derived scene) lives in .tsx files that the node test env cannot
 * render, so it is pinned by a file-scan in the spirit of architecture.test.ts /
 * ranking.test.ts — the same way the rest of the ranked-ladder panel is gated.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { BgmOverrideStore, bgmOverride } from "./bgmOverride";

const read = (rel: string): string => readFileSync(join(__dirname, "..", rel), "utf8");

describe("bgmOverride registry", () => {
  it("is empty until something requests a bed", () => {
    const s = new BgmOverrideStore();
    expect(s.current()).toBeNull();
  });

  it("a request becomes the active bed; releasing it clears back to null", () => {
    const s = new BgmOverrideStore();
    const token = s.request("menuNocturne");
    expect(s.current()).toBe("menuNocturne");
    s.release(token);
    expect(s.current()).toBeNull();
  });

  it("is ref-counted, last-request-wins, and unwinds in order", () => {
    const s = new BgmOverrideStore();
    const a = s.request("lobby");
    const b = s.request("menuNocturne");
    // the most-recent live request is the active bed
    expect(s.current()).toBe("menuNocturne");
    s.release(b);
    // dropping the top uncovers the one beneath it, never strands the override
    expect(s.current()).toBe("lobby");
    s.release(a);
    expect(s.current()).toBeNull();
  });

  it("a release is idempotent and an unknown token is a no-op", () => {
    const s = new BgmOverrideStore();
    const token = s.request("menuNocturne");
    s.release(token);
    s.release(token); // double release
    s.release(999); // never issued
    expect(s.current()).toBeNull();
  });

  it("notifies subscribers on every change, and stops after unsubscribe", () => {
    const s = new BgmOverrideStore();
    let hits = 0;
    const off = s.subscribe(() => {
      hits++;
    });
    const token = s.request("menuNocturne");
    s.release(token);
    expect(hits).toBe(2);
    off();
    s.request("lobby");
    expect(hits).toBe(2); // no more notifications after unsubscribe
  });

  it("exposes a process-wide singleton for the hooks to share", () => {
    expect(bgmOverride).toBeInstanceOf(BgmOverrideStore);
  });
});

describe("ranked ladder → menuNocturne wiring (task #134)", () => {
  it("the leaderboard declares the serene bed and the director prefers it", () => {
    cover("rank-ui-nocturne-bgm");

    // 1. the ranked-ladder panel can ask for the nocturne — but only when it is
    //    told it OWNS the bed. It used to ask unconditionally, and because the
    //    panel is a permanent 280px column of the lobby (LobbyScreen), that
    //    override was live for the whole time the player sat in the lobby and
    //    `lobby.mp3` could never be heard. The bed is opt-in now.
    const panel = read("ui/platform/LeaderboardPanel.tsx");
    expect(panel).toContain("useBgmSceneOverride");
    expect(panel).toMatch(/useBgmSceneOverride\(\s*ownsBgm\s*\?\s*["']menuNocturne["']\s*:\s*null\s*\)/);
    expect(panel).toMatch(/ownsBgm\s*=\s*false/); // default OFF

    // 2. useAudio exposes the mount-scoped request + the director's reader
    const useAudio = read("ui/useAudio.ts");
    expect(useAudio).toContain("export function useBgmSceneOverride");
    expect(useAudio).toContain("export function useBgmOverride");
    expect(useAudio).toContain("bgmOverride.request");
    expect(useAudio).toContain("bgmOverride.release");

    // 3. the AudioDirector layers the override OVER its derived scene
    const director = read("ui/AudioDirector.tsx");
    expect(director).toContain("useBgmOverride");
    expect(director).toMatch(/override\s*\?\?/);
  });

  it("REGRESSION: the lobby's embedded ladder does not hijack the lobby bed", () => {
    cover("rank-ui-nocturne-bgm-lobby");

    // The bug this pins: LobbyScreen mounts <LeaderboardPanel /> as a permanent
    // side column. While that panel requested the nocturne unconditionally, the
    // override outranked the derived scene (`override ?? derivedScene`) for the
    // player's entire time in the lobby — so `lobby` resolved correctly in
    // sceneForPlatform, bound correctly in audio-map.json, and was still never
    // audible. A correctly wired track that no player could ever hear.
    const lobby = read("ui/platform/LobbyScreen.tsx");
    expect(lobby).toContain("<LeaderboardPanel");
    expect(lobby).not.toMatch(/<LeaderboardPanel[^/>]*ownsBgm/);

    // And the lobby bed it must not be stealing is a real, distinct track.
    const map = JSON.parse(read("../../../content/config/audio-map.json")) as {
      bgm: Record<string, { file: string }>;
    };
    expect(map.bgm.lobby?.file).toBe("assets/audio/bgm/lobby.mp3");
    expect(map.bgm.menuNocturne?.file).toBe("assets/audio/bgm/menuNocturne.mp3");
    expect(map.bgm.lobby?.file).not.toBe(map.bgm.menuNocturne?.file);
  });
});

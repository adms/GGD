/**
 * GH#531 — every arena a player can actually be dropped into has its own battle
 * theme, and the audio-map's `mapBgm` really resolves to a real file.
 *
 * WHY THIS GATE EXISTS. `mapBgm` is deliberately OPEN and OPTIONAL: an arena
 * with no entry falls back to the shared `combat` bed rather than going silent,
 * because a missing track must never be able to mute a match. That fallback is
 * safe and invisible — which is the problem. Ship arena #14 without music and
 * nothing anywhere goes red; players just quietly hear the old shared bed on a
 * map that was supposed to have its own. This test is the thing that notices.
 *
 * ⚠️ It reads the arena POOL, not the maps directory: `config.arena-pool@1` is
 * what `pickRoundArena()` actually draws from, plus the `finale` that sits
 * deliberately outside the rotation. A `content/maps/*.json` that nothing puts
 * in the pool is unreachable, and demanding music for it would be a false red.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, statSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { zConfigAudioMapDoc } from "./schema/config";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../..", "content");

const read = (p: string) => JSON.parse(readFileSync(join(CONTENT, p), "utf8"));

describe("mapBgm covers the arena pool (GH#531)", () => {
  const pool = read("config/arena-pool.json") as { rotation: string[]; finale: string };
  const doc = zConfigAudioMapDoc.parse(read("config/audio-map.json"));
  const playable = [...pool.rotation, pool.finale];

  it("gives every playable arena its own battle theme", () => {
    cover("map-bgm-covers-pool");
    const missing = playable.filter((a) => !doc.mapBgm?.[a]);
    expect(missing, `這些場地玩得到卻沒有專屬 BGM（會靜默退回共用 combat）: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("binds no theme to an arena nobody can be dropped into", () => {
    const orphans = Object.keys(doc.mapBgm ?? {}).filter((a) => !playable.includes(a));
    expect(orphans, `這些 BGM 綁到不在池子裡的場地,玩家一輩子聽不到: ${orphans.join(", ")}`)
      .toEqual([]);
  });

  it("resolves every theme to a real, non-empty, looping file", () => {
    for (const [arena, t] of Object.entries(doc.mapBgm ?? {})) {
      const abs = join(CONTENT, t.file);
      expect(existsSync(abs), `${arena} -> ${t.file} 不存在`).toBe(true);
      expect(statSync(abs).size, `${arena} -> ${t.file} 是空的`).toBeGreaterThan(10_000);
      // A battle bed that does not loop leaves the rest of the round in silence.
      expect(t.loop, `${arena} 的戰鬥曲必須 loop`).toBe(true);
    }
  });
});

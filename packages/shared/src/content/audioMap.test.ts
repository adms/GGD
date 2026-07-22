/**
 * audio: config.audio-map@1 schema. A valid doc round-trips through the config
 * discriminated union; bad paths / empty pools / unknown keys are rejected.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { zConfigAudioMapDoc, zConfigDoc } from "./schema/config";
import { validateDoc } from "./loader";

const SAMPLE = {
  id: "audio-map",
  schema: "config.audio-map@1" as const,
  bgm: {
    menu: { file: "assets/audio/bgm/menu.mp3", loop: true, gain: 0.9 },
    combat: { file: "assets/audio/bgm/combat.mp3", loop: true },
    battleStart: { file: "assets/audio/bgm/battleStart.mp3", loop: false, gain: 1 },
    victory: { file: "assets/audio/bgm/victory.mp3", loop: false },
  },
  sfx: {
    death: {
      files: ["assets/audio/sfx/die.mp3", "assets/audio/sfx/mandie.mp3"],
      gain: 0.9,
      cooldownMs: 350,
      maxConcurrent: 2,
    },
    levelUp: { files: ["assets/audio/sfx/up.mp3"] },
  },
};

describe("config.audio-map@1 schema (audio)", () => {
  it("round-trips a valid audio-map doc through the config union", () => {
    cover("audio-schema-parse");
    const parsed = zConfigAudioMapDoc.parse(SAMPLE);
    expect(parsed.id).toBe("audio-map");
    expect(parsed.bgm.menu?.loop).toBe(true);
    expect(parsed.bgm.combat?.gain).toBeUndefined(); // optional omitted
    expect(parsed.bgm.battleStart?.loop).toBe(false);
    expect(parsed.sfx.death?.files).toHaveLength(2);
    expect(parsed.sfx.death?.maxConcurrent).toBe(2);

    // and it is accepted by the collection discriminated union (schema tag)
    const viaUnion = zConfigDoc.parse(SAMPLE);
    expect(viaUnion.schema).toBe("config.audio-map@1");

    // and through the loader's collection validator (as the pipeline sees it)
    const res = validateDoc("config", SAMPLE);
    expect(res.ok).toBe(true);
  });

  it("rejects non-assets paths, empty file pools and unknown keys", () => {
    cover("audio-schema-parse");
    const bad = {
      id: "audio-map",
      schema: "config.audio-map@1",
      bgm: {
        // path must start with assets/
        menu: { file: "/etc/passwd.mp3", loop: true },
      },
      sfx: {
        // empty pool is invalid (min 1)
        death: { files: [] },
      },
      surprise: true, // strict: unknown top-level key
    };
    const res = validateDoc("config", bad);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    const paths = res.issues.map((i) => i.path);
    expect(paths.some((p) => p.startsWith("bgm.menu.file"))).toBe(true);
    expect(paths.some((p) => p.startsWith("sfx.death.files"))).toBe(true);
    expect(res.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
  });

  it("clamps out-of-range gain via schema bounds (0..4)", () => {
    cover("audio-schema-parse");
    const over = {
      id: "audio-map",
      schema: "config.audio-map@1",
      bgm: { menu: { file: "assets/audio/bgm/menu.mp3", loop: true, gain: 99 } },
      sfx: {},
    };
    const res = validateDoc("config", over);
    expect(res.ok).toBe(false);
  });
});

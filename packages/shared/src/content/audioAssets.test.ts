/**
 * audio ASSETS + MAP gate (docs/todo/audio.md, ASSETS + MAP half).
 *
 * Where audioMap.test.ts checks the config.audio-map@1 SCHEMA against synthetic
 * docs, this checks the real authored `content/config/audio-map.json` and the
 * staged audio files ON DISK: every referenced path exists, every whitelisted
 * event is bound, the 11 BGM scenes match bgm/MANIFEST.json, the 21 imported
 * w3x clips are real MP3s (and all used), and the synthesised fx clips are the
 * right PCM/WAV format.
 *
 * Like icons.test.ts / standinRoster.test.ts it reads by DIRECT file path (not
 * FsContentSource/ContentLoader) so it stays green both BEFORE and AFTER
 * `content:build` reindexes the config collection.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { zConfigAudioMapDoc, type ConfigAudioMapDoc } from "./schema/config";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const AUDIO = join(CONTENT, "assets", "audio");

/** The server's MSG.EVENT whitelist (apps/game-server MatchRoom.loop). */
const EVENT_WHITELIST = [
  "abilityCast", "damage", "death", "projectileSpawn", "projectileHit",
  "levelUp", "castBegin", "castEnd", "castInterrupt", "attackWindup",
  "basicAttack", "basicAttackHit", "flowerSpawn", "flowerBurst", "exUnlock",
] as const;

/**
 * The 12 BGM scenes the client drives (audio/types.ts AUDIO_SCENES).
 * `menuNocturne` (task #88) is not a screen: it is the login screen's SECOND
 * theme, which the auth screen alternates with `menu` every whole loop
 * (apps/client/src/audio/loginRotation.ts).
 */
const BGM_SCENES = [
  "menu", "menuNocturne", "lobby", "room", "champSelect", "intermission",
  "battleStart", "combat", "fireRing", "settlement", "victory", "defeat",
] as const;

/** The complete imported w3x voice set — every clip must be bound somewhere. */
const W3X_CLIPS = [
  "4die", "87joke", "bads", "die", "dogdie", "dorakill", "even", "heycharlie",
  "kickme", "letsgo", "mandie", "moongo", "moonjump", "nocute", "nog", "pcdie",
  "pick", "pikakill", "ringnai", "up", "yooooooooooooo",
] as const;

/** The synthesised fx combat clips. */
const FX_CLIPS = [
  "swing", "windup", "thud", "tick", "launch", "impact",
  "cast_begin", "cast_end", "cast_break", "chime_soft", "chime_burst",
  // champ-select countdown (task #30) — same GENERATE.sh, same PCM format
  "count-tick", "count-final",
  // 3-choose-1 draft card lock-in (task #110) — same GENERATE.sh, same PCM format
  "draft-confirm",
  // hit-feel audit P1 weight-tiered hit voices + re-cut block clank — same
  // GENERATE.sh, same PCM format. Client plays these by the key convention below.
  "hit-light", "hit-medium", "hit-heavy", "hit-crit", "block-hit",
] as const;

/** The hit-feel P1 weight tiers + block-hit, keyed by the client convention. */
const HIT_TIER_KEYS = ["hit-light", "hit-medium", "hit-heavy", "hit-crit", "block-hit"] as const;

function loadDoc(): ConfigAudioMapDoc {
  const raw = JSON.parse(readFileSync(join(CONTENT, "config/audio-map.json"), "utf8"));
  return zConfigAudioMapDoc.parse(raw);
}

function isMp3(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // "ID3"
  return buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0; // MPEG frame sync
}

function readWavFmt(buf: Buffer): {
  riff: boolean; format: number; channels: number; sampleRate: number; bits: number;
} {
  return {
    riff: buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE",
    format: buf.readUInt16LE(20),
    channels: buf.readUInt16LE(22),
    sampleRate: buf.readUInt32LE(24),
    bits: buf.readUInt16LE(34),
  };
}

describe("authored audio-map.json", () => {
  it("parses against the config.audio-map@1 schema", () => {
    cover("audio-map-doc-valid");
    const doc = loadDoc();
    expect(doc.id).toBe("audio-map");
    expect(doc.schema).toBe("config.audio-map@1");
  });

  it("authors all 12 BGM scenes with loop flags matching bgm/MANIFEST.json", () => {
    cover("audio-map-bgm-scenes");
    const doc = loadDoc();
    expect(Object.keys(doc.bgm).sort()).toEqual([...BGM_SCENES].sort());

    const manifest = JSON.parse(
      readFileSync(join(AUDIO, "bgm", "MANIFEST.json"), "utf8"),
    ) as { tracks: { scene: string; loop: boolean; file: string }[] };
    for (const t of manifest.tracks) {
      const entry = doc.bgm[t.scene];
      expect(entry, `manifest scene ${t.scene}`).toBeDefined();
      expect(entry!.loop, `loop flag for ${t.scene}`).toBe(t.loop);
      expect(entry!.file.endsWith(`/${t.file}`), `file for ${t.scene}`).toBe(true);
    }
    const stings = Object.entries(doc.bgm).filter(([, v]) => !v.loop).map(([k]) => k).sort();
    expect(stings).toEqual(["battleStart", "defeat", "victory"]);
  });

  it("binds every whitelisted MSG.EVENT to a non-empty SFX pool", () => {
    cover("audio-map-event-coverage");
    const doc = loadDoc();
    for (const ev of EVENT_WHITELIST) {
      const entry = doc.sfx[ev];
      expect(entry, `sfx event ${ev}`).toBeDefined();
      expect(entry!.files.length).toBeGreaterThan(0);
    }
  });

  it("references only files that exist on disk under assets/", () => {
    cover("audio-map-files-exist");
    const doc = loadDoc();
    const paths = new Set<string>();
    for (const t of Object.values(doc.bgm)) paths.add(t.file);
    for (const e of Object.values(doc.sfx)) for (const f of e.files) paths.add(f);
    expect(paths.size).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p.startsWith("assets/"), `${p} under assets/`).toBe(true);
      expect(existsSync(join(CONTENT, p)), `${p} exists`).toBe(true);
    }
  });

  it("throttles the high-frequency combat events (cooldown + small voice cap)", () => {
    cover("audio-map-throttle");
    const doc = loadDoc();
    const hot = ["damage", "basicAttack", "basicAttackHit", "projectileSpawn", "projectileHit"];
    for (const ev of hot) {
      const e = doc.sfx[ev]!;
      expect(e, `hot event ${ev}`).toBeDefined();
      expect(e.cooldownMs ?? 0, `${ev} cooldownMs`).toBeGreaterThan(0);
      expect(e.maxConcurrent ?? 0, `${ev} maxConcurrent`).toBeGreaterThanOrEqual(1);
      expect(e.maxConcurrent!, `${ev} voice cap kept small`).toBeLessThanOrEqual(4);
    }
  });

  it("keeps attack / hit / damage / level-up on distinct clips (legibility)", () => {
    cover("audio-map-legible-events");
    const doc = loadDoc();
    const first = (ev: string) => doc.sfx[ev]!.files[0];
    const four = new Set([first("basicAttack"), first("basicAttackHit"), first("damage"), first("levelUp")]);
    expect(four.size).toBe(4);
    for (const d of doc.sfx.death!.files) {
      expect([first("basicAttack"), first("basicAttackHit"), first("damage")]).not.toContain(d);
    }
  });

  it("binds every imported w3x voice clip somewhere (none stranded)", () => {
    cover("audio-map-w3x-complete");
    const doc = loadDoc();
    const referenced = new Set<string>();
    const scan = (f: string) => {
      const m = /assets\/audio\/sfx\/([a-z0-9]+)\.mp3$/.exec(f);
      if (m) referenced.add(m[1]!);
    };
    for (const e of Object.values(doc.sfx)) for (const f of e.files) scan(f);
    // champion-voices.json `select` pools are a SECOND legitimate playback
    // surface (task #27), and since #40 they are the ONLY home of the two
    // character quips displaced from the system pools — `mandie` (初音, on
    // godie-h001) and `87joke` (飛影, on godie-efur). Scanning audio-map alone
    // would report them stranded even though they are bound and playable.
    const voices = JSON.parse(
      readFileSync(join(CONTENT, "config/champion-voices.json"), "utf8"),
    ) as { champions: Record<string, { select: string[] }> };
    for (const c of Object.values(voices.champions)) for (const f of c.select) scan(f);

    for (const clip of W3X_CLIPS) {
      expect(referenced.has(clip), `w3x clip ${clip} is bound`).toBe(true);
    }
  });

  it("binds the champ-select countdown to two DISTINCT throttled clips", () => {
    cover("audio-countdown-map");
    const doc = loadDoc();
    const tick = doc.sfx.countTick;
    const final = doc.sfx.countFinal;
    expect(tick, "sfx event countTick").toBeDefined();
    expect(final, "sfx event countFinal").toBeDefined();
    // the last second MUST be a different clip from the 5..2 tick (legibility)
    expect(tick!.files[0]).not.toBe(final!.files[0]);
    for (const e of [tick!, final!]) {
      expect(e.files.length).toBe(1); // a countdown is never randomised
      // fires ≤ once per second, so a cooldown under 1 s + a tiny voice cap
      expect(e.cooldownMs ?? 0).toBeGreaterThan(0);
      expect(e.cooldownMs!).toBeLessThan(1000);
      expect(e.maxConcurrent ?? 0).toBeGreaterThanOrEqual(1);
      expect(e.maxConcurrent!).toBeLessThanOrEqual(2);
    }
  });

  it("binds the hit-feel weight tiers + block-hit to distinct throttled clips", () => {
    cover("audio-map-hit-tiers");
    const doc = loadDoc();
    const seen = new Set<string>();
    for (const key of HIT_TIER_KEYS) {
      const e = doc.sfx[key];
      expect(e, `sfx event ${key}`).toBeDefined();
      // each tier is its own single, distinct file (weight/block must be audible)
      expect(e!.files.length, `${key} single clip`).toBe(1);
      const f = e!.files[0]!;
      expect(f.endsWith(`/fx/${key}.wav`), `${key} -> fx/${key}.wav`).toBe(true);
      expect(seen.has(f), `${key} clip distinct`).toBe(false);
      seen.add(f);
      // hot combat events: cooldown-gated + a small voice cap (收尾精準, no pile-up)
      expect(e!.cooldownMs ?? 0, `${key} cooldownMs`).toBeGreaterThan(0);
      expect(e!.maxConcurrent ?? 0, `${key} maxConcurrent`).toBeGreaterThanOrEqual(1);
      expect(e!.maxConcurrent!, `${key} voice cap kept small`).toBeLessThanOrEqual(4);
    }
    // the ringing lab block samples must no longer be the block voice's clip
    for (const e of Object.values(doc.sfx)) {
      for (const f of e.files) {
        expect(f, "no clip named block-hit points at the ringing lab samples")
          .not.toMatch(/lab\/block-(clash|shield)\.wav$/);
      }
    }
  });
});

describe("staged audio files", () => {
  it("stages all 21 w3x clips as real, non-empty MP3s", () => {
    cover("audio-sfx-real-mp3");
    for (const clip of W3X_CLIPS) {
      const p = join(AUDIO, "sfx", `${clip}.mp3`);
      expect(existsSync(p), `${clip}.mp3 exists`).toBe(true);
      const buf = readFileSync(p);
      expect(buf.length, `${clip}.mp3 non-empty`).toBeGreaterThan(1000);
      expect(isMp3(buf), `${clip}.mp3 MP3/ID3 header`).toBe(true);
    }
  });

  it("synthesises the fx combat clips as mono 16-bit 44.1k PCM WAV", () => {
    cover("audio-fx-pcm-wav");
    for (const name of FX_CLIPS) {
      const p = join(AUDIO, "sfx", "fx", `${name}.wav`);
      expect(existsSync(p), `${name}.wav exists`).toBe(true);
      const fmt = readWavFmt(readFileSync(p));
      expect(fmt.riff, `${name}.wav RIFF/WAVE`).toBe(true);
      expect(fmt.format, `${name}.wav PCM`).toBe(1);
      expect(fmt.channels, `${name}.wav mono`).toBe(1);
      expect(fmt.sampleRate, `${name}.wav 44.1k`).toBe(44100);
      expect(fmt.bits, `${name}.wav 16-bit`).toBe(16);
    }
  });
});

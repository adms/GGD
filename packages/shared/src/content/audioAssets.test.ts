/**
 * audio ASSETS + MAP gate (docs/todo/audio.md, ASSETS + MAP half).
 *
 * Where audioMap.test.ts checks the config.audio-map@1 SCHEMA against synthetic
 * docs, this checks the real authored `content/config/audio-map.json` and the
 * staged audio files ON DISK: every referenced path exists, every whitelisted
 * event is bound, the 11 BGM scenes match bgm/MANIFEST.json, the 21 imported
 * w3x clips are real MP3s (and all used), and the synthesised fx clips are the
 * right MP3 format.
 *
 * The whole library is MP3 under the task #158 loading ceiling: 44.1 kHz and at
 * most 128 kbps. The fx clips used to ship as mono 16-bit 44.1k PCM WAV; they
 * were transcoded in place (same stem, `.wav` -> `.mp3`), so the format gate
 * below now reads the MPEG frame header instead of the RIFF header.
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
const REPO = join(HERE, "../../../..");
const CONTENT = join(REPO, "content");
const AUDIO = join(CONTENT, "assets", "audio");

/**
 * THE COPYRIGHT-GATE CARVE-OUT — RETIRED 2026-08-19 (GH#402).
 *
 * This block used to explain why the `wc3.*` keys deliberately pointed OUTSIDE
 * content/: the clips were Blizzard-owned and lived in the git-ignored
 * data/blizzard-overlay/ability-sfx/ store, reachable only through the dev-only
 * `assets/blizzard-local/` mount that prod never served.
 *
 * The owner retired that rule for these files by explicit decision — first for
 * the model soundsets, then「既有 60 個 wc3.* 沒一起搬 => move」for these. All
 * of them now live in content/assets/audio/wc3/, are committed, and are served
 * by the ordinary prod content route. So the `wc3.*` refs are no longer special
 * to this file at all: they are ordinary content-relative paths and the generic
 * on-disk existence check below covers them like every other clip.
 *
 * The overlay-resolving helpers are KEPT rather than deleted because the store
 * still exists and still holds what the rulings did NOT cover (511 character
 * voice lines, 40 models). If any audio-map ref ever points back into
 * `assets/blizzard-local/` again, this machinery is what keeps it honest.
 * Provenance for the moved bytes: content/assets/audio/wc3/PROVENANCE.md.
 */
const OVERLAY_PREFIX = "assets/blizzard-local/";
const OVERLAY_STORE = join(REPO, "data", "blizzard-overlay");
const OVERLAY_REF_SHAPE = /^assets\/blizzard-local\/ability-sfx\/[a-z0-9]+\.(wav|mp3)$/;

/** content-relative ref → absolute path in the overlay store, or null. */
function overlayStorePath(ref: string): string | null {
  if (!ref.startsWith(OVERLAY_PREFIX)) return null;
  return join(OVERLAY_STORE, ref.slice(OVERLAY_PREFIX.length));
}

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
  // GENERATE.sh, same MP3 format. Client plays these by the key convention below.
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

/** MPEG1 Layer III bitrate table (kbps), indexed by the header's bitrate index. */
const MP3_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1,
] as const;
/** MPEG1 sampling rates (Hz), indexed by the header's sample-rate index. */
const MP3_RATES = [44100, 48000, 32000, -1] as const;

/**
 * Read the first MPEG audio frame header, skipping any ID3v2 tag.
 * Returns null when no valid MPEG1 Layer III frame is found.
 */
function readMp3Fmt(buf: Buffer): {
  sampleRate: number; channels: number; bitrateKbps: number;
} | null {
  let i = 0;
  // ID3v2: "ID3" + 2 version bytes + 1 flag byte + 4 syncsafe size bytes
  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "ID3") {
    const size =
      (buf[6]! & 0x7f) * 0x200000 + (buf[7]! & 0x7f) * 0x4000 +
      (buf[8]! & 0x7f) * 0x80 + (buf[9]! & 0x7f);
    i = 10 + size;
  }
  for (; i + 4 <= buf.length; i++) {
    if (buf[i] !== 0xff || (buf[i + 1]! & 0xe0) !== 0xe0) continue;
    const versionId = (buf[i + 1]! >> 3) & 0x03; // 3 = MPEG1
    const layer = (buf[i + 1]! >> 1) & 0x03; // 1 = Layer III
    if (versionId !== 3 || layer !== 1) continue;
    const bitrateIdx = (buf[i + 2]! >> 4) & 0x0f;
    const rateIdx = (buf[i + 2]! >> 2) & 0x03;
    const channelMode = (buf[i + 3]! >> 6) & 0x03; // 3 = mono
    const bitrateKbps = MP3_BITRATES[bitrateIdx]!;
    const sampleRate = MP3_RATES[rateIdx]!;
    if (bitrateKbps <= 0 || sampleRate <= 0) continue;
    return { sampleRate, channels: channelMode === 3 ? 1 : 2, bitrateKbps };
  }
  return null;
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
      const overlay = overlayStorePath(p);
      if (overlay) {
        // copyright gate: the file must NOT exist under content/ (committing it
        // would ship a Blizzard asset), must match the ability-sfx shape, and
        // must exist in the git-ignored overlay store when this machine has one.
        expect(p, `${p} matches the overlay ability-sfx shape`).toMatch(OVERLAY_REF_SHAPE);
        expect(existsSync(join(CONTENT, p)), `${p} must stay OUT of content/`).toBe(false);
        if (existsSync(join(OVERLAY_STORE, "ability-sfx"))) {
          expect(existsSync(overlay), `${p} staged in data/blizzard-overlay`).toBe(true);
        }
        continue;
      }
      expect(existsSync(join(CONTENT, p)), `${p} exists`).toBe(true);
    }
  });

  it("routes the blizzard-local mount ONLY through wc3.* sfx keys (never bgm)", () => {
    cover("audio-map-overlay-keys-only");
    const doc = loadDoc();
    for (const [scene, t] of Object.entries(doc.bgm)) {
      expect(t.file.startsWith(OVERLAY_PREFIX), `bgm ${scene} never rides the overlay`).toBe(false);
    }
    for (const [key, e] of Object.entries(doc.sfx)) {
      for (const f of e.files) {
        if (f.startsWith(OVERLAY_PREFIX)) {
          expect(key.startsWith("wc3."), `${key} -> ${f}: only wc3.* keys may reference the dev-only mount`).toBe(true);
        }
      }
    }
  });

  /**
   * The existence check above is only as strong as the map is wide: a key that
   * silently loses its `files` entry, or a download that landed as a 0-byte
   * stub / an HTML error page, would still pass it. This is the integrity
   * floor — EVERY bgm + sfx reference must resolve to a real, non-empty file
   * whose header is a genuine MP3 or RIFF/WAV, and the map must not shrink
   * below the set that has already shipped.
   */
  it("resolves every bgm + sfx reference to a real non-empty audio file", () => {
    cover("audio-map-files-integrity");
    const doc = loadDoc();
    const refs: Array<{ kind: string; key: string; file: string }> = [];
    for (const [key, t] of Object.entries(doc.bgm)) refs.push({ kind: "bgm", key, file: t.file });
    for (const [key, e] of Object.entries(doc.sfx)) {
      expect(e.files.length, `sfx ${key} has files`).toBeGreaterThan(0);
      for (const file of e.files) refs.push({ kind: "sfx", key, file });
    }

    const unique = new Set(refs.map((r) => r.file));
    // 12 bgm scenes + 120 unique files across 89 sfx keys as of the 効果音ラボ
    // final-five wave. A floor, not an equality: new cues may only add.
    expect(Object.keys(doc.bgm).length).toBeGreaterThanOrEqual(12);
    expect(Object.keys(doc.sfx).length).toBeGreaterThanOrEqual(89);
    expect(unique.size).toBeGreaterThanOrEqual(120);

    const missing: string[] = [];
    const bad: string[] = [];
    const overlayStaged = existsSync(join(OVERLAY_STORE, "ability-sfx"));
    for (const r of refs) {
      const overlay = overlayStorePath(r.file);
      if (overlay && !overlayStaged) continue; // copyright gate: store not staged here
      const abs = overlay ?? join(CONTENT, r.file);
      if (!existsSync(abs)) {
        missing.push(`${r.kind}:${r.key} -> ${r.file}`);
        continue;
      }
      const buf = readFileSync(abs);
      if (buf.length === 0) {
        bad.push(`${r.kind}:${r.key} -> ${r.file} (0 bytes)`);
        continue;
      }
      const riff = buf.length >= 4 && buf.toString("latin1", 0, 4) === "RIFF";
      if (!isMp3(buf) && !riff) bad.push(`${r.kind}:${r.key} -> ${r.file} (not MP3/RIFF)`);
    }
    expect(missing, "audio-map references with no file on disk").toEqual([]);
    expect(bad, "audio-map references that are empty or not real audio").toEqual([]);
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
    // godie-h001) and `87joke` (飛影, on godie-u010). Scanning audio-map alone
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
      expect(f.endsWith(`/fx/${key}.mp3`), `${key} -> fx/${key}.mp3`).toBe(true);
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
          .not.toMatch(/lab\/block-(clash|shield)\.(wav|mp3)$/);
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

  it("synthesises the fx combat clips as mono 44.1k MP3 under the 128k ceiling", () => {
    cover("audio-fx-mp3-ceiling");
    for (const name of FX_CLIPS) {
      const p = join(AUDIO, "sfx", "fx", `${name}.mp3`);
      expect(existsSync(p), `${name}.mp3 exists`).toBe(true);
      // the WAV originals were replaced in place — none may come back
      expect(existsSync(join(AUDIO, "sfx", "fx", `${name}.wav`)), `${name}.wav retired`)
        .toBe(false);
      const buf = readFileSync(p);
      expect(buf.length, `${name}.mp3 non-empty`).toBeGreaterThan(256);
      expect(isMp3(buf), `${name}.mp3 MP3/ID3 header`).toBe(true);
      const fmt = readMp3Fmt(buf);
      expect(fmt, `${name}.mp3 MPEG1 Layer III frame`).not.toBeNull();
      expect(fmt!.sampleRate, `${name}.mp3 44.1k`).toBe(44100);
      expect(fmt!.channels, `${name}.mp3 mono`).toBe(1);
      // task #158 loading ceiling — a CEILING, not a target
      expect(fmt!.bitrateKbps, `${name}.mp3 <=128kbps`).toBeLessThanOrEqual(128);
    }
  });
});

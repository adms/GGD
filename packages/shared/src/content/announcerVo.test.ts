/**
 * Announcer VO pack gate (task #34; ja-JP by #40; recast trilingual by #57).
 *
 * The SEVEN system/announcer broadcast events in the authored
 * `content/config/audio-map.json` must be bound to the machine-VO clips staged
 * under `content/assets/audio/announcer/` and to NOTHING ELSE — a system
 * broadcast is the machine talking, so a Chinese map quip may not roll in its
 * place. Every referenced announcer clip must exist on disk as a real, non-empty
 * MP3, and the displaced quips must still be reachable in the map-flavour pools
 * (preserved, not deleted).
 *
 * SYSTEM vs CHARACTER is the rule this file enforces: a broadcast *about* whoever
 * died/levelled is SYSTEM; a named champion speaking is CHARACTER (stays Chinese,
 * lives in `kill`/`taunt`/`abilityCast`/`champSelectConfirm` or in a `select`
 * pool in champion-voices.json). Do not "fix" this back to map quips.
 *
 * ── THE AESTHETIC THIS FILE PROTECTS ────────────────────────────────────────
 * The pack is 惡搞, and the JOKE IS THE LINE, NOT THE VOICE. The user, verbatim:
 * 「惡搞語音不應該是機械音 而是類似 google 語音那樣字正腔圓講話清楚但不帶感情所以嘲諷」
 * — it must NOT be a robot voice; it should be like Google's voice, perfectly
 * enunciated and emotionless, and THAT is what makes it mocking. Every line is a
 * real, standard, full-band system voice reading correct text in a language it
 * actually speaks; the comedy is transit-PA and customer-service boilerplate
 * applied to a deathmatch. The flat delivery is the performance, not a defect.
 * An earlier pass cast novelty/singing voices instead and was retired — see
 * `content/assets/audio/announcer/retired-jank-novelty/NOTE.md`.
 *
 * Like audioAssets.test.ts this reads by DIRECT file path (not ContentLoader)
 * so it stays green both before and after `content:build`.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { zConfigAudioMapDoc, type ConfigAudioMapDoc } from "./schema/config";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");

/**
 * The system/announcer broadcast events (NOT champion personal flavor).
 * `exUnlock` joined the set in #40: an EX rank 0→1 flip is a system state
 * change, and it previously had no announcer clip at all (only the 7 s
 * character quip `87joke`, which moved to 飛影's champion-voice select pool).
 */
const ANNOUNCER_EVENTS = [
  "matchStart", "roundStart", "levelUp", "death", "multiKill", "allySlain",
  "exUnlock",
] as const;

/** The 13 generated clips (tools/tts-gen, announcer.json). */
const ANNOUNCER_CLIPS = [
  "match-start", "round-start-1", "round-start-2", "level-up-1", "level-up-2",
  "death-1", "death-2", "death-3", "multi-kill-1", "multi-kill-2",
  "multi-kill-3", "ally-slain", "ex-unlock",
] as const;

/** Where each quip displaced from a system pool now lives (nothing deleted). */
const FLAVOR_POOLS: Record<string, readonly string[]> = {
  // long-form set pieces (8.8 s / 8.4 s) — never share a pool with a 1 s stab
  mapFlavorIntro: ["heycharlie", "letsgo"],
  // short stabs (1.4-1.9 s)
  mapFlavorAnnounce: ["up", "die", "4die", "pcdie"],
};

/** Character quips that left a system pool for champion-voices.json instead. */
const CHARACTER_REROUTES: Record<string, string> = {
  mandie: "godie-h001", // 初音「哎喲!(跌倒)」
  "87joke": "godie-efur", // 飛影「不要小看邪眼的力量！」
};

type Segment = { voice: string; lang: string; text: string };
type ManifestLine = {
  id: string;
  lang: string;
  /** absent on a segmented (multi-voice) line */
  text?: string;
  /** absent on a segmented line — the voice is cast per segment */
  voice?: string;
  segments?: Segment[];
  out: string;
  rate: number;
};

function loadDoc(): ConfigAudioMapDoc {
  const raw = JSON.parse(readFileSync(join(CONTENT, "config/audio-map.json"), "utf8"));
  return zConfigAudioMapDoc.parse(raw);
}

function loadManifest(name: string): ManifestLine[] {
  return JSON.parse(readFileSync(join(CONTENT, "audio-manifests", name), "utf8"));
}

function isMp3(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // "ID3"
  return buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0; // MPEG frame sync
}

describe("announcer VO pack (audio-map bindings + staged files)", () => {
  it("binds every announcer event to at least one announcer/ clip", () => {
    cover("audio-announcer-bound");
    const doc = loadDoc();
    for (const ev of ANNOUNCER_EVENTS) {
      const entry = doc.sfx[ev];
      expect(entry, `sfx event ${ev}`).toBeDefined();
      const vo = entry!.files.filter((f) => f.startsWith("assets/audio/announcer/"));
      expect(vo.length, `${ev} pools >=1 announcer clip`).toBeGreaterThan(0);
    }
  });

  it("binds system events to announcer/ VO ONLY (no zh map quips left)", () => {
    cover("audio-announcer-system-vo-only");
    const doc = loadDoc();
    for (const ev of ANNOUNCER_EVENTS) {
      const stray = doc.sfx[ev]!.files.filter((f) => !f.startsWith("assets/audio/announcer/"));
      expect(stray, `${ev} is announcer VO only`).toEqual([]);
    }
  });

  it("references only announcer files that exist on disk", () => {
    cover("audio-announcer-files-exist");
    const doc = loadDoc();
    const referenced = new Set<string>();
    for (const e of Object.values(doc.sfx)) {
      for (const f of e.files) {
        if (f.startsWith("assets/audio/announcer/")) referenced.add(f);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    for (const p of referenced) {
      expect(existsSync(join(CONTENT, p)), `${p} exists`).toBe(true);
    }
  });

  it("binds all 13 generated clips and stages them as real, non-empty MP3s", () => {
    cover("audio-announcer-real-mp3");
    const doc = loadDoc();
    const referenced = new Set<string>();
    for (const e of Object.values(doc.sfx)) {
      for (const f of e.files) {
        const m = /^assets\/audio\/announcer\/([a-z0-9-]+)\.mp3$/.exec(f);
        if (m) referenced.add(m[1]!);
      }
    }
    for (const clip of ANNOUNCER_CLIPS) {
      expect(referenced.has(clip), `announcer clip ${clip} is bound`).toBe(true);
      const p = join(CONTENT, "assets", "audio", "announcer", `${clip}.mp3`);
      expect(existsSync(p), `${clip}.mp3 exists`).toBe(true);
      const buf = readFileSync(p);
      expect(buf.length, `${clip}.mp3 non-empty`).toBeGreaterThan(1000);
      expect(isMp3(buf), `${clip}.mp3 MP3/ID3 header`).toBe(true);
    }
  });

  it("keeps the displaced w3x quips pooled in map-flavour (none stranded)", () => {
    cover("audio-announcer-quips-kept");
    const doc = loadDoc();
    for (const [pool, quips] of Object.entries(FLAVOR_POOLS)) {
      const entry = doc.sfx[pool];
      expect(entry, `sfx pool ${pool}`).toBeDefined();
      for (const quip of quips) {
        expect(entry!.files, `${pool} keeps ${quip}`).toContain(`assets/audio/sfx/${quip}.mp3`);
      }
    }
    // The two CHARACTER quips went to champion-voices.json instead — putting them
    // in a map-flavour pool would re-mix character voices into map flavour.
    const voices = JSON.parse(
      readFileSync(join(CONTENT, "config/champion-voices.json"), "utf8"),
    ) as { champions: Record<string, { select: string[] }> };
    for (const [quip, champId] of Object.entries(CHARACTER_REROUTES)) {
      expect(
        voices.champions[champId]?.select,
        `${quip} is ${champId}'s character voice`,
      ).toContain(`assets/audio/sfx/${quip}.mp3`);
      for (const pool of Object.keys(FLAVOR_POOLS)) {
        expect(doc.sfx[pool]!.files, `${pool} excludes character quip ${quip}`).not.toContain(
          `assets/audio/sfx/${quip}.mp3`,
        );
      }
    }
  });

  it("splits the flavour pools by LENGTH (long set pieces never mix with stabs)", () => {
    cover("audio-announcer-flavor-split");
    const doc = loadDoc();
    // Randomising an 8.8 s clip against a 1.4 s one at maxConcurrent 1 is exactly
    // the failure that made `heycharlie` drown the match-start VO.
    for (const pool of Object.keys(FLAVOR_POOLS)) {
      const e = doc.sfx[pool]!;
      expect(e.maxConcurrent ?? 0, `${pool} voice cap`).toBe(1);
      expect(e.cooldownMs ?? 0, `${pool} cooldownMs`).toBeGreaterThan(0);
    }
    // the long pool must out-cool the short one by a wide margin
    expect(doc.sfx.mapFlavorIntro!.cooldownMs!).toBeGreaterThan(
      doc.sfx.mapFlavorAnnounce!.cooldownMs!,
    );
  });
});

describe("announcer VO manifest ↔ cast table (spoken text cannot drift)", () => {
  it("renders every cue from announcer.json to the live announcer/ paths", () => {
    cover("audio-announcer-manifest-live");
    const lines = loadManifest("announcer.json");
    expect(lines.length).toBe(ANNOUNCER_CLIPS.length);
    expect(new Set(lines.map((l) => l.id)).size, "ids unique").toBe(lines.length);
    for (const line of lines) {
      expect(line.out, `${line.id} out`).toMatch(
        /^\.\.\/assets\/audio\/announcer\/[a-z0-9-]+\.mp3$/,
      );
      const clip = line.out.replace("../assets/audio/announcer/", "").replace(".mp3", "");
      expect(ANNOUNCER_CLIPS as readonly string[], `${line.id} clip`).toContain(clip);
      // a line is EITHER whole-line cast, OR split into per-voice segments
      if (line.segments) {
        expect(line.text, `${line.id} segmented line has no whole-line text`).toBeUndefined();
        expect(line.voice, `${line.id} segmented line casts per segment`).toBeUndefined();
        expect(line.segments.length, `${line.id} segment count`).toBeGreaterThan(1);
        for (const s of line.segments) {
          expect(s.text.trim(), `${line.id} segment text`).not.toBe("");
          expect(s.voice, `${line.id} segment voice`).toBeTruthy();
        }
      } else {
        expect(line.text!.trim(), `${line.id} text`).not.toBe("");
        expect(line.voice, `${line.id} voice`).toBeTruthy();
      }
    }
  });

  it("keeps the cast table and the generator manifest in lockstep", () => {
    cover("audio-announcer-cast-in-sync");
    // `zhText` (display) and `spoken` (what the voice says) are deliberately NOT
    // translations of each other on most lines — that gap IS the joke. Pinning
    // them together here is what stops the two drifting apart.
    const cast = JSON.parse(
      readFileSync(join(CONTENT, "audio-manifests/announcer.cast.json"), "utf8"),
    ) as { lines: { id: string; clip: string; zhText: string; spoken: string; voice: string; rate: number }[] };
    const lines = loadManifest("announcer.json");
    expect(cast.lines.length).toBe(lines.length);
    const byId = new Map(lines.map((l) => [l.id, l]));
    for (const c of cast.lines) {
      const line = byId.get(c.id);
      expect(line, `manifest line for ${c.id}`).toBeDefined();
      expect(c.zhText.trim(), `${c.id} has canonical Chinese display text`).not.toBe("");
      expect(line!.out, `${c.id} clip`).toBe(`../assets/audio/announcer/${c.clip}`);
      expect(line!.rate, `${c.id} rate`).toBe(c.rate);
      const spoken = line!.segments
        ? line!.segments.map((s) => s.text).join(" ‖ ")
        : line!.text;
      expect(spoken, `${c.id} spoken text matches the cast table`).toBe(c.spoken);
      const voice = line!.segments
        ? line!.segments.map((s) => s.voice).join(" ‖ ")
        : line!.voice;
      expect(voice, `${c.id} voice matches the cast table`).toBe(c.voice);
    }
  });

  it("paces the whole pack at ONE rate (evenness is the announcer signal)", () => {
    cover("audio-announcer-uniform-rate");
    // A rate outlier reads as a character doing a bit. The retired pack had one
    // line at 150 wpm against 200 for a scripted stammer; that is exactly the
    // "the voice is the joke" register this pack rejects.
    const rates = new Set(loadManifest("announcer.json").map((l) => l.rate));
    expect([...rates], "one rate across every line").toEqual([185]);
  });

  it("casts ONLY full-band voices — no novelty/character/singing synths", () => {
    cover("audio-announcer-no-novelty-voices");
    // The user's correction: 「惡搞語音不應該是機械音 而是類似 google 語音那樣字正腔圓
    // 講話清楚但不帶感情所以嘲諷」. The novelty voices are old MacinTalk formant
    // synths with no energy above ~2.5 kHz, so they cannot articulate the
    // consonants of ANY of these three languages. This is measured, not taste.
    const ALLOWED = new Set(["Kyoko", "Tingting", "Karen", "Sinji"]);
    const BANNED = [
      "eddy", "flo", "grandma", "grandpa", "reed", "rocko", "sandy", "shelley",
      "zarvox", "trinoids", "whisper", "albert", "bahh", "boing", "bells",
      "organ", "jester", "bubbles", "wobble", "superstar", "good news",
      "bad news", "cellos",
    ];
    for (const line of loadManifest("announcer.json")) {
      const voices = line.segments ? line.segments.map((s) => s.voice) : [line.voice!];
      for (const v of voices) {
        expect(ALLOWED.has(v), `${line.id} casts an approved voice, got "${v}"`).toBe(true);
        expect(
          BANNED.some((b) => v.toLowerCase().includes(b)),
          `${line.id} must not cast the novelty voice "${v}"`,
        ).toBe(false);
      }
    }
  });

  it("NEVER puts Latin script in a Kyoko line", () => {
    cover("audio-announcer-no-latin-in-kyoko");
    // `say -v Kyoko "Fight"` is BYTE-IDENTICAL to `say -v Kyoko "ファイト"` —
    // Kyoko transliterates Latin to katakana internally, so Latin text in a
    // Japanese line is a non-deterministic guess. Hence イーエックス, not "EX".
    for (const line of loadManifest("announcer.json")) {
      const kyoko = line.segments
        ? line.segments.filter((s) => s.voice === "Kyoko").map((s) => s.text)
        : line.voice === "Kyoko"
          ? [line.text!]
          : [];
      for (const frag of kyoko) {
        expect(/[A-Za-z]/.test(frag), `${line.id}: Latin script in a Kyoko line "${frag}"`).toBe(
          false,
        );
      }
    }
  });

  it("keeps every RETIRED manifest off the live announcer paths", () => {
    cover("audio-announcer-manifest-retired");
    // Nothing in the retire chain has ever been deleted, so each superseded
    // manifest is still runnable — but must be retargeted to its archive
    // directory, or a rerun would silently overwrite the live pack with an old
    // one. (The zh pack in particular renders as Alex, an American man, reading
    // Chinese: its voice Meijia is a phantom that falls back silently.)
    const retired: Record<string, string> = {
      "announcer.zh-TW.json": "retired-zh",
      "announcer.ja-JP-kyoko-retired.json": "retired-ja-kyoko",
      "announcer.jank-novelty-retired.json": "retired-jank-novelty",
    };
    for (const [file, dir] of Object.entries(retired)) {
      const lines = loadManifest(file);
      expect(lines.length, `${file} is non-empty`).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.out, `${file}:${line.id} out is archived`).toMatch(
          new RegExp(`^\\.\\./assets/audio/announcer/${dir}/[a-z0-9-]+\\.mp3$`),
        );
      }
      // and the archive itself is intact on disk, with its NOTE
      expect(
        existsSync(join(CONTENT, "assets/audio/announcer", dir, "NOTE.md")),
        `${dir}/NOTE.md records why it was superseded`,
      ).toBe(true);
    }
  });
});

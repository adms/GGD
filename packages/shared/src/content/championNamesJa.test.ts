/**
 * Champion champ-select CALL-OUT pack gate (task #35, retargeted by task #57).
 *
 * `content/assets/audio/voices/names/MANIFEST.json` is the canonical
 * champion → call-out mapping. It deliberately lives under `content/assets/`
 * rather than `content/config/`: `config/*` is a schema-validated,
 * `_index.json`-indexed collection, so a new doc id there would have to land in
 * the shared zod union AND every rebuilt collection index at the same time as
 * the parallel content builds. Assets are served verbatim from the same
 * `/content/` mount, so the client fetches this file directly.
 *
 * ── THE THING THIS FILE EXISTS TO PIN ───────────────────────────────────────
 * The call-out speaks 稱號 **and** 全名, never the bare name. The user asked for
 * this three separate times and it regressed twice, so it is a test, not a
 * convention. The 稱號 is where the joke lives — 「外掛開很大的死神」,
 * 「至尊學長」, 「美白大法師」 are gags, not labels — and dropping it also made
 * champions INDISTINGUISHABLE: six pairs differ only by title, so a name-only
 * pack rendered them to identical audio, violating task #55's identity rule.
 *
 * If a line runs long the RATE goes up; the title is never trimmed to fit.
 *
 * Like audioAssets.test.ts / announcerVo.test.ts it reads by DIRECT file path
 * (not ContentLoader) so it is green both before and after `content:build`.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { cover } from "../../testkit/cover";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const NAMES_DIR = "assets/audio/voices/names";
const MANIFEST_PATH = join(CONTENT, NAMES_DIR, "MANIFEST.json");
const TTS_MANIFEST_PATH = join(CONTENT, "audio-manifests/champ-names.ja-JP.json");

/** The separator the WC3 authoring convention uses between 稱號 and 全名. */
const TITLE_SEP = " - ";
/** Marks a fragment boundary where the voice changes mid-clip. */
const VOICE_SEP = "‖";

interface Segment {
  voice: string;
  lang: string;
  text: string;
}
interface NameEntry {
  zhName: string;
  zhTitle: string | null;
  zhFullName: string;
  spokenTitle: string | null;
  spokenName: string;
  spokenLine: string;
  lang: string;
  voice: string;
  segments?: Segment[];
  jaTitle: string | null;
  jaName: string | null;
  reading: string;
  evidence: string;
  clip: string;
}
interface NamesDoc {
  champions: Record<string, NameEntry>;
  skipped: { id: string; name: string; why: string }[];
  voice: { rate: number; cast: Record<string, string> };
}
interface TtsLine {
  id: string;
  lang: string;
  voice?: string;
  text?: string;
  segments?: Segment[];
  out: string;
  rate: number;
}

function loadNames(): NamesDoc {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as NamesDoc;
}

function loadTts(): TtsLine[] {
  return JSON.parse(readFileSync(TTS_MANIFEST_PATH, "utf8")) as TtsLine[];
}

/** Every authored champion id → its Chinese name. */
function championNames(): Map<string, string> {
  const dir = join(CONTENT, "champions");
  const out = new Map<string, string>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { id: string; name: string };
    out.set(doc.id, doc.name);
  }
  return out;
}

function isMp3(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // "ID3"
  return buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0; // MPEG frame sync
}

/** Katakana (+ the long mark and the middle dot) — the pack's Japanese alphabet. */
const KATAKANA_ONLY = /^[゠-ヿㇰ-ㇿ・ー\s]+$/;

/** Everything the clip actually says, with the fragment markers removed. */
function spokenText(e: NameEntry): string {
  return e.spokenLine.split(VOICE_SEP).join(" ");
}

describe("champion call-out VO pack", () => {
  it("maps every champion except the declared 測試/範例 placeholders", () => {
    cover("name-vo-covers-roster");
    const doc = loadNames();
    const champs = championNames();
    const skipped = new Set(doc.skipped.map((s) => s.id));
    expect(skipped.size).toBeGreaterThan(0);

    const unmapped = [...champs.keys()].filter((id) => !doc.champions[id] && !skipped.has(id));
    expect(unmapped, `unmapped champions: ${unmapped.join(", ")}`).toEqual([]);

    const unknown = Object.keys(doc.champions).filter((id) => !champs.has(id));
    expect(unknown, `mapped ids that are not champions: ${unknown.join(", ")}`).toEqual([]);

    // the skipped ones really are the placeholders, and got no clip
    for (const s of doc.skipped) {
      expect(champs.get(s.id), `${s.id} still exists`).toBeDefined();
      expect(/測試|範例|placeholder/.test(`${s.name}${s.why}`)).toBe(true);
      expect(existsSync(join(CONTENT, NAMES_DIR, `${s.id}.mp3`))).toBe(false);
    }
  });

  // ── the requirement that keeps regressing ─────────────────────────────────
  it("SPEAKS THE 稱號 AND THE 全名 for every champion that has both", () => {
    cover("name-vo-speaks-title-and-name");
    const doc = loadNames();
    const champs = championNames();
    const skipped = new Set(doc.skipped.map((s) => s.id));

    const withTitle = [...champs.entries()].filter(
      ([id, name]) => name.includes(TITLE_SEP) && !skipped.has(id),
    );
    // 110 of 114 champions are authored "稱號 - 全名"; one of those is the
    // skipped test hero, leaving 109 that must speak both halves.
    expect(withTitle.length, "champions authored with a 稱號").toBe(109);

    for (const [id, zhName] of withTitle) {
      const e = doc.champions[id]!;
      const [zhTitle, zhFullName] = [
        zhName.slice(0, zhName.indexOf(TITLE_SEP)).trim(),
        zhName.slice(zhName.indexOf(TITLE_SEP) + TITLE_SEP.length).trim(),
      ];

      // the split is recorded, and neither half is empty
      expect(e.zhTitle, `${id} zhTitle`).toBe(zhTitle);
      expect(e.zhFullName, `${id} zhFullName`).toBe(zhFullName);
      expect(e.zhTitle!.length, `${id} 稱號 is not empty`).toBeGreaterThan(0);
      expect(e.zhFullName.length, `${id} 全名 is not empty`).toBeGreaterThan(0);

      // the clip says BOTH parts: a title fragment and a name fragment
      const spoken = spokenText(e);
      const titleSpoken = e.spokenTitle;
      const nameSpoken = e.spokenName;
      expect(titleSpoken, `${id} declares a spoken 稱號`).toBeTruthy();
      expect(nameSpoken, `${id} declares a spoken 全名`).toBeTruthy();
      expect(
        spoken.includes(titleSpoken!),
        `${id} (${zhName}) must SPEAK its 稱號 — expected "${titleSpoken}" in "${e.spokenLine}"`,
      ).toBe(true);
      expect(
        spoken.includes(nameSpoken),
        `${id} (${zhName}) must SPEAK its 全名 — expected "${nameSpoken}" in "${e.spokenLine}"`,
      ).toBe(true);

      // the declared 稱號 is either the Chinese one verbatim, or its katakana
      // reading — it can never be some third unrelated string
      expect(
        titleSpoken === zhTitle || titleSpoken === e.jaTitle,
        `${id} spokenTitle "${titleSpoken}" must be the 稱號 or its katakana reading`,
      ).toBe(true);

      // 稱號 FIRST, then 全名 — the anime-intro cadence, not the reverse
      expect(
        spoken.indexOf(titleSpoken!),
        `${id} speaks the 稱號 before the 全名`,
      ).toBeLessThan(spoken.indexOf(nameSpoken));
    }
  });

  it("handles the four champions authored WITHOUT a 稱號 gracefully", () => {
    cover("name-vo-titleless-champions");
    const doc = loadNames();
    const champs = championNames();
    const skipped = new Set(doc.skipped.map((s) => s.id));
    const titleless = [...champs.entries()]
      .filter(([id, name]) => !name.includes(TITLE_SEP) && !skipped.has(id))
      .map(([id]) => id);
    expect(titleless.sort()).toEqual(["godie-h02s", "godie-h02z", "sela", "thorne"]);
    for (const id of titleless) {
      const e = doc.champions[id]!;
      expect(e.zhTitle, `${id} has no 稱號`).toBeNull();
      expect(e.zhFullName, `${id} 全名 is the whole name`).toBe(champs.get(id));
      expect(e.spokenLine.trim().length, `${id} still says something`).toBeGreaterThan(0);
    }
  });

  it("gives champions that differ ONLY by 稱號 genuinely distinct call-outs", () => {
    cover("name-vo-title-disambiguates");
    const doc = loadNames();
    // These pairs share a character but carry different titles. Under the old
    // name-only pack they rendered identical audio; the title is what makes them
    // distinct clips, which is the whole point of task #55's identity rule.
    const pairs: [string, string][] = [
      ["godie-h01n", "godie-h01o"], // 開外掛的死神 vs 外掛開很大的死神 — 黑崎一護
      ["godie-o00x", "godie-ogrh"], // 超級賽亞人 vs 賽亞人 — 悟空
      ["godie-o02l", "godie-ofar"], // 神騎寶貝 vs 神奇寶貝兒 — 皮卡丘
      ["godie-u00b", "godie-udea"], // 最M的魔法Jizz vs 至尊學長 — 飛鼠先生
      ["godie-o01z", "godie-o02v"], // 魔砲少女 vs 白色惡魔 — 高町奈葉
      ["godie-u00l", "godie-umal"], // 北斗之鼠 vs 北斗神拳掌門人 — 拳四郎
    ];
    for (const [a, b] of pairs) {
      const ea = doc.champions[a]!;
      const eb = doc.champions[b]!;
      expect(ea, `${a} mapped`).toBeDefined();
      expect(eb, `${b} mapped`).toBeDefined();
      expect(ea.zhTitle, `${a}/${b} really do differ by title`).not.toBe(eb.zhTitle);
      expect(
        ea.spokenLine,
        `${a} and ${b} must not speak the same line (that is the bug this pins)`,
      ).not.toBe(eb.spokenLine);
    }
  });

  it("speaks the EXPECTED katakana for a handful of unmistakable characters", () => {
    cover("name-vo-known-readings");
    const doc = loadNames();
    // Every other test here is structural: katakana-only, title-before-name,
    // siblings-must-differ. None of them would notice if the CASTING table in
    // tools/tts-gen/src/build-champ-names.mjs regressed 皮卡丘 to "ピカチューー"
    // or swapped two champions' readings outright. These are the readings no
    // reasonable person disputes, so pinning them costs nothing and catches that.
    const KNOWN: Record<
      string,
      { zhName: string; jaTitle: string | null; jaName: string; spokenLine: string }
    > = {
      // both 皮卡丘 heroes — same character, different 稱號
      "godie-o02l": {
        zhName: "神騎寶貝 - 皮卡丘",
        jaTitle: null,
        jaName: "ピカチュウ",
        spokenLine: "神騎寶貝， ‖ ピカチュウ。",
      },
      "godie-ofar": {
        zhName: "神奇寶貝兒 - 皮卡丘",
        jaTitle: null,
        jaName: "ピカチュウ",
        spokenLine: "神奇寶貝兒， ‖ ピカチュウ。",
      },
      // 灼眼のシャナ — the 稱號 is itself Japanese, so the whole line is Kyoko
      "godie-e008": {
        zhName: "火霧戰士 - 夏娜",
        jaTitle: "フレイムヘイズ",
        jaName: "シャナ",
        spokenLine: "フレイムヘイズ・シャナ。",
      },
      // both 悟空 heroes — the titles differ by exactly スーパー, which is the
      // pair a swap would silently survive under nv-03's "they differ" check
      "godie-o00x": {
        zhName: "超級賽亞人 - 悟空",
        jaTitle: "スーパーサイヤジン",
        jaName: "ソンゴクウ",
        spokenLine: "スーパーサイヤジン・ソンゴクウ。",
      },
      "godie-ogrh": {
        zhName: "賽亞人 - 悟空",
        jaTitle: "サイヤジン",
        jaName: "ソンゴクウ",
        spokenLine: "サイヤジン・ソンゴクウ。",
      },
      // both 黑崎一護 heroes — Mandarin 稱號, Japanese name
      "godie-h01n": {
        zhName: "開外掛的死神 - 黑崎一護",
        jaTitle: null,
        jaName: "クロサキイチゴ",
        spokenLine: "開外掛的死神， ‖ クロサキイチゴ。",
      },
      "godie-h01o": {
        zhName: "外掛開很大的死神 - 黑崎一護",
        jaTitle: null,
        jaName: "クロサキイチゴ",
        spokenLine: "外掛開很大的死神， ‖ クロサキイチゴ。",
      },
    };

    for (const [id, want] of Object.entries(KNOWN)) {
      const e = doc.champions[id];
      expect(e, `${id} mapped`).toBeDefined();
      // the id still belongs to the character these readings were cast for
      expect(e!.zhName, `${id} is still ${want.zhName}`).toBe(want.zhName);
      expect(e!.jaTitle, `${id} jaTitle`).toBe(want.jaTitle);
      expect(e!.jaName, `${id} jaName`).toBe(want.jaName);
      expect(e!.spokenLine, `${id} spokenLine`).toBe(want.spokenLine);
    }
  });

  it("gives every entry the documented shape, with the live zhName", () => {
    cover("name-vo-entry-shape");
    const doc = loadNames();
    const champs = championNames();

    for (const [id, e] of Object.entries(doc.champions)) {
      // zhName is the WHOLE authored string — display text cannot drift from content
      expect(e.zhName, `${id} zhName`).toBe(champs.get(id));
      expect(e.spokenLine.trim().length, `${id} spokenLine`).toBeGreaterThan(0);
      expect(e.reading.length, `${id} reading`).toBeGreaterThan(0);
      expect(e.evidence.length, `${id} evidence`).toBeGreaterThan(0);
      expect(e.clip, `${id} clip`).toBe(`${NAMES_DIR}/${id}.mp3`);
      expect(e.voice.length, `${id} voice`).toBeGreaterThan(0);

      // Japanese fragments stay katakana: Kyoko mis-reads bare Chinese kanji
      if (e.jaName !== null) {
        expect(KATAKANA_ONLY.test(e.jaName), `${id} jaName "${e.jaName}" is katakana`).toBe(true);
      }
      if (e.jaTitle !== null) {
        expect(KATAKANA_ONLY.test(e.jaTitle), `${id} jaTitle "${e.jaTitle}" is katakana`).toBe(true);
      }

      // a multi-voice line declares its segments, and they reconstruct the line
      if (e.spokenLine.includes(VOICE_SEP)) {
        expect(e.segments, `${id} multi-voice line declares segments`).toBeDefined();
        expect(e.segments!.length, `${id} segment count`).toBe(e.spokenLine.split(VOICE_SEP).length);
        expect(e.segments!.map((s) => s.text).join(" ‖ "), `${id} segments match spokenLine`).toBe(
          e.spokenLine,
        );
        expect(e.voice.split(VOICE_SEP).length, `${id} voice names per fragment`).toBe(
          e.segments!.length,
        );
      } else {
        expect(e.segments, `${id} single-voice line has no segments`).toBeUndefined();
      }
    }
  });

  it("NEVER puts Latin script in a Kyoko fragment", () => {
    cover("name-vo-no-latin-in-kyoko");
    const doc = loadNames();
    // `say -v Kyoko "Fight"` is BYTE-IDENTICAL to `say -v Kyoko "ファイト"`:
    // Kyoko transliterates Latin to katakana internally, so Latin text in a
    // Japanese fragment is a non-deterministic guess, not a reading.
    for (const [id, e] of Object.entries(doc.champions)) {
      const kyokoFragments = e.segments
        ? e.segments.filter((s) => s.voice === "Kyoko").map((s) => s.text)
        : e.voice === "Kyoko"
          ? [e.spokenLine]
          : [];
      for (const frag of kyokoFragments) {
        expect(/[A-Za-z]/.test(frag), `${id}: Latin script in a Kyoko fragment "${frag}"`).toBe(
          false,
        );
      }
    }
  });

  it("casts NO novelty/character voices (the pack is 字正腔圓, not 機械音)", () => {
    cover("name-vo-no-novelty-voices");
    const doc = loadNames();
    // The formant synthesisers have essentially no energy above ~2.5 kHz, so
    // they physically cannot articulate the consonants a 12-mora 稱號 needs.
    // Four of them were cast here once; all four were reverted.
    const BANNED = [
      "eddy", "flo", "grandma", "grandpa", "reed", "rocko", "sandy", "shelley",
      "zarvox", "trinoids", "whisper", "albert", "bahh", "boing", "bells",
      "organ", "jester", "bubbles", "wobble", "superstar", "good news",
      "bad news", "cellos",
    ];
    const CAST = new Set(["Kyoko", "Tingting", "Karen"]);
    for (const [id, e] of Object.entries(doc.champions)) {
      for (const v of e.voice.split(VOICE_SEP).map((s) => s.trim())) {
        expect(CAST.has(v), `${id} casts an approved voice, got "${v}"`).toBe(true);
        expect(
          BANNED.some((b) => v.toLowerCase().includes(b)),
          `${id} must not cast the novelty voice "${v}"`,
        ).toBe(false);
      }
    }
  });

  it("stages a real, non-empty MP3 for every mapped champion", () => {
    cover("name-vo-clips-exist");
    const doc = loadNames();
    const ids = Object.keys(doc.champions);
    expect(ids.length).toBeGreaterThan(100);
    for (const id of ids) {
      const file = join(CONTENT, doc.champions[id]!.clip);
      expect(existsSync(file), `${id} clip exists`).toBe(true);
      expect(statSync(file).size, `${id} clip non-empty`).toBeGreaterThan(512);
      expect(isMp3(readFileSync(file)), `${id} clip is an mp3`).toBe(true);
    }
  });

  it("keeps the tts-gen manifest in lockstep (same ids, text and outputs)", () => {
    cover("name-vo-generator-in-sync");
    const doc = loadNames();
    const lines = loadTts();
    expect(lines.length).toBe(Object.keys(doc.champions).length);
    const byId = new Map(lines.map((l) => [l.id, l]));
    for (const [id, e] of Object.entries(doc.champions)) {
      const line = byId.get(`name-${id}`);
      expect(line, `tts line for ${id}`).toBeDefined();
      // manifest-relative path (content/audio-manifests → content/assets/...)
      expect(line!.out, `${id} out`).toBe(`../${e.clip}`);
      expect(line!.lang, `${id} lang`).toBe(e.lang);
      if (e.segments) {
        // regenerating cannot drift: same fragments, same voices, same order
        expect(line!.segments, `${id} tts segments`).toEqual(e.segments);
        expect(line!.text, `${id} segmented line has no whole-line text`).toBeUndefined();
      } else {
        expect(line!.text, `${id} text`).toBe(e.spokenLine);
        expect(line!.voice, `${id} voice`).toBe(e.voice);
      }
    }
  });

  it("normalises the whole pack into the announcer's loudness band", () => {
    cover("name-vo-loudness-band");
    const doc = loadNames() as NamesDoc & {
      loudness: { targetLufs: number; truePeakDb: number };
    };
    // The pack used to sit at -21..-27.5 dB, 6-12 dB under the announcer, so a
    // champ-select call-out was audibly quieter than the broadcast that followed.
    expect(doc.loudness.targetLufs, "same target as the announcer pack").toBe(-16);
    expect(doc.loudness.truePeakDb).toBe(-1.5);
    for (const line of loadTts()) {
      expect(line.rate, `${line.id} rate`).toBeGreaterThanOrEqual(185);
      expect(
        (line as unknown as { targetLufs: number }).targetLufs,
        `${line.id} targetLufs`,
      ).toBe(-16);
    }
  });
});

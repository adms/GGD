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

function namesIn(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { id: string; name: string };
    out.set(doc.id, doc.name);
  }
  return out;
}

/**
 * **營運中**的英雄 id → 中文全名。這是「每一位都要有 call-out」的母體。
 *
 * ── 2026-08-13:多了一棵樹 ─────────────────────────────────────────────────
 * owner 把 41 位沒上架的英雄搬到 `content/_legacy/champions/`(不在
 * `COLLECTION_NAMES` 裡,引擎讀不到)。語音包**沒有**跟著搬 —— 那些 mp3 與
 * MANIFEST 條目留著,重新上架時直接可用。所以這支測試有兩個母體:
 *   · 覆蓋率(「有沒有人沒配到」)問的是**營運中**的那些;
 *   · 幽靈條目(「配到了一位不存在的英雄」)問的是**兩棵樹合起來** ——
 *     否則備份區那些條目會讓這條守衛整片紅,而它們其實是對的。
 */
function championNames(): Map<string, string> {
  return namesIn(join(CONTENT, "champions"));
}

/** 備份區(已下架)那些。只用來證明「這個 id 不是幽靈」,不是覆蓋率的母體。 */
function archivedNames(): Map<string, string> {
  return namesIn(join(CONTENT, "_legacy/champions"));
}

/** 兩棵樹合起來 —— 「這個 id 存在嗎 / 它的中文名是什麼」的唯一答案。 */
function allNames(): Map<string, string> {
  return new Map([...archivedNames(), ...championNames()]);
}

/**
 * 沒有 稱號 的那幾位(全名裡沒有 `" - "`)。這是一張**名單**,不是一個數字:一位
 * 英雄悄悄掉了 稱號,會從「有稱號」那一組掉進這一組,底下兩條測試同時紅。
 * ⚠️ 2026-08-13 godie-h02s(死亡騎士)與 godie-h02z(不良少年)隨著未上架英雄
 * 搬進 `content/_legacy/`,所以營運母體只剩兩位非 w3x 原創角色。
 */
const TITLELESS_IDS = ["sela", "thorne"];

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

    // 覆蓋率:**營運中**的每一位都要有 call-out(或被明確宣告跳過)。
    const unmapped = [...champs.keys()].filter((id) => !doc.champions[id] && !skipped.has(id));
    expect(unmapped, `unmapped champions: ${unmapped.join(", ")}`).toEqual([]);

    // 幽靈條目:配到的 id 必須真的是一張英雄卡 —— 營運中或備份區都算,但不能兩邊
    // 都沒有(那就是打錯 id,或是一位英雄被真的刪掉而語音包沒跟上)。
    const known = allNames();
    const unknown = Object.keys(doc.champions).filter((id) => !known.has(id));
    expect(unknown, `mapped ids that are not champions: ${unknown.join(", ")}`).toEqual([]);

    // the skipped ones really are the placeholders, and got no clip
    for (const s of doc.skipped) {
      expect(known.get(s.id), `${s.id} still exists`).toBeDefined();
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
    // ⚠️ 以前這裡是 `toBe(114)`,而 114 是「119 隻英雄」時代的出貨值。2026-08-13
    // 的下架搬遷把它變成 76,而**那個 76 一樣會過期** —— 每一次上架/下架都會動它
    // (第零守則:出貨值不住在測試裡)。所以不換數字,換形狀。
    //
    // 這一格要擋的事沒有變:**一位英雄的 稱號 悄悄不見了**。掉了 稱號 的人會從
    // 這一組掉進「無稱號」那一組,所以只要三組加起來剛好蓋滿整個營運母體、
    // 不重不漏,那件事就一定會被下面那條無稱號名單抓到。
    // ⚠️ 只算**還在營運內容裡**的跳過項:唯一那位(godie-u01q 測試英雄)2026-08-13
    // 也搬進了備份區,拿整份 skipped 來加會多算一位。
    const skippedLive = [...skipped].filter((id) => champs.has(id)).length;
    const accounted = withTitle.length + TITLELESS_IDS.length + skippedLive;
    expect(accounted, "有稱號 + 無稱號 + 跳過 要剛好蓋滿營運母體").toBe(champs.size);
    expect(withTitle.length, "反空轉:不可以一位都沒有").toBeGreaterThan(0);

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

  it("handles the champions authored WITHOUT a 稱號 gracefully", () => {
    cover("name-vo-titleless-champions");
    const doc = loadNames();
    const champs = championNames();
    const skipped = new Set(doc.skipped.map((s) => s.id));
    const titleless = [...champs.entries()]
      .filter(([id, name]) => !name.includes(TITLE_SEP) && !skipped.has(id))
      .map(([id]) => id);
    // 名單比對,不是數量比對 —— 一位英雄悄悄掉了 稱號 會在這裡多出一個 id。
    expect(titleless.sort()).toEqual([...TITLELESS_IDS].sort());
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
    // ⭐ 2026-08-27（GH#811）：這張對子表是**手寫**的，而英雄會退休 ——
    //   `godie-u00b` 2026-08-27 搬進 `content/_legacy/champions/` 之後，
    //   這一條就用「u00b mapped: expected undefined to be defined」紅了，
    //   ⚠️ 而那句訊息讀起來像「呼名產生器壞了」，⛔ 真相是「那位英雄下架了」。
    // ⇒ 只驗**今天還在 MANIFEST 裡**的對子；⭐ 並且斷言母體非空
    //   （⛔ 否則全部退休時這一條會變成一個永遠綠的空迴圈 —— 失敗形態③）。
    const live = pairs.filter(([a, b]) => doc.champions[a] && doc.champions[b]);
    expect(
      live.length,
      "⛔ 一對「只差稱號」的英雄都不在架上了 —— 這條守衛變成空轉，請補新的對子",
    ).toBeGreaterThan(0);
    for (const [a, b] of live) {
      const ea = doc.champions[a]!;
      const eb = doc.champions[b]!;
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
    // 兩棵樹合起來:備份區那些條目的 zhName **也**不可以 drift —— 重新上架的時候
    // 沒有人會回頭重跑這個對帳,一份對不上的語音包會直接跟著英雄一起復活。
    const champs = allNames();

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
    // ⭐ 2026-08-27（GH#811）：母體從**推導**來，⛔ 不是一個寫死的 `> 100`。
    //   47 位英雄退休（文件搬進 `content/_legacy/champions/`）之後，呼名 MANIFEST
    //   合法地縮到 71 —— ⚠️ 而 `> 100` 會用**與真相相反**的訊息紅
    //   （它說「呼名少了」，真相是「母體換了」）。
    //   ⇒ 問**關係**：MANIFEST 的每一位都要是**今天還在架上**的英雄，
    //     而架上的每一位都要有呼名。⛔ 兩個方向都要，⛔ 不是一個下限。
    const onRoster = new Set(
      readdirSync(join(CONTENT, "champions"))
        .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
        .map((f) => f.slice(0, -".json".length)),
    );
    expect(onRoster.size, "讀不到任何上架英雄 —— 母體壞了").toBeGreaterThan(10);
    expect(
      ids.filter((id) => !onRoster.has(id)).join(", "),
      "⛔ 呼名 MANIFEST 裡有**已下架**的英雄 —— 產生器該把它移進 retiredCasting",
    ).toBe("");
    expect(
      [...onRoster].filter((id) => !ids.includes(id)).join(", "),
      "⛔ 上架英雄沒有呼名 clip —— 選角時他會沒有聲音",
    ).toBe("");
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

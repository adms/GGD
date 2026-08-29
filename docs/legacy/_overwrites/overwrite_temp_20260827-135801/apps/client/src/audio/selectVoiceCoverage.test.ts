/**
 * task #27 (reopened) — the PROOF half: run the real ladder over the real
 * `content/` tree and assert the property the task is about.
 *
 *   • PUBLIC tier (no copyright-gated overlay): all 113 champions answer, and
 *     every clip the ladder can name is a file that exists on disk. This is the
 *     number the family actually plays against; the previous answer was 16/113.
 *   • Two DIFFERENT characters never answer with the same audio file. The
 *     content tree does contain byte-identical clips, but only between duplicate
 *     docs of the SAME character (#113) — so a click still says who you are.
 *   • `EXCLUDED_NAME_CLIPS` equals the set of name-manifest clips actually
 *     missing from disk, so the pin cannot rot in either direction.
 *   • The shipped voice-pack manifest template parses and contributes nothing.
 *
 * Reads the authored files by DIRECT path (like championVoices.test.ts) so it
 * is green both before and after `content:build`.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { championVoicesFromDoc } from "./championVoice";
import { championNamesFromDoc, championQuotesFromDoc } from "./nameVoice";
import { baseFormIdOf } from "@ggd/shared/content/championForms";
import {
  EXCLUDED_NAME_CLIPS,
  VOICE_PACK_MANIFEST_PATH,
  resolveSelectVoice,
  resolveVoicePackId,
  voicePackFromDoc,
  type SelectVoiceInputs,
  type SelectVoiceTier,
} from "./selectVoiceLadder";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(join(CONTENT, rel), "utf8"));
}

const VOICES = championVoicesFromDoc(readJson("config/champion-voices.json"));
const NAMES = championNamesFromDoc(readJson("assets/audio/voices/names/MANIFEST.json"));
const QUOTES = championQuotesFromDoc(readJson("assets/audio/voices/quotes/quotes.json"));
const PACK = voicePackFromDoc(readJson(VOICE_PACK_MANIFEST_PATH));

/** The tier the family actually plays on ggd.adms.ai: no gated overlay. */
const PUBLIC: SelectVoiceInputs = {
  voices: VOICES,
  pack: PACK,
  blizzard: null,
  names: NAMES,
  quotes: QUOTES,
};

/** Champion ids whose doc lives in a directory (`champions` / `_legacy/champions`). */
function docIds(dir: string): Set<string> {
  return new Set(
    readdirSync(join(CONTENT, dir))
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => f.slice(0, -5)),
  );
}

const LIVE_DOCS = docIds("champions");
const RETIRED_DOCS = docIds("_legacy/champions");

/**
 * The roster the click is actually asked for — ⛔ NOT every key in
 * `champion-voices.json`.
 *
 * ⚠️ GH#744 / GH#811 —— 這一行以前是 `Object.keys(VOICES.champions)`，而那**曾經**
 * 等於出貨名單。2026-08-27 呼名產生器把 **47 位退休英雄**的讀音從 MANIFEST 的
 * `champions` 搬到 `retiredCasting`（「casting kept so the reading is not lost if it
 * returns」），於是那一刻起 `champion-voices.json` 的 119 個 key 裡有 **48 個的英雄
 * 文件住在 `content/_legacy/champions/`** —— 點不到、也不該有人替它們錄音。
 *
 * ⇒ 在那之前這條的「每一位都出得了聲」量的是**退休名單也算在內**的母體，於是
 * `godie-h00w` / `godie-n01b` 兩位退休英雄把它判成紅的。⭐ 紅的是**母體**，
 * ⛔ 不是階梯 —— 而一條用錯母體的守衛會**用錯誤的訊息紅**（失敗形態④）。
 *
 * ⭐ 母體現在**推導**：英雄文件在哪個資料夾就是答案，⛔ 不是一張要有人記得維護的
 * 跳過清單。下一次退休一位，這裡自動跟著走。
 */
const CHAMP_IDS = Object.keys(VOICES?.champions ?? {}).filter((id) => !RETIRED_DOCS.has(id));

function sha(rel: string): string {
  return createHash("sha256").update(readFileSync(join(CONTENT, rel))).digest("hex");
}

describe("select-voice coverage on the PUBLIC tier", () => {
  it("answers for every champion, with files that exist", () => {
    cover("voice-select-coverage");
    // ⭐ 關係，⛔ 不是一個會過期的數字：`champion-voices.json` 覆蓋**每一份**英雄
    // 文件，而每一份文件不是出貨的就是退休的 —— 兩邊剛好把它分完，沒有孤兒。
    // 一個 key 兩邊都查不到 ⇒ 有人加了語音設定卻沒有英雄文件（或反過來刪錯了）。
    const orphans = Object.keys(VOICES?.champions ?? {}).filter(
      (id) => !LIVE_DOCS.has(id) && !RETIRED_DOCS.has(id),
    );
    expect(orphans, "champion-voices.json 有查不到英雄文件的 key").toEqual([]);
    expect(CHAMP_IDS.length, "出貨名單是空的 —— 母體抽壞了").toBeGreaterThan(50);
    expect(new Set(CHAMP_IDS)).toEqual(LIVE_DOCS);

    const silent: string[] = [];
    const missing: string[] = [];
    const byTier: Record<string, number> = {};
    for (const id of CHAMP_IDS) {
      const rung = resolveSelectVoice(id, PUBLIC);
      if (!rung) {
        silent.push(id);
        continue;
      }
      byTier[rung.tier] = (byTier[rung.tier] ?? 0) + 1;
      for (const clip of rung.clips) {
        if (!existsSync(join(CONTENT, clip))) missing.push(`${id}: ${clip}`);
      }
    }
    expect(silent).toEqual([]);
    expect(missing).toEqual([]);
    // The composition is asserted, not just the total: a regression that
    // silently promoted the 名言 floor over the name rung would keep 71/71.
    // Rungs: 1 authored map-quip · 2 generated CosyVoice3 pack (incl. the
    // 變身 form share, owner 2026-07-26「變身前/後共用就好」) · 3 soundset ·
    // 4 JP name call-out · 5 名言 floor (machine TTS).
    //
    // ⭐ MEASURED 2026-08-27 over the LIVE roster (see CHAMP_IDS above), and the
    // shape is the headline: **`quote` is 0**. Not one shipping champion falls to
    // the machine-TTS floor any more — every click is either a real map quip or
    // the champion's own cloned voice, with 6 on the JP call-out.
    //
    // ⚠️ 這一行以前是 `{authored:17, generated:57, name:43, quote:2}`，⛔ 而那個母體
    // 含 48 位退休英雄。⇒ 差額**不是**任何東西壞掉：`authored 17→13` /
    // `generated 57→52` / `name 43→6` / `quote 2→0` 全部是那 48 位離場帶走的。
    // 退休名單本來就不該被算進「家裡真的玩得到的那個數字」。
    //
    // 加總單獨驗一次：⛔ 不要讓「有人靜靜地掉出所有階梯」躲在四個數字的算術裡。
    expect(Object.values(byTier).reduce((a, b) => a + b, 0)).toBe(CHAMP_IDS.length);
    expect(byTier).toEqual({ authored: 13, generated: 52, name: 6 });
  });

  it("never gives two DIFFERENT characters the same audio file — outside the two the w3x already shared", () => {
    cover("voice-select-coverage");
    // A champion's "character" is its 名言 pack `name`: equal for the duplicate
    // docs of one character (#113), different for everyone else. The content
    // tree DOES hold byte-identical clips — 20 groups of them — and every one
    // is a character duplicated across hero numbers, so a click still says who
    // you are. Grouped by file content, not by path, because that is the
    // property a listener has.
    const quotes = QUOTES?.quotes ?? {};
    const byFile = new Map<
      string,
      { tier: SelectVoiceTier; who: Set<string>; ids: Set<string>; clip: string }
    >();
    for (const id of CHAMP_IDS) {
      const rung = resolveSelectVoice(id, PUBLIC);
      if (!rung) continue;
      for (const clip of rung.clips) {
        const key = sha(clip);
        const slot = byFile.get(key) ?? {
          tier: rung.tier,
          who: new Set<string>(),
          ids: new Set<string>(),
          clip,
        };
        slot.who.add(quotes[id]?.name ?? id);
        slot.ids.add(id);
        byFile.set(key, slot);
      }
    }
    // Two halves of ONE w3x transform pair sharing a clip is not a collision —
    // it is the point (owner 2026-07-26 「變身前/後共用就好」). 妙蛙種子 and its
    // 超進化 妙蛙花 are one character with two 名言 names, proven by the map's own
    // Eme1/Emeu + unsf evidence, so collapse each pair onto its base before
    // asking whether two DIFFERENT characters are sharing audio.
    const collisions = [...byFile.values()].filter(
      (s) => new Set([...s.ids].map(baseFormIdOf)).size > 1 && s.who.size > 1,
    );

    // The rungs THIS task added are clean: no two characters share a clip.
    expect(collisions.filter((c) => c.tier !== "authored")).toEqual([]);

    // …and so is the authored rung, NOW.
    //
    // ⚠️ 這兩行以前釘著兩對 w3x 自己帶進來的碰撞（`dogdie.mp3` = 清蒸飛鼠先生／
    // 飛鼠先生、`kickme.mp3` = 打我阿笨蛋／鬼王達）—— 原作把同一句 quip 綁在兩位
    // 英雄身上，屬於來源內容、修它要重剪地圖音訊。⭐ 而當時的註解自己就寫著
    // 「Neither pair sits in the curated roster today」：⇒ 2026-08-27 那四位隨著
    // 47 位一起退休（`content/_legacy/champions/`），母體一改正它們就自然消失。
    //
    // ⇒ 出貨名單今天是**乾淨的**：⛔ 沒有任何兩位玩得到的英雄共用同一個音檔。
    // 它們哪天回鍋，這一行會紅並指名是哪一對 —— 那時候要做的是重剪音訊，
    // ⛔ 不是把它們再釘回來。
    expect(
      collisions
        .map((c) => `${c.clip} = ${[...c.who].sort().join(" / ")}`)
        .sort(),
    ).toEqual([]);
  });

  it("pins EXCLUDED_NAME_CLIPS to the clips actually missing from disk", () => {
    cover("voice-select-coverage");
    const declared = [...EXCLUDED_NAME_CLIPS].sort();
    const actual = new Set<string>();
    for (const entry of Object.values(NAMES?.champions ?? {})) {
      for (const seg of entry.voSegments) {
        if (!existsSync(join(CONTENT, seg.clip))) actual.add(seg.clip);
      }
      if (!existsSync(join(CONTENT, entry.clip))) actual.add(entry.clip);
    }
    // Equality both ways: regenerating godie-e00j.name.mp3 must delete the pin,
    // and a newly-lost clip must be added, or a champion goes quiet unnoticed.
    expect([...actual].sort()).toEqual(declared);
  });
});

describe("the generated voice pack, as shipped today", () => {
  it("populates 51 CosyVoice3 heroes and drives a live generated rung", () => {
    cover("voice-select-pack");
    expect(PACK).not.toBeNull();
    // The voice-gen indexer folded the lines/ corpus in: 51 packed champions,
    // each with a non-empty synthesized select pool.
    expect(Object.keys(PACK?.champions ?? {})).toHaveLength(51);
    for (const [id, entry] of Object.entries(PACK?.champions ?? {})) {
      expect(entry.lines["select"]?.length, `${id} select pool`).toBeGreaterThan(0);
    }

    // Rung 2 now answers for exactly the packed heroes that have no authored
    // map-quip (authored wins over generated), and every such hero's clip is a
    // real file on disk — the #184 monoculture break.
    const generated: string[] = [];
    for (const id of CHAMP_IDS) {
      const rung = resolveSelectVoice(id, PUBLIC);
      if (rung?.tier === "generated") {
        generated.push(id);
        for (const clip of rung.clips) {
          expect(existsSync(join(CONTENT, clip)), `${id} → ${clip}`).toBe(true);
        }
      }
    }
    const authoredIds = new Set(
      Object.entries(VOICES?.champions ?? {})
        .filter(([, v]) => v.source === "map-quip" && v.select.length > 0)
        .map(([id]) => id),
    );
    // "Packed" now means RESOLVABLE, not "a key in the manifest": a champion
    // with no pack of its own reaches one through its w3x form counterpart
    // (resolveVoicePackId, owner 2026-07-26 「變身前/後共用就好」). Computed from
    // the same resolver the player hears, so this stays an equality both ways
    // rather than a number someone has to keep in step.
    const packedNonAuthored = CHAMP_IDS.filter(
      (id) => !authoredIds.has(id) && resolveVoicePackId(PACK, id) !== null,
    );
    expect(generated.sort()).toEqual(packedNonAuthored.sort());
    // 57 → 52 for the same reason as the tier table above: the 48 retired
    // champions left the measured roster on 2026-08-27, not the pack.
    expect(generated.length).toBe(52);
  });
});

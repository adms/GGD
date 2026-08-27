#!/usr/bin/env node
// build-champ-names — derive the champion call-out pack from authored content.
//
// The champ-select call-out speaks 稱號 (title), a beat, then 全名 (full name) —
// the anime-intro cadence, read flat. The user asked for this THREE times; the
// pack shipped name-only twice, which threw away the best 惡搞 material in the
// game (「外掛開很大的死神」, 「至尊學長」, 「美白大法師」 are JOKES, not labels)
// and made 6 pairs of champions indistinguishable, because ids that differ ONLY
// in their title collapsed to the same audio.
//
// The 稱號 is NEVER dropped to save time. If a line runs long, the RATE goes up.
//
// This script is the single source of truth for the pack. It reads the authored
// champion names from content/champions/*.json, splits "稱號 - 全名" on " - ",
// joins each id to its CASTING below, and writes:
//
//   content/audio-manifests/champ-names.ja-JP.json      (canonical pack tts-gen input)
//   content/assets/audio/voices/names/MANIFEST.json     (canonical mapping + client)
//   content/assets/audio/voices/names/_tts-mixlang.json (task #120 tts-gen input)
//
// Writing them from one table is what stops the display text and the spoken text
// drifting apart — the failure this pack has had twice.
//
// ── task #120 — the deliberately mixed-language CONFIRM call-out ─────────────
// On top of the canonical pack this ALSO emits, per champion, TWO extra clips
// for a bilingual gag the user asked for by name: the 稱號 read by a CHINESE
// voice and the 全名 read by a JAPANESE voice (「[火霧戰士|中文語音] + [夏娜|日
// 文語音]」). Both halves are the ORIGINAL Traditional-Chinese display text — the
// joke is a Japanese voice reading the Chinese name back with Japanese kana
// readings, right after a Mandarin voice announced the title. These are separate
// per-half clips (<id>.title.mp3 / <id>.name.mp3) recorded on each entry's
// `voSegments`, and the client (nameVoice.ts) plays them 稱號→全名 in order.
//
// This is ADDITIVE: the canonical single-clip pack (<id>.mp3, spokenLine, jaName,
// …) is untouched, so the pack's structural gate keeps passing; the mixed-
// language clips live alongside it under new names.
//
// Usage:  node tools/tts-gen/src/build-champ-names.mjs
// Then:   node tools/tts-gen/src/generate.mjs content/audio-manifests/champ-names.ja-JP.json
//         node tools/tts-gen/src/generate.mjs content/assets/audio/voices/names/_tts-mixlang.json

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const CONTENT = path.join(REPO, "content");
const NAMES_DIR = "assets/audio/voices/names";

/** Pack-wide pacing. Uniform across every voice — evenness IS the announcer signal. */
const RATE = 185;
/**
 * Per-line rate overrides for call-outs that overrun the ~3.1 s budget.
 *
 * THIS IS THE ONLY SANCTIONED FIX FOR A LONG LINE. The 稱號 is never trimmed and
 * never dropped — if the announcement does not fit, the announcer talks faster,
 * exactly as a real one would. Measured at 185 wpm: u012 3.29 s, u00b 3.14 s.
 */
const RATE_OVERRIDE = {
  "godie-u012": 205, // 重金屬樂團的怪物 - 克勞薩II世 — 13-mora title + 11-mora name
  "godie-u00b": 200, // 最M的魔法Jizz - 清蒸 飛鼠先生 — Latin inside the Mandarin title
};
const TARGET_LUFS = -16;
const TRUE_PEAK_DB = -1.5;

// ── task #120: the mixed-language CONFIRM call-out (稱號 zh + 全名 ja) ────────
/**
 * The 稱號 goes to a CHINESE voice, the 全名 to Kyoko. Meijia (zh_TW) — the
 * Traditional/Taiwan Mandarin voice — is a PHANTOM on macOS (`say -v Meijia`
 * renders BYTE-IDENTICAL to an unknown voice name, i.e. the silent fallback), so
 * the 稱號 is cast to Tingting (zh_CN Mandarin) instead. Tingting is verified to
 * read TRADITIONAL characters correctly — the canonical pack already leans on
 * exactly that for its Mandarin 稱號 fragments — so no character is dropped.
 */
/**
 * GH#744 — 全名 fragments the JAPANESE voice physically cannot pronounce, and
 * the reading it is fed instead. TTS INPUT ONLY: the displayed 全名 is unchanged
 * (it comes from `zhName`, not from here), so the gag survives intact.
 *
 * ⭐ MEASURED, not assumed. `say -v Kyoko -r 185 -o x.aiff "騜"` renders
 * **0.030 s** — digital silence, because 騜 is outside Kyoko's lexicon. That is
 * under `generate.mjs`'s 0.15 s floor, so the line threw, `godie-e00j.name.mp3`
 * was never written, and `selectVoiceLadder.EXCLUDED_NAME_CLIPS` had to pin the
 * 404 to keep the champion audible. Control: 「ホアン」 renders 0.372 s.
 *
 * ⚠️ This is deliberately a TABLE, not an `if`. The next unpronounceable glyph
 * gets a row and a reason; it does not get a second code path. A row is only
 * legitimate when the CANNOT-SPEAK claim is measured — the reading itself is not
 * invented here either: 「ホアン」 is the same on'yomi this champion's
 * `spokenName` already carries.
 */
const MIX_JA_READING_OVERRIDE = Object.freeze({
  "godie-e00j": {
    // 皇者 - 騜
    text: "ホアン",
    why: "`say -v Kyoko` renders 騜 as 0.030 s of silence (measured 2026-08-27); ホアン is this entry's own spokenName reading.",
  },
});

const MIX_ZH_VOICE = "Tingting";
/** The 稱號 text is Traditional Chinese; the explicit voice bypasses the (absent) zh-TW default. */
const MIX_ZH_LANG = "zh-TW";
const MIX_JA_VOICE = "Kyoko";
const MIX_JA_LANG = "ja-JP";
/**
 * The mixed-language tts-gen input lives INSIDE the names dir (an owned asset
 * folder), so its relative `out` paths resolve straight into it and it never has
 * to reach into content/audio-manifests/. Leading underscore keeps it visually
 * apart from the champion clips it sits next to.
 */
const MIX_TTS_MANIFEST = "_tts-mixlang.json";

/** The test/placeholder hero that gets no clip. */
const SKIPPED = [
  { id: "godie-u01q", name: "測試英雄 - 索隆", why: "test hero (測試英雄) — placeholder duplicate of godie-u01u" },
];

/**
 * CASTING TABLE — one row per champion.
 *
 *   mode "ja"     Kyoko reads the whole line: <titleKana>・<nameKana>。
 *                 Used when a Japanese ORIGINAL exists (restore it, do not
 *                 translate) or when Sino-Japanese on'yomi is the CORRECT
 *                 reading of a Chinese name.
 *   mode "zh+ja"  Tingting reads the 稱號 in Mandarin, hands to Kyoko for the
 *                 Japanese name. Used when the 稱號 is untranslatable Taiwanese
 *                 — PTT slang, campus hierarchy, local TV, class satire — where
 *                 a Japanese rendering would lose the sneer.
 *   mode "zh+en"  Tingting reads the 稱號, Karen reads a genuinely English name.
 *   mode "en"     Karen reads the whole line (the two non-w3x champions).
 *
 * Fields: [mode, title, titleReading, name, nameReading]
 *   title        katakana (ja) or the Chinese/English text (zh+*, en)
 *   titleReading romaji/pinyin for human review; null when the title text is
 *                already displayed in its own script
 *   name         katakana (or English)
 *   name/title may be null for the 4 champions authored without a 稱號.
 */
const CASTING = {
  // ── RULE 1 — a Japanese ORIGINAL exists: restore it. ──────────────────────
  "godie-e001": ["ja", "ヒグラシノナクコロニ", "Higurashi no Naku Koro ni", "リュウグウレナ", "Ryuuguu Rena"],
  "godie-e00n": ["ja", "ヒグラシノナクコロニ", "Higurashi no Naku Koro ni", "リュウグウレナ", "Ryuuguu Rena"],
  "godie-e008": ["ja", "フレイムヘイズ", "Flame Haze", "シャナ", "Shana"],
  "godie-e00r": ["ja", "ハンヨウヒトガタケッセンヘイキ", "Han'you Hitogata Kessen Heiki", "ショゴウキ", "Shogouki"],
  "godie-e00t": ["ja", "リング", "Ring", "ヤマムラサダコ", "Yamamura Sadako"],
  "godie-e00u": ["ja", "カンゼンデショウシャナジュウシャ", "Kanzen de Shousha na Juusha", "イザヨイサクヤ", "Izayoi Sakuya"],
  "godie-emfr": ["ja", "マホウセンセイ", "Mahou Sensei", "ネギスプリングフィールド", "Negi Springfield"],
  "godie-h022": ["ja", "シロキツバサ", "Shiroki Tsubasa", "ネギスプリングフィールド", "Negi Springfield"],
  "godie-hart": ["ja", "ファイナルファンタジー", "Final Fantasy", "クラウドストライフ", "Cloud Strife"],
  "godie-o00x": ["ja", "スーパーサイヤジン", "Suupaa Saiyajin", "ソンゴクウ", "Son Gokuu"],
  "godie-ogrh": ["ja", "サイヤジン", "Saiyajin", "ソンゴクウ", "Son Gokuu"],
  "godie-o01z": ["ja", "マホウショウジョ", "Mahou Shoujo", "タカマチナノハ", "Takamachi Nanoha"],
  "godie-o02v": ["ja", "シロイアクマ", "Shiroi Akuma", "タカマチナノハ", "Takamachi Nanoha"],
  "godie-umal": ["ja", "ホクトシンケンデンショウシャ", "Hokuto Shinken Denshousha", "ケンシロウ", "Kenshirou"],
  "godie-u00l": ["ja", "ホクトノネズミ", "Hokuto no Nezumi", "ケンシロウ", "Kenshirou"],
  "godie-nbst": ["ja", "ヘンタイセイギ", "Hentai Seigi", "ヘンタイカメン", "Hentai Kamen"],
  "godie-hblm": ["ja", "ジヒノオウジャ", "Jihi no Ouja", "ガッシュベル", "Gash Bell"],
  "godie-n003": ["ja", "ダークエヴァンジェル", "Dark Evangel", "エヴァンジェリン", "Evangeline"],
  "godie-n01g": ["ja", "ダークエヴァンジェル", "Dark Evangel", "エヴァンジェリン", "Evangeline"],
  "godie-h02r": ["ja", "タネポケモン", "Tane Pokemon", "フシギバナ", "Fushigibana"],
  "godie-hgam": ["ja", "タネポケモン", "Tane Pokemon", "フシギダネ", "Fushigidane"],
  "godie-hpb1": ["ja", "ケモノノヤリノケイショウシャ", "Kemono no Yari no Keishousha", "アオツキウシオ", "Aotsuki Ushio"],
  "godie-huth": ["ja", "スーパーブウ", "Suupaa Buu", "マジンブウ", "Majin Buu"],
  "godie-hlgr": ["ja", "ガンダム", "Gundam", "キラヤマト", "Kira Yamato"],
  "godie-ewrd": ["ja", "テンジョウテンゲ", "Tenjou Tenge", "ナツメマヤ", "Natsume Maya"],
  "godie-emns": ["ja", "キラ", "Kira", "ヤガミライト", "Yagami Raito"],
  "godie-e00w": ["ja", "シンメイリュウケンシ", "Shinmeiryuu Kenshi", "サクラザキセツナ", "Sakurazaki Setsuna"],
  "godie-e00x": ["ja", "シンメイリュウケンシ", "Shinmeiryuu Kenshi", "サクラザキセツナ", "Sakurazaki Setsuna"],
  "godie-nplh": ["ja", "シャーマン", "Shaman", "アサクラヨウ", "Asakura You"],
  "godie-n00p": ["ja", "ヨウコクラマ", "Youko Kurama", "ミナミノシュウイチ", "Minamino Shuuichi"],
  "godie-nsjs": ["ja", "ヨウコクラマ", "Youko Kurama", "ミナミノシュウイチ", "Minamino Shuuichi"],
  "godie-n01c": ["ja", "デンセツノリュウノキシ", "Densetsu no Ryuu no Kishi", "ダイ", "Dai"],
  "godie-nbbc": ["ja", "デンセツノリュウノキシ", "Densetsu no Ryuu no Kishi", "ダイ", "Dai"],
  "godie-ntin": ["ja", "ジクウカンリキョクシツムカン", "Jikuu Kanrikyoku Shitsumukan", "フェイトテスタロッサ", "Fate Testarossa"],
  "godie-o00k": ["ja", "ツンデレデンキネズミ", "Tsundere Denki Nezumi", "ピカムスメ", "Pika Musume"],
  "godie-o00l": ["ja", "ジュウシンカン", "Juushinkan", "ゼロス", "Zeros"],
  "godie-o02s": ["ja", "ユウウツショウジョ", "Yuuutsu Shoujo", "スズミヤハルヒ", "Suzumiya Haruhi"],
  "godie-o02p": ["ja", "ムゲンノホシ", "Mugen no Hoshi", "ハツネミク", "Hatsune Miku"],
  "godie-u01u": ["ja", "サントウリュウケンシ", "Santouryuu Kenshi", "ロロノアゾロ", "Roronoa Zoro"],
  "godie-udre": ["ja", "サントウリュウケンシ", "Santouryuu Kenshi", "ロロノアゾロ", "Roronoa Zoro"],
  "godie-u00n": ["ja", "ムギワラノショウネン", "Mugiwara no Shounen", "モンキーディールフィ", "Monkey D. Luffy"],
  "godie-u00o": ["ja", "ムギワラノショウネン", "Mugiwara no Shounen", "モンキーディールフィ", "Monkey D. Luffy"],
  "godie-u034": ["ja", "プロハンター", "Pro Hunter", "ゴンフリークス", "Gon Freecss"],
  "godie-ucrl": ["ja", "プロハンター", "Pro Hunter", "ゴンフリークス", "Gon Freecss"],
  "godie-efur": ["ja", "ゾルディックケノトウシュ", "Zoldyck-ke no Toushu", "ゼノゾルディック", "Zeno Zoldyck"],
  "godie-edem": ["ja", "シャリンガンノフクシュウシャ", "Sharingan no Fukushuusha", "ウチハサスケ", "Uchiha Sasuke"],
  "godie-etyr": ["ja", "イヤシケイオウジョ", "Iyashikei Oujo", "コノエコノカ", "Konoe Konoka"],
  "godie-h00l": ["ja", "ジクウノユウシャ", "Jikuu no Yuusha", "リンク", "Link"],
  "godie-h020": ["ja", "クロマドウシ", "Kuro Madoushi", "リナインバース", "Lina Inverse"],
  "godie-hjai": ["ja", "クロマドウシ", "Kuro Madoushi", "リナインバース", "Lina Inverse"],
  "godie-h02y": ["ja", "バクマツノフクシュウキ", "Bakumatsu no Fukushuuki", "シシオマコト", "Shishio Makoto"],
  "godie-hapm": ["ja", "ヘラクレス", "Herakles", "バーサーカー", "Berserker"],
  "godie-hvsh": ["ja", "メドゥーサ", "Medusa", "ライダー", "Rider"],
  "godie-hvwd": ["ja", "ジョマノミコ", "Joma no Miko", "キキョウ", "Kikyou"],
  "godie-osam": ["ja", "イヌヨウカイ", "Inu Youkai", "セッショウマル", "Sesshoumaru"],
  "godie-oshd": ["ja", "キンニクマン", "Kinnikuman", "キオウタツ", "Kiou Tatsu"],
  "godie-orkn": ["ja", "デンシャチカン", "Densha Chikan", "シュウサク", "Shuusaku"],
  "godie-o030": ["ja", "デンシャチカン", "Densha Chikan", "シュウサク", "Shuusaku"], // 30 變態紳士 = orkn 變身
  "godie-naka": ["ja", "サルトビサスケ", "Sarutobi Sasuke", "フウマコジロウ", "Fuuma Kojirou"],
  "godie-e002": ["ja", "アーサーオウ", "Arthur-ou", "セイバー", "Saber"],
  "godie-e00l": ["ja", "アーサーオウ", "Arthur-ou", "セイバー", "Saber"],
  "godie-e00q": ["ja", "エイレイアーサーオウ", "Eirei Arthur-ou", "セイバーオルタ", "Saber Alter"],
  "godie-e007": ["ja", "リュウノコ", "Ryuu no Ko", "テンチシロウ", "Tenchi Shirou"],
  "godie-ewar": ["ja", "リュウノコ", "Ryuu no Ko", "テンチシロウ", "Tenchi Shirou"],
  "godie-e00v": ["ja", "ヒャクエーカーノモリノオウ", "Hyaku Eekaa no Mori no Ou", "クマノプーサン", "Kuma no Puu-san"],
  "godie-e012": ["ja", "サツジンケンカク", "Satsujin Kenkaku", "ササキコジロウ", "Sasaki Kojirou"],
  "godie-e00k": ["ja", "センゴクアサシン", "Sengoku Assassin", "アズミ", "Azumi"],
  "godie-e00z": ["ja", "センゴクアサシン", "Sengoku Assassin", "アズミ", "Azumi"],
  "godie-e00j": ["ja", "コウジャ", "Kouja", "ホアン", "Hoan"],
  "godie-e00s": ["ja", "シラキノロウジュセイ", "Shiraki no Roujusei", "シラキカディナ", "Shiraki Kadina"],
  "godie-e010": ["ja", "シラキノロウジュセイ", "Shiraki no Roujusei", "シラキカディナ", "Shiraki Kadina"], // 70 紮根 = e00s 變身
  "godie-ekee": ["ja", "ホエルケモノ", "Hoeru Kemono", "デンセツノダイトウ", "Densetsu no Daitou"],
  "godie-h001": ["ja", "ジゴクノシュウライシャ", "Jigoku no Shuuraisha", "バンシャー", "Banshee"],
  "godie-hpal": ["ja", "フジミノム", "Fujimi no Mu", "フジイヤクモ", "Fujii Yakumo"],
  "godie-u00h": ["ja", "キチクコウオウ", "Kichiku Kouou", "オニメノキョウ", "Onime no Kyou"],
  "godie-u00j": ["ja", "シンセイノリュウシツ", "Shinsei no Ryuushitsu", "セフィロス", "Sephiroth"],
  "godie-u00k": ["ja", "ジャアクナイネンノシュウゴウタイ", "Jaaku Nainen no Shuugoutai", "シノオウ", "Shi no Ou"],
  "godie-u00v": ["ja", "マフィアノボス", "Mafia no Boss", "キレンレック", "Kiren Rekku"],
  "godie-u010": ["ja", "ジャガンシ", "Jaganshi", "ヒエイ", "Hiei"],
  "godie-uvng": ["ja", "ジャガンシ", "Jaganshi", "ヒエイ", "Hiei"],
  "godie-u011": ["ja", "シノジナン", "Shi no Jinan", "クラウザーサン", "Krauser-san"],
  "godie-u012": ["ja", "ヘヴィメタルバンドノカイブツ", "Heavy Metal Band no Kaibutsu", "ヨハネクラウザーニセイ", "Johannes Krauser II"],
  "godie-ubal": ["ja", "マカイノハシャ", "Makai no Hasha", "ダイマオウバーン", "Daimaou Vearn"],
  "godie-usyl": ["ja", "サツリクノキバ", "Satsuriku no Kiba", "エイリアン", "Alien"],

  // ── RULE 4 — Chinese classical/historical name: on'yomi is CORRECT, not a gag.
  // 曹操 has TWO unit definitions — O02N (base) and O02O (its 87-03 天下號令
  // form). Same character, same authored name, so deliberately the same casting.
  "godie-o02n": ["ja", "ソウソウモウトク", "Sou Sou Moutoku", "アマンサマ", "Aman-sama"],
  "godie-o02o": ["ja", "ソウソウモウトク", "Sou Sou Moutoku", "アマンサマ", "Aman-sama"],
  "godie-opgh": ["ja", "ジョウショウショウグン", "Joushou Shougun", "チョウウンシリュウ", "Chou Un Shiryuu"],
  "godie-h01u": ["ja", "ランセイノオウジャ", "Ransei no Ouja", "リョフホウセン", "Ryofu Housen"],
  "godie-o02w": ["ja", "ショウゴウコウコ", "Shougou Kouko", "レイコチュウ", "Reiko Chuu"],
  "godie-u01f": ["ja", "バンプバクテキ", "Banpu Bakuteki", "チョウヒエキトク", "Chou Hi Ekitoku"],

  // ── the 4 champions authored with NO 稱號 — handled gracefully, name only. ──
  "godie-h02s": ["ja", null, null, "デスナイト", "Death Knight"],
  "godie-h02z": ["ja", null, null, "フリョウショウネン", "Furyou Shounen"],

  // ── RULE 2 — the 稱號 is untranslatable Taiwanese: Tingting reads it. ──────
  "godie-h01o": ["zh+ja", "外掛開很大的死神", null, "クロサキイチゴ", "Kurosaki Ichigo"],
  "godie-h01n": ["zh+ja", "開外掛的死神", null, "クロサキイチゴ", "Kurosaki Ichigo"],
  "godie-udea": ["zh+ja", "至尊學長", null, "ムササビセンセイ", "Musasabi Sensei"],
  "godie-u00b": ["zh+ja", "最M的魔法Jizz", null, "セイジョウムササビセンセイ", "Seijou Musasabi Sensei"],
  "godie-h02n": ["zh+ja", "腦包英雄", null, "ダーウォアーベンダン", "Daa Wo Aa Bendan"],
  "godie-harf": ["zh+ja", "豪洨天王", null, "テイセンセイ", "Tei Sensei"],
  "godie-h00w": ["zh+ja", "豪洨天王", null, "テイセンセイ", "Tei Sensei"], // 26 洨者狀態 = harf 變身
  "godie-e015": ["zh+ja", "夜市人生", null, "キンキョフク", "Kin Kyofuku"],
  "godie-h02u": ["zh+ja", "看似憂鬱的神獸", null, "ツァオニーマー", "Tsao Nii Maa"],
  "godie-h02v": ["zh+ja", "看似憂鬱的神獸", null, "ツァオニーマー", "Tsao Nii Maa"],
  "godie-uwar": ["zh+ja", "食神", null, "サーニャオニウワン", "Saa Nyao Niu Wan"],
  "godie-h02k": ["zh+ja", "國寶級的畜生", null, "パンダ", "Panda"],
  "godie-obla": ["zh+ja", "被剝削的勞工階級", null, "マキタロウ", "Maki Tarou"],
  "godie-h021": ["zh+ja", "破銅爛鐵", null, "コウテツジーグ", "Koutetsu Jeeg"],
  "godie-nman": ["zh+ja", "地獄歌神", null, "ジャイアン", "Gian"],
  "godie-n01b": ["zh+ja", "地獄歌神", null, "ジャイアン", "Gian"], // 40 萬解 = nman 變身
  "godie-ogld": ["zh+ja", "美白大法師", null, "ヘイレンヤーガオ", "Hei Ren Yaa Gao"],
  "godie-o02l": ["zh+ja", "神騎寶貝", null, "ピカチュウ", "Pikachu"],
  "godie-ofar": ["zh+ja", "神奇寶貝兒", null, "ピカチュウ", "Pikachu"],
  "godie-n00b": ["zh+ja", "小叮噹", null, "ドラエモン", "Doraemon"],
  "godie-n01l": ["zh+ja", "學姊", null, "シャオパイ", "Shao Pai"],

  // Original roguelite champion (#215 mob avatar): on'yomi 稱號, 麥可→Michael.
  // Readings are the owner's to tune ("我來修改調整就好").
  "godie-zombiex": ["ja", "セイハイコクデイチャン", "Seihai Kokudei-chan", "ソウヒョウマイケル", "Souhyou Maikeru"],

  // ── RULE 3 — a genuinely English/Western referent: Karen, that fragment only.
  "godie-ecen": ["zh+en", "姜窩肯", null, "Johnnie Walker", "Johnnie Walker"],
  "godie-othr": ["zh+en", "X戰警", null, "Wolverine", "Wolverine"],

  // ── RULE 5 — the two English-named non-w3x champions go wholly to Karen. ───
  sela: ["en", null, null, "Sela, the Ember Sage", "Sela, the Ember Sage"],
  thorne: ["en", null, null, "Thorne, the Bramble Knight", "Thorne, the Bramble Knight"],
};

/**
 * How solid the NAME reading is — "high" unless listed here.
 *
 * This grades the reading, not the casting: "low" means the character has no
 * published Japanese name at all, so a transliteration of the Mandarin was
 * coined and a human review pass is welcome. They are mostly the map's own
 * Taiwanese in-jokes (騜, 打我阿笨蛋, 黑人牙膏, 撒尿牛丸, 小派, 傳說中的大刀,
 * 鬼王達, 白木卡迪那, 基廉列克, 斑剎, 清蒸飛鼠先生).
 */
const CONFIDENCE = {
  "godie-e015": "medium", "godie-h021": "medium", "godie-h02u": "medium",
  "godie-h02v": "medium", "godie-harf": "medium", "godie-h00w": "medium",
  "godie-o00k": "medium",
  "godie-obla": "medium", "godie-u00k": "medium", "godie-udea": "medium",
  "godie-e00j": "low", "godie-e00s": "low", "godie-e010": "low", "godie-ekee": "low",
  "godie-h001": "low", "godie-h02n": "low", "godie-n01l": "low",
  "godie-ogld": "low", "godie-oshd": "low", "godie-u00b": "low",
  "godie-u00v": "low", "godie-uwar": "low",
};

/** Why each casting decision was made — carried into the manifest as `evidence`. */
const EVIDENCE = {
  ja: "RULE 1/4 — Kyoko reads the whole call-out in Japanese. Either a canonical Japanese original exists and is restored, or Sino-Japanese on'yomi is the correct standard Japanese reading of a Chinese name.",
  "zh+ja":
    "RULE 2 — the 稱號 is untranslatable Taiwanese (PTT slang, campus hierarchy, local TV, class satire). Tingting reads it in Mandarin, then hands to Kyoko for the Japanese name. A Japanese rendering would lose the sneer.",
  "zh+en":
    "RULE 3 — the name is a genuinely English/Western referent, so Karen speaks it. The pun only lands if BOTH halves are pronounced correctly by a voice that speaks that language.",
  en: "RULE 5 — a non-w3x champion whose native language IS English. Forcing it into katakana would throw away the only entries where English is native.",
};

// ---- inputs -----------------------------------------------------------------

function championNames() {
  const dir = path.join(CONTENT, "champions");
  const out = new Map();
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    out.set(doc.id, doc.name);
  }
  return out;
}

/**
 * GH#811 — ids whose champion doc now lives in `content/_legacy/champions/`.
 *
 * ⭐ 退休的理由是**量出來的**,⛔ 不是手寫一張 RETIRED 名單:一列 CASTING 之所以
 * 「多餘」,唯一可以被反駁的證據就是**那位英雄的文件搬到 _legacy 去了**。手寫的
 * 名單沒有寫入端 ⇒ 它會過期,而且下一次 roster 再換一批時**不會有東西紅**
 * (CLAUDE.md 第零守則:手寫的表會過期而且不會有東西紅)。
 *
 * ⚠️ 目錄不存在時回**空集合**,於是每一列漂移都退回 fatal —— fail-loud。
 * ⛔ 不可以「讀不到就全部放行」:那會把 roster 真的打錯字也一起吞掉。
 */
function retiredChampionIds() {
  const dir = path.join(CONTENT, "_legacy", "champions");
  const out = new Set();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    out.add(f.slice(0, -".json".length));
  }
  return out;
}

/** Split the authored "稱號 - 全名" convention. 4 champions have no 稱號. */
function splitName(name) {
  const i = name.indexOf(" - ");
  if (i === -1) return { title: null, fullName: name };
  return { title: name.slice(0, i).trim(), fullName: name.slice(i + 3).trim() };
}

// ---- build ------------------------------------------------------------------

const champs = championNames();
const skippedIds = new Set(SKIPPED.map((s) => s.id));
const problems = [];

const champions = {};
const ttsLines = [];
/** task #120 — one tts-gen line per mixed-language half-clip (稱號 zh, 全名 ja). */
const mixLines = [];

for (const [id, zhName] of champs) {
  if (skippedIds.has(id)) continue;
  const cast = CASTING[id];
  if (!cast) {
    problems.push(`no CASTING row for champion ${id} (${zhName})`);
    continue;
  }
  const [mode, title, titleReading, name, nameReading] = cast;
  const { title: zhTitle, fullName: zhFullName } = splitName(zhName);

  if (zhTitle !== null && title === null && mode !== "en") {
    problems.push(`${id}: champion HAS a 稱號 (${zhTitle}) but the casting drops it`);
  }

  const rate = RATE_OVERRIDE[id] ?? RATE;
  const clip = `${NAMES_DIR}/${id}.mp3`;
  const outRel = `../${clip}`;

  // task #120 — the deliberately mixed-language CONFIRM call-out. Both halves are
  // the ORIGINAL Traditional-Chinese text (splitName above), NOT the katakana the
  // canonical pack restores: the gag is Kyoko reading the Chinese 全名 back with
  // Japanese kana readings straight after Tingting announces the 稱號. Titleless
  // champions (godie-h02s/h02z, sela, thorne) get the 全名 segment alone.
  const voSegments = [];
  if (zhTitle) {
    voSegments.push({
      part: "title",
      lang: MIX_ZH_LANG,
      voice: MIX_ZH_VOICE,
      text: zhTitle,
      clip: `${NAMES_DIR}/${id}.title.mp3`,
    });
  }
  // GH#744 — the 全名 fragment is the Chinese text EXCEPT where the Japanese
  // voice cannot pronounce it (see MIX_JA_READING_OVERRIDE); the displayed name
  // is untouched either way.
  voSegments.push({
    part: "name",
    lang: MIX_JA_LANG,
    voice: MIX_JA_VOICE,
    text: MIX_JA_READING_OVERRIDE[id]?.text ?? zhFullName,
    clip: `${NAMES_DIR}/${id}.name.mp3`,
  });
  for (const seg of voSegments) {
    mixLines.push({
      id: `vo-${seg.part}-${id}`,
      lang: seg.lang,
      voice: seg.voice,
      text: seg.text,
      out: `${id}.${seg.part}.mp3`, // relative to MIX_TTS_MANIFEST (the names dir)
      rate: RATE,
      targetLufs: TARGET_LUFS,
      truePeakDb: TRUE_PEAK_DB,
    });
  }

  const base = {
    zhName,
    zhTitle,
    zhFullName,
    // The EXACT substrings of spokenLine that carry each half. These are what
    // the test asserts on, so an entry can never claim to speak a 稱號 it does
    // not actually say — and they cover every casting mode uniformly, including
    // the English-named champions whose 全名 is spoken as "Johnnie Walker"
    // rather than 約翰走路.
    spokenTitle: title,
    spokenName: name,
    jaTitle: mode === "ja" ? title : null,
    jaName: mode === "ja" || mode === "zh+ja" ? name : null,
    reading: titleReading ? `${titleReading} ${nameReading}` : nameReading,
    confidence: CONFIDENCE[id] ?? "high",
    evidence: EVIDENCE[mode],
    clip,
    // task #120 — ordered clips the client plays 稱號→全名 for the mixed-language
    // call-out. Separate from `clip` (the canonical single call-out) on purpose.
    voSegments,
  };

  if (mode === "ja") {
    const spoken = title ? `${title}・${name}。` : `${name}。`;
    champions[id] = { ...base, spokenLine: spoken, lang: "ja-JP", voice: "Kyoko" };
    ttsLines.push({ id: `name-${id}`, lang: "ja-JP", voice: "Kyoko", text: spoken, out: outRel, rate, targetLufs: TARGET_LUFS, truePeakDb: TRUE_PEAK_DB });
  } else if (mode === "zh+ja" || mode === "zh+en") {
    const second = mode === "zh+ja" ? `${name}。` : `${name}.`;
    const secondVoice = mode === "zh+ja" ? "Kyoko" : "Karen";
    const secondLang = mode === "zh+ja" ? "ja-JP" : "en-AU";
    const first = `${title}，`;
    const segments = [
      { lang: "zh-TW", voice: "Tingting", text: first },
      { lang: secondLang, voice: secondVoice, text: second },
    ];
    champions[id] = {
      ...base,
      spokenLine: `${first} ‖ ${second}`,
      lang: `zh-TW ‖ ${secondLang}`,
      voice: `Tingting ‖ ${secondVoice}`,
      segments,
    };
    ttsLines.push({ id: `name-${id}`, lang: `zh-TW ‖ ${secondLang}`, out: outRel, rate, targetLufs: TARGET_LUFS, truePeakDb: TRUE_PEAK_DB, segments });
  } else if (mode === "en") {
    const spoken = `${name}.`;
    champions[id] = { ...base, spokenLine: spoken, lang: "en-AU", voice: "Karen" };
    ttsLines.push({ id: `name-${id}`, lang: "en-AU", voice: "Karen", text: spoken, out: outRel, rate, targetLufs: TARGET_LUFS, truePeakDb: TRUE_PEAK_DB });
  } else {
    problems.push(`${id}: unknown casting mode "${mode}"`);
  }
}

/**
 * GH#811 — 反方向的兩種漂移**刻意不同級**。
 *
 * | 方向 | 級別 | 為什麼 |
 * |---|---|---|
 * | 出貨英雄**缺** CASTING 列 | ⛔ **fatal**（上面那個迴圈） | 漏掉 = 那位英雄**靜默地沒有呼名**，玩家選他時一片安靜 |
 * | CASTING **多**一列，而那位英雄在 `_legacy/` | ⚠️ **警示** | 他被下架了，⛔ 不是我打錯字。casting 知識留著（見下面 manifest 的 `retiredCasting`） |
 * | CASTING **多**一列，而**兩邊都查不到** | ⛔ **fatal** | 這才是真的漂移／打錯字 |
 *
 * ⛔ 在此之前三種一律 fatal ⇒ roster 換過之後這支**執行即 exit 1、一個檔都不寫**
 * ⇒ 它的三份產物永遠停在某一次手改的狀態，而**沒有任何東西會紅**。
 */
const retired = retiredChampionIds();
const retiredCasting = [];
for (const id of Object.keys(CASTING)) {
  if (champs.has(id)) continue;
  if (retired.has(id)) {
    const [mode, title, , name] = CASTING[id];
    retiredCasting.push({
      id,
      mode,
      title,
      name,
      why: `champion doc moved to content/_legacy/champions/${id}.json — retired from the roster, casting kept so the reading is not lost if it returns`,
    });
    continue;
  }
  problems.push(
    `CASTING row ${id} matches neither content/champions/${id}.json nor content/_legacy/champions/${id}.json — real drift, not a retirement`,
  );
}
retiredCasting.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

if (problems.length) {
  for (const p of problems) console.error(`build-champ-names: ${p}`);
  process.exit(1);
}
if (retiredCasting.length) {
  console.warn(
    `build-champ-names: ⚠️ ${retiredCasting.length} CASTING rows are RETIRED (champion doc is in content/_legacy/champions/) — kept in MANIFEST.retiredCasting, no clip emitted: ${retiredCasting.map((r) => r.id).join(", ")}`,
  );
}

// ---- write ------------------------------------------------------------------

const manifest = {
  id: "champion-names-ja",
  schema: "audio.champion-names-ja@2",
  note: "Canonical champion → champ-select CALL-OUT mapping. Lives under content/assets/ (NOT content/config/) on purpose: content/config/* is a schema-validated, _index.json-indexed collection and adding a new doc id there would have to land in packages/shared/src/content/schema/config.ts + every collection index at the same time as parallel content builds. Assets are served verbatim from /content/, so the client fetches this file directly.",
  generatedBy: "node tools/tts-gen/src/build-champ-names.mjs — DO NOT HAND-EDIT. The casting table in that script is the source of truth; this file and the tts-gen manifest are both written from it so display text and spoken text cannot drift.",
  generator: "node tools/tts-gen/src/generate.mjs content/audio-manifests/champ-names.ja-JP.json",
  direction:
    "惡搞, and the joke is the LINE, not the VOICE. The user's correction, verbatim: 「惡搞語音不應該是機械音 而是類似 google 語音那樣字正腔圓講話清楚但不帶感情所以嘲諷」. Every voice here is a real, full-band system voice reading correct text in a language it actually speaks. The comedy is that a composed broadcast voice treats 「外掛開很大的死神」 as a job title.",
  structure:
    "EVERY call-out is 稱號, a beat, then 全名 — a two-beat announcement read flat, in anime-intro cadence. The 稱號 is NEVER dropped: if a line runs long the RATE goes up instead. The 4 champions authored without a 稱號 (godie-h02s 死亡騎士, godie-h02z 不良少年, sela, thorne) speak the name alone.",
  whyTitlesMatter:
    "The 稱號 ARE THE BEST 惡搞 MATERIAL IN THE GAME — they are jokes, not labels (「美白大法師」 is a Taiwanese toothpaste gag, 「至尊學長」, 「鬼畜紅王」, 「外掛開很大的死神」). A name-only pack threw all of it away AND made champions indistinguishable: 6 pairs differ ONLY in their 稱號, so under name-only they collapsed to identical audio (h01n/h01o, e001/e00n, e007/ewar, o00x/ogrh, u00b/udea, o02l/ofar). Under 稱號+全名 they are genuinely distinct clips, consistent with task #55's champion-identity rule.",
  voice: {
    engine: "macOS say (Apple TTS)",
    rate: RATE,
    cast: {
      Kyoko: "ja_JP — the pack's primary voice. Brightest and cleanest-articulating of all 59 voices auditioned (85% rolloff 4054 Hz), which is exactly why a 14-mora compound like ハンヨウヒトガタケッセンヘイキ stays crisply segmented instead of turning to mush.",
      Tingting: "zh_CN — reads the untranslatable Taiwanese 稱號 in Mandarin. Verified to read TRADITIONAL Chinese correctly: Traditional and Simplified forms of the same title render byte-identically, so no character is skipped or spelled out.",
      Karen: "en_AU — the flattest pitch contour of any intelligible voice measured (1.98 semitone SD). Used sparingly, on 4 entries only, where the referent is genuinely English.",
    },
    note: "Multi-voice call-outs use tts-gen's `segments`, which renders each fragment with its native voice and concatenates sample-exactly. NO per-entry novelty-voice overrides: the 4 that existed (godie-h021 Eddy, godie-h02k Grandpa, godie-nman Rocko, godie-obla Reed) were REVERTED — all four are formant synthesisers with no energy above ~2.3 kHz, so they cannot articulate a 12-mora 稱號 intelligibly.",
  },
  fields: {
    zhName: "the champion's authored Chinese name, verbatim from content/champions/<id>.json .name — the WHOLE string, including the 稱號 and the ' - ' separator",
    zhTitle: "the 稱號 half of zhName (null for the 4 champions authored without one)",
    zhFullName: "the 全名 half of zhName",
    spokenTitle: "the exact substring of spokenLine that carries the 稱號 (null when the champion has none). Chinese when Tingting speaks it, katakana when Kyoko does",
    spokenName: "the exact substring of spokenLine that carries the 全名 — katakana, or English for the English-named champions",
    spokenLine: "exactly what is spoken. '‖' separates fragments that are rendered by different voices and concatenated",
    lang: "BCP-47 tag(s); '‖'-separated for a multi-voice line",
    voice: "macOS `say` voice name(s); '‖'-separated for a multi-voice line",
    segments: "present ONLY on multi-voice lines — the tts-gen segment list, verbatim",
    jaTitle: "katakana 稱號 when Kyoko speaks it; null when the 稱號 is spoken in Mandarin or the champion has none",
    jaName: "katakana 全名; null for the English-named champions",
    reading: "romaji of the Japanese fragments, for human review",
    confidence: "how solid the NAME reading is: high = canonical published name; medium = well-supported inference; low = no Japanese name exists, so the Mandarin was transliterated and human review is welcome",
    evidence: "which casting rule applied and why",
    clip: "content-relative mp3 path (base is the same /content/ mount the audio map uses)",
  },
  policy: [
    "Where a Japanese ORIGINAL exists, RESTORE it rather than translating: 超級賽亞人 → スーパーサイヤジン, 最終幻想 → ファイナルファンタジー, 最終泛用人型決戰兵器 → ハンヨウヒトガタケッセンヘイキ, 火霧戰士 → フレイムヘイズ, 七夜怪談 → リング, 黑暗福音 → ダークエヴァンジェル, 種子神奇寶貝 → タネポケモン.",
    "Kanji name without a Japanese original → Sino-Japanese on'yomi. This is the CORRECT and standard Japanese reading of a Chinese historical name (曹操孟德 → ソウソウモウトク, 趙子龍 → チョウウンシリュウ), NOT a mangling gag. It stays because it is right.",
    "Untranslatable Taiwanese 稱號 → spoken in Mandarin by Tingting, handed to Kyoko for the name.",
    "Genuinely English referent → Karen, that fragment only, used sparingly (4 entries).",
    "Katakana for all Japanese fragments: Kyoko mis-reads bare Chinese kanji, katakana is unambiguous. NEVER put Latin text in a Kyoko line — Kyoko transliterates it to katakana internally, so the render is a non-deterministic guess.",
  ],
  loudness: {
    metric: "EBU R128 gated integrated loudness",
    targetLufs: TARGET_LUFS,
    truePeakDb: TRUE_PEAK_DB,
    note: "The pack previously shipped at -21..-27.5 dB, 6-12 dB under the announcer. Short name clips are exactly the case the ungated `volumedetect` mean gets wrong, so the gated R128 metric is used; R128's gate needs a 400 ms block and real clips here are under that, so tts-gen measures on silence-padded audio. Same target as the announcer pack, so a call-out and a broadcast sit at one level.",
  },
  voMixlang: {
    what: "task #120 — the deliberately MIXED-LANGUAGE champ-select CONFIRM call-out. Per champion, `voSegments` lists the 稱號 clip (a CHINESE voice) then the 全名 clip (Kyoko), which the client plays in order. Both halves speak the ORIGINAL Traditional-Chinese display text: the gag is a Japanese voice reading the Chinese 全名 back with Japanese kana readings straight after a Mandarin voice announced the 稱號 — 「[火霧戰士|中文語音] + [夏娜|日文語音]」.",
    zhVoice: MIX_ZH_VOICE,
    jaVoice: MIX_JA_VOICE,
    zhVoiceNote:
      "Meijia (zh_TW, the Traditional/Taiwan Mandarin voice) is a PHANTOM on this macOS — `say -v Meijia` renders BYTE-IDENTICAL to an unknown voice name (the silent fallback), so it is NOT installed. Fell back to Tingting (zh_CN Mandarin), verified to read Traditional characters correctly.",
    ttsManifest: `${NAMES_DIR}/${MIX_TTS_MANIFEST}`,
    clips: "<id>.title.mp3 (稱號, Chinese voice) + <id>.name.mp3 (全名, Kyoko). Titleless champions get the name clip only. A half that a voice cannot pronounce (e.g. Kyoko on the rare kanji 騜) simply does not render, and the client degrades to the half that exists.",
    fields: {
      voSegments:
        "ordered [{part:'title'|'name', lang, voice, text, clip}] — the client plays each `clip` 稱號→全名. `text` is the Traditional-Chinese half spoken by `voice`.",
    },
  },
  skipped: SKIPPED,
  // GH#811 — casting rows for champions that have left the roster. 第一·五守則:
  // 被取代的知識要**另存**,⛔ 不是壓縮取代 —— 這些讀音是查出來的,英雄哪天回鍋
  // 時它就在這裡。`why` 是**量出來的**(那份文件現在住 _legacy/),⛔ 不是手打的理由。
  retiredCasting,
  champions,
};

// ---- write (or --check) -----------------------------------------------------

/**
 * GH#811 — `--check` 逐位元組比對三份產物,過期就紅並**指名那一份**。
 *
 * ⭐ 為什麼需要它:這支產生器**不在 `skills:sync` 的鏈裡**(`sync-io.json` 沒有它,
 * 三份產物也沒被隔離區鎖起來)⇒ 「產生器綠不綠」與「產物新不新」是兩個名詞,
 * 而在此之前**沒有任何東西在問後者**。
 */
const CHECK = process.argv.includes("--check");
const outputs = [
  [path.join(CONTENT, NAMES_DIR, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`],
  [path.join(CONTENT, "audio-manifests/champ-names.ja-JP.json"), `${JSON.stringify(ttsLines, null, 2)}\n`],
  [path.join(CONTENT, NAMES_DIR, MIX_TTS_MANIFEST), `${JSON.stringify(mixLines, null, 2)}\n`],
];

if (CHECK) {
  const stale = [];
  for (const [file, next] of outputs) {
    const rel = path.relative(REPO, file);
    if (!fs.existsSync(file)) stale.push(`${rel} — MISSING`);
    else if (fs.readFileSync(file, "utf8") !== next) stale.push(`${rel} — STALE`);
  }
  if (stale.length) {
    for (const s of stale) console.error(`build-champ-names --check: ${s}`);
    console.error("build-champ-names --check: run `node tools/tts-gen/src/build-champ-names.mjs` and `git add content/`");
    process.exit(1);
  }
  console.log(`build-champ-names --check: ${outputs.length} products up to date`);
  process.exit(0);
}

for (const [file, next] of outputs) fs.writeFileSync(file, next);

const byMode = {};
for (const e of Object.values(champions)) byMode[e.voice] = (byMode[e.voice] ?? 0) + 1;
console.log(`build-champ-names: ${Object.keys(champions).length} champions, ${SKIPPED.length} skipped`);
for (const [v, n] of Object.entries(byMode).sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(3)}  ${v}`);
const titleClips = mixLines.filter((l) => l.id.startsWith("vo-title-")).length;
const nameClips = mixLines.filter((l) => l.id.startsWith("vo-name-")).length;
console.log(
  `build-champ-names: mixed-language pack → ${mixLines.length} clips (${titleClips} 稱號 via ${MIX_ZH_VOICE}, ${nameClips} 全名 via ${MIX_JA_VOICE}) → ${NAMES_DIR}/${MIX_TTS_MANIFEST}`,
);

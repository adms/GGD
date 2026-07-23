#!/usr/bin/env node
// build-champ-quotes — the per-champion famous-quote (名言) pack (task #139).
//
// On champ-select CONFIRM the client already speaks the champion's 稱號→全名
// call-out (task #120). This pack adds a THIRD segment played right after it:
// the champion's signature line — 「海賊王に、俺はなる！」, 「お前はもう死んでいる」,
// 「計画通り」 — spoken in gender-appropriate Japanese, and shown as a quote in
// the champ-select profile panel.
//
// This is the SINGLE SOURCE OF TRUTH for the quote pack. It joins the authored
// research (QUOTES, keyed by the champion's display NAME) to the open roster's
// name→candidate-id map (ROSTER) and writes, keyed by CHAMPION ID:
//
//   content/assets/audio/voices/quotes/quotes.json      (client manifest + display)
//   content/assets/audio/voices/quotes/_tts-quotes.json (tts-gen input)
//
// Then render the clips with the deterministic, idempotent generator:
//
//   node tools/tts-gen/src/generate.mjs content/assets/audio/voices/quotes/_tts-quotes.json
//
// ── why keyed by candidate id, not one canonical id ─────────────────────────
// The open-roster wave (task #138) has NOT yet frozen which of a name's 1–3
// duplicate hero docs becomes the canonical pick, so the quote is applied to
// EVERY candidate id for that name — whichever doc the roster ends up seating,
// the quote (and its rendered clip) is already there. Duplicate ids share the
// same line, so tts-gen renders byte-identical audio into each <id>.mp3; that is
// deterministic and idempotent (skipped on re-run via the .hash sidecar).
//
// ── why it lives under content/assets/, not content/config/ ─────────────────
// Same reason as the names pack (see docs/todo/name-voice.md): config/* is a
// schema-validated, _index.json-indexed collection, so a new doc id there would
// have to land in the shared zod union AND every rebuilt index at once — a
// collision with parallel content builds. Assets are served verbatim from the
// same /content/ mount, so the client fetches this file directly and a 404
// degrades to silence. It is therefore NOT part of `content:validate`; the
// tolerant client parser + apps/client/src/audio/nameVoice.test.ts validate it.
//
// ── voice casting (gender-appropriate, clean) ───────────────────────────────
// female / neutral → Kyoko (the pack's clean primary voice). male → a CLEAN
// Japanese male voice (Otoya/Hattori) resolved the SAME way generate.mjs casts a
// voice: the pref must be LISTED by `say -v '?'` (exact, locale-spelling included,
// so "Otoya (Enhanced)" counts) AND render distinctly from the silent fallback.
// When none of MALE_VOICE_PREFS is installed, male entries are still cast to the
// intended first pref (Otoya) and LEFT UNRENDERED — a separate male-only pass
// fills them once Otoya is installed. Male does NOT fall back to Kyoko (a female
// voice must not stand in for a male line) nor to the novelty formant synths — the
// project direction (verbatim: 「惡搞語音…字正腔圓講話清楚」) forbids those here:
// they cannot articulate a line like 「背中の傷は、剣士の恥だ」 intelligibly, which
// is the whole point of a recognisable quote. The resolved voice is recorded in
// `voice` on each manifest entry (the exact name each clip was rendered with).
//
// Usage:  node tools/tts-gen/src/build-champ-quotes.mjs

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const CONTENT = path.join(REPO, "content");
const QUOTES_DIR = "assets/audio/voices/quotes";
const TTS_MANIFEST = "_tts-quotes.json";

/** Pack-wide pacing + loudness — matched to the names pack so all VO sits level. */
const RATE = 185;
const TARGET_LUFS = -16;
const TRUE_PEAK_DB = -1.5;

const FEMALE_VOICE = "Kyoko";
const NEUTRAL_VOICE = "Kyoko"; // neutral → pick: the clean primary voice
/**
 * Preferred CLEAN Japanese male voices, best first. Resolved against the live
 * `say -v '?'` listing with a phantom probe; the first real one wins, else
 * Kyoko. NOT the novelty formant synths (Grandpa/Eddy/Reed/Rocko) — those are
 * real but cannot articulate a quote intelligibly (see header).
 */
const MALE_VOICE_PREFS = ["Otoya", "Hattori"];

// ── research: the champion → famous-line table (keyed by display NAME) ───────
// gender ∈ {male, female, neutral}. `source` starting with "original" marks a
// community/惡搞 line coined for a character with no canonical quote (recorded as
// real:false in the manifest, for the coverage report).
const QUOTES = [
  { name: "皮卡丘", romaji: "Pikachū!", character: "Pikachu / 寶可夢 (Pokémon)", gender: "neutral", jpQuote: "ピカチュウ！", source: "招牌電氣鼠叫聲，全球最高辨識度", zhGloss: "招牌叫聲，非說話生物" },
  { name: "初音", romaji: "Miku miku ni shite ageru♪", character: "Hatsune Miku / Vocaloid", gender: "female", jpQuote: "みくみくにしてあげる♪", source: "破圈神曲名句，虛擬歌姬招牌", zhGloss: "讓你滿腦子都是初音~" },
  { name: "悟空", romaji: "Ossu! Ora Gokū!", character: "孫悟空 / 七龍珠 (Dragon Ball)", gender: "male", jpQuote: "オッス！オラ悟空！", source: "悟空經典自我介紹口頭禪", zhGloss: "嘿！俺是悟空！" },
  { name: "林克", romaji: "Haiyaa!", character: "Link / 薩爾達傳說 (Zelda)", gender: "male", jpQuote: "ハイヤッ！", source: "林克幾乎不語，僅有揮劍吶喊", zhGloss: "揮劍吶喊(角色近乎沉默)" },
  { name: "蒙其.D.魯夫", romaji: "Kaizoku-ō ni, ore wa naru!", character: "蒙其·D·魯夫 / 航海王 (One Piece)", gender: "male", jpQuote: "海賊王に、俺はなる！", source: "魯夫招牌宣言", zhGloss: "我要成為海賊王！" },
  { name: "克勞德", romaji: "Kyōmi nai ne", character: "Cloud Strife / 太空戰士7 (FFVII)", gender: "male", jpQuote: "興味ないね", source: "克勞德口頭禪，本篇用超過40次", zhGloss: "沒興趣" },
  { name: "哆拉A夢", romaji: "Takekoputā!", character: "哆啦A夢 / Doraemon", gender: "female", jpQuote: "タケコプター！", source: "招牌道具登場名句(機器貓，配音為女聲故選Kyoko)", zhGloss: "竹蜻蜓！招牌道具" },
  { name: "索隆", romaji: "Senaka no kizu wa, kenshi no haji da", character: "羅羅諾亞·索隆 / 航海王 (One Piece)", gender: "male", jpQuote: "背中の傷は、剣士の恥だ", source: "索隆劍士信念名言", zhGloss: "背上的傷是劍士的恥辱" },
  { name: "Saber", romaji: "Toō, anata ga watashi no masutā ka", character: "Saber (阿爾托莉亞) / Fate/stay night", gender: "female", jpQuote: "問おう、あなたが私のマスターか", source: "Saber召喚登場第一句台詞", zhGloss: "我問你，你是我的Master嗎" },
  { name: "宇智波佐助", romaji: "Omae o, korosu", character: "宇智波佐助 / 火影忍者 (Naruto)", gender: "male", jpQuote: "お前を、殺す", source: "佐助對鼬的復仇宣言", zhGloss: "我要殺了你" },
  { name: "賽菲洛斯", romaji: "Boku wa mata omoide ni nanka naranai", character: "Sephiroth / 最終幻想7 (FFVII)", gender: "male", jpQuote: "僕はまた思い出になんかならない", source: "劇場版Advent Children名台詞", zhGloss: "我不會再化作回憶" },
  { name: "黑崎一護", romaji: "Getsuga Tenshō!", character: "黑崎一護 / 死神 (BLEACH)", gender: "male", jpQuote: "月牙天衝！", source: "一護招牌斬擊吶喊", zhGloss: "月牙天衝！" },
  { name: "夜神月", romaji: "Keikaku dōri", character: "夜神月 / 死亡筆記本 (Death Note)", gender: "male", jpQuote: "計画通り", source: "夜神月經典陰謀得逞台詞", zhGloss: "一切都在計畫之中" },
  { name: "拳四郎", romaji: "Omae wa mō shindeiru", character: "拳四郎 / 北斗神拳 (Fist of the North Star)", gender: "male", jpQuote: "お前はもう死んでいる", source: "史上最著名決め台詞之一", zhGloss: "你已經死了" },
  { name: "呂布奉先", romaji: "Waga na wa Ryofu, tenka musō!", character: "呂布奉先 / 真三國無雙 (Dynasty Warriors)", gender: "male", jpQuote: "我が名は呂布、天下無双！", source: "無雙門面呂布登場豪語", zhGloss: "吾乃呂布，天下無雙！" },
  { name: "南野秀一", romaji: "Rōzu wippu!", character: "妖狐藏馬(南野秀一) / 幽遊白書 (YuYu Hakusho)", gender: "male", jpQuote: "薔薇棘鞭殺（ローズウィップ）！", source: "藏馬招牌武器吶喊", zhGloss: "薔薇鞭！招牌武器" },
  { name: "殺生丸", romaji: "Jama da", character: "殺生丸 / 犬夜叉 (InuYasha)", gender: "male", jpQuote: "邪魔だ", source: "殺生丸冷酷招牌短句", zhGloss: "別擋路" },
  { name: "飛影", romaji: "Jaō Ensatsu Kokuryūha!", character: "飛影 / 幽遊白書 (YuYu Hakusho)", gender: "male", jpQuote: "邪王炎殺黒龍波！", source: "飛影招牌絕招吶喊", zhGloss: "邪王炎殺黑龍波！" },
  { name: "初號機", romaji: "Nigecha dame da", character: "EVA初號機 / 新世紀福音戰士 (Evangelion)", gender: "neutral", jpQuote: "逃げちゃダメだ", source: "機體不語，借用EVA最著名台詞(碇真嗣)", zhGloss: "不能逃避(EVA名句)" },
  { name: "魔人普烏", romaji: "Okashi ni shite yaru!", character: "魔人普烏 / 七龍珠 (Dragon Ball)", gender: "male", jpQuote: "お菓子にしてやる！", source: "普烏招牌糖果化攻擊", zhGloss: "把你變成糖果！" },
  { name: "Rider", romaji: "Berurefōn!", character: "Rider (梅杜莎) / Fate/stay night", gender: "female", jpQuote: "騎英の手綱（ベルレフォーン）！", source: "Rider寶具吶喊", zhGloss: "騎英之手綱！" },
  { name: "夏娜", romaji: "Urusai urusai urusai!", character: "夏娜 / 灼眼的夏娜 (Shakugan no Shana)", gender: "female", jpQuote: "うるさいうるさいうるさい！", source: "傲嬌四天王招牌吼句", zhGloss: "囉唆囉唆囉唆！" },
  { name: "桔梗", romaji: "Issho ni jigoku e, Inuyasha", character: "桔梗 / 犬夜叉 (InuYasha)", gender: "female", jpQuote: "一緒に地獄へ、犬夜叉", source: "桔梗經典悲戀台詞", zhGloss: "一起下地獄吧，犬夜叉" },
  { name: "莉娜因巴斯", romaji: "Doragu Sureibu!", character: "莉娜·因巴斯 / 秀逗魔導士 (Slayers)", gender: "female", jpQuote: "ドラグ・スレイブ！", source: "莉娜招牌大魔法龍破斬", zhGloss: "龍破斬！" },
  { name: "妙蛙花", romaji: "Fushigibana!", character: "妙蛙花 / 寶可夢 (Pokémon)", gender: "neutral", jpQuote: "フシギバナ！", source: "寶可夢自報名叫聲", zhGloss: "妙蛙花！叫聲(非說話生物)" },
  { name: "龍宮禮奈", romaji: "Uso da!", character: "龍宮禮奈 / 寒蟬鳴泣之時 (Higurashi)", gender: "female", jpQuote: "嘘だ！", source: "禮奈崩壞名句/迷因", zhGloss: "騙人的！" },
  { name: "勇者小呆", romaji: "Aban Sutorasshu!", character: "達伊(Dai) / 達伊大冒險 (DQ: Dai)", gender: "male", jpQuote: "アバンストラッシュ！", source: "達伊招牌必殺技吶喊", zhGloss: "阿邦流斬擊！" },
  { name: "Berserker", romaji: "Guooooo!", character: "Berserker (海克力斯) / Fate/stay night", gender: "male", jpQuote: "グオオオオッ！", source: "狂戰士喪失理智只會咆哮", zhGloss: "咆哮！(狂化不能言語)" },
  { name: "麻倉葉", romaji: "Nantoka naru", character: "麻倉葉 / 通靈童子 (Shaman King)", gender: "male", jpQuote: "なんとかなる", source: "葉招牌樂天口頭禪", zhGloss: "船到橋頭自然直" },
  { name: "涅吉", romaji: "Rasu teru ma sukiru magisuteru!", character: "涅吉·史普林菲爾德 / 魔法老師 (Negima)", gender: "male", jpQuote: "ラス・テル・マ・スキル・マギステル！", source: "涅吉魔法起動咒文", zhGloss: "咒文起動！" },
  { name: "依文潔琳", romaji: "Itetsuke!", character: "依文潔琳 / 魔法老師 (Negima)", gender: "female", jpQuote: "凍てつけ！", source: "冰之女王招牌冰系魔法", zhGloss: "凍結吧！" },
  { name: "傑洛士", romaji: "Sore wa himitsu desu♪", character: "傑洛士(Xellos) / 秀逗魔導士 (Slayers)", gender: "male", jpQuote: "それは秘密です♪", source: "神官傑洛士招牌賣關子台詞", zhGloss: "那是祕密喔♪" },
  { name: "蒼月潮", romaji: "Toraa!", character: "蒼月潮 / 潮與虎/魔力小馬 (Ushio to Tora)", gender: "male", jpQuote: "とらァッ！", source: "潮呼喚搭檔虎的招牌吶喊", zhGloss: "虎！呼喚搭檔" },
  { name: "巴恩大魔王", romaji: "Ima no wa merazōma dewa nai... mera da", character: "巴恩(Vearn) / 達伊大冒險 (DQ: Dai)", gender: "male", jpQuote: "今のはメラゾーマではない…メラだ", source: "大魔王巴恩超著名迷因名台詞", zhGloss: "剛才那不是美拉佐瑪…是美拉" },
  { name: "櫻綻剎那", romaji: "Ojōsama wa, watashi ga mamoru", character: "櫻綻剎那 / 魔法老師 (Negima)", gender: "female", jpQuote: "お嬢様は、私が守る", source: "剎那守護木乃香的信念(招牌設定)", zhGloss: "大小姐由我來守護" },
  { name: "草泥馬", romaji: "Kono sōgen wa, ore no mono da... Mee!", character: "草泥馬 / 中國網路迷因", gender: "neutral", jpQuote: "この草原は、俺のものだ…メェッ！", source: "original：迷因原創，惡搞在地台詞", zhGloss: "這片草原是我的…咩！" },
  { name: "安云", romaji: "Watashi wa, korosu tame ni ikiru", character: "安云(Azumi) / あずみ", gender: "female", jpQuote: "私は、殺すために生きる", source: "original：無公認名句，依刺客設定惡搞", zhGloss: "我為殺戮而生" },
  { name: "鬼畜狂刀KYO", romaji: "Ore no na wa, Onime no Kyō", character: "鬼眼之狂 / SAMURAI DEEPER KYO", gender: "male", jpQuote: "俺の名は、鬼眼の狂", source: "狂自報名號招牌台詞", zhGloss: "我名為鬼眼之狂" },
  { name: "藤井八雲", romaji: "Ore wa... shinanai", character: "藤井八雲 / 三隻眼 (3×3 Eyes)", gender: "male", jpQuote: "俺は…死なない", source: "不死之身『無』的核心設定台詞", zhGloss: "我不會死(不死之身)" },
  { name: "基廉列克", romaji: "Sakarau yatsu wa, buttsubusu", character: "Kirenenko / 監獄兔 (Usavich)", gender: "male", jpQuote: "逆らう奴は、ぶっ潰す", source: "original：默劇暴力兔，依角色惡搞", zhGloss: "敢反抗就碾碎你" },
  { name: "木乃香", romaji: "Uchi ga, minna genki ni shitageru♪", character: "近衛木乃香 / 魔法老師 (Negima)", gender: "female", jpQuote: "うちが、みんな元気にしたげる♪", source: "original：治癒系公主，依關西腔設定惡搞", zhGloss: "讓大家都恢復精神♪" },
  { name: "皮卡娘", romaji: "Pika... Pikachū♡", character: "皮卡丘擬人 / SATO×PICA (同人)", gender: "female", jpQuote: "ピカ…ピカチュウ♡", source: "傲嬌電氣老鼠擬人萌化叫聲", zhGloss: "皮卡…皮卡丘♡" },
  { name: "天地志狼", romaji: "Kono ransei, ore ga owaraseru!", character: "天地志狼 / 龍狼傳 (Ryūrōden)", gender: "male", jpQuote: "この乱世、俺が終わらせる！", source: "original：三國穿越主角，依設定惡搞", zhGloss: "這亂世，由我來終結！" },
  { name: "臭作", romaji: "Muffuffu... ii ojōsan da", character: "臭作 / 臭作 (成人遊戲)", gender: "male", jpQuote: "むっふっふ…いいお嬢さんだ", source: "臭作招牌猥瑣笑聲(圈內迷因)", zhGloss: "嘿嘿嘿…真是好姑娘" },
  { name: "黑人牙膏", romaji: "Sono ha, masshiro ni shite yarō!", character: "黑人牙膏(Darlie) / 品牌迷因", gender: "male", jpQuote: "その歯、真っ白にしてやろう！", source: "original：美白大法師稱號，依品牌惡搞", zhGloss: "把你的牙齒美白吧！" },
  { name: "熊貓", romaji: "Sasa o yokose... denakya, kamu zo", character: "熊貓 / GGD原創(去死團)", gender: "neutral", jpQuote: "笹をよこせ…でなきゃ、噛むぞ", source: "original：國寶級的畜生，社群原創惡搞", zhGloss: "把竹子交出來…不然咬你" },
  { name: "飛鼠先生", romaji: "E', chotto matte, chīto no tesuto kōdo tte dore dakke?", character: "飛鼠先生 / GGD原創(去死團)", gender: "male", jpQuote: "えっ、ちょっと待って、チートのテストコードってどれだっけ？", source: "original：至尊學長，作弊測試碼惡搞", zhGloss: "耶，等一下作弊測試碼是哪個阿？" },
  { name: "死之王", romaji: "Shi koso ga, sukui da...", character: "死之王 / GGD原創(去死團逆襲)", gender: "male", jpQuote: "死こそが、救いだ…", source: "original：邪惡意念集合體，社群原創惡搞", zhGloss: "唯有死亡才是救贖…" },
];

// ── the open roster (task #138): display NAME → candidate champion ids ───────
// Verbatim from the roster-wave name→id map; the quote is applied to EVERY id so
// it survives whichever duplicate the roster seats. Keyed by the QUOTES `name`
// (the research spelling — the roster's "涅吉。史普林。菲爾德" is "涅吉" here).
const ROSTER = {
  "皮卡丘": ["godie-o02l", "godie-ofar"],
  "初音": ["godie-o02p"],
  "悟空": ["godie-o00x", "godie-ogrh"],
  "林克": ["godie-h00l"],
  "蒙其.D.魯夫": ["godie-u00n", "godie-u00o"],
  "克勞德": ["godie-hart"],
  "哆拉A夢": ["godie-n00b"],
  "索隆": ["godie-u01q", "godie-u01u", "godie-udre"],
  "Saber": ["godie-e002", "godie-e00l"],
  "宇智波佐助": ["godie-edem"],
  "賽菲洛斯": ["godie-u00j"],
  "黑崎一護": ["godie-h01n", "godie-h01o"],
  "夜神月": ["godie-emns"],
  "拳四郎": ["godie-u00l", "godie-umal"],
  "呂布奉先": ["godie-h01u"],
  "南野秀一": ["godie-n00p", "godie-nsjs"],
  "殺生丸": ["godie-osam"],
  "飛影": ["godie-u010", "godie-uvng"],
  "初號機": ["godie-e00r"],
  "魔人普烏": ["godie-huth"],
  "Rider": ["godie-hvsh"],
  "夏娜": ["godie-e008"],
  "桔梗": ["godie-hvwd"],
  "莉娜因巴斯": ["godie-h020", "godie-hjai"],
  "妙蛙花": ["godie-h02r"],
  "龍宮禮奈": ["godie-e001", "godie-e00n"],
  "勇者小呆": ["godie-n01c", "godie-nbbc"],
  "Berserker": ["godie-hapm"],
  "麻倉葉": ["godie-nplh"],
  "涅吉": ["godie-emfr", "godie-h022"],
  "依文潔琳": ["godie-n003", "godie-n01g"],
  "傑洛士": ["godie-o00l"],
  "蒼月潮": ["godie-hpb1"],
  "巴恩大魔王": ["godie-ubal"],
  "櫻綻剎那": ["godie-e00w", "godie-e00x"],
  "草泥馬": ["godie-h02u", "godie-h02v"],
  "安云": ["godie-e00k", "godie-e00z"],
  "鬼畜狂刀KYO": ["godie-u00h"],
  "藤井八雲": ["godie-hpal"],
  "基廉列克": ["godie-u00v"],
  "木乃香": ["godie-etyr"],
  "皮卡娘": ["godie-o00k"],
  "天地志狼": ["godie-e007", "godie-ewar"],
  "臭作": ["godie-orkn"],
  "黑人牙膏": ["godie-ogld"],
  "熊貓": ["godie-h02k"],
  "飛鼠先生": ["godie-udea"],
  "死之王": ["godie-u00k"],
};

// ── full-roster coverage: the remaining champions, keyed EXPLICITLY by id ─────
// The QUOTES/ROSTER pair above covers the open-roster wave (48 names → 67 ids).
// EVERY champion in docs/champions.csv also has an authored 名言, so this table
// carries the rest — one entry PER champion id (no name→id fan-out; these ids do
// not have the roster's duplicate-candidate ambiguity). Fields mirror a QUOTES
// row (name/character/gender/jpQuote/romaji/zhGloss/source) but each pins its own
// `id`. jpQuote/zhGloss are the docs/champions.csv 名言 text (verified to split
// exactly on the trailing Chinese-gloss parens); gender/romaji/source are the VO
// research. Together with the 67 above this brings coverage to all 113 ids.
const EXTRA = [
  { id: "godie-e00j", name: "騜", character: "騜 / GGD原創/惡搞", gender: "male", jpQuote: "ひざまずけ、皇者（おうじゃ）の御成りだ！", romaji: "Hizamazuke, ōja no onari da!", zhGloss: "跪下吧，皇者駕到！", source: "original：GGD原創「皇者・騜」惡搞台詞（無正典名言）" },
  { id: "godie-e00q", name: "黑化Saber", character: "黑化Saber / Fate", gender: "female", jpQuote: "約束された勝利の剣（エクスカリバー・モルガン）！", romaji: "Yakusoku sareta shōri no ken — Ekusukaribā Morugan!", zhGloss: "誓約勝利之劍・魔劍摩根！（黑化聖劍的招牌寶具呼喊）", source: "Fate/stay night [HF]／FGO セイバーオルタ 宝具「エクスカリバー・モルガン」" },
  { id: "godie-e00s", name: "白木卡迪那", character: "白木卡迪那 / GGD原創/惡搞", gender: "neutral", jpQuote: "森（もり）の古木（こぼく）、その根で縛（しば）り上（あ）げてやろう。", romaji: "Mori no koboku, sono ne de shibariagete yarō.", zhGloss: "森林古木，且以吾根縛盡爾等。（老樹精纏縛法術）", source: "original：GGD原創「白木老樹精」惡搞台詞（無正典名言）" },
  { id: "godie-e00t", name: "貞子", character: "貞子 / 映画『リング2』山村貞子", gender: "female", jpQuote: "みんなを殺（ころ）してあげる。", romaji: "Minna o koroshite ageru.", zhGloss: "我會把大家都殺掉喔。（《七夜怪談》貞子井底怨念的著名台詞）", source: "映画『リング2』山村貞子" },
  { id: "godie-e00u", name: "十六夜Sakuya", character: "十六夜Sakuya / 東方紅魔郷 十六夜咲夜 スペルカード", gender: "female", jpQuote: "咲夜（さくや）の世界（ザ・ワールド）！", romaji: "Sakuya no sekai — Za Wārudo!", zhGloss: "咲夜的世界！（十六夜咲夜停止時間的招牌符卡）", source: "東方紅魔郷 十六夜咲夜 スペルカード「咲夜の世界（ザ・ワールド）」" },
  { id: "godie-e00v", name: "維尼", character: "維尼 / GGD原創/惡搞", gender: "male", jpQuote: "はちみつのためなら、何（なん）だってやるさ。", romaji: "Hachimitsu no tame nara, nan datte yaru sa.", zhGloss: "只要是為了蜂蜜，我什麼都幹得出來。（百畝森林霸主惡搞）", source: "original：くまのプーさん 惡搞台詞（無單一正典決め台詞）" },
  { id: "godie-e012", name: "佐佐木小次郎", character: "佐佐木小次郎 / 佐々木小次郎", gender: "male", jpQuote: "秘剣（ひけん）――燕返（つばめがえ）し！", romaji: "Hiken — Tsubame Gaeshi!", zhGloss: "秘劍・燕返！（佐佐木小次郎的傳說劍技）", source: "佐々木小次郎（巌流島）／Fate/stay night アサシン「燕返し」" },
  { id: "godie-e015", name: "金居福", character: "金居福 / GGD原創/惡搞", gender: "male", jpQuote: "夜市（よいち）の運命（さだめ）、なめんじゃねえ！", romaji: "Yoichi no sadame, namen janē!", zhGloss: "別小看夜市人生的命運！（台味惡搞）", source: "original：GGD原創「夜市人生・金居福」惡搞台詞" },
  { id: "godie-ecen", name: "約翰走路", character: "約翰走路 / GGD原創/惡搞", gender: "male", jpQuote: "歩（ある）き続（つづ）けろ――止（と）まったら、そこで終（お）わりだ。", romaji: "Arukitsuzukero — tomattara, soko de owari da.", zhGloss: "繼續走下去——一旦停下，就到此為止。（約翰走路「Keep Walking」惡搞）", source: "original：ジョニーウォーカー「Keep Walking」惡搞台詞" },
  { id: "godie-efur", name: "揍敵客桀諾", character: "揍敵客桀諾 / HUNTER×HUNTER ゼノ＝ゾルディック 名台詞", gender: "male", jpQuote: "もし殺（ころ）したい奴（やつ）がいたら連絡（れんらく）くれ。3割引（さんわりび）きで請（う）け負（お）うぞ？", romaji: "Moshi koroshitai yatsu ga itara renraku kure. Sanwaribiki de ukeou zo?", zhGloss: "要是有想殺的人就聯絡我，算你七折接單喔？（傑諾·揍敵客名言）", source: "HUNTER×HUNTER ゼノ＝ゾルディック 名台詞" },
  { id: "godie-ekee", name: "傳說中的大刀", character: "傳說中的大刀 / GGD原創/惡搞", gender: "neutral", jpQuote: "斬（き）られてから吠（ほ）えても、もう遅（おそ）いぞ！", romaji: "Kirarete kara hoetemo, mō osoi zo!", zhGloss: "被砍了才嚎叫，可就太遲啦！（會叫的野獸・傳說大刀）", source: "original：GGD原創「傳說中的大刀」惡搞台詞" },
  { id: "godie-ewrd", name: "棗 真夜", character: "棗 真夜 / GGD原創/惡搞", gender: "neutral", jpQuote: "名（な）もなき戦士（せんし）、いざ参（まい）る！", romaji: "Na mo naki senshi, iza mairu!", zhGloss: "無名戰士，這就上場！（輸入資料缺失，暫擬佔位台詞，待補全稱號後重查）", source: "original：GGD（輸入資料於此id截斷，暫擬台詞）" },
  { id: "godie-h001", name: "斑剎", character: "斑剎 / GGD原創/惡搞", gender: "male", jpQuote: "地獄の底から這い上がった…お前らも道連れだ！", romaji: "Jigoku no soko kara haiagatta… omaera mo michizure da!", zhGloss: "從地獄深處爬上來的…把你們一起拖下去陪葬！", source: "original：GGD 去死團原創角色" },
  { id: "godie-h021", name: "阿強一號", character: "阿強一號 / GGD原創/惡搞", gender: "neutral", jpQuote: "アーチャン一号、起動！ポンコツって言うな！", romaji: "Āchan ichigō, kidō! Ponkotsu tte iu na!", zhGloss: "阿強一號，啟動！別叫我破銅爛鐵啦！", source: "original：GGD 去死團原創角色（惡搞台式機器人梗）" },
  { id: "godie-h02n", name: "打我阿笨蛋", character: "打我阿笨蛋 / GGD原創/惡搞", gender: "male", jpQuote: "さあ殴れ！痛くも痒くもないぜ、バカめ！", romaji: "Sā nagure! Itaku mo kayuku mo nai ze, baka me!", zhGloss: "來打我啊！一點也不痛不癢，笨蛋！", source: "original：GGD 去死團原創角色" },
  { id: "godie-h02s", name: "死亡騎士", character: "死亡騎士 / GGD原創/惡搞", gender: "male", jpQuote: "死は終わりにあらず…我が始まりなり。", romaji: "Shi wa owari ni arazu… waga hajimari nari.", zhGloss: "死亡並非終結…而是我的開始。", source: "original：GGD seed 單位（惡搞 Warcraft III 死亡騎士）" },
  { id: "godie-h02y", name: "志志雄真實", character: "志志雄真實 / るろうに剣心 -明治剣客浪漫譚-", gender: "male", jpQuote: "所詮、この世は弱肉強食。強ければ生き、弱ければ死ぬ。", romaji: "Shosen, kono yo wa jakuniku kyōshoku. Tsuyokereba iki, yowakereba shinu.", zhGloss: "說到底，這世上就是弱肉強食。強者生，弱者死。", source: "るろうに剣心 -明治剣客浪漫譚-" },
  { id: "godie-h02z", name: "不良少年", character: "不良少年 / GGD原創/惡搞", gender: "male", jpQuote: "あぁ？ガンつけてんじゃねえぞ、コラ！", romaji: "Ā? Gan tsuketen ja nē zo, kora!", zhGloss: "啊？瞪三小啦你，喂！", source: "original：GGD 去死團原創角色" },
  { id: "godie-harf", name: "鄭先生", character: "鄭先生 / GGD原創/惡搞", gender: "male", jpQuote: "全部本当だぜ？信じないお前が悪いんだよ！", romaji: "Zenbu hontō da ze? Shinjinai omae ga warui n da yo!", zhGloss: "全都是真的啦？不相信是你的錯耶！", source: "original：GGD 去死團原創角色（豪洨＝吹牛唬爛）" },
  { id: "godie-hblm", name: "賈修貝爾", character: "賈修貝爾 / 金色のガッシュ!!", gender: "male", jpQuote: "ザケル！オレは優しい王様になるんだ！", romaji: "Zakeru! Ore wa yasashii ōsama ni narunda!", zhGloss: "撒克魯！我要成為溫柔慈悲的王！", source: "金色のガッシュ!!（GASH BELL）" },
  { id: "godie-hgam", name: "妙蛙種子", character: "妙蛙種子 / ポケットモンスター", gender: "neutral", jpQuote: "フシギダネ！", romaji: "Fushigidane!", zhGloss: "妙蛙種子！（寶可夢只會喊自己的名字）", source: "ポケットモンスター（Pokémon）" },
  { id: "godie-hlgr", name: "煌", character: "煌 / 機動戦士ガンダムSEED", gender: "male", jpQuote: "撃たせない！", romaji: "Utasenai!", zhGloss: "我不會讓你開火（傷害任何人）！", source: "機動戦士ガンダムSEED" },
  { id: "godie-n01l", name: "小派", character: "小派 / GGD原創/惡搞", gender: "female", jpQuote: "後輩くん、私のこと…気になっちゃってるでしょ？", romaji: "Kōhai-kun, watashi no koto… ki ni nacchatteru desho?", zhGloss: "學弟～你其實…很在意學姊我對吧？", source: "original：GGD 去死團原創角色（惡搞「學姊」梗）" },
  { id: "godie-naka", name: "風魔小次郎", character: "風魔小次郎 / 風魔の小次郎（車田正美）", gender: "male", jpQuote: "風魔の小次郎、推参！", romaji: "Fūma no Kojirō, suisan!", zhGloss: "風魔的小次郎，登場！", source: "風魔の小次郎（車田正美）— 小次郎の登場決め台詞「推参」" },
  { id: "godie-nbst", name: "瘋狂假面", character: "瘋狂假面 / 究極!!変態仮面", gender: "male", jpQuote: "私はただの変態じゃない、正義の変態だ！", romaji: "Watashi wa tada no hentai ja nai, seigi no hentai da!", zhGloss: "我可不是普通的變態，是正義的變態！", source: "究極!!変態仮面（HK／変態仮面）" },
  { id: "godie-nman", name: "憤怒的胖虎", character: "憤怒的胖虎 / ドラえもん", gender: "male", jpQuote: "お前のものは俺のもの、俺のものも俺のもの。", romaji: "Omae no mono wa ore no mono, ore no mono mo ore no mono.", zhGloss: "你的東西是我的，我的東西也是我的。", source: "ドラえもん（ジャイアン）" },
  { id: "godie-ntin", name: "菲特·泰斯塔羅沙", character: "菲特·泰斯塔羅沙 / 魔法少女リリカルなのは", gender: "female", jpQuote: "バルディッシュ、ザンバーフォーム！", romaji: "Bardiche, Zamber Form!", zhGloss: "巴爾迪修，斬滅型態！（時空管理局執務官的招牌變形指令）", source: "魔法少女リリカルなのは（フェイト・テスタロッサ）" },
  { id: "godie-o01z", name: "高町奈葉", character: "高町奈葉 / 魔法少女リリカルなのは", gender: "female", jpQuote: "スターライトブレイカー！", romaji: "Starlight Breaker!", zhGloss: "星光爆裂！（魔砲少女的招牌大魔砲）", source: "魔法少女リリカルなのは（高町なのは）" },
  { id: "godie-o02o", name: "阿瞞大人", character: "阿瞞大人 / 三國演義", gender: "male", jpQuote: "寧教我負天下人，休教天下人負我。", romaji: "Mushiro ware tenka no hito ni somuku tomo, tenka no hito wo shite ware ni somukashimuru nakare.", zhGloss: "寧可我負天下人，不教天下人負我。", source: "三國演義（曹操）" },
  { id: "godie-o02s", name: "涼宮八ㄦ匕", character: "涼宮八ㄦ匕 / 涼宮ハルヒの憂鬱", gender: "female", jpQuote: "ただの人間には興味ありません！この中に宇宙人、未来人、異世界人、超能力者がいたら、あたしのところに来なさい。以上！", romaji: "Tada no ningen ni wa kyōmi arimasen! Kono naka ni uchūjin, miraijin, isekaijin, chōnōryokusha ga itara, atashi no tokoro ni kinasai. Ijō!", zhGloss: "我對普通人類沒興趣！在座若有外星人、未來人、異世界人、超能力者，就來找我。以上！", source: "涼宮ハルヒの憂鬱（涼宮ハルヒ）" },
  { id: "godie-o02v", name: "高町奈葉", character: "高町奈葉 / 魔法少女リリカルなのは", gender: "female", jpQuote: "大丈夫だよ、当たっても死んだりしないから。", romaji: "Daijōbu da yo, atatte mo shindari shinai kara.", zhGloss: "別擔心，就算打中了也不會死的啦～（白色惡魔式的恐怖溫柔）", source: "魔法少女リリカルなのは（高町なのは）" },
  { id: "godie-o02w", name: "令狐沖", character: "令狐沖 / 金庸《笑傲江湖》", gender: "male", jpQuote: "無招勝有招。", romaji: "Mushō motte yūshō ni katsu.", zhGloss: "以無招勝有招（獨孤九劍之精髓）。", source: "金庸《笑傲江湖》（令狐沖／獨孤九劍）" },
  { id: "godie-obla", name: "牧太郎", character: "牧太郎 / GGD原創/惡搞", gender: "male", jpQuote: "残業、残業、また残業…俺の人生、返してくれ！", romaji: "Zangyō, zangyō, mata zangyō… ore no jinsei, kaeshite kure!", zhGloss: "加班、加班、又是加班…把我的人生還給我！", source: "original：被剝削的勞工階級 惡搞" },
  { id: "godie-opgh", name: "趙子龍", character: "趙子龍 / 三國演義", gender: "male", jpQuote: "吾は常山の趙子龍なり！", romaji: "Ware wa Jōzan no Chō Shiryū nari!", zhGloss: "吾乃常山趙子龍是也！", source: "三國演義／真・三國無双（趙雲）" },
  { id: "godie-oshd", name: "鬼王達", character: "鬼王達 / GGD原創/惡搞", gender: "male", jpQuote: "無敵風火輪、喰らえっ！", romaji: "Muteki Fūkarin, kurae!", zhGloss: "吃我這招無敵風火輪！（《破壞之王》魔鬼筋肉人）", source: "original：破壞之王 魔鬼筋肉人 惡搞" },
  { id: "godie-othr", name: "金鋼狼", character: "金鋼狼 / X-MEN", gender: "male", jpQuote: "俺のやることは上品じゃないが、その道じゃ最高さ。行くぜ、Bub。", romaji: "Ore no yaru koto wa jouhin ja nai ga, sono michi ja saikou sa. Iku ze, Bub.", zhGloss: "老子幹的活兒不怎麼上道，但這一行我最強。上吧，小子。", source: "X-MEN / ウルヴァリン（Marvel）— 招牌自述『best there is at what I do』＋口癖『Bub』" },
  { id: "godie-u00b", name: "清蒸 飛鼠先生", character: "清蒸 飛鼠先生 / GGD原創/惡搞", gender: "male", jpQuote: "もっと罵ってくれ…そうすれば俺の魔法は滑空して冴えわたる！", romaji: "Motto nonoshitte kure… sou sureba ore no mahou wa kakkuu shite saewataru!", zhGloss: "再多罵我幾句嘛…這樣我的魔法才能滑翔得又準又爽！", source: "original：GGD飛鼠先生（稱號『最M的魔法Jizz 清蒸』被虐＋飛鼠滑空惡搞）" },
  { id: "godie-u011", name: "克勞薩先生", character: "克勞薩先生 / デトロイト・メタル・シティ", gender: "male", jpQuote: "殺害（サツガイ）！！レイプ！レイプ！", romaji: "Satsugai!! Reipu! Reipu!", zhGloss: "殺害！！強暴！強暴！（克勞薩招牌怒吼）", source: "デトロイト・メタル・シティ — クラウザーの代表台詞『殺害』『レイプ』" },
  { id: "godie-u012", name: "克勞薩II世", character: "克勞薩II世 / デトロイト・メタル・シティ", gender: "male", jpQuote: "メタルは文化だ！！", romaji: "Metaru wa bunka da!!", zhGloss: "金屬就是文化！！", source: "デトロイト・メタル・シティ — クラウザーII世の名言『メタルは文化だ』" },
  { id: "godie-u01f", name: "黑化張飛", character: "黑化張飛 / 真・三國無双 張飛", gender: "male", jpQuote: "おうおう！燕人張飛様のお出ましだぜ！かかってきな！", romaji: "Ou ou! Enjin Chouhi-sama no odemashi da ze! Kakatte kina!", zhGloss: "喔喔！燕人張飛大爺登場啦！放馬過來！", source: "真・三國無双 張飛 — 招牌台詞『燕人張飛様のお出まし』" },
  { id: "godie-u034", name: "傑 富力士", character: "傑 富力士 / HUNTER×HUNTER ゴン＝フリークスの名言", gender: "male", jpQuote: "友達になるのにだって資格なんていらない！！", romaji: "Tomodachi ni naru no ni datte shikaku nante iranai!!", zhGloss: "想當朋友，根本不需要什麼資格！！", source: "HUNTER×HUNTER ゴン＝フリークスの名言" },
  { id: "godie-ucrl", name: "傑 富力士", character: "傑 富力士 / HUNTER×HUNTER ゴン＝フリークスの名言", gender: "male", jpQuote: "キルアじゃなきゃダメなんだ！", romaji: "Kirua ja nakya dame nanda!", zhGloss: "非奇犽不可！（只有奇犽才行！）", source: "HUNTER×HUNTER ゴン＝フリークスの名言（対レイザー戦）" },
  { id: "godie-usyl", name: "異形", character: "異形 / 映画『エイリアン", gender: "neutral", jpQuote: "宇宙では、あなたの悲鳴は誰にも聞こえない。", romaji: "Uchuu de wa, anata no himei wa dare ni mo kikoenai.", zhGloss: "在宇宙中，沒有人聽得見你的尖叫。", source: "映画『エイリアン（ALIEN）』公式キャッチコピー" },
  { id: "godie-uwar", name: "撒尿牛丸", character: "撒尿牛丸 / 映画『食神』", gender: "male", jpQuote: "心さえあれば、誰だって食神になれるんだ！", romaji: "Kokoro sae areba, dare datte shokushin ni nareru nda!", zhGloss: "只要有心，人人都可以是食神！", source: "映画『食神』（周星馳）— 撒尿牛丸／食神の名台詞" },
  { id: "sela", name: "Sela, the Ember Sage", character: "Sela, the Ember Sage / GGD原創/惡搞", gender: "female", jpQuote: "灰は終わりじゃない…そこから、わたしは燃え上がる。", romaji: "Hai wa owari ja nai… soko kara, watashi wa moeagaru.", zhGloss: "灰燼並非終點…我將自此熊熊燃起。", source: "original：GGD seed（Sela, the Ember Sage・餘燼賢者）" },
  { id: "thorne", name: "Thorne, the Bramble Knight", character: "Thorne, the Bramble Knight / GGD原創/惡搞", gender: "male", jpQuote: "我が茨よ、絡みつけ。お前に逃げ場などない。", romaji: "Waga ibara yo, karamitsuke. Omae ni nigeba nado nai.", zhGloss: "我的荊棘啊，纏上去吧。你已無處可逃。", source: "original：GGD seed（Thorne, the Bramble Knight・荊棘騎士）" },
];

// ── clean male-voice resolver (see header) ──────────────────────────────────
const BOGUS_VOICE = "ZZ_build_quotes_no_such_voice_ZZ";
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "build-quotes-"));
process.on("exit", () => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function sayHash(voice) {
  const out = path.join(tmpDir, "probe.aiff");
  try {
    execFileSync("say", ["-v", voice, "-o", out, "テスト"], { stdio: ["ignore", "ignore", "pipe"] });
    const h = createHash("sha256").update(fs.readFileSync(out)).digest("hex");
    fs.rmSync(out, { force: true });
    return h;
  } catch {
    return null;
  }
}

/** Every voice `say -v '?'` lists, lowercased name → canonical name. Mirrors the
 *  parser in generate.mjs so this script agrees with it on what "installed" means
 *  (names are locale-spelling-dependent, e.g. "Otoya (Enhanced)"). */
function listInstalledVoices() {
  const map = new Map();
  const r = spawnSync("say", ["-v", "?"], { encoding: "utf8" });
  if (r.status !== 0) return map;
  for (const raw of String(r.stdout ?? "").split("\n")) {
    const head = raw.split("#")[0].trimEnd();
    if (!head.trim()) continue;
    const m = /^(.*\S)\s+([A-Za-z]{2,3}(?:_[A-Za-z0-9]{2,4})?)$/.exec(head);
    if (!m) continue;
    map.set(m[1].toLowerCase(), m[1]);
  }
  return map;
}

/**
 * Resolve MALE_VOICE_PREFS to a CLEAN, installed, non-phantom male voice — the
 * SAME way generate.mjs casts a voice, so the two never disagree: a pref only
 * counts when `say -v '?'` lists that exact name AND it renders distinctly from
 * the silent fallback. Because enhanced voices are often listed ONLY as
 * "<Name> (Enhanced)" (this machine lists "Otoya (Enhanced)" but no plain
 * "Otoya"), the enhanced spelling is tried too, and the CANONICAL listed name is
 * returned — that is the name generate.mjs needs AND the name each clip is truly
 * rendered with, so the manifest `voice` field stays honest. When none is
 * installed the intended first pref is returned UNRENDERED, so the manifest still
 * records the voice the male clips WILL use once it is present. Off darwin it
 * returns the intended pref so the data files can be regenerated without audio.
 *
 * Returns { voice, installed }.
 */
function resolveMaleVoice() {
  const intended = MALE_VOICE_PREFS[0];
  if (process.platform !== "darwin") return { voice: intended, installed: false };
  if (spawnSync("which", ["say"], { encoding: "utf8" }).status !== 0) {
    return { voice: intended, installed: false };
  }
  const listing = listInstalledVoices();
  const fallback = sayHash(BOGUS_VOICE);
  for (const pref of MALE_VOICE_PREFS) {
    const canonical = listing.get(pref.toLowerCase()) ?? listing.get(`${pref} (Enhanced)`.toLowerCase());
    if (!canonical) continue; // not listed by `say -v '?'` — generate.mjs would reject it too
    const h = sayHash(canonical);
    if (h !== null && (fallback === null || h !== fallback)) return { voice: canonical, installed: true };
  }
  return { voice: intended, installed: false };
}

function voiceFor(gender, maleVoice) {
  if (gender === "female") return FEMALE_VOICE;
  if (gender === "neutral") return NEUTRAL_VOICE;
  return maleVoice; // male (default)
}

function isReal(source) {
  return !/^\s*original\s*[:：]/i.test(String(source ?? ""));
}

// ── build ────────────────────────────────────────────────────────────────
const { voice: maleVoice, installed: maleVoiceInstalled } = resolveMaleVoice();
const problems = [];
const seenNames = new Set();

const quotes = {};
const ttsLines = [];

/** Add one champion-id entry to both the client manifest and the tts-gen input. */
function addEntry(id, q) {
  if (quotes[id]) {
    problems.push(`id ${id} claimed twice (${quotes[id].name} & ${q.name})`);
    return;
  }
  const gender = q.gender === "female" || q.gender === "male" || q.gender === "neutral" ? q.gender : "neutral";
  const voice = voiceFor(gender, maleVoice);
  quotes[id] = {
    name: q.name,
    character: q.character,
    gender,
    voice,
    jpQuote: q.jpQuote,
    romaji: q.romaji,
    zhGloss: q.zhGloss,
    source: q.source,
    real: isReal(q.source),
    clip: `${QUOTES_DIR}/${id}.mp3`,
  };
  ttsLines.push({
    id: `quote-${id}`,
    lang: "ja-JP",
    voice,
    text: q.jpQuote,
    out: `${id}.mp3`, // relative to TTS_MANIFEST (the quotes dir)
    rate: RATE,
    targetLufs: TARGET_LUFS,
    truePeakDb: TRUE_PEAK_DB,
  });
}

// (1) the open-roster wave: quote keyed by display NAME → every candidate id.
for (const q of QUOTES) {
  if (q._dupeSkip) continue; // a duplicate research row (same name); the first wins
  if (seenNames.has(q.name)) continue;
  seenNames.add(q.name);
  const ids = ROSTER[q.name];
  if (!ids || ids.length === 0) {
    problems.push(`no ROSTER ids for quote name ${q.name}`);
    continue;
  }
  for (const id of ids) addEntry(id, q);
}

for (const name of Object.keys(ROSTER)) {
  if (!seenNames.has(name)) problems.push(`ROSTER name ${name} has no quote row`);
}

// (2) the remaining champions, one explicit-id entry each (full 113 coverage).
for (const e of EXTRA) {
  seenNames.add(e.name);
  addEntry(e.id, e);
}

if (problems.length) {
  for (const p of problems) console.error(`build-champ-quotes: ${p}`);
  process.exit(1);
}

// ── write ────────────────────────────────────────────────────────────────
const realCount = Object.values(quotes).filter((q) => q.real).length;
const originalCount = Object.values(quotes).length - realCount;
const byGender = Object.values(quotes).reduce(
  (acc, q) => ((acc[q.gender] = (acc[q.gender] ?? 0) + 1), acc),
  { male: 0, female: 0, neutral: 0 },
);

const manifest = {
  id: "champion-quotes-ja",
  schema: "audio.champion-quotes-ja@1",
  note:
    "Per-champion famous-quote (名言) pack (task #139). Keyed by CHAMPION ID; the client (apps/client/src/audio/nameVoice.ts) fetches this verbatim and, on champ-select CONFIRM, plays clip as a THIRD segment after the 稱號→全名 call-out (task #120). Also shown as a quote in the champ-select profile (ProfileBlock.tsx). Lives under content/assets/ (NOT content/config/) for the same reason as the names pack — see docs/todo/name-voice.md — so it is NOT part of content:validate; the client's tolerant parser + nameVoice.test.ts validate it.",
  generatedBy:
    "node tools/tts-gen/src/build-champ-quotes.mjs — DO NOT HAND-EDIT. The QUOTES + ROSTER (open-roster wave) and EXTRA (explicit-id, full 113 coverage) tables in that script are the source of truth; this file and the tts-gen input are both written from it.",
  generator: `node tools/tts-gen/src/generate.mjs content/${QUOTES_DIR}/${TTS_MANIFEST}`,
  voice: {
    engine: "macOS say (Apple TTS)",
    rate: RATE,
    female: FEMALE_VOICE,
    neutral: NEUTRAL_VOICE,
    male: maleVoice,
    maleInstalled: maleVoiceInstalled,
    maleNote:
      `Male quotes are cast to "${maleVoice}" (from MALE_VOICE_PREFS ${JSON.stringify(MALE_VOICE_PREFS)}, resolved against \`say -v '?'\` — the enhanced spelling "<pref> (Enhanced)" counts as installed). ` +
      (maleVoiceInstalled
        ? `It is installed on this machine, so male clips are rendered with it; female/neutral use ${FEMALE_VOICE}. Re-render from the tts input with: node tools/tts-gen/src/generate.mjs content/${QUOTES_DIR}/${TTS_MANIFEST}`
        : `No clean Japanese male voice (${MALE_VOICE_PREFS.join(", ")}) is LISTED by \`say -v '?'\` on this build machine, so male clips are left UNRENDERED — their manifest entries still point at their intended ${maleVoice} clip path. Male does NOT fall back to ${FEMALE_VOICE} (a female voice must not stand in for a male line) nor to the novelty formant-synth voices (they cannot articulate a quote intelligibly). Install ${maleVoice} (System Settings → Accessibility → Spoken Content → Voices), then run: node tools/tts-gen/src/generate.mjs content/${QUOTES_DIR}/${TTS_MANIFEST}`),
  },
  loudness: { metric: "EBU R128 gated integrated", targetLufs: TARGET_LUFS, truePeakDb: TRUE_PEAK_DB },
  coverage: { names: seenNames.size, ids: Object.keys(quotes).length, real: realCount, original: originalCount, byGender },
  fields: {
    name: "the champion's display name this quote was authored for",
    character: "source character / franchise (review aid)",
    gender: "male | female | neutral — drives the VO voice",
    voice: "the macOS `say` voice this id's clip was rendered with",
    jpQuote: "the spoken Japanese line (also displayed)",
    romaji: "romaji of jpQuote (review aid)",
    zhGloss: "Traditional-Chinese gloss (displayed under the Japanese line)",
    source: "provenance; 'original…' marks a coined/惡搞 line (real:false)",
    real: "true = canonical franchise quote; false = community/original line",
    clip: "content-relative mp3 path (same /content/ mount as the names pack)",
  },
  quotes,
};

fs.mkdirSync(path.join(CONTENT, QUOTES_DIR), { recursive: true });
fs.writeFileSync(path.join(CONTENT, QUOTES_DIR, "quotes.json"), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(CONTENT, QUOTES_DIR, TTS_MANIFEST), `${JSON.stringify(ttsLines, null, 2)}\n`);

console.log(
  `build-champ-quotes: ${seenNames.size} names → ${Object.keys(quotes).length} champion ids ` +
    `(${realCount} real, ${originalCount} original; male ${byGender.male}, female ${byGender.female}, ` +
    `neutral ${byGender.neutral}) → content/${QUOTES_DIR}/quotes.json`,
);
console.log(
  `build-champ-quotes: voices → female/neutral ${FEMALE_VOICE}, male ${maleVoice}` +
    `${maleVoiceInstalled ? "" : " (NOT installed — male clips left unrendered)"}`,
);
console.log(`build-champ-quotes: ${ttsLines.length} tts lines → content/${QUOTES_DIR}/${TTS_MANIFEST}`);

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
// ⛔⛔ 2026-09-10 量到 —— 在這之前這一支**從來沒有 join 過出貨 roster**。
//    它把自己那三張手寫的表寫出去,然後在註解與 `generatedBy` 裡自稱
//    「**full 113 coverage**」—— ⭐ 而 113 是**手打的常數**,⛔ 不是算出來的。
//    實測(分母＝`content/champions/*.json` 的 `doc.id`,排除 `_index.json`):
//      · 出貨 roster **153** 位
//      · 這支產出 **113** 個 id,其中 **45** 個的英雄文件已經搬進 `content/_legacy/`
//      ⇒ ⭐ 真的拿得到名言的只有 **68** 位,**85 位一句都沒有** —— ⛔ 而它 exit 0。
//    ⚠️ 姊妹支 `build-champ-names.mjs` 有**一模一樣**的病(GH#811),差別只在
//    ⭐ **它 join 了 roster**,所以它會紅;這一支不 join,所以它不會紅。
//    ⇒ 現在它也 join 了:出貨英雄缺一句名言 ⇒ **exit 1 並指名他**(見 ROSTER JOIN 段)。
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

// ── the remaining champions, keyed EXPLICITLY by id ──────────────────────────
// The QUOTES/ROSTER pair above covers the open-roster wave. This table carries
// the rest — one entry PER champion id (no name→id fan-out; these ids do not have
// the roster's duplicate-candidate ambiguity). Fields mirror a QUOTES row
// (name/character/gender/jpQuote/romaji/zhGloss/source) but each pins its own
// `id`; `name` may be OMITTED, in which case it is read from the champion's own
// shipping doc (⭐ 一個住處,⛔ 不要在這裡再抄一份顯示名).
//
// ⛔ 這裡**沒有**「總共幾個 id」的數字。⭐ 涵蓋率是 ROSTER JOIN 段從出貨的
//    `content/champions/*.json` **算出來的** —— 一個手打的總數就是下一個
//    「full 113 coverage」(它活過了 roster 的兩次擴充,而沒有任何東西變紅)。
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

  // ══ 2026-09 社群審查 37 —— ⭐ 出處是**本機的一個檔的一個欄位**,⛔ 不是回想 ══
  //
  // ⭐ 規則(⛔ 不是 37 次個別判斷):`materials/asset-library/source/
  //    GGD社群英雄上傳內容_37名/projects/NN.hero-project.json` 的 `brief.moveNames`
  //    ⭐ **用〔〕把「GGD 自己接的佔位機制」與「原作的招式名」分開了** ——
  //    〔全武裝齊射〕是 GGD 接的,「火之神神樂・圓舞」是原作的。
  //    ⇒ 判準:**未加〔〕且是原作專有名詞**的那一格(R 優先,R 是〔〕就看 Q)
  //      ⇒ 還原它的**日文原名**當名言(⭐ 這是「還原原文」,⛔ 不是我翻一句台詞)。
  //      每一列的 `source` 指得到那個檔的那一格。
  //    ⇒ 未加〔〕但**是描述性的**、或 Q/R **兩格都在〔〕裡** ⇒ ⛔ **留空**,
  //      進 UNSOURCED 讓閘指名它。⭐ 「查不到就留給閘叫」比編一句好:
  //      一句編的台詞會被下一輪當成原作,⛔ 而沒有任何測試分得出來。
  //
  // ⚠️ ⛔ 這裡一列都**不要**寫「角色的名台詞」——那要靠回想,而回想沒有出處。
  //    招式名有:它逐字寫在上面那個檔裡,任何人都可以打開來反駁我。
  { id: "community-review-01-20260907", character: "武藤遊戲 / 遊☆戯☆王", gender: "male", jpQuote: "オシリスの天空竜！", romaji: "Oshirisu no Tenkūryū!", zhGloss: "歐西里斯的天空龍！（決鬥者的王牌神卡）", source: "遊☆戯☆王（武藤遊戯）— hero-project 01 `brief.moveNames.R`「歐西里斯的天空龍」還原原作卡名" },
  { id: "community-review-02-20260907", character: "八神庵 / THE KING OF FIGHTERS", gender: "male", jpQuote: "禁千弐百十一式・八稚女！", romaji: "Kin Sen Nihyaku Jūichi Shiki — Yaotome!", zhGloss: "禁千二百十一式・八稚女！（八神庵的招牌超必殺）", source: "THE KING OF FIGHTERS（八神庵）— hero-project 02 `brief.moveNames.R`「禁千二百十一式・八稚女」還原原作技名" },
  { id: "community-review-03-20260907", character: "不知火舞 / THE KING OF FIGHTERS", gender: "female", jpQuote: "超必殺忍蜂！", romaji: "Chō Hissatsu Ninbachi!", zhGloss: "超必殺忍蜂！（不知火舞的招牌超必殺）", source: "THE KING OF FIGHTERS（不知火舞）— hero-project 03 `brief.moveNames.R`「超必殺忍蜂」還原原作技名" },
  { id: "community-review-04-20260907", character: "空條承太郎 / ジョジョの奇妙な冒険", gender: "male", jpQuote: "スタープラチナ・ザ・ワールド！", romaji: "Sutā Purachina Za Wārudo!", zhGloss: "白金之星・世界！（承太郎的替身時停）", source: "ジョジョの奇妙な冒険（空条承太郎）— hero-project 04 `brief.moveNames.R`「白金之星・世界」還原原作替身名" },
  { id: "community-review-05-20260907", character: "洛克人 / ロックマン (Mega Man)", gender: "male", jpQuote: "ロックバスター！", romaji: "Rokku Basutā!", zhGloss: "洛克砲！（洛克人的招牌手砲）", source: "ロックマン（Mega Man）— hero-project 05 `brief.moveNames.Q`「洛克砲」還原原作武裝名（R 是〔全武裝齊射〕＝GGD 佔位）" },
  { id: "community-review-06-20260907", character: "卡比 / 星のカービィ", gender: "neutral", jpQuote: "ウルトラソード！", romaji: "Urutora Sōdo!", zhGloss: "超級巨劍！（卡比的招牌大絕）", source: "星のカービィ（カービィ）— hero-project 06 `brief.moveNames.R`「超級巨劍」還原原作技名" },
  { id: "community-review-08-20260907", character: "米卡莎 / 進撃の巨人", gender: "female", jpQuote: "雷槍！", romaji: "Raisō!", zhGloss: "雷槍！（調查兵團的對巨人兵裝）", source: "進撃の巨人（ミカサ・アッカーマン）— hero-project 08 `brief.moveNames.R`「雷槍」還原原作兵裝名" },
  { id: "community-review-10-20260907", character: "魯路修 / コードギアス 反逆のルルーシュ", gender: "male", jpQuote: "絶対遵守のギアス！", romaji: "Zettai Junshu no Giasu!", zhGloss: "絕對遵守的 Geass！（魯路修的王之力）", source: "コードギアス（ルルーシュ）— hero-project 10 `brief.moveNames.R`「絕對遵守的 Geass」還原原作能力名" },
  { id: "community-review-12-20260907", character: "衛宮士郎 / Fate/stay night", gender: "male", jpQuote: "無限の剣製（アンリミテッドブレイドワークス）！", romaji: "Anrimiteddo Bureido Wākusu!", zhGloss: "無限劍製！（士郎的固有結界）", source: "Fate/stay night（衛宮士郎）— hero-project 12 `brief.moveNames.R`「無限劍製」還原原作固有結界名" },
  { id: "community-review-17-20260907", character: "安茲·烏爾·恭 / OVERLORD", gender: "male", jpQuote: "落ちよ、天（フォールン・ダウン）！", romaji: "Ochiyo, ten — Fōrun Daun!", zhGloss: "墜落天空！（安茲的第十位階魔法）", source: "OVERLORD（アインズ・ウール・ゴウン）— hero-project 17 `brief.moveNames.R`「墜落天空」還原原作魔法名" },
  { id: "community-review-18-20260907", character: "吉爾伽美什 / Fate", gender: "male", jpQuote: "天地乖離す開闢の星（エヌマ・エリシュ）！", romaji: "Enuma Erishu!", zhGloss: "天地乖離開闢之星！（英雄王的最強寶具）", source: "Fate（ギルガメッシュ）— hero-project 18 `brief.moveNames.R`「天地乖離開闢之星」還原原作寶具名" },
  { id: "community-review-19-20260907", character: "桐谷和人 / ソードアート・オンライン", gender: "male", jpQuote: "スターバースト・ストリーム！", romaji: "Sutābāsuto Sutorīmu!", zhGloss: "星爆氣流斬！（桐人的二刀流劍技）", source: "ソードアート・オンライン（キリト）— hero-project 19 `brief.moveNames.R`「Starburst Stream」逐字即原作技名" },
  { id: "community-review-20-20260907", character: "御坂美琴 / とある科学の超電磁砲", gender: "female", jpQuote: "超電磁砲（レールガン）！", romaji: "Rērugan!", zhGloss: "超電磁砲！（常盤台的 Level 5 招牌）", source: "とある科学の超電磁砲（御坂美琴）— hero-project 20 `brief.moveNames.R`「超電磁砲」還原原作能力名" },
  { id: "community-review-22-20260907", character: "菜月昴 / Re:ゼロから始める異世界生活", gender: "male", jpQuote: "死に戻り。", romaji: "Shini-modori.", zhGloss: "死亡回歸。（昴唯一的權能）", source: "Re:ゼロ（ナツキ・スバル）— hero-project 22 `brief.moveNames.R`「死亡回歸」還原原作權能名" },
  { id: "community-review-25-20260907", character: "一拳超人 / ワンパンマン", gender: "male", jpQuote: "マジシリーズ・マジ殴り！", romaji: "Maji Shirīzu — Maji Naguri!", zhGloss: "認真系列・認真一拳！（埼玉的唯一大絕）", source: "ワンパンマン（サイタマ）— hero-project 25 `brief.moveNames.R`「認真系列・認真一拳」還原原作技名" },
  // ⭐ 唯一一列刻意收下**加了〔〕的那一格**:〔真相只有一個〕的文字本身就是本作
  //    **逐字的招牌台詞**(〔〕在這份來源裡標的是「GGD 還沒把它做成機制」,
  //    ⛔ 不是「這句話是 GGD 編的」)。⇒ 出處仍然是那個檔的那一格。
  { id: "community-review-26-20260907", character: "名偵探柯南 / 名探偵コナン", gender: "male", jpQuote: "真実はいつも一つ！", romaji: "Shinjitsu wa itsumo hitotsu!", zhGloss: "真相只有一個！（柯南的招牌決め台詞）", source: "名探偵コナン（江戸川コナン）— hero-project 26 `brief.moveNames.R`「〔真相只有一個〕」逐字即原作決め台詞" },
  { id: "community-review-28-20260907", character: "艾莉絲·伯雷亞斯·格雷拉特 / 無職転生", gender: "female", jpQuote: "光の太刀！", romaji: "Hikari no Tachi!", zhGloss: "光之太刀！（劍神流的奧義）", source: "無職転生（エリス・ボレアス・グレイラット）— hero-project 28 `brief.moveNames.R`「光之太刀」還原原作劍技名" },
  { id: "community-review-29-20260907", character: "芙莉蓮 / 葬送のフリーレン", gender: "female", jpQuote: "ゾルトラーク！", romaji: "Zorutorāku!", zhGloss: "佐爾特拉克！（一般攻擊魔法）", source: "葬送のフリーレン（フリーレン）— hero-project 29 `brief.moveNames.Q`「一般攻擊魔法・Zoltraak」還原原作魔法名（R 是〔葬送連射〕＝GGD 佔位）" },
  { id: "community-review-32-20260907", character: "阿薩謝爾 / よんでますよ、アザゼルさん。", gender: "male", jpQuote: "ジ・エンド・オブ・ソン！", romaji: "Ji Endo Obu Son!", zhGloss: "THE END OF SON！（阿薩謝爾的招牌）", source: "よんでますよ、アザゼルさん。（アザゼル）— hero-project 32 `brief.moveNames.R`「THE END OF SON」逐字即來源技名" },
  { id: "community-review-35-20260907", character: "炭治郎 / 鬼滅の刃", gender: "male", jpQuote: "ヒノカミ神楽・円舞！", romaji: "Hinokami Kagura — Enbu!", zhGloss: "火之神神樂・圓舞！（竈門家的呼吸）", source: "鬼滅の刃（竈門炭治郎）— hero-project 35 `brief.moveNames.R`「火之神神樂・圓舞」還原原作技名" },
  { id: "community-review-36-20260907", character: "鬼畜王蘭斯 / 鬼畜王ランス", gender: "male", jpQuote: "ランスアタック！", romaji: "Ransu Atakku!", zhGloss: "蘭斯攻擊！（蘭斯的招牌）", source: "鬼畜王ランス（ランス）— hero-project 36 `brief.moveNames.R`「Rance Attack／蘭斯攻擊」逐字即原作技名" },

  // ══ GGD 原創角色 —— `original:` ＝ real:false,與既有 31 列同一個標準 ═══════
  // ⭐ 原創角色**沒有原作可以引用**,所以惡搞一句是誠實的(而且標成 real:false);
  // ⛔ 對**真實作品的角色**這樣做就是編造 —— 那些一律留空,見 UNSOURCED。
  { id: "b2-kisaragi", character: "如月電車 / GGD原創（如月車站都市傳說題材）", gender: "neutral", jpQuote: "次は…どこにも、着きません。", romaji: "Tsugi wa… doko ni mo, tsukimasen.", zhGloss: "下一站…哪裡也到不了。（如月車站）", source: "original：GGD 原創 —— batch2-37 intake `characters/b2-kisaragi.json` 的 `work` 逐字寫著「如月車站題材・GGD 原創」,⛔ 沒有原作角色可以引用" },
  { id: "godie-zombiex", character: "喪標麥可 / GGD原創(去死團)", gender: "male", jpQuote: "カレーも、お前も、全部飲み込んでやる。", romaji: "Karē mo, omae mo, zenbu nomikonde yaru.", zhGloss: "咖哩也好，你也好，全部給我吞下去。（黑泥吞噬）", source: "original：GGD 去死團原創角色 —— 依 `content/champions/godie-zombiex.json` 的 description（「黑泥吞噬」「咖哩」「去死團原創角色」）惡搞" },
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

// ── ROSTER JOIN — ⭐ 分母是**出貨的英雄文件**,⛔ 不是這幾張表的長度 ──────────

/** 出貨 roster：`content/champions/*.json` 的 `doc.id` → `doc.name`。 */
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
 * 已下架的英雄（文件搬進 `content/_legacy/champions/`）。
 *
 * ⭐ 與姊妹支同一個判準：一列名言之所以「多餘」,唯一可以被反駁的證據是
 * **那位英雄的文件搬走了** —— ⛔ 不是一張手寫的 RETIRED 名單(那種表會過期,
 * 而且過期時不會有東西紅)。⚠️ 目錄不存在時回**空集合** ⇒ 每一列漂移都退回
 * fatal（fail-loud）,⛔ 不可以「讀不到就全部放行」。
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

/**
 * 變身態 → 本體。名言**推導**自本體那一列,⛔ 不是複製一份
 * （第〇·四守則：同一句話不可以有第二個住處 —— 本體改了,變身態要跟著改）。
 * 出處：`build-champ-names.mjs` 的 CASTING 對同一批 id 做了同樣的事並註記了配對。
 * ⚠️ 本體自己**沒有**名言時,變身態也一起留空（⛔ 不會憑空生出一句）。
 */
const FORM_OF = {
  "godie-e010": "godie-e00s", // 70 紮根 = e00s 變身
  "godie-o030": "godie-orkn", // 30 變態紳士 = orkn 變身
  "b2-maple-alt-9769eb88b85b": "b2-maple", // 梅普露（變身）
};

/**
 * ⛔⛔ **宣告過的缺口** —— 這些出貨英雄**沒有名言,而那是刻意的**。
 *
 * ⭐ 判準（owner 的規則,逐字）：「名言要嘛引用得到出處,要嘛**留空並讓閘指名它**」。
 * ⭐ 「查不到就留給閘叫」**比編一句好**：一句編的台詞會被下一輪當成原作,
 * ⛔ 而**沒有任何測試分得出來**（第一·五守則：卡片上不可以有說了但不會發生的字）。
 *
 * ⚠️ ⛔ 這**不是**一個讓閘閉嘴的逃生口：
 *   · 這裡的 id 若**其實有**名言 ⇒ fatal（過期的宣告）
 *   · 這裡的 id 若**不是**出貨英雄 ⇒ fatal（漂移）
 *   · 出貨英雄**兩張表都沒有** ⇒ fatal（⭐ 這是承重的那個方向）
 *   ⇒ 兩頭都走過（第二守則⑫：只從一頭走的掃描,結構上對另一頭失明）。
 *
 * 值是 NO_SOURCE_REASON 的鍵 —— ⭐ K 個模板 + 一張表,⛔ 不是 60 句手打的理由。
 */
const NO_SOURCE_REASON = {
  b2Identity:
    "batch2-37 intake（`materials/community-hero-forge/asset-library-sources/GGD-Asset-Library/intake/batch2-37/characters/<id>.json`）只給 work / canonical_name / identity_sources（官方角色頁）——⭐ 那是**身分**,⛔ 不是台詞;而這位英雄在 `content/champions/<id>.json` 裡的技能**沒有名字**（逐字叫 \"E\" / \"Q\" / \"R\" / \"W\"）,EX 是 GGD 的惡搞名 ⇒ ⭐ 本機沒有任何一份出處帶著他的原作台詞或原作招式名。",
  ggdPlaceholderMoves:
    "hero-project（`materials/asset-library/source/GGD社群英雄上傳內容_37名/projects/NN.hero-project.json`）的 `brief.moveNames` 這一支 **Q 與 R 兩格都在〔〕裡** ⇒ 兩格都是 GGD 自己接的佔位機制名,⛔ 不是原作招式名 ⇒ 沒有可引用的出處。",
  descriptiveMoveName:
    "hero-project 的 `brief.moveNames` 未加〔〕的那一格是**描述性的**（⛔ 不是原作的專有招式／寶具／能力名）⇒ 把它當名言等於我自己翻一句話,⛔ 那是編造。",
  lolNoVoiceLines:
    "Riot Data Dragon（⭐ 本 repo 在 `build-champ-names.mjs` 已經 join 過的官方來源）只出貨 name / title / lore / blurb,⛔ **不出貨語音台詞**;本機 checkout 也沒有任何 ddragon 傾印（實測 `find` 0 命中）⇒ 沒有可引用的出處。",
  formOfUnsourced:
    "變身態 —— 本體自己也還沒有可引用的名言,⇒ 一起留空（FORM_OF 推導的結果,⛔ 不是各自的判斷）。",
};

const UNSOURCED = {
  // ── batch2-37（36）—— 有身分,⛔ 沒有台詞也沒有原作招式名 ──────────────────
  "b2-aladdin": "b2Identity", "b2-albus": "b2Identity", "b2-bojji": "b2Identity",
  "b2-boxxo": "b2Identity", "b2-elma": "b2Identity", "b2-fushi": "b2Identity",
  "b2-goblin": "b2Identity", "b2-guts": "b2Identity", "b2-haga": "b2Identity",
  "b2-kaede": "b2Identity", "b2-kaiji": "b2Identity", "b2-keyaru": "b2Identity",
  "b2-klaus": "b2Identity", "b2-kumoko": "b2Identity", "b2-luckyman": "b2Identity",
  "b2-makoto": "b2Identity", "b2-maomao": "b2Identity", "b2-maple": "b2Identity",
  "b2-matthias": "b2Identity", "b2-misery": "b2Identity", "b2-naofumi": "b2Identity",
  "b2-ned": "b2Identity", "b2-noor": "b2Identity", "b2-nube": "b2Identity",
  "b2-orphen": "b2Identity", "b2-popp": "b2Identity", "b2-rem": "b2Identity",
  "b2-rin": "b2Identity", "b2-shadow": "b2Identity", "b2-shinchan": "b2Identity",
  "b2-sinbad": "b2Identity", "b2-takopi": "b2Identity", "b2-touka": "b2Identity",
  "b2-uncle": "b2Identity", "b2-yogiri": "b2Identity", "b2-zenitsu": "b2Identity",

  // ── 社群審查 37 裡的 16 位 ────────────────────────────────────────────────
  // Q/R 兩格都在〔〕裡（9）
  "community-review-07-20260907": "ggdPlaceholderMoves", // 西索
  "community-review-13-20260907": "ggdPlaceholderMoves", // 朝田詩乃
  "community-review-15-20260907": "ggdPlaceholderMoves", // 比利海靈頓
  "community-review-21-20260907": "ggdPlaceholderMoves", // 鹿目圓
  "community-review-23-20260907": "ggdPlaceholderMoves", // 坂田銀時
  "community-review-30-20260907": "ggdPlaceholderMoves", // 尼古貓貓
  "community-review-33-20260907": "ggdPlaceholderMoves", // 近衛刀太
  "community-review-34-20260907": "ggdPlaceholderMoves", // 高速婆婆
  "community-review-37-20260907": "ggdPlaceholderMoves", // 吉伊卡哇
  // 未加〔〕但是描述性的（7）
  "community-review-09-20260907": "descriptiveMoveName", // 赫蘿「賢狼真身」—— 賢狼是原作稱號,真身是 GGD 的詞
  "community-review-11-20260907": "descriptiveMoveName", // 利姆路「黑炎」「水刃」—— 通用詞
  "community-review-14-20260907": "descriptiveMoveName", // 殺老師「完全防禦形態」
  "community-review-16-20260907": "descriptiveMoveName", // 伊莉雅「夢幻召喚・Saber」
  "community-review-24-20260907": "descriptiveMoveName", // 奇犽「神速・疾風迅雷」—— 兩個原作詞被接成一個 GGD 名
  "community-review-27-20260907": "descriptiveMoveName", // 庫洛魔法使「劍牌」「風牌」
  "community-review-31-20260907": "descriptiveMoveName", // SUN樂「Accel」「Spiral Edge」

  // ── 英雄聯盟 7 —— 官方來源結構上就沒有台詞 ────────────────────────────────
  "lol-karthus": "lolNoVoiceLines", "lol-leesin": "lolNoVoiceLines",
  "lol-lux": "lolNoVoiceLines", "lol-missfortune": "lolNoVoiceLines",
  "lol-warwick": "lolNoVoiceLines", "lol-xerath": "lolNoVoiceLines",
  "lol-yasuo": "lolNoVoiceLines",

  // ── 變身態,本體也留空 ─────────────────────────────────────────────────────
  "b2-maple-alt-9769eb88b85b": "formOfUnsourced",
};

// ── build ────────────────────────────────────────────────────────────────
const { voice: maleVoice, installed: maleVoiceInstalled } = resolveMaleVoice();
const ship = championNames();
const retired = retiredChampionIds();
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
    // ⭐ 顯示名優先讀**英雄自己的出貨文件**（一個住處）；表裡的 `name` 只是
    //    舊的 open-roster 研究拼寫的後備 —— ⛔ 新的一列不要再抄一次顯示名。
    name: q.name ?? ship.get(id) ?? id,
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

// (2) the remaining champions, one explicit-id entry each.
for (const e of EXTRA) {
  seenNames.add(e.name ?? ship.get(e.id) ?? e.id);
  addEntry(e.id, e);
}

// (3) 變身態：名言**推導**自本體那一列（⛔ 不複製；本體改了它自動跟著改）。
const derivedForms = [];
for (const [formId, baseId] of Object.entries(FORM_OF)) {
  const base = quotes[baseId];
  if (!base) continue; // 本體自己沒有名言 ⇒ 變身態也留空（UNSOURCED 宣告過）
  addEntry(formId, {
    ...base,
    name: ship.get(formId) ?? base.name,
    source: `${base.source}（變身態：名言推導自本體 ${baseId}，⛔ 不是第二份文案）`,
  });
  derivedForms.push({ id: formId, base: baseId });
}

// ── ROSTER JOIN：四個方向，⭐ 兩頭都走過 ─────────────────────────────────────
//
// | 方向 | 級別 | 為什麼 |
// |---|---|---|
// | 出貨英雄**缺**名言、也**沒有**宣告缺口 | ⛔ **fatal** | ⭐ 承重的那一個 —— 漏掉＝那位英雄選起來**一句話都沒有**，⛔ 而在此之前它 exit 0 |
// | 名言列指向 `_legacy/` 的英雄 | ⚠️ 警示 | 他被下架了，⛔ 不是打錯字；文案留著（`retiredQuotes`） |
// | 名言列**兩邊都查不到** | ⛔ fatal | 真的漂移／打錯字 |
// | 宣告的缺口**其實有名言**、或**不是出貨英雄** | ⛔ fatal | ⭐ 一個過期的宣告會讓閘對那一格永遠閉嘴 |
const unsourced = [];
for (const [id, name] of ship) {
  if (quotes[id]) continue;
  const reasonKey = UNSOURCED[id];
  if (reasonKey) {
    unsourced.push({ id, name, reasonKey, why: NO_SOURCE_REASON[reasonKey] });
    continue;
  }
  problems.push(
    `出貨英雄 ${id}（${name}）沒有名言 —— 補一列 EXTRA（source 欄要指得到一個檔的一個欄位），` +
      `或在 UNSOURCED 裡宣告它並寫下**為什麼查不到**。⛔ 不要編一句台詞：` +
      `編的那一句會被下一輪當成原作，而沒有任何測試分得出來。`,
  );
}

const retiredQuotes = [];
for (const id of Object.keys(quotes)) {
  if (ship.has(id)) continue;
  if (retired.has(id)) {
    retiredQuotes.push({ id, name: quotes[id].name });
    continue;
  }
  problems.push(
    `名言列 ${id} 在 content/champions/${id}.json 與 content/_legacy/champions/${id}.json **都**查不到 —— 真的漂移，⛔ 不是下架`,
  );
}
retiredQuotes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

for (const [id, reasonKey] of Object.entries(UNSOURCED)) {
  if (!NO_SOURCE_REASON[reasonKey]) {
    problems.push(`UNSOURCED ${id} 的理由代號 "${reasonKey}" 不在 NO_SOURCE_REASON 裡`);
    continue;
  }
  if (quotes[id]) {
    problems.push(`UNSOURCED ${id} 宣告「查不到出處」，⛔ 而它其實有名言了 —— 把這一列刪掉`);
    continue;
  }
  if (!ship.has(id)) {
    problems.push(`UNSOURCED ${id} 不是出貨英雄（content/champions/${id}.json 不存在）—— 過期的宣告`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(`build-champ-quotes: ${p}`);
  process.exit(1);
}
if (unsourced.length) {
  console.warn(
    `build-champ-quotes: ⚠️ ${unsourced.length}/${ship.size} 位出貨英雄**刻意留空** —— 本機查不到可引用的出處（⛔ 不編造）。` +
      `逐名與理由寫在 quotes.json 的 \`unsourced\`；查到出處就補一列 EXTRA 並刪掉 UNSOURCED 那一列。`,
  );
}
if (retiredQuotes.length) {
  console.warn(
    `build-champ-quotes: ⚠️ ${retiredQuotes.length} 列名言的英雄已下架（content/_legacy/champions/）——` +
      ` 文案留在 MANIFEST.retiredQuotes，⛔ 不算進出貨涵蓋率`,
  );
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
    "node tools/tts-gen/src/build-champ-quotes.mjs — DO NOT HAND-EDIT. The QUOTES + ROSTER (open-roster wave), EXTRA (explicit-id) and FORM_OF (變身態，推導) tables in that script are the source of truth; this file and the tts-gen input are both written from it. ⭐ Coverage below is JOINED against the shipping roster (content/champions/*.json) at build time — a shipping champion with neither a quote nor a declared UNSOURCED gap makes this generator exit non-zero and NAME him. ⛔ 這裡刻意沒有任何手打的總數：在此之前它自稱一句「full ⟨手打的數字⟩ coverage」，而 roster 擴充之後那句話變成謊話，⛔ 沒有任何東西變紅（2026-09-10 量到）。",
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
  /**
   * ⭐ 每一格都是**算出來的**（分母＝出貨的 champion 文件），⛔ 沒有一個手打的數字。
   * `shippingWithQuote + unsourced === rosterShipping` 是這一段的自洽條件。
   */
  coverage: {
    rosterShipping: ship.size,
    shippingWithQuote: Object.keys(quotes).filter((id) => ship.has(id)).length,
    unsourced: unsourced.length,
    retiredRows: retiredQuotes.length,
    derivedForms: derivedForms.length,
    names: seenNames.size,
    ids: Object.keys(quotes).length,
    real: realCount,
    original: originalCount,
    byGender,
  },
  /** 出貨英雄裡**刻意沒有名言**的那些 —— 逐名 ＋ 為什麼查不到（⛔ 不是「還沒做」）。 */
  unsourced,
  /** 名言列的英雄已下架（`content/_legacy/champions/`）—— 文案留著，⛔ 不算涵蓋率。 */
  retiredQuotes,
  /** 變身態 ← 本體（名言是推導的，⛔ 不是第二份文案）。 */
  derivedForms,
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
  `build-champ-quotes: 出貨 roster ${ship.size} 位 → ${manifest.coverage.shippingWithQuote} 位有名言、` +
    `${unsourced.length} 位刻意留空（＋${retiredQuotes.length} 列已下架、${derivedForms.length} 列變身推導）`,
);
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

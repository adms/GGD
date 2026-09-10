# 82 名英雄缺呼名（CASTING）—— 補完報告

日期 2026-09-10 · 產生器 `tools/tts-gen/src/build-champ-names.mjs`
驗收：`node tools/tts-gen/src/build-champ-names.mjs` ⇒ **EXIT 0**（原本 exit 1，逐行印 82 個 id）
守衛：`npx vitest run packages/shared/src/ops/champNamesGeneratorRuns.test.ts` ⇒ **3 passed**

---

## ⭐ 第一個量到的事實：**82 位全部沒有稱號**

`splitName()` 用 `" - "` 切「稱號 - 全名」。逐份讀 `content/champions/<id>.json` 的 `name`：

| | |
|---|---|
| 82 位裡有 `" - "` 的 | ⭐ **0 位** |
| ⇒ `zhTitle` | 全部 `null` |

**這件事直接砍掉一半的設計空間**：mode `zh+ja` 與 `zh+en` 的第一段是
`` `${title}，` `` —— title 為 null 會唸出字面的「null，」。
⇒ ⭐ 可用的 mode 只剩 **`ja`（Kyoko 唸片假名）** 與 **`en`（Karen 唸英文）**。
既有表裡已有 titleless 的前例（`godie-h02s` デスナイト、`sela`/`thorne`），照它做。

⚠️ 連帶：`if (zhTitle !== null && title === null …)` 那條「稱號被丟掉」的守衛
對這 82 位**結構上不會響**（它問的是「有稱號卻沒唸」）。⛔ 這不是洞，
是「這 82 位本來就沒有稱號可丟」——但值得記下來，因為它解釋了為什麼補這批不必碰那條。

---

## ⭐ 分四組，每組一條規則（⛔ 不是 82 次判斷）

| 組 | 支數 | 出處（**每一列都指得到一個檔或一個端點**） | 規則 |
|---|---:|---|---|
| **A · B2 批** `b2-*` | **38** | `materials/community-hero-forge/asset-library-sources/GGD-Asset-Library/intake/batch2-37/characters/<id>.json` 的 `work` + `canonical_name` | ⭐ **RULE 1**：`canonical_name` 就是日文原名 ⇒ **還原它**，⛔ 不翻譯。取角色名那一半（`ハガ／羽賀誠` → ハガ、`メイプル／本条楓` → メイプル） |
| **B · 社群審查 37** `community-review-*` | **37** | `materials/asset-library/source/GGD社群英雄上傳內容_37名/projects/NN.hero-project.json` 的 `brief.concept` 逐字寫著「作品：《…》」 | 同 RULE 1（37 支裡 36 支是日本作品）＋ **RULE 5** 一支（見下） |
| **C · 英雄聯盟 7** `lol-*` | **7** | ⭐ Riot **Data Dragon 官方 ja_JP**（實跑，⛔ 不是憑印象） | RULE 1：Riot 自己出貨 ja_JP 名 ⇒「日文原名存在」 |
| **D · 英語母語** | **1** | 真實人物 | **RULE 5** → mode `en`，Karen 唸 |

### 每一組的規則，講完整

**A（38 支）** —— intake 那 37 份**每一份都帶 `identity_sources[].type == "official"`**
（官方角色頁 URL），唯一例外是 `b2-kisaragi`（GGD 原創，`user-instruction`）。
`b2-maple-alt-9769eb88b85b`（梅普露（變身））**刻意與本體同一組**——
既有表對變身態就是這樣做的（`godie-o030`／`h00w`／`n01b`／`e010` 四例）。

**B（37 支）** —— 顯示名有三種形狀，處理方式不同但**都是還原、不是翻譯**：
① 角色本名的漢字（空條承太郎／御坂美琴…）⇒ 日語讀音的片假名；
② 中文音譯（芙莉蓮／利姆路／奇犽…）⇒ 還原原文片假名（フリーレン／リムル／キルア）；
③ **作品標題**（一拳超人／名偵探柯南／庫洛魔法使）⇒ 還原**標題本身**的日文原文。

**C（7 支）** —— ⭐ **這一組我沒有照抄交辦文字，我去查了**：

```
https://ddragon.leagueoflegends.com/cdn/16.18.1/data/ja_JP/champion.json
https://ddragon.leagueoflegends.com/cdn/16.18.1/data/zh_TW/champion.json
```

⭐ **兩份一起拉，是為了驗 join key**：同一版的 zh_TW 名稱與出貨顯示名**逐字相同**
⇒ 這是 join 過的對照，⛔ 不是「唸起來像」的配對。

| GGD 顯示名 | ddragon zh_TW | ddragon ja_JP | 進表的片假名 |
|---|---|---|---|
| 犽宿 | 犽宿 ✅ | ヤスオ | ヤスオ |
| 拉克絲 | 拉克絲 ✅ | ラックス | ラックス |
| 好運姐 | 好運姐 ✅ | ミス・フォーチュン | ミスフォーチュン |
| 齊勒斯 | 齊勒斯 ✅ | ゼラス | ゼラス |
| 卡爾瑟斯 | 卡爾瑟斯 ✅ | カーサス | カーサス |
| 沃維克 | 沃維克 ✅ | ワーウィック | ワーウィック |
| 李星 | 李星 ✅ | リー・シン | リーシン |

⇒ ⭐ **交辦訊息裡那七個猜測，七個全中** —— 但現在它們有出處了。

⚠️ **`・` 拿掉是刻意的**：既有表整張都不放中黑點（`モンキーディールフィ`、
`ネギスプリングフィールド`、`フェイトテスタロッサ`），因為 `・` 在 mode `ja` 的
`spokenLine` 裡是**稱號↔全名的分隔符**（`` `${title}・${name}。` ``）。發音不受影響。

**D（1 支）** —— `community-review-15-20260907` 比利海靈頓 ＝ Billy Herrington，
真實的美國摔角手／網路迷因本人 ⇒ **英語是母語** ⇒ RULE 5，`["en", null, null, "Billy Herrington", …]`。
Karen 從 2 支變成 3 支，仍然符合「used sparingly」。

---

## ⚠️ 7 支標 `medium` —— ⛔ 不是「沒查」，是「查到的那個不完全是角色名」

**⭐ `low` 是 0 支：82 列每一列都指得到一個出處，⛔ 沒有一列是我編的讀音。**

| id | 顯示名 | 進表的讀音 | 為什麼是 medium |
|---|---|---|---|
| `b2-boxxo` | 阿箱＋拉蜜絲 | ハッコントラッミス | canonical 是 `ハッコン＋ラッミス`（**兩個角色**）。`＋` 唸不出來 ⇒ **並列助詞 ト（＝と）是我接的**。片假名全寫沿用本表慣例（`ヒャクエーカーノモリノオウ` 的 ノ 同理） |
| `b2-kisaragi` | 如月電車 | キサラギデンシャ | GGD 原創（きさらぎ駅 都市傳說題材）⇒ ⛔ **沒有原作角色可以還原**，走漢字的日語讀 |
| `b2-kumoko` | 蜘蛛子 | クモコ | 官方角色名是「私」；ja.wikipedia 逐字寫「**公式における愛称は蜘蛛子**」⇒ 顯示名對到的是那個公式愛称 |
| `b2-ned` | 青蛙劍士 Ned | カエルケンシネッド | `ネッド` 是 canonical（講談社作品頁）；⛔ 而「青蛙劍士」是中文側的描述詞，**查不到對應日文稱號** ⇒ 走 RULE 4 用漢字的日語讀（青蛙＝カエル、劍士＝ケンシ），⛔ 不編一個原作沒有的頭銜 |
| `community-review-16` | 魔法少女☆伊莉雅 | マホウショウジョイリヤ | ⚠️ 日文原標題其實是「**プリズマ☆イリヤ**」，⛔ 不是「魔法少女☆イリヤ」。沿用本表既有的 `マホウショウジョ`（見 `godie-o01z`）＋ `イリヤ`；`☆` 唸不出來所以不入 TTS |
| `community-review-27` | 庫洛魔法使 | カードキャプターサクラ | 顯示名是**作品標題**，⛔ 不是角色名（木之本桜）⇒ 還原標題本身 |
| `community-review-30` | 尼古貓貓 | ヤニネコ | hero-project 逐字：「作品識別：《ヤニねこ／尼古喵喵》**角色實體：佐藤ヤニ子**」⇒ 顯示名對到的是 `ヤニねこ` 那一側 |

### ⛔ 我沒有硬填的那幾格（⚠️ 這是這份報告最該被讀的一段）

⭐ **沒有任何一列是「查不到還是填了」。** 但有 **3 格資訊我查不到，而我的處理是「不唸它」而不是「編一個」**：

| 查不到的東西 | ⛔ 我沒有做的事 | ⭐ 我做的事 |
|---|---|---|
| 「青蛙劍士」的**日文原作稱號**（`b2-ned`） | 編一個像 `アヴァルトノケンシ` 的頭銜 | 只用漢字本身的日語讀 `カエルケンシ`，並標 medium |
| 「魔法少女☆伊莉雅」的 **☆** | 找一個唸得出來的替代（「ほし」「スター」） | **不入 TTS**（它是排版符號） |
| 「阿箱＋拉蜜絲」的 **＋** | 唸成「プラス」 | 換成日語的並列助詞 `ト`，並標 medium |

⚠️ 另外 **1 支我改掉了顯示名的漢字**（⛔ 不是打錯）：
`community-review-19` 顯示名「桐谷和人」是中文圈的寫法，**日文原作是「桐ヶ谷 和人」**
（ja.wikipedia：「キリトこと桐ヶ谷和人」）⇒ 讀 `キリガヤカズト`。
⭐ 這是 RULE 1「還原原文」，⛔ 不是我改了 owner 的名字（顯示名 `zhName` 一個位元組都沒動）。

### 逐支查證過的讀音（ja.wikipedia 實跑，⛔ 不是印象）

| 查什麼 | 結果 |
|---|---|
| `ラッミス`（vs 我以為的 ラミス） | ⭐ **intake 是對的**，條目逐字用 `ラッミス` —— ⛔ 我原本要「修正」它 |
| `鵺野 鳴介` | 「（**ぬえの めいすけ**）」⇒ ヌエノメイスケ |
| `高遠 夜霧` | 「（**たかとお よぎり**）」⇒ タカトオヨギリ |
| `深澄 真` | 「（**みすみ まこと**）」⇒ ミスミマコト |
| `蜘蛛子` | 「公式における愛称は蜘蛛子」 |
| `サンラク` | 「本名から『陽楽』の2文字を抜粋し、陽を太陽の SUN に置き換え」⇒ ⭐ SUN樂 這個顯示名的來源就在這句話裡 |
| `ターボババア` | ダンダダン 條目逐字 |
| `殺せんせー` | 暗殺教室 條目逐字 ⇒ コロセンセー |
| `桐ヶ谷和人` | SAO 條目逐字 |

---

## 🔧 順手修掉的三句**過期散文**（都在 `tools/tts-gen/**`，第三守則）

⚠️ 這三句在補完 82 位的**那一秒**變成謊話，而**沒有任何東西會紅**：

| 位置 | 原本寫 | 改成 |
|---|---|---|
| CASTING 表頭註解 | 「name/title may be null for **the 4 champions** authored without a 稱號」 | 「EVERY champion whose authored `name` carries no `" - "`」＋一句「⛔ 不是一張固定名單」 |
| `voSegments` 註解 | 「Titleless champions **(godie-h02s/h02z, sela, thorne)**」 | 拿掉 id 清單（那是 `splitName()` 算出來的） |
| ⭐ 出貨 `MANIFEST.structure` | 「**The 4 champions** authored without a 稱號 (godie-h02s 死亡騎士, …) speak the name alone」 | ⭐ **改成算出來的**：`` `The ${titlelessCount} champions whose authored name carries NO 稱號 …` `` |

⭐ 第三個最重要，因為它**出貨到 `content/…/MANIFEST.json`** —— 一份對外的說明檔在說一個
「4」，而真值是 **84**（82 新 + sela/thorne；`godie-h02s`/`h02z` 已退休到 `_legacy/`）。
現在那個數字是 `Object.values(champions).filter((e) => e.zhTitle === null).length`，
⇒ roster 再擴一次它自己會跟著動。

---

## ✅ 驗收與數字

```
node tools/tts-gen/src/build-champ-names.mjs      ⇒ EXIT 0
  build-champ-names: 153 champions, 1 skipped
    140  Kyoko
     10  Tingting ‖ Kyoko
      3  Karen            ← sela / thorne / Billy Herrington
  mixed-language pack → 222 clips (69 稱號 via Tingting, 153 全名 via Kyoko)
  ⚠️ 47 CASTING rows are RETIRED（既有的警示，⛔ 與這次無關）

npx vitest run packages/shared/src/ops/champNamesGeneratorRuns.test.ts  ⇒ 3 passed
pnpm --filter @ggd/tts-gen typecheck (= node --check ×3)               ⇒ EXIT 0
```

⭐ **測試預算**（第零守則⑦）：`vitest` **1 次**（額度 3）· typecheck **1 次** ·
突變 **0 次** —— ⛔ 刻意不做：這是**工具腳本**（第零守則③「工具腳本 = 一條薄守衛，不做突變」），
而且我**沒有新寫守衛**，`champNamesGeneratorRuns.test.ts` 是既有的、且它的檔頭已經帶著突變紀錄。

## ⚠️ 三份產物**已重生成但 ⛔ 我沒有 commit**（檔案柵欄）

跑產生器必然會寫這三份（它是它們的擁有者，`genguard` 認的就是這一支）：

```
content/assets/audio/voices/names/MANIFEST.json
content/assets/audio/voices/names/_tts-mixlang.json
content/audio-manifests/champ-names.ja-JP.json
```

⛔ 我的柵欄是 `tools/tts-gen/**` ＋ 這支測試 ＋ `docs/_reports/**` ⇒ **這三份留在工作區沒進 commit**。
⭐ 主 session 要收尾的話：`git commit -F <msg> -- content/assets/audio/voices/names/MANIFEST.json content/assets/audio/voices/names/_tts-mixlang.json content/audio-manifests/champ-names.ja-JP.json`
（⚠️ 不收的話 `node tools/tts-gen/src/build-champ-names.mjs --check` 會判 **STALE** 並指名這三份。）

⚠️ 另外：**mp3 還沒算**。這 82 位的呼名 clip 要跑
`node tools/tts-gen/src/generate.mjs content/audio-manifests/champ-names.ja-JP.json`
（＋ mixlang 那一份）才會存在 —— ⭐ 在那之前「表補齊了」**不等於**「播報員叫得出名字」
（第二守則：鏈路已接上 ⛔ 未驗收）。

---

## 🐛 順手發現，⛔ 沒修也沒開票（硬性規定 5）

**`build-champ-quotes.mjs`（名言包）有同一個病，⛔ 而它連紅都不會紅。**

| | |
|---|---|
| 症狀 | 出貨 153 位英雄，`content/assets/audio/voices/quotes/quotes.json` 只有 **115** 個 id ⇒ ⭐ **84 位沒有名言**（正好是這批 82 ＋ 2） |
| ⛔ 為什麼不會紅 | 那支產生器**不 join roster** —— 它是一張**手寫的 id 表**（檔內自稱「full **113** coverage」，而 roster 早就不是 113）。⇒ ⭐ 它沒有「缺一列就 exit 1」的反方向檢查，也就是**這次讓 82 位被抓出來的那個機制它沒有** |
| 影響 | 選人 CONFIRM 的第三段（名言）對這 84 位**靜默不播**；`ProfileBlock` 的引言也是空的 |
| ⭐ 修法的形狀 | 與這次一模一樣：讓 quotes 產生器也 join `content/champions/*.json`，缺列 ⇒ fatal 並指名 —— ⛔ 不是再手寫 84 列 |

⚠️ 這是第零守則⑧的形狀（**排序是 owner 的權力**）⇒ 只寫在這裡，⛔ 不當場修、⛔ 不開票。

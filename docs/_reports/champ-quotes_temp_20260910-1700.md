# 名言涵蓋率：⭐ 我自己量到的分母與差額

> 2026-09-10 · 分支 `worktree-agent-a5946654ac4425bbd` · 基準 `10807a540`（本機 `main` ff-merge）

---

## ① 量測 —— ⭐ 分母與探針（⛔ 不是引用別人的數字）

| 量的東西 | ⭐ 探針（可重跑） | 數 |
|---|---|---:|
| **出貨 roster** | `content/champions/*.json` 的 `doc.id`，排除 `_index.json`（⭐ 與姊妹支 `build-champ-names.mjs` 的 `championNames()` **同一支探針**） | **153** |
| 已下架 | `content/_legacy/champions/*.json` 的檔名 | 48 |
| 產生器產出的 id | 在**沙箱**跑一次**真的** `build-champ-quotes.mjs`，讀 `quotes.json` 的 `quotes` 鍵 | **113** |
| ↳ 其中英雄已搬進 `_legacy/` | 上一列 ∩ legacy | **45** |
| ↳ 其中兩邊都查不到 | — | 0 |
| ⇒ ⭐ **真的有名言的出貨英雄** | 113 − 45 | **68** |
| ⇒ ⛔ **一句名言都沒有的出貨英雄** | 153 − 68 | ⭐ **85** |

⚠️ 交辦時的數字是 **84**；⭐ 我自己量到的是 **85**。差 1 的來源是
`b2-maple-alt-9769eb88b85b`（梅普露變身態）—— 它是一份獨立的出貨英雄文件。

⭐ **而它 exit 0。** 產生器的註解與 `generatedBy` 逐字自稱「**full 113 coverage**」，
⛔ 而 113 是**手打的常數** —— 它從來沒有讀過 `content/champions/`。

### ⭐ 根因：這一支**不 join roster**，姊妹支 join

| | `build-champ-names.mjs` | `build-champ-quotes.mjs`（改之前） |
|---|---|---|
| 讀出貨 roster | ⭐ **會**（`championNames()`） | ⛔ **不會** |
| 出貨英雄缺一列 | ⛔ **exit 1 並指名他** | ⭐ **exit 0，什麼都不說** |

⇒ 同一個病、同一天、同一個目錄，**差別只在有沒有 join 分母**。
⭐ 這正是本 repo 記過最多次的形狀：**一句在它到期之後還活著的散文，而沒有任何東西變紅**（第三守則）。

---

## ② 閘（⭐ 這一項比補內容重要）

### 產生器：`tools/tts-gen/src/build-champ-quotes.mjs` —— ROSTER JOIN 段

⭐ **四個方向，兩頭都走過**（第二守則⑫：只從一頭走的掃描，結構上對另一頭失明）：

| 方向 | 級別 | 訊息 |
|---|---|---|
| ⭐ 出貨英雄**缺**名言、也沒有宣告缺口 | ⛔ **fatal（承重）** | 指名 id ＋ 顯示名 |
| 名言列指向 `_legacy/` 的英雄 | ⚠️ 警示 | 進 `retiredQuotes`，⛔ 不算涵蓋率 |
| 名言列**兩邊都查不到** | ⛔ fatal | 真的漂移／打錯字 |
| 宣告的缺口**其實有名言**、或不是出貨英雄 | ⛔ fatal | ⭐ 過期的宣告會讓閘對那一格永遠閉嘴 |

⭐ **「full 113 coverage」改成算出來的**：`coverage` 現在是
`{rosterShipping, shippingWithQuote, unsourced, retiredRows, derivedForms, …}`，
⛔ 產生器裡**一個手打的總數都沒有**。自洽條件 `shippingWithQuote + unsourced === rosterShipping`
由守衛斷言。⚠️ ⛔ 沒有把「113」換成「153」—— 那只是把過期時間往後推。

### 守衛：`packages/shared/src/ops/champQuotesGeneratorRuns.test.ts`（4 條）

⭐ 照姊妹支 `champNamesGeneratorRuns.test.ts` 的形狀：**跑真的產生器**、餵**真的**
`content/champions/` ＋ `content/_legacy/champions/`，⛔ 不掃原始碼字串。

### ⭐ 突變（一批一條，挑承重的那一條）

```
沙箱裡把 EXTRA 的 community-review-35-20260907（炭治郎）那一列刪掉
→ EXIT=1
→ build-champ-quotes: 出貨英雄 community-review-35-20260907（炭治郎）沒有名言 —— …
```
⭐ 對照：**改之前**同一個動作 → **exit 0，什麼都不說**（＝這一節開頭量到的那個狀態）。

⚠️ 另外，守衛的「⛔ 那句 `full \d+ coverage` 不可以復活」那一條，
⭐ **第一次跑就抓到我自己**（我在 `generatedBy` 裡把那句話原封引用了一次）——
突變不是我安排的，是它真的紅了一次。

---

## ③ 內容：補 25 句、⭐ 留空 60 句

### ⭐ 規則（⛔ 不是 85 次個別判斷）

⭐ **先量出處，再定規則**。實測本機的三個來源：

| 來源 | 有什麼 | 有沒有台詞 |
|---|---|---|
| `content/champions/<id>.json` 的 `description` | 作品／概念來源 | ⛔ **沒有** |
| batch2-37 intake `characters/<id>.json` | `work`／`canonical_name`／官方角色頁 | ⛔ **沒有** |
| hero-project `NN.hero-project.json` 的 `brief.moveNames` | ⭐ **招式名** | ⭐ **有（原作招式名）** |

⭐ **關鍵**：`brief.moveNames` 用 **〔〕** 把「GGD 自己接的佔位機制」與「原作的招式名」分開了
（〔全武裝齊射〕vs「火之神神樂・圓舞」）。⭐ 這是**機械可判的**，實測 9 支 Q/R 兩格全在〔〕裡。

⇒ 四條規則：

| 組 | 規則 | 結果 |
|---|---|---:|
| **社群審查 37** | R（R 在〔〕裡就看 Q）**未加〔〕且是原作專有名詞** ⇒ 還原**日文原名**當名言，`source` 指到那個檔的那一格 | ⭐ **21 補** |
| **變身態** | 名言**推導**自本體那一列（⛔ 不複製，本體改了自動跟著改） | ⭐ **2 補** |
| **GGD 原創**（`b2-kisaragi`／`godie-zombiex`） | `original:` ＝ `real:false`，與既有 31 列同一個標準 | ⭐ **2 補** |
| 其餘 | ⛔ **留空**，進 `UNSOURCED` 讓閘指名 | **60** |

⚠️ ⭐ **一句都不是靠回想寫的。** 招式名逐字寫在那個檔裡，任何人都可以打開來反駁我；
⛔ 而「角色的名台詞」要靠回想，回想沒有出處 —— 一句編的台詞會被下一輪當成原作，
⛔ 而**沒有任何測試分得出來**（第一·五守則）。

### ⛔ 留空 60 —— 逐名 ＋ 為什麼查不到

（機器可讀的完整版在 `quotes.json` 的 `unsourced`，每一列帶 `reasonKey` ＋ `why`）

| 理由 | 數 | 為什麼查不到 | 誰 |
|---|---:|---|---|
| `b2Identity` | **36** | intake 只給 **身分**（work／canonical_name／官方角色頁），⛔ 沒有台詞；而這 36 位在 `content/champions/` 裡的**技能沒有名字**（逐字叫 `E`/`Q`/`R`/`W`），EX 是 GGD 惡搞名 ⇒ ⭐ 本機沒有一份出處帶著他們的原作台詞或原作招式名 | `b2-aladdin, b2-albus, b2-bojji, b2-boxxo, b2-elma, b2-fushi, b2-goblin, b2-guts, b2-haga, b2-kaede, b2-kaiji, b2-keyaru, b2-klaus, b2-kumoko, b2-luckyman, b2-makoto, b2-maomao, b2-maple, b2-matthias, b2-misery, b2-naofumi, b2-ned, b2-noor, b2-nube, b2-orphen, b2-popp, b2-rem, b2-rin, b2-shadow, b2-shinchan, b2-sinbad, b2-takopi, b2-touka, b2-uncle, b2-yogiri, b2-zenitsu` |
| `ggdPlaceholderMoves` | **9** | hero-project 的 `brief.moveNames` **Q 與 R 兩格都在〔〕裡** ⇒ 兩格都是 GGD 接的佔位機制名 | 07 西索・13 朝田詩乃・15 比利海靈頓・21 鹿目圓・23 坂田銀時・30 尼古貓貓・33 近衛刀太・34 高速婆婆・37 吉伊卡哇 |
| `descriptiveMoveName` | **7** | 未加〔〕的那一格是**描述性的**（⛔ 不是原作專有招式／寶具／能力名）⇒ 引用它等於我自己翻一句 | 09 赫蘿「賢狼真身」・11 利姆路「黑炎/水刃」・14 殺老師「完全防禦形態」・16 伊莉雅「夢幻召喚・Saber」・24 奇犽「神速・疾風迅雷」・27 庫洛魔法使「劍牌/風牌」・31 SUN樂「Accel/Spiral Edge」 |
| `lolNoVoiceLines` | **7** | Riot Data Dragon（⭐ 本 repo 已經 join 過的官方來源）只出貨 name／title／lore／blurb，⛔ **不出貨語音台詞**；本機也沒有任何 ddragon 傾印（實測 `find` 0 命中） | `lol-karthus, lol-leesin, lol-lux, lol-missfortune, lol-warwick, lol-xerath, lol-yasuo` |
| `formOfUnsourced` | **1** | 變身態，本體 `b2-maple` 自己也還沒有可引用的名言 ⇒ 一起留空 | `b2-maple-alt-9769eb88b85b` |

⭐ **查到出處要補**：加一列 `EXTRA`（`source` 欄指到一個檔的一個欄位）＋刪掉 `UNSOURCED` 那一列。
⛔ 只加不刪 ⇒ 閘會紅（「宣告『查不到出處』而其實有名言」）。

### 補的 25 句

| 組 | 誰 |
|---|---|
| 社群審查 21 | 01 武藤遊戲・02 八神庵・03 不知火舞・04 空條承太郎・05 洛克人・06 卡比・08 米卡莎・10 魯路修・12 衛宮士郎・17 安茲・18 吉爾伽美什・19 桐谷和人・20 御坂美琴・22 菜月昴・25 一拳超人・26 名偵探柯南・28 艾莉絲・29 芙莉蓮・32 阿薩謝爾・35 炭治郎・36 鬼畜王蘭斯 |
| 變身推導 2 | `godie-e010` ← `godie-e00s`／`godie-o030` ← `godie-orkn` |
| GGD 原創 2 | `b2-kisaragi`（intake `work` 逐字「如月車站題材・GGD 原創」）・`godie-zombiex`（依自己的 description） |

⚠️ 26 名偵探柯南是**唯一**收下加了〔〕那一格的一列：〔真相只有一個〕的**文字本身**就是本作
逐字的招牌台詞（〔〕在這份來源裡標的是「GGD 還沒把它做成機制」，⛔ 不是「這句話是 GGD 編的」）。

### 順帶：⭐ 顯示名少了一個住處

新的 `EXTRA` 列可以**省略 `name`** ⇒ 從英雄自己的出貨文件讀（第〇·四守則：一個住處）。
既有 48 列的手抄拼寫保留為後備，⛔ 沒有動它們的輸出。

---

## ④ 結果

```
出貨 roster 153 位 → 93 位有名言、60 位刻意留空（＋45 列已下架、2 列變身推導）
```

| | 改之前 | ⭐ 改之後 |
|---|---:|---:|
| 出貨英雄有名言 | 68 / 153 | ⭐ **93 / 153** |
| 出貨英雄沒名言 | 85（⛔ **靜默**） | 60（⭐ **逐名宣告 ＋ 帶理由 ＋ 閘會警示**） |
| 缺一句時的離開碼 | ⭐ **0** | ⭐ **1，並指名他** |
| 涵蓋率的來源 | 手打的 `113` | ⭐ **從出貨 roster 算出來** |

---

## ⑤ ⛔ 順手發現的（⛔ 沒有當場修、⛔ 沒有開票）

1. **`apps/client/src/audio/nameVoice.test.ts:621` 的註解過期**（在我的柵欄外）：
   逐字寫著「the pack now covers **ALL champions** (task #142) … **113 ids across 92** distinct display names」
   —— ⭐ 而「ALL champions」在 roster 擴到 153 之後就是假的（實測當時只有 68/153）。
   ⚠️ 它的斷言是 `>= 113` 這個**下界**，所以它**不會紅**（⭐ 又一個「散文過期而沒有東西變紅」）。
   ⇒ 建議把它改成從 `coverage.rosterShipping` 對帳。
2. **`quotes.json` 的戶籍無主**：`bash scripts/genguard.sh content/assets/audio/voices/quotes/quotes.json`
   回「戶籍無主，⛔ 但它自己的檔頭寫著它是產生的」⇒ `tools/parallel-gates/sync-io.json`
   沒有這一支產生器的 writes ⇒ ⭐ 它的產物**不在隔離區**，手改不會被擋（GH#771 的同一個洞）。
3. **45 列已下架英雄的名言仍然被寫進 `_tts-quotes.json`** ⇒ 語音合成會替**選不到的英雄**算 45 段。
   ⚠️ 我**刻意沒有拿掉**（另一條 lane 正在跑合成，⛔ 不在飛行中抽掉他們的輸入）——
   現在它們至少被標進 `retiredQuotes` 且不算涵蓋率。

---

## ⑥ 測試預算

| | 用量 | 上限 |
|---|---:|---:|
| `npx vitest run` | **3** | ≤3 |
| `pnpm typecheck` | **1**（EXIT=0） | 1 |
| 突變 | **1**（承重那一條） | 一批一條 |

⛔ 沒有跑 `pnpm skills:sync`、⛔ 沒有算任何 mp3、⛔ 沒有 push／deploy。

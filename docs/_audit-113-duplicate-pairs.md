# #113 十四對「逐位元相同」英雄文件 —— 逐對裁決

> 稽核日期 2026-07-30 · 唯讀工作流（沒有動任何 `content/` · `apps/` · `packages/` 檔）
> 本檔**取代** `docs/_champion-dedup-113.md` 的裁決表（那份的結論方向對、理由是錯的，
> 見文末〈舊檔哪裡錯了〉）。舊檔按規定不動。

---

## 一句話結論

**14 對全部是「本體 ↔ 變身態」，0 對是重複匯入，一個都不能 dedup。**

三個互相獨立的來源同時指向這個結論，任何一個單獨都夠：

| # | 證據 | 覆蓋 |
|---|------|------|
| ① | `war3map.w3a` 的 Metamorphosis 欄位對 `Eme1`(本體) / `Emeu`(變身體) | 14 / 14 |
| ② | 地圖作者自己寫的 `unsf` 子名稱：本體 =「(NN)」、變身態 =「(NN變身名)」 | 14 / 14 |
| ③ | 出貨 champion doc 自己帶的 `transform` 區塊，`counterpartId` 雙向對得起來 | 14 / 14 |

證據 ② 是關鍵：`(20)` vs `(20風王結界)` 是**地圖作者在資料裡明講**「這是同一隻的第二形態」，
不是我們從欄位名推的。它同時是方向證明 —— 誰是本體不是猜的。

而且 14 對的**英雄編號兩邊完全相同**（20/20、11/11、04/04…），所以 #55 的
「不同編號 → 不同角色」條款在這裡根本不會被觸發；它們是同一個編號的兩個身體。

---

## 逐對裁決表

`w3x 真實差異` 一欄是直接讀 `raw/war3map.w3u` / `war3map.w3a` 的重建結果，
**不是**出貨文件的差異 —— 這正是舊檔漏掉的那一半。

| # | 編號 | 名稱 | 本體 `Eme1` | 變身態 `Emeu` | `unsf` 證明 | 變身技能 | w3x 真實差異（w3u/uabi） | 出貨文件差異 | 裁決 |
|---|:---:|---|---|---|---|---|---|---|---|
| 1 | 04 | 黑魔導士 - 莉娜因巴斯 | `godie-hjai` (HJAI) | `godie-h020` (H020) | `(04)` → `(04惡夢)` | `A0OE` 04-002 惡夢魔王的碎片 | int 27→127、mana 100→5000、manaRegen 0.1→1000；+`A023` 04-05 重破斬 | maxMana 100→5000、manaRegen 0.1→1000、int 27→127 | **變身對·不可 dedup** |
| 2 | 06 | 職業獵人 - 傑 富力士 | `godie-ucrl` (UCRL) | `godie-u034` (U034) | `(06)` → `(06 傑桑)` | `A0Y1` 06-04 傑桑變化 | model HighElfPeasant→HeroBigGon、scale 1.1→1.3、ms 315→360、atkCd 1.9→1.5；+`A017` 超賽攻擊 | model champ.thorne→imported.herobiggon、as 0.526→0.667、ms 6.1→7 | **變身對·不可 dedup** |
| 3 | 08 | 傳說的龍騎士 - 勇者小呆 | `godie-nbbc` (NBBC) | `godie-n01c` (N01C) | `(08)` → `(08龍魔人)` | `A0T1` 08-002 龍魔人 | 數值零差異；+`A0T0` 球體(龍魔人)、`A0MB`、`A05X`、`A0C5` | **完全沒有差異** ⚠ | **變身對·不可 dedup**（但見發現 A） |
| 4 | 11 | 三刀流劍士 - 索隆 | `godie-udre` (UDRE) | `godie-u01u` (U01U) | `(11)` → `(11武裝霸王)` | `A10N` 11-002 武裝色霸氣 | 數值零差異；+`A10O` 球體(武裝霸王)、`A0C5`、`A05X` | **完全沒有差異** ⚠ | **變身對·不可 dedup**（但見發現 A） |
| 5 | 12 | 龍之子 - 天地志狼 | `godie-ewar` (EWAR) | `godie-e007` (E007) | `(12)` → `(12破凰狀態)` | `A02W` 12-03 破凰之心-徒手空破山 | attackRange 100→450（近戰→遠程）；技能列相同 | range 1.6→8.2、role fighter→marksman、attackType melee→ranged | **變身對·不可 dedup** |
| 6 | 18 | 妖狐藏馬 - 南野秀一 | `godie-nsjs` (NSJS) | `godie-n00p` (N00P) | `(18)` → `(18 妖狐化)` | `A0IH` 18-03 妖狐變化 | model fox2→fox、scale 1.05→1.15、armor 1→4、dmgBase 0→64；技能互換 | ad 10→74、armor 1→4、model imported.fox2→imported.fox | **變身對·不可 dedup** |
| 7 | 19 | 戰國刺客Azumi - 安云 | `godie-e00k` (E00K) | `godie-e00z` (E00Z) | `(19)` → `(19紫色披風)` | `A0SZ` 19-002 紫色披風 | ms 310→522、atkCd 2→1.8；閃擊 `A0RG`→`A0RH` | as 0.5→0.556、ms 6→10.1 | **變身對·不可 dedup** |
| 8 | 20 | 亞瑟王 - Saber | `godie-e002` (E002) | `godie-e00l` (E00L) | `(20)` → `(20風王結界)` | `A0DZ` 20-01 風王結界（切換式，無 `ahdu`） | 數值/模型零差異；+`A05M` 風王法術書、`A0M3` 風王攻擊 | 無（但 `form-visuals.json` 補了 tint + 1.04 身高） | **變身對·不可 dedup** |
| 9 | 22 | 蟬在叫人壞掉 - 龍宮禮奈 | `godie-e001` (E001) | `godie-e00n` (E00N) | `(22)` → `(22L5)` | `A02Q` 22-04 雛見澤症候群L5 | ms 300→400、atkCd 2→1.5、dmgBase 10→55；技能互換 | ad 25→70、as 0.5→0.667、ms 5.8→7.7 | **變身對·不可 dedup** |
| 10 | 38 | 邪眼師 - 飛影 | `godie-uvng` (UVNG) | `godie-u010` (U010) | `(38)` → `(38邪眼)` | `A0OH` 38-00 邪眼全開 | ms 310→360；+`A0OI` 球體(飛影BODY)、`A0IW`、`A0FR` | ms 6→7 | **變身對·不可 dedup** |
| 11 | 42 | 黑暗福音 - 依文潔琳 | `godie-n003` (N003) | `godie-n01g` (N01G) | `(42)` → `(42魔力印章)` | `A06K` 42-002 魔力印章 | strGrowth 1.2→1.4、ms 295→160；技能列相同 | ms 5.7→4、maxHealth 成長 24→28、strGrowth 1.2→1.4 | **變身對·不可 dedup** |
| 12 | 76 | 草帽小子 - 蒙其.D.魯夫 | `godie-u00n` (U00N) | `godie-u00o` (U00O) | `(76)` → `(76 二檔)` | `A0IR` 76-00 二檔 | ms 315→415；+`A0IW` 二檔增加攻速、`A0IX` 二檔生命損失 | ms 6.1→8 | **變身對·不可 dedup** |
| 13 | 77 | 神鳴流劍士 - 櫻綻剎那 | `godie-e00w` (E00W) | `godie-e00x` (E00X) | `(77)` → `(77 變身)` | `A0JG` 77-03 GLADIARIA ALAT | ms 300→522、atkCd 2→1.7；+`A0FI` 球體(翅膀) 等 4 支 | as 0.5→0.588、ms 5.8→10.1 | **變身對·不可 dedup** |
| 14 | 92 | 看似憂鬱的神獸 - 草泥馬 | `godie-h02v` (H02V) | `godie-h02u` (H02U) | `(92)` → `(92 臥草)` | `A0W9` 92-01 臥草泥馬 | ms 310→**0**（趴著不能動）；+`A0W8` 生命再生光氣 | ms 6→5.5 ⚠ 沒有還原「不能動」 | **變身對·不可 dedup**（但見發現 C） |

**沒有一列可以 dedup。** 每一列的「同一角色」判定都成立，但「同一角色」在 #249 之後的
正確處理是「本體留在名單、變身態靠技能進入」，**不是刪掉其中一份文件**。
兩份文件都是必要的：`sim/content/registry.ts` 的 `Registry.get()` 對未註冊 id 會 throw，
而 `apps/game-server/src/net/snapshot.ts` 每 tick 對每個英雄實體都呼叫它 ——
刪掉變身態文件之後，任何一次變身會**整個房間掛掉**，不是只有畫面不對。

---

## 普查數字要更新：現在是 19 對，不是 14 對

我重跑了普查（`content/champions/` 119 份文件，`_index.json` 不算）：

| 比對條件 | 對數 |
|---|---:|
| `name` 相同 | **19** |
| `name` + `modelKey` 相同 | 17 |
| `name` + `modelKey` + `baseStats` + `growth` 逐位元相同 | **3** |

- 「14」是 `_champion-dedup-113.md` 當時的清單。之後 #248 重抓三圍改了數值、
  #249 補匯入了 4 個缺的變身態文件（`godie-h00w` / `godie-o030` / `godie-n01b` / `godie-e010`），
  所以現在多出 5 對：
  40 地獄歌神(`nman`/`n01b`)、87 曹操孟德(`o02n`/`o02o`)、70 白木老樹精(`e00s`/`e010`)、
  26 豪洨天王(`harf`/`h00w`)、30 電車癡漢(`orkn`/`o030`)。
- **這 5 對也全部是變身對。** 19 對同名 = 26 對變身對中「兩邊同名」的那 19 對；
  另外 7 對（09 悟空、25 拳四郎、58 皮卡丘、61 克勞薩、79 一護、81 奈葉、90 妙蛙）
  是變身態改了名字，所以不落在同名普查裡。19 + 7 = 26 ✅
- 「stats 完全相同」其實只有 3 對（08 / 11 / 20）—— 而這 3 對正好就是
  w3u 也零數值差異的那 3 對，兩邊自洽。

---

## 順手發現的三件事（都不是 #113 本身，請分派）

### 發現 A（可執行）· 兩個變身態出貨後與本體**完全無法區分**

`godie-n01c`（08 龍魔人）與 `godie-u01u`（11 武裝色霸氣）：
名稱、`modelKey`、全部 `baseStats`、全部 `growth`、全部 `attributes`、
六支技能名稱**逐位元相同**，而且**不在 `content/config/form-visuals.json` 裡**
（該檔目前只有 2 個 key：`godie-o00x` 悟空超三、`godie-e00l` 風王結界）。

⇒ #119 變身系統上線後，這兩隻變身時**畫面上、數值上、技能上都不會有任何變化**，
玩家會以為技能壞了。第七守則的形態①＋②合體。

它們在 w3x 裡的唯一差異是被 #56 丟掉的 `uabi` 球體掛件
（`A0T0` 球體(龍魔人) / `A10O` 球體(武裝霸王)，base 都是 `Asph`）。
`form-visuals.json` 已經有 `attachModelKey` / `attachBone` 通道（悟空在用），
所以修法是既有形狀。

**掛件模型與掛點我直接從 `raw/war3map.w3a` 讀回來了**（`OBJECTS.json` 把 ability 的
art 欄位丟了，只留 name/base，所以要讀原檔）。`atat` = 掛件模型、`ata0` = 掛點：

| 球體技能 | 用在 | `atat` 模型 | `ata0` 掛點 | content 有沒有 |
|---|---|---|---|---|
| `A0MJ` 球體(悟空超3) | `godie-o00x` | `Goku3head.mdx` | `origin` | ✅ `imported.goku3head`（118 KB glb）**已接線** |
| `A10O` 球體(武裝霸王) | **`godie-u01u`** | `war3mapImported\poweraura.MDX` | `origin` | ✅ `imported.war3mapimported-poweraura`（269 KB glb）**未接線** |
| `A0FI` 球體(翅膀) | `godie-e00x` | `AWING.MDX` | `chest` | ✅ `imported.awing`（21 KB glb）**未接線** |
| `A0T0` 球體(龍魔人) | **`godie-n01c`** | `Abilities\Spells\Undead\Unsummon\UnsummonTarget.mdl` | `weapon` | ❌ Blizzard stock，要走 overlay 或找替身 |
| `A0OI` 球體(飛影BODY) | `godie-u010` | `units\orc\SentryWard\SentryWard.mdl` | `foot`+`origin` | ❌ Blizzard stock，同上 |

方法自我驗證：`A0MJ` 讀出來是 `Goku3head.mdx` / `origin`，
和已出貨的 `form-visuals.json` 裡悟空那筆 `attachModelKey: imported.goku3head`,
`attachBone: origin` **完全吻合** —— 這條讀法是對的。

⚠️ 順帶更正 `_execution-batches.md`「五個模型其實已經在 content 裡」：
實際是 **3/5 在 content**（goku3head / poweraura / awing，glb 都在磁碟上），
另外 **2/5 是 Blizzard stock 模型**，不在 `content/models/`。差別很重要 ——
`godie-u01u`（索隆武裝霸王）**只差一段 config**，`godie-n01c`（龍魔人）還缺資產。

同組但**沒有**這個問題的是 20 Saber（`godie-e00l`）：數值也零差異，
但 `form-visuals.json` 給了 tint `[0.72,0.92,1.35]` + `scaleMult 1.04`，所以看得出來。

### 發現 B（提醒 #119）· 12 天地志狼變身會把**攻擊型態從近戰換成遠程**

`godie-ewar`(melee, range 1.6, fighter) → `godie-e007`(ranged, range 8.2, marksman)，
忠實對應 w3u `attack_range` 100→450。這是 14 對裡唯一一個改攻擊型態的，
#119 的形態切換要處理「回合中途換武器類別」（投射物、自動攻擊、bot kite 邏輯都吃這個）。

### 發現 C（提醒 #119 / #144）· 三個「地圖裡不能動」的變身態出貨全是 5.5 移速

w3u `umvs = 0` 的 4 個單位，出貨 `baseStats.ms` **全部是 5.5**：

| id | w3u umvs | 出貨 ms | 依現行比例應為 |
|---|---:|---:|---:|
| `godie-h02u`（92 臥草） | 0 | 5.5 | 0.00 |
| `godie-e010`（70 紮根） | 0 | 5.5 | 0.00 |
| `godie-u011`（61 鳳凰蛋） | 0 | 5.5 | 0.00 |
| `godie-u01q`（索隆測試英雄） | 0 | 5.5 | 0.00 |
| `godie-n01g`（42 魔力印章） | 160 | 4 | 3.09 |

5.5 是 `tools/w3x-import/extract_unit_stats.py:8` 那條**舊的** affine 映射
`ms = 5.5 + (clamp(raw,270,522)-270)*2.5/252` 的下限值 —— 該檔第 13 行自己就寫了
「270 floor collapses every slow unit onto 5.5」。而現役名冊已經改用**過原點的比例映射**
（我對 116 位量到 `ms ≈ umvs / 51.71`，522→10.1、310→6.0 都吻合），
所以這 5 筆是**沒跟著鑄回去的殘留**，不是刻意設計。

後果：#249 當初把草泥馬換成本體的理由就是「臥草態移速 0」，但出貨的臥草態
其實可以正常走路。⚠️ 「0 移速在遊戲裡不可玩」也可能是刻意的取捨 ——
**這條要 owner 裁決，不要自己選**（見 openQuestions）。

---

## 已經在守的部分（不用再做）

跑過並全綠（`cd packages/shared && npx vitest run --root . …`，39 tests / 4 files）：

- `championForms.test.ts`（7）—— 對 `TRANSFORM_FORMS.json` 逐欄位釘 26 對，
  **而且第二條測試重新從 `unsf` 子名稱推導方向**，不是信註解。這是真守衛：
  註解自己說「用 last-writer-wins 解 w3a 會在 26 對裡的 ~9 對產生反向的表」。
- `championIdentity.test.ts`（13）· `championFormsResolve.test.ts`（5）——
  後者讀**真的 registry** 證明 26 對的 52 個 id 全部 resolve 得到。
- `championFormVisuals.test.ts`（14）

下游也已經正確：
- `content/config/store.json` 的 `championPrices` 51 筆裡，**變身態 id 一個都沒有**
  （19 個本體有價），所以變身態不可購買、不會被種進新帳號。
- `apps/client/src/ui/platform/marqueeRoster.ts:237` `isSelectableChampion` 用
  `isAlternateForm` 把變身態擋在選角外。
- `packages/shared/src/content/championIdentity.ts` 已是 transform-aware
  （`alternateForms()`、「BASE form beats ALTERNATE form」）。

---

## 舊檔哪裡錯了（`docs/_champion-dedup-113.md`）

| 舊檔的話 | 實際 |
|---|---|
| 「其餘 12 對共用同一 mesh，只在 baseStats/growth 差一點點（**匯入器讀到同一個英雄的兩個單位實例**）」 | **誤診。** 那是 WC3 Metamorphosis 的兩個獨立單位定義，差異是作者刻意設計的（ms 310→522、近戰→遠程、+球體掛件）。 |
| 「所有 14 對 `isSameCharacter = true` ⇒ 判定 **DUPLICATE (one character)**」 | 「一個角色」對，但**推論鏈是巧合對的**：它比的 name/model/baseStats/QWER 正好是 WC3 變身態被要求保持一致的那幾欄，真正的差異在它沒比的 `uabi`/`uspe`/`usca`/`umdl`。 |
| 「Pair 2 (Saber) 是唯一每一欄都相同的」 | 現在是 3 對（08 / 11 / 20），因為 #248 重抓三圍改動了其他 11 對的數值。 |

**但舊檔的建議「只報告、不要刪」是對的，而且救了整個資料集** ——
照它的 dedup 走下去，26 個第二形態現在已經不存在了。
這是「結論可以在理由錯的時候仍然正確」的教科書案例，也是為什麼
建議欄要保守：**代價不對稱**。

---

## 建議動作

| 項目 | 動作 | 工程量 |
|---|---|---|
| #113 本體 | **關閉，裁決 = 0 對可 dedup。** 不動任何 content 檔 | — |
| 發現 A · `godie-u01u` | `form-visuals.json` 加一筆 `attachModelKey: imported.war3mapimported-poweraura` / `attachBone: origin`（模型與 glb 都已在 content） | **S · config-only** |
| 發現 A · `godie-n01c` | 先補 tint/scaleMult 讓它看得出來；`A0T0` 的 `UnsummonTarget.mdl` 是 Blizzard stock，掛件要等 overlay 或替身 | S（tint）→ M（掛件） |
| 順手 · `godie-e00x` | `A0FI` 球體(翅膀) = `imported.awing`，掛點 `chest`，也已在 content 但沒接線 | S · config-only |
| 發現 B | 併入 #119 的形態切換設計 | — |
| 發現 C | 等 owner 裁決後改 `content/champions/*.json` 的 ms | S |

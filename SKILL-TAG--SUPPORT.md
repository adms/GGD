# GGD 技能標籤 —— 引擎支援狀況

> **這一份是對外契約的人類可讀版。** 讀者是在 GGD 之外開發**獨立技能模板編輯器**的人：
> 你看不到我們的程式碼，所以本文件的每一條結論都在文字裡講完；內部檔名與行號只當作證據引用，
> 不需要你打得開它們。

| 項目 | 值 |
|---|---|
| 對應契約 | `ggd-runtime-capabilities@1` |
| **契約指紋** | **`e6843214`** —— 指紋變了，這份文件就過期了 |
| 量測日期 | 2026-08-08 |
| 量測時的程式版本 | HEAD `d199d3eb` |
| 量測方式 | 在該 HEAD 上逐檔讀程式 ＋ 執行探針（tsx）＋ 真的跑被宣稱的守衛（vitest）＋ 對出貨內容 `content/bundle.json` 做全樹解析。⛔ 不採信程式註解、不採信任何前一版清單的結論。 |

## 為什麼這份文件這麼囉唆

**假的 ❌ 只是害你白白繞路；假的 ✅ 會害你照著設計一張卡，而它在遊戲裡安靜地什麼都不做** ——
而且畫面上跟正常一模一樣，沒有錯誤訊息、沒有紅字。所以這份文件的偏誤方向是固定的：
寧可把一格標成「需新建」，也不把沒把握的東西標成「已有」。

已經**確認會靜默失效**的格子有自己的一節（[§1](#1-已知壞掉四筆不要用)），而且排在最前面。

## 怎麼重新產生這份文件

唯一真相是機器可讀的那一份：`docs/editor-contract/ggd-runtime-capabilities.json`。
它從**出貨的註冊表推導**（不是手寫的），欄位有：

- `fingerprint` —— 內容指紋。與本文件檔頭那一格不同 = 引擎已經動過，本文件的裁決要重跑。
- `effectKinds`（34 個）· `hookEvents`（15 個）· `conditionLeafKinds`（5 個）· `hookFields`（13 個）· `templateFamilies`（17 個）—— 全文轉錄在 [§6 附錄](#6-附錄逐字轉錄自契約-json)。
- `planned[]`（26 筆）—— 計畫點名的能力逐筆宣告 `supported` / `partial` / `unsupported` 與 caveat。
- `unsupported[]`（7 筆）—— 明確宣告「今天沒有」。
- **`knownBroken[]`（3 筆）—— 枚舉裡有、schema 收得下、後台選得到，但今天在出貨路徑上是壞的。這一格最重要。**

本文件的五層標籤表則來自 2026-08-08 的重裁資料（117 列）與對抗複驗裁決（4 推翻 / 11 維持 / 17 條新增警告）。

## 表格裡的「狀態」欄只有四個值

| 狀態 | 意思 | 你可以做什麼 |
|---|---|---|
| **已有** | 引擎有這個機制，而且接線到得了出貨路徑 | 直接在卡片上用 |
| **可組合** | 沒有專屬 kind，但用現有零件拼得出來 | 照該列「怎麼寫」那一欄的組合去拼；⚠️ 通常有一段行為對不上，該列會寫明是哪一段 |
| **需新建** | 今天沒有。引擎要先加東西 | ⛔ 不要在卡片上寫這件事，寫了就是靜默無效 |
| **⛔ 已知壞掉** | 枚舉裡有、schema 收得下、後台選得到，**遊戲裡不發生** | ⛔ 比「需新建」更危險，因為它會通過驗證。看 §1 的繞法 |

⚠️ **「已有」不等於「有人用過」。** 這一批新機制的出貨內容採用率是 0 —— 見 [§2-1](#2-1-新機制的內容採用率是-0)。

---

# §1 已知壞掉（四筆，不要用）

前三筆逐字對應契約 JSON 的 `knownBroken[]`，各有 GitHub issue（編號已對 GitHub 查證）。
第四筆沒有 issue 編號，但它的失效方式一樣：**通過驗證，玩家看不到。**

## §1-A ⛔【死亡時】`hook:onDeath` —— 出貨路徑上一次都不會發

**是什麼** —— 一個 hook event，語意是「這張卡的持有者被打倒的那一刻」。它出現在契約的 `hookEvents` 15 個成員裡，schema 收得下，後台選得到，而且有一支 `WorldHookSystem` 明白地把 `death` 這個模擬事件對應到它。

**實測到什麼** —— **零次觸發，而且是實測不是推論。** 派發函式 `fireHooks()` 的第三行就是「持有者已經不是活的 → 直接 return」；而死亡系統是**先**把持有者寫成「不活著」，**才**發出 `death` 事件。等到世界 hook 系統在同一個 tick 稍後跑起來，它拿著一個已經被標記為死亡的持有者去呼叫派發函式，第三行就退出去了。探針走完整的出貨順序跑一遍：`onDeath` 應該留下的記號是 `[]`（期望 `['i-died']`）；對照組 `onKill`（由死亡系統自己直接呼叫派發函式，不經過世界 hook 系統）記號**有**。⚠️ 現有的三條 `worldHook` 測試全綠 —— 因為它們覆蓋的是「世界作用域」與「閃避者（活著）」，**沒有任何一條覆蓋持有者已死的那一列**，而那是六列裡唯一按定義死著的一列。

**issue** —— **GH#293**（開啟中）· 修起來很小（派發函式多一個「允許死者」參數），但要一併決定「死人身上的『受到傷害時』該不該還響」。

**你該怎麼繞過** —— ① 想做「**我殺了人**之後…」→ 用 `onKill`，它走的是另一條路，會發（出貨內容已經有 13 份在用）。② 想做「**我死的時候**給隊友…」→ 今天**沒有任何路**（【隊友陣亡時】也不存在，見 §3-3 層 3 第 14 列）。⛔ 不要設計這種卡。③ 想做「快死的時候…」→ 用具名標記的 `lethal` 規則（免死），它攔在扣血之前，是真的會發生的（但擋不到火圈，見 §2-3）。

## §1-B ⛔【復活時】`hook:onRevive` —— 實戰唯一的復活路徑打空

**是什麼** —— 一個 hook event，語意是「這張卡的持有者被拉起來的那一刻」。同樣在契約的 15 個 hook 裡。

**實測到什麼** —— **遊戲裡的復活有兩條路，只有冷門的那條會發。** ① `revive` 效果種類（技能／道具復活）發出的事件裡，「是誰」這一格就是英雄本人 → hook 打得到。全庫只有 **1 份**內容走這條路（一件道具）。② **復活圈**（隊友站進去頻道 5 秒，實戰上唯一會發生的復活）發出的事件裡，「是誰」這一格放的是**圈圈自己的實體 id**，英雄放在另一格；而 hook 對應表讀的就是前者 → 它拿著一個圈圈去找英雄的資料，第一行就 return。探針真的把復活圈跑完一遍：圈圈實體 = 3、死者實體 = 1，事件內容是 `{"id":3,"ownerId":1,…}`，復活後死者身上的 `onRevive` 記號 = `[]`（期望 `['back-up']`），而且那時他已經是活的 —— 所以**不是** §1-A 那道存活閘造成的，是取錯了一格。

**issue** —— **GH#294**（開啟中）· 修起來是一個字（對應表改讀另一格）。

**你該怎麼繞過** —— ⛔ 今天不要設計任何「復活時 ⋯」的卡片。它在你的測試裡（如果用道具復活）可能是對的，在真實對局裡是零。要表達「被拉起來之後變強」，今天唯一穩的形狀是**改成不依賴時刻的東西**：例如常駐被動 + 一個以血量為條件的 hook。

## §1-C ⛔【淨化】的 `pools.buffs` / `pools.shields` —— 兩個死開關

**是什麼** —— `dispel` 效果種類上的四個池開關：`status`（狀態）、`dot`（持續傷害）、`shields`（護盾）、`buffs`（增益）。四個都是布林欄位，四個都收得下。

**實測到什麼** —— **`buffs` 勾了一筆都拔不掉。** 兩道閘相乘等於零：① 出貨設定檔把「增益預設可否被拔」設為 false；② **全專案沒有任何 authoring 欄位可以把一個來源標成「可被拔」** —— 執行期的三個型別都有這一格，但狀態文件 schema、施加狀態、施加增益、持續傷害四個 authoring 入口一個都沒有開出來。所以判定式恆為 false。⚠️ 更糟的是 schema 的**欄位說明主動告訴作者**「沒有明確標成可拔的來源仍然拔不走 —— 兩道閘是刻意的」，那句話描述了一個作者**做不到**的動作。`shields` 同理：在預設極性（只拔負面）下整池被跳過，所以「淨化順便破盾」也寫不出來。普查：27/27 份出貨狀態文件沒有、也沒有地方可以寫這一格。

**issue** —— **GH#295**（開啟中）· 修起來小（三個 Zod 欄位 + 一格編輯器），但順序不能反：先有標記，`pools.buffs` 才有意義。

**你該怎麼繞過** —— ① **只勾 `status` 與 `dot`** —— 這兩池是真的通的（預設就可拔，13 個被內容施加的狀態全部有文件）。② 要打掉護盾請用 **`shieldBreak` 效果種類**（它走同一支清除函式，但帶 `polarity:"any"` 與 `requireDispellable:false`，不受上面那兩道閘影響，而且 `count` 可以只打掉一層）。③ ⛔ **不要寫「此狀態無法被淨化」（驅散免疫）** —— 沒有那個形狀，寫了就是一句沒有效果的文案。

## §1-D ⚠️【切換型技能】`ability@1.toggle` —— 機制在，但玩家看不到它開著

**是什麼** —— 「按一次開、再按一次關，開著期間持續付魔力，關的時候跑一段收尾效果」。機制真的出貨了，而且關閉出口只有一個函式（手動關與魔力不足自動關都走它），所以「關閉時釋放一發」不可能只發生一半。

**實測到什麼** —— **兩個缺口，都會被玩家撞到。** ① **開關狀態不在任何 snapshot 欄位裡**，開／關兩顆事件被明確列為伺服器內部事件，所以客戶端**沒有任何欄位**能畫出「它現在是開的」—— 玩家只看得到魔力在掉；斷線重連、觀戰切換、中途加入的人一律看成關的。（結構原因：實體旗標的位元已經一格都不剩，補這一半需要一個通訊協定決定，GH#285。）② **關閉分支排在驗證梯最前面** —— 在暈眩、沉默、擊倒、施法中、冷卻**全部之前**。那個位置是為了「開了以後關不掉」而刻意選的，副作用是被暈眩、被沉默的人照樣關得掉，而關閉會跑收尾效果。

**issue** —— 沒有獨立 issue（複製那一半是 GH#285）· 修起來中等；「被控時能不能關」可以是一格後台欄位。

**你該怎麼繞過** —— ① **今天 0 份出貨內容用切換技**，所以你寫的第一張就是第一次上線測試。② 如果「玩家要看得見它開著」是這張卡的重點，改走**變身**那條路（`championForm`）—— 換身體會換模型，客戶端看得到。③ ⛔ **不要把收尾效果設計成一發強力傷害** —— 被控的人可以立刻按掉來觸發它，那是一個可以被玩家利用的出口。

---

# §2 三條會咬人的事實

這三條不是某一格的細節，是**會改變你怎麼讀整張表**的結構事實。

## §2-1 新機制的內容採用率是 0

計算基礎有**兩次獨立普查**，下表的每一列都標了它來自哪一次（⚠️ 兩份資料在一個地方對不上，見 §5-1）：

- **普查 A** —— 對出貨的打包產物 `content/bundle.json` 做全樹解析：**1,955 份文件 / 13 個集合**（2026-08-08）。
- **普查 B** —— 掃 `content/**/*.json` 的**原始檔**（排除 `bundle.json` 與各集合索引）（同日，稍晚）。

以下每一個數字都是**量到的**，不是估的。

| 新東西 | 出貨內容用了幾次 | 來源 |
|---|---|---|
| 6 個新的世界 hook（`onDeath` / `onRevive` / `onEvade` / `onBossSpawn` / `onFireRingIgnite` / `onGuardianDown`） | **全部 0** | A＋B 一致 |
| `onReflectSuccess`（反彈成功時） | **0** | A＋B 一致 |
| `onDamageDealt`（一直就沒人訂閱） | **0** | A |
| 2 個新條件葉（`status` / `equipment`） | **全部 0** | A＋B 一致 |
| 2 個新 hook 過濾器（`damageType` / `damageCrit`） | **全部 0** | B |
| 新增的 effect kinds | 只有 `dispel` 非零（3 次，全在道具上）；`shieldBreak` / `devour` / `modifyCooldown` / `weightedBranch` / `swapResource` / `eventValueConversion` / `manaBarrier` / `extendBuff` / `randomArea` / `evasion` 全部 **0**。⚠️ `grantAttribute` 在普查 B 裡是 **8** 次，但兩份資料對「它算不算新」不一致 —— 見 §5-2 | A＋B 一致（除 `grantAttribute`） |
| `ability@1.toggle`（切換技） | **0** | B |
| `ability-augment`（跨技能強化） | **0** | B |
| `feared`（恐懼狀態旗標） | **0** | B |
| 具名標記（marks） | **1 份** | B |

對照組 —— **今天真的在跑的** hook 只有七個（普查 A，普查 B 的數字逐格相同）：
`onBasicAttack` 68 · `onDamageTaken` 19 · `onKill` 13 · `onInterval` 9 · `onAbilityHit` 6 · `onAbilityCast` 5 · `onStunned` 2。

⛔ **對你的具體後果：這張表上每一個新翻成綠燈的格子，你的第一張卡就是那個機制的第一次上線測試** ——
不是照抄前例。而 §1-A / §1-B 兩個缺陷能帶著全綠的測試出貨，正是因為沒有任何內容跑過它們。

⭐ 這不是責備，是**順序**：這個專案的規則是「引擎做機制、JSON 做技能」，詞彙先於內容到位是刻意的。
但它意味著綠燈的可信度不是均勻的 —— 有內容在跑的機制（那七個 hook）比剛出貨的機制安全得多。

⚠️ 另外兩個格子的**規格還沒定案**，引擎做得到但語意可能會變：
`weightedBranch`（機率表的語意：1/6 是「每次獨立」還是「六發彈倉」）與
`eventValueConversion`（轉換的基數是 raw / mitigated / hpLost 哪一個）。在定案之前寫下去的卡，語意會在定案那天靜靜地改變。

## §2-2 條件只活在 hook 上 —— 這條決定你的表單形狀

⭐ **這是整份文件裡最會影響編輯器 UI 設計的一條。**

`condition`（條件）**不是**效果的欄位，它是 **hook 定義的欄位**。全專案只有**一個**求值呼叫點，
而那個呼叫點在 hook 的派發函式裡。也就是說：

- ✅ **寫得出來**：「**當**我普攻命中時，**若**目標身上有〔恐懼〕，則額外造成 X」
  → 一個 `onAbilityHit` / `onBasicAttack` 的 hook，帶 `condition`，`effects[]` 放那段追加。
- ⛔ **寫不出來**：在一支主動技的 `effects[]` 上直接掛「若目標有〔恐懼〕則這一段才生效」。
  效果陣列裡**沒有條件這一格**，寫了會被 schema 拒絕（或者更糟：被忽略）。

**所以編輯器的表單形狀應該是：** 條件是 hook 卡片的一個子區塊，不是效果卡片的一個子區塊。
如果你的 UI 把「條件」做成每一段效果都可以掛的通用修飾，那使用者做出來的東西有一半導不出合法的 JSON。

同一條的推論：**「主動技的某一段效果有條件」這件事，今天的唯一寫法是把那一段搬到一個 hook 上**
（例如 `onAbilityHit` 配 `abilitySlot` 過濾器，指定只有這一支技能命中時才算）。這是一個真的可行的迂迴，
但它會讓資料形狀跟作者腦中的形狀不一樣 —— 編輯器最好替他做這個翻譯，而不是讓他自己發現。

五個條件葉（`chance` / `equipment` / `kind` / `stat` / `status`）全部受這條限制，沒有例外。

## §2-3 免死擋不到火圈（無敵也一樣）

競技場的火圈燒傷**直接扣血**，不經過傷害佇列。後果是：

- **免死**（消耗一層標記留一口氣）看不到它 —— 被火圈燒死的人不會被救起來。
- **無敵 / 免疫傷害**同理，一樣擋不住火圈。
- 對照：持續傷害（DoT）的最後一跳**走**傷害佇列，所以免死**擋得到**燒傷致死。

**issue：GH#287**（開啟中）。

⚠️ 對你的後果：任何以「絕對不會死」為賣點的卡（十二道試煉那一族），文案上都不能承諾涵蓋火圈。
這是一個玩家一定會在對局後段撞到的情境 —— 火圈正是為了收尾而存在的。

⚠️ 同一個形狀的第二個實例（不同機制，同一種「繞過共用管線」的錯）：`devour`（處決／吞噬）
先把傷害推進佇列、再**無條件**替施法者回血；封包要更後面才會因為目標無敵而被整包丟掉，那時回血早就付了。
→ 「處決敵人回復生命」對無敵目標照樣回滿。

---

# §3 五層標籤表（117 列）

計算基礎：`retag-vocabulary.json` 的逐列 `verdictNew` 計數（程式驗過，每層 tally 與該層列數對得上）。
**總計：已有 63 · 可組合 18 · 需新建 36 ＝ 117 列。**

⚠️ 這 117 列與上一版（2026-08-04，100 列）的關係，三組數字不要混用：
舊頁自報 100 列 → 拆開其中 2 列（各拆成 2，因為那兩列裡「已出貨」與「未出貨」的答案現在不一樣了）＝ 102 列 →
再新增 15 列引擎新詞彙 ＝ **117 列**。同一批 102 列的裁決變化是：需新建→已有 14 格、需新建→可組合 1 格、可組合→已有 2 格、**已有→需新建 0 格**。

⚠️ **表格中的「⛔ 已知壞掉 / ⚠️ 部分已知壞掉」標記凌駕該列原本的裁決** —— 那幾列的原文逐字保留，
是為了讓你看見它為什麼看起來是通的，不是要你照它做。

## §3-1 層 1：效果種類 effect kind —— 「發生了什麼」的原子動作

**60 列：已有 35 · 可組合 15 · 需新建 10**

| # | 標籤 | engine token | 狀態 | 做什麼 | 怎麼寫 / 缺什麼 |
|---:|---|---|---|---|---|
| 1 | **【切換】** | `toggleForm` | 已有 | 兩個形態互按互換，沒有時限，再按一次換回來 | ⚠️ 下面兩個機制裡的第②個（`ability@1.toggle`）**在用之前先讀 §1-D** —— 它的開關狀態客戶端看不到。第①個（換身體）沒有這個問題。原文： 現在有**兩個不同的機制**共用這個中文字，寫卡片前要先選一個：① `championForm{to:"toggle"}` —— 換身體（改寫 championId、換模型、換技能組），省略 durationSec 就永不自動結束；② **新的** `ability@1.toggle` —— 不換身體，只是一個開著要付錢的狀態，帶 `upkeepCost` 與 `none/perAttack/perSecond` 三種節奏、以及 `onExit` 子效果。20-01 風王結界走②。 |
| 2 | **【免疫（可點選、不吃傷害）】** | `immune` | 已有 | 可以被點選、可以被打到，但那一發不扣血；免傷與免控分開授予 | `invulnerable{durationSec≤30, blocksDamage, blocksTrueDamage, blocksControl}` 三根軸各自一個絕對到期 tick。⛔ 舊頁那個洞**原封不動**：火圈燒傷在 `FireRingSystem` 直寫 `hp.hp -=`，不走傷害佇列，所以 `blocksTrueDamage` 對它無效 —— 而且新出貨的 `devour`（處決）與 `lethalSave`（免死）也一樣攔不到火圈。 |
| 3 | **【吸收（護盾）】** | `absorbShield` | 已有 | 先擋掉一池子的傷害，池子空了才開始扣血；可指定只吃某一種傷害 | `shield{amount, duration, absorbs}` 不變。⭐ 改變的是它的**周邊**：護盾今天拔得掉了（`shieldBreak` 專打這一池、`dispel` 勾 `pools.shields` 也行），而且傷害管線在護盾之後多了兩層 —— `manaBarrier`（傷害轉扣魔）與 `lethalSave`（免死）。舊頁「護盾住在 hp.shields 不是 Stat，這是【破盾】走不通的原因」仍然對，但那個 kind 已經存在。 |
| 4 | **【變身】** | `transformTimed` | 已有 | 換成另一個身體：新模型、新數值、新技能組，時間到自動變回 | `championForm{to:"alternate", durationSec}` 不變。新的是**互斥語意變成結構性保證**：一個實體只有一格形態、一個身體只有一個 championId，所以技能文件**不需要也不應該**自己檢查「我是不是已經變身了」。重複進入時舊形態剩餘時間怎麼辦是一格欄位（`champion@1.transform.reenter`：restart / keepLongest / reject）。 |
| 5 | **【衝刺】** | `dash` | 已有 | 沿著面向或往一個點滑過去，腳沒離地 | `dash{mode: forward\|toPoint, speed, maxDistance}`。⚠️ `MovementSystem` 明文 ignores root by design —— 【定身】仍然鎖不住會位移的英雄。 |
| 6 | **【跳躍】** | `leap` | 已有 | 拋物線離地飛過去，飛行途中無視碰撞，落地才結算 | `leap{mode, apexHeight, durationSec, landRadius, onLand: EffectDef[]}`。`onLand` 仍是三個延遲載荷之一（另兩個：`spawnProjectile.onHit`、`onInterval`），第四個是這一批新增的 `randomArea`。 |
| 7 | **【擊退 / 擊飛 / 拉扯 / 擊倒】** | `knockback` | 已有 | 把人推開、打上天、拖過來、以及落地後爬不起來的那段窗口 —— 同一個 kind 的四種參數 | `knockback{from, distance, speed, impactPower, hpBasis, subtractGap, launchHeight, uncontrollable, getupTicks}`。⚠️ `launchHeight` 那個洞沒有動：schema 有、實作有，但傷害仲裁會退化成貼地擊退，而守衛看不到。寫 `world.knockdown` 不是 StatusComp，所以**一直**對殭屍有效。 |
| 8 | **【嘲諷】** | `taunt` | 已有 | 強制對方一段時間內只能打我 | `taunt{durationSec, radius?, maxTargets?}` + `world.taunt` 自己一張表，出貨 `appliesToMobs:true`。⚠️ 舊頁寫「這是唯一一個對殭屍真的有用的控場」—— **那句話現在是假的**：殭屍拿到 StatusComp 之後，暈眩／定身／減速／詛咒／暴走／恐懼／沉默／混亂／睡眠全部生效了。 |
| 9 | **【魔免 / 免控】** | `magicImmune,controlImmune` | 已有 | 只擋魔法傷害 / 只擋硬控 | 同 `invulnerable` 的兩組欄位值。⚠️ 免控的**守備範圍變寬了**：`applyStatus.ts` 的 `isCc` 判定現在也含 `feared`（恐懼擋得掉），仍然**不含** `berserk`（暴走是自己給自己的）。事前擋、沒有事後拔的部分已經被 `dispel` 補上了。 |
| 10 | **【迴避】** | `evade` | 已有 | 那一下根本沒打到我，整包傷害消失 | `evasion` kind 或屬性 `Stat.Evasion`（clamp [0,0.8]）不變。⭐ 新的是**觸發時機**：`onEvade` hook 出貨了（持有者＝閃掉的那個，target＝攻擊者）。⚠️ 兩個仍未關的洞：① `evasion` **kind** 在 1,955 份出貨文件裡仍然 0 次（Stat.Evasion 有人用，kind 沒有）；② `onEvade` 還沒區分「真閃避」與「攻擊者 fumble」。 |
| 11 | **【反彈】** | `reflect` | 已有 | 把吃到的傷害原封（或加倍）打回去 | `damage.incomingPct{basis, perRank(≤5), maxChainDepth(≤2), …}` 不變。⭐ 新的是 `onReflectSuccess` 事件 + provenance：hook 拿得到**那一發反彈封包自己的** raw/mitigated/hpLost。⚠️ 兩個坑：反彈封包的 `reflectDepth` 已經是 1，child chain 要一起寫 `maxChainDepth:1`；`INCOMING_PCT_MAX = 5`，「7 倍」要靠 `amount` 補。 |
| 12 | **【真傷】** | `trueDamage` | 已有 | 無視護甲與魔抗 | `damageType:"true"`。⭐ 新的是 hook 端終於問得到它：`HookDef.damageType: any\|physical\|magic\|true`（見層 4）。`damageTypeOverride` 仍然只掛得到道具上。 |
| 13 | **【層數累積】** | `stacking` | 已有 | 同一個效果疊上去，越打越強，有上限 | `applyBuff{stackKey, maxStacks, stackVisual}` 不變。⭐ 但現在有**第二種層數**，而且語意相反：`sim/marks.ts` 的具名標記是**扣減式帳本**（count/spent），不會過期（`durationSec:-1`）、跨回合（`resetOn:"match"`）。挑錯一個的症狀是「十二道試煉每回合被重置」或「越打越弱」，而兩者在畫面上都看不出來。 |
| 14 | **【燒魔】** | `burnMana` | 已有 | 直接削掉對方的法力 | `spendMana{applyTo:"target", amount, pctMaxMana, pctCurrentMana, bankAs?}`，三種讀法可疊。 |
| 15 | **【吸血 / 汲魔】** | `lifesteal,manaLeech` | 已有 | 打出去的傷害折一部分回自己的血或魔 | `Stat.Lifesteal`（普攻）或 `damage.refund{resource, basis, pct≤2}`（技能）。⭐ 新的是它現在**會被【重創】咬**：`combat/damage.ts:934` 乘 `woundMult(world, pkt.source, "lifestealMult")`，而底下那一發 `healTarget` 另外咬 `healingTakenMult`（刻意分開，不重複乘）。 |
| 16 | **【治療 / 回復】** | `heal,restore` | 已有 | 直接補血（吃係數）／按最大值百分比補血補魔 | `heal{amount}` 與 `restore{healthPct, manaPct}` 不變。⭐ 新的是**逐目標**的入站倍率終於存在：`combat/restore.ts:74` 乘 `woundMult(target, "healingTakenMult")`（舊頁把它列在層 5【減療/禁療】需新建）。⛔ 仍然缺的是**事件**：治療路徑上一個 `fireHooks` 都沒有，所以「治療量的 20% 轉成護盾」還是寫不出來。 |
| 17 | **【復活】** | `revive` | 已有 | 把死掉的隊友（或自己）拉起來 | `revive{hpPct, manaPct, side, teamCharge}` 不變。⭐ 兩件新的：① `onRevive` hook 出貨（持有者＝被復活的人，不是頂圈圈的隊友）；② 清池從三個手寫站點收斂成一支 `clearPools` / `clearForFreshBody` —— 舊頁沒抓到的是**三個站點都漏清 `world.dot`**，也就是死前的燃燒會跟著復活的身體回來。 |
| 18 | **【發錢】** | `grantGold` | 已有 | 直接發金幣給施法者或目標 | `grantGold{flat≤5000, perTargetLevel≤100, mobLevelSource, fallbackLevel, to}`。出貨 1 次。 |
| 19 | **【召喚】** | `summon` | 已有 | 叫一個會自己走自己打的身體出來 | 22 個決策欄位。⛔ **兩個舊洞一個都沒關**：`killCredit:"owner"` schema 收但施放時擲錯；**出貨內容仍然 0 次**（我重新對 1,955 份文件做了全樹 kind 普查），`tpl-summon-agent` 仍是 draft。第一張用它的卡要當新功能測。 |
| 20 | **【純演出】** | `spawnVfx` | 已有 | 只放一段特效或音效，不動任何數值 | `spawnVfx{vfxId, at, durationSec?}`。出貨 13 次。 |
| 21 | **【輪替增益】** | `cycleBuff` | 已有 | 一組增益按固定順序輪流生效 | `cycleBuff{cycleKey, applyTo, steps[2..8]}`，輪替索引由絕對到期 tick 推導不存計數器。出貨 1 次。 |
| 22 | **【破甲 / 破魔】** | `armorBreak,mrBreak` | 可組合 | 護甲（或魔抗）暫時歸零 | 數值那一半沒變：`applyBuff{modifiers:[{stat:"armor"\|"mr", op:"override", value:0}]}`。⭐ 新的是**身分與可查詢性**：`content/status-effects/armor-break.json` / `magic-break.json` 出貨，而 `condition.status` 讓 80-03「若對方在[破甲]狀態」直接寫得出來。⛔ 仍然對殭屍無效 —— 殭屍拿到的是 StatusComp，**不是** StatsComp。 |
| 23 | **【重創（吸血砍半）】** | `grievousWounds` | 已有 | 治療、吸血、自然回復三格各自打折（不再只治吸血） | ⭐ 從「拼一條 lifesteal 負 modifier」升級成**一等狀態軸**：`applyStatus{healingTakenMult, lifestealMult, regenMult}` 三格獨立倍率，三個消費端分別是 `combat/restore.ts::healTarget`、`combat/damage.ts` 的吸血那一段、`RegenSystem`。舊頁的「這只治吸血，不治隊友補的血」現在是假的。出貨文件 `grievous-wounds.json` / `no-heal.json`。 |
| 24 | **【燃燒 / 流血 / 中毒】** | `burn,bleed,poison` | 可組合 | 持續掉血；三者的差別只有傷害型別與圖示 | `dot{damageType, amountPerTick, intervalSec, durationSec, resourcePct?, stacking, maxStacks, tickOnApply, onCasterDeath}` 不變，三者機械上仍然逐位元相同。⭐ 新的是**它們現在解得掉**：`dot` 進了 `clearPools`，`dispel` 拔得到（`config.dispel@1.dotDefaultDispellable` 出貨 true）。`world.dot` 只要 HealthComp → 對殭屍一直有效。 |
| 25 | **【冷凍】** | `freeze` | 可組合 | 凍住不能動也不能打，解除後還留一段緩速 | = `applyStatus(stun)` + 第二段 `applyStatus(moveSpeedMult)` + 一份 freeze 顯示文件。⭐ 舊頁的「⚠️ 對殭屍無效」**已經作廢** —— 殭屍有 StatusComp 了。⚠️ 「畫面上和一般暈眩長得一模一樣」仍然成立（wire 只送 STUNNED，冰的外觀要靠 spawnVfx）。 |
| 26 | **【飢餓（持續失血）】** | `hunger` | 可組合 | 隨時間持續流失生命 | = `dot{resourcePct}` + 一份 hunger 文件。⚠️ 「流失**魔力**」那一半仍然做不到：`dot` 只把傷害推進 damageQueue，沒有扣魔路徑；`spendMana{applyTo:"target"}` 仍是一次性的。（`eventValueConversion` 是把傷害**轉成**資源，方向相反，不是這一格。） |
| 27 | **【旋轉】** | `spinStrike` | 可組合 | 以自己為圓心，一段時間內反覆打到周圍一圈的人 | = `tpl-orbit-array 環形放射陣`（仍 enabled）。它是一圈一圈的放射打擊，不是一個真的繞著你轉的實體。 |
| 28 | **【衝擊波（直線推進）】** | `travelingWave` | 可組合 | 從一點往外推進的波，離得越遠的人越晚被打到 | = `tpl-traveling-wave 行進波動`（仍 enabled）：分段推進、每段一個 AoE。⚠️ 「半徑隨時間長大的圓環」仍然寫不出來 —— `damageArea.radius` 是常數。 |
| 29 | **【破防（削一段，不歸零）】** | `armorShred` | 可組合 | 削掉對方的護甲或魔抗一段時間 | = `applyBuff{modifiers:[{stat:"armor", op:"flat", value:負數}]}`，`STAT_CLAMPS` 仍然沒有 armor/mr 下界。⭐ 同【破甲】：現在有出貨的身分文件與可查詢的條件葉。⛔ 同【破甲】：對殭屍仍然靜默無效。 |
| 30 | **【易傷】** | `vulnerable` | 可組合 | 受到的傷害變多 | = 【破防】的鏡像（armor/mr 負值）。⚠️ 只放大物理與魔法；`damage.incomingPct` 是【反彈】不是「受傷加成」。⛔ 對殭屍仍然無效。 |
| 31 | **【虛弱 / 凋零】** | `weaken,wither` | 可組合 | 攻擊力（或任一屬性）暫時下降；凋零是隨時間一層一層掉 | 虛弱 = `applyBuff{modifiers:[{stat:"ad", op:"pctAdd", value:負數}]}`；凋零 = `onInterval` hook + 同樣的 buff 帶 stackKey/maxStacks。⛔ 對殭屍仍然無效（StatsComp 那一半沒做）。 |
| 32 | **【石化】** | `petrify` | 可組合 | 完全不能動，但同時變得很硬（甚至免傷） | = `applyStatus(stun)` + `applyBuff(armor/mr 大幅提升)`，或直接 + `invulnerable{blocksDamage:"all"}`。⚠️ 打在殭屍身上只有 stun 那一半會生效。 |
| 33 | **【處決】** | `execute` | 已有 | 血量低於一條線的目標直接判定死亡（不再只能給一個大到必死的數字） | ⭐ `devour{thresholdPctOfMax（逐階陣列）, victim: champion\|any, healPct, throughShields}`。它**不寫 hp=0**，而是推一發 `type:"true"` 進 damageQueue —— 所以擊殺賞金 / onKill / 掉金幣 / 擊殺語音 / MVP 統計全部走出貨那條路。⚠️ 三件要知道的：① 它是**吞噬風味**不是中性 primitive，純處決要明寫 `healPct: 0`；② 回復基數固定讀施法瞬間的 hp，不是欄位；③ 走傷害佇列 ⇒ 無敵目標會**靜默吞不掉**（沒有 pierceInvulnerable、也沒有「被擋下了」的回饋）。舊頁的 `HP_PCT_DAMAGE_MAX = 0.35` 上界跟這件事無關了。 |
| 34 | **【標記引爆（自己身上的記號）】** | `markDetonate` | 可組合 | 先貼一個記號，之後某一擊把記號換成額外傷害 | 貼 = `applyStatus{statusId}`；吃 = `damage.comboBonus{statusId}` 或 `spendMana.bankAs` + `damage.bankedBonus`。⛔ 兩個現成讀取器**仍然寫死 `ctx.caster`**（`effectCommon.ts:66`、:96）。⭐ 但「貼在敵人身上讓別人讀」那條路現在通了 —— 走的不是 comboBonus 而是 `condition.status`（見層 4）。所以正確的寫法變成：`applyStatus` 貼 → hook 的 `condition:{kind:"status", subject:"target", …}` 問 → 一段獨立的 `damage`。 |
| 35 | **【替身 / 牆】** | `decoy,wall` | 可組合 | 放一個假的自己吸火力／立一道擋住去路的東西 | 替身 = `summon{body:"self", targetPriority:"champion", onCap:"replaceOldest"}`；牆 = 不動的 summon 配 `autoTargetable:false`。⚠️ 出貨前例仍然**不存在**（summon 全樹 0 次），牆仍然擋不住投射物。 |
| 36 | **【瞬移 / 後撤 / 鉤索】** | `blink,retreatDash,hook` | 可組合 | 瞬間到另一個位置／往身後拉開距離／射出去命中就拖過來 | 瞬移 = `tpl-teleport`（enabled，極短 travelSec）；後撤 = `dash{mode:"toPoint"}` 反向或 `knockback{applyTo:"self"}`；鉤索 = `spawnProjectile` + `onHit:[knockback{from:"pull"}]`。⚠️ 拉的仍是**固定距離**不是「拉到我腳邊」。 |
| 37 | **【破盾】** | `shieldBreak` | 已有 | 把對方身上的護盾直接清掉 | ⭐ `shieldBreak{shape: single\|circle, radius?, side?}`，走 `clearPools`。⛔ 它**只碰護盾**，`st.effects` 原封不動（那是淨化不是破盾）。⚠️ 為什麼不是「dispel 勾一個 pool」：`dispelRules.enabled=false` 是【淨化】那一族的止血閥，破盾是傷害向機制，不該跟著被關掉。⚠️ `side` 省略時**打敵人**（2026-08-05 稽核抓到的真缺陷，schema/TS/編輯器三份文件都說敵人而程式碼打隊友）。出貨內容 0 次使用。 |
| 38 | **【無敵（點不到）】** | `untargetable` | 需新建 | 連鎖定都鎖不上，敵人的普攻會自動換目標 | ⛔ 一格都沒動。`invulnerable.ts` 檔頭⑤ 仍然把「不可選取／不可被指定」明列為沒做的三件事之一，理由不變（牽動 targeting.ts + 自動攻擊 + 小怪 AI + 投射物）。⚠️ 做的時候不要順手做成【隱身】。 |
| 39 | **【法球格擋】** | `spellBlock` | 需新建 | 擋下一個「指名你」的技能整發 | ⛔ 沒動。`block` 仍然是**傷害封包層**的機率+比例門（現在多了技能被動這個授權路，但層級沒變），攔不到「一次施法點名了我」。缺 CastResolveSystem 的攔截點 + 一個已消耗計次（而 `hook.consume-policy@1` 那格計次能力也還是 unsupported）。 |
| 40 | **【擬態】** | `mimic` | 需新建 | 變成別人的外觀（甚至借用對方的身分） | ⛔ 沒動，而且原因被寫得更清楚了：`championForm.to` 的 enum 仍然只有 `alternate`/`base`/`toggle` 三個字面值，而一個英雄只有一個 `transform.counterpartId` —— 所以「第二個**不同**的形態」根本不是目的地，再施放一次只會刷新當前形態（WC3 Metamorphosis 語意，刻意保留）。涅吉三形態今天仍然表達不出來。 |
| 41 | **【附身】** | `possess` | 需新建 | 附著在隊友身上跟著他跑、不可被選取、不吃傷害 | ⛔ 沒動。仍然缺一根「載體」關係軸（我的座標每 tick 跟隨某個實體）。全 repo grep `possess`/`carrier` 只命中 aura carrier 與 `nightPact` 的用詞，沒有位置從屬關係。仍是整張表最大的一項，建議單獨排。 |
| 42 | **【淨化 / 驅散】** | `dispel` | ⚠️ **部分已知壞掉** | 主動移除身上（或對方身上）的一個或全部狀態 | ⚠️ **【部分已知壞掉 · 見 §1-C】`pools.status` 與 `pools.dot` 是真的通的；`pools.buffs` 與 `pools.shields` 勾了一筆都拔不掉。** 原文： ⭐ `dispel{shape, radius?, side?, pools{status,dot,shields,buffs}, polarity, count, order}` + `config.dispel@1` 十一格後台旋鈕。走 `clearPools`（跟【破盾】、復活、回合重置同一支）。⚠️ 三件要知道的：① 淨化**一定**看 `dispellable`，回合重置不看 —— 那個差別是一個參數不是兩份程式；② `count` 砍不完時「留哪幾筆」是 `(expiresAtTick, 次要鍵)` 的**全序**，不是插入序；③ `appliesToMobs` 出貨 true。⭐ 舊頁那句「⚠️ 在它存在之前不要在任何卡片上寫驅散、淨化、解除」**現在可以刪掉了**。出貨 3 次（godie-i01s / i018 / i031）。 |
| 43 | **【環繞衛星】** | `orbitingBody` | 需新建 | 一顆真的繞著你轉的東西，碰到誰就打誰，會跟著你走 | ⛔ 沒動。仍然缺一個跟隨式的持續碰撞實體（宿主軌道錨點 + 每 tick 接觸判定）。`tpl-orbit-array` 是放射不是軌道，`summon` 放得出身體但不會繞誰轉。 |
| 44 | **【延遲落地（通用排程）】** | `delayedImpact` | 可組合 | 施法之後過 N 秒才執行這串效果 | ⭐ `randomArea` 是一個**真的排程器**，而且延遲那一半完全夠用：`count` 逐階發數、`intervalSec` 節奏、`effects[]` 任意載荷、到期是**絕對 tick**、`firstAtCast` 決定第一發在不在施法那一刻、`stopOnCasterDeath` 決定死了還算不算。⛔ **但落點是隨機散佈不是「指定位置」**：`scatterRadius` 是必填且 >0，錨點只能是 `who: self\|target`。要「N 秒後在**這個點**執行」就得把 scatterRadius 縮到很小去逼近它 —— 那是一個能寫但會說謊的寫法。⚠️ 它也**不是**【地面領域】【陷阱】【引導】的共同答案（那三個要的是駐留 + 進出判定）。 |
| 45 | **【地面領域】** | `groundField` | 需新建 | 在地上留一塊持續生效的區域，人走進去才吃到 | ⛔ 仍然不通，但缺口變小了：`randomArea` 給了節奏與延遲，缺的剩下**地面錨點實體 + 進出判定**（一發脈衝 ≠ 一塊駐留的地）。舊頁那三條繞路仍然不通：dot 掛在身體上、damageArea 是一瞬間、召喚物沒有授權路徑掛帶 auras 的 source。`tpl-periodic-field 週期領域` 至今仍是 draft。 |
| 46 | **【陷阱】** | `trap` | 需新建 | 放著不動，敵人踩到才引爆 | ⛔ 沒動。跟【地面領域】同一個缺口，外加一個**空間觸發事件** —— `zHookEvent` 現在有 15 個成員，仍然沒有任何一個是空間的。 |
| 47 | **【引導】** | `channel` | 需新建 | 按著不放持續輸出，被打斷就中止 | ⛔ 仍然不通，但最像的東西換人了：`ability@1.toggle` 給了「再按一次關」+ 每秒/每擊維持成本 + **單一關閉出口** `exitToggle`（手動關與 MP 不足自動關走同一條，所以 onExit 不可能只發生一半）。⛔ 缺的是引導**專屬**的三件：每拍結算、中斷條件（移動/受擊/被控）、以及自帶時限。`castTimeSec` 仍是前搖不是引導；`tpl-channel-beam` 仍是 draft。⚠️ 另一個坑：切換狀態**死亡時不觸發 onExit**（屍體不付維持成本但旗標留著）。 |
| 48 | **【換位 / 偷屬性】** | `swapPlace,stealStat` | 需新建 | 我跟目標互換位置／從對方身上拿走一項屬性加到自己身上 | ⛔ 兩張卡仍然寫不出來，**但舊頁給的理由已經作廢**。舊頁說「沒有任何 kind 會在同一次結算裡寫兩個身體」—— `swapResource` 就是那個接縫，而且它把原子性做對了（先驗後改，不留『換了一半』的世界）。⛔ 剩下的是**範圍**：`swapResource` 只認 health / mana，`grantAttribute` 仍然只加不減、只寫一個身體，而位置交換沒有任何 kind。 |
| 49 | **【複製技能 / 時間回溯 / 連段】** | `copyAbility,rewind,combo` | 需新建 | 偷用對手剛放的招／把自己拉回幾秒前／同鍵連按第二段第三段是不同的招 | ⛔ 三張都沒動，仍是這一層最貴的。`combo` 在 `SIM_CAPABILITIES` 裡仍然是**唯一** `available:false` 的一格（ggd-runtime-capabilities.json 的 simCapabilities 逐字確認）。複製技能缺「執行期把 AbilityDef 塞進某人的槽」的接縫；回溯缺狀態快照（replay 存的是輸入不是狀態）。⚠️ `damage.comboBonus` 名字很像但不是它。 |
| 50 | **【冷卻縮減 / 重置】** | `modifyCooldown` | 已有 | 指名一支技能，把它的冷卻縮短或直接歸零 | ⭐ 舊頁沒有這一格。`modifyCooldown{slot 或 abilityId, reduce\|reduceFlat\|reset, basis}` —— `basis` 決定百分比的分母是**剩餘量**還是**基礎冷卻**（兩種語意差很多，所以它是欄位不是註解）。出貨內容 0 次使用。 |
| 51 | **【機率分支（俄羅斯輪盤）】** | `weightedBranch` | 已有 | 一次施放按權重抽一個分支，各分支跑各自的效果串 | ⭐ 舊頁沒有這一格。機制完整：一次施放**只 draw 一次** `world.rng`（決定性要求），總權重 0 在載入時就被擋。⛔ 但 §16.14 的**機率表語意尚未 owner freeze**（1/6 是「每次獨立」還是「六發彈倉」），所以 89-002 那一類文件在 freeze 之前應該被 importer 拒收 —— **引擎做得到，規格還沒定**。這一格是「可用性 ≠ 該用」的標準案例。 |
| 52 | **【資源交換】** | `swapResource` | 已有 | 把自己跟目標的現存生命（或魔力）整個對調 | ⭐ 舊頁沒有這一格。resolve tick **原子**交換，各自夾到 `[clampMin, 自己的上限]`。⛔ 它刻意**不走**傷害／治療佇列：走 damageQueue 會吃護甲、觸發 onDamageTaken、被護盾吃掉，交換完的血條就不是對方原本那一條了。三個決策點都是欄位（`resource` / `clampMin` 預設 1＝不殺人 / `onInvalidTarget` 預設 abort＝全招失敗）。 |
| 53 | **【事件值轉換（傷害／血量→資源）】** | `eventValueConversion` | 已有 | 把「剛剛那一發打了多少」或「他還剩多少血」換成自己的血或魔，可順帶給一段限時屬性 | ⭐ 舊頁沒有這一格，而它正是舊頁在【處決】【反彈】兩處各繞了一半的那個讀數。來源可選 `incomingDamage`（讀 `EffectContext.incoming`）或 `targetCurrentHealth`。⚠️ 基數 `raw \| mitigated \| hpLost` **尚未 owner freeze**，所以它是一格欄位，出貨預設 `mitigated`（與 `damage.incomingPct.basis` 同一句話）。 |
| 54 | **【魔力屏障（傷害轉扣魔）】** | `manaBarrier` | 已有 | 傷害在扣血之前先被換成扣魔，魔力見底才開始掉血 | ⭐ 舊頁沒有這一格，而且舊頁在【吸收】那裡明說 shield+spendMana **拼不出**它（沒有任何東西把傷害導進魔力池）。現在有了：`manaBarrierCutFor` 在扣血之前把傷害換成扣魔，`perMana` 就是 damage-to-MP 比率，抵不完的部分原封往下走進免死→血條。⛔ 不是受傷後補護盾：魔力真的被扣、期間回的魔力真的變成新的抵擋量。`damageTypes` **必填明列**。⚠️ 契約檔說它「接線還沒接」—— **那句話是過期的**，`combat/damage.ts:876` 已經在呼叫它。 |
| 55 | **【增益延長（挨打就延長）】** | `extendBuff` | 已有 | 這段增益期間每承受一定量的傷害，就把它延長一點 | ⭐ 舊頁沒有這一格，而現有詞彙**組不出來**（逐條查過）：`applyBuff.stackKey` 寫的是「重設到滿」不是「延長」，而條件葉與 HookDef 的過濾器沒有任何一格讀得到「剛剛那一下打了多少」。⭐ 實作是**無狀態**的（延長量是這一發傷害的連續比例），不需要累積器、不需要新 SimWorld 欄位、不需要任何接線。⚠️ `maxRemainingSec` 是**必填** —— 這是正回饋，沒有上界會變成永久，而症狀是「這個回合打不完」，一個不會讓任何測試變紅的故障。 |
| 56 | **【隨機落點排程】** | `randomArea` | 已有 | 在一塊區域裡按節奏連續丟 N 發，每一發自己抽落點 | ⭐ 舊頁沒有這一格，而它是舊頁點名「引擎沒有通用延遲原語」的第一個真回應。⭐ draw 預算是**明確**的：一次施放固定花 `2 × count` 次 rng，**全部在施法那一刻抽完** —— 所以「這一波抽了幾次」不受場上人數、也不受它有沒有被打斷影響（replay 重現得出同一組落點）。到期是絕對 tick；方形→圓形用 elliptical grid mapping（sim 禁三角函式）。⚠️ `tpl-random-barrage` 那 8 張卡**仍然走 `dot`**，遷移是獨立的一批。 |
| 57 | **【層數帳本（具名標記）】** | `namedMarks` | 已有 | 給一個身體掛一份可扣減的層數帳本，跨回合、可永久 | ⭐ 舊頁沒有這一格，而舊頁的【層數累積】是**加法**、會過期、住在 ModifierSource 上 —— 三條路都寫不出「初始 12 層、消耗一層」。⭐ 標記的**身分是借來的**：`MarkId` 就是一份既有文件的 id（技能編號或 status id），所以名稱／圖示／描述全部跟著那份文件走，owner 要換的時候換的是一個字串。⚠️ **到期與重置是兩根獨立的軸**：`expiresAtTick`（-1＝永不）vs `resetOn`（回合邊界補回初始值）—— 混成一個數字的話「永久但每回合重置」就永遠寫不出來。 |
| 58 | **【免死（消耗一層標記）】** | `lethalSave` | 已有 | 會殺死我的那一發被削到剛好留一口氣，並燒掉一層標記 | ⚠️ 先讀 §2-3（免死擋不到火圈，GH#287）。原文： ⭐ 舊頁把【免死】列在層 5 而且註明「只掛得到道具上」。現在有第二種、而且更強的：任何帶 `lethal` 規則的具名標記。攔截點在**護盾之後、扣血之前** —— 所以一發被護盾整包吃掉的重擊不會燒掉一層試煉。⭐ 它不寫 `dmg = 0`，而是削到「剛好留下 floor」，所以下游（浮動數字、吸血、擊殺歸屬）看得到一發真的發生過的傷害，畫面上是血條被打到底再被拉住。⛔ **火圈燒傷攔不到**（`FireRingSystem` 直寫 `hp.hp -=`）。 |
| 59 | **【技能切換（維持成本 · 單一出口）】** | `abilityToggle` | ⚠️ **部分已知壞掉** | 按一次開、再按一次關，開著的期間持續付魔力，關的時候跑一段收尾效果 | ⚠️ **【部分已知壞掉 · 見 §1-D】機制在，但玩家看不到它開著（狀態不在任何 snapshot 欄位、事件是 SERVER_ONLY），而且被暈眩／被沉默／施法中都關得掉。** 原文： ⭐ 舊頁的【切換】只有「換身體」那一種。`ability@1.toggle` 是不換身體的那一種：開關成本（`ability@1.manaCost`）與維持成本（`toggle.upkeepCost`）是**兩個獨立數列**，節奏 `none`/`perAttack`/`perSecond` 是欄位。⭐ `exitToggle()` 是全專案唯一的關閉出口 —— 手動關（`castAbility` 第二次按下，刻意排在冷卻閘之前）與 MP 不足自動關都只是呼叫它，所以「關閉時釋放風王鐵槌」不可能只發生一半。⛔ 三件缺的：沒有互斥群、沒有自帶時限、**死亡不觸發 onExit**。⛔ 而且它的狀態**不在任何 snapshot 欄位裡**（見層 5）。 |
| 60 | **【跨技能強化】** | `abilityAugment` | 可組合 | 一支技能去改另一支指名技能的機率／持續時間／傷害係數／門檻 | ⭐ 舊頁沒有這一格。目標是 **exact ability ref**（不是槽位、不是名稱文字），操作是 **allowlist enum** 四項（`procChance` / `durationSec` / `damageCoeffAp` / `thresholdPct`），每個 op 的 value **兩端都有界**，**fail closed 在載入時**（指不到就 `DanglingRefError`）。⛔ 判成「可組合」而不是「已有」的理由是**只有被動區塊那一個 seam 接上了** —— 主動施放路徑（`castAbility` 讀 `def.effects`）還沒問過 augment，所以「強化一支**主動技**的傷害」今天拿不到。⚠️ 另外 `nodeKind` 是自由字串，打錯字＝那條操作靜默無效，**不要假裝它會紅**。出貨內容 0 次使用（landing 狀態）。 |

## §3-2 層 2：狀態軸 status axis —— 掛在【狀態】上的持續修改

**11 列：已有 10 · 可組合 1 · 需新建 0**

> ⭐ 這一層是五層裡翻得最徹底的一層：需新建 5 → 0。`StatusEffect` 從 5 格旗標長到 16 格（moveSpeedMult / root / stun / missChance / berserk / feared / silenced / targetsAllies / breakOnDamage / breakOnDamageMin / healingTakenMult / lifestealMult / regenMult / magnitude / dispellable / polarity），而且**每一格都有真的消費端**（逐一 grep 過，不是讀 schema）。

| # | 標籤 | engine token | 狀態 | 做什麼 | 怎麼寫 / 缺什麼 |
|---:|---|---|---|---|---|
| 1 | **【暈眩】** | `stun` | 已有 | 走不動也打不了，施法當場被打斷 | `applyStatus{stun:true}`，duration 兩端有界 0.034~20 秒，消費端四處。出貨用 272 次 applyStatus（全 kind 第三多）。⭐ **舊頁的「⚠️ 對殭屍無效」已經作廢** —— `spawnMobBody` 現在建 StatusComp。⭐ 另外「暈眩」在內容裡不是一份文件是五份（burnstun / fang-stun / ingredient / omnislash-lock / trial-stun），所以要問「他被暈了嗎」請用 `tag:"stun"` 不要列五個 id。 |
| 2 | **【定身】** | `root` | 已有 | 腳黏在原地，但還能普攻、還能施法 | `applyStatus{root:true}`。⭐ 對殭屍現在有效。⚠️ `MovementSystem` 明文 dash/knockback ignores root by design —— 定身**擋不住位移技**，而「禁止位移」仍然是一根不存在的軸（`effect.control-restriction@1` 仍是 unsupported：五個布林不是一張可組合的表）。 |
| 3 | **【減速 / 加速】** | `slow,haste` | 已有 | 移動速度按比例升降（同一根軸的兩個方向） | `applyStatus{moveSpeedMult}`，<1 減速 >1 加速，出貨三份文件 slow25/30/40。⭐ 對殭屍現在有效。⭐ 兩個方向現在是**兩條推導規則**（`slow`+`cc` vs `haste`），所以「他被減速了嗎」與「他被加速了嗎」是兩個不同的問題，條件葉答得出來。 |
| 4 | **【失手（詛咒）】** | `blind` | 已有 | 自己的普攻有機率完全打空，技能照常命中 | `applyStatus{missChance: 0..1}`，方向是攻擊者身上（多來源取 MAX）。⭐ 對殭屍現在有效。⭐ **舊頁那個命名撞車已經裁掉了**：`curse.json` 的 name 現在逐字是「詛咒」（不是「恐懼 (詛咒)」），`fear.json` 拿走「恐懼」，兩份共用 `miss` 這個族名 tag。舊頁的收尾建議②已完成。 |
| 5 | **【暴走】** | `berserk` | 已有 | 失去操控權自己亂衝亂打，但不是硬控 | `applyStatus{berserk:true}`，刻意**不**被免控擋（`isCc` 判定不含它）。⭐ 對殭屍現在有效。⭐ 它推導的 tag 是 `berserk` + `uncontrollable`，**不含 `cc`** —— 這是刻意的，而且它跟【恐懼】共用 `uncontrollable` 這一族，所以「他現在不受控嗎」一句話問得到兩者。 |
| 6 | **【繳械】** | `disarm` | 可組合 | 技能還能放，普攻打不出傷害 | = `applyStatus{missChance: 1}`。`rollFumble` 早於 `fireHooks(onBasicAttack)` return，所以沒有傷害封包、沒有吸血、沒有 on-hit proc。⚠️ 兩個真的差別仍在：揮空刀動畫照播、攻速週期照燒。想要「收刀」的手感才要新軸。 |
| 7 | **【混亂】** | `confusion` | 已有 | 失去控制，而且敵我不分見人就打 | ⭐ `applyStatus{berserk:true, targetsAllies:true}` —— 舊頁預言的形狀（「berserk 旁邊一個 targetsAllies 開關」）逐字成真。消費端在 `targeting.ts:500`（索敵那一步真的把友方放進候選）。出貨文件 `confusion.json`，tags 含 `confusion` / `uncontrollable` / `friendly-fire` / `cc`。 |
| 8 | **【沉默】** | `silence` | 已有 | 打得到人，但技能放不出來 | ⭐ `applyStatus{silenced:true}`。閘就在舊頁指的位置：`abilities/abilitySystem.ts:161` `if (st?.effects.some((e) => e.silenced && e.expiresAtTick > world.tick)) return "silenced"` —— 而且它回的是一個**具名的拒絕理由**，所以玩家按鍵有回饋不是石沉大海。推導 tag 是 `silence`，刻意**不進 `cc`**（它不擋腳）。 |
| 9 | **【恐懼】** | `fear` | 已有 | 失去控制並朝反方向逃跑 | ⭐ `applyStatus{feared:true}`，`sim/fear.ts` 是它自己的模組。⭐ 它**是** CC（免控擋得掉，`applyStatus.ts:29` 的 isCc 含它），而且只管腳不管手 —— 要連技能一起封請在同一張卡再寫 `silenced:true`（`fear.ts:34` 逐字示範這個組合）。命名撞車已裁（見【失手】那格）。 |
| 10 | **【睡眠】** | `sleep` | 已有 | 完全不能動，但被打一下就醒 | ⭐ `applyStatus{stun:true, breakOnDamage:true, breakOnDamageMin: N}`。⛔ 舊頁說它是【淨化】的下游、不能先做 —— 結果兩件事**同一批一起出貨**了，而且睡眠走的是自己的 `sim/statusBreak.ts`（只拔標了 `breakOnDamage` 的那幾筆）不是 dispel。⭐ `breakOnDamageMin` 住在**文件上**是關鍵：第 3 回合之後場上到處是 DoT，沒有門檻的話一跳燒傷就把人打醒了。⚠️ `breakOnDamage` **刻意不推導 `sleep` tag** —— 「怎麼結束」不是「它在做什麼」，要 tag 請在文件上宣告一個。 |
| 11 | **【標記（貼在敵人身上、給別人讀）】** | `mark` | 已有 | 在目標身上留一個記號，之後打他的人可以引爆／吃加成 | ⭐ 舊頁說「貼那一半今天就能寫，缺的是**讀**」—— 讀的那一半出貨了：`condition.status` 的 `subject: self\|target` 兩個方向都問得到。⭐ 而且它是一個 **UNION**：問**這一份**（`statusId`）或問**這一類**（`tag`）。後者是重點 —— 「暈眩」在出貨內容裡是五份文件，exact id 逼作者寫 `any:[五個 id]`，而那張卡會在第六份暈眩上架那天安靜地漏掉它。⛔ `damage.comboBonus` / `bankedBonus` 兩個舊讀取器**仍然寫死 caster**，所以引爆那一步要用獨立的 damage 效果不要用它們。 |

## §3-3 層 3：觸發時機 hook event —— 「什麼時候發動」

**15 列：已有 5 · 可組合 1 · 需新建 9**

> ⚠️ 這一層我**拆了兩列**，因為舊頁把 shipped 與 not-shipped 綁在同一列裡，而現在它們的答案不一樣了：①【迴避時/格擋時/抵擋致命傷時】拆成【迴避時】(have) 與【格擋時/抵擋致命傷時】(new)；②【殭屍波開始/殭屍王出現/火圈點燃/守衛塔倒下】拆成三個場上節點 (have) 與【殭屍波開始】(new)。不拆的話那兩列會各自變成一個一半的謊話。

| # | 標籤 | engine token | 狀態 | 做什麼 | 怎麼寫 / 缺什麼 |
|---:|---|---|---|---|---|
| 1 | **【引擎今天真的會發射的時機】** | `shippedHookEvents` | 已有 | 所有真的有發射點的觸發時機 | ⭐ **從八個變成十五個**：onAbilityCast · onAbilityHit · onBasicAttack · onDamageDealt · onDamageTaken · onKill · onStunned · onInterval（原八個，`onLevelUp` 已刪）＋ onReflectSuccess · onBossSpawn · onFireRingIgnite · onGuardianDown · onDeath · onRevive · onEvade。⭐ 過濾器也**從五個變成七個**：`abilitySlot` · `victim` · `damageSource` · `condition` · `chance`/`chanceFrom` ＋ 新的 **`damageType`** 與 **`damageCrit`**（見層 4）。⛔ 出貨採用率量到的是：onBasicAttack 68 · onDamageTaken 19 · onKill 13 · onInterval 9 · onAbilityHit 6 · onAbilityCast 5 · onStunned 2 · **其餘七個全部 0**。 |
| 2 | **【擊殺後 N 秒內（以及所有「某事之後的一段時間」）】** | `afterKillWindow` | 可組合 | 某件事發生之後的一小段時間裡，別的東西才生效 | ⭐ 仍然是**通用招式**，而且新增的六個事件全部免費繼承它：`任何事件 → applyBuff{duration: N, hooks:[…]}`。`applyBuff` 真的把 hooks 掛上去、`fireHooks` 真的跳過過期的 source —— buff 在＝窗口開著。⛔ 不要為每一個「之後 N 秒」開新事件。⚠️ 它**不能**當成「下一次」用：5 秒 buff 上的 onBasicAttack 在攻速 4 的英雄身上會觸發 20 次（`hook.consume-policy@1` 仍是 unsupported）。 |
| 3 | **【升級時】** | `onLevelUp` | 需新建 | 角色等級提升的那一刻發動 | ⛔ **舊頁的描述現在是反方向過期的。** 舊頁寫「枚舉裡有、型別裡有、後台下拉選得到，而 sim 全樹零個發射點」並把它排成第一名（成本最低、風險最高）。結果 owner 裁決 A2（泛化 pending-hook 佇列）**不做**，這個選項在 2026-08-05 被**從 enum 刪掉**了 —— 刪掉是安全的，因為普查證明零份文件用過它。所以今天它不是「有下拉但啞的」，而是**下拉裡也沒有了**。⚠️ 這只拿掉了這一個謊話，沒有關掉「下拉裡有、引擎沒有」這個**形狀**。 |
| 4 | **【死亡時 / 復活時】** | `onDeath,onRevive` | ⛔ **已知壞掉** | 自己被打倒／被拉起來的那一刻發動 | ⛔ **【已知壞掉 · 見 §1-A / §1-B】這一列的「已有」在 2026-08-08 的對抗複驗被推翻：`onDeath` 在出貨路徑上一次都不會發，`onRevive` 只有道具復活那條窄路會發。** 下面這段是原始盤點的說法，逐字保留是為了讓你看見它為什麼**看起來**是通的（兩個檔案各自自洽，合起來是啞的）—— 但不要照它設計卡片。原文： ⭐ 兩個都出貨了，走的是一張表不是兩支系統：`WorldHookSystem` 的 `WORLD_HOOKS` 一列 = 一個時刻。`onDeath` 持有者＝死掉的人、target＝兇手（火圈/DoT 燒死時**沒有 target**，那是對的不是缺陷）。`onRevive` 持有者＝被復活的人，不是頂圈圈的隊友。⭐ 舊頁警告的那個坑（`hooks.ts` 開頭 `if (!ownerHp.alive) return`）處理掉了：`"actor"` 作用域**故意不擋死人**，因為【死亡時】的持有者依定義就是剛死的那個。 |
| 5 | **【被治療時 / 治療他人時】** | `onHealed,onHealDealt` | 需新建 | 血被補回去／自己把血補給別人的那一刻 | ⛔ 沒動。治療路徑上仍然**一個 `fireHooks` 都沒有**（我 grep 過 `combat/restore.ts` 與 `effects/heal.ts`，零命中），儘管 `healingTakenMult` 這一批已經在同一支函式裡動過刀了。⚠️ 建議發射時帶治療封包（來源、量、origin）—— 不帶就寫不出「治療量的 20% 轉成護盾」，而且【吸血觸發時】會免費得到（吸血在 damage.ts 已經是一發 `origin:"lifesteal"` 的治療）。 |
| 6 | **【護盾產生時 / 破碎時】** | `onShieldGain,onShieldBreak` | 需新建 | 身上出現一層護盾／護盾被打光的那一刻 | ⛔ 事件仍然沒有。⚠️ 但這一批多了**兩個新的破盾來源**（`shieldBreak` kind 與 `dispel{pools.shields}`），所以「破碎那一格」現在有三種發生方式（被打光、被破盾、被淨化），而事件如果要做就得說清楚三者算不算同一件事。護盾池已有型別過濾（`absorbs`），所以事件應該帶「被什麼型別打破的」。 |
| 7 | **【迴避時】** | `onEvade` | 已有 | 閃過一次攻擊的那一刻 | ⭐ 出貨了。⚠️ 持有者是**閃掉的那個**（`data.target`），對手是攻擊者（`data.source`）—— WORLD_HOOKS 那一列的註解逐字寫著「兩個 key 是反的，照抄會把卡片掛到攻擊者身上」。⛔ 兩個限制：① 舊頁要的「兩個視角都發」只做了**防守方**這一半（「我被閃掉了」仍然沒有）；② 還沒區分「真閃避」與「攻擊者 fumble（詛咒/繳械）」，而計畫 §13 要求 fumble 零次。 |
| 8 | **【格擋時 / 抵擋致命傷時】** | `onBlock,onLethalPrevented` | 需新建 | 擋下一發傷害／一發本來會打死自己的傷害被擋下 | ⛔ 事件仍然沒有，**但這一批把它變成一列表格的事**：免死機制本身出貨了（`lethalSave`），而且它已經 `world.emit("lethalSaved", …)`。缺的只是 `WORLD_HOOKS` 加一列（`{simEvent:"lethalSaved", hook:"onLethalPrevented", scope:"actor", actorKey:…}`）＋ `HookEvent`/`zHookEvent` 各一個成員。格擋那一半連 emit 都還沒有。⚠️ 它幾乎一定要配【每回合只發動一次】，而那格仍然不存在。 |
| 9 | **【狀態被套用的當下】** | `onStatusApplied` | 需新建 | 某個狀態剛被掛到自己身上的那一瞬間 | ⛔ 沒動，仍然很便宜（`applyStatus.ts` 的 `st.effects.push(...)` 是唯一入口）。⚠️ 但它的**價值變高也變複雜了**：狀態軸從 5 格長到 16 格，而且現在有 78 個相異 tag —— 所以做的時候過濾器應該吃 **tag**（沿用 `hasStatusTag`）而不是只吃 statusId，否則會複製「五份暈眩要列五個 id」那個坑。⭐ 既有的 `onStunned` 就是它加一個過濾器的特例。 |
| 10 | **【進入範圍時 / 離開範圍時】** | `onEnterRange,onLeaveRange` | 需新建 | 有人走進／走出自己周圍一圈的那一瞬間 | ⛔ 沒動。`aura.ts` 每 tick 仍然在算「這一 tick 誰該在半徑內」的期望集合並刻意不做訂閱、不存側表，把差集兩邊冒出來就是 enter/leave。三個護欄要一起進去（半徑上界 40、每個訂閱要有 internalCooldown、去抖用既有的 lingerSec）。⚠️ 大部分「靠近」需求根本不需要事件 —— aura 投影一個帶 hooks 的 source 就是了。 |
| 11 | **【殭屍王出現 / 火圈點燃 / 守衛塔倒下】** | `onBossSpawn,onFireRingIgnite,onGuardianDown` | 已有 | 三個場上節點的那一刻發動 | ⭐ 三個都出貨了，作用域是 `"world"`（場上每一位活著、帶 StatsComp 的單位都收到），所以 hook **沒有 target**，`subject:"target"` 的條件葉一律讀作 false、效果解到持有者自己身上。⚠️ 一個明確的**設計決策**：world 事件**不發給死人**（躺著等王不能變成策略）—— 而那被明說是設計偏好不是技術限制，要改的正確做法是加一格欄位。⭐ 守衛塔那一格是唯一接得到「塔倒了」的路（打塔**不發 onKill**），也就是 GH#263 的掛載點。 |
| 12 | **【殭屍波開始】** | `onWaveStart` | 需新建 | 一波殭屍開始湧入的那一刻 | ⛔ 四個場上節點裡**唯一沒做的那一個**。`WORLD_HOOKS` 只有六列，沒有 wave start。成本已經降到明碼標價：這裡一列 + `HookEvent` 一個成員 + `zHookEvent` 一個成員 + `fieldAdoption` 一筆豁免，**不用寫新系統**。⚠️ 前提是 MobSystem 那邊要有一個對應的 `world.emit`。 |
| 13 | **【回合勝負 / 全場勝負 / 任務完成 / 選到增益卡 / 購買道具】** | `hostEvents` | 需新建 | 五個住在 game-server 而不是 sim 裡的時刻 | ⛔ 仍然不通，但舊頁說的「缺的不是五個事件，是一條通道」現在**只缺一半**：sim 內部那條通道已經存在且已驗證（`world.emit` → `WORLD_HOOKS` 一張表 → `fireHooks`）。缺的是**外部注入口** —— apps/game-server 全 repo grep 不到任何 `world.emit` / pending host event queue。⚠️⚠️ 它仍然**必須進 replay digest**：一個從外面注入而沒進 digest 的事件會讓錄影在該點之後整個分岔，而症狀出現在完全不相干的地方。這條要寫進規格再動工。 |
| 14 | **【隊友陣亡時】** | `onAllyDeath` | 需新建 | 同隊的人被打倒時，自己身上的東西發動 | ⛔ 仍然沒有，**但依賴解掉了**（onDeath 出貨了）。剩下的精確缺口是**訂閱範圍**：`WorldHookRow.scope` 只有 `"world"`（全場活人）與 `"actor"`（事件裡指名那一位）兩種，沒有 `"allies"`。⚠️ `HookDef.target:"allies"` 是「效果打在全隊身上」，不是「全隊都收得到這個事件」—— 兩者不要搞混。成員規則沿用現成的 `alliedChampions`。 |
| 15 | **【反彈成功時】** | `onReflectSuccess` | 已有 | 自己反彈出去的那一發真的打中了的那一刻 | ⭐ 舊頁沒有這一格（它把【反彈】當成效果列在層 1，沒有列「反彈成功」這個時機）。判準很嚴：「成功」= 一發 `reflectDepth > 0` 的封包**真的落地**，兩層閘（incomingPct 自己的四道 + 沒被死亡/無敵/迴避擋掉）任何一道攔下都不算。持有者＝防禦者，target＝攻擊者。⭐ `EffectContext.incoming` 是**那一發反彈封包自己的** TriggerDamage。⛔ 原傷害**沒有**進 payload（那是第二個真相）—— 要「原傷害的百分比」請掛 `onDamageTaken`。 |

## §3-4 層 4：條件 condition —— 「在什麼情況下才算數」

**10 列：已有 4 · 可組合 0 · 需新建 6**

> 條件葉從 3 種（chance / stat / kind）變成 5 種（+ status + equipment）。⭐ 舊頁自己選的「整張表 CP 值最高的一格」（傷害型別與暴擊過濾）與「缺它代價最大的一格」（身上有某狀態時）**兩個都做掉了**。剩下的六格全部是**同一種東西**：讀數 sim 都拿得到，缺的是葉子。

> ⛔ **這一層每一列都受 [§2-2](#2-2-條件只活在-hook-上--這條決定你的表單形狀) 限制**：條件只能掛在 hook 上，
> 不能掛在主動技的效果陣列上。下面標成「已有」的條件葉，指的是**葉子本身**存在，不是「哪裡都能用」。

| # | 標籤 | engine token | 狀態 | 做什麼 | 怎麼寫 / 缺什麼 |
|---:|---|---|---|---|---|
| 1 | **【被小兵傷害時 / 被英雄傷害時】** | `attackerIsMob,attackerIsChampion` | 已有 | 只有被殭屍／被英雄打到才算數 | `{kind:"kind", subject:"target", is:"mob"\|"champion"}`，四種 `ConditionEntityKind`（champion / mob / summon / guardian）都分得出來。出貨用 5 次。⚠️ 每個 `kind` 葉都是**正面測試**：`not(目標是英雄)` 在沒有目標時是 TRUE，要「有目標而且不是英雄」請寫 `all:[目標是小兵]`。 |
| 2 | **【暴擊時 / 被 AP / 被 AD / 被真傷】** | `triggerDamageFilters` | 已有 | 讓一條 hook 只在「這一發是暴擊 / 是法傷 / 是物傷 / 是真傷」時才算數 | ⭐ **做掉了，而且做法就是舊頁預測的那個**：`DamagePacket` 手上早就有 `type` 與 `crit`，抄進 `TriggerDamage`，再在 `HookDef` 上開兩個過濾器 —— `damageType: any\|physical\|magic\|true` 與 `damageCrit: any\|crit\|nonCrit`。⚠️ 兩件要知道的：① 閘放在 internalCooldown 與骰子**之前**（抽輸/條件不成立不燒冷卻）；② schema 有一段 refine 專門擋「把 `damageCrit` 掛在不帶封包的事件上」—— 那正是失敗形態②的守衛。⛔ 出貨內容 0 次使用。 |
| 3 | **【身上有某狀態時】** | `hasStatusCondition` | 已有 | 只在自己或對方正被某個狀態掛著時才算數 | ⭐ **做掉了，而且比舊頁要的多一層**。它是一個 UNION：問**這一份**（`statusId`）或問**這一類**（`tag`），`{statusId, tag}` 兩格一起寫是 PARSE ERROR。⭐ `tag` 的來源是 **OR 兩路**：文件宣告的（`status-effect@1.tags`，27 份文件 78 個相異 tag）或這一筆實例**推導**的（`STATUS_FIELD_TAGS`，作者漏標也查得到）。⭐ 而 `STATUS_FIELD_TAGS` 是 `Record<keyof StatusEffect, …>` —— 往 StatusEffect 加一格旗標而不表態，`pnpm typecheck` 就回非零。⛔ 沒有 StatusComp 的身體回 false，而註解裡「小兵一個都沒有」那句話**是過期的**（殭屍現在有了）。⛔ 出貨內容 0 次使用。 |
| 4 | **【第 N 回合起 / 回合第 N 秒】** | `roundAtLeast,roundClockWindow` | 需新建 | 讓一張卡從第幾場開始才生效，或只在一回合的某個時間窗生效 | ⛔ 沒動。兩樣讀數 sim 都拿得到（`world.round`、`world.fireRingTicks`），缺的仍是葉子。⚠️ 「第 N 回合發糖果」掛 `config.arena-rules@1` 的 `rounds{N}` 就好；需要葉子的是「第 N 回合起，我的技能變成…」。時間窗最便宜的形狀不是新事件，是給 `onInterval` 加 `afterSec`/`beforeSec` + 一個 `once` 旗標。 |
| 5 | **【被 BOSS 傷害時 / 對 BOSS 傷害提升】** | `targetIsBoss` | 需新建 | 只有殭屍王那一級的頭目才算數 | ⛔ 沒動：`ConditionEntityKind` 仍然只有四種，殭屍王仍然躲在 `mob` 底下沒有獨立身分。⚠️ 諷刺的是**「殭屍王出現」那個時機已經做掉了**（`onBossSpawn`）—— 所以現在寫得出「王出場時全隊加攻」，卻仍然寫不出「對王傷害 +30%」。缺第五種 kind（或 mob 身上一個 boss 旗標 + 葉子讀它）。 |
| 6 | **【附近敵人達 N 人時】** | `enemiesNearbyAtLeast` | 需新建 | 只有周圍敵人夠多（或夠少）才算數 | ⛔ 沒動。一個新葉子（半徑內計數 + 比較），與 onEnterRange 共用**同一份 broadphase 查詢**，不是第二套空間系統。這是「被包圍時爆發」「單挑時強化」整族的唯一入口。 |
| 7 | **【連續命中第 N 下 / 每回合只發動一次】** | `everyNth,oncePerRound` | 需新建 | 同一條觸發累積到第幾次才發動一次／整場只認第一次 | ⛔ 沒動，而且這一批把它的代價講得更明白了：`hook.consume-policy@1` 仍是 **unsupported** —— `maxTriggers` / `consumeOn` / `expiresAt` / `perTarget` 四格都不存在。⛔ 不可以用 `internalCooldown` 近似：攻速快的英雄會多觸發、慢的會漏觸發，而兩種錯法在畫面上都看不出來。⭐ 實作位置仍然現成（`hookLastFired` 每條 hook 一格，同一個位置再放一個計數）。⚠️ 它是【抵擋致命傷】【血量首次低於】的前提，而前者的事件也還沒做 —— 兩件事一起排最省。 |
| 8 | **【血量首次低於門檻 / 魔力耗盡時】** | `onResourceCross` | 需新建 | 血量或魔力**第一次**掉破某條線的那一刻 | ⛔ 沒動。⚠️ 兩張卡一個事件，分開做會變成兩個住處。一半今天就有（`onDamageTaken` + `{stat:"hp", mode:"percent", op:"<"}`），缺的是「**穿越**」與「**只算一次**」的語意 —— 後者就是上一格。 |
| 9 | **【脫離戰鬥 N 秒後 / 靜止 N 秒後 / 移動 N 距離後】** | `outOfCombatFor,afterStandStill,afterDistanceMoved` | 需新建 | 一段時間沒被打／站著不動／累積跑過一段路之後才生效 | ⛔ 沒動。三張卡共用一把尺：一個「上次某事的絕對 tick」讀數 + 一個讀時間差／距離差的葉子。⚠️ 一定要存**絕對 tick** 不要存遞減計數器。⚠️ 靜止與移動是同一個旋鈕的兩端，只做一半會讓走位派與站樁派不對稱。 |
| 10 | **【裝備了某道具 / 某類道具時】** | `hasItemOfTag` | 已有 | 只有背包裡有某一件（或某一類）裝備時才算數 | ⭐ **做掉了**，而且跟狀態葉同一個手法：一個 UNION（`zEquipmentItemLeaf` \| `zEquipmentTagLeaf`），`{itemId, tag}` 同時寫是 PARSE ERROR，不會安靜地由求值端替作者決定哪一格贏。分類讀 `ItemDef.tags`（跟 `economy/itemSets.ts` 同一條路，不另開 id→tag 表）。⚠️ 兩件要標在卡上：① `itemId` 那個 ref 是 **soft**，打錯**不會在載入時被擋**，只是永遠不成立；② 商店現在只留能力屬性強化與傳說寶玉，所以這格的價值要等武器道具回來才兌現。出貨內容 0 次使用。 |

## §3-5 層 5：其他 —— 授權格與結構事實（不是標籤，是你會撞到的牆）

**21 列：已有 9 · 可組合 1 · 需新建 11**

> ⚠️ 這一層動得最少 —— 而那本身就是結論：這一批把**詞彙**翻了一倍，幾乎沒有碰**授權面**。三個結構性的洞裡最貴的兩個（增益卡授權面、線材位元）一格都沒動。

| # | 標籤 | engine token | 狀態 | 做什麼 | 怎麼寫 / 缺什麼 |
|---:|---|---|---|---|---|
| 1 | **【隱身（常駐）】** | `stealth` | 已有 | 敵人的自動索敵、手動點選、殭屍仇恨都抓不到你；出手或施法就現形 | 不是 kind、不是狀態軸 —— 是 `ModifierSource.vision.stealthFadeDelaySec`，授權格在 `zAbilityPassiveRank.vision` 與 `zItemDef.vision`。八個決策開關住在 `config.stealth@1`。 |
| 2 | **【真視】** | `trueSight` | 已有 | 一定半徑內看得見並打得到隱形的敵人 | `VisionGrant.trueSightRadius`（上界 40），掛在任何 ModifierSource 上，多來源取 max。 |
| 3 | **【飛行（無視碰撞）】** | `flight` | 已有 | 移動時穿過單位與障礙 | `FlightGrant{hoverHeight, ignoreUnits, ignoreObstacles, stayInsideBoundary}`，掛在 passive rank 與 item 上。⚠️ 與隱身同一個限制：**沒有限時版本**。 |
| 4 | **【格擋 / 免死】** | `block,cheatDeath` | 已有 | 打到了但被擋掉一部分或整發／會殺死我的那一發被擋掉，留一口氣 | ⛔ **舊頁的「只掛得到道具上」現在是假的。** `zAbilityPassiveRank.block` 出貨了，所以「卍解狀態下才格擋」（配 `whileForm`）寫得出來，走的是同一個 `ModifierSource.block`。⭐ 而【免死】現在有**第二種、完全不同的**實作：具名標記的 `lethal` 規則（層 1）。⛔ 仍然缺兩件：① **限時 buff 授予格擋** —— `applyBuff` 掛上去的來源沒有這一格，「接下來 5 秒內格擋」還是沒有形狀；② **增益卡仍然寫不出來**。⚠️ `internalCooldown` 的記帳住在 source 上，而技能被動的 source 在升級/EX解鎖/變身時會 detach+attach ＝ 冷卻歸零。 |
| 5 | **【暴擊】** | `crit` | 已有 | 有機率打出倍率傷害 | `Stat.CritChance` / `Stat.CritDamage` + 每個傷害效果自己的 `canCrit`；`critStrike` 整組仍是道具限定。⭐ 舊頁說「`DamagePacket.crit` 已經存在 —— 這是【暴擊時】那個 hook 過濾器幾乎免費的原因」—— **那筆帳兌現了**，`HookDef.damageCrit` 出貨。 |
| 6 | **【衍生屬性（把 A 的 X% 加到 B）】** | `percentOfStat` | 已有 | 「防禦力額外增加自身攻擊力的 50%」這一族，會隨場上變動即時跟著動 | `ModOp` 六個成員裡的 `percentOf`，配 `from`（另一條 Stat）或 `fromResource`（hp/mp 當下值）。`statPipeline` 跑兩趟、第二趟讀第一趟快照，所以不會連鎖也不會有順序相依。它同樣乘 `stacks`。 |
| 7 | **【解鎖上限】** | `capRaise` | 已有 | 把某條屬性的天花板抬高（不是加成） | `ModOp.CapRaise`，多來源取 **max** 不加總，抬不過 `statCaps.ts` 的硬上限。它自己**不給任何數值**。⭐ 小改變：技能被動也授予得了（有專門的守衛檔在跑）。 |
| 8 | **【限時隱身】** | `stealthTimed` | 可組合 | 隱身 N 秒然後自己現形 | ⛔ **一格都沒動**（我逐行讀了 `applyBuff.ts` 的兩個 `attachSource` 呼叫）：它們仍然只寫 `modifiers` / `hooks` / `expiresAtTick` / `stacks` / `visualStacks`，沒有 vision / flight / block。所以唯一的寫法仍是借道變身（`championForm{to:"alternate", durationSec}` + 一份 `whileForm:"alternate"` 且帶 vision 的 passive rank）。⚠️ 直的那條路仍然只差一個轉發：`syncVisionGrants` 早就讀任何帶 `expiresAtTick` 的 source。 |
| 9 | **【殭屍（mob）身上吃不到 applyStatus / applyBuff / grantAttribute】** | `mobsHaveNoStatusOrStatsComp` | 需新建 | 這不是一張卡，是一條會讓上表一整批「已有」變成謊話的結構事實 | ⭐ **一半修掉了，而且是一行**：`sim/mobs.ts:2618` 的 `world.status.set(id, { effects: [] })` 在 `spawnMobBody` 裡。因為讀取端本來就是實體無關的，不需要任何額外接線 —— 【暈眩】【定身】【減速】【詛咒】【暴走】【恐懼】【沉默】【混亂】【睡眠】對殭屍全部生效了。⛔ **另一半沒修，而且明說是取捨**：StatsComp 不是一行（`recomputeStats` 第一句就 `if (!sc \|\| (!champ && !sm)) return;` 而且 `Champions.get(sc.championId)`，殭屍兩者都沒有）。所以【破甲】【破魔】【破防】【易傷】【虛弱】【凋零】【石化的硬那一半】**今天對殭屍仍然靜默無效**。⚠️ 這條要寫進編輯器的提示裡，不能只寫在這裡。 |
| 10 | **【韌性】** | `tenacity` | 需新建 | 身上的控制時間按比例縮短 | ⛔ **全 repo grep `tenacity` 零命中**，一格都沒動。`applyStatus` 仍然是「秒數當場換絕對 tick，中間沒有任何人可以乘」。⚠️ 舊頁說「它和【淨化】是同一個真空的兩個答案」—— 淨化那一個做掉了，所以這一格的**急迫性下降**了：今天已經有事後解，缺的只剩事前減。全遊戲唯一的持續時間倍率仍然是 `tauntRules.durationMult`（只管嘲諷）。 |
| 11 | **【驅散免疫】** | `dispelImmune` | 需新建 | 這個狀態拔不掉 | ⚠️ **這一格最容易被誤判成『做好了』，所以要講精確。** 讀取端出貨了（`clearPools` 的 `requireDispellable`，淨化一定看它、回合重置不看），全域預設也出貨了（`config.dispel@1` 的三格：status true / dot true / **buffs false**）—— 所以「敵人剝不掉我買的裝備效果」今天成立。⛔ 但 `dispellable` **沒有任何 authoring surface**：`applyStatus` 的 zod 分支十五格裡沒有它、`status-effect@1` 的七格裡也沒有（兩份 schema 我都逐格看過）。所以「**這一支**技能上的暈眩拔不掉」today 寫不出來，只能整池開關。缺的就是一格欄位。 |
| 12 | **【減療 / 禁療】** | `healReduction,healBlock` | 已有 | 受到的所有治療打折（禁療＝打到 0） | ⭐ **做掉了，而且做法就是舊頁指的位置**：實作點在 `combat/restore.ts::healTarget` 的**目標側**，不是新增一條乘法路徑。owner 2026-08-03 的裁決是「用重創代替就好」，所以它跟【重創】是同一根軸的三格（`healingTakenMult` / `lifestealMult` / `regenMult`）。⭐ 禁療真的只是「三格都填 0 的那一份內容」—— `no-heal.json` 的描述逐字這樣寫。全域倍率 `world.combatEnv.healing` 仍在，兩者相乘。 |
| 13 | **【三選一增益卡的授權面比技能窄得多】** | `augmentSurfaceIsNarrowest` | 需新建 | 這不是一張卡，是一條會讓「已有」在增益卡上落空的事實 | ⛔ **一個字都沒改。** `zAugmentDef` 逐字仍是 `{id, name, description, tier, weight, modifiers?, hooks?, tags}` 加 `.strict()`。我重新對出貨的 31 張做了形狀普查：**16 張只有 modifiers、15 張只有 hooks、沒有第三種** —— 跟舊頁量到的一模一樣。所以【隱身】【飛行】【格擋】【免死】【暴擊特化】【真傷覆寫】【靈氣】儘管標著已有，一張增益卡都寫不出來。⚠️ 而 owner 要的就是增益卡，所以這一項被那個目標放大了。缺的是 schema 幾個欄位 + 一行轉發，**不是機制**。 |
| 14 | **【投射物只有貫穿，沒有彈跳／追蹤／回力】** | `projectileShapeGaps` | 需新建 | 三個玩家講得出名字的投射物行為 | ⛔ 沒動。`content/schema/projectile.ts` 逐字仍是 `{id, speed, maxRange, hitRadius, pierce?, vfxKey?, meshShape?}` —— chain / homing / boomerang 三個都不存在。⚠️ 它們是 **projectile doc 的欄位**不是新的 effect kind，補在那裡比補三個 kind 便宜得多，而且所有用 `spawnProjectile` 的技能（出貨 97 次）一起受惠。 |
| 15 | **【形狀烘進 kind 名字，沒有共用的 shape 欄位】** | `shapeIsBakedIntoKind` | 需新建 | 這一層最貴的結構債，而且會相乘 | ⭐ **止血了，但沒有回頭修**。這一批立了一條 E1 硬約束：**新 kind 一律帶 `shape`** —— 十個新 kind（dispel / shieldBreak / devour / modifyCooldown / weightedBranch / swapResource / eventValueConversion / randomArea / manaBarrier / extendBuff）**每一個**都有 `shape: z.enum(["single","circle"])`，而且 `line`/`cone` 刻意**沒有**列進 enum（收得下卻沒實作的值＝下一個 `onLevelUp`）。⛔ 舊 kind 一格沒動：`heal`/`applyStatus`/`knockback`/`shield` 仍然沒有 Area 或 Line 版本，`damage`/`damageArea`/`damageLine` 仍然把形狀烘在名字裡。所以「範圍治療」「範圍暈眩」今天仍然要靠 `tpl-proxy-fanout` 繞。 |
| 16 | **【模板有一半是 draft，名字在鑄技工坊看得見】** | `draftTemplatesArePromises` | 需新建 | 一份現成的「卡片承諾、遊戲沒付」清單 | ⚠️ 舊頁寫「33 個有 16 個是 draft」—— **那個數字本身是錯的**（它列出的 draft 名字有 17 個）。重數：現在 **34 個模板，17 enabled / 17 draft**，新增的是 `tpl-mark-stacks 具名標記-層數與免死`（enabled，配合層 1 的標記帳本）。draft 那 17 個：結界領域 · 瞬移突斬 · 引導通魔 · 無觸發 · 死亡機制 · 汲取吸附 · 全場規則 · 成長蓄能 · 生命操作 · 週期領域 · 拉扯投擲 · 純演出物件資料 · 距離博弈 · 資源運營 · 剝奪變化 · **召喚代理** · 隊伍協同。⚠️ 這些名字 owner 在鑄技工坊看得見；照名字寫規格會撞上「這個做不到」。 |
| 17 | **【ENTITY_FLAG 的位元已經用完】** | `wireBitsExhausted` | 需新建 | 決定「別人也看得到的狀態」今天有沒有頻道走 | ⛔ **完全沒動**：`protocol/schema.ts:942` 仍是 `export const ENTITY_FLAG_FREE_BITS = [] as const;`，上一行的註解仍寫著 THE BUDGET IS NOW EXHAUSTED。⚠️ CLAUDE.md 那句「目前剩 16384 / 32768 兩格」**仍然是假的**（第三守則）。⭐ 好消息不變：`statusIds` + `statusRemainTicks` 兩條平行陣列逐座位只送自己的，所以這一批新增的 9 份狀態文件會自動出現在自己的 HUD 上帶名字與倒數、零接線。⛔ 壞消息不變而且**變嚴重了**：這一批加了恐懼/混亂/沉默/睡眠/重創/破甲/破魔 —— 全部是「別人也該看得到」的狀態，而它們今天沒有頻道。 |
| 18 | **【火圈 / 復活圈 / 守衛塔 / 殭屍波是寫死的 system】** | `arenaSystemsAreNotEffects` | 需新建 | 任何「我也要一個會縮的圈」的增益卡今天寫不出來 | ⭐ **訂閱得到了，做不出來還是做不出來**。四者仍然是 `sim/systems/` 裡的 system 不是 `EffectDef` 的一員，所以「我也要一個會縮的圈」仍然寫不出來。改變的是**觀察權**：`onFireRingIgnite` / `onGuardianDown` / `onBossSpawn` 三個時刻現在掛得上卡片（殭屍波開始那一個仍然沒有）。⚠️ 附帶那個已知不一致**沒修**：火圈燒傷在 `FireRingSystem` 直接 `hp.hp -=`，繞過傷害佇列，所以 `invulnerable.blocksTrueDamage`、`manaBarrier`、`lethalSave`、`devour` 對它一律無效。 |
| 19 | **【切換技能的開關狀態不在任何 snapshot 欄位裡】** | `toggleStateIsServerOnly` | 需新建 | 這是【ENTITY_FLAG 用完】那條牆的第一個新受害者 | ⚠️ 這一列就是 §1-D 的結構原因。原文： ⛔ 舊頁不可能知道這一格。`ability@1.toggle` 出貨了，但**它的開關狀態沒有進任何 snapshot 欄位**，`toggleEnter` / `toggleExit` 目前是 SERVER_ONLY。後果就是失敗形態②的教科書版本：伺服器知道風王結界開著、每秒在扣魔，而客戶端**沒有任何欄位**能畫出「它現在是開的」—— 玩家只看得到魔力在掉。⚠️ 這正是上一格（線材位元用完）造成的第一筆新債，兩件事要一起排。 |
| 20 | **【狀態 tag 是跨技能互通的介面（不是註解）】** | `statusTagsAreTheInterface` | 已有 | 這是這一批最重要的一條「怎麼寫卡」的規則，而舊頁完全沒有它 | ⭐ 27 份狀態文件、**78 個相異 tag、195 個 tag 實例**（我逐檔數的）。tag 有兩個來源而且是 **OR**：文件宣告的（`status-effect@1.tags`）與這一筆實例**推導**的（`STATUS_FIELD_TAGS`）。⭐ 推導那一半是一道**編譯期閘**：`Record<keyof StatusEffect, …>` 表示往 StatusEffect 加一格旗標而不表態，`pnpm typecheck` 就回非零 —— 這是第二守則要的「改壞就會紅」，而且它擋的正是「加了機制但沒有人查得到」。⚠️ 寫卡的規則：**問類別不要列 id**（「暈眩」在內容裡是五份文件），而寫新狀態文件時 tags 要照既有的族名寫（cc / hard-cc / uncontrollable / antiheal / shred / miss …）。 |
| 21 | **【出貨內容對新詞彙的採用率幾乎是零】** | `newVocabularyIsUnadopted` | 需新建 | 這不是一張卡，是一條讀這張表的人一定要先知道的事實 | ⛔ 我對 `content/bundle.json` 的 **1,955 份文件**做了全樹解析，量到的是：**六個新 hook 全部 0 次**（onDeath / onRevive / onEvade / onBossSpawn / onFireRingIgnite / onGuardianDown，加上 onReflectSuccess 與一直沒人用的 onDamageDealt）；**status 與 equipment 兩個新條件葉 0 次**；**九個新 kind 裡八個 0 次**，只有 `dispel` 有 3 次（godie-i01s / i018 / i031）。⚠️ 意思是：這張表上那 21 個從「需新建」翻成「已有」的格子，**每一個的第一張卡都是新功能測**，不是照抄前例。⭐ 而這也是好消息的一半 —— 詞彙先於內容到位，正是第〇·五守則要的順序（先做機制，技能 JSON 由內容側產出）。 |

---

# §4 四個結構性的洞

這四項不是「某一個標籤缺了」，是**整片表面缺了** —— 它們會同時擋掉很多張卡，
而且其中兩個是你在編輯器 UI 上就該替使用者擋下來的。

⚠️ 以下四段**逐字轉錄**自 2026-08-08 的盤點紀錄（第一人稱的「我」＝當時做盤點的人；
「舊頁」＝ 2026-08-04 那一版的標籤表）。有兩段被後來的對抗複驗修正過，修正寫在該段開頭的引用框裡，**它凌駕內文**。

## §4-1 ① 這個引擎完全沒有「解除狀態」的能力

**上一版的狀態**：洞 → **今天**：補掉了 —— 而且補得比舊頁要求的多

> ⛔ **複驗補正（凌駕下文）**：下文說這個洞「補掉了」。對抗複驗把它修正成 **補掉一半** ——`pools.status` 與 `pools.dot` 是真的通的，**`pools.buffs` 與 `pools.shields` 是死開關**（見 §1-C，GH#295）。下文說「`dispellable` 是一個真的欄位」指的是**執行期型別**上的那一格；authoring 端（你在編輯器裡填的那一層）一格都沒有 —— 也就是下文自己第 ③ 點那句話的完整後果。

⭐ **這一段可以整段重寫，因為它已經不成立。** 舊頁寫「沒有淨化、沒有驅散、沒有 dispellable 欄位，`world.status` 只有兩個會縮小它的地方：到期過濾，以及復活時整包清空」——三句話今天都是假的。

今天有一支 `clearPools`，它是「把一個實體身上的暫時性東西清掉」這件事的**唯一**函式，四個站點共用它：`dispel`（淨化）、`shieldBreak`（破盾）、復活、回合重置。而 `dispellable` 是一個真的欄位，住在 StatusEffect / DotState / ModifierSource 三個型別上。

⭐ **順帶抓到一個舊頁沒抓到、而且更痛的東西**：收斂之前那三個手寫的清池站點（`revive.ts`、MatchController 的決鬥與大亂鬥 enterCombat）**三個都漏清同一池** —— `world.dot`。也就是說死前身上的燃燒會跟著復活的身體一起回來，而血條上看起來只是「復活之後莫名其妙一直在掉血」（GH#100 / #216 那一族）。三個站點各自手寫子集，分歧的那一天沒有人會發現 —— 這正是為什麼它必須是一支函式而不是三段各補一行。

⚠️ **仍然要標在卡片上的三件事**：① 淨化**一定**看 `dispellable`，回合重置**不看** —— 兩件不同的事共用一支函式，差別是一個參數；② `count` 砍不完時「留哪幾筆」是 `(expiresAtTick, 次要鍵)` 的**全序**，不是插入序（只比 expiresAtTick 不夠，同 tick 到期會退回 Map 迭代順序，那正是 #198 那族 desync 的形狀）；③ `dispellable` **沒有 authoring surface** —— 你可以整池開關（`config.dispel@1` 三格），但寫不出「**這一支**技能的暈眩拔不掉」。那是這個洞今天唯一剩下的邊。

⭐ 而舊頁列在【睡眠】上的「它是【淨化】的下游，不能先做」也作廢了：睡眠**同一批**出貨，而且走的是自己的 `sim/statusBreak.ts`（只拔標了 `breakOnDamage` 的那幾筆），不是 dispel。

## §4-2 ② 殭屍身上吃不到【狀態】與【增益】

**上一版的狀態**：洞 → **今天**：補掉一半 —— 狀態通了，屬性沒通，而且那是明示的取捨

⭐ **狀態那一半修掉了，而且真的只有一行**：`sim/mobs.ts:2618` 的 `world.status.set(id, { effects: [] })`，放在只有殭屍會走的 `spawnMobBody` 裡（不是共用的 `spawnUnitBody`，因為召喚物在自己那邊已經建過一份，避免同一顆身體寫兩次）。之所以一行就夠，是因為讀取端本來就是實體無關的：`movementHold` 直接讀 `world.status`、`missChanceOf` 讀攻擊者的狀態、`berserk.ts` 讀旗標、`StatusSystem` 對空陣列是零成本。

所以**今天對整波殭屍生效的控場**是：暈眩 · 定身 · 減速/加速 · 詛咒(失手) · 暴走 · 恐懼 · 沉默 · 混亂 · 睡眠 · 重創三格倍率 —— 加上一直就有效的嘲諷(`world.taunt`) · 擊退/擊倒(`world.knockdown`) · 免疫(`world.invulnerable`) · 持續傷害(`world.dot`)。舊頁那句「有效的只有嘲諷/擊退/免疫/持續傷害四個」已經作廢，而且**舊頁把嘲諷稱為『唯一一個對殭屍真的有用的控場』那句話現在是這張表上最容易誤導人的一句**。

⛔ **屬性那一半沒修，而且不是遺漏是取捨**：`recomputeStats` 第一句是 `if (!sc || (!champ && !sm)) return;`，而且它 `Champions.get(sc.championId)` —— 殭屍兩者都沒有。所以 `applyBuff` 與 `grantAttribute` 對殭屍**仍然靜默跳過**，也就是【破甲】【破魔】【破防】【易傷】【虛弱】【凋零】【石化的硬那一半】對整波殭屍一律零效果、零錯誤訊息。

⚠️ **這個半修狀態比全壞更危險**，因為它讓「殭屍吃不吃得到」從一句可以背的規則變成一張要查的表。判準給寫卡的人：**它走的是 `world.status` 還是 `world.stats`？** 前者今天通，後者今天不通。這條必須寫進編輯器的欄位提示裡，寫在這張表上不夠。

## §4-3 ③ 三選一增益卡能寫的東西比技能窄得多

**上一版的狀態**：洞 → **今天**：一個字都沒改 —— 而這一批把它變成最貴的一個洞

⛔ **我逐行重讀了 `content/schema/augment.ts`，它跟舊頁量到的逐字相同**：`{id, name, description, tier, weight, modifiers?, hooks?, tags}` 加 `.strict()`。出貨 31 張的形狀普查也逐字相同：**16 張只有 modifiers、15 張只有 hooks、沒有第三種**。

⚠️ **而這一批讓它變貴了**，理由有三層：

① **hooks 那條路變寬了，modifiers 那條路沒變。** 增益卡拿得到的兩格裡，`hooks` 現在能掛 15 種事件、7 種過濾器、5 種條件葉 —— 所以「被暴擊時回血」「反彈成功時加攻」「殭屍王出現時全隊加速」這類卡今天**真的寫得出來**。這會讓人以為增益卡的天花板整體變高了，而實際上另外半邊一格沒動。

② **這一批新增的十個 effect kind，增益卡一個都用不到。** `zAugmentDef` 沒有 `effects` 欄位，所以 dispel / shieldBreak / devour / manaBarrier / randomArea / swapResource … 全部只能透過 hook 的 `effects[]` 間接出現 —— 也就是說「主動型」的增益卡（選了就立刻發生一件事）仍然不存在，增益卡只能是**被動**或**觸發**。

③ **舊頁點名的那七項一項都沒解鎖**：【隱身】【飛行】【格擋】【免死】【暴擊特化】【真傷覆寫】【靈氣】的授權格仍然只在 passive rank 與 item 上。⭐ 唯一的變化是 `block` 多了 passive rank 這條路 —— 也就是說**這一批證明了『多開一個授權格』是可行且便宜的**（sim 端 `syncVisionGrants` / `syncFlightGrants` 早就讀任何 source），卻沒有順手開給增益卡。

⛔ **判準**：owner 要的是三選一卡牌（GH#149「Expand + power-up the augment pool so the 3-choose-1 draft can swing games」）。這一批把**詞彙**翻了一倍，而增益卡是那批詞彙**唯一接不到**的表面。它缺的是 schema 幾個欄位 + 一行轉發，**不是機制** —— 這是全表 CP 值最高的一項，而且它已經連續兩版沒動。

## §4-4 ④【新增】做出來的詞彙，出貨內容一份都還沒用（採用率 ≈ 0）

**上一版的狀態**：（上一版沒有這一項） → **今天**：新的結構事實 —— 讀這張表之前一定要先知道

> ⚠️ **引用時的注意**：下文出現「九個新 kind 裡八個是 0」這種句子，而同一批資料的別處寫「十個裡九個」。分歧在「哪些算新」，不在數字 —— 見 §5-2。要引用請用 §2-1 的逐格表。

⚠️ **這一格是我這次盤點新開的，因為它會改變你怎麼讀上面那 21 個從『需新建』翻成『已有』的綠燈。**

我對 `content/bundle.json` 的 **1,955 份文件**（13 個 collection）做了全樹解析。量到的是：

· **六個新 hook 全部 0 次**：onDeath · onRevive · onEvade · onBossSpawn · onFireRingIgnite · onGuardianDown。加上 onReflectSuccess 0 次，以及一直就沒人訂閱的 onDamageDealt 0 次。實際在跑的仍然只有七個：onBasicAttack 68 · onDamageTaken 19 · onKill 13 · onInterval 9 · onAbilityHit 6 · onAbilityCast 5 · onStunned 2。

· **兩個新條件葉全部 0 次**：status · equipment。條件葉只有 stat 10 · kind 5 · chance 1 在跑。

· **十個新 kind 裡九個 0 次**，只有 `dispel` 有 3 次（godie-i01s / i018 / i031 三件道具）。shieldBreak / devour / modifyCooldown / weightedBranch / swapResource / eventValueConversion / manaBarrier / extendBuff / randomArea 全部 0。

· 順帶：`summon` 與 `evasion` **kind** 也仍然是 0（舊頁量到的就是 0，一年沒變）。

⭐ **這不是缺陷，是順序。** 第〇·五守則要的正是這個方向：引擎做機制、JSON 做技能，先盤點再按「擋住幾支」排序做機制。這一批就是那個做法的產物（`condition.status` 一個機制解鎖 12 支、`ability-augment` 6 支、`state.exclusive-group` 3 支）。

⛔ **但它對寫卡的人有一個具體後果**：上面每一個綠燈的**第一張卡都是新功能測**，不是照抄前例。舊頁對 `evasion` 與 `summon` 講過同一句話（「引擎做好了但一次都沒上過場，第一張卡要當新功能驗」），而那句話現在適用於**十七個**格子。

⚠️ 而且有兩個格子的風險特別高，因為它們**規格還沒 freeze**：`weightedBranch`（§16.14 的機率表語意，1/6 是「每次獨立」還是「六發彈倉」）與 `eventValueConversion`（§16.12 的基數 raw|mitigated|hpLost）。引擎做得到，但在 owner 裁決之前寫下去的卡，語意會在裁決那天靜靜地改變。

---

# §5 ⚠️ 待確認（來源資料互相矛盾的地方）

下面每一項都是**兩份量測資料對同一件事給了不同答案**。契約的規矩是不挑一個當真相 ——
這裡照實列出，並說明對你有沒有影響。

## §5-1 條件葉的採用次數對不上（差 3 倍）

| 來源 | `kind` | `stat` | `chance` | `status` | `equipment` | 其他 |
|---|---:|---:|---:|---:|---:|---|
| 普查 A：全樹解析 `content/bundle.json`（1,955 份文件） | 5 | 10 | 1 | 0 | 0 | — |
| 普查 B：掃 `content/**/*.json` 原始檔 | **16** | 10 | — | 0 | 0 | `any` 2 · `all` 2 · `not` 1 |

兩次掃描的基礎不同（打包產物 vs 原始檔；後者另外把 `any`/`all`/`not` 這種複合節點也計進來），
但 `kind` 從 5 變 16 光靠基礎不同解釋不了。**待確認。**

⚠️ **對你的影響：沒有。** 兩份資料在**唯一重要的那一格**上完全一致 ——
`status` 與 `equipment` 兩個新條件葉都是 **0**，也就是 §2-1 的結論不受這個矛盾影響。

## §5-2 「新增的 effect kind」有幾個，沒有統一定義

同一份資料的三個地方分別寫「九個新 kind 裡八個是 0」「十個新 kind 裡九個是 0」「10 個新 kind 有 9 個 0」，
而它自己列出的表有 12 個鍵。另一份資料的表裡多了 `grantAttribute`（8 次，非零），前一份沒有列。
→ **分歧在「哪些算新」，不在數字本身。** 三個版本的結論方向完全一致：**只有 `dispel` 非零**。

⚠️ **對你的影響：不要引用「N 個新 kind 裡 M 個是 0」這種句子。** 要引用就引用逐格的那張表（§2-1）。
`grantAttribute` 是否算「新」待確認，但它**非零**，跟 `dispel` 一樣是有內容在跑的。

## §5-3 重裁資料標的契約指紋是舊的（17f97fa4），本文件對應的是 e6843214

五層標籤表是對著指紋 `17f97fa4` 那一版契約做的。當時它抓到契約自己有**兩句假的 caveat**：
`scheduler.random-area@1` 與 `defense.mana-barrier@1` 都寫著「接線還沒接」，而兩條接線其實都在。

✅ **這一項已經解決**：現行指紋 `e6843214` 的這兩筆已經改寫成「接線**已經接上**」，
而且其中一筆還把那次翻車留在 caveat 裡當案例。**以本文件檔頭的指紋為準。**
⚠️ 兩份資料的引擎狀態是**同一個**（同一天、同一個 HEAD `d199d3eb`）—— 差別只在契約檔本身在那天稍晚被重新推導過一次。

⚠️ 順帶一提，這個失效方式對你也適用：那兩句假話能活著，是因為守衛只檢查 caveat **非空字串**，從不讀內容。
**散文擋不住散文過期** —— 這也是為什麼本文件把「已知壞掉」做成一節而不是一句註解。

## §5-4 內部 issue 編號與 GitHub issue 編號不是同一套

本文件 §3 與 §4 的引文裡出現 `GH#100` / `GH#149` / `GH#198` / `GH#216` / `GH#263` 這些編號 ——
它們來自**內部任務清單**，與同號的 GitHub issue 主題不同（已抽查比對）。
⛔ **不要照那些號碼去查 GitHub。**

✅ 相對地，§1 與 §2 引用的 **GH#285 / GH#287 / GH#293 / GH#294 / GH#295 已逐一對 GitHub 查證**，
五筆全部存在、全部開啟中，標題與本文件的描述一致。

## §5-5 專案內部文件說實體旗標還剩兩格，實際上是零

專案的開發守則寫著「`ENTITY_FLAG` 目前剩 16384 / 32768 兩格」，而程式裡的空位清單是**空陣列**，
同一個檔案的註解自己寫著「這是最後一格」。→ 內部文件過期（GH#285）。
**本文件採用程式那一邊：一格都不剩。** 這正是 §1-D（切換狀態複製不出去）的結構原因。

---

# §6 附錄（逐字轉錄自契約 JSON）

以下全部來自 `docs/editor-contract/ggd-runtime-capabilities.json`，指紋 `e6843214`。
⛔ 出現在這些清單裡**不等於**可以安全使用 —— §1 的三筆就在這些清單裡。

## 附錄 A · 34 個 effect kinds（效果種類）

一段效果的 `kind` 只能是這 34 個字串之一。

| # | kind | # | kind |
|---:|---|---:|---|
| 1 | `applyBuff` | 18 | `invulnerable` |
| 2 | `applyStatus` | 19 | `knockback` |
| 3 | `championForm` | 20 | `leap` |
| 4 | `cycleBuff` | 21 | `manaBarrier` |
| 5 | `damage` | 22 | `modifyCooldown` |
| 6 | `damageArea` | 23 | `randomArea` |
| 7 | `damageLine` | 24 | `restore` |
| 8 | `dash` | 25 | `revive` |
| 9 | `devour` | 26 | `shield` |
| 10 | `dispel` | 27 | `shieldBreak` |
| 11 | `dot` | 28 | `spawnProjectile` |
| 12 | `evasion` | 29 | `spawnVfx` |
| 13 | `eventValueConversion` | 30 | `spendMana` |
| 14 | `extendBuff` | 31 | `summon` |
| 15 | `grantAttribute` | 32 | `swapResource` |
| 16 | `grantGold` | 33 | `taunt` |
| 17 | `heal` | 34 | `weightedBranch` |

## 附錄 B · 15 個 hook events（觸發時機）

⛔ 這 15 個裡有 **2 個是已知壞掉的**（`onDeath` / `onRevive`，見 §1-A / §1-B），
**8 個在出貨內容裡零採用**（下表逐格列出，計算基礎同 §2-1 的普查 A）。清單成員資格 ≠ 可用性。

| # | hook event | 出貨內容用了幾次 | 備註 |
|---:|---|---:|---|
| 1 | `onAbilityCast` | 5 |  |
| 2 | `onAbilityHit` | 6 |  |
| 3 | `onBasicAttack` | 68 |  |
| 4 | `onBossSpawn` | 0 | 世界作用域 —— 沒有 target，且不發給死人 |
| 5 | `onDamageDealt` | 0 | ⚠️ 有這個成員，但出貨內容從來沒人訂閱過 |
| 6 | `onDamageTaken` | 19 |  |
| 7 | `onDeath` | 0 | ⛔ 已知壞掉 GH#293 |
| 8 | `onEvade` | 0 | ⚠️ 只發給防守方；還沒區分「真閃避」與「攻擊者揮空」 |
| 9 | `onFireRingIgnite` | 0 | 世界作用域 —— 同上 |
| 10 | `onGuardianDown` | 0 | 世界作用域 —— 唯一接得到「塔倒了」的路（打塔不發 onKill） |
| 11 | `onInterval` | 9 |  |
| 12 | `onKill` | 13 |  |
| 13 | `onReflectSuccess` | 0 | ⚠️ 原傷害不在 payload 裡；要原傷害的百分比請掛 onDamageTaken |
| 14 | `onRevive` | 0 | ⛔ 已知壞掉 GH#294（只有道具復活那條窄路會發） |
| 15 | `onStunned` | 2 |  |

## 附錄 C · 5 個條件葉

⛔ 五個全部只能掛在 hook 上（§2-2）。

| # | leaf | 出貨採用 | 說明 |
|---:|---|---|---|
| 1 | `chance` | 1 | 機率骰（也可以用 `chanceFrom` 讓機率跟著某個屬性走） |
| 2 | `equipment` | 0 | 背包裡有某一件（`itemId`）或某一類（`tag`）裝備。⚠️ 兩格同時寫是 PARSE ERROR；`itemId` 是 soft ref，打錯不會在載入時被擋，只是永遠不成立 |
| 3 | `kind` | 5 或 16（見 §5-1，兩份量測不一致） | 對象是小兵還是英雄這一類的分類判斷 |
| 4 | `stat` | 10 | 讀一個數值（血量百分比之類）與門檻比較 |
| 5 | `status` | 0 | 自己或對方身上有某一份（`statusId`）或某一類（`tag`）狀態。⚠️ 兩格同時寫是 PARSE ERROR。`tag` 兩路都查得到：文件宣告的 tag，以及這一筆實例真的帶的機制旗標（所以作者漏標也查得到） |

⚠️ 複合節點 `any` / `all` / `not` 在出貨內容裡有人用（原始檔掃描：2 / 2 / 1），
但它們不是「葉子」，所以不在契約的 `conditionLeafKinds` 清單裡。

## 附錄 D · 13 個 hook 欄位

一條 hook 定義上可以出現的欄位全集。

| # | 欄位 | 說明 |
|---:|---|---|
| 1 | `abilitySlot` | 只有這一支技能觸發時才算數（把「主動技某段效果有條件」迂迴成 hook 的關鍵欄位，見 §2-2） |
| 2 | `chance` | 機率 |
| 3 | `chanceFrom` | 讓機率跟著某個屬性走（出貨採用 1 次） |
| 4 | `condition` | 條件樹 —— **條件唯一能住的地方**（§2-2） |
| 5 | `damageCrit` | 只在暴擊／非暴擊時算數。⚠️ 出貨採用 0；schema 有一段 refine 專門擋「掛在不帶傷害封包的事件上」 |
| 6 | `damageSource` | 傷害來源過濾（出貨採用 5 次） |
| 7 | `damageType` | 只在物理／魔法／真傷時算數。⚠️ 出貨採用 0 |
| 8 | `effects` | 觸發時要跑的效果陣列 |
| 9 | `internalCooldown` | 內部冷卻。⚠️ 過濾器與條件排在它**之前** —— 條件不成立的那一發不燒冷卻、不動亂數種子 |
| 10 | `internalCooldownScope` | 內部冷卻的作用範圍 |
| 11 | `on` | 事件名（附錄 B 的 15 個之一） |
| 12 | `target` | 效果打在誰身上 |
| 13 | `victim` | 受害者過濾（出貨採用 10 次） |

## 附錄 E · 17 個模板家族

出貨的技能模板家族（`ability-templates`）。⚠️ 其中有一部分仍是 draft —— 名字在編輯器裡看得見，
但那是一個承諾不是一個機制（見 §3-5 層 5 的「模板有一半是 draft」那一列）。

`buff-self` · `charge-push` · `ground-nova` · `instant-blast` · `leap-strike` · `line-sweep` · `lock-combo` · `mark-stacks` · `on-attack` · `on-hit-react` · `orbit-array` · `proxy-cast` · `proxy-fanout` · `random-barrage` · `single-strike` · `teleport` · `traveling-wave`

## 附錄 F · 計畫點名的 26 項能力：逐項狀態與 caveat

計算基礎：契約 JSON 的 `planned[]` 逐筆 `state`。**supported 6 · partial 13 · unsupported 7 ＝ 26 筆。**

⭐ **`partial` 是這份契約裡最需要細讀的一格** —— 那正是「有一半在、另一半沒有」的地方，
也就是假的 ✅ 最容易長出來的地方。caveat 逐字轉錄，沒有刪節。

### `hook.on-lethal-damage@1` —— **partial**

- **計畫出處**：§12 G4 · §13「lethal hook 在 death commit 前」
- **caveat**：攔截點在 `combat/damage.ts` 的護盾之後、扣血之前，符合計畫的「death commit 前」。⛔ 但**火圈燒傷攔不到** —— `FireRingSystem` 直寫 `hp.hp -=` 不走傷害佇列（無敵也一樣擋不住）。
- **證據**：packages/shared/src/sim/combat/lethalSave.ts + lethalSave.test.ts（兩個突變都驗過）

### `effect.charge-ledger@1` —— **supported**

- **計畫出處**：§12 G4 · §13「十二道試煉的 ledger 跨 round 不跨 match」
- **證據**：packages/shared/src/sim/marks.ts（具名標記：count/spent/expiresAtTick/resetOn）。`resetOn:"match"` 就是計畫要的「跨 round 不跨 match」——`SimWorld` 一場比賽一個。

### `hook.on-evade@1` —— **partial**

- **計畫出處**：§7 P1 · §12 G4
- **caveat**：事件會發到**閃掉的那一方**（`WorldHookSystem` 的 actorKey=target），符合計畫的 defender hook。⛔ 尚未區分「真閃避」與「attacker fumble」，計畫 §13 要求 fumble 零次 —— 這一格還沒守。
- **證據**：packages/shared/src/sim/systems/WorldHookSystem.ts + worldHook.test.ts

### `hook.on-ability-hit@1` —— **supported**

- **計畫出處**：§2.1.1（配合 condition.target-status@1）
- **證據**：content/schema/effect.ts 的 zHookEvent

### `effect.modify-cooldown@1` —— **supported**

- **計畫出處**：§12 G4
- **證據**：packages/shared/src/sim/effects/modifyCooldown.ts（`slot` 或 `abilityId` 指名一支；`reduce`/`reduceFlat`/`reset` 三種模式，`basis` 決定百分比的分母是剩餘量還是基礎冷卻）。守衛 packages/shared/src/sim/effects/lane1Kinds.test.ts。

### `effect.execute@1` —— **partial**

- **計畫出處**：§12 G4 · §16.13 · §5「待確認 14」
- **caveat**：計畫 §160 的最低契約有五項，`devour` 拿到三項：① **typed threshold** ✅ `thresholdPctOfMax` 是逐階陣列（3/5/7/9% 就是四格）；② **hero-only** ✅ `victim: "champion" | "any"` 是欄位；③ **kill credit** ✅ 它不寫 `hp = 0`，而是推一發 `type:"true"` 進 `world.damageQueue`，所以擊殺賞金 / `onKill` / 掉金幣 / 擊殺語音 / MVP 統計全部走出貨的那一條路。⛔ 缺的兩項，寫技能的人一定會撞到：④ **回復 basis 不是欄位** —— 固定讀施法瞬間的 `hp.hp`（cast-commit 快照），而計畫 §16.13 要問的「讀 cast commit 前還是實際 hpLost」今天只有一個答案且寫死；`healPct` 只是**倍率**，不是 basis。⑤ **invulnerable interaction 沒有欄位** —— 因為走傷害佇列，`refusesDamage` 會讓無敵目標**靜默吞不掉**（既沒有 `pierceInvulnerable`，也沒有「被擋下了」的回饋）。⚠️ 另外它是**吞噬風味**的處決不是中性 primitive：`healPct` 省略 = 1，要純處決得明寫 `healPct: 0`。
- **證據**：packages/shared/src/sim/effects/devour.ts + devour.test.ts（護盾那條驗過 `throughShields`：致死量含當下吃得到的護盾，否則「即死」會被護盾靜默擋掉）

### `effect.weighted-branch@1` —— **partial**

- **計畫出處**：§12 G4 · §16.14（俄羅斯輪盤）
- **caveat**：機制已出貨：一次施放**只 draw 一次** `world.rng`（計畫 §13 的決定性要求），分支各帶自己的 `weight` 與 `effects[]`，總權重 0 在載入時就被擋下。⛔ 但 §16.14 的**機率表語意尚未 owner freeze**（1/6 是「每次獨立」還是「六發彈倉」），所以 importer 在 freeze 之前仍應拒絕 89-002 那一類文件 —— 引擎做得到，規格還沒定。
- **證據**：packages/shared/src/sim/effects/weightedBranch.ts + lane1Kinds.test.ts（「只抽一次」做過突變驗證）

### `effect.swap-resource@1` —— **supported**

- **計畫出處**：§12 G4 · §16.16（交換筆記本）
- **證據**：packages/shared/src/sim/effects/swapResource.ts —— 依 §16.16 的建議實作：resolve tick 原子交換，各自 clamp 到 [clampMin, 自己的上限]，目標失效預設整招失敗。三個決策點（`resource` / `clampMin` / `onInvalidTarget`）都是欄位，所以 owner 之後改語意不必改程式。

### `defense.mana-barrier@1` —— **partial**

- **計畫出處**：§12 G4
- **caveat**：primitive 已出貨（`manaBarrier`）：`manaBarrierCutFor` 在**扣血之前**把傷害換成扣魔 —— ⛔ 不是受傷後補護盾，魔力真的被扣、期間回的魔力真的會變成新的抵擋量。計畫點名的兩格都在：`perMana` 就是 damage-to-MP ratio，remainder 由函式回傳（抵不完的部分原封不動往下走進 免死 → 血條）。三個決策點都是欄位（`perMana` / `damageTypes` **必填明列** / `minManaReserve`）。接線**已經接上**（`combat/damage.ts`，護盾池之後、免死之前）—— 44-00 掛上去就會擋。⚠️ 這一句在 2026-08-08 當天有過一個中間版本寫著「接線還沒接」，那是寫在接線落地**之前**的；留這句話在這裡是因為它示範了這份清單最危險的失效方式：守衛只檢查 caveat 是不是空字串，**從不讀它的內容**，所以一句過期的散文可以把一個已經可用的機制擋在門外，而且什麼都不會紅（見檔頭③與 GH#291 的同型）。
- **證據**：packages/shared/src/sim/effects/manaBarrier.ts + lane2Kinds.test.ts

### `effect.control-restriction@1` —— **unsupported**

- **計畫出處**：§12 G4

### `scheduler.random-area@1` —— **partial**

- **計畫出處**：§12 G4
- **caveat**：排程器已出貨（`randomArea`），而且 §13 要的 draw 預算模型是**明確**的：一次施放固定花 `2 × count` 次 `world.rng.next()`，**全部在施法那一刻抽完** —— 所以「這一波抽了幾次」不受場上人數、也不受它有沒有被打斷影響。到期是**絕對 tick**；方形→圓形用 elliptical grid mapping（`sim/**` 禁三角函式）。接線**已經接上**：`randomAreaSystem` 掛在 `SimWorld.step()` 的 slot 7e（`combatResolveSystem` 之前），13-04 / 70-04 排得出來也落得下去。（同 `effect.mana-barrier@1`：這一句 2026-08-08 當天曾寫著「接線還沒接」而接線就在那裡。）⚠️ `content/templates/expand.ts` 的 `random-barrage` 那 8 張卡**仍然走 `dot`**，遷移到這個 kind 是獨立的一批。
- **證據**：packages/shared/src/sim/effects/randomArea.ts + lane2Kinds.test.ts（draw 預算做過突變驗證）

### `effect.extend-buff-on-damage@1` —— **supported**

- **計畫出處**：§12 G4（2026-08-08 覆蓋矩陣 X20：52-01 狂戰士之怒）
- **證據**：packages/shared/src/sim/effects/extendBuff.ts —— 「期間每承受自身最大生命 5% 的傷害，延長 2 秒」。⭐ **無狀態**：延長量是這一發傷害的連續比例（總量與階梯式相同），所以不需要累積器、不需要任何新的 SimWorld 欄位，也**不需要任何接線**。`maxRemainingSec` 是**必填**：這條是正回饋（挨越多、越久），沒有上界會變成永久，而症狀是「這個回合打不完」——一個不會讓任何測試變紅的故障。⚠️ 現有詞彙**組不出來**（逐條查過）：`applyBuff.stackKey` 寫的是「重設到滿」不是「延長」，而 `condition@1` 的葉子與 `HookDef` 的過濾器沒有任何一格讀得到「剛剛那一下打了多少」。

### `effect.event-value-conversion@1` —— **partial**

- **計畫出處**：§12 G4 · §16.12（太陰道）
- **caveat**：機制已出貨：來源可選 `incomingDamage`（讀 `EffectContext.incoming`）或 `targetCurrentHealth`（59-01 吞噬的「等同其剩餘生命」），轉成 mana / health，並可順帶給一段限時屬性加成（15-002 太陰道的「短暫加成至 AP」）。⛔ 但 §16.12 的**基數 `raw | mitigated | hpLost` 尚未 owner freeze** —— 所以它是一格欄位，出貨預設 `mitigated`（與 `damage.incomingPct.basis` 同一句話）。freeze 之後只要改預設值，不必改程式。
- **證據**：packages/shared/src/sim/effects/eventValueConversion.ts + lane1Kinds.test.ts

### `hook.consume-policy@1` —— **unsupported**

- **計畫出處**：§2.1.1.2（雷天大壯「施放技能後的下一次普攻」）· §12 G4

### `hook.on-reflect-success@1` —— **partial**

- **計畫出處**：§2.1.1 · §12 G4 · §13
- **caveat**：事件與 provenance 都出貨了：判準是「一發 `reflectDepth > 0` 的封包**真的落地**」，hook 的持有者＝**防禦者**、`target`＝**攻擊者**，而 `EffectContext.incoming` 是**那一發反彈封包自己的** `TriggerDamage`（raw / mitigated / hpLost 三個讀數都是真值），所以 20-002「每次造成 7 倍[反彈]傷害」寫得出來 —— 用 `damage.incomingPct`。⚠️ 兩個限制，寫技能的人一定會撞到：① 那一發的 `reflectDepth` 已經是 1，child chain 的 `incomingPct` 要一起寫 `maxChainDepth: 1`，否則被鏈深閘擋掉（那是終止性，不是 bug）；② `incomingPct.perRank` 的上界是 `INCOMING_PCT_MAX = 5`，所以「7 倍」要靠`amount` 那一項補，不能寫成單一個 7。⛔ 計畫 §2.1.1 四項 provenance 裡的**原傷害**沒有進 payload：`TriggerDamage` 是封閉型別，而同一個 tick、同一個持有者的 `onDamageTaken` 已經帶著它 —— 再塞一份進來就是第二個真相。要「原傷害的百分比」請掛在 `onDamageTaken` 上。
- **證據**：packages/shared/src/sim/combat/damage.ts（push 點）+ packages/shared/src/sim/systems/ReflectHookSystem.ts（dispatch）；守衛 reflectHook.test.ts（不該發的時候不發）+ reflectSuccessProvenance.test.ts（provenance 到得了 child chain，且交給它的是反彈傷害不是原傷害；三個突變都驗過）

### `effect.target-set-chain@1` —— **unsupported**

- **計畫出處**：§6 P1 · §12 G4

### `effect.attack-dash@1` —— **unsupported**

- **計畫出處**：§2.1.1

### `effect.dash-on-end@1` —— **unsupported**

- **計畫出處**：§2.1.1 P1（條件式）· §16.7

### `state.exclusive-group@1` —— **partial**

- **計畫出處**：§12 G4 · §16.15（涅吉三形態）
- **caveat**：✅ 15-02/03/04 逐字寫的「([變身]為唯一狀態不可疊加)」**對變身成立，而且是結構性的**：一個實體只有一格形態、一個身體只有一個 `championId`，所以第二個形態不可能與第一個並存 —— ⛔ 技能文件**不需要、也不應該**自己檢查「我是不是已經變身了」。重複進入時「舊形態的剩餘時間怎麼辦」是欄位（`champion@1.transform.reenter`：`restart` / `keepLongest` / `reject`），預設 = 出貨現況，被回絕會走 `castRejected`。⛔ 仍缺兩件，**涅吉三形態今天仍然表達不出來**：① **它只是【變身】的互斥，不是泛化的互斥狀態群** —— 沒有「這三個 buff 互斥」的模型，而 15-02/03/04 讀起來更像三個**屬性狀態**（移速倍率／攻速％／普攻附加傷害）而不是三個 3D body；② **一個英雄只有一個 `transform.counterpartId`**，而 `championForm` effect 的 `to` 只有`alternate`/`base`/`toggle`，沒有「變成指定的那一個形態」—— 所以第二個**不同**的形態根本不是目的地：再施放一次只會刷新當前形態（WC3 Metamorphosis 的語意，刻意保留）。⚠️ 這兩件都卡在計畫 §16.15 還沒裁決「三個 gameplay state 還是三個 3D body」——⛔ 在那之前不要把三形態降級成三個獨立變身，那會是一個**看起來**能用的錯誤答案。
- **證據**：packages/shared/src/sim/systems/ChampionFormSystem.ts + sim/championFormExclusive.test.ts（四個突變都驗過會紅：拿掉 `sc.championId` 的寫入、`championForm.set` 改成不覆寫、拿掉 `keepLongest`、拿掉整個 `reject` 分支）

### `state.lifecycle@1` —— **partial**

- **計畫出處**：§12 G4（與 `state.exclusive-group@1` 同一列）· §13「風王結界手動關閉與 MP 不足自動關閉都走同一個 onExit child」
- **caveat**：✅ 計畫 §13 逐字要求的那一條**已經成立**：`exitToggle()` 是全專案唯一的關閉出口，手動關閉（`castAbility` 第二次按下，刻意排在冷卻閘之前）與 MP 不足自動關閉（`toggleUpkeepSystem`）都只是呼叫它，所以「關閉時釋放風王鐵槌」不可能只發生一半。開關成本（`ability@1.manaCost`）與維持成本（`toggle.upkeepCost`）是兩個獨立數列，節奏 `none`/`perAttack`/`perSecond` 是欄位。⛔ 仍缺三件：① **stable state key 與 exclusive group** —— 一顆按鈕一個切換，沒有「這三個狀態互斥」的模型（那一半是 `state.exclusive-group@1`）；② **duration / refresh policy** —— 切換沒有自帶時限，要限時請用 `applyBuff`；③ **死亡不觸發 onExit** —— 屍體不付維持成本但旗標留著，「大招要不要從屍體放出來」是一個還沒裁決的決策點，⛔ 不可以在遊戲端偷開第二條出口去補它。
- **證據**：packages/shared/src/sim/abilities/toggle.ts + toggle.test.ts（三個突變都驗過會紅：拿掉自動關閉、拿掉 perAttack 節奏閘、拿掉 onExit 的 runEffects）

### `condition.has-equipment@1` —— **supported**

- **計畫出處**：§2.1.1.2（77-002 御雷劍）· §12 G4
- **證據**：packages/shared/src/content/schema/condition.ts 的 `zEquipmentItemLeaf` / `zEquipmentTagLeaf`（⭐ 一個 UNION 而不是一個帶兩個 optional 欄位的物件，所以 `{itemId, tag}` 同時寫是 **PARSE ERROR**，不會安靜地由求值端替作者決定哪一格贏）+ packages/shared/src/sim/content/condition.ts 的求值與中文標籤。✅ 計畫要的「只接穩定 itemId、禁止用顯示名稱連結」成立：`itemId` 走 `zRef<ItemId>("items")`。⚠️ 對方要知道的一件事：那個 ref 是 **soft**（御雷劍那一族的道具文件還沒進 `content/items/`），所以打錯的 itemId **不會在載入時被擋**，它只是永遠不成立。

### `condition.stack-count@1` —— **unsupported**

- **計畫出處**：§2.1.1.2（層數門檻）· §12 G4

### `condition.ability-state@1` —— **unsupported**

- **計畫出處**：§2.1.1.2（哥哥、絕。暗殺奧義、虛化）· §12 G4

### `ability-augment@1` —— **partial**

- **計畫出處**：§2.1.1 P1 · §12 G4 · §13
- **caveat**：✅ 計畫 §4.4 的兩條禁令都守住了：目標是 **exact ability ref**（`zRef("abilities")`，不是槽位、不是名稱文字），操作是一個 **allowlist enum** —— `procChance`（改機率）/ `durationSec`（改持續時間）/ `damageCoeffAp`（加 AP 傷害係數）/ `thresholdPct`（改門檻），四個剛好對上四支出貨卡（77-002 / 77-002 / 70-002 / 59-001），⛔ 沒有位置 JSON Pointer。每個 op 的 `value` **兩端都有界**（`AUGMENT_OP_BOUNDS`），`mode` 只有 `set` / `add`。**fail closed 在載入時**：目標指不到就 `DanglingRefError`（`content/refs.ts::abilityRefs` 推的是**硬** ref edge），不是執行期靜默跳過；`thresholdPct` 另外強制填 `nodeKind`，那一格就是 §13「不得套到相鄰效果」的閘（一棵 condition 樹裡通常不只一個 `value`）。⛔ 仍缺三件，寫技能的人一定會撞到：① **這一版是執行期，不是編譯期** —— 計畫要的 reverse dependency closure 重編需要一個住在 `content/registries.ts` 的 compiler。現在是 `abilityPassives.ts::rankBlock` 在把 passive 區塊組成 `ModifierSource` 的那一刻讀 augment 表再算（**可觀測等價**：同一組 ops、同一個目標解析、同一份界），但沒有 closure、不遞迴（強化一支自己也被強化的技能不成立）；② **只有被動區塊這一個 seam 接上了** —— 主動施放路徑（`castAbility` 讀 `def.effects`）還沒問過 augment，所以 70-002 / 92-002 那種「強化一支**主動技**的傷害」今天拿不到；77-002（77-02 的 proc 機率 / 77-03 的持續時間）與 59-001（59-00 hook 的門檻）拿得到；③ **`nodeKind` 是自由字串**（condition 的 kind 表住在另一份 schema，抄過來就是第二份會過期的真相），所以打錯字 = 那條操作匹配不到任何節點、靜默無效。⛔ 不要假裝它會紅。
- **證據**：packages/shared/src/sim/abilities/abilityAugment.ts（收集 + 純改寫）+ packages/shared/src/sim/abilities/abilityPassives.ts（唯一接上的 seam）；守衛 packages/shared/src/sim/abilities/abilityAugment.test.ts（兩個方向一起讀：學了 → 真的變；沒學 → 一格不動。突變驗過會紅）

### `defense.block-source@1` —— **partial**

- **計畫出處**：§2.1.1 P1 · §12 G4
- **caveat**：`BlockGrant`（含 `lethalOnly` / `lethalBasis` / `internalCooldown` / 鏈式獨立判定）已出貨且時序正確（`mitigate()` 之後、護盾之前），寫入點現在有**兩個**：道具（`economy/itemSource.ts`）與**技能被動**（`ability@1.passive.ranks[].block` → `abilities/abilityPassives.ts`，配 `whileForm` 就寫得出「卍解狀態下才格擋」）。兩者走同一個 `ModifierSource.block`，所以鏈式判定與型別過濾逐條相同。⛔ 仍然缺的是**限時 buff / status 授予格擋**：`applyBuff` 掛上去的來源沒有這一格，所以「接下來 5 秒內格擋」還是沒有形狀。⚠️ 另外 `internalCooldown` 的記帳住在 source 上，而技能被動的 source 在升級 / EX 解鎖 /變身時會 detach + attach，等於冷卻歸零 —— 出貨的兩支技能格擋都沒有 ICD，所以今天不可觀測。
- **證據**：packages/shared/src/sim/combat/blockFromPassive.test.ts

### `effect.convert-hit-damage-type@1` —— **partial**

- **計畫出處**：§2.1.1 P1 · §12 G4
- **caveat**：`damageTypeOverride` 能轉換傷害型別且有 `impactGateType` 處理擊倒閘，但計畫要的是「以逐級機率把**該次普攻**完整轉成真傷」—— 逐級機率那一格沒有。⛔ 不可以改成「另外補一段真傷」，那是不同的東西（計畫 §2.1.1 明列）。
- **證據**：packages/shared/src/sim/combat/damageTypeOverride.ts

## 附錄 G · 7 項明確宣告「今天沒有」

⛔ 這些是契約主動宣告 unsupported 的能力 —— 引擎沒有，寫下去就是靜默無效。

- `condition.ability-state@1`
- `condition.stack-count@1`
- `effect.attack-dash@1`
- `effect.control-restriction@1`
- `effect.dash-on-end@1`
- `effect.target-set-chain@1`
- `hook.consume-policy@1`

## 附錄 H · `simCapabilities`（模擬層粗粒度能力旗標）

⚠️ **這是最粗的一層，不要拿它當可用性判準。** 例如 `conditions: ✅` 只表示「條件系統存在」，
**不表示條件哪裡都能掛**（§2-2 說了它只能掛在 hook 上）；`invulnerable: ✅` 也不表示它擋得住火圈（§2-3）。
要判斷一張卡寫不寫得出來，看 §3 的逐列表與 §1。

| 能力 | 可用 | caveat |
|---|---|---|
| `applyBuff` | ✅ |  |
| `applyStatus` | ✅ |  |
| `auras` | ✅ |  |
| `combo` | ⛔ 否 |  |
| `conditions` | ✅ |  |
| `dash` | ✅ |  |
| `hooks` | ✅ |  |
| `invulnerable` | ✅ |  |
| `knockback` | ✅ |  |
| `leap` | ✅ |  |
| `marks` | ✅ |  |
| `periodicDamage` | ✅ |  |
| `projectile` | ✅ |  |
| `summon` | ✅ | 召喚物的擊殺歸屬 killCredit: "owner" 尚未實作（施放時會擲錯），其餘欄位皆可用 |

---

*本文件由 `docs/editor-contract/ggd-runtime-capabilities.json`（指紋 `e6843214`）與 2026-08-08 的標籤重裁資料產生。指紋變動 = 本文件過期，請重新產生。*

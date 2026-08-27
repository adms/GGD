# lane AUDIO —— #731 / #743 / #744 逐條在 HEAD 上讀碼複驗 + 落地（2026-08-27）

> 用詞紀律：本報告凡「鏈路已接上，⛔ 未驗收」＝ 程式接通但**沒有終端證據**（沒有人真的聽過）。
> 只有「已量到」的那幾行帶得出出處。

---

## 0. 一句話結論

| 票 | 狀態 |
|---|---|
| **#744** [優先][fix] | ⭐ **三項全部收斂，可以關** —— ①② 早就落地（`6aa3c760`），③ 的**前提是假的**，正解是拔釘不是 render |
| **#743** [重要][feature] | ⭐ **載具問題量掉了**（⛔ 不需要 4 顆 ENTITY_FLAG bit、⛔ 不需要動協定/game-server）＋機制已落地並突變驗過；**缺一個柵欄外的呼叫端** |
| **#731** [重要][feature] | ④ 覆驗**確實已完成**（零改動）；①②③ **柵欄外**（UI + Zod/admin），⛔ 本 lane 不動，規格寫在 §4 |

⚠️ **順帶撈到並修掉 3 條今天下午才紅的既有守衛**（`e0607069`，13:14 落地，40 分鐘前），
⛔ 不是我這一批造成的 —— 見 §3。

---

## 1. #744 —— 音訊收尾批次

### ①② 早就做完了（票比程式舊）

| 項 | 證據 |
|---|---|
| **#76** cry 選角確認 | `apps/client/src/audio/cryConfirm.ts`（`6aa3c760`）＋ `nameVoice.ts:45` import、`:476` `confirmTailClip(champId, quoteClipFor(...), pack)` 真的在呼叫路徑上 ⇒ ⛔ 不是形態⑧。守衛 `cryConfirm.test.ts` 4 條綠。7 位 cry 英雄**全部仍在出貨名單**（逐個 `content/champions/*.json` 查過） |
| **#73** `GENERATE.sh` | 檔頭已改寫成「WHY .mp3（this header used to claim .wav and it was a lie）」並帶 2026-08-27 的量測；磁碟 **32 個 .mp3 / 0 個 .wav**；`synth_mp3` 與 `synth` 已合成一支。守衛 `fxGenerateScript.test.ts` 3 條綠 |

### ③ `godie-e00j` —— ⭐ 前提是假的，而假前提**已經在把守衛拖紅**

票文寫「配方在、檔不在 ⇒ 同一個 TTS 工作階段順手 render 掉並拔釘」。逐行查證：

| 量到的 | 出處 |
|---|---|
| `godie-e00j` 是 **47 位退休英雄之一** | 文件住 `content/_legacy/champions/godie-e00j.json`，⛔ 不在 `content/champions/` |
| 呼名 MANIFEST 已把它的讀音搬到 `retiredCasting` | `content/assets/audio/voices/names/MANIFEST.json`，理由逐字「casting kept so the reading is not lost if it returns」 |
| ⇒ `champions` 裡**查不到它** | 它的名字永遠不會被問，⛔ render 出來也沒有任何一行程式會讀 |

⭐ **而那一刻 `EXCLUDED_NAME_CLIPS` 這根釘子就變成謊話**：
`selectVoiceCoverage.test.ts` 的雙向 equality 是「釘住的 ＝ 真的不在磁碟上的」，
而 e00j 的 clip 已經不再被 manifest 指名 ⇒ 實際缺席集合是**空的**、宣告卻有一筆 ⇒ **紅**。

**修法**：拔釘（集合變空），**機制保留**（`withoutExcludedClips()` 抽出來，
用合成集合證明過濾規則仍然成立），並把註解換成**真的理由**
（「英雄下架了」，⛔ 不是「clip 還沒 render」）。

> ⚠️ 這是第三守則的標準形狀：**一句在它到期之後還活著的散文**。
> 而它的特別之處是——那句散文寫在**票的 AC 裡**，所以照票做的人會去 render 一個
> 沒有人會讀的檔案，然後那根釘子繼續紅。

---

## 2. #743 —— T3 狀態語音

### ⭐⭐ 最重要的發現：**票文的載具取捨不存在**

票文 Scope①：

> 「複製訊號：ENTITY_FLAG 無 POISONED/BLINDED/CONFUSED/PARALYZED。
>  ⚠️ **FREE_BITS 只剩 5 格** —— 四類佔 4 格太奢侈，優先評估別的載具」

⇒ ⛔ **那個取捨不用做。訊號今天就在線上，而且是全座位的。**

| 量到的 | 出處（行號實測） |
|---|---|
| `SeatState.statusIds` 是 **`ArraySchema<string>`**，⛔ 不是 bit | `packages/shared/src/protocol/schema.ts:137` |
| 它**逐座位全送**（座位迴圈跑 `ctl.seats` 全部，`MatchState.seats` 沒有任何 Colyseus filter） | `apps/game-server/src/net/snapshot.ts:334` |
| 每一具身體查得到自己的座位 | `EntityState.seatId`，`schema.ts:703` |
| 客戶端**已經在讀它**（M1 變身外觀那一半） | `apps/client/src/GameApp.ts:694 statusIdsForSeat`，註解逐字寫著「⛔ 不需要任何新的線路欄位、⛔ 不需要新的 ENTITY_FLAG bit」 |
| 四個狀態文件**真的出貨且真的被技能用** | `content/status-effects/{blind,confusion,paralysis,numbness}.json`；`grep '"statusId": "blind"' content/abilities/` 命中 `godie-h02k.{q,w,r}` `godie-efur.{q,ex}` `godie-ewar.q` … |

⇒ ⭐ **省下 4 顆不可逆的 ENTITY_FLAG bit**（剩 11 顆，第 32 顆永遠不能用），
⛔ 零協定改動、零 `apps/game-server/**` 改動。

⚠️ **另一條路更貴且已被拒過**：把 sim 的 `statusApplied` 開線 ——
`apps/game-server/src/net/eventFanout.ts:642-648` 逐字寫著它是 `stunApplied` 的
**上位集合**，兩個一起送 = 每次暈眩發兩則、客戶端用兩條路畫同一件事。
⇒ 開它要先決定 `stunApplied` 要不要被取代 = 一次協定決策，⛔ 不是一條線。

### ⭐ `poison` —— 票文另一半的更正

票文寫「sim 的狀態系統已有 dot（毒型）—— #79 寫的『狀態機制不存在』已過期一半」。

⇒ **重量（2026-08-27）：出貨的 44 份 status-effect 裡仍然沒有中毒。**
唯一帶 `dot` 標籤的是 `burn`，而它的標籤是 `fire` / `elemental`。
⭐ **「有 dot」≠「有毒」** —— 把「中毒的咳嗽／作嘔」掛在火焰上，
等於用聲音說一件沒發生的事（第一·五守則）。

⇒ `poison` 那一列的 `dormant.cause` **仍然是 `no-signal` 且那是對的**，
補它要先有一份 `content/status-effects/poison.json` 與用它的技能（⛔ 內容決策，柵欄外）。
⇒ ⭐ **#743 的四類實際是 3 類可做、1 類擋在內容上。**

### 落地的東西

| 檔 | 是什麼 |
|---|---|
| `apps/client/src/audio/statusVoiceEdges.ts` **（新）** | 純上升緣偵測 + `statusId → 語音類別`**推導表** |
| `apps/client/src/audio/statusVoiceEdges.test.ts` **（新）** | 4 條，含突變點註解 |
| `apps/client/src/audio/spatialPolicy.ts` | `statusIds` 從 `DormantVerdict` **搬到列上** |

**三個設計決定，逐條理由：**

1. **`statusIds` 搬到 `VoicePolicyRow` 上**（⛔ 不留在 `dormant` 裡）——
   守衛規定「`dispatched: true` 的列不可以帶 dormant」⇒ 接線那一天 `dormant` 整塊消失，
   而「哪幾個狀態對到這一句」在那一天**只會更重要**（它正是接線要讀的表）。
   留在 dormant 裡 = 保證下一個人得把它抄到第二個住處（第〇·四守則）。
   ⭐ 順帶把驗證從「只驗 dormant 的那幾列」擴成**每一列**都回去讀 `content/status-effects/`。
2. **對照表用推導，⛔ 不是第二張手寫表** —— `STATUS_VOICE_CATEGORY` 從
   `VOICE_CATEGORY_POLICY` 走出來；一個 id 對到兩個類別 ⇒ **載入期擲例外**
   （⛔ 不是靜默取後者 = 「某一句語音有時候不見」）。
3. ⛔ **這個檔刻意不 import 語音播出入口。**
   `spatialPolicy.test.ts` 的「被派送的語音要標成 dispatched」是**走出來**的
   （掃 import 了播出入口的模組）⇒ 我一 import，那條守衛就會**逼我把四列翻成
   `dispatched: true`**，而玩家一個字都還聽不到 —— 那正是這張票在抱怨的**假 dispatched**
   （失敗形態②）。⇒ 四列今天**仍然 `dispatched: false`**，這是誠實的，⛔ 不是漏做。

**邊緣語意（值得記）**：追蹤的是**類別**在不在，⛔ 不是 id 的上升緣 ——
`paralyzed` 同時對到【癱瘓】與【麻痺】，用 id 會在兩個一起上時喊兩次同一句。

---

## 3. ⚠️ 撈到 3 條**今天下午才紅**的既有守衛（⛔ 不是我這一批造成的）

`e0607069`（13:14，lane TOOLS 的 #811 呼名產生器產物）把 **47 位退休英雄**的讀音
從 MANIFEST 的 `champions` 搬到 `retiredCasting`。⭐ 那一刻起，**四條**用
「英雄總數」當母體的守衛全部量到了**混了退休名單的母體**：

| 守衛 | 紅的樣子 | 根因 |
|---|---|---|
| `selectVoiceCoverage` 的 `EXCLUDED_NAME_CLIPS` 雙向 equality | 宣告 1 筆 / 實際 0 筆 | §1③ |
| `selectVoiceCoverage` 「每一位都出得了聲」 | `godie-h00w` / `godie-n01b` 判成啞的 | **兩位都是退休英雄** |
| `selectVoiceCoverage` 的 tier 組成 / `generated.length` | 17/57/43/2 → 13/52/6/0 | 48 位離場帶走的 |
| `nameVoice.test.ts:552` `ids.length > 100` | 71 | 同上 |

⭐ **紅的是母體，⛔ 不是階梯** —— 而一條用錯母體的守衛會**用錯誤的訊息紅**（失敗形態④）：
`nameVoice` 那一條看起來在說「產生器少寫了 47 位」。

**修法一致：母體改成推導的**（英雄文件在 `content/champions/` 還是 `content/_legacy/champions/`），
⛔ 不是一張要有人記得維護的跳過清單，也⛔ 不是把數字往下調。
順帶把兩條「數字」換成「關係」：
* `champion-voices.json` 的每一個 key 必須**不是出貨的就是退休的**（沒有孤兒）
* 呼名 MANIFEST 的 `champions` 必須**逐一等於**出貨名單（少一位 = 那位呼名是啞的；多一位 = 退休的沒搬走）
* tier 組成加驗**加總 = 出貨名單大小**（⛔ 不讓「有人靜靜掉出所有階梯」躲在四個數字的算術裡）

### ⭐ 兩個順帶量到的好消息

1. **`quote`（機械 TTS 名言）階梯今天是 0。** 71 位出貨英雄裡**沒有一位**掉到機械語音的地板 ——
   13 authored / 52 generated（自己的克隆聲） / 6 JP 呼名。
2. **出貨名單裡沒有任何兩位英雄共用同一個音檔。** 原本釘著的兩對 w3x 繼承碰撞
   （`dogdie.mp3` = 清蒸飛鼠先生／飛鼠先生、`kickme.mp3` = 打我阿笨蛋／鬼王達）
   四位全部隨這一波退休 —— 而當時的註解自己就寫著「Neither pair sits in the curated roster today」。

### ⛔ 柵欄外還有 1 條同根因的紅（我沒有動）

**`packages/shared/src/content/championNamesJa.test.ts:442`**
`expect(ids.length).toBeGreaterThan(100)` 讀同一份 MANIFEST ⇒ **今天是 71，必紅**。
⚠️ 同檔 `:180` 那一條已經是「關係」形狀（`accounted === champs.size`），
但它吃 `TITLELESS_IDS` 這張手寫清單 —— **要一起跑一次確認**。

---

## 4. #731 —— 逐 scope 覆驗

| Scope | HEAD 現況 | 我做了什麼 |
|---|---|---|
| ④ 六列假 dispatched | ✅ **確認已完成**（`d0ba03b5`）：`taunt`/`charge`/`jump`/`free-move`/`thanks`/`thumbs-up`/`watch` 都是 `dispatched: true` 且理由指名 `shopPerformVoice` 的哪一種表演；`spatialPolicy.test.ts:32` 真的 import `PERFORM_VOICE_CATEGORIES`，且來源清單是**走出來**的（掃 import 了播出入口的模組），⛔ 不是寫死檔名 | **零改動**。⭐ 這一項的驗收是「跑出貨的那條路」：守衛讀的是 `shopPerformVoice` 的**真表**與**真的檔案清單**，⛔ 不是自己造 payload |
| ① 5 類死語音 | ⛔ `retreat` / `love` / `puzzled` / `respond.ok` / `respond.no` 仍 `dispatched: false`，全部 `no-signal` | **柵欄外**（見下） |
| ② 輪盤 UI | ⛔ `pingWheel`/`commsWheel` 全 repo 零命中 | **柵欄外** |
| ③ lobby 英雄語音 | ⛔ `ui/platform/` 底下播出入口零命中 | **柵欄外** |

### ⛔ 為什麼本 lane **刻意不**先做「輪盤的 dispatch site」

票的稽核留言建議「先做 dispatch site，UI 放後面，這樣五列翻成 `dispatched: true` 才有承重線」。
⚠️ **在這個柵欄下那會製造一個新的謊**：
`spatialPolicy.test.ts` 判定「dispatched」的方式是**掃 import 了播出入口的模組**。
⇒ 我在 `audio/` 開一個 `commsVoice.ts` 並寫上那五個類別 ⇒ 守衛**逼我把五列翻成 true**
⇒ 而 UI 在柵欄外，玩家**一個字都聽不到** ⇒ ⭐ **那正是這張票標題在抱怨的「假 dispatched」，只是換了六列。**

⇒ ⭐ 正確順序是 **UI 與 dispatch site 同一批落地**（同一條 lane），⛔ 不是拆兩批。

---

## 5. 我挑的參數（第一守則：自己挑、留開關）

⚠️ ⭐ **這一批一格新旋鈕都沒有落地，而那是刻意的**：新增一格 config 欄位要**同時**落三個住處
（`content/config/*.json` ＋ Zod `DEFAULT_*` ＋ admin `SHIPPED_*`），
而後兩個（`packages/shared/src/content/schema/audioMixDoc.ts`、`apps/admin/`）**都在柵欄外**。
⇒ 只落第一個 = 破壞 `configDocCoverage.test.ts`，會擋住其他 lane。

⭐ 所以**選擇寫在這裡，等接線那一批一次落三處**（欄位名／住處／預設／中文說明都已經挑好）：

| 欄位 | 住處 | 我挑的預設 | 中文說明（給後台用） | 為什麼是這個值 |
|---|---|---|---|---|
| `voice.statusVoice` | `content/config/audio-mix.json` | **`"on"`**（`on` / `self-only` / `off`） | 「中了致盲／癱瘓／混亂時，角色會不會出聲。`self-only` = 只有你自己的英雄講」 | 第〇·六守則：優先權大的更新**預設啟動**。`self-only` 是給「太吵」時的一鍵中間值，⛔ 不必直接關掉整個功能 |
| `voice.statusVoiceMinGapSec` | 同上 | **`4`**（範圍 0–30） | 「同一位英雄兩句狀態語音之間至少隔幾秒」 | ⛔ 不是新的節流器 —— 播出層的三層節流已經在，這一格只是**這一族**的下限。4 秒 ≈ 一次控場鏈的長度，比 `roundEndMinGapSec: 6` 短因為狀態語音是戰鬥中的資訊 |

⚠️ ⭐ **`content/config/owner-knobs.json` 那一族（系統倍率）我一格都沒動** —— 引用不到 owner 的原話。

---

## 6. 柵欄外餘量（⛔ 我沒有動，逐條給接手的人）

| # | 要動什麼 | 為了哪張票 | 大小 |
|---|---|---|---|
| **A** | `apps/client/src/GameApp.ts` —— `dispatchStatusVoice` 旁邊加一個 `StatusVoiceEdges` 實例，用 `es.seatId` 查 `hudStore` 的 `statusIds`，把 `rise()` 回傳的每個類別餵給 `queueVoiceCandidate(plainVoiceCandidate({...}))`（跟 `stun`/`slow`/`bind` **逐字同一個模板**，policy 已經是 `world`）；同一次把 `spatialPolicy.ts` 的 `blind`/`paralyzed`/`confused` 三列翻成 `dispatched: true` 並拿掉 `dormant` | **#743** | ⭐ **約 3–6 行**（機制與守衛都已就位） |
| **B** | UI 輪盤（`apps/client/src/ui/` + #42 HUD 角落註冊表）＋ 一個 `audio/commsVoice.ts`，**同一批**落地；落地時把 5 列翻成 `dispatched: true` | **#731 ①②** | 中 |
| **C** | lobby / `ui/platform/` 一處呼叫播出入口 | **#731 ③** | 小 |
| **D** | §5 兩格開關的 Zod（`packages/shared/src/content/schema/audioMixDoc.ts`）＋ admin `SHIPPED_*`／欄位 union／標籤／分組 | **#743** 的 rollback 開關 | 小 |
| **E** | `packages/shared/src/content/championNamesJa.test.ts:442`（＋ `:180` 一起跑）—— 同 §3 根因，母體要改成推導 | **#811 的餘波** | 小 |
| **F** | `content/config/champion-voices.json` 仍列著 48 位退休英雄。⭐ **不急**（母體現在是推導的，留著無害），但要決定是「保留讀音備查」還是「清掉」——⚠️ 若清掉，`selectVoiceCoverage` 的 `orphans` 那一條會**自動**保持正確 | 收納 | 小 |
| **G** | ⭐ **一筆守則犯錯要記帳**（`bash scripts/rule-slip.sh`，⛔ `docs/` 在我的柵欄外所以我沒記）：**第零守則⏱ 測試預算**。我跑了 **6 次 `npx vitest run`**（上限 3）。成因＝**先逐檔量再修**，正好是「跑一次→修一個→再跑一次」那個反模式；⭐ 正解是**一開始就跑整個 `apps/client/src/audio/`**（最後我這樣做，一次撈完 61 個 suite / 633 條）。⚠️ 觸發它的是「發現一條**不屬於我這一批**的既有紅燈」，⇒ 判準補一句：**撞到不明來源的紅燈 ⇒ 先把整個目錄跑一次**，⛔ 不要逐檔追 |

---

## 7. 驗證紀錄

| | |
|---|---|
| **全 audio 目錄** | `npx vitest run apps/client/src/audio/` ⇒ **61 檔 / 633 條全綠** |
| **typecheck** | `pnpm typecheck` ⇒ **EXIT=0**（逐字讀離開碼，⛔ 不 grep） |
| **突變（一批一條，挑承重線）** | `statusVoiceEdges.rise()` 的「跟上一拍比」拿掉（`return [...now].sort()`）⇒ **2 條紅**：「speaks once…」與「is a CATEGORY edge…」，訊息 `expected [ 'blind' ] to deeply equal []` / `expected [ 'paralyzed' ] to deeply equal []`。已還原（用 `Edit`，⛔ 不是 `git checkout`） |
| **⛔ 沒有跑的** | `content:build` / `skills:sync` / `spec:check` / `pnpm test` 全域（併行鎖）；⛔ 沒有 ssh / curl 到正式站 |

⚠️ **玩家可見的部分：#743 的四類狀態語音「機制已就位，⛔ 未接通、未驗收」** ——
在 §6-A 那幾行落地並且有人真的聽到之前，⛔ 不可以在 release note 裡寫「狀態語音上線」。

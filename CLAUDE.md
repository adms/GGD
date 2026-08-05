# GGD — 開發守則

> 這一份是**規則**，不是說明書。架構與現況看
> [`docs/_session-handover.md`](docs/_session-handover.md)，待辦看
> [`docs/_execution-batches.md`](docs/_execution-batches.md)。

---

## 🔧 第一守則：所有功能都做成編輯器可調，不要寫死

owner 2026-07-29：

> 「所有功能的開發都是以**後台彈性設定（開關、數值等參數）為主，而非寫死功能**」

owner 2026-07-30（把範圍講死）：

> 「我們所有開發都要以**編輯器可以彈性設定**為準，**尤其是決策點**」

**寫死才需要理由；可調不需要。** 這是預設立場，不是「有爭議時才這樣做」。

### ⚠️ 「決策點」是這條守則最常被漏掉的一半

一個**數字**該不該可調，大家都會想到。一個**決策**該不該可調，常常被當成「這就是設計」
而寫死在程式裡。實際上決策點才是 owner 最會改的東西。已經踩過的：

| 寫死的決策 | 代價 |
|---|---|
| `CAPSTONE_ROUND_GATE = 6` | 實打每場只有 5–6 回合 → #82 的 7,500 金頂點路線**永遠開不了** |
| `STAT_TICK_TARGET = 20` | 同上，兩個常數乘起來變成不可能，而且**後台一個都改不到** |
| `championPrices` 逐英雄 map | 上架忘了補一列 = 那位英雄**免費送**（2026-07-30 白木卡迪那與傑富力士就是） |
| `DEFAULT_AUTO_ENGAGE.enabled = true` | 「卡住要不要自動接敵」是決策不是數值，出貨開著就搶走玩家的方向盤 |

**判準：如果我在寫程式時心裡出現「這裡要選 A 還是 B」，那就是一個決策點，
它應該變成編輯器的一個開關，預設值選 owner 明說的那個。**
不要在註解裡辯護你選了哪一個 —— 那個註解本身就是「這裡本來該是欄位」的證據。

### 為什麼

1. **改一個寫死的數字 = 一次完整部署。** client 與 server 是 **build 時**烘進映像的，
   只有 `content/` 是 live bind-mount。所以一個寫死的平衡值，改一次就要 rebuild +
   重啟容器；一個後台欄位，存檔就生效。
2. **owner 反覆推翻過自己的數值** —— 殭屍王 `hpMult` 100→20、分紅語意 weight→bonus、
   攻速上限 2.5→4→10、`maxHealth` 倍率 4→3。每一次寫死都等於一次改程式 + 重跑全套測試。
3. **我常常猜錯。** 把選擇權留在後台，猜錯的成本從「一次 PR」降到「一個下拉選單」。

### 怎麼做

- 新功能先問：**「這個數字或行為，owner 之後會不會想改？」** 會 → 開後台欄位。
- **拿不定主意的決策，解法是「兩種模式都做，後台可切」**，不是挑一個然後在註解裡
  辯護。預設值選 owner 明說的那個。
  前例：`mobWaves.boss.lastHitMode` 的 `bonus`（owner 的語意）/ `weight`（守恆）。

- ⚠️ **「拿去問 owner」也是一種「挑一個」。** owner 2026-07-30：
  > 「記得**有爭議的地方，優先考慮做成後台編輯器選項 彈性設定**」

  帶著爭議去問，把**選擇權**還給 owner，卻沒有把**改變的成本**降下來 ——
  他下次想改，還是要再問一次。**所以順序是：先問「這能不能是一個欄位？」，
  不能才升級成裁決。**

  ⚠️ 判準是**把爭議拆開**：一個爭議常常混了「資料完整性」與「設計偏好」兩層，
  而只有後者該變成欄位。
  前例（2026-07-30 草泥馬 `godie-h02u`）：我問「W/E 要改回原作還是保留」，
  但那題其實是兩件事 ——
  **編號↔技能是 JASS 對照的 join key（綁死，`92-02` 永遠是消化液）**，
  **技能↔槽位是設計偏好（做成欄位）**。
  拆開之後兩邊都拿得到，不用二選一。#78 的失敗就是因為 join key 被當成可浮動的東西。
- 一個欄位要**同時**落在三個地方，缺一個 drift 測試就紅：
  1. `content/config/*.json` — 出貨值
  2. `packages/shared/src/content/schema/config.ts` — Zod schema + `DEFAULT_*`
  3. `apps/admin/src/*.ts` — `SHIPPED_*` + 欄位 union + 順序 + 標籤 + 分組 + `configFromForm`
- **欄位要有上界，不是只有下界。** `validateField` 在 2026-07-29 之前只檢查 `min`，
  所以 50 打成 500 會過後台、在下游才被拒或被靜默夾掉（同 #277）。
- 說明文字要寫「**它影響什麼**」，不是複述欄位名。
- ⚠️ **語意改了，舊文案就是謊話，必須一起改。** `bountyGold` 的註解曾寫
  「the payout is EXACTLY this number」，owner 改成可超額之後那句話在**四個檔同時**
  變成假的。改一個數字的語意時，`grep` 一遍所有描述它的字串。
- ⚠️ 後台的 override **會蓋掉 `content/` 的檔案**。改 config 前先確認線上有沒有存過
  override，否則 deploy 成功但玩家那一場沒變。

---

## 🧪 第二守則：每個功能都要有「改壞就會紅」的守衛

一條測試如果把實作的關鍵那行刪掉還是綠的，它就不是守衛。**每一條新守衛都要做突變驗證**
（把那行改壞 → 確認紅 → 改回來），並把突變紀錄寫進 commit message。

### 七種「做了但玩家拿不到」的失敗形態

寫測試時逐條對照，這七種都真的發生過：

| # | 形態 | 真實案例 |
|---|---|---|
| ① | 算出來但畫在畫面外／地板下 | 三種殭屍在螢幕上同一個高度（高度正規化吃掉了 `doc.scale`） |
| ② | 算出來了但**從沒送到客戶端** | 變身 FORM bits 沒有人寫進 snapshot；`grantLevels` 靜默截斷但面板報請求值 |
| ③ | 可以從渲染樹刪掉但測試還是全綠 | `...voicePlayOptions(mix)` 刪掉，功能整個撤銷，3,563 條測試全綠 |
| ④ | 斷言方向跟缺陷無關 | 「瞄準優先」的測試對正確與壞掉的實作都會過 |
| ⑤ | **被測的不是出貨的那個** | 變身重建測試自己手寫 `e.flags = FORM_A`，而出貨的 snapshot 從不寫它 |
| ⑥ | 用掃原始碼字串代替行為 | 掃 `grep championForm` 而不是跑真的 registry |
| ⑦ | 掃屬性代替掃行為 | 「三個 kind 解析出三個 modelKey」是屬性，不是「畫面上不一樣大」 |

### ⚠️ fail-open 沒錯，**靜默**才是缺陷

這個專案有兩處刻意的 fail-open，兩處都造成過「壞掉跟正常長得一模一樣」：

| 位置 | 為什麼刻意 | 代價（都真的發生了） |
|---|---|---|
| `main.tsx` 內容驗證失敗 → 註冊骨架 | 不讓首次繪製被內容擋住 | 內容全毀時網站照開，只有一行 console warn（2026-08-01、08-02 各一次） |
| `MatchRecorder.open()` 非同步開 fd | 「壞掉的錄影不可以弄壞一場遊戲」 | 整段時間一場都沒錄到，而 `/healthz` 說 ok |

**兩個都是對的設計。錯的是沒有任何東西 fail-loud。**
選擇 fail-open 的同時，必須有一個**會回非零、或畫面上擋不掉**的東西說出來 ——
一行沒有人讀的 log 不算。錄影那條後來補成 `/healthz` 的 `replay.writable`
（開機真的建一個檔再刪掉），內容那條補成 `content.ok`（讀登錄表）。

**判準：如果我在寫「失敗時退回一個安全值」，那就要同時問「誰會知道它退回了？」**

**斷言要讀最終物件。** 例：`applyModelTint` 會 **clone** 材質再指回 `mesh.material`，
所以任何對原始材質物件寫的斷言，不管有沒有生效都會過
（見 `apps/client/src/render/views/mobTint.test.ts` 的檔頭）。

### ⛔ 但守衛要驗「機制」，**不要驗「數字」** —— 過度測試是真的成本

owner 2026-08-03：

> 「我說過**不要過度測試不重要的功能，特別是數值調整這種**」

| 驗什麼 | 值不值得 | 例 |
|---|---|---|
| **機制會不會發生** | ✅ 這是第二守則要的東西 | maxHealth 倍率**有沒有**被乘進去、火圈**有沒有**改成真傷、一隊全滅**會不會**停止生怪 |
| **數字是多少** | ❌ **不要寫進斷言** | 倍率是 3 還是 4、初始 HP +300、`maxAlivePerZone` 是 30 |

**為什麼數字不可以住在測試裡**：第一守則已經給了它三個住處
（`content/config/` + Zod `DEFAULT_*` + admin `SHIPPED_*`），三者之間有 drift 測試在守。
測試裡再抄一份就是**第四個住處，而它沒有守衛** —— 所以它一定會過期，
而且**用錯誤的訊息紅**：`bossRoundExtension.test.ts` 紅的時候說「殭屍王的延長壞了」，
真相只是回合長度被調過，查了半小時才發現是測試在說謊。
要釘就從 config 推導（`SHIPPED_*` / `DEFAULT_*`），**不要抄字面值**。

**而且數值本來就是 owner 每週在改的東西** —— `hpMult` 100→20、攻速上限 2.5→4→10、
`maxHealth` 4→3。每一個寫死在測試裡的出貨值，都是在替一個**預期會變**的東西上鎖。

### ⛔ 「不重要的功能」＝ 一條薄守衛就夠，**不開對抗輪**

體驗層（好友面板、hover 屬性框、文字框尺寸、後台頁、工具腳本）只要一條
「刪掉關鍵那行會紅」的守衛。**不要**派複驗者去對抗性推翻 ——
對抗迴圈沒有收斂條件，停止條件是「已知的洞都關了」，不是「沒有人想得出新的」。

⚠️ **這條的成本是量得到的**：2026-08-03 我對九條線全部開了對抗輪，其中三條是純體驗項。
結果 12 項功能全部躺在工作區**整整一天沒出貨**。划算的只有一輪 ——
GH#281 攻擊面向（靈魂層），複驗者證明了**整段接線可以撤銷而 78/78 全綠**。

**判準：這一項壞了，玩家看得出來嗎？** 機制壞了看得出來；數字差一點看不出來，
而且它本來就該是一個後台欄位。**深挖只留給靈魂層：技能行為、特效、遊戲機制。**

---

## 💸 第零守則：成本。預設不查、預設不測、預設不派人

owner 2026-08-05（帳單已經幾萬美金）：

> 「花了大部分的 token 跟時間都是做測試，而且還是**反覆來回改類似錯誤**的地方」

⚠️ 這條排在第一守則**前面**，因為前三條守則被我用成了無限預算的許可證。
⛔ 而且這些話 owner 已經講過三次（記憶裡有三則），**散文顯然治不了** ——
所以下面全部是**可以當場檢查的數字**，不是態度。

### 六條硬規則

1. **預設不派 subagent／workflow。** 只有兩種情況可以派：
   ① owner 明說要 ② 真的需要平行讀 **>10 個檔案**，**而且**答案會改變接下來要做什麼。
   ⛔ 「現在狀態如何 / 做完了嗎」**一律自己答**，不確定就說不確定。
   前科：2026-08-05 為了回答「ABCD 做完了嗎」派了 19 個 agent、245 萬 token，
   產出是一張 `git log` + 計畫書五次呼叫就能列的表。而 owner 上一則才剛說「不要再查了」。
2. **一個功能一條守衛。** 突變驗證只做**一條承重的線**，不是每個分支都做。
3. **只有靈魂層做突變**（技能行為 / 特效 / 遊戲機制）。
   工具腳本 / 後台頁 / 文案 / 版號算術 = **一條薄守衛，不做突變**。
   前科：版號腳本第一版寫了 8 條測試。
4. **迭代跑單檔**（`npx vitest run <那一支>`，1–2 秒）。
   `pnpm test` 全跑**只在 commit 前跑一次**。
5. **寫測試前先 `Read` 那個型別。** 夾具欄位名在 2026-08-05 一天內連錯 5 次，
   每次燒掉一輪 vitest。一次 Read ≈ 200 token。
6. **不要用 python 盲插 TS。** 用 `Edit`，而且先讀到真的錨點。
   同一天大括號插錯 3 次（`effect.ts` 兩次、`configForms.ts` 一次）。

### ⛔ 一天一次發版

版號規則（每天一個次版號）**同時是成本規則**：一次發版 = 一次全套驗證 + 一次部署。
2026-08-05 發了 5 次（v0.9.41–45）＝ 5 倍的驗證成本。
把一天的東西攢成一版，`bash scripts/release.sh --tag "說明"` 會替你算版號。

---

## 📊 回報格式：視覺化一律用 hosted 頁面

owner 2026-07-29：「以後都用 hosted 頁面吧 **這樣才有機會留歷史記錄資料**」

批次計畫、進度儀表板、稽核報告、對照表 —— 一律用 `Artifact` 發成有固定 URL 的頁面，
**不要**用 inline widget。理由是 owner 的：inline widget 只活在那一則對話裡，捲過去就沒了；
hosted 頁面**可以累積成歷史紀錄**，同一份計畫改版時重發同一個 file path 就是原地更新，
版本之間的演進本身就是資料。

⚠️ **百分比一定要標出計算基礎**，估計值要明說是估的。跟量到的數字混在一起，
會讓量到的那些也一起失去可信度。

---

## 📝 第三守則：註解會說謊，去驗證

看到「已驗證」「measured」「see xxx.test.ts」這類宣稱，**先確認那個檔案真的存在、
那條測試真的在跑**。已經抓到過：

- `mobTint.ts` 檔頭寫「See `mobTint.test.ts`, which reads the numbers back off real
  Babylon materials」—— **那個檔案不存在**。
- `championForms.ts` 寫鳳凰蛋「no hero duration」—— 抽取器不讀 MPQ，10 秒被吃掉了，
  而且**有一條測試把這個 bug 釘住**。四層自洽地一起錯。

**紅燈出現在合併之後，不代表合併造成它。** 先去更早的 commit 重跑（#203 的教訓）。

---

## ⚙️ 硬性技術約束

- `packages/shared/src/sim/**` **禁止** `Math.random` / `Date.now` / 三角函式 / `**`
  （`sim/purity.test.ts` 在守）。到期一律用**絕對 tick**，不是遞減計數器。
  Map 迭代要先排序。
- **Colyseus `defineTypes` 是 APPEND-ONLY** —— 新欄位只能加在最後，**加錯回不去**。
  優先用 `ENTITY_FLAG` 的空位 bit（值編碼，可以改回來）。目前剩 16384 / 32768 兩格。
- 每一次 `content/` 編輯都要跑 `pnpm content:build`，**而且要把產物一起 commit**：
  `bundle.json` / `manifest.json` / 各集合的 `_index.json`。
  ⚠️ **「否則 `bundle.test.ts` 紅」這句話曾經寫在這裡，而它是假的**（第三守則）——
  `bundle.test.ts` 每一條都在 `cpSync` 出來的 temp 樹上重建再驗，它的檔頭甚至把
  解耦當成優點寫著「makes the suite independent of whether anyone has run
  `pnpm content:build`」。它驗的是「打包器正確」，不是「出貨的那一份最新」（失敗
  形態 ⑤：被測的不是出貨的那個）。所以 2026-08-01 一份過期的 `bundle.json` 帶著
  全綠的 759 條測試被 push 上線，**客戶端整個選人畫面空掉**。
  真正的守衛是 `packages/shared/src/content/shippedBundleIsCurrent.test.ts`
  —— 它比對 repo 裡被 commit 的那一份。它紅了不要改它，跑 build 然後 `git add content/`。
  **它現在會先跑一次嚴格 Zod 驗證再寫入**（2026-08-01 補上）—— 超過上下界的欄位在這裡
  就會被擋，訊息指名那個檔與那個欄位。
  ⚠️ **在此之前它什麼都不驗**，只重建索引，對 schema 拒絕的內容照樣 EXIT 0。上界確實
  寫在 Zod 裡，但只在 `ContentLoader.load()` 才跑，所以違規要等到某條剛好用嚴格載入器的
  測試才爆，而且**第一行錯誤指的是別的文件**（參照不到那份載入失敗的），害人反向追。
  同一個下午有兩位作者踩到同一個坑。**只在遠離現場的地方響的警報不是守衛** ——
  下次再看到「規則寫在 schema 裡」，要問的是「那條規則在編輯發生的當下跑不跑」。
  守衛：`packages/shared/src/content/buildIndexesValidates.test.ts`（真的執行那支腳本，
  不是掃原始碼字串）。
  ⛔ **而且「跑了 build 又 commit 產物」還不夠 —— 來源檔也要進版控。**
  2026-08-02（同一天內第二次同型故障）：三個新的 config 原始檔在工作區但**沒 commit**，
  `content:build` 照樣讀得到它們，把三份文件**內嵌進 `bundle.json`**、把三筆 path 寫進
  `_index.json`，而那兩個**產物**被 commit 了。於是 repo 裡出現：
  bundle 有這三份 → schema 不認得（改動也沒 commit）→ 原始檔根本不存在。
  部署走 `git pull`，所以線上拿到的正是這個組合 → 內容載入整份失敗 → 退回 2 隻骨架。
  **`shippedBundleIsCurrent` 對這個是綠的** —— 它在工作區重建，而工作區看得到未追蹤的檔。
  守衛：`packages/shared/src/content/shippedBundleHasTrackedSources.test.ts`
  —— 它比對 `git ls-files`。**出貨的是 git，不是你這台機器的工作區。**
  它紅了會指名哪幾個檔沒進版控；`git add` 它們，不要改測試。
- **`pnpm -s typecheck | grep error` 結構上永遠不會 match**（`-s` 吞掉子專案輸出）。
  一律看離開碼：`pnpm typecheck; echo "EXIT=$?"`。
  ⚠️ 同一個陷阱有**三種變形**，三種都真的騙過人：
  1. `pnpm typecheck | tail -5; echo "EXIT=$?"` → `$?` 是 **tail** 的，永遠 0。
  2. `pnpm test > log 2>&1; echo "EXIT=$?" >> log` **丟到背景**跑 →
     背景任務通知回報的是**整串包裝命令**的離開碼，而最後一個指令是 `echo`，
     所以通知永遠說 exit 0。**通知說 0 不代表測試綠 —— 一定要自己讀 log 尾巴。**
  3. `pnpm test` 全綠但 `pnpm typecheck` 紅（或反過來）—— 兩個都要跑。
- 每個任務都走 `gh issue create`；每一次 `git push` 都要帶 GitHub release note。
  ⛔ **版號一律用 `bash scripts/release.sh --tag "說明"`，不要手打 `git tag`。**
  規則是**每天一個次版號**：跨天 = minor+1、patch 歸 0；同天 = patch+1。
  ⚠️ 這條在 2026-07-27→08-05 破了 10 天（v0.9 打了 45 個 patch 卻沒翻頁），
  根因是 CLAUDE.md 以前只記了「同一天只 bump 第三段」——**跨天那一半沒寫**。
  守衛：`packages/shared/src/ops/releaseScript.test.ts`。
- 不要 `git add -A`。暫存/探測檔寫 `/private/tmp`，不要留在 repo。

---

## 🚀 部署協定（owner 2026-07-25 立，六步，缺一不可）

1. code-cut → commit（要有真的說明）→ 起草 release note
2. 確認沒有未修的 T0 / major bug
3. **在 localhost 真的打一場**，把發現記進 `docs/_execution-batches.md`
4. 重整那份文件，確認沒有讓這次更新變得不智的問題
5. `git push` + GitHub release note（同一天只 bump 第三段）
6. deploy 到 ggd.adms.ai → **開啟 console 做下面的煙霧測試** → **在線上真的再打一場**
   → 記回 `docs/_execution-batches.md`

⛔ **測試一律在 localhost 或暫存目錄，永遠不要在正式站上測。**

### ⚠️ 後置條件只驗「名詞」抓不到相容性故障（2026-08-02 第二次事故）

同一天下午又壞一次：**無法鎖定英雄**（「選擇被拒: unknown champion」）、
進場**變成體素替身而不是 3D 模型**、**商店空的** —— 而 `host-deploy.sh` 的
**四項後置條件全部是綠的**。

```
1. content bundle 英雄數 → 讀檔案 ，檔案是好的
2. 白名單英雄數          → 讀平台 ，平台是好的
3. 版本身分不是 UNSTAMPED → 讀映像 ，映像是好的
4. 帳號數 147→147        → 讀資料 ，資料是好的
```

**每一項都在驗一個「名詞」，沒有一項在驗兩個名詞之間的「關係」。**
壞掉的是「這個映像**能解析**這份內容」—— 那是一個**配對**的性質，
不可能由分別檢查每一半得到。**而部署正是兩個獨立版本化的東西相遇的那一刻。**

根因：`content/` 是 live bind-mount（跟著 `git pull` 走），映像只在完整部署時重建。
四個 config schema tag（`config.roster@1` / `boss-intro` / `item-card` / `victory-fx`）
與四組欄位（`healthDrainPctOfMax` / `yawOffsetDeg` / `fireRing.burnCurve` / `drain*`）
不在已部署映像的 Zod union 裡 → 內容載入**整份**失敗 → fail-open 退回骨架（2 隻英雄）。
三個症狀全部由此解釋：id 不在骨架註冊表 → unknown champion；骨架英雄沒 glb → 體素；
骨架沒道具 → 商店空的。

⚠️ **這條教訓上面那一段已經寫過了**（「內容與程式的版本必須一起動」），它還是發生了。
散文治不了 —— 出事的當下沒有人在讀散文，只有後置條件在跑。

**所以現在有第五項後置條件**：讀 game shard **自己的登錄表**
（`/healthz` 的 `content` 區塊，`apps/game-server/src/contentHealth.ts`）——
那是「映像裡的 Zod」真的跑過「bind-mount 上的內容」之後得到的東西。
靜態檔案伺服器會很樂意把一份客戶端解析不了的 bundle 送出去；登錄表不會。
守衛：`packages/shared/src/ops/hostDeployScript.test.ts`（兩個突變都驗過會紅）。

**加新的後置條件時要問**：它驗的是一個名詞，還是兩個名詞的關係？
只驗名詞的那一種，在相容性故障面前**必然是綠的**。

### 💡 診斷這一類故障最快的一招（實測，不碰正式站）

把**線上正在服務的那份 bundle** 抓下來，用**候選版本的 schema** 逐份驗：

```bash
curl -s https://ggd.adms.ai/content/bundle.json -o /private/tmp/prod-bundle.json
# 再用 packages/shared 的 validateDoc(collection, doc) 跑一遍
```

2026-08-02 這一招給出「1,932 份文件，失敗 0 份」，
把「我猜部署會修好」變成**部署前就量到的事實**。幾十秒有答案。

### 🔥 第 6 步的煙霧測試（30 秒，2026-08-01 事故之後補的，不准跳過）

deploy 完打開 `https://ggd.adms.ai` 的瀏覽器 console，**第一件事就是讀這一行**：

```
[client] content loaded: 119 champions (cv_xxxxxxxxxxxx) via bundle    ← 要看到這個
[client] content load failed (…); falling back to skeleton (2 champions)  ← 看到這個就是壞了
```

⚠️ **「網站打得開」不等於 deploy 成功。** 2026-08-01 那次登入頁、大廳、版本徽章
全部正常，`/content/bundle.json` 回 200、119 隻英雄、白名單 63 隻全部存在 ——
**唯一的破綻只有 console 那一行**，而後果是選人畫面整個空的、沒有人能進場。

原因是 `main.tsx` 的 fail-open：內容驗證失敗時它註冊 sela/thorne 骨架讓遊戲仍能開機
（刻意的，不讓首次繪製被內容擋住），代價是**內容全毀看起來跟正常一模一樣**。
所以那一行 log 是唯一的訊號，煙霧測試就是去讀它。

⚠️ **一定要開全新分頁。** 瀏覽器的 console 緩衝區**跨導覽保留** ——
在同一個分頁重整，舊的失敗訊息會留在新的成功訊息**上面**，看起來像還沒修好。
2026-08-02 我差點就這樣誤判成「部署沒生效」。

順手一起看：
- `GET /api/v1/curation/whitelist` → `champions` 不是 0（0 = 白名單被洗掉了）
- 版本徽章要顯示 `v0.9.xx`，不是 `v0.9.15-20-g4af1b5c1`（那代表 host 沒抓 tag）
- `GET http://127.0.0.1:2567/healthz` → `content.ok` 為 true、`replay.ok` 為 true
  （`replay.ok=false` 通常是 `data/replays` 的 EACCES，修法寫在 `host-deploy.sh` 的註解裡，
  需要 owner 用 sudo 手動跑一次 chown）

### 🤖 部署指令只有一條 —— 不要憑記憶重打

```bash
ssh -A can@34.81.104.163 'cd /home/can/GGD && bash scripts/host-deploy.sh'
```

只改 `content/` 的話加 `--content-only`（`content/` 是 live bind-mount，
client 每次載入都重抓 `bundle.json`，所以不必重建映像，只要重啟 game shard）。
想單獨重跑煙霧測試就 `--verify-only`。

**這支腳本會驗證自己的後置條件並在失敗時回非零**：content bundle 的英雄數、
白名單的英雄數、以及**版本身分不是 `UNSTAMPED-BUILD`**。守衛在
`packages/shared/src/ops/hostDeployScript.test.ts`。

### ⚠️ 它幫你擋掉的五個地雷（都真的踩過，留著是為了說明「為什麼」）

1. `ssh -A … 'nohup bash deploy.sh &'` 一次做完 pull+build **會失敗** ——
   ssh 一斷線轉發的 agent socket 就沒了，而 `git pull` 報的是誤導人的
   「correct access rights / repository exists」。**pull 在前景做完，build 才丟背景。**
2. **host 上沒有 `make`。** `make family-up` 一定失敗（非互動 ssh 的 PATH 也找不到）。
3. **`git pull` 不會抓 tag** → 版本徽章會顯示 `v0.9.15-20-gxxxxxxx` 而不是新版號。
4. **裸的 `docker compose build` 會掉版本戳。** `GGD_BUILD_STAMP` 是 Makefile
   算好再插進 compose 的 build arg；host 上沒有 make，所以直接跑 compose 會讓它是空的，
   徽章寫 `UNSTAMPED-BUILD` —— 而那是「這是哪一版」的唯一答案（task #66）。
5. ⛔ **不要跑 `family-up` 裡的 seed 步驟**（`run --rm platform -seed -starter`）——
   那會寫玩家資料。第一次建站以外一律不跑。

⚠️ **2026-08-02 的教訓：把地雷寫成清單是不夠的。** 那天同一次部署踩中了 3 與 4，
而這份清單是同一個人幾小時前寫的。散文治不了「憑記憶重新推導一個五步序列」，
**只有把它變成一支會自己驗證的程式才可以** —— 這也是為什麼上面那條指令是唯一入口。

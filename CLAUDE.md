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

**斷言要讀最終物件。** 例：`applyModelTint` 會 **clone** 材質再指回 `mesh.material`，
所以任何對原始材質物件寫的斷言，不管有沒有生效都會過
（見 `apps/client/src/render/views/mobTint.test.ts` 的檔頭）。

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
- **`pnpm -s typecheck | grep error` 結構上永遠不會 match**（`-s` 吞掉子專案輸出）。
  一律看離開碼：`pnpm typecheck; echo "EXIT=$?"`。
  ⚠️ 同一個陷阱有**三種變形**，三種都真的騙過人：
  1. `pnpm typecheck | tail -5; echo "EXIT=$?"` → `$?` 是 **tail** 的，永遠 0。
  2. `pnpm test > log 2>&1; echo "EXIT=$?" >> log` **丟到背景**跑 →
     背景任務通知回報的是**整串包裝命令**的離開碼，而最後一個指令是 `echo`，
     所以通知永遠說 exit 0。**通知說 0 不代表測試綠 —— 一定要自己讀 log 尾巴。**
  3. `pnpm test` 全綠但 `pnpm typecheck` 紅（或反過來）—— 兩個都要跑。
- 每個任務都走 `gh issue create`；每一次 `git push` 都要帶 GitHub release note。
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

順手一起看：
- `GET /api/v1/curation/whitelist` → `champions` 不是 0（0 = 白名單被洗掉了）
- 版本徽章要顯示 `v0.9.xx`，不是 `v0.9.15-20-g4af1b5c1`（那代表 host 沒抓 tag）

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

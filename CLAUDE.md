# GGD — 開發守則

> 這一份是**規則**，不是說明書。架構與現況看
> [`docs/_session-handover.md`](docs/_session-handover.md)，待辦看
> [`docs/_execution-batches.md`](docs/_execution-batches.md)。

---

## 🔧 第一守則：所有功能都做成後台可調，不要寫死

owner 2026-07-29：

> 「所有功能的開發都是以**後台彈性設定（開關、數值等參數）為主，而非寫死功能**」

**寫死才需要理由；可調不需要。** 這是預設立場，不是「有爭議時才這樣做」。

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
- 每一次 `content/` 編輯都要跑 `pnpm content:build`，否則 `bundle.test.ts` 紅。
- **`pnpm -s typecheck | grep error` 結構上永遠不會 match**（`-s` 吞掉子專案輸出）。
  一律看離開碼：`pnpm typecheck; echo "EXIT=$?"`。
- 每個任務都走 `gh issue create`；每一次 `git push` 都要帶 GitHub release note。
- 不要 `git add -A`。暫存/探測檔寫 `/private/tmp`，不要留在 repo。

---

## 🚀 部署協定（owner 2026-07-25 立，六步，缺一不可）

1. code-cut → commit（要有真的說明）→ 起草 release note
2. 確認沒有未修的 T0 / major bug
3. **在 localhost 真的打一場**，把發現記進 `docs/_execution-batches.md`
4. 重整那份文件，確認沒有讓這次更新變得不智的問題
5. `git push` + GitHub release note（同一天只 bump 第三段）
6. deploy 到 ggd.adms.ai → **在線上真的再打一場** → 記回 `docs/_execution-batches.md`

⛔ **測試一律在 localhost 或暫存目錄，永遠不要在正式站上測。**

⚠️ `ssh -A … 'nohup bash deploy.sh &'` 一次做完 pull+build **會失敗** ——
ssh 一斷線轉發的 agent socket 就沒了，而 `git pull` 報的是誤導人的
「correct access rights / repository exists」。**pull 在前景做完，build 才丟背景。**

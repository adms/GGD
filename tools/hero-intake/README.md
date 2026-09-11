# hero-intake — 新英雄上架的一條龍（模型／圖示／語音 → 一頁檢核）

> owner 2026-09-11：「我又有一批34個英雄上架中 請你做一樣的流程並且用**自動化流程（script）**的方式來執行
> **語音配對與圖示生成**」「並且同時檢查**模型對應是否有缺漏**」
> 「全部放到**一頁檢核頁面**讓我複查，這個過程**全部自動化**，只留**最後我的審查通過與否**，
> 並且**這一頁也要放到後台管理頁**」

```sh
pnpm hero:intake --batch ship34 --from <名單.json>     # 名單：["id",…]／[{id,name}]／{champions:{Sett:{ownerName}}}
pnpm hero:intake --batch ship34 --heroes lol-ahri,lol-sett
pnpm hero:intake --batch ship153 --all                 # 全部 champions
pnpm hero:intake --batch ship153 --all --check         # 材料過期就回非零（守衛在跑這一行）
pnpm hero:intake --batch ship34 --all --no-gen-icons   # ⛔ 不要順手叫本機 SD 產圖

# ⭐ 還沒進 content/champions 的英雄（正在上架的那一批）：模型在**別的 repo** 交付
pnpm hero:intake --batch ship34 --from docs/_review/material/hero-intake/ship34.list.json \
  --delivery '<…>/GGD-community-acquired-heroes/docs/_reports/community-acquired-heroes/model-delivery-summary.json'
```

⚠️ **`--check` 要打與當初一模一樣的那一行** —— 少一個 `--delivery` 會算出不同的 digest，
而「材料過期」與「你少打了旗標」長得一樣。⇒ 材料裡存了 `invocation`，`--check` 紅的時候會把它印出來。

產出 `docs/_review/material/hero-intake/<批次>.json`（⛔ **不複製圖示** —— 頁面直接讀出貨樹那一張），後台
**營運 → 🧍 新英雄上架檢核** 那一頁讀它，你只按**通過／退回**。

| 段 | 綠 | 黃 | 紅 |
|---|---|---|---|
| 🧍 模型 | glb 在工作樹，或 `content/assets-offdisk.json` 宣告位元組在 S3；`clipMap` 六格齊 | 少幾格動作／只有別的分支有／⭐ 交付表有模型但英雄還沒進 content（**順序**，⛔ 不是缺漏） | `modelKey` 指不到 model 文件／glb 沒有宣告也沒有任何分支有／⭐ 交付表**沒有模型**（0 個檔又沒有 modelKey） |
| 🖼 圖示 | `icon` 那一格的檔在 | —— | 沒有 `icon` 欄位／檔不在（⭐ 這時會叫 `tools/icon-gen/local/batch.py --only <id>` 產一張） |
| 🎙 語音 | 出貨門檻九格齊（`CATEGORIES.json.shipGate`） | 缺幾格 | 沒有語音包（⭐ 同時列出全庫的候選來源） |

## 🔑 模型交付表（`--delivery`）：一把 join key，所以它自己要先被驗過

那批英雄的模型不在這個 repo 交付，而在 `GGD-community-acquired-heroes`。
它的短名（`ptrainer` · `steve-alex` · `oyaji` · `cooking-master` · `lord-of-nightmares`）
與 GGD 的 id（`acquired-*` / `godie-*`）**不是同一套**：

| 情況 | 怎麼對上 |
|---|---|
| 去掉前綴就一樣（29/34） | 自動（`acquired-jetragon` → `jetragon`） |
| 對不上（5/34） | ⭐ **在名單檔逐位寫明** `"deliveryKey": "ptrainer"`，⛔ 不是在程式裡猜近似字串 |
| ⛔ 照順序配對 | **永遠不要** —— 順序不是 key |

⭐ **兩頭都走**：材料裡的 `delivery` 區塊記著「交付表幾列 · 對上幾列 · 哪幾列**沒有人認領** ·
有沒有哪一列**被兩位英雄認領**」，後台那一頁把它印在批次標題底下。
⛔ 只問「我這幾位查得到嗎」結構上答不出反方向 —— 而 key 漂掉正是長那個樣子。

### ⛔⛔ `files: []` 有**兩個相反**的意思

| 交付列 | 意思 | 判定 |
|---|---|---|
| 0 個檔 ＋ **沒有** `defaultModelKey` | 只有骨架來源，**動作還沒做** | ⛔ **擋上架** |
| 0 個檔 ＋ **有** `defaultModelKey` | 「沿用既有成品」——檔**本來就在這個 repo** | ⭐ 拿那把 key 去查，查得到就只是順序沒到 |

⚠️ 第一版把兩種都印成「0/0 個檔還沒進這個 repo」，⭐ 而那句話讀起來像「都到齊了」。
守衛 `heroIntakeReview.test.ts` ④ 把這條關起來（突變驗過：改成 warning ⇒ 34 位全部變成「可上架」而測試紅）。

### ⭐ 位元組的三分法（來源那一側也一樣）

`在工作樹` ／ `在別的分支或 S3` ／ `只在 git 歷史裡（被後來的合併刪掉）` ／ `哪裡都沒有` ——
⛔ 只 stat 檔案會把前三種都說成「位元組還沒交出來」。
（2026-09-11 量到 4 顆 glb 正是第三種：`7bc2fa3f8` 進來過，被一次合併刪掉。）

## 🎙 語音配對的三種命中，可信度**不一樣**

| 命中方式 | 信心 | 頁面顯示 |
|---|---|---|
| 索引自己綁的 `heroIds` | `high` | ✓ |
| 交付表的 `identityId` 命中索引**編號**（`300heroes:62`），而且名字也對得上 | `identity` | ✓ |
| 編號對上、**名字對不上** | `identity-name-mismatch` | ⚠️ 兩個名字**都印出來**讓人看一眼 |
| 只有名字包含 | `candidate` | · |

⛔ 機器不替 owner 決定「`300heroes:70` 那個叫青丘国主的，是不是漩渦鳴人」——
它只負責把**證據並排**（owner 2026-09-08：「同名匹配只是候選」）。

## ⛔ 三件它**不做**的事

1. **不裁決**：只算 `blockers`／`warnings`，通過與否是 owner 在後台按的。
2. **不落地**：通過之後把原檔搬進 `lines/`、把圖示寫進 `content/` 的仍然是那批工具
   （`tools/voice-gen/*`、`tools/icon-gen/*`），⛔ 這支不代勞 —— 兩個寫入端是「讀寫混淆」的本體。
3. **不重算**：頁面顯示的每一格都來自材料檔。⛔ 頁面自己再算一次 = 兩份真相。

## 誰寫什麼

| 東西 | 誰寫 | 住處 |
|---|---|---|
| 📦 材料 | 這支 | `docs/_review/material/hero-intake/<批次>.json` |
| 🧑‍⚖️ 結果 | owner（後台那一頁） | `docs/_review/verdicts/{local,live}.json`，id＝`hero-intake:<批次>:<英雄>` |

⚠️ **裁決綁在材料的 digest 上**：材料重跑過（模型換了、圖示重畫、語音補了），
舊裁決在頁面上標 `⟳ 已重跑` —— ⛔ 不會被靜靜算成仍然有效。守衛：
`packages/shared/src/ops/heroIntakeReview.test.ts`（突變驗過：把 `stale` 改成永遠 false ⇒ 紅）。

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
```

產出 `docs/_review/material/hero-intake/<批次>.json`（＋圖示複本），後台
**營運 → 🧍 新英雄上架檢核** 那一頁讀它，你只按**通過／退回**。

| 段 | 綠 | 黃 | 紅 |
|---|---|---|---|
| 🧍 模型 | glb 在工作樹，或 `content/assets-offdisk.json` 宣告位元組在 S3；`clipMap` 六格齊 | 少幾格動作／只有別的分支有 | `modelKey` 指不到 model 文件／glb 沒有宣告也沒有任何分支有 |
| 🖼 圖示 | `icon` 那一格的檔在 | —— | 沒有 `icon` 欄位／檔不在（⭐ 這時會叫 `tools/icon-gen/local/batch.py --only <id>` 產一張） |
| 🎙 語音 | 出貨門檻九格齊（`CATEGORIES.json.shipGate`） | 缺幾格 | 沒有語音包（⭐ 同時列出全庫的候選來源） |

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

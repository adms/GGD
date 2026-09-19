# GH#1129 圖示盤點 —— 2026-09-19（唯讀，⛔ 沒有跑任何生成）

> lane `icons-1129`。柵欄：`tools/icon-gen/**`（⛔ 不下載權重、⛔ 不跑生成）· `docs/_reports/`。
> ⭐ 本報告的每一個數字都是**今天在這棵樹上量到的**，⛔ 不是引用票文。

## ⭐ 一句話結論

⭐ **票 #1129 的兩段（A 補新的 · B 備份後重畫）都已經在別的票下執行完畢**，
⛔ 而它留下了一個**沒有任何閘看得見**的新問題：
⭐ **兩份 `_method_stamp` 實作分岔** ⇒ A 段產出的 259 張被 `batch.py` 判定成「過期」，
下一次例行批次會**重畫它們並覆蓋掉手工策劃的主體**。

---

## 1. 今天 vs 票文（09-09 快照）

| 項目 | 票文寫的 | ⭐ 今天量到 |
|---|---:|---:|
| `.method` sidecar 總數 | 1,010 | **1,578** |
| `twopass-v1`（舊 dark-fantasy） | 225 | **117** |
| `twopass-v3`（無風格 digest） | 785 | 785 |
| `twopass-v3+style:9b727fe661eb` | — | **417** ⭐ 當前戳記 |
| `twopass-v3+style:9b5032ee7e91` | — | **259** ＝ 37 英雄 ＋ 222 技能 |
| webp 總數 | 1,039 | **1,866** |

⭐ **icon 欄位斷鏈 ＝ 0**（190 champions ＋ 1,129 abilities ＋ 142 items ＋ 91 augments，
逐份解析 `icon` 欄位再確認檔案存在）。⇒ Tier 0（檔案存在＋欄位接上）**全綠**。

## 2. A 段（37 名 ＋ 222 槽 ＝ 259）⭐ 已完成

- commit `69f1300636`（09-16）：**259 張 · 0 失敗 · 32.7 分**（MPS），票號掛 **#1185 / #1205**。
- 戳記 `twopass-v3+style:9b5032ee7e91`，id 為 `community-review-NN-20260907`，
  families 精準吻合 **champions 37 ＋ abilities 222**。
- ⛔ 票文「37 名**不在** `content/champions/`」**已過期** —— 今天 37 份都在。

## 3. B 段（備份後重畫）⭐ 備份完成且**我驗過**

| 備份 | 內容 |
|---|---|
| `docs/legacy/_icons-twopass-v1_temp_20260909-152227` | 225 圖 ＋ 225 sidecar ＋ `manifest.json`（`ggd-icon-backup@1`，逐檔 sha256） |
| `docs/legacy/_icons-prefate_temp_20260909-0317` | 全庫 1,039 webp ／ 119 png ／ 1,010 sidecar |

⭐ **sha256 逐檔複驗：225/225 相符、0 不符、0 缺檔** ⇒ rollback 真的做得到。

- commit `ef60ffc023`：重畫 **107 張 · 16.5 分**；其餘 117 張是**下架內容的孤兒**。
- ⭐ **AC③「twopass-v1 ＝ 0」照字面做是錯的** —— 守衛 `iconRedrawTargetsAreLive.test.ts`
  逐張量到 117 張裡 **48 張活（全部是道具）· 69 張孤兒** ⇒ 照字面做會把 **59% 的算力**
  花在沒有人看得到的圖上，⛔ 而做完之後 AC③ 會變綠。**這條已經落地成閘。**

---

## ⛔ 4. 還缺什麼

### ⛔⛔ ① 兩份 `_method_stamp` 分岔 —— 259 張被判成過期（最重要）

| 實作 | digest 吃什麼 | 產出 |
|---|---|---|
| `batch.py:110` | stylePrompt ＋ negativePrompt ＋ loras ＋ `PASS1_FRAME` ＋ `PASS1_NEG_BASE` ＋ `PASS1_NEG_NO_CHARACTER` | `9b727fe661eb` ⭐ **當前** |
| `community_batch.py:57` | `json.dumps(**整份** icon-style.json)` | `9b5032ee7e91` |

- ⭐ 多吃了 `strength` / `pass*Steps` / `pass*Guidance` / `size`，⭐ 還吃了 **`note` 說明欄**
  —— ⛔ 改一個**註解**就會讓 259 張失效。⚠️ 而 `batch.py:125` 的說明逐字寫著
  「⛔ digest 只吃真的會改變畫面的三格」，正是為了避免這件事。
- ⭐ 少吃了 PASS 1 那三段 —— ⚠️ 而那正是 owner「圖示⛔不應該直接畫出角色」的住處。
- `content_batch.py:72` 用 `cb._method_stamp()` ⇒ 09-16 那批**繼承了分岔的那一個**。
- ⚠️ `community_batch.py:14` 的 docstring 逐字寫「同一個 `_method_stamp`」——
  ⭐ **那句話是假的**（第三守則：註解會說謊）。它是一份**複製**，⛔ 不是同一個函式。

**⭐ 後果（量到的，⛔ 不是推測）** —— `batch.py` 的範圍：
abilities 與 augments **無條件全掃**（`ability_worklist()` glob 全部 · augments glob 全部）；
champions／items 只吃 `icon-plan.json` 的 tier1＋tier2（今天 **0/0**）＋ 缺圖（今天 **0**）⇒ 0。

⇒ ⭐ 今天跑一次 `batch.py --category all` 會重畫：

| | 張數 |
|---|---:|
| abilities 過期 | 621 |
| abilities 無 sidecar（`_is_done()` 一律回 False） | 233 |
| augments（91 張全是 `twopass-v3`） | 91 |
| **合計** | ⭐ **945 張 ≈ 2.1 小時**（SD1.5 7.9 s/張） |

⭐ 其中 **222 張會覆蓋掉手工策劃的主體** —— 而 `community_batch.py:70` 自己量過：
內建 deriver 對中文名是瞎的（**34/37** 英雄退回同一張 role 圖、222 支技能只推出
**68** 個相異主體、最多的一個重複 **26** 次）。
⇒ ⭐ **這是「修好的東西會被下一次例行批次毀掉」的形狀，而沒有任何閘會紅。**

### ⛔ ② 守衛結構性失明

`packages/shared/src/content/shippedIconsAreCurrentStyle.test.ts` 只問
「這張是不是 `twopass-v1`」，⛔ **不問「是不是當前戳記」**
⇒ 712 張出貨圖示過期，而它是**綠的**。
⭐ 它回答的是「舊畫風走了沒」，⛔ 不是「今天的畫風到齊了沒」——
⚠️ 兩個問題長得一模一樣，而只有前者被量。

### ⛔ ③ 備份沒有可重跑腳本

manifest 格式很好（`ggd-icon-backup@1` ＋ 逐檔 sha256），
⛔ 但備份與還原**都是一次性手工** —— `grep` 遍 `tools/`＋`scripts/` 找不到任何一支。
⇒ 下一次 `--force` 之前要**重做一次**，而它是「覆蓋前先留底」的唯一保障。

### ⛔ ④ HITL 與「玩家看得到」（AC⑤⑥）未完成

- contact sheet 在 `docs/_reports/community37-icons_temp_20260909-1139/contact-sheet.png`（3.1 MB）
  與 `docs/_reports/community-hero-icons-20260909/`（兩份幾乎相同，後者少一份 `s3-manifest.json`）。
- ⛔ 沒有 owner 勾選紀錄；`tools/review/` 今天仍然**沒有 icon 類**。
- ⭐ commit `69f1300636` 自己逐字寫：「鏈路已接上，⛔ **未實機驗收**（選人畫面尚未看過）」。
- ⚠️ 已知品質問題（該批自己記的）：Ryu 第一版被畫成女性、Mewtwo 三版都不是本尊造型。

### ⚠️ ⑤ 票文另外兩個過期前提

- `icon-plan.json`：票文寫「✓ 手編、`sync-io` 沒登記 ⇒ 另開票」——
  ⭐ **今天它是 `iconplan:build` 的產物**（`genguard` 會擋）⇒ 那個 non-goal 已經不存在。
- 37 名的住處（見 §2）。

### ⚠️ ⑥ 管線在**這棵樹**上跑不起來（⭐ 預期之內，⛔ 不是缺陷）

`tools/icon-gen/models/` 不存在；系統 `python3` 的 `torch` / `diffusers` 皆 MISSING（`PIL` 有）。
README §6 走 `.venv/bin/python`，而 `local/models/`（2 GB）與 `.venv` 都是 gitignored。
⇒ ⭐ 權重只住開發機 —— **「可重跑」只在開發機成立，⛔ 這棵樹上驗不了**。

---

## ⭐ 5. 建議給主線的下一步（⛔ 我沒有做，也沒有挑）

1. ⭐ **先關掉分岔**：讓 `community_batch.py:57` 改呼叫 `batch.py::_method_stamp`（一個住處），
   再決定那 259 張的 sidecar 是**改寫成當前戳記**（承認它們就是當前風格畫的）
   還是**真的重畫**。⛔ 這是決策點 ⇒ 照守則要做成開關／拿給 owner 勾。
2. ⭐ 守衛②從「不是 v1」改成「**等於當前戳記**」（⛔ 但要先做完 1，否則它當場 712 紅）。
3. ⭐ 備份／還原寫成一支腳本（manifest 格式已經有了，⛔ 缺的只是驅動器）。
4. ⭐ HITL：contact sheet 進 `tools/review/` 的批次審查頁，補上 icon 類。

## ⭐ 6. 本 lane 做過什麼

⛔ 沒有跑生成、⛔ 沒有下載權重、⛔ 沒有動 `content/`、⛔ 沒有改 `tools/icon-gen/**`。
量測方式：讀 `.method` sidecar ＋ 逐份解析 `content/**/*.json` 的 `icon` 欄位
＋ 以 `keywords.load_icon_style()` **重算**當前戳記（⭐ `keywords.py` 只 import json/os/re/sys，
⛔ 不載入任何模型）＋ 逐檔複驗備份 sha256 ＋ 讀 `git log` 與 commit 訊息。

# 交付給 Codex 技能編輯器 —— 從這裡開始

> **一句話**：讀 3 份**必給**，其餘照需要。⛔ 有一份是活的端點不是文件，
> 而**定價規則目前還只是散文**（端點還沒做）—— 那一格下面明講。

最後更新：2026-08-12（v0.14.3）

---

## 1 · 必給（沒有這三樣沒辦法開工）

| # | 路徑 | 是什麼 |
|---|---|---|
| **1** | [`docs/技能編輯器引擎須知 20260811.md`](技能編輯器引擎須知%2020260811.md) | **合約本體**。⭐ 先讀**第〇章**（五層優先序階梯）—— 它決定其他每一章的答案 |
| **2** | [`docs/英雄技能第一批重製-90支.md`](英雄技能第一批重製-90支.md) | **90 支範例**：owner 原始規格 ↔ 產出 JSON **並排**，一支一節 |
| **3** | [`skill-tag-manifest.json`](../skill-tag-manifest.json)（repo 根目錄） | **139 個標籤 → `engineToken` 的機器對照**，帶 `authorWarning` |

### ⚠️ 第 3 份最容易被跳過，而跳過的代價已經量到了

那張表**早就在 repo 裡**，而 GGD 自己的產生器 **一次都沒讀它** ——
於是 `[暴走]`、`[拉扯]` 這些標籤寫在描述裡、機制**一個都沒產出**，
而且**沒有任何東西叫**（2026-08-12 的真因分析 A-3）。

它不只是對照表，還帶著**已經踩過的坑**。例：

> `[指定]` → `castType:"targeted"`
> **authorWarning**：只能指定敵人⋯把技能設成指定友軍（治療／增益）時，玩家按下去
> 不會有任何反應 —— 四條輸入路徑仍然只餵得出敵方目標。⚠️ 出貨內容裡已經有
> **13 份獨立技能文件**踩到這一格（全部是「按了什麼都不會發生」）。

⭐ **編輯器該做的第一件自動檢查就是它**：作者寫了標籤 → 查 `engineToken` →
輸出的 JSON 找不到那個 token 就標黃。

---

## 2 · 建議給（少踩坑，不給也能做）

| 路徑 | 為什麼 |
|---|---|
| [`docs/_skill-remake-batch1-真因分析.md`](_skill-remake-batch1-真因分析.md) | **8 個模板缺口的完整清單** —— 那是「一個外部作者翻譯 90 支技能會犯的錯」的**實測**名單，不是想像的 |
| [`docs/_w3x-fidelity-superseded.md`](_w3x-fidelity-superseded.md) | 第〇章第 3–5 層的具體範例：被新版取代的原作數值長什麼樣、誰在哪天裁的 |

---

## 3 · ⛔ 不要給

`_skill-mechanics-coverage-20260808.md` · `_skill-judgment-values.md` · `skill-forge-design.md`

都是**內部工作紀錄**，而且部分已經過期（08-08 的機制盤點在 A 類修完後不準了）。
給了只會製造**第二個真相來源** —— 那正是第〇章要防的事。

---

## 4 · ⭐ 活的端點 vs 會過期的散文

第〇章明寫了：**權威是端點，不是文件。** 現況要講清楚，因為兩者混在一起最危險。

### 已經在跑（打它，⛔ 不要抄文件）

```
GET  <content-api prefix>/capabilities            # 引擎能做什麼（從出貨註冊表推導）
GET  <content-api prefix>/active/target-profile
GET  <content-api prefix>/health
```

`capabilities` 回 `ggd-runtime-capabilities@1`，內容全部是**推導**的：
`effectKinds` / `hookEvents` / `conditionLeafKinds` / `effectFields` / `templateFamilies`
＋ 每一筆 planned capability 的 supported / partial / unsupported ＋ `KNOWN_BROKEN`。

⭐ 它有 `fingerprint` —— 拿它 pin base，引擎一變你就知道。

### ⛔ **還不存在**：`GET /authoring-rules`

第九章承諾的定價合約端點（MP 公式係數、冷卻的硬界／原則界、規則清單）
**還沒實作**（GH#313 / #314）。

**所以現在的實際狀況：**

| 你要的東西 | 從哪拿 | 會過期嗎 |
|---|---|---|
| 有哪些 effect kind / hook / 條件葉 | `GET /capabilities` | ❌ 活的 |
| 標籤 → engineToken | `skill-tag-manifest.json` | ⚠️ 檔案，但有守衛在對帳 |
| **MP 公式、冷卻界線** | **第九章的散文** | ⚠️ **會**。端點做好前這是唯一來源 |
| 90 支的 JSON 範例 | 第 2 份文件 | ❌ 有守衛（見下） |

---

## 5 · 那兩份文件不會無聲過期（有閘）

`docs/英雄技能第一批重製-90支.md` 與 `技能編輯器引擎須知` §13.10 **都是生成的**：

```bash
python3 tools/skill-remake/refresh_docs.py          # 重生成
python3 tools/skill-remake/refresh_docs.py --check  # 過期就回非零
```

守衛：`packages/shared/src/ops/skillRemakeDocsFresh.test.ts`（真的把腳本跑起來）。

⚠️ **這條守衛是踩過坑才有的**：2026-08-12 產生器修了 8 個缺陷、90 支 JSON 全變了，
而 §13.10 還貼著舊的 —— 而那正是 Codex 會照著抄的東西。

⛔ **所以不要手改那兩份文件**（包括覺得哪裡寫錯的時候）。改產生器，然後重跑。

---

## 6 · 交付前對一次

- [ ] 三份必給都給了，而且 **`skill-tag-manifest.json` 沒有漏**
- [ ] 講清楚 **`/capabilities` 是活的、第九章的定價是暫時的散文**
- [ ] 講清楚 **第〇章的五層階梯**是衝突時的唯一判準，而且
      「可以停就列表確認、不能停就做成開關（**預設走高層級**）」
- [ ] 講清楚 **測試只做預設啟動的那一邊**（不需要全做選項）

---

## 7 · 這份文件本身

⚠️ 它是**手寫**的（不像上面那兩份是生成的），所以它**會**過期。
改了給 Codex 的清單就回來改這裡 —— 或者更好：等 `/authoring-rules` 做好之後，
把第 4 節那張表換成「打端點」，讓這一份只剩「哪三個檔」。

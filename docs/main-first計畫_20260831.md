# main-first 計畫（2026-08-31）

> owner 逐字：「**不用管 codex branch，以遊戲主程式 main 為主，我再讓 codex 配合**」

⭐ 這一句把整件事翻過來了：
在此之前的問題是「**分支怎麼追平 main**」，現在是「**main 往前走，Codex 跟著 main 的契約做**」。

---

## 0. ⭐⭐ 地盤：誰做什麼（owner 2026-08-31 第二則裁決）

> 「`feat/ability-review-authoring` 是 **codex 的 branch**，你可以**參考思路**，
>  但**獨立編輯器 桌面版 Electron 還是 codex 的獨立工作**喔」

⇒ ⭐ 這一句把我的範圍**從 29 項縮到 10 項**。

| 目錄 | 誰的 | 我可以做什麼 |
|---|---|---|
| `apps/editor/**`（main 上 78 檔） | ⭐ **Codex** | ⛔ 不動。⭐ 可以**參考思路** |
| `apps/editor-desktop/**`（Electron） | ⭐ **Codex** | ⛔ 不動 |
| `packages/shared/**`（引擎 · schema · sim） | ⭐ **main** | ⭐ 做 |
| `apps/client` · `apps/game-server` · `apps/admin` | ⭐ **main** | ⭐ 做 |
| `apps/content-api/**` | ⭐ **main** | ⭐ 做 —— ⚠️ 它跑 main 的 Zod、寫 main 的 `content/`，最近的 commit 是 #327／#278 |
| `content/**` | ⭐ **main** | ⭐ 做（⚠️ 621 份是產物，先 `genguard`） |
| `docs/editor-contract/**` | ⭐ **產生的** | ⛔ 不手改 —— `pnpm caps:export` ／ `pnpm editorcov:build` |

### ⭐ 扣掉 Codex 的地盤之後，**我要重做的只剩 10 項**

| 層 | 項 | 是什麼 |
|---|---:|---|
| **content-api** | **7** | 遠端 Base 釘住 · 寫入白名單 origin · `editor-source` 端點 · authoring 側車 · 素材讀穿快取 · 別名路由 · 一條新守衛 |
| **authoring 模型層** | **2** | ⭐ **模板／Product 的精確引用鎖**（`{id, revision, contentSha256}`）· sidecar 的五層權威階梯 |
| **匯入／封包** | **1** | `contentSha256` 的 wire format（`sha256:` 前綴）—— ⭐ 分支唯一的真修 |

⛔ **編輯器 App 的 23 項與 Electron 的 4 項：不在我的清單上。**
⭐ 而它們的比對結論（🔴 7 項 main 較優、🟢 15 項分支較優）**仍然是有用的資訊** ——
⇒ 那是給 Codex 的，寫進交接文件。

---

## 0.5 ⭐ 一句話的決定

| | |
|---|---|
| ⛔ **不合併** `origin/feat/ability-review-authoring` | 落後 **1,186 個 commit**，且 **38/97 項合過來會退步** |
| ⭐ **29 項「分支較優」在 main 上重做** | ⛔ 用 main 的既有機制，⛔ 不是複製分支的程式碼 |
| ⭐ **分支留著不刪** | 零成本備份 ＋ 重做時的參考。⛔ 而它**不是** base |

---

## 1. ⛔ 為什麼**不能**合 —— 四個已經證實的陷阱

### ⛔⛔ ① `config.authoring-rules@1` —— 合過去會**造成生產故障**

兩份文件用**同一個 schema tag** 宣稱自己是同一份設定，而 main 的 Zod 是 `.strict()`。

⇒ ⭐ 合過去 ⇒ **內容驗證整份失敗** ⇒ fail-open 退回 **2 隻骨架英雄**，
⚠️ 而網站看起來完全正常（大廳、版本徽章、`/content/bundle.json` 全部 200）。

⭐ **那逐字就是 2026-08-02 生產故障的形狀。**

⇒ ⭐ **推論到整個計畫**：在 main 上重做那 29 項時，
⛔ **一律不可以改既有 `config.*@1` 的欄位形狀** —— 要加就加**新的 tag**。

### ⛔ ② `effectGraph.ts` 是 `expand.ts` 的第二個住處

| | main | 分支 |
|---|---|---|
| 做同一件事的東西 | `content/templates/expand.ts` **2,490 行** | `compileEffectChain` 493 行 |
| 出貨採用 | ⭐ **84/422 支**技能帶 `template:{ref,params}` · 47 份 `content/ability-templates/` | ⛔ 0（localStorage-only） |
| 模板升級傳播 | ⭐ 註冊時重展開 ⇒ 改模板 = 每一支跟著動 | ⛔ `delete candidate.template` —— **刪掉那個欄位** |

⇒ ⭐ 合它 = **第〇·四守則的第二個住處** ＋ **刪掉模板升級自動傳播**。

⚠️ ⭐ 誠實地說分支寫得好的三件事：**exact-ref pin · typed error code · 輸出上界**
—— ⭐ 而那是「**幫 `expand.ts` 加這三樣**」，⛔ 不是「換一個編譯器」。

### ⛔ ③ `PreviewController.ts` —— 整檔覆蓋會**推翻三個 commit**

main **1,157 行** > 分支 **997 行**。⭐ 少掉的 160 行**正是 main 這 16 天做的 9 個 effect case**
（`74d9b9b43` / `b2a839175` / `25853f244`，每一個都帶票號與 owner 原話）。

⚠️ ⭐ 而 switch 底部有 exhaustiveness tripwire ⇒ **至少它不是靜默的**（會編譯紅）。

### ⛔ ④ 分支把稽核接上 save 按鈕 ⇒ **62.7% 的技能存不進去**

實測：分支的 `auditSkillDescription` 跑過 main 出貨的 421 支 ⇒ **264 支至少一個 error**。
⇒ 改一格特效顏色也會因為第一行寫著 `[主動攻擊]` 而存不下去。

⭐ 而 main 的 `authorWarnings.ts` 檔頭逐字寫著 owner 2026-08-12 的原話：
「**只是個警告標記，並不會擋**」。

---

## 2. ⭐ 編輯器那 49 項的實況

| 層 | 項 | 🟢 分支較優 | 🟡 各一半 | 🔴 **main 較優** |
|---|---:|---:|---:|---:|
| **編輯器 App** | 23 | 12 | 4 | **7** |
| **authoring 模型層** | 9 | 1 | 1 | **7** |
| **content-api** | 10 | 6 | 1 | **3** |
| **匯入/封包** | 3 | 1 | 0 | **2** |
| **桌面版 Electron** | 4 | 3 | 0 | **1** |

⇒ ⭐⭐ **`authoring/` 那 9 項裡 7 項 main 較優** —— 而那正是我原本在計畫裡稱為「核心」的東西。
⚠️ ⭐ 一個我自己的教訓：**行數多 ≠ 功能多**（296 行的工作台 vs 964+2,490 行的 ForgeStudio）。

⭐ 而值得撿的集中在**兩個地方**：**content-api（6 項）** 與 **桌面版 Electron（3 項，main 上 0 個檔）**。

---

## 3. ⭐ 施工計畫 —— 四個階段

### **P0 —— 安全（⛔ 這一段與編輯器無關，而它今天就在玩家的開機路徑上）**

⭐ 對抗式稽核量到三項，⛔ 其中一項已修：

| # | 缺口 | 狀態 |
|---:|---|---|
| ① | 巢狀 600 層 ⇒ `RangeError` **逃出隔離** ⇒ 全站退回 2 隻骨架 | ✅ **已修** `1a11df513`（深度上界 12 ＋ loader 兜底）|
| ② | `maxQuarantined=50` ⇒ **51 份壞文件**也殺全站 | ✅ **已修** `85cea5fd1`（分辨集中／散落）|
| ③ | **245/861 個 `z.number()` 沒有 `.max()`**（160 個收 `Infinity`）| ⛔ **未修** |
| ④ | `checkZipSafety` **零呼叫端** ＋ importer 三路由全 501 | ⛔ **未修**（⚠️ 而它是 UGC 的前提）|

⇒ ⭐ ③④ 是 **P0，⛔ 不是 P2** —— `ContentPage.tsx` 的 edit/save 今天就寫得進 `content/`。

### **P1 —— 在 main 上重做那 **10** 項**（⛔ 不是 29 —— 扣掉 Codex 的地盤）

⭐ 工作量分佈（已量）：**很小 5 · 小 13 · 中 10 · 大 1**

⚠️ ⭐ 三條**施工守則**（每一條都是上面陷阱的直接後果）：

1. ⛔ **不可以改既有 `config.*@1` 的欄位形狀** —— 要加就加**新的 tag**（陷阱①）
2. ⛔ **不可以整檔覆蓋** —— 逐段合，而且先讀 main 那一版今天長什麼樣（陷阱③）
3. ⛔ **警示不擋存檔** —— owner 2026-08-12 逐字：「只是個警告標記，並不會擋」（陷阱④）

### **P2 —— 對外契約（⭐ 這是「Codex 配合」的介面）**

⭐ main 已經產出兩份機器可讀的契約：

| 檔 | 是什麼 | 指令 |
|---|---|---|
| `docs/editor-contract/ggd-runtime-capabilities.json` | 引擎能做什麼（46 kinds · 260 欄位 · 33 hooks）| `pnpm caps:export` |
| `docs/editor-contract/ggd-editor-coverage.json` | ⭐ **編輯器必須實作的 450 項**（＋15 項明確不必）| `pnpm editorcov:build` |

⇒ ⭐ **Codex 讀那兩份 JSON，⛔ 不讀任何一份 md 裡的表格**（那些會過期）。

### **P3 —— UGC 那一層**（⛔ 既有計畫完全沒有）

身分 · 投稿 · 審核 · 發現 · ⭐ **對抗性測試**（⛔ 而它要排在**開放投稿之前**）。

---

## 4. ⚠️ 這份計畫**還缺的量測**（⭐ 正在跑，10 個 agent）

| 面 | 為什麼缺 |
|---|---|
| 追平清單的數字 | ⚠️ 上一輪稽核**連線中斷** |
| UGC 計畫的數字 | 同上（⭐ 而它已經被我改過兩次 ⇒ **更正本身也要驗**）|
| repo 陷阱 | ⭐ 問題變了：不再是「Codex 會踩到什麼」，是「**在 main 上重做會踩到什麼**」|
| 分工 | ⭐ 方向反過來了 ⇒ 要重寫 |
| **29 項的可行性** | ⭐ 每一項要判 `rebuild-now` / `rebuild-later` / `already-on-main` / `drop` |

⇒ ⭐ 結果回來後這份計畫會更新，⛔ 而上面的**決定與四個陷阱不會變**（它們已經證實）。

---

## 5. ⭐ 我建議的下一步（⛔ 你點頭才動）

| 順 | 做什麼 | 為什麼是它 |
|---:|---|---|
| **1** | **P0 的 ③④**（245 個無上界欄位 · zipSafety 接線）| ⭐ 今天就在玩家的開機路徑上，⛔ 與編輯器無關 |
| **2** | **29 項裡工作量「很小／小」的 18 項** | ⭐ 便宜、風險低、立刻有用 |
| **3** | 給 Codex 的**開發計畫**（照 P2 的兩份 JSON 寫）| owner：「我再讓 codex 配合」|
| **4** | P1 的中／大項 | ⭐ 要先有 1–3 的地基 |

⛔ 而**合併分支**這件事：**不做**。⭐ 分支留著當參考與備份。


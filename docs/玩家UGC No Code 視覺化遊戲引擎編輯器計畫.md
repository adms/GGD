# 玩家 UGC · No Code 視覺化遊戲引擎編輯器 —— 全盤計畫

> ⭐ 這一份是**計畫**，⛔ 不是願景。每一個數字都是 2026-08-30 量到的，
> 每一個「還沒有」都指得到一個檔案或一條指令。

---

## 0. 這份計畫存在的理由 —— owner 的兩句話

owner 2026-08-30（逐字）：

> 「我的傾向是 **開放讓玩家自己設計 英雄、技能、特效**，
>  ⛔ 不是靠 **AI 無止境的逼近** 太沒效率」

> 「所以**後台編輯器的抽象化、完整性、視覺化可操作性很重要**，
>  因為**所有功能都要可 JSON 操作設定**，並且也有 **no code 遊戲引擎等級的操作介面**」

⇒ ⭐ 這兩句話**換掉了「做完」的定義**：
在此之前的目標是「**把 461 支技能做得像原作**」，
現在的目標是「**玩家做得出我們沒想過的東西**」。

⚠️ ⭐ 而那不是同一件事的延伸 —— 它是**相反方向**的工程：
前者要的是**逼近一個已知答案**，後者要的是**表達力與安全邊界**。

---

## 1. ⭐ 現況：三個量到的數字

| 你要的 | 量到的 | 判讀 |
|---|---:|---|
| **抽象化** | 模板家族 **26 個**服務 **421 支**技能 ⇒ 一個家族 **16 支** | ⭐ **體質是好的** —— 第〇·五守則落實了 |
| **完整性** | effect kind **46** · 欄位 **260** · hook **33** · aura 欄位 **8** · ability 欄位 **38** | ⭐ 引擎表達力**很厚** |
| | ⛔ 條件葉 **只有 5 種** | ⚠️ ⭐ **而條件葉是「不寫 if」的唯一出口** |
| | 契約誠實記著 unsupported **15** · planned **61** · knownBroken **1** | ⭐ 路線圖**已經量出來了** |
| **視覺化可操作性** | ⚠️ 見下面的**更正** | ⭐ 洞在**別的地方** |

### ⛔⛔ 更正（2026-08-30，⭐ 我自己的量測錯了）

> 本文件第一版寫：「後台編得到 **3/46** 種 effect ＝ **6%**」。
> ⛔ **那個數字量錯了分母。**

⚠️ 我的算法是「`apps/admin/src/configForms/specs/*.ts` 的原始碼裡出現過幾個 effect kind 名字」
—— ⛔ 而 `configForms` 是給 **`config@1` 設定文件**的表單引擎，**它本來就不管 effect**。
⇒ ⭐ 那是**掃字串代替行為**（失敗形態⑥），量的不是「後台編不編得到」。

### ⭐ 重量之後的真相（⛔ 更難也更好）

| | |
|---|---|
| `apps/admin/src/ui/ContentPage.tsx` | ⭐ **是一個通用內容編輯器** —— browse / view / **edit / save** 英雄・技能・道具，⇒ 它**編得到 `effects` 陣列** |
| `apps/admin/src/ui/AbilityLayersEditor.tsx`（411 行） | ⭐ 特效堆疊編輯器：631 份 vfx 模板可搜尋可篩、疊多層、層數上限看得見 |
| ⛔ **而它們 DEV-ONLY BY CONSTRUCTION** | 只透過 `import.meta.env.DEV` 守著的動態 import 進得去 ⇒ ⭐ **正式 build 裡它們不存在**（⛔ 不是隱藏，是 absent） |
| 守衛 | `apps/admin/src/contentGate.test.ts` —— **19 條**，含一條真的跑 `vite build` 再 grep `dist/` |

⇒ ⭐⭐ **瓶頸不是「要再做 43 個表單」，是那個編輯器上不了正式 build** —— 而它有票：**GH#730**。

### ⭐ 而它安全性設計得很好（值得留著，⛔ 不要重寫）

`ContentPage` 的檔頭逐字寫了三件事讓內容編輯器**安全**：
① 存檔是**兩步**（先看 leaf-level diff，再確認寫入）
② 伺服器在動任何位元組**之前**先快照舊的
③ diff 底下就是 undo 清單 —— ⭐ **做壞編輯的那一頁，就是還原它的那一頁**

⚠️ 它的理由逐字是「**this repo has none [version control] and has already lost irreplaceable files once**」
—— ⭐ 那正是 UGC 需要的形狀。

### ⭐ 所以真正的判讀

| ⛔ 第一版說的 | ⭐ 重量之後 |
|---|---|
| 後台編得到 6%，要再做 43 個表單 | 後台**編得到**，⛔ 而它**不在正式 build 裡**（#730）|
| 缺的是 UI 套件 | 缺的是 ① 上正式 build ② 從**裸 JSON** 變成**結構化表單** ③ 玩家那一層 |

---

## 2. ⭐⭐ 而有一條分支已經做掉了大半 —— `feat/ability-review-authoring`

### 2.1 它是什麼（量到的）

**9,267 行 · 74 個檔**，⛔ 不是「一個技能編輯器」——是**整套 UGC 工具鏈**：

| 層 | 檔 | 行 |
|---|---|---:|
| **效果圖模型** | `packages/shared/src/content/authoring/effectGraph.ts` | 493 |
| | `abilityAuthoring.ts` · `authoringRules.ts` · `itemAuthoring.ts` | 416 |
| **編輯器 App** | `apps/editor/src/forge/EffectGraphWorkbench.tsx` | 296 |
| | `preview/PreviewController.ts` · `preview3d/AbilityCombatPanel.tsx` | 380 |
| | `export/packageBuilder.ts` ＋ `ExportCenter.tsx` | 630 |
| | `skillReview.ts` · `abilityAudit.ts` · `authoringPolicy.ts` | 513 |
| **桌面版** | `apps/editor-desktop/`（Electron ＋ `remoteWorkspace.ts` 676 行） | ~1,200 |
| **伺服端** | `apps/content-api/`（import routes · remote asset proxy） | ~280 |
| **契約** | `content/config/authoring-rules.json` ＋ 兩份 md | — |

⭐ 它的里程碑 **M0–M6 幾乎全部 `[x]`**。

### 2.2 ⚠️ owner 的擔心：「契約已經很久沒有更新，格式可能是過時的」

⭐ **量過了，而且答案是兩半：**

| | 分支 | 今天 | 變化 |
|---|---:|---:|---|
| 基線 commit | `9e5cc3785` | main | ⛔ **落後 1,186 個 commit** |
| content 版本 | `cv_3a0dbeda0f4d` | `cv_736640f5dba5` | ⛔ 不同 |
| 能力指紋 | `8d30566f` | `f3f4185c` | ⛔ 不同 |
| **effectKinds** | 37 | **46** | **+9 / −0** |
| **effectFields** | 190 | **260** | **+70 / −0** |
| **hookEvents** | 19 | **33** | **+14 / −0** |
| **abilityFields** | **0** | **38** | ⭐ 全新區塊 |
| **auraFields** | **0** | **8** | ⭐ 全新區塊 |
| **templateFamilies** | 17 | 26 | +9 / −0 |
| **conditionLeafKinds** | 5 | 5 | **±0** |
| planned | 28 | 61 | +38 / **−5** |

⇒ ⭐⭐ **每一個能力區塊都是 `−0`：契約沒有 breaking change。**
唯一的 `−5` 在 `planned`，而那 5 項是**被做出來了**才離開待辦
（`delayed-sequence` · `execute` · `proxy-cast` · `consume-policy` · `on-ability-hit`）。

### ⭐ 結論：**那條分支落後的是涵蓋率，⛔ 不是格式**

⇒ ⛔ **不要丟掉重寫。** 正確動作是**追平**：

1. rebase 到今天的 main（⚠️ 1,186 個 commit，會有衝突，⛔ 但形狀不變）
2. 補 **+9 kinds / +70 fields / +14 hooks** 的 UI
3. ⭐ 補**兩個全新區塊**：`abilityFields`(38) 與 `auraFields`(8) —— 編輯器今天**完全沒有**這兩層

⚠️ ⭐ 而 `effectGraph.ts` 是 `zEffectDef.safeParse` 推導的 ⇒ **schema 一改它就跟著走**，
⛔ 不是一張寫死的清單。那是它值得留下來的最大理由。

---

## 3. ⭐⭐ 真正缺的那一半：**玩家**

⚠️ ⭐ 既有計畫（`EDITOR_IMPLEMENTATION_PLAN.md`）逐字搜尋的結果：

| 詞 | 出現次數 |
|---|---:|
| 玩家 · UGC · 分享 · 審核 · 權限 · 帳號 · 上傳 · 社群 · moderation | ⛔ **全部 0 次** |

⇒ ⭐ **它是一份「我／Codex 拿來做 461 支技能」的作者工具計畫，⛔ 不是 UGC 計畫。**

### ⭐ UGC 多出來的五層（⛔ 一層都不能省）

| 層 | 問題 | 今天 |
|---|---|---|
| **① 身分** | 這份內容是誰做的？ | ⛔ 編輯器是單機的，沒有作者概念 |
| **② 發佈** | 做完怎麼進遊戲？ | ⚠️ **匯出 ZIP 有了**（deterministic ＋ 17 條 importer 守衛），⛔ **遊戲端 activation 沒有**（M5 的三項 `[ ]`）|
| **③ 審核** | 誰擋掉壞的／惡意的？ | ⚠️ **#664 的分層漏斗有 12 commit**，⛔ 而它是為**素材**設計的，不是為玩家內容 |
| **④ 發現** | 玩家怎麼找到別人做的？ | ⛔ **零** |
| **⑤ 安全邊界** | 玩家能不能做出壞掉遊戲的東西？ | ⭐ **這一層意外地強**：`effect-graph-v1` 是 typed、⛔ 禁止任意 script；schema 有上下界；importer 有 zip bomb／path traversal 守衛 |

⭐ **⑤ 是好消息**：這個專案從第一天就把「所有功能可 JSON 設定」當守則，
⇒ ⭐ **UGC 的安全模型本來就存在** —— 玩家寫的是**資料**，⛔ 不是程式。

---

## 4. ⭐ 里程碑（⛔ 不是版次 —— 每一項都有可檢查的驗收）

### **P0 —— 追平（讓那 9,267 行回到 main）**

| # | 做什麼 | 驗收 |
|---:|---|---|
| P0-1 | `feat/ability-review-authoring` rebase 到今日 main | `pnpm test` 綠、`content:build` EXIT 0 |
| P0-2 | 補 `abilityFields`(38) ＋ `auraFields`(8) 兩個新區塊的 UI | ⭐ 編輯器打得開一支帶 aura 的技能並改得動 |
| P0-3 | 補 +9 kinds / +70 fields / +14 hooks | ⭐ **覆蓋率閘**：`editorCapabilities` 宣告 supported 的每一項，編輯器都要有欄位 |

⚠️ ⭐ **P0-3 的驗收要是一條會紅的測試，⛔ 不是「看起來都在」** ——
契約已經是機器可讀的（`ggd-runtime-capabilities.json`），⇒ 覆蓋率算得出來。

### **P1 —— 讓做出來的東西進得了遊戲**（＝ GH#736，今天 **0 commit**）

| # | 做什麼 | 為什麼 |
|---:|---|---|
| P1-1 | **staging validate → CAS apply → rollback** | M5 的三個 `[ ]`。⭐ 沒有它，匯出的 ZIP 是死的 |
| P1-2 | **game-server 熱載**（admin 編 → server 換 → client 看得到） | ⭐ 這是 #736 的正文 |
| P1-3 | **render bridge**（M4 的 `[ ]`） | 逐事件對帳，⛔ 讓預覽與實戰真的一致 |

⭐ **P1 是整條鏈上唯一零進度、而且卡住其他每一項的一段。**

### **P2 —— 玩家那一層**（⛔ 既有計畫完全沒有）

| # | 做什麼 | 判準 |
|---:|---|---|
| P2-1 | **作者身分**：每一份 UGC 綁一個帳號 | ⭐ 平台已有 147+ 帳號與 `admin-audit`，⛔ 不必新做認證 |
| P2-2 | **投稿流程**：編輯器 → 上傳 → 待審佇列 | ⭐ 復用 `#664` 的分層漏斗（Tier0 機器擋 / Tier1 界線 / Tier2 人審）|
| P2-3 | **審核頁**：批次、鍵盤快捷、一鍵否決＋原因 | ⭐ `asset-review.html` 已經是這個形狀 |
| P2-4 | **發現**：列表 · 標籤 · 熱門 · 作者頁 | ⛔ 零 —— 但它是最簡單的一段 |

### **P3 —— no code 的最後一哩：條件葉 5 → N**

⚠️ ⭐ 條件葉是**玩家能表達的邏輯**的上界。今天只有 5 種。

⇒ ⭐ 這一項**刻意排最後**，因為它會**定義**玩家的表達力，
⛔ 而那個決定不該在 unsupported 15 / planned 61 還沒收斂時做。

---

## 5. ⭐ 開源選型（2026-08-30 從 npm 查的現況，⛔ 不是憑記憶）

### 🟢 建議採用

| 套件 | 版本 · 授權 · 最後更新 | 用在哪 | 為什麼 |
|---|---|---|---|
| **`@xyflow/react`** | 12.11.5 · MIT · 2026-08-25 | 效果圖 / 鏈編輯 | React 節點編輯器的事實標準。⭐ 「no code 遊戲引擎等級」那個感覺**就是節點圖**。⚠️ 而 `EffectGraphWorkbench.tsx` 今天是自己畫的 ⇒ 換掉它是**減法** |
| **`@babylonjs/inspector`** | 9.23.0 · Apache-2.0 · 2026-08-27 | 即時預覽 ＋ 粒子編輯 | ⭐ **admin 與 editor 都已經有 `@babylonjs/core`** ⇒ 同團隊、同版本線、零阻抗。⚠️ 內建**粒子系統編輯器**＝ #838 特效工坊要的東西 |
| **`blockly`** | 13.2.1 · Apache-2.0 · 2026-08-11 | 條件葉（P3） | ⭐ 積木式邏輯是**非程式設計師真的用得起來**的唯一形式 |

⚠️ **版本落差**：client 是 Babylon **7**，inspector 只有 **9.x**。
⇒ ⭐ `apps/editor` 是獨立 app，可以自己吃 9.x（⛔ 不共用 client 的場景程式碼）。

### 🔴 建議**不要**

| 套件 | ⛔ 理由 |
|---|---|
| `@autoform/react` · `@rjsf/core` · `uniforms`（Zod→表單） | ⭐ **引擎已經有了** —— `configForms` 從 Zod 推導 **74 份** config 的表單。⛔ 引進第二套 ＝ 第二個住處（第〇·四守則）|
| `@theatre/studio`（時間軸） | ⛔ **AGPL-3.0** —— 會傳染整個 GGD。⚠️ 且兩年沒更新（2024-05）|
| `litegraph.js`（ComfyUI 那個） | 兩年沒更新（2024-01）· canvas 原生 ⇒ 與 React 整合要自己寫 |
| `leva` / `tweakpane` | 好東西，⛔ 但 Babylon Inspector 已涵蓋且看得到 3D 結果 |
| `rete` | 可以，⛔ 但 React Flow 生態大得多、更新更勤 |

---

## 6. ⚠️ 這份計畫**誠實的界線**

| 我知道的 | ⛔ 我還不知道的 |
|---|---|
| 分支有 9,267 行且 M0–M6 幾乎全 `[x]` | ⛔ 那些 `[x]` **我沒有一條一條驗過** —— 依第二守則，一個 `[x]` 不等於一條會紅的守衛 |
| 契約是 `+N / −0`（沒有 breaking change） | ⛔ **rebase 1,186 個 commit 的實際衝突量沒有量過** |
| 條件葉只有 5 種 | ⛔ 玩家**想表達什麼**沒有資料 —— 那要等第一批 UGC 進來才知道 |
| 安全模型（typed graph，⛔ 無 script）很強 | ⛔ **沒有做過對抗性測試**：一個惡意作者能不能做出讓 sim 爆掉／變超慢的內容？ |

⭐ 而最後那一格是 P2 之前**必須**回答的 —— ⛔ 開放投稿之後才發現就太晚了。

---

## 7. ⭐ 給 owner 的三個決策點

1. **那條分支要不要 rebase 回 main？**
   ⭐ 我的建議：**要**。它落後的是涵蓋率不是格式，而重寫要幾週。
2. **P1（遊戲端 importer / activation）要不要排在 P0 之前？**
   ⭐ 我的建議：**不要**。⛔ 沒有 P0-3 的覆蓋率，玩家做出來的東西只碰得到一部分引擎。
3. **⚠️ 對抗性測試要不要在開放投稿前做？**
   ⭐ 我的建議：**要**，而且它應該是 P2 的**第一項**，⛔ 不是最後一項。

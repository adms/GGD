# 世界演出 —— 七件同型的事，一張表（lane C，2026-08-23）

## ⭐ 那張表長什麼樣

| | |
|---|---|
| **住哪** | `content/config/world-cues.json`（`config.world-cues@1`） |
| **幾列** | **6 列** —— `point` 5 列 + `line` 1 列 |
| **K 個模板** | **K = 2**：`worldCuePoint()`（一個座標上的一次性爆發）· `worldCueLine()`（兩端之間的一道掃過） |
| **每列幾格** | 點 6 格（`enabled` · `heavy` · `heightY` · `tintR/G/B`）／線 7 格（`enabled` · `power` · `lifeMs` · `heightY` · `tintR/G/B`） |
| **三個住處** | `content/config/world-cues.json` ＋ `DEFAULT_WORLD_CUES`（Zod）＋ `WORLD_CUES_SPEC`（admin「世界演出」頁，37 格中文標籤） |

⛔ **`VfxSystem.handleEvent` 裡沒有任何一個新的事件名。** 分派是 `default:` 裡的兩次表查詢
（具名 `case` 永遠贏這張表 —— 哪天某一則需要專屬邏輯，寫一個 `case` 就自動接管，
⛔ 不會變成兩個地方各畫一次）。⭐ 加第七列不必動程式一行。

## 七筆的判決

| 事件 | 判決 | 演出 |
|---|---|---|
| `mobSpawn` | ✅ **接**（`point`） | 貼地一小團土色，**輕**。⚠️ 第 9 回合一波 20 隻同時破土，重版會變成一堵牆 |
| `summonSpawn` | ✅ **接**（`point`） | 術式紫、腰高、**重**（憑空多一個打手值得被看到） |
| `summonDespawn` | ✅ **接**（`point`） | 同色系但**輕** —— 消失不該比出現更響 |
| `deathWardSpawn` | ✅ **接**（`point`） | 貼地暗夜紫、**重**。⭐ 黑圈本身仍由 `NightFlagView` 從快照畫（半徑只有一個住處），這裡只做插旗那一拍 |
| `guardianSleep` | ✅ **接**（`point`） | 琥珀色、輕。⚠️ payload 逐字只有 `{ id }` ⇒ 座標走模板的第二條路 `entityPos(id)` |
| `damageLine` | ✅ **接**（`line`） | 荊棘綠、腰高、220 ms。⛔ 只做**線本體**；指示器幾何是 lane B |
| `guardianSpawn` | ⛔ **豁免** | 見下 |

### `guardianSpawn` 的豁免（`WORLD_CUE_EXEMPTIONS`）

> 守護者是**回合開場就存在**的中立雕像，身體下一個快照就會出現並由 `views` 畫出來。
> 在**沒有人在看的那一刻**（開場讀秒、鏡頭還在飛）放一團煙，玩家看不到，而它會跟開場演出搶畫面預算。
> 玩家真正需要看到的那一拍是**甦醒**（`guardianWake`），而那一則今天就有消費端。
>
> **什麼時候該失效**：守護者哪天改成回合中途才降臨（第 N 回合刷新／被技能召喚），
> 這條理由當場作廢 —— 那時它就變成一次玩家在看的出現，要接進 `point` 表。

⛔ **沒有從 `eventFanout` 白名單移除**：replay / 音效 / 分析仍讀得到「這一場有守護者」。

## ⭐ 最重要的一個發現：那條守衛的**普查範圍**是手打的

`performanceEventsHaveConsumers.test.ts` 舊版只問「`PERFORMANCE_EVENTS` 這**四個手打的名字**
有沒有 `case`」。⇒ 同一天的窮舉稽核抓到七則同型的零消費端事件時，**它是全綠的**。

⭐ 手打的清單只證明「清單上的東西有做」，⛔ 它證明不了「沒有東西被漏掉」。

⇒ 新版的普查範圍是 `FANNED_OUT_EVENT_TYPES` **整份 76 則**，每一則必須落在三格之一
（有消費端／在表上／在豁免表上），⛔ 沒有第四格。**加第八個而不做選擇 → 紅。**

⚠️ **量到的**：76 則裡有 **18 則客戶端零引用**。6 則接了、1 則豁免、
其餘 11 則進 `WORLD_CUE_OUT_OF_SCOPE`（一張**凍結的普查名單**，每一則寫明它的消費端不在視覺層 ——
商店/HUD/狀態/音效）。⛔ 那不是說它們沒問題，是說**這條閘不替它們作答**；第 19 則出現就紅。
⭐ `worldCues.ts` 自己被排除在掃描之外，否則帳本會自己證明自己。

## 副產品（第三守則）

`eventFanout.ts` 對 `chainLightning` 寫著「**客戶端目前還沒有這個 case**」—— **那句話已經是假的**，
`VfxSystem` 的 `case "chainLightning"` 早就在了。已改成記錄它曾經說謊。

## 指令離開碼

| | |
|---|---|
| `pnpm typecheck` | **0** |
| `npx vitest run` 客戶端閘（8 條） | **0** |
| `npx vitest run` admin 五支（configForms / Save / DocCoverage / PagesRegistered / ShippedProse / laneConfigDocs） | **0** |
| `npx vitest run` eventFanout / guardian | **0** |
| **突變** | `worldCuePoint` 的表查詢鍵改壞 → 行為那條**紅**（5 列全部列名），改回 |

## ⛔ 沒做到的

**`pnpm content:build` 沒跑**（全域鎖，parent 明令）⇒ `shippedBundleIsCurrent.test.ts` **紅**：
`manifest.json` · `config/_index.json` · `abilities/_index.json` 過期。
⚠️ `abilities/_index.json` **不是這條 lane 造成的**（本 lane 一個 ability 都沒動）。
⭐ **主 session 最後跑一次 `pnpm content:build` 並 `git add content/` 即可**。

## 測試預算

實作 ≈ 900 行（新檔 3 支 + 5 支既有檔的接線）／測試檔 186 行（原 77 → 淨 +109）⇒ **0.2×**。
⛔ 沒有替六個事件各寫一條測試（那正是第零守則⑨在罵的）：**一條**驗表真的被讀（行為，走出貨的模板）、
**一條**驗 `handleEvent` 真的呼叫模板、**一條**驗豁免閘、**一條**驗三個住處不 drift。

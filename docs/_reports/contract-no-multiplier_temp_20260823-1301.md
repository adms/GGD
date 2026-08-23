# 編輯器契約裡不可以出現系統倍率 —— lane K（2026-08-23）

## ⭐ owner 逐字（⛔ 未改寫）

> 「編輯器**只編輯原始資料（五級距）**，**根本不需要知道系統倍率**，
>  **避免雙重編輯**，而說明裡面的數值**本來就是遊戲主程式動態產生**，
>  根本就沒差，整體這樣才會**設計輕量化容易維護**」

⇒ 這推翻了 2026-08-23 早上的修法（「把數字拿掉，改成指向 `owner-knobs.json`」）。
⭐ 正解是**那一整段換算解釋根本不該出現在對外契約裡**。

---

## 一 · 盤點：`docs/editor-contract/**` 共 **8 處**（逐處 檔:行）

掃面 = 5 份契約檔 / 2,552 行。掃法：`combatEnv.<旋鈕名>`（名單推導自
`content/config/combat-env.json` 的 `multipliers`）＋詞彙 `(系統|全域)…倍率`
＋「反引號旋鈕名後面緊跟數字」。**8 處全部是真的，0 誤報**（見四）。

| # | 檔:行 | 命中 | 來源（⛔ 產物不可手改） |
|---|---|---|---|
| 1 | `ggd-skill-tiers.md:60` | `abilityRange`（出貨 0.8） | `tools/skill-tiers/gen_tiers.ts` |
| 2 | `ggd-skill-tiers.md:91` | `combatEnv.cooldown` | 同上 |
| 3 | `ggd-skill-tiers.md:92` | 系統倍率 | 同上 |
| 4 | `ggd-skill-tiers.md:153` | 系統倍率 ×2 ＋ `maxHealth 8` ×2 | `tools/balance-anchors/gen.ts`（寫 `content/config/damage-tiers.json` 的 `note`，`gen_tiers.ts` 再逐字嵌進契約） |
| 5 | `ggd-skill-tiers.md:161` | `combatEnv.cooldown` ＋ 寫死的「出貨 0.2 ⇒ 1.2 實際秒」 | `content/config/cooldown-tiers.json` 的 `note`（**人手編的**） |
| 6 | `ggd-runtime-capabilities.md:263` | 全域倍率 | `tools/capability-export/export.ts::tierRewriteSection()` |
| 7 | `ap-damage-scaling.md:68` | 全域傷害倍率 | `tools/ap-damage-scaling/gen.ts::contractMd()` |
| 8 | `ap-damage-scaling.md:75` | 全域傷害倍率 | 同上 |

⚠️ #4 是既有那條閘**抓不到**的：它的第一版只認「`combatEnv.<名>` 後面緊跟『出貨 X』」，
而 `` `maxHealth 8` `` 兩個條件都不符合 —— 它就這樣坐在對外契約裡。

---

## 二 · 拿掉 8 處 / 留下 3 類

### ⭐ 拿掉（全部改在**來源**，⛔ 沒有手改任何產物）

| 來源 | 改了什麼 |
|---|---|
| `tools/skill-tiers/gen_tiers.ts` | 刪「這些是卡面值⋯再乘 `abilityRange`（出貨 0.8）」；刪「冷卻是卡面秒⋯實際等待 = 卡面 × `combatEnv.cooldown`⋯⛔ 不計入系統倍率」。⭐ 補一句**取代**它們的定位：「這份契約只描述原始資料⋯玩家看到的秒數／距離／傷害由**遊戲主程式在執行期產生**，⛔ 編輯器不換算」 |
| `content/config/cooldown-tiers.json`（note） | 刪換算句；刪 2026-08-23 早上那整段（它自己就寫死了 `0.2` 與 `1.2 實際秒`）。⭐ 那段的事故知識**改住** `knobValueNotRestated.test.ts` 的檔頭 ⇒ ⛔ 沒有無聲消失 |
| `tools/balance-anchors/gen.ts`（→ `damage-tiers.json` 的 note） | 兩處 `` `maxHealth 8` `` 全刪；刪「那正是系統倍率該有的樣子」整句；「推導鏈裡一個系統倍率都沒有」改成只留 owner 的**逐字引言**＋「三個輸入全部是純基礎資料」 |
| `tools/capability-export/export.ts` | 刪「還有第二道⋯再乘一組全域倍率」整段（§11） |
| `tools/ap-damage-scaling/gen.ts` | 刪「與全域傷害倍率共用同一個旗標 `skipGlobalDamageMult`」整句；「再乘上這一層（以及全域傷害倍率⋯）」改成「由**遊戲主程式在執行期產生**」 |

### ⚠️ 留下 ①：owner 的 `「…」` **逐字原話**（⛔ 不可改寫）

`cooldown-tiers.json` 的 owner 規格引言裡有「**不計入系統倍率及減少 CD 等效果**」，
`damage-tiers.json` 的引言裡有「不能把系統倍率乘進去再反推」「不要計算 HP 系統倍率⋯」。

⭐ **判準（也是閘的實作）**：掃描前先剝 `「…」`。理由是第〇·六守則第 1 層 ——
owner 的原話贏過一切且⛔ 不可改寫；而且這幾句的語意正好就是他這次的裁決
（「你編的那個數字是原始的」）。⚠️ 但 `combatEnv.<名>` **不吃這個豁免**：
程式識別字不會是他說出口的話。

### ⚠️ 留下 ②：**內部**的東西（owner 的話管的是「編輯器」）

⛔ 一個字都沒動，列出來給你判斷：

| 位置 | 是什麼 |
|---|---|
| `tools/balance-anchors/gen.ts:135,152,207,290,297,324,342` | `HP_MULT` 進 `docs/平衡錨點量測.md`（**owner 自己讀的**平衡文件）與一個 TS 匯出 |
| `content/config/ap-damage-scaling.json` 的 `note` | 後台欄位說明（owner 面），⛔ 不是編輯器契約 |
| `apps/admin/src/configForms.ts:1124` 等 | 後台（lane Z 的柵欄，我沒碰） |
| `packages/shared/src/sim/**`、`schema/**` 的檔頭與註解 | 引擎自己當然要知道倍率 |

### ⚠️ 留下 ③：`ggd-skill-tiers.md` 的 `CEILING` / 「引擎最終血量」那幾欄

它們是**後乘的數字**，但⛔ 沒有命名任何倍率，而且 `anchors:build` 每次重算 ⇒ 不會過期。
⭐ 我保守處理沒有動 —— 要不要一起清掉是一個判斷，列在這裡。

---

## 三 · ⛔ 沒做到：**另外兩份對外契約不在我的柵欄裡**

⚠️ 這兩份也是 Codex 讀的編輯器契約，owner 的裁決同樣覆蓋它們，
但柵欄只給了 `docs/editor-contract/**`，⛔ 我沒有動：

| 檔:行 | 內容 | 嚴重度 |
|---|---|---|
| `docs/技能編輯器引擎須知 20260811.md:391` | 「全域倍率（**生命 ×4**、魔抗 ×0.2、攻擊距離 ×0.6…）」 | 🚨 **已經是謊話** —— 出貨 `maxHealth` 是 **8.0** |
| 同上 `:91, 1093–1250` | **整個第八章「全域倍率（後台「戰鬥系統」頁）」** | 大 —— 整章都是「編輯器不需要知道」的東西 |
| 同上 `:418, 708, 822, 831, 832, 1197, 1296` | 換算式（`實際秒數 = 基礎冷卻 × (1−cdr) × combatEnv.cooldown × 暴走倍率` 等） | 中 |
| `docs/技能標記機制與效果規則.md:52, 63, 66, 68, 146, 154` | `{{cd!}}` 佔位符的說明表 | ⭐ **建議留著**：`{{cd!}}` 正是 owner 說的「遊戲主程式動態產生」，那是**機制**不是複述。⚠️ 但 `:146` 的「再乘⋯一格全域倍率」是散文，可拿掉 |

⇒ 這兩份的產生器是 `tools/editor-contract/gen_contract_numbers.py`（第 403 行也有一句）
與 `tools/skill-spec/gen_spec.ts`。**要不要把閘的掃面擴到它們，是你的決定。**
現在的閘刻意只掃 `docs/editor-contract/**`，⛔ 掃了會立刻紅一大片而我沒有柵欄去修。

---

## 四 · 閘怎麼收緊的 · 怎麼確認不誤報

`packages/shared/src/ops/knobValueNotRestated.test.ts`（92 行，⭐ 比原本的 101 行短）

| | 第一版（2026-08-23 早上） | ⭐ 現在 |
|---|---|---|
| 問什麼 | 「這個**值**有沒有被抄第二份」 | 「**對外契約裡有沒有系統倍率**」 |
| 掃面 | `content/config/*.json` ＋ `apps/admin/src/configForms.ts` | `docs/editor-contract/**` |
| 抓法 | `combatEnv.<名>` 後 40 字內的「出貨 X」 | ① `combatEnv.<名>`（⛔ 不吃引言豁免）② 詞彙 `(系統\|全域)…倍率` ③ 反引號旋鈕名 + 緊跟的數字 |
| 名單 | 推導自 `owner-knobs.json` | 推導自 `combat-env.json` 的 `multipliers`（**更完整**：含 `abilityRange` 這種不是 owner 旋鈕但仍是系統倍率的） |
| 訊息 | 「值過期了」 | 「**檔:行 · 命中什麼 · 要跑哪一支重生成**」 |

### ⭐ 不誤報怎麼確認的（三個方向，⛔ 不是「我覺得」）

1. **現況全掃**：5 份契約 / 2,552 行 → **8 命中，全部是上面那 8 處，0 誤報**。
   ⚠️ 第一版用 220 字窗抓到 4 筆而 3 筆是誤報 —— 這一版逐行掃、且**先剝 `「…」`**，
   所以 owner 的引言與同段別的欄位的出貨值都不會中。
2. **模擬重生成**：把這一輪在來源做的**同樣刪除**套到契約文字上再掃 → **0 命中**。
   ⇒ 產生器重跑之後這條閘會綠，⛔ 不是「刪到它剛好不叫」。
3. **突變**：把「實際等待 = 卡面 × `combatEnv.cooldown`」加回 `ggd-skill-tiers.md`
   → 紅，訊息 `ggd-skill-tiers.md:473 出現「combatEnv.cooldown」 → 拿掉整段，然後跑 pnpm tiers:build`。

（2、3 用一段**暫時**的 `it()` 在 vitest 裡跑同一支 `scanContract()`，跑完已移除
—— ⛔ 被測的就是出貨的那一支，不是複製品。）

---

## 五 · ⭐ 你要跑哪一支重生成（⛔ 我一支 `--build` 都沒跑）

```bash
pnpm anchors:build      # → content/config/damage-tiers.json 的 note
pnpm caps:export        # → docs/editor-contract/ggd-runtime-capabilities.{md,json}
pnpm apdmg:build        # → content/config/ap-damage-scaling.json + ap-damage-scaling.md
pnpm content:build      # ⇐ 全域鎖。cooldown-tiers.json / damage-tiers.json 都變了
pnpm tiers:build        # ⚠️ **一定要在 content:build 之後**（它讀註冊表 + 那兩段 note）
```

⭐ 或者直接 `pnpm skills:sync`（順序已經對了）。

⚠️ **在那之前這五個閘是紅的，而且那是預期的**（產物還是舊的）：

| 指令 | 離開碼 | 訊息 |
|---|---:|---|
| `pnpm tiers:check` | **1** | `ggd-skill-tiers.md 過期` |
| `pnpm caps:check` | **1** | `ggd-runtime-capabilities.md 過期` |
| `pnpm apdmg:check` | **1** | `ap-damage-scaling.md 過期` |
| `pnpm anchors:check` | **1** | `damage-tiers.json 過期` |
| `npx vitest run …/knobValueNotRestated.test.ts` | **1** | 上面那 8 處（重生成後 → 0） |
| `pnpm typecheck` | **1** | ⛔ **不是我的**：只有 `apps/admin` 的 `mobWaves*.test.ts` 缺三個 `boss.king.*` 欄位（lane Z）。`packages/shared` 與 `tools/capability-export` 都 Done |

⛔ 我沒有跑 `content:build` / `skills:sync` / `spec:build`（全域鎖，照指示）。

---

## 六 · 動到的檔（commit 逐檔 pathspec）

```
tools/skill-tiers/gen_tiers.ts
tools/balance-anchors/gen.ts
tools/capability-export/export.ts
tools/ap-damage-scaling/gen.ts
content/config/cooldown-tiers.json
packages/shared/src/ops/knobValueNotRestated.test.ts
```

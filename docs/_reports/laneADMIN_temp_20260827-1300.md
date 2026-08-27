# lane ADMIN — #807 / #801 / #806 完整報告（2026-08-27）

三張票全部落地，三個 commit。柵欄內，⛔ 沒有動 `content/` `apps/client/`
`apps/platform/` `apps/game-server/` `tools/`。

| 票 | 狀態 | commit |
|---|---|---|
| **#807** 後台一行接線 | ✅ 完成 | `939e9773` |
| **#801** 七格開關三個住處 | ✅ 完成 | `054ec1ec` |
| **#806** audio-map 後台頁 | ✅ 完成 | `ac3065e6` |

---

## #807 —— 設定頁的路由 key 從**出貨註冊表**推導

### 量到的前提（票文說的成立）

`CONFIG_DOC_SPECS` 59 份 · 59 份全部在 `NAV` 裡 · 59 份 `pageRequiresSession` 全部 true
⇒ 那一行是**機械的**，⛔ 不是一個決定。

### 自動推導長什麼樣（三段）

```ts
// ① engine.ts —— page 從 string 收成字面型別（預設值 string，消費端零改動）
export interface ConfigDocSpec<P extends string = string> { page: P; … }

// ② configForms.ts —— ⭐ `as const` 是承重的
export const CONFIG_DOC_SPECS = [ … ] as const satisfies readonly ConfigDocSpec[];

// ③ store.ts —— 兩處推導，⛔ 零行手寫
export type ConfigDocPage = (typeof CONFIG_DOC_SPECS)[number]["page"];
export type Page = "hub" | … /* 68 個非 config 頁 */ | ConfigDocPage;
const SESSION_REQUIRED_PAGES = new Set<Page>([ …34 個非 config 頁…,
  ...CONFIG_DOC_SPECS.map((s) => s.page) ]);
```

59 份 spec 逐份宣告成 `ConfigDocSpec<"audioMix">`（13 個 spec 檔，機械改寫）。

### 驗收

| AC | 結果 |
|---|---|
| ① 加一份 config + 一筆 spec ⇒ `store.ts` 一行都不用改 | ✅ 而且 **#806 當場證明了**（那張票 `store.ts` 零行） |
| ② 59 頁的 `pageRequiresSession` 逐頁不變 | ✅ 推導只**加**閘，拿不走任何一頁；非 config 的 34 個 gate 逐筆保留 |
| ③ `NAV` 順序逐筆不變 | ✅ `navSections.test.ts` / `navMap.test.ts` 綠 |

`store.ts` 1,011 → 601 行。

### 兩層閘（新守衛 `apps/admin/src/configPageDerivation.test.ts`，62 行）

1. **型別層（tsc 紅）**：`type _ = string extends ConfigDocPage ? never : true` ——
   `as const` 被拿掉 ⇒ `tsc -p apps/admin` 直接紅，⛔ 不是一次沉默的降級。
2. **來源層**：`store.ts` 原始碼裡不可以出現任何一個 config 頁的字面名。

**突變**：拿掉 `...CONFIG_DOC_SPECS.map((s) => s.page)` ⇒ `configDocCoverage.test.ts` 紅
「競技場規則 沒有 session-gate: expected false to be true」——紅且**指名**那一頁。

### ⚠️ 刻意刪掉的 59 段散文

`Page` union 上每一頁的註解被刪了。⛔ 那**不是**知識消失，是**第二份住處**
（第〇·四守則）：每一頁的「為什麼自己一頁 / 誰讀它 / 何時生效」住在
`configForms/specs/*.ts` 的 `title`/`intro`/`consumer`/`effect` 上，而那裡本來就
**比 union 註解完整**（逐份對照過 `SHIELD_SPEC` / `AUDIO_MIX_SPEC`）。
刪除點留了一段註解指路。

---

## #801 —— 七格開關補上 ② Zod 與 ③ 後台

### ② Zod（一律 `.optional()`，ABSENT ⇒ 解析端的 `DEFAULT_*`）

| 檔 | 欄位 | 界 |
|---|---|---|
| `schema/config/match.ts` | `roomCombatMaxSec` | `[60, 14400]`（與解析端的夾限同一組數字） |
| | `roomCombatCapEnabled` · `championLockEnforced` · `scoreCheatedMatches` | boolean |
| `schema/config/combatFeel.ts` (`standstill`) | `stillEps` | `[0, 100]` |
| | `closingRatio` | **硬性 `[0, 1]`** —— 徑向分量不可能大於速度，>1 是一個永遠為真而且不會有訊息的門檻 |
| | `legacyAbsoluteClosing` | boolean |

### ③ 後台

- `apps/admin/src/matchConfig.ts`：四格 `MATCH_FIELD_INFO`（zh + 「它影響什麼」+ 消費端模組）、
  三格 `MATCH_BOOL_LABELS`、**新開一組「房間存活與誠信（可調）」**。
  ⭐ 刻意不併進「回合時鐘」：那一組調**節奏**，這四格調**邊界**（房還該不該存在 /
  伺服器承不承認客戶端說的話），一個字都不改場上的事。
- `apps/admin/src/combatFeel.ts`：三格 `COMBAT_FEEL_LABELS`。欄位清單本來就是
  `deriveFields(zConfigCombatFeelDoc)` 推導的 ⇒ ②落地的同一刻③自動長出三格。

### ⭐ 出貨值一格都沒有被抄進後台

combat-feel 那一頁顯示 `shippedValues()`＝`DEFAULT_COMBAT_FEEL` 讀出來的；
match 那一頁顯示文件本身。說明文字只**指名** `DEFAULT_*` 常數名，⛔ 不重抄數字
（`configFormsShippedProse.test.ts` 的同一條理由）。

### ⛔ 不需要改 `content/config/*.json`

七格全部 `.optional()` ⇒ 缺席就是出貨行為，現有內容檔逐位元不變、`content:build` 不受影響。
**若 owner 想要顯式寫進出貨檔**（⛔ 不是必要，`content/` 在本 lane 柵欄外）：

| 檔 | 路徑 | 值 |
|---|---|---|
| `content/config/config.match.json` | `match.roomCombatMaxSec` | `1800` |
| | `match.roomCombatCapEnabled` | `true` |
| | `match.championLockEnforced` | `true` |
| | `match.scoreCheatedMatches` | `false` |
| `content/config/combat-feel.json` | `standstill.stillEps` | `0.1` |
| | `standstill.closingRatio` | `0.5` |
| | `standstill.legacyAbsoluteClosing` | **`true`**（⚠️ 見下） |

⚠️ **值全部照 `DEFAULT_*` 常數，⛔ 不是照票文**。票文寫 `legacyAbsoluteClosing` 出貨
`false`，而 `DEFAULT_STANDSTILL` 是 **`true`**（2026-08-27 因 `facingLock.test.ts` 紅而翻回）。
⛔ 動之前先 `bash scripts/genguard.sh content/config/<檔>`（那個目錄 7 份是產物）。

### ⚠️ 一句過期散文（**在本 lane 柵欄外**，交主 session）

`packages/shared/src/sim/combatFeel.ts` 的 `legacyAbsoluteClosing` 宣告上寫著
「出貨 `false`（第〇·六守則：優先權大的更新後都是預設啟動）」——
而同一個檔案下面的 `DEFAULT_STANDSTILL` 是 `true`（同日翻的，理由寫在那一格旁邊）。
⇒ 第三守則的形狀：**一句在它到期之後還活著的散文，而沒有任何東西變紅**。
（後台那一格的說明已經寫的是真話。）

---

## #806 —— audio-map 有後台頁了，而它是被**引擎**付掉的

### 量到的（⛔ 不是票文的估計）

票文寫「82 顆 SFX」；實測 `content/config/audio-map.json`：
**BGM 12 · mapBgm 13 · SFX 232** ＋ `castLayerCap`（含白名單）· `modelFxSound` · `rankUpAudience`。

`readSchema(zConfigAudioMapDoc)` ⇒ **5 個純量葉 + 4 個分支**（bgm / mapBgm / sfx /
castLayerCap.whitelist）。⇒ 那 4 個分支就是 KNOWN_GAP 那句「形狀不適合通用長表單」的來源。

### 解法：`configTables.ts` 的第三種形狀 `recordScalars`

**一個 entry 模板（幾欄）× N 列**，⛔ 不是 232 × 3 = 696 個手寫欄位。
那一行原本寫著「只有這兩種 —— 第三種要先想清楚它的錯誤形態長什麼樣」，所以檔頭
逐條寫下這一種的三個錯誤形態與各自的煞車：

| 錯誤形態 | 擋在哪 |
|---|---|
| ⛔ 存檔把沒畫在表上的子鍵洗掉 | `validateTable(rows, spec, **base**)` —— 逐鍵**合併** |
| ⛔ 操作者加一列而那一列缺必填子鍵 | `keysFixed` —— 鍵由內容作者決定（沒有音檔就沒有那個事件） |
| ⛔ 選填欄位留白被寫成 0 | 留白 ⇒ **刪掉那一格**（走消費端的預設） |

⚠️ 第一個是唯一**畫面上看不出來**的：`files` 被洗掉 Zod 會擋；一個選填的 `gain`
被洗掉**不會有任何錯誤**，它只是安靜地退回 1.0。

### 頁面內容

- 5 格純量：`rankUpAudience`（enum，兩個選項各一句中文）· `castLayerCap.enabled` ·
  `castLayerCap.maxLayers`（說明用 `{{出貨值}}`，⛔ 不手打數字）· `modelFxSound.enabled` · `.arrive`
- 4 張表：`sfx`（gain / cooldownMs / maxConcurrent，**搜尋框** `filterAfter: 20`）·
  `bgm` 與 `mapBgm`（file / loop / gain，⭐ **共用同一個 entry 模板常數**）·
  `castLayerCap.whitelist`（`stringList`，owner 的例外清單）
- 上界：`cooldownMs ≤ 60000`、`maxConcurrent ≤ 32` 是**後台補的**（schema 只有下界，#277）；
  `file` 有 `maxLen` **與 `pattern`**（`^assets/`）—— 一條打錯的路徑存得進去、PUT 成功、
  遊戲**安靜地不播**那顆音。

### ⭐ 這一頁同時是三張票的一鍵 rollback

GH#605（`rankUpAudience`）· GH#568（`castLayerCap` 含白名單）· GH#763（打擊音分層 ——
rollback 是「把 `hit-light/medium/heavy` 三列的音量調到 0」，逐字寫在 `sfx` 表的說明段落裡，
⛔ 不讓 owner 自己去猜）。

### ⭐⭐ `store.ts` 一行都沒有動

#807 的推導在這一張票上**第一次收到現金**。唯一的手寫接線是 `App.tsx` 的 `NAV` 一列，
而**那一列是一個決定**（放在 混音 旁邊：那一頁調匯流排，這一頁調逐一顆音）。

### 閘

- `configDocCoverage.test.ts` 的 `verdict.duplicated` **逼**我刪掉 KNOWN_GAP 那一列
  ⇒ 帳單 3 → 2、豁免表 29 → 28。⭐ 總列數變少 = 這張表最健康的移動方向。
- `configForms.test.ts` 擴一段：`recordScalars` 的**每一欄**吃和純量欄位一模一樣的規則
  （中文名、說明 >30 字、#277 的上界）。⛔ 表格不是逃過那條規則的漏洞。
- 新守衛 `audioMapPage.test.ts`（78 行）。
  **突變**：合併改成覆蓋（`{...prev}` → `{}`）⇒ 兩條紅
  （`expected undefined to deeply equal [ 'assets/audio/sfx/fx/swing.mp3' ]`）。

---

## 測試與型別

| | |
|---|---|
| `npx vitest run --dir apps/admin` | **114 檔 · 1,246 條全綠**（6 skipped） |
| `packages/shared/src/content/fieldAdoption.test.ts` | 綠 |
| `npx tsc -p apps/admin --noEmit` | 本 lane 零錯 |

⚠️ **兩處紅不是本 lane 的**（都在別條 lane 的未提交改動上，柵欄外）：
- `packages/shared/src/content/registries.ts:359` `castTimeRulesFromDoc is not defined`
  ⇒ `loader.test.ts` 整支 suite 失敗
- `packages/shared/src/content/renderAbilityText.ts:89` 少 `cast`（`abilityProse.ts` 改到一半）

## 給主 session 的三件事

1. `pnpm skills:sync`（本 lane ⛔ 沒跑，全域鎖）—— 兩個 Zod schema 動過，
   若有任何產生器讀 config schema 就會過期。
2. 上面 #801 那張「若要顯式寫進出貨檔」的欄位表（`content/` 在柵欄外）。
3. `packages/shared/src/sim/combatFeel.ts` 那句過期散文（柵欄外）。

## 守則犯錯（⛔ 本 lane 沒有寫 `docs/守則犯錯.md` —— 那個檔在柵欄外，請主 session 補記）

| 守則 | 成因 | 一句話 |
|---|---|---|
| `0-成本` | `順手` | 用 python 改寫 TS 字串常數（`specs/audio.ts` 拆 `decision`），第一次產出未閉合的字串，要再補一次 replace —— 第零守則⑥「⛔ 不要用 python 盲插 TS」 |
| `0-成本` | `順手` | `#806` 的閘紅了之後修一個跑一次（棘輪列數 → navSections 基準線 → navTags），三輪才收斂；正解是**第一次就跑 `--dir apps/admin` 全掃**，一次撈完全部（「錯誤要批次撈」） |

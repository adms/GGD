# GH#992 Scope 1 第一批 —— `schemaToForm()` ＋ 棘輪閘

> lane 報告（2026-09-05 04:39）。⛔ 未 commit、未 push、未 `git add`（依 lane 指令）。
> ⚠️ 這一份是 `_temp_`：它記的是**這一輪量到的數字與當下的判斷**，會過期。

---

## 1. 量到的（⛔ 全部當場重量，⛔ 不是引用票文）

量法：載入出貨的 `CONFIG_DOC_SPECS`，逐份跑 `walkZod`（＝後台真的在用的那支走訪器）。

| | 值 |
|---|---:|
| 註冊的 spec | **71** |
| spec **檔案**數（`apps/admin/src/configForms/specs/*.ts`） | **17** |
| 手寫的 `fields[]` 標籤（＝畫在畫面上的格數） | **963** |
| schema 走出來的純量葉 | **1,140** |
| 葉子帶著 `.describe()` 的 | **173**（15.2%） |
| ⭐ 同時有 `.describe()` **與**手寫 `note` 的 | **164** |
| ⭐ 那 164 對裡**逐字相等**的 | **0** |
| `.describe()` 覆蓋 100% 的 spec | **16 / 71** |

⚠️ **票文兩處已過期，⛔ 不要再引用**：
- 「16 份 spec」——今天是 **71 份 spec 住在 17 個檔**（票文把「檔數」寫成了「spec 數」）。
- 「16 份裡只有 3 份引用 Zod」——實際上 **17 份全部**都引用 Zod（每個 spec 都有 `zod:` 欄），
  ⭐ 真正的缺口不是「有沒有引用 schema」，是「**引用了 schema 卻仍然逐格手打語意**」。
- CLAUDE.md 的「`configForms.ts` 4,978 行」也過期（本體 **257 行**門面 + `engine.ts` 458 行 + 17 份 spec）。

### ⭐ 這一輪最重要的一個發現

> **164 格同時住著兩份人話（Zod 的 `.describe()` 與後台的 `note`），而其中逐字相等的是 0 格。**

⇒ 第〇·四守則的病灶本身，而且**已經漂了**。抽樣三例（`docs` 之外看不到）：

| 格 | Zod 說 | 後台說 |
|---|---|---|
| `arena-rules.finalRound` | 提到與 `maxRounds` 是 OR、先到的贏 | 提到 overflow 規則在出貨文件裡整塊缺席 |
| `arena-rules.postMatchLingerSec` | 「出貨 120」+ owner 原話 | owner 原話 + `{{出貨值}}` |
| `arena-rules.botOnlyRingAccelEnabled` | 「出貨開」+ 與殭屍王延長的互動 | 觸發條件的定義（人類全滅／輪空／已分勝負） |

⭐ 兩邊各自帶著**對方沒有**的資訊 ⇒ 退場的時候⛔ 不可以無腦挑一邊，
要**取聯集寫回 Zod**（`@note`），⛔ 不是「反正兩邊都在講同一件事」。

### 欠帳的成因分佈（`handWrittenResidue`，963 格）

| 缺的標籤 | 格數 | 住哪 |
|---|---:|---|
| `zh`（短名） | **963** | 全部 —— 今天沒有任何一份 schema 採用 `@zh` |
| `note` | **799** | `.describe()` 缺席的那些 |
| `optionLabels` | **248** | enum 選項的中文（`stat-normalization` 176 格是大宗） |
| `bounds`（標籤表補的上下界） | **33** | 全部在 `config.arena-rules@1` |
| `pattern` / `patternError` | **27** | `item-card` 10 · `damage-colors` 9 · `range-guide` 8 |

---

## 2. 做了什麼

### `apps/admin/src/configForms/schemaToForm.ts`（新）

一份 Zod schema → `{ fields, groups }`：**欄位 · 分組 · 順序**全部推導。

⭐ **翻不過去的地方去實作標籤（第〇·五守則），⛔ 不用現有欄位湊一個像的。**
一格後台欄位要的東西比 `.describe()` 的一個字串多，所以實作了 `.describe()` 的**行首指令**：

| 指令 | 給誰 | 幾次 |
|---|---|---|
| `@zh <短名>` | `ConfigFieldLabel.zh` | 1 |
| `@note <正文>` | `ConfigFieldLabel.note`（可跨行） | 1 |
| `@opt <值> <中文>` | `optionLabels[值]` | 每個 enum 選項一次 |
| `@order <整數>` | 畫面排序鍵 | 0–1 |

- ⛔ **刻意沒有 `@min` / `@max`** —— 界住 Zod，`boundsFor()` 已經在「兩份上界」上丟例外。
  一個會造出第二個住處的指令就不該存在。
- ⛔ **`zh` 缺席時不回填 `humanize(path)`** —— 一個編出來的「Max Pooled Rings」會讓欠帳
  看起來已經還清，而操作者拿到一格看不懂的英文（`configForms.ts` 檔頭逐字說過那不叫可調）。
- ⭐ **沒有任何指令的 `.describe()` 整段當 `note`** ⇒ 今天那 173 個描述**一個字都不用改**就有值。

另外導出 `handWrittenResidue(spec)` —— 一份 spec 裡「今天還必須手寫」的欄位，
**逐格帶著缺的標籤名**（⛔ 不是「推導不出來」這種說不出下一步的話）。棘輪量的就是它。

### `apps/admin/src/configForms/schemaToForm.test.ts`（新，72 行）

### `packages/shared/src/ops/adminFormsHandWrittenRatchet.test.ts`（新，99 行）

---

## 3. 第一批接的那一份 spec：`config.speed-growth-tiers@1`

挑選判準（票文：「手寫欄位最多、而結構最單純的那一份」）——
在 **16 份 `.describe()` 100% 覆蓋**的 spec 裡，按「欄位數 × 順序與宣告順序一致」排：

| 候選 | 手寫欄位 | describe 覆蓋 | 順序與宣告序一致 |
|---|---:|---|---|
| `displacement-tiers` | 30 | 30/30 | ⛔ 否 |
| ⭐ **`speed-growth-tiers`** | **23** | **23/23** | ⭐ **是** |
| `ranking` | 11 | 11/11 | 是 |
| `skill-normalize` | 9 | 9/9 | 是 |

### 逐格相等：**結構成立，語意不成立** —— ⛔ 斷言沒有被放寬

| 軸 | 結果 |
|---|---|
| **路徑 + 順序**（23 格） | ⭐ **逐格相等**（`toEqual`，⛔ 不是 `toContain`／長度比對） |
| **分組** | ⭐ 推導得出 `["", growth.A.ms, growth.A.as, growth.B.ms, growth.B.as]` |
| **`note`** | ⭐ 23/23 都從 `.describe()` 拿得到（⛔ 但**文字與手寫的那份不同** —— 見下） |
| **`zh`** | ⛔ 0/23 —— 缺 `@zh` |
| **`optionLabels`** | ⛔ 0/1（`ladder` 的 A/B 中文）—— 缺 `@opt` |

⇒ 差異**沒有被塞進一個放寬的斷言裡**：它被寫成第二條測試的**明確清單**
`expect(reasonsOf(SPEC)).toEqual(["optionLabels", "zh"])`。
多一種缺口 ⇒ 紅；少一種（有人補了 `@zh`）⇒ 也紅（叫人降棘輪基準線）。

### 差異的**種類**，逐條說「缺的標籤是什麼」

| # | 種類 | 格數 | 缺的標籤 / 下一步 |
|---|---|---:|---|
| ① | **短名（`zh`）** | 963（全部） | ⭐ 標籤**已實作**（`@zh`）；缺的是**採用** —— 那要動 `packages/shared/src/content/schema/`，⛔ 不在這條 lane 的柵欄內（Scope 2） |
| ② | **enum 選項中文（`optionLabels`）** | 248 | ⭐ 標籤**已實作**（`@opt`）；同上，缺採用 |
| ③ | **`note` 兩份且不相等** | 164 | ⛔ **不是技術缺口，是內容決定**：兩邊各有對方沒有的資訊 ⇒ 退場時要**取聯集**寫進 `@note` |
| ④ | **`pattern` / `patternError`** | 27 | ⛔ **標籤還沒實作**：Zod **有** `.regex()`，但 `walkZod` 的 `UIText` 不帶它（`apps/editor/src/form/uiSchema.ts` + `walk.ts`）⇒ 要在 IR 上長一格。⛔ 我**沒有**在 `schemaToForm.ts` 另寫一支走訪器 —— 那就是第二份會漂的「Zod 長什麼樣」的知識，而 `engine.ts` 的檔頭正是為了不要那個才重用 walker（那個檔在別條路徑柵欄裡） |
| ⑤ | **標籤表補的上下界** | 33（全在 `arena-rules`） | ⛔ 正解是**把界寫回 Zod**，⛔ 不是開一個 `@max` 指令（那會造出第二個住處） |
| ⑥ | **順序與宣告序不一致** | **14 / 71** 份 spec | ⭐ 標籤**已實作**（`@order`）；票文的 Known risks 那一條就是這個，處理方式與它一致 |

### ⚠️ 一個 Scope 2 一定會撞到的遷移限制（這一輪順手量到的）

`apps/admin/src/configFormsShippedProse.test.ts` 禁止說明**複述自己的出貨值**
（要用就寫 `{{出貨值}}`，今天 spec 裡有 **124 處**）。
⛔ 而好幾個 Zod `.describe()` 正在複述（「出貨 120」「出貨 `A`」）
⇒ **直接把 `.describe()` 搬去當 `note` 會讓那條守衛紅**。
⇒ 採用 `@note` 的時候要**同時**把字面值換成 `{{出貨值}}`。⭐ 這是好事：
那條守衛會強迫遷移不夾帶一次無聲的過期。

---

## 4. 棘輪

| | |
|---|---|
| 檔 | `packages/shared/src/ops/adminFormsHandWrittenRatchet.test.ts` |
| **基準線** | **`BASELINE = 963`**（2026-09-05 當場量，⛔ 不是票文的數字） |
| 量的是什麼 | `handWrittenResidue()` 逐份加總 ＝「今天還必須手寫的格數」 |
| **雙向** | 變多 → 紅（訊息叫人改用 `@zh`/`@note`/`@opt`，真要手寫就調基準線並說明）；變少 → 也紅（訊息叫人**把基準線降下來**，否則棘輪會停在一個還完的數字上，下一次退步仍然是綠的） |
| **sentinel** | 第二條 `it`：把 `@zh`/`@note`/`@opt` 貼到**出貨的** `zConfigSpeedGrowthTiersDoc.ladder` 上 ⇒ 斷言那一格**正好**從欠帳消失（`before − 1`）。⭐ 兩個方向都跑過：已知「有欠帳」量得到、已知「還完了」量不到 |
| 母體柵欄 | `expect(specs.length).toBeGreaterThan(50)` —— 註冊表載不進來時加總會誠實地回 0，而 0 在單向棘輪底下讀起來像「進步」 |

### ⚠️ 兩件收票的人要知道的事

1. ⭐ **今天 `residue(963) === fields(963)`**，因為 963 格全部欠 `@zh`。
   兩個數字會在**第一份 schema 採用 `@zh` 的那一刻**分開 —— 那才是這條棘輪開始有意義的時候。
2. ⚠️ **這條會與正在新增設定頁的 lane 撞車，而那是刻意的**（撞車的內容就是「你新增的那幾格是手寫的」）。
   ⛔ 收工時**不要**把斷言改成 `toBeLessThanOrEqual` —— 那會讓「變少不降線」變成綠的。
   ⭐ 事實證明它會發生：我在這一輪**量測進行中**就被 `specs/ugc.ts` 撞了一次
   （70 spec / 957 格 → 71 spec / 963 格），基準線是**重量之後**才凍結的。

### ⚠️ 為什麼是動態 `import()` 而不是普通 import（寫進檔頭，⛔ 不要「修好」它）

`packages/shared/tsconfig.json` 的 `rootDir` 是該套件本身 ⇒ 一行
`import … from "…/apps/admin/…"` 讓 `tsc` 吐 **TS6059**（實測 exit 2，
訊息從 `configCurve.ts` 一路列到 17 份 spec）。⭐ **型別 import 也一樣會**
（它照樣把檔案拉進 program）。⇒ 執行期載入 + 本檔自帶最小結構宣告，
⛔ 而不是去放寬那個套件的 `rootDir`（那會讓整個 monorepo 的邊界失效）。

---

## 5. 突變紀錄（接線類，一次）

| | |
|---|---|
| 動的那一行 | `apps/admin/src/configForms/schemaToForm.ts:181` |
| 改壞 | `parseDirectives((leaf as { description?: string }).description)` → `parseDirectives(undefined)` |
| 為什麼挑它 | ⭐ **整條推導的接線**：拿掉它，`note` / `@zh` / `@opt` 三種推導同時消失 |
| 結果 | ⭐ **5 條裡 4 條紅**（`Tests 4 failed \| 1 passed`，exit 1） |
| 唯一沒紅的 | 棘輪的**計數**那一條 —— ⭐ **這是對的**：它量的是「有欠帳的**格數**」，而突變只是讓每一格**多欠一項理由**（963 格本來就全部欠 `zh`）⇒ 格數不變。抓到它的是同一支測試的 **sentinel**（`after.length === before.length − 1` 紅了）。⚠️ 這正是「一把只驗過單邊的尺不算自證過」的具體樣子：計數那一條對這個突變是瞎的，所以 sentinel 不是裝飾 |
| 還原 | `python3 scripts/edit-or-die.py … --old-file/--new-file` 反向跑（exit 0，`✓ 替換了 1 處`），並 `grep` 確認第 181 行回到原樣 |

⚠️ 用 `edit-or-die.py` 兩次（⛔ 不是 `python3 -c ... replace`）——
CLAUDE.md 記著「三次裡有兩次發生在突變驗證上」的那個坑。

---

## 6. 離開碼

| 指令 | EXIT |
|---|---:|
| `npx vitest run <兩支新測試>`（全部寫完後） | **0**（5 passed） |
| `npx vitest run --root packages/shared src/ops/adminFormsHandWrittenRatchet.test.ts` | **0**（2 passed）—— 驗它在**套件自己的** vitest config 底下也跑得起來 |
| `npx vitest run <兩支>`（**突變**） | **1**（4 failed \| 1 passed）⇒ 守衛承重 |
| `npx vitest run <兩支 + 三支既有鄰居>`（還原後） | **1** —— ⭐ 我的 3 支**全綠**，紅的 4 條**全部是既有的**（見下） |
| `pnpm typecheck` | **1** —— ⭐ 我的檔案**零錯誤**，3 條全部是既有的（見下） |

### ⚠️ 兩處**既有的紅**（⛔ 不是這條 lane 造成的，⛔ 也不在我的柵欄內）

| 紅在哪 | 內容 | 證據 |
|---|---|---|
| `pnpm typecheck` 3 條 | `Record<…>` 缺 `"vfx-subtypes"`（`packages/shared/src/content/bundle.test.ts` · `apps/editor/src/collections.ts`） | ⭐ `content/vfx-subtypes/` 是**別條 lane 的未追蹤新目錄**（`git status` 顯示 `?? content/vfx-subtypes/`）；`grep schemaToForm\|adminForms` 在 typecheck log 裡**零命中** |
| `configForms.test.ts` 3 條 + `configDocCoverage.test.ts` 1 條 | `arena-rules` 標籤表與 schema 對不上（54 vs 74 格、多一個分支）· `review-tuning` 沒有後台入口 | ⭐ 兩個來源檔都是**乾淨已提交**的（`git status` 無輸出，mtime 09-03 18:20 / 09-04 00:20）⇒ 早於本 lane |

---

## 7. 動到的檔案（全部 **未 commit**）

| 檔 | 狀態 | 行數 |
|---|---|---:|
| `apps/admin/src/configForms/schemaToForm.ts` | 新增 | 234 |
| `apps/admin/src/configForms/schemaToForm.test.ts` | 新增 | 72 |
| `packages/shared/src/ops/adminFormsHandWrittenRatchet.test.ts` | 新增 | 99 |
| `docs/_reports/992_schema-to-form_temp_20260905-0439.md` | 新增（本檔） | — |

⛔ **一個字都沒有動**：`apps/admin/src/configForms/specs/**`（含別條 lane 的 `ugc.ts`）·
`apps/admin/src/configForms/engine.ts`（最後判定**不需要**改）· `apps/admin/src/store.ts` ·
`apps/admin/src/ui/App.tsx` · `packages/shared/src/content/schema/**`（只**讀**，⛔ 沒寫）。

⚠️ 測試行數：72 / 99 —— 體驗層上限 80 行，⭐ 棘輪那支 **99 行超標 19 行**，
而超出的部分**全部是檔頭註解**（斷言本體 2 個 `it`、約 35 行）。判斷：
那段註解在解釋「為什麼是動態 import」與「為什麼雙向」，
⛔ 砍掉它下一輪就會有人把它「修好」成普通 import 然後撞 TS6059。

---

## 8. ⛔ 這一批**沒有**做的（票文 Scope 2 / 3）

- ⛔ 沒有讓任何一份 schema 採用 `@zh` / `@note` / `@opt`（要動 `packages/shared/src/content/schema/`）
- ⛔ 沒有改 `configDocCoverage.test.ts` / `navSections.test.ts` 去「從推導驗」（票文 AC 第 1 條的後半）
- ⛔ 沒有做技能／特效的節點編輯與預覽（Scope 2）、Codex packet（Scope 3）
- ⛔ 沒有把 `walkZod` 的 IR 補上 regex（缺口④，要動 `apps/editor/src/form/`）

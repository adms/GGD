# lane TOOLS — #811 · #668 · #771 · #706（2026-08-27）

柵欄：`tools/**` · `packages/shared/src/ops/**` · `scripts/genguard.sh|genrun.sh|product-quarantine.sh`。

---

## 🎫 GH#811 — 呼名產生器執行即 exit 1 ⇒ **產生器已修好，產物待主 session 重生成**

### ⭐ 最重要的發現：那 47 列**不是漂移，是退休 —— 而且 47/47 都查得到住處**

| | |
|---|---|
| `CASTING` 列數 | **116** |
| `content/champions/` 出貨英雄 | **71** |
| CASTING 指不到出貨英雄的 | **47** |
| ⭐ 其中住在 `content/_legacy/champions/` 的 | **47 —— 100%** |
| 兩邊都查不到（真漂移／打錯字）的 | ⭐ **0** |

⇒ 「多餘的 CASTING 列」有一個**可以被反駁的、量得出來的理由**：
**那位英雄的文件搬進 `_legacy/` 了**。⛔ 不必手寫一張 `RETIRED_CASTING` 名單
（手寫的表會過期而且不會有東西紅 —— 下一次 roster 再換一批時它不會叫）。

### 改了什麼（`tools/tts-gen/src/build-champ-names.mjs`）

1. 新增 `retiredChampionIds()` —— 讀 `content/_legacy/champions/`。
   ⚠️ 目錄不存在 ⇒ 回**空集合** ⇒ 每一列漂移退回 fatal（fail-loud，
   ⛔ 不是「讀不到就全部放行」）。
2. 反方向檢查拆成**三級**（在此之前三種一律 fatal）：

| 方向 | 級別 | 為什麼 |
|---|---|---|
| 出貨英雄**缺** CASTING 列 | ⛔ **fatal**（沒動） | 漏掉 = 那位英雄靜默地沒有呼名 |
| CASTING 多一列、英雄在 `_legacy/` | ⚠️ **警示**（逐列印出 id） | 他被下架了，⛔ 不是打錯字 |
| CASTING 多一列、**兩邊都查不到** | ⛔ **fatal**，訊息指名它與兩條查過的路徑 | 這才是真的漂移 |

3. 退休的 casting **另存進 manifest 的 `retiredCasting`**（第一·五守則：
   被取代的知識要另存，⛔ 不是刪掉）—— 逐列帶 `id / mode / title / name / why`，
   `why` 是**量出來的**（那份文件現在住哪裡），⛔ 不是手打的理由。
4. 新增 **`--check`**：三份產物逐位元組比對，過期就 exit 1 並**指名那一份**。
   ⭐ 需要它的理由：這支**不在 `skills:sync` 的鏈裡**（`sync-io.json` 沒有它，
   三份產物也沒被隔離區鎖起來，`genguard` 回「沒有產生器擁有者」）
   ⇒ 「產生器綠不綠」與「產物新不新」是兩個名詞，而在此之前**沒有東西在問後者**。

### 驗收（在 `/private/tmp/ggd-bcn-sandbox` 的複本上跑，⛔ 沒有寫真 repo 的 `content/`）

| AC | 結果 |
|---|---|
| ① `node build-champ-names.mjs` EXIT=0 | ✅ **EXIT=0** · `71 champions, 1 skipped` · 59 Kyoko / 10 Tingting‖Kyoko / 2 Karen · 140 mixlang clips |
| ② 重跑第二次零 diff（冪等） | ✅ 三份 md5 完全相同；`--check` 隨後 EXIT=0 |
| ③ `godie-e00j.name.mp3` 存在且 >0.15s；`EXCLUDED_NAME_CLIPS` 變空 | ⛔ **這條 AC 的前提已經不成立 —— 見下面** |
| ④ 47 列逐列寫得出理由 | ✅ 47/47 = `content/_legacy/champions/<id>.json`，⛔ 零列靜默消失 |

### ⛔⛔ AC③ 要改寫：`godie-e00j` **本身就是那 47 位退休英雄之一**

GH#744 為它加的 `MIX_JA_READING_OVERRIDE`（「騜」念不出來）**推不到產物，
也不需要推** —— 產物重生成之後 `godie-e00j` 的 manifest 條目會**整個消失**，
`godie-e00j.name.mp3` 這顆 clip 從此不該存在。

⇒ `apps/client/src/audio/selectVoiceLadder.ts:108-114` 的釘子註解
「manifest entry present, `.name.mp3` never rendered」在產物重生成之後
**會變成一句謊話**（第三守則）。拔釘的理由是「那位英雄下架了」，
⛔ 不是「clip 終於 render 出來了」。

### ⚠️ 柵欄外的餘量（主 session 做）

1. **重生成三份產物**（`content/` 是柵欄外）：
   `node tools/tts-gen/src/build-champ-names.mjs`
   —— 量到的 diff：MANIFEST.json **±1,977 行**、champ-names.ja-JP.json ±600、
   _tts-mixlang.json ±920（47 位英雄整批退場所致）。
   ⚠️ 票的 Known risks 要求「第一次跑完逐段讀 diff，⛔ 不要直接 `git add`」。
2. **拔 `EXCLUDED_NAME_CLIPS` 的釘**（`apps/client/`），理由改成「英雄已退休」。
3. 產物重生成之後，可考慮把 `build-champ-names:check` 接進 `skills:check`
   （⚠️ `skillsSyncCoversGenerators.test.ts` 的豁免表會叫）。⛔ 本 lane
   ⛔ 沒有加這一條聚合閘，因為產物今天還是 stale，接上去會立刻紅。

### 守衛

`packages/shared/src/ops/champNamesGeneratorRuns.test.ts`（3 條，77 行，體驗層）
—— 拿**真的**產生器 + 真的 `content/champions/` + `content/_legacy/champions/`
在 temp 樹上跑，只問**離開碼與訊息**（⛔ 不驗產物內容，那是 `--check` 的事）。
⚠️ 它刻意把**兩個 fatal 方向**都釘住，⛔ 不是只釘「現在會過」。

**突變（一批一條）**：`if (retired.has(id))` → `if (true)` ⇒
第 3 條紅並指名「CASTING row zz-nowhere matches neither」。已用 `Edit` 還原
（⛔ 不是 `git checkout`）。

---

## 🎫 GH#668 — ⭐ **兩半都已經做完了，可以關**（本 lane 零改動）

| 半 | 狀態 | 出處 |
|---|---|---|
| ① `particles_checks.py:98` 的 `ids` 只收 `godie-*` | ✅ **已修**（`a35694aa`）—— 現在 `ids \|= {目錄裡每個 .json 的檔名 stem}` | 實測 `particles_regen.test.ts` **2 passed / 0 failed** |
| ② 「進 ship:check 的並行段（紅了有人看得見）」 | ✅ **已修**（GH#809 的 `readers` 推導，`tools/parallel-gates/packages.mjs`） | 見下 |

②的實測（⛔ 不是讀程式碼推論）：`suitesForPaths()` 的 `content/` 分支現在從
`sync-io.json` 量到的 `reads` ＋ `package.json` 的指令文字**推導**出讀 content 的
tool 目錄。跑出來的母體 **23 個**，而 **`tools/w3x-import` 在裡面**
（經由 `pitch:build` = `python3 tools/w3x-import/build_pitch.py`，它讀 `content/`）。
⇒ 純 `content/` 改動現在會帶上 `tools/w3x-import` 的測試。
守衛 `contentChangeRunsContentReaders.test.ts` 綠（拿真的 `suitesForPaths()` 跑）。

⭐ 而且承重的那條不變量另外還被搬到了**每一次都跑**的那一包：
`packages/shared/src/ops/laneVParticlesRegenIsIdempotent.test.ts`（`f577fb0f`）。實測綠。

⇒ **建議關票。** ⛔ 本 lane 沒有改任何東西 —— 這張票的兩半分別在
`a35694aa`（#668 自己）與 GH#809 底下落地了，只是沒有人回頭關它。

---

## 🎫 GH#771 — AC①② ✅ 實測通過；AC③ 是 owner 的二選一，⛔ 本 lane 不替他決定

### AC① 逐支 `genrun.sh` 的離開碼（⛔ 沒有接 `| tail`）

| step | EXIT | 最後一行 |
|---|---:|---|
| `skillremake:provenance` | **0** | `✓ genrun: skillremake:provenance 完成（產物已重新上鎖）` |
| `contract:numbers` | **0** | `✓ genrun: contract:numbers 完成（產物已重新上鎖）` |
| `speedtiers:build` | **0** | `✓ genrun: speedtiers:build 完成（產物已重新上鎖）` |
| `msgledger:build` | **0** | `✓ genrun: msgledger:build 完成（產物已重新上鎖）` |

### AC② 戶籍表的 `writes` 不再是空的

| step | writeCount | 宣告 |
|---|---:|---|
| `skillremake:provenance` | 2 | `content/abilities/*.json` · `content/champions/*.json` |
| `contract:numbers` | 2 | `docs/技能編輯器引擎須知 20260811.md` · `docs/效果標籤詞彙表v2.md` |
| `speedtiers:build` | 1 | `content/champions/*.json` |
| `msgledger:build` | 2 | `docs/_daily/????-??-??.md` · `docs/_daily/ledger-source_temp_*.md` |

⇒ 已由 `c1292f36`（「戶籍重量測 —— 625→640 筆、零宣告產生器歸零」）落地。
今天 `sync-io.json` 剩下的 3 支零宣告全部是**合法**的（`quarantine:unlock` /
`quarantine:lock` / `roster:check`），且三支都在
`syncIoDeclaresWrites.test.ts` 的 `READ_ONLY_BY_DESIGN` 裡帶著理由。實測綠。

### AC③ ⇒ ⛔ **留開**，理由逐條

1. 三處寫入端自解鎖**還在**（`ledger_table.py:129 _unlock()` ·
   `apply_placeholders.ts:33 writeProduct` · `gen_contract_numbers.py:1284 chmod`）。
   票自己的留言列了兩條出路（①改票承認自解鎖是設計 ②留下真正沒做的那半），
   並逐字寫「本 lane ⛔ 不替 owner 決定走哪一條」。⭐ 本 lane 遵守。
2. 「任何 step 若寫了**不在自己 `writes` 裡**的檔 ⇒ 紅」這條**執行期**對帳閘
   仍不存在，而它**結構上需要重跑 `trace.mjs`（走 `skills:sync` 那一趟）**
   ⇒ 全域鎖，⛔ lane 禁跑。
   ⚠️ **但它的靜態那一半已經有閘了**：`syncIoDeclaresWrites.test.ts` 讓
   「宣告 0 產物的產生器」**當場紅**，⛔ 不是等下一次 EACCES —— 也就是這張票
   Objective 描述的那個症狀類別，今天已經被一條會紅的測試蓋住了。
3. 提醒：`trace.mjs` 的解析根因（142 支裡 140 支被解析成幽靈名字）
   **已經在 `5fc7f048`（#804/#810）修掉了** —— 逐節切 argv、葉子跑 `pnpm SCRIPT`、
   沙盒陳舊自動重建。⇒ ⭐ 派工說的「#771 與 #804 同一個根因」**成立，而且已修**，
   所以 AC② 才會是綠的。⛔ 不要再往解析層查。

---

## 🎫 GH#706 — ⭐ **四項守衛今天全部存在，可以關**（一行註解是柵欄外的餘量）

| # | 票上說「閘不存在」 | 今天 |
|---|---|---|
| 1 | config schema 拆檔門面 export-surface 快照 | ✅ `packages/shared/src/content/schema/config/configFacadeSurface.test.ts`（43 行，真的 import 門面比對基準線） |
| 2 | `stat-normalization.json` ↔ `DEFAULT_*` 三住處 drift | ✅ `packages/shared/src/content/statNormalizationShipped.test.ts`（25 行，讀出貨檔） |
| 3 | sim revive fallback ↔ `arena-rules.json` drift | ✅ `packages/shared/src/sim/effects/reviveShipped.test.ts`（30 行） |
| 4 | 「每一條 public route 都有 client/admin reader」對帳 | ⭐ ✅ **`apps/platform/internal/server/orphan_route_test.go`** |

### ⭐ 第 4 項的發現：那條閘一直都在，只是**它是 Go 寫的、名字不一樣**

`announcements.ts:16-20` 的註解逐字寫著

> 「An all-route reader-reconciliation guard does NOT exist yet
>  (the once-named `publicFeedReaders.test.ts` never landed — GH#706)」

⛔ 而 `orphan_route_test.go` 做的正是這件事，而且**兩邊都在測試時算出來**：
route 集合從 `chi.Walk` 走**真的**已接線 router 拿，caller 集合從磁碟上的
前端原始碼讀。它的檔頭甚至寫著「its first run found two orphans …
(**the public announcement feed**, #53's /ai/music)」，
而 `:183` 逐字記著「`GET /api/v1/announcements` **USED TO BE** the first line of
this block」—— 也就是它已經因為 client 接上了而從 `knownOrphans` 被刪掉。

⇒ ⭐ **這是第三守則的鏡像**：不是「散文宣稱有閘而閘不存在」，
而是**「散文宣稱沒有閘，而閘存在」** —— 代價一樣貴：下一個人會**再做一次已經存在的東西**
（正是 GH#473 記過的那個最貴的假前提形狀）。

### ⚠️ 柵欄外的餘量（一行）

`apps/client/src/ui/platform/announcements.ts:16-20` —— 把「guard does NOT exist yet
… GH#706」改成指向 `apps/platform/internal/server/orphan_route_test.go`。
⛔ 本 lane 的柵欄不含 `apps/`。

---

## 🚨 柵欄外：本 lane 量到但⛔ 沒有動的兩件事

### ① T0 —— `pnpm typecheck` 現在 **exit 1，12 個包全紅，一個根因**

```
packages/shared/src/content/registries.ts(359,15):
  error TS2304: Cannot find name 'castTimeRulesFromDoc'.
```

⚠️ 這是**工作樹**的改動（`git diff --stat` = +4 行，HEAD 是好的），
⛔ 不是我的（`registries.ts` 在我的柵欄外）。函式本體在
`packages/shared/src/sim/castTimeRules.ts:126` —— **少了一行 import**。
⇒ 12 個包（含 `apps/client` `apps/game-server` `apps/admin`）typecheck 全紅。
請那條 lane 補 import。

### ② 我跑 `genrun.sh contract:numbers`（#771 AC①）**順帶重生成了一份 docs 產物**

`docs/技能編輯器引擎須知 20260811.md` 的 6 行 `cv_` 內容雜湊
（`cv_0529a1eacb4b` → `cv_c753e1b24444`）—— 別的 lane 動了 `content/config/`
而這份 docs 產物還是舊的，我的驗收跑順手把它刷新了。
⭐ 這是**正確的重生成**（產生器與來源一致），⛔ 但它在我的柵欄外
⇒ **我沒有 commit 它**，留在工作樹給主 session 的 `skills:sync` 收。
⛔ 也沒有用 `git checkout` 還原（那是不可逆刪除）。

---

## 📋 守則自評

- 測試預算：`npx vitest run` **3 次**（particles 驗證 / 新守衛 / 最後合驗）＋ 突變 1 次 ·
  `pnpm typecheck` **1 次**。符合第零守則⑦。
- 新守衛 77 行 vs 實作改動 ~70 行 ⇒ 體驗層上限（≤ 實作行數且 ≤80 行）內。
- 突變一批一條，已驗紅並用 `Edit` 還原。
- commit 全程不 stage，`git commit -F … -- <逐檔列名>`。

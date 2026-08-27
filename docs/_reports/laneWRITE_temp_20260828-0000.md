# lane WRITE — GH#821 完整報告（14 頁對照表：共用寫入端 + 覆蓋率閘）

> owner 2026-08-27（逐字）：「我說過**全部都要即時動態資料讀取及儲存（by JSON）, 不是唯讀**，你這樣怎麼算驗收呢」

## ① 共用寫入端（一條路，⛔ 不是 13 種寫法）

`POST /__live/<dataset>/save`，body `{path, pointer, value}` —— 住 `tools/admin-live/middleware.mjs::handleSave`。

每個 dataset 宣告（`tools/admin-live/datasets/_TEMPLATE.md` 已記契約）：

```js
export const write = {
  kind: "source" | "overlay",     // ⭐ 承重：source 在 live 模式 403（材料側，去本機做）
  rules: [{ paths: [glob], pointers: [pointer 樣式], value: {type/min/max/enum/nullable}, why, check? }],
};
// 或
export const readonlyWhy = "能被反駁的理由";
```

寫入流程（每一步都大聲失敗）：
1. 規則比對（glob × pointer 樣式）→ 不覆蓋 ⇒ 400 附 allowed 清單
2. 宣告式 value 規格（⛔ 不是 zod —— tools/ 不在 workspace，bare import 解析不到；規格是資料）
3. live 模式 × kind:"source" ⇒ **403** 並說明「材料側去本機做」（owner「材料與結果分署」）
4. `rule.check(repoRoot, {path,pointer,value})` 跨檔驗證（cue 在 cues+audio-map / vfxKey 在 vfx 名冊 / 級名在級距表 —— 全部**從表讀**，⛔ 不寫死）
5. ⭐ 逐次 `spawnSync bash scripts/genguard.sh <path>` —— **AUTHOR ⇒ 409** 附 genguard 原文（指名擁有者與 genrun 修法）；正規化器警告附進回應 notes
6. ⭐ 落盤走 **python3 round-trip**（`json.load → 設 pointer → json.dumps(indent=2)+"\n"`），⛔ 不用 `JSON.stringify` 重寫整檔 —— 後者把 python 產生器寫的 `15.0` 全檔正規化成 `15`（e2e 實測一次 save 造出 6 行無關 churn，正是「下一次 sync/--check 打回來」的形狀）。python 保留 int/float 之別；對 node 風格手編檔輸出也逐位元組一致（三個目標檔 e2e 後 `git diff` 全空）
7. 成功 ⇒ 失效該 dataset 的 mtime 快取 + 回 `{ok, old, value, kind, notes}`（notes 含「改了 content/ 要 content:build」提醒）

`tools/review/server.mjs` 把 `mode` 傳給 `createAdminLiveMiddleware(REPO, { mode: MODE })` ⇒ 線上 sidecar 自動進 403 分支。

### 中途踩到並修掉的兩個坑
- **區塊註解裡的 `/entries/*/weight`**：`*/` 提早關掉 `/* */` ⇒ 後面整段被當程式、錯誤指到 40 行外（`低於下界` 模板字串處）。已改成 `//` 註解並留警告。
- **序列化器選錯**（上面第 6 步）—— 第一版用 `JSON.stringify`，e2e 的 git diff 抓到 churn 才換 python。

## ② 覆蓋率閘 + 突變

`packages/shared/src/ops/liveWriteCoverage.test.ts`（66 行 ≤ 80）：
- 母體從 `LIVE_ROUTES`（index.tsx）**推導**（⛔ 不手寫 14 頁清單）：regex 抓 page/label/Component → import 對照 → 逐頁掃元件檔的 `/__live/<name>` 引用（實測 14 頁 ↔ 14 datasets 1:1）
- 逐 dataset 動態 import `.mjs`：`write` 要有合法 kind（source|overlay）+ rules（paths+pointers+value.type）；否則 `readonlyWhy` ≥10 字
- **突變已驗**：把 ex-roots 的 `export const write` 改名 ⇒ 紅，訊息逐字
  「`liveExRoots（EX根源三選一）→ ex-roots：既沒有 write 也沒有 readonlyWhy —— owner 說「不是唯讀」，二選一`」⇒ 還原後綠

## ③ 端到端（改一格 → 存 → 重讀值變了 → 還原零殘留）

全部經 `tools/review/server.mjs`（GGD_REVIEW_MODE=local, port 8873）＝**出貨那條路**，⛔ 不是直呼函式：

| 頁 | 改哪格 | 寫到哪 | 證據 |
|---|---|---|---|
| ExRootsPage | `offerCount` 3→4→3、`exUnlockRound` 規則亦開 | `content/config/arena-rules.json` | 重讀=4；diff 只有一行；還原後 `git diff` 空 |
| TreasuresPage | legendary-weapons `entries/7/weight` 1→7→1 | `content/loot-tables/legendary-weapons.json` | 重讀=7；單行 diff；還原乾淨 |
| SfxMapPage | godie-e008.q `sfxKey` flaretarget3→soulpreservation→還原 | `content/abilities/godie-e008.q.json` | 重讀=新值；**單行 diff**；還原乾淨 |
| RadarOriginsPage | `byOrigin/ms/坦克` 小→中→小 | `content/config/stat-normalization.json` | old 值回讀正確；還原乾淨 |
| RadarAbilitiesPage | godie-e008.q `cooldownTier` 小→中→小（**UI 未接**，端點已可用） | 同上 ability 檔 | 同上 |

負向路徑（全部實測）：產物 target（skillremake:json 的 godie-e002.e）⇒ **409** 附 genguard 原文指名擁有者；不合法 cue ⇒ 400（「執行期會被退回通用池，存了等於謊話」）；規則外 pointer ⇒ 400 附 allowed；超上界 ⇒ 400 附 spec；唯讀 dataset ⇒ 405 附 readonlyWhy；live 模式寫 source ⇒ **403**。

**「跑 sync 值還在」**：本 lane 禁跑 `skills:sync`（全域鎖，主 session 統一跑）。機制證據：三個 source 目標全過 genguard（無 AUTHOR）；`sfxbind:build` 對 ability 檔只**讀**不寫（sync-io 的 writes 只有 cues/SUGGESTED/LEDGER 三份）；正規化器（provenance/speedtiers/castderive）各自只動自己的欄位，不碰 `sfxKey`/`weight`/`offerCount`。⚠️ 主 session 第一次跑 sync 時請順眼確認。

## ④ 寫入 UI（共用一個模板）

`apps/admin/src/ui/live/LiveEditCell.tsx`（新，一個住處）：✏️ → 輸入 → Enter/存 → POST → 成功叫 `onSaved()` 重抓（⭐ 頁上顯示的是**重讀後的值**）；伺服器錯誤（含 genguard 原文）原文攤在格子下。已接：ExRootsPage（兩格）、TreasuresPage（權重欄）、SfxMapPage（施放音欄，空＝移除、⧉ overlay 列會標「doc:」明示存的是文件的 sfxKey）。

## ⑤ 豁免清單（9 頁，每一條帶反駁法）

| dataset | 理由（縮寫 —— 全文在各檔的 readonlyWhy） |
|---|---|
| mdl-families | 全頁是 w3x 普查產物 join 推導值；家族旋鈕住 vfx-families（pitch:build 產物） |
| parallel-board | 家在 GitHub 票＋兩種產生器產物（#832 合法豁免候選） |
| lane-fences | 從票的 Files 欄推導（#833 候選） |
| locust-orbs | 左側 census 產物；右側巢狀節點，單格 pointer 定址不安全 |
| mech-templates | 所有 target 都是產生器產物（genguard AUTHOR） |
| vfx-templates | ①③產物；②model@1 視覺欄要 audition 終端證據（👁 用詞紀律） |
| skill-authoring | 建議器：輸出是骨架，頁上沒有一格是資料的家 |
| skill90 | drift 稽核：規格側住 batch1.py（程式）、出貨側是 skillremake:json 產物 |
| （ping） | 不在 LIVE_ROUTES ⇒ 不在母體 |

可寫 5：ex-roots · treasures · sfx-map · radar-origins · radar-abilities（後者 UI 未接，逐頁票接手）。

## ⑥ ticket-lint 引言動詞警告（Scope ③）

`scripts/ticket-lint.sh::lint_deep` 新段：body 有 `> 引言` 時，`VERB_COVER` 表（儲存/寫入/讀取/產生/同步/更新/刪除/備份/還原/rollback/驗收/部署 ＋ 各自同義詞）逐動詞對 AC 段 —— 沒覆蓋 ⇒ **ℹ️ soft 警告**（⛔ 不擋，exit 0）。實測：引言含「儲存」而 AC 只寫「讀取顯示」⇒ 警告點名「儲存」並引 #775 根因；AC 補「儲存→重讀」⇒ 靜默。既有 `ticketLint.test.ts` 4 條全綠。

## 測試預算帳

vitest run ×2（①新閘+ticketLint 一起 ②突變）；tsc：pnpm typecheck ×1（抓到 3 個 TS 嚴格錯，修掉後只重驗受影響兩包）；突變 ×1（覆蓋率閘那條）。新測試 66 行。

## 柵欄外餘量

`docs/_reports/` 本報告（柵欄唯一例外）。⛔ 未動：apps/client、apps/admin/src/configForms、apps/game-server、CLAUDE.md、docs 其餘。`packages/shared/src/ops/ticketLint.test.ts` 工作區有別條 lane 的既有改動 —— **沒有掃進本 commit**。e2e 的 content/ 改動全數還原（`git status -- content/` 空）。

# 分支稽核：`feat/ability-review-authoring` 與 `feat/ability-review-authoring-main-sync`

> ⭐ **唯讀稽核**。⛔ 沒有 commit／push／`skills:sync`／部署，⛔ 沒有改任何檔案（本報告除外）。
> ⭐ 基準：`origin/main` = `91cf16c65`（`fix(gates): ⏱ 撥號的期限變成了整條連線的期限 (#1009)`）。
> ⭐ 每一條結論附 `檔案:行號` 或 blob 比對，⛔ 不引用印象。
> 比較一律用 **`git diff origin/main...<branch>`（三個點）** —— 只看分支相對 merge-base 做了什麼。

---

## 〇、⭐ 一句話結論

| 分支 | ahead | 最後 commit | 結論 |
|---|---:|---|---|
| `origin/feat/ability-review-authoring` | 5 | 2026-09-04 | ⛔ **STALE** —— 合併會**打壞出貨內容驗證**（`config.authoring-rules@1` 撞號），並回捲 6 份 main 已長大的文件 |
| `origin/feat/ability-review-authoring-main-sync` | 1 | 2026-08-31 | ⛔ **STALE**（近似 ALREADY-IN）—— 同一條 lane 的**舊快照**，main 每一個共同檔都更新更大 |

⭐ **兩條都是 Codex Editor lane 的前身。那條 lane 已經改走
`feat/editor-seam-20260902@4ec5e676` 並且已經併進 main** ——
證據：`main_load_editor_plan.md`（main 版）第 2 行「Revision 6.4」、第 6 行
「最後驗證：**2026-09-04 16:05**」、第 12 行逐字寫著
「Codex Editor 已整合 `origin/feat/editor-seam-20260902@4ec5e676`」。
⇒ 那比 B1 最新的 commit（2026-09-04 **00:09**）還新 **16 小時**。

⭐ 旁證：`CanLin`（兩條分支的作者）自 2026-08-30 起在 **main 上有 123 個 commit**
（`git log --format='%an' origin/main --since=2026-08-30 | sort | uniq -c`）——
⇒ 作者的工作**一直在進 main**，只是不經由這兩條分支。

---

## 一、`origin/feat/ability-review-authoring`（B1）—— ⛔ **STALE**

### 1-A 事實

| | |
|---|---|
| ahead / behind | **5 / 1784** |
| merge-base | `9e5cc3785`（**2026-08-14 01:53**）`docs(codex): 待填 Excel 重生成並列進索引` |
| 三點 diff | **83 檔 · +10,851 / −1,643**（含 `pnpm-lock.yaml` +2,252） |
| 是否為 main 祖先 | `git merge-base --is-ancestor` → **NO** |

**五個 commit：**

| sha | 日期 | 內容 |
|---|---|---|
| `123ead396` | 2026-08-30 15:21 | `feat(editor): add ability review and authoring workflow` —— **主體**（editor 面板、`authoring/` 四支 shared 模組、content-api sidecar 路由、editor-desktop、`authoring-rules.json`） |
| `f3d7fb9a2` | 2026-08-31 02:53 | `docs: add Codex project migration handoff`（`docs/ai-context/` 6 份） |
| `362ee48a3` | 2026-08-31 02:58 | `docs: add single-file Codex pickup guide`（`CODEX_PROJECT_PICKUP.md`） |
| `58106a208` | 2026-08-31 03:18 | `docs: harden Codex project pickup` |
| `44acb3fdf` | 2026-09-04 00:09 | `docs(editor): plan automated hero forge`（`docs/editor-contract/英雄自動鑄造計劃書.md`，442 行）—— ⭐ **唯一真正新的東西** |

⭐ 逐檔分類（83 檔）：**ABSENT-MAIN 42 · ON-MAIN-DIFF 40 · IDENTICAL 1**
（唯一逐位元相同的是 `apps/editor-desktop/src/preload.ts`）。

### 1-B ⛔⛔ 阻塞：`config.authoring-rules@1` **同一個 schema tag，兩套不相容的欄位**

⭐ 這是「合併就會壞掉」的那一條，⛔ 不是風格問題。

| | main（出貨中） | B1 |
|---|---|---|
| Zod | `packages/shared/src/content/schema/config/authoringRules.ts:238`（`zConfigAuthoringRulesDoc`，literal 在 `:241`） | `packages/shared/src/content/authoring/authoringRules.ts:9`（`zAuthoringRulesConfigDoc`，`.strict()`） |
| 進 union | `packages/shared/src/content/schema/config/index.ts:439`（import `:162`） | `packages/shared/src/content/schema/config.ts:5430`（import `:80`） |
| 出貨 JSON 欄位 | `singleTargetCooldown` · `aoeCooldown` · `transformCooldownMin` · **`proportionality`**（`model`/`expectedHits`/`aimRiskMult`/`minDamageTier` 十五格/`maxTiersAboveMin`） | `enabled` · `mana{singleTargetBase,roundTo,rangeMultiplier}` · `cooldown{targeted,area,transformMinimum,longDurationThreshold}` · `duelRadius` |
| 血緣 | GH#327（2026-08-14 `91502b5f3`）→ #465（08-20）→ #447（08-21）→ **#616（08-23 `6fe0c8c8f`）** | 分支自建 |

⭐ 兩份 JSON 的 `id` 與 `schema` **逐字相同**，欄位集合**交集為空**。

**合併之後會發生什麼（兩個方向都壞）：**

1. **union 撞號** —— `z.discriminatedUnion("schema", …)` 出現**兩個** literal 為
   `config.authoring-rules@1` 的成員 ⇒ ⭐ **schema 模組載入時就擲例外**，
   ⛔ 不是「某一份文件驗不過」而是整個 `@ggd/shared/content` 起不來。
2. **就算人工把 union 那一行拿掉** —— B1 的 `content/config/authoring-rules.json`
   會覆蓋 main 的那一份，而 main 的 `.strict()` schema 收不下
   `mana`/`duelRadius` ⇒ **內容驗證整份失敗 ⇒ fail-open 退回 2 隻骨架英雄**。
   ⭐ 那正是 CLAUDE.md 記錄的 **2026-08-02 生產事故形狀**。

⭐ **而且會連坐 main 的四個消費端**（它們讀的是 main 的欄位形狀）：

- `packages/shared/src/content/newHeroChecks.ts:243`、`:337`（`principle-band` 稽核讀 `singleTargetCooldown`/`aoeCooldown`）
- `packages/shared/src/content/cooldownTiers.ts:115`
- `packages/shared/src/content/damageTiers.ts:103`（相稱性）
- `apps/admin/src/configForms/specs/authoring.ts:55-56`（**後台那一格表單**）

⇒ ⭐ 合併 B1 = 把 GH#465／#616 的相稱性上下限閘連同它的後台欄位一起拆掉。

### 1-C ⛔ 合併會**刪掉／回捲** main 已經長大的文件

B1 分支自己把這幾份**改小**了，而 main 之後把它們**改大**。三點 diff 只看得到「B1 做了什麼」，
⛔ 看不到 main 同期做了什麼 —— 所以下表是逐版行數實測：

| 檔 | merge-base | B1 | **main（今天）** | 合併 B1 的後果 |
|---|---:|---:|---:|---|
| `GGD_EDITOR_PACKAGE_SPEC.md` | 623 | **139** | **689** | ⛔ **砍掉 ~550 行對外契約** |
| `main_load_editor_plan.md` | 843 | 439 | **104** | ⛔ 用舊 revision 蓋掉 **Revision 6.4（2026-09-04 16:05）** |
| `LEGENDARY_WEAPON_FULL_AUDIT.md` | 139 | **64** | 139 | ⛔ 刪 75 行 |
| `OPEN_HERO_WHITELIST.md` | 84 | **68** | 84 | ⛔ 刪 16 行 |
| `docs/_castability-128.md` | 170 | 159 | **216** | ⛔ 回捲 |
| `docs/_codex-handoff.md` | 191 | 203 | **298** | ⛔ 回捲 |
| `README.md` | 1463 | 1464 | **2072** | ⛔ 回捲 |
| `AGENTS.md` | 0 | 64 | **170** | ⛔ 蓋掉 2026-09-05 剛立**帶閘**的版本（`207c3d490` 逐字「`AGENTS.md` 有閘了」，#988 #986） |

⚠️ 這些檔 `bash scripts/genguard.sh` 全部回「沒有產生器擁有者」⇒ 它們是**手編檔**，
⛔ 沒有產生器可以把被刪掉的內容重生成回來。

### 1-D 產生器產物：⭐ 差異是「來源已在 main，產物過期」

`bash scripts/genguard.sh` 逐一問過：

| 檔 | genguard 回答 |
|---|---|
| `content/bundle.json` | 🚫 產生器 **`content:build`** 的產物 |
| `content/manifest.json` | 🚫 產生器 **`content:build`** 的產物 |
| `content/config/_index.json` | 🚫 產生器 **`content:build`** 的產物 |
| `content/config/authoring-rules.json` | ✓ 沒有產生器擁有者（**手編檔** —— 所以 1-B 的衝突是真的內容衝突） |

⇒ 前三份的 diff（+1/−1、+3/−3、+7/−1）只是「B1 加了一份 config 之後重跑 build 的副產物」，
⛔ **沒有獨立價值**，合併它們只會製造 stale 產物。

### 1-E main 今天有沒有等價內容？（42 個 ABSENT-MAIN 逐群查證）

| 群 | B1 的檔 | main 的對應 | 判定 |
|---|---|---|---|
| **匯出器** | `apps/editor/src/export/packageBuilder.ts`（447 行，`ExportableCollection = "abilities" \| "items"`:21、`buildEditorPackage`:277、`deterministicPackageZip`:397） | `apps/editor/src/export-center/exportBuilder.ts`（`RuntimeAuthoringCollection = "abilities" \| "items"`:28、`buildRuntimePackage`:199、`deterministicStoredZip`:533、`zEditorImportPackage`:390、`validateDoc`:472） | ⭐ **同一血緣的後繼者**，main 更完整（多了 delta closure `:136`、base snapshot `:424`、binary asset `:67`）。⚠️ 而**兩者有完全相同的限制**（只含 abilities+items）⇒ ⛔ 合併 B1 **修不了**今天計畫書的 G5 |
| **effect graph** | `packages/shared/src/content/authoring/effectGraph.ts`（493 行）＋ `abilityAuthoring.ts` · `itemAuthoring.ts` | ⛔ main **沒有**。⭐ 但 main 的 `packages/shared/src/content/authoring/primitives.ts` 檔頭逐字記著 owner **2026-08-15 的裁決**：「**B 群不必要**」「寫好的也先不要刪掉 避免以後要撿回來用」 | ⛔ **這正是 owner 已經封存的那一群** —— 合併等於把它復活 |
| **desktop 殼** | `apps/editor-desktop/*`（`remoteWorkspace.ts` 676 行、`main.ts` 300 行） | ⭐ main **已有且更新**（`remoteWorkspace.ts` **884** 行、`main.ts` **424** 行，另有 `scripts/smoke-packaged.mjs` + 測試）。血緣：`7e83f6711`(09-02) → `9a44b7926` → `cdbc4b1f0` → `3ffb4ef60` → `2143d5da3`(09-02) | ⭐ **ALREADY-IN 且已超越** |
| **content-api sidecar** | `server.ts` 的 `/content-api/editor-authoring/abilities/:id` GET/POST/PUT、`/content-api/editor-source`、remote asset read-through | main 走 `apps/content-api/src/editorSourceRoutes.ts`（+ `editorSourceNoRemoteExec.test.ts` · `editorSourceSurvivesSync.test.ts` · `productWriteGuardCoversEveryRoute.test.ts` · `remoteAsset.test.ts`），`server.ts` **1012** 行 vs B1 **755** 行 | ⭐ **重新實作且更嚴**（多了產物寫入保護與逐路由覆蓋閘）。抽樣 26 條 B1 新增行，**21 條不在 main** ⇒ 路徑名不同，但職責已被覆蓋 |
| **review／audit 面板** | `abilityAudit.ts` · `skillReview.ts` · `abilityReviewRecord.ts` · `abilityNavigation.ts` · `authoringPolicy.ts` · `api/runtimeContract.ts` · 5 個 `views/*Badge/Panel` · `forge/EffectGraphWorkbench.tsx` · `preview3d/AbilityCombatPanel.tsx` | ⛔ 檔名層級 main **零命中**。⭐ 但 main 有整個 `apps/editor/src/vfx-forge/`（**40+ 檔**：`appearanceReview.ts` · `simTraceReview.ts` · `visualAcceptanceIssues.ts` · `proofAutomation.ts` · `acceptanceSources.ts` …）＋ `forge/skillReasonableness.ts` · `skillAcceptanceCatalog.ts` | ⭐ **職責已被 vfx-forge/forge 覆蓋並大幅超越**（main `apps/editor/src` = **183 檔**） |
| **參考文件閘** | `tools/editor-contract/refresh-reference-docs.mjs`（88 行）＋ `packages/shared/src/ops/editorReferenceDocsFresh.test.ts` | main 有 `tools/editor-contract/gen_contract_numbers.py` · `gen_editor_coverage.ts`（`editorcov:build`/`editorcov:check`）＋ `apps/content-api/src/externalContractIndex.ts` · `apps/editor/src/readmeContract.test.ts` | ⭐ 同職責已有出貨閘 |
| **AI 交接文件** | `docs/ai-context/{ARCHITECTURE,DECISIONS,MIGRATION_AUDIT,MIGRATION_MANIFEST,PROJECT_HANDOFF,ROADMAP}.md`（~840 行）＋ `CODEX_PROJECT_PICKUP.md`（239 行） | ⛔ main **沒有 `docs/ai-context/`**。⭐ 但 main 有 `AGENTS.md`(170) ＋ `CODEOWNERS` ＋ branch-protection 存取腳本（`0e1295353` / `207c3d490`，#988 #983），且**帶閘** | ⚠️ **部分獨有**，但寫於 2026-08-31、base 為 08-14 ⇒ 內容描述的是 1784 個 commit 之前的 repo，⛔ 直接合併等於引入一份**開箱即過期**的架構描述 |
| ⭐ **鑄造計劃書** | `docs/editor-contract/英雄自動鑄造計劃書.md`（442 行，2026-09-04） | ⛔ main 沒有等價文件 | ⭐ **唯一真正獨有且今天仍有價值的東西** —— 見第三節 |

### 1-F ⇒ **STALE**

合併會刪到：**GGD_EDITOR_PACKAGE_SPEC.md ~550 行**、`main_load_editor_plan.md` Revision 6.4、
`AGENTS.md` 帶閘版本、`LEGENDARY_WEAPON_FULL_AUDIT.md` 75 行、`OPEN_HERO_WHITELIST.md` 16 行，
並**打壞 `config.authoring-rules@1`**（1-B）。

⭐ **正確處置**：關掉分支，⛔ 但**先把 `docs/editor-contract/英雄自動鑄造計劃書.md`
單獨 cherry-pick／另存**（`git show origin/feat/ability-review-authoring:"docs/editor-contract/英雄自動鑄造計劃書.md"`）——
⛔ 它是這 5 個 commit 裡唯一今天還有價值的產出，而關分支會讓它消失。

---

## 二、`origin/feat/ability-review-authoring-main-sync`（B2）—— ⛔ **STALE**（近似 ALREADY-IN）

### 2-A 事實

| | |
|---|---|
| ahead / behind | **1 / 573** |
| merge-base | `e5a522c87`（**2026-08-31 05:22**）`chore: 戰情表輪替` |
| 唯一 commit | `47aacee9f`（2026-08-31 05:35）`feat(editor): catch desktop authoring up to main contract` |
| 三點 diff | **44 檔 · +6,446 / −477**（含 `pnpm-lock.yaml` +2,255） |
| 是否為 main 祖先 | **NO** |

⭐ 它就是 B1 的「往 main 對齊」版本：`content/config/authoring-rules.json` 在 B2 上與 main
**逐位元相同**（blob `189fd41bedd51e2d3fd8188e19ba55770a6dc175`）⇒ ⭐ **B2 沒有 B1 的撞號問題**
（它也**沒有**碰 `schema/config.ts`）。

### 2-B ⭐ 已經在 main 的部分

| B2 的改動 | main | 證據 |
|---|---|---|
| `package.json` 加 `editor:desktop` / `:mac` / `:win` 三支 script | ⭐ **逐字已在 main** | `git show origin/main:package.json` **97–99 行** |
| `apps/editor-desktop/*` 整包 | ⭐ 已在且更新 | `remoteWorkspace.ts` main **884** vs B2 **717**；`main.ts` main **424** vs B2 **300**；main 另有 `scripts/smoke-packaged.mjs` |
| `apps/editor/src/forge/ConditionEditor.tsx` | ⭐ 已在且更大 | main **1253** 行 vs B2 **1138** 行 |
| `apps/editor/src/export/runtimePackage.ts` | ⭐ 由 `export-center/exportBuilder.ts` 取代 | 見 1-E |
| `apps/content-api/src/remoteAsset.test.ts` | ⭐ 已在 main（內容不同） | `git ls-tree origin/main -- apps/content-api/src` |

⭐ **量到的重疊率**（抽樣 B2 新增行、逐行 `grep -F` 比對 main 同名檔）：

| 檔 | 在 main | 不在 main |
|---|---:|---:|
| `apps/editor-desktop/src/main.ts` | **33** | 7 |
| `apps/editor-desktop/src/remoteWorkspace.ts` | **21** | 19 |
| `apps/content-api/src/server.ts` | 16 | 24 |
| `apps/editor/src/api/client.ts` | 6 | 34 |
| `apps/editor/src/views/EditorView.tsx` | 2 | 35 |

⇒ ⭐ desktop 那一半**確實已經落地 main**；editor UI 那一半沒有，
⛔ 但 main 的同名檔**每一支都更大更新** ⇒ 那是「main 走了另一條路」，⛔ 不是「main 缺這一段」。

### 2-C ⛔ 真正獨有的只有一支

`packages/shared/src/content/authoring/abilityReview.ts`（49 行）——
`ability-review-record@1`（`zOwnerIssueRecord` / `zResolvedDescriptionEdit` / `zAbilityReviewRecord`），
檔頭逐字：「Editor-only Owner prose receipt. It is stored under `data/`, never `content/`.」

`git grep "ability-review-record@1" origin/main` → **零命中** ⇒ main 沒有這個 schema。
⚠️ 但它**只是一份 schema**：B2 裡消費它的 `apps/editor/src/abilityReviewRecord.ts`(124 行)
與 `views/AbilityReviewPanel.tsx`(63 行) 都建立在 B2 版的 `EditorView.tsx`(155 行) 上，
而 main 的是 169 行的另一份 ⇒ ⛔ **接不上，要重接**。

### 2-D ⇒ **STALE**

⭐ **理由**：它是 2026-08-31 對「當時的 main」做的一次追平；那之後 main 上同一條 lane
又跑了 573 個 commit（含 09-02 的 desktop 五連發與 09-04 的 export-center 自動化），
⛔ **這份追平自己已經落後了**。合併它會用 717 行的 `remoteWorkspace.ts` 蓋掉 884 行的、
用 1138 行的 `ConditionEditor.tsx` 蓋掉 1253 行的。

⭐ **正確處置**：關掉。⛔ 但若日後要做「Owner 文案審閱收據」，
`abilityReview.ts` 的 49 行 schema 值得單獨撿回來（⛔ 不要連 UI 一起搬）。

---

## 三、與 `docs/plans/community-authoring-20260905.md` 的重疊／衝突

⭐ 兩份文件**主題相鄰但不同**：

| | 今天的計畫（190 行） | B1 的鑄造計劃書（442 行） |
|---|---|---|
| 主題 | **社群英雄創作與審核發布** —— 玩家投稿 → 後台審核 → 上架 | **英雄自動鑄造** —— 少量輸入 → LLM 提案 → 確定性執行 → 封包 |
| 立場 | ⭐ 「投稿的伺服器端**已經存在**，⛔ 不要重做」（§一標題） | 「提案，待依里程碑實作」（第 3 行） |
| 證據密度 | 每一列附 `檔案:行號` | ⛔ 無行號 |

### 3-A ⭐ 重疊（**三段，逐段點名**）

| B1 §  | 今天的計畫 § | 重疊的內容 |
|---|---|---|
| **§9 完整英雄封包**（`:238–270`，含 §9.1 契約版本 · §9.2 建議內容） | **§1-A**「匯出已用共用 validator」列 ＋ **§1-B G5**「匯出包只含 abilities + items」 | 兩邊都在定義「一個英雄要包成什麼」。⭐ 今天的計畫**已經量到**這件事今天做不到（`exportBuilder.ts:28`），⛔ 而 B1 的 `packageBuilder.ts:21` 有**一模一樣的限制** ⇒ 合併 B1 **不會**關掉 G5 |
| **§10 主程式接收、拆包與啟用**（`:271–296`，§10.1 操作狀態 · §10.2 安全匯入順序） | **§1-A**「耐久覆蓋層」「逐份驗證」「產物寫入保護」「冪等鍵」＋ **§1-B G2/G8** | ⭐ **這一段是純重做** —— 今天的計畫證明 `contentoverlay.go` · `/validate-single`(`importRoutes.ts:865`) · `registerProductWriteGuard`(`editorSourceRoutes.ts:182`) · `x-ggd-operation-id`(`importRoutes.ts:937`) **全部在跑** |
| **§11 權限、稽核與失敗處理**（`:297–306`，`draft`/`validate`/`upload`/`activate`/`curate`/`rollback` 分權）＋ **§H7 原子啟用、健康檢查、發布與回滾**（`:375`） | **§1-A**「投稿端點帶 JWT」「配額」「裁決有真名與時間」「後台審核頁已存在」＋ **§1-B G2/G7/G12** | ⭐ 同上：`submissions/handlers.go:85` · `auth/middleware.go:108-120` · `submissions.go:51-53` · `DecidedBy/DecidedAt :122,:267` · `SubmissionsReviewPage.tsx` 都已存在 |

⭐ **另外 B1 §12.1「可直接重用」與今天的 §1-A「可以沿用的」是同一張表的兩個版本** ——
⛔ 而 B1 那一份的基準是 2026-08-14，今天那一份的基準是 `64f44999b`。

### 3-B ⛔ 衝突（**方向相反的一句**）

> 今天的計畫 §一 標題：「⭐ **最重要的一句：投稿的伺服器端已經存在，⛔ 不要重做**」
> B1 §H7：「原子啟用、健康檢查、發布與回滾」＝ **把那一層再做一次**

⭐ 根因不是誰對誰錯，是 **B1 的 base 是 2026-08-14** ——
它成文時 `submissions` / `contentoverlay` / `package digest` / 後台審核頁都還沒進 main。
⇒ ⛔ **把它當成待辦讀，就會去重做 12 個已經在跑的能力**（今天的計畫 §1-A 逐條有行號）。
⚠️ 這正是 CLAUDE.md 記過的形狀：**一份過期的散文活過了它的保存期限，而沒有任何東西變紅。**

### 3-C ⭐ 不重疊（B1 真正獨有、今天的計畫**零命中**）

`grep "鑄造\|LLM\|自動生成\|英雄創作" docs/plans/community-authoring-20260905.md` → **只有標題那一行**。

| B1 § | 內容 |
|---|---|
| **§3.1 最少輸入**（`:39`） | 名稱＋一句概念＋招式名 ⇒ 生成可玩初稿；未填的一律標「假設」並顯示信心 |
| **§3.3 欄位狀態與重生規則**（`:71`） | 逐欄位鎖定／局部重生／diff |
| **§5 LLM 使用政策**（`:142–165`） | ⭐ §5.1 建議 · §5.2 **禁止成為權威** · §5.3 無 LLM 模式仍可完成 |
| **§6 模板推薦與自動生成**（`:166–195`） | 推薦排序輸入 · 六個技能槽 · 預算與自動調整 |
| **§8.2 場景矩陣**（`:222`） | SimWorld trace 為 gameplay 權威，與 3D 預覽不一致就擋發布 |

⭐ **這五節與今天的計畫沒有任何重疊**，而且 §5.2「LLM ⛔ 不具執行權威、
所有數值生成與編譯由版本化 Script 與 Schema 決定」與 CLAUDE.md 第〇·五守則同向。
⇒ ⭐ **這是關分支前一定要保住的部分。**

---

## 四、⭐ 建議動作（⛔ 待 owner 裁決，本輪未執行任何一項）

| # | 動作 | 為什麼 |
|---|---|---|
| 1 | ⭐ **先另存** `docs/editor-contract/英雄自動鑄造計劃書.md`（B1 `44acb3fdf`） | 唯一今天仍有價值的獨有產出；⛔ 關分支它就消失 |
| 2 | 另存 `packages/shared/src/content/authoring/abilityReview.ts`（B2，49 行） | `ability-review-record@1` main 零命中 |
| 3 | ⭐ 存好之後**兩條都關掉**（`git branch -D` 遠端對應） | 見 1-F / 2-D |
| 4 | ⛔ **不要** `git merge` 任何一條 | 1-B（撞號打壞內容驗證）＋ 1-C（刪 main 已長大的 6 份文件） |
| 5 | ⭐ 存回來的計劃書要**加一段前言**：§9/§10/§11/§H7 已被 `docs/plans/community-authoring-20260905.md` §1-A 取代 | ⛔ 否則下一輪讀它的人會去重做 12 個在跑的能力（3-B） |

⚠️ 依 CLAUDE.md「lane 的 commit 要真的進 main」那一節：
⭐ **決定丟掉才叫 `git branch -D`，⛔ 忘記不算** —— 所以第 1、2 項要先做完。

---

## 五、⚠️ 這次稽核踩到的兩個量測陷阱（留給下一輪）

1. ⭐ **`git rev-parse <tree>:<不存在的路徑>` 會把參數原樣印到 stdout**
   ⇒ `a=$(git rev-parse … 2>/dev/null || echo NONE)` 的 `$a` **不是 NONE**
   ⇒ 我第一版把 83 個檔**全部**判成「on-main」。⭐ 正解是 `git cat-file -e`。
2. ⭐ **這台是 zsh**：`$B2:apps/x.ts` 裡的 `:a` 被吃成 zsh 的 **absolute-path modifier**
   ⇒ 路徑變成 `…-main-syncpps/x.ts`、`wc -l` 回 **0**
   ⇒ ⛔ 差點得出「B2 這個檔是空的」。⭐ 正解是 `${B2}:apps/x.ts`（加大括號）。

⚠️ 兩個都符合 CLAUDE.md「一條綠燈有四種假的來源」的形狀：
⭐ **量尺在特定方向上是瞎的，而它的輸出讀起來跟真的一模一樣。**

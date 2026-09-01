# 給 GGD main：Editor 剩餘接縫差異單（可直接交給 Codex）

狀態：**Revision 3 — 依 `origin/main@de7006c6` 重新逆向審查**

審查時間：**2026-09-02 07:23（Asia/Taipei）**

Editor 分支：`feat/vfx-forge-codex`（禁止推到 `main`）

> 這不是叫 Main 重做 Editor，也不是沿用 2026-09-02 清晨那份 512 行願望清單。
> Main 已完成的部分已全部移除；以下只留下目前程式碼仍無法形成
> 「本機編輯 → JSON／ZIP → 驗證 → 人工批核 → 真正載入遊戲 → 可回捲」閉環的接縫。

Main 開工時請在自己的 feature branch 讀取：

```bash
git fetch origin
git show origin/feat/vfx-forge-codex:docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md
git show origin/feat/vfx-forge-codex:main_load_editor_plan.md
```

## 0. 已完成，請不要重做

`origin/main@de7006c6` 已有以下骨架；後續應補強原實作，而不是另開第二套：

- runtime-direct `authoringProcessor`、處理器指紋與 optional `expectedCompiled`；
- JSON Package 與 bounded ZIP transport，含 central-directory preflight、zip-slip、重複／大小寫碰撞、
  壓縮比、CRC 與 trailing-data 防護；
- `/validate`、`/apply`、`/rollback`、`/active`、`/active/runtime-bundle`、`/operations/:id`、
  `/audit`、`/health`、`/capabilities` 路由骨架；
- immutable candidate、PREPARED tree、fsync、ACTIVE pointer CAS、operation idempotency 與 rollback 骨架；
- `GET/POST /content-api/editor-source`、generator-owned 產物直接寫入 guard、來源 CAS 與 regenerate；
- AI／Editor proposer 與 Admin 分權、通過與 Promote 分開、candidate digest 綁定、
  `editor-capability-fixture` 永久不可 Promote；
- `content/assets-manifest.json` 的「已被內容引用資產」清單；
- `effectiveVfxLimits` resolver。Editor 必須讀回傳值；目前出貨值是
  `1200 / 600 / 10 / 0.2 秒 / 5 秒 / 96 / full`，不要把先前討論的 `0.25` 寫成另一份常數。

## 1. P0：Importer 現在仍會把「沒有真正驗過的內容」標成 validated

### 1.1 目前量到的缺口

`packages/shared/src/content/import/validatePackage.ts` 現在只做 envelope、處理器指紋、hash、
Base pin、隱式刪除、ref closure 與 `manifest.requiredCapabilities[]` 比對；但它沒有：

1. 對每份 `documents[].document` 執行 `COLLECTIONS[collection].schema.safeParse()`；
2. 執行 `ggd-authoring-rules@1` 的 hard rules；
3. 從文件內容自行推導 required capabilities，而是相信 package 自己列的陣列；
4. 從文件內容自行收集資產引用並對 asset manifest 驗 path／hash／類型；
5. 驗證 `path ↔ collection ↔ id ↔ schema ↔ manifest entry ↔ change kind` 一致且一對一；
6. 以完整 staged snapshot 跑遊戲實際的 loader／index／duplicate-VFX guards。

因此 profile 宣稱 `validatedBy: zod + capabilities + authoring-rules`，但真實 importer 沒有完成
這三段。這是 blocker，不可只改 profile 文案。

### 1.2 請補在同一支 validator pipeline

- collection 必須在 machine registry allowlist；未知 collection／schema 一律拒絕。
- 每份 document 用遊戲 loader 使用的同一份 Zod；filename stem、document.id、entry.id 必須相同。
- manifest entry、document、change 各自不得重複，也不得有未被另一邊描述的孤兒。
- required capabilities、hard refs、資產引用由 server 從 document 推導；manifest 只能作交叉比對，
  不得當真相來源。
- hard authoring rules 擋下；principle rules 只產生 warning，並保留逐 code 人工接受記錄。
- staging 完成後，用與遊戲啟動相同的 loader 載入整棵 snapshot；任何隔離、無效 ref、
  重複 VFX 出生、index／manifest 不一致都拒絕。
- diagnostics 必須保留 collection、id、JSON pointer、code 與中文說明，供 Admin 頁直接顯示。

### 1.3 必須新增的變異守衛

1. 把 ability 的 `schema` 改錯、刪必填欄位或放非法 effect，`/validate` 必須 422。
2. 文件使用一個 capability，但 package 把 `requiredCapabilities` 留空，仍必須 422。
3. 文件引用不存在或 hash 不符的 GLB／PNG／VFX，仍必須 422。
4. entry 寫 `abilities/a`、document.id 寫 `b`，仍必須 422。

## 2. P0：現在的 ACTIVE 不是完整 snapshot，也沒有遊戲消費端

### 2.1 目前量到的缺口

- `ImportStore.prepare()` 只把本次 package 的 documents 寫入 staging，沒有把 delta 套到 ACTIVE Base。
- 現有 route test 第二次 apply `hero.w` 後，反而斷言 `hero.q` 不存在；這證明目前語意是
  「用 delta 取代整棵樹」，不是 delta。
- `readBaseFacts()` 的文件分母讀可變的 `content/bundle.json`，active digest 卻來自 import store；
  Base 的內容與 digest 不是同一個 snapshot。
- repo 中沒有遊戲 client／game-server 讀取 `data/content-import/active.json` 或 staging tree 的消費端。
  因此 API 回 `status: activated` 只代表 importer 換了自己的指標，**不代表遊戲實際生效**。
- `apps/content-api` 明確拒絕在 production 啟動；Go platform 的 Promote 即使重驗成功，
  目前也只寫 `submission-promotions`，沒有呼叫 apply、沒有 activation receipt。

### 2.2 請完成真正的 immutable snapshot 與 runtime handoff

- bootstrap：從出貨 full Base 建立第一棵完整 immutable snapshot，不可只放 package 中的一份技能。
- delta：以 exact ACTIVE tree 為底，套用 changes 後生成**完整新樹**；未變更文件必須保留。
- full：包必須覆蓋 allowlisted authoring corpus；缺件依 V1 禁止 delete 規則拒絕。
- 每棵 snapshot 重建全部 collection index、manifest、contentVersion、collection hashes、
  authoringDigest 與 activationDigest；`active/runtime-bundle` 回這同一棵完整資料。
- validate、apply 與 Base profile 全部讀同一個 ACTIVE snapshot，不得一半讀 `content/bundle.json`。
- game-server／client 必須由一個 Main 擁有的 adapter 真正切換到 ACTIVE；若需重啟，回
  `activated-awaiting-reload`，健康檢查確認新 digest 被 runtime 讀到後才回 healthy。
- rollback 必須讓 runtime 回到前一棵 snapshot，並以讀回的 runtime digest 驗證，不只換 JSON pointer。

### 2.3 Production 拓撲請一次定案

保留現在的 dev-only content-api 給本機 Editor；不要把它直接暴露到 production，也不要放寬
loopback guard。Production 另由 authenticated Admin gateway 呼叫 internal importer worker／library：

```text
Electron Editor（本機、無 production credential）
  → 匯出 Package JSON／ZIP 或送 proposal
  → Platform Admin（上傳、審查、明確 Promote）
  → internal importer（validate／prepare／CAS／activate）
  → game runtime read-back
```

Go platform 的 Promote 成功回應至少要保存 `operationId`、`packageDigest`、`planDigest`、
`activationDigest`、runtime health digest、actor 與時間；沒有真正 apply 成功不得標 `promoted=true`。

### 2.4 必須新增的閉環守衛

1. bootstrap A，delta B 後 runtime bundle 同時含 A+B；回捲後只回到前一棵完整樹。
2. apply 回 activated 後，game runtime 讀到相同 activation digest；拔掉 runtime consumer 測試會紅。
3. crash 在 PREPARED／pointer swap／reload 任一步，都只能看到舊完整樹或新完整樹。
4. Promote 的 candidate 在 validate 後改一個 byte，或 Base 在 apply 前改變，必須 409 且不套用。

## 3. P0：VFX Forge 的正式 authoring representation 還沒有接進 Package

Main 已出貨 `vfx-script@1` 與 `content/vfx-scripts/`，Editor 的八招 fixture 也只寫這個 collection；
但 importer schema 現在只有含糊的 kind=`vfx`，target profile 又固定
`authoringModel.accepts = [ability@1, item@1]`、`vfxDocumentAuthoring=false`。

請不要把 `vfx@1` emitter 與 `vfx-script@1` timeline 混成同一個 kind。新增一份小型、
machine-readable representation registry，至少列：

| package kind | collection | document schema | runtime policy | promotion policy |
| --- | --- | --- | --- | --- |
| `ability` | `abilities` | `ability@1` | runtime-direct | manual／AI-review-required 依 origin |
| `item` | `items` | `item@1` | runtime-direct | manual／AI-review-required 依 origin |
| `vfx-script` | `vfx-scripts` | `vfx-script@1` | presentation-only；有 script 時取代預設綁定 | **review-required** |
| `vfx` | `vfx` | `vfx@1`／`ribbon@1` | planned 或 owner-only | 不可被上一列代替 |

Importer 的 schema、profile、path mapper、source policy、Admin diff 與 audit 全部從這張 registry 推導，
不可各寫一份陣列。`vfx-script` 驗證另須：

- abilityId 存在且和 package／Base exact ref 對得上；
- timeline event 是當前 capability 支援的真實事件；
- 引用的 VFX／model／sound 存在且符合 effective limits；
- script 與 ability default binding 不會同一顆特效出生兩次；
- 不可修改 ability 的傷害、次數、目標或行為時序。

八招驗收內容維持 `kind=editor-capability-fixture`，永遠不可 Promote；production candidate 才能在
人工審查後走正式 `vfx-script` apply。

## 4. P0：後台批核頁有按鈕，但還看不到足以批核的內容

`SubmissionsReviewPage` 現在只顯示 id、kind、digest、狀態、原因與三個按鈕；這不足以審查
AI 產技能／動畫／特效。請在同一頁加入：

- candidate 原始文件與結構化 before/after diff；
- validator diagnostics、capability／asset／budget 結果與 Owner issue；
- 來源、Base profile digest、processor fingerprint、candidate hash；
- 固定 camera／seed／場景的逐秒或關鍵幀圖片、事件時間線、預期 vs 實際觸發數；
- 人工 0–10 分、視覺自動審查 0–10 分與逐項原因；
- 不透明貼圖／魔法陣背景、alpha mode、超 budget、缺模型、placeholder／fallback 的明顯警告；
- 通過、否決、Promote 仍是三個獨立動作；重新上傳或任何 byte 改變後舊 verdict 失效。

Promote 必須使用後台保存的 immutable candidate，不接受瀏覽器再送一份新的 payload；重驗成功後
接第 2 節的 apply，並把 activation receipt 顯示在同一頁。

## 5. P0：generator-owned source adapter 仍可能留下半套產物

目前 POST route 先覆寫來源、直接在 repo 跑 generator；generator 失敗只還原來源檔，
不會還原它可能已經部分改寫的 ability／champion mirror／indexes。成功後也只比較單一 product hash。

請把現有 adapter 補成：

1. `dry-run` 在隔離 staging/worktree 套用來源，回 affected outputs、Owner-text byte-preservation、
   JSON diff、diagnostics 與 planDigest；
2. apply 只引用同一個 immutable plan，CAS source digest，執行 server allowlisted adapter；
3. 完整 regenerate、Zod／loader／refs／indexes 驗證後，才把來源與全部 affected outputs 一次提交；
4. 任一步失敗，來源與所有產物都維持原 bytes；
5. response 回 logical repo path，不洩漏 host absolute path，也不讓 client 指定 shell command。

直接寫 generator-owned product 的 guard 已存在，請保留並加一條端到端測試：修改來源 → sync →
產品仍是新值；故意讓 generator 在改完第一份輸出後失敗 → 全部檔案 hash 不變。

## 6. P1：避免下一輪再拆 API 的小型契約補強

這些不應阻塞第 1–5 節，但最好與同一批 interface 一起定型：

### 6.1 Admin 單檔 JSON convenience

Package JSON 本身已是 JSON transport，不必另造第二個 importer；但 Editor 也會匯出單份
`ability@1`／`item@1`／`vfx-script@1`。Admin 可提供 convenience upload：server 讀 authenticated
ACTIVE，自行包成 canonical single-root delta 後走**同一支** validator／plan／apply。raw document
不得直接寫檔，也不得被 package endpoint 猜測降級；外部 refs 不閉包就要求改用完整 Package。

### 6.2 完整「可選資產池」與「已引用資產 manifest」分開

目前 `assets-manifest.json` 只列 1,640 個已被內容引用的資產，這適合 import safety，卻不是 VFX Forge
資源池；repo 的 `content/assets/` 有 12,554 個檔。請另產生 authoring asset catalog，只收入允許作者
選用的資產，至少含 path、完整 hash、bytes、content type、preview URL、寬高／alpha、模型格式／動畫、
anchor／scale metadata、license/provenance 與 selectable/deprecated/owner-only。不要把 `.hash`、中間產物、
未去背魔法陣或未知來源檔直接暴露成可選素材。

### 6.3 Authoritative appearance 與真 client 視覺回執

提供 champion/form/skin/model 的 resolved appearance receipt，或一個共用 resolver；Editor 不複製
client 的 fallback 規則。另提供固定場景的 render/evidence bridge，讓 Admin 驗的是同一套
`VfxScriptPlayer`、CameraRig、模型、粒子預算與事件來源，而不是 Editor 自畫的近似品。

### 6.4 `[]` 七色標籤 presentation

遊戲 client 仍需讀全域 token palette，將完整 bracket token 上色；禁止 substring replacement，
避免 `GL[AD]IARIA` 這種誤切。`[小範圍]／[範圍]／[大範圍]` 保持同一亮藍群組；
已廢除的舊範圍標籤不得重新出現。這只改 presentation，不改技能機制或系統 AP 倍率。

### 6.5 精簡 endpoint descriptor

不用做一座新的 reference server。只要 active target profile 的每個 endpoint 加上 request schema、
response schema、media types、auth scope、max bytes 與 async/polling 方式；representation registry
加版本與 digest。Editor 即可不靠 URL／欄位猜測，也避免未來新增 `vfx-script` 再拆一次。

## 7. 現在不要做

- 不要重做 Electron／Editor UI、VFX Forge、八招 fixture、視覺 fixture 產生器。
- 不要把 Editor credential 變成 production Admin，也不要放寬 content-api loopback guard。
- 不要實作地形、單位擺放、區域、觸發器或完整地圖編輯器。
- 不要把遊戲本體的系統 AP 乘數寫進 Editor Package 契約。
- 不要恢復已廢除的舊範圍標籤；範圍級距只有 `極小／小／中／大／極大`，文案標籤只用
  `[小範圍]／[範圍]／[大範圍]`。
- 15 項 today-notRequired 能力是「之後實作」，現在不做，但 schema／operation 不得把它們設計死。
- effect-template／Product／Chain 的舊四層模型不是目前 GGD runtime-direct 的 P0；移到歷史／未來章節，
  不要讓 `GGD_EDITOR_PACKAGE_SPEC.md` 同時寫「尚未開始程式開發」與已出貨 G2 骨架。

## 8. Main 回交時只需附這些證據

1. feature branch 與 commit；不得推 `main`。
2. 第 1–5 節每個接縫的實際 request/response fixture。
3. 上述變異守衛與精簡測試結果；不要只報全 repo 綠。
4. 一次真實閉環證據：Package JSON 與 ZIP 各一包，validate → Admin review → Promote → apply →
   runtime read-back → rollback。
5. 一份 `vfx-script@1` production candidate 與一份不可 Promote 的八招 fixture，證明政策沒有混線。

達到以上後，Editor 才會把 Main 狀態從「骨架可接」改成「production seam complete」。

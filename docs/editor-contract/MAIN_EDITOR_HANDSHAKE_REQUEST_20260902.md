# 給 GGD main：Editor 完工所需接縫（可直接交給 Codex）

狀態：2026-09-02 04:24（Asia/Taipei）
Editor 分支：`feat/vfx-forge-codex`（禁止推到 `main`）
正式站實測：`cv_88cbb6486bf2` · capability `111434fa` · profile `3f8d4687566f`
最新 `origin/main@b8420abe` 產物：`cv_385f45e0afb8` · profile `99ef62b583c5`

Main 開工時先在自己的 feature branch 讀取，不 cherry-pick／merge Editor branch：

```bash
git fetch origin
git show origin/feat/vfx-forge-codex:docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md
git show origin/feat/vfx-forge-codex:docs/editor-contract/GGD_EDITOR_PACKAGE_SPEC_RUNTIME_DIRECT_DELTA_20260902.md
git show origin/feat/vfx-forge-codex:main_load_editor_plan.md
```

請只實作 **main 擁有的接縫**。不要重做 Electron／Editor UI、VFX Forge、八招 fixture，
也不要把 AI 候選直接寫進 `content/`。完整語意見 `main_load_editor_plan.md` 與
`GGD_EDITOR_PACKAGE_SPEC.md`；以下不是逐張票，而是 Main 應一次交付的接縫包。先完成第 0 節，
Editor 就能用同一套 fixtures 接後續 P0／P1，不必每多一個 document kind、endpoint 或 receipt
再改一次雙方契約。

## 0：先交付 versioned contract kit，避免逐欄位來回猜

### 0-1：一份 machine contract index，不再讓 Editor 拼 URL 或硬編兩種文件

Main 請從 shared schema 產生 `ggd-editor-contract-index@1`（名稱可調整，但 schema 必須
versioned），由 authenticated active target profile 引用。至少列出：

- profile／package／authoring-processor／capability／authoring-rules／tag／asset／curation／
  distribution／render-bridge 的 schema version 與完整 digest；
- 每個 operation 的 endpoint descriptor：`href`、HTTP method、request／response schema、
  media types、auth scopes、max bytes、async／polling contract；
- 每個 authoring representation 的 `schema`、package kind、state（supported／planned／
  unsupported）、最低 stage、可用 modes、required capabilities 與 promotion policy；
- diagnostics registry、JCS／digest policy、ZIP policy、operation state-machine version 與
  `minEditorContractVersion`。

目前第一批只允許 `ability@1`／`item@1` 在 G2 啟用，但資料結構不得把 store、operation、
diff 或 audit hard-code 成只有兩種。現在就保留以下 registry rows，未完成者維持 planned：

| representation | 現在狀態 | 最低階段 | 注意事項 |
| --- | --- | --- | --- |
| `ability@1` | supported after G2 | G2 | runtime-direct |
| `item@1` | supported after G2；取得性另受 G3 | G2/G3 | runtime-direct |
| `vfx-script@1` | planned | G5 | package kind=`vfx-script`；server policy 預設 review-required；不是 `vfx@1` emitter |
| legacy `template@1`／未來 effect-template／Product／Chain | planned | profile 宣告後 | 不可設計掉，也不可現在假裝支援 |

Package kind 與 document schema 必須由 registry 映射；不要再把 `accepts` 寫成散落於 profile、
Importer 與 Editor 的三份陣列。這一點很重要：目前 Export Center 只處理 abilities／items，
VFX Forge 卻產 `vfx-script@1`；若 Main 現在只做兩種固定 union，G5 一定再拆一次 importer。

Public `ggd-editor-target-profile@1` 現在使用 12 位、JSON insertion-order digest。若要改成
JCS／完整 SHA-256，不可原地改寫 `@1` 的既有語意；請升 major schema 或同時提供明確
`digestPolicy` 與相容期。短 digest 只供 drift 顯示，authenticated receipt 一律使用完整 digest。

### 0-2：回交一包由 Main 產生的 conformance fixtures

Main 第一個 change set 就請加入 official generator 與 freshness test，產生：

1. public profile、authenticated G2 profile、contract index；
2. 完整 active runtime bundle、asset manifest 與 resolved appearance 範例；
3. bootstrap／full／delta Package JSON 與 byte-equivalent STORE ZIP golden；
4. validate success、warning、error、stale Base、expired／consumed plan、apply、rollback、
   crash-recovery 的 operation receipts；
5. hand-authored／generator-owned／readonly source descriptors 與 source-adapter dry-run／apply receipts；
6. AI proposal／evidence／verdict／Promote fixtures，含不可 Promote 的八招 fixture；
7. 未來 `vfx-script@1` package fixture（先標 planned，不能被 production apply）。

再提供一個只吃上述 fixture 的本機 reference server／test harness（例如
`pnpm editor-contract:serve`）。Editor 只對這包做 client integration；Main 上 production 前
同一包再跑一次 Node／Go／Windows／macOS conformance。不要用 wiki 範例或人工複製 JSON。

### 0-3：網路與權限拓撲現在先固定

- Electron Editor 保持本機 authoring／離線建包，不持有 production Promote credential。
- 第一版 production 流程由 authenticated Admin 頁上傳 Package JSON／ZIP；Go platform
  建 operation，再呼叫 loopback/internal Content API。不要為了讓桌面程式直連而放寬
  content-api 的 loopback guard 或新增 cookie/CORS 特例。
- Public static profile 只供 discovery／唯讀 Base；active profile、verified plan、verdict、
  apply、rollback 都必須來自 authenticated gateway。
- 若日後真的要「Editor 直接送 proposal」，另用最小 scope 的 device/service credential；
  它仍沒有 verdict、Promote、apply 或 rollback 權限。

## P0-1：generator-owned source adapter（目前 Editor 只能 fail-safe 唯讀）

Editor 已呼叫：

```http
GET /content-api/editor-source?collection=<collection>&id=<id>
```

但目前 `apps/content-api/src/server.ts` 沒有此 route。請回傳
`ggd-editor-source@1`，至少包含：

```ts
{
  schema: "ggd-editor-source@1";
  collection: CollectionName;
  id: string;
  outputPath: string;
  ownership: {
    kind: "hand-authored" | "generator-owned" | "normalizer-only";
    producer?: string;
    sourcePaths: string[];
    regenerateCommand?: string;
    editableMembers?: string[];
  };
  writePolicy: "document" | "source-adapter" | "readonly";
}
```

同時提供 machine-versioned source-adapter 寫入契約與 route，讓 Editor 用
`expectedSourceSha256`／CAS 修改真正來源，執行唯一 regenerate command，再驗證產物。
請由 main 決定 route 名並把 request／response schema 匯出到 shared；Editor 不猜。

Source adapter 請一次做到可批次、可預覽，不要只做「改一個 JSON pointer」：

- descriptor 加 `adapterId`、adapter contract version／fingerprint、source revision／完整 digest、
  logical source ids、editable members 與 deterministic affected outputs；
- `validate/dry-run` 在隔離 staging 套用 typed authoring operations，回 immutable diff、
  expected outputs／hashes、Owner-text byte-preservation verdict 與 `planDigest`；
- `apply` 只引用同一份 source plan，使用 expected source revision／digest、Idempotency-Key 與 CAS，
  server-side 執行 allowlisted adapter，再完整 regenerate／rebuild／read-back；
- ability＋champion mirror＋相關 index 必須是同一 operation，不能前兩份成功、第三份失敗；
- production response 只回 logical paths；不可洩漏 host absolute path。

`regenerateCommand` 只能當人類說明／audit metadata。Client 不得回傳或要求 server 執行任意
shell string；真正執行的是 Main 註冊的 `adapterId`。否則 source adapter 會變成遠端命令入口。

伺服器必須拒絕對 generator-owned `content/abilities/*.json`、champion mirrors 等產物的
直接 PUT/PATCH。不能只靠前端隱藏按鈕。驗收必須證明修改經 `pnpm skills:sync` 後仍存在，
Owner 文案 bytes 未被 JSON round-trip 改寫。

## P0-2：先消除 Package machine contract 的自相矛盾

目前 profile 已明示：

```json
{
  "authoringModel": {
    "accepts": ["ability@1", "item@1"],
    "notRequired": ["effect-template@1", "effect-product@1", "effect-chain@1", "expectedCompiled"],
    "note": "砍掉編譯器那一層"
  },
  "contract": { "compiler": { "contractVersion": null, "fingerprint": null } }
}
```

但 shared 的 `zPackageManifest` 仍強制每包都有非空
`compiler.contractVersion`／`compiler.fingerprint`，出貨 `GGD_EDITOR_PACKAGE_SPEC.md` 仍是
Draft 0.4 四層 compiler。正式 profile 卻已裁成 runtime-direct；三份 truth 不一致，
Editor 不會用 `none`／假 fingerprint 騙過 schema。

請在 G2 之前選定並只保留一套 machine contract。建議是 runtime-direct authoring：

```ts
authoringProcessor: {
  kind: "runtime-direct";
  contractVersion: "runtime-direct@1";
  fingerprint: string; // shared Zod + ref validator + authoring-rules 的 canonical receipt
}
```

`compiler` 只在真的需要 compile 的 representation 出現；runtime-direct 的 importer 對
`ability@1`／`item@1` 做相同 Zod、ref closure、capability、authoring-rules 與 full staging
驗證，不建立假的第二表示法。精確 delta 見
`docs/editor-contract/GGD_EDITOR_PACKAGE_SPEC_RUNTIME_DIRECT_DELTA_20260902.md`。請在同一個
Main change set 同步修改 spec、shared Zod、target profile generator／產物與 importer tests，
不能只改一邊。

此外 target profile 必須公開建包不可猜的欄位：

- `implementedStage: "G2"`（真的完成才宣告）。
- `base.gameRevision`。
- bootstrap 的 `migrationFingerprint`。
- full/delta 的 `base.activationDigest`／`base.authoringDigest`。
- machine-readable importer endpoints，至少 validate／apply／active runtime bundle；Editor 不從 URL 字串猜 route。

`active/runtime-bundle` 必須是與 `base.contentVersion` 完全相同的
`content-bundle@1` **完整依賴快照**，不只是 abilities／items。每個目前註冊的 collection
都要帶完整 entries、逐文件 hash 與 collection hash；Editor 會全部重算後才接受。這是為了讓
delta 未隨包攜帶的 ability-template／VFX／projectile／status 等 `requires[]` 固定在 exact
Base，而不是誤用本機 workspace 的 hash。Base 缺 collection、外部依賴在本機與 Base
不同、或 selected root 無法在不帶入該變更的情況下閉包，Editor 都會 fail closed。

Editor 端 JSON／ZIP builder 已完成並自我驗證；上述 receipt 缺任何一格就 fail closed。full／delta
另支援人工載入 exact active runtime bundle 作 fallback，等 endpoints 回交後再改成一鍵抓取。

## P0-3：Package importer G2（目前 validate/apply/rollback 明確回 501）

請依 `main_load_editor_plan.md` 的兩階段 verified-plan 流程與
`GGD_EDITOR_PACKAGE_SPEC_RUNTIME_DIRECT_DELTA_20260902.md` 實作；**不要照出貨 Draft 0.4
把 package bytes 再送進 apply**：

```http
POST /api/v1/content-import/validate
POST /api/v1/content-import/validate-single
POST /api/v1/content-import/apply
POST /api/v1/content-import/rollback
GET  /api/v1/content-import/active
GET  /api/v1/content-import/active/runtime-bundle
GET  /api/v1/content-import/operations/:operationId
```

- `validate` 才接收 bounded JSON／ZIP，建立 immutable staging，回 `202 + operationId`；
  poll 成功後取得 server-side `planDigest`。
- `validate-single` 是後台「載入單檔 JSON」的安全 convenience route：只接受一份已知
  runtime document（第一批 ability／item；VFX 等 G5），由 server 以 authenticated ACTIVE
  snapshot、expected generation/profile 與 exact dependency refs 建立 canonical single-root delta
  package／verified plan。它不得直接寫檔，也不得把 raw JSON 冒充 package。外部 ref 不在
  ACTIVE、hash 漂移或需要另一份本機變更時就拒絕並要求改用完整 Package JSON／ZIP。
- `apply` 只接收 `validationOperationId + planDigest + expectedActiveGeneration` 與
  `Idempotency-Key`，不得再次接收另一份可能不同的 package bytes。
- `rollback` 接收 target activation、expected current generation／digest 與 reason；
  三條 route 分開授權與 audit。

必要條件：bounded ZIP preflight/extraction、JCS/hash、shared Zod、capability、authoring-rules、
ref closure、無任意 script、immutable version storage、PREPARED、fsync、Base CAS、原子
ACTIVE pointer、health read-back、rollback 與 operation audit。禁止用逐文件 PUT 拼成假 apply。

Delta 驗收另須證明：`selectionRoots[]` 只代表人工選取，不會把自動 closure 冒充成選取；
changed forward dependencies 使用 `reason=required-dependency`；未選本機草稿不會滲入或阻擋；
changed selected root 不得從 `changes[]` 消失；所有 omitted refs 都對 exact Base hash，而不是
打包當下的本機 hash。Editor 已有對應 builder 與變異守衛，Importer 必須獨立重驗，不能信任報告。

在能力真的完成前，`supportedModes`／`deltaExportAllowed` 必須維持目前誠實值；不要為了讓
Editor 按鈕變亮而提前宣告 full/delta。

Main Admin 同一批提供最小 Import Operations 頁：上傳 Package JSON／ZIP 或單檔 JSON、
顯示 transport/schema/Base/closure/capability/asset/curation 驗證結果與 before/after diff、
輪詢 operation、明確 Apply、查看 activation health、條件式 Rollback。Apply 按鈕只引用
已 VALIDATED 的 plan；重新選檔或檔案 byte 改變會建立新 validate operation。這頁是 production
credential 的唯一第一版入口，Electron Editor 不重做一份遠端管理員 UI。

## P0-4：AI 先審後上要成為 main 的授權邊界

正式環境請把 proposal、verdict、Promote 分權：

- AI／Editor credential 只有 proposal 權限。
- verdict 與 Promote 必須是 authenticated Admin actor，寫不可變 audit log。
- 核准綁定 candidate hash；Promote 前重驗 Base hash、最新 schema/capability/asset safety。
- `editor-capability-fixture` 永久 `promotable=false`，即使人工 pass 也不能上線。
- production candidate 在送審後有任何 byte 變更，舊 verdict 立即失效。
- Package 內 reviewer 字串不是身分證明；apply 仍需後台授權 receipt。

Contract index 要讓每個 representation 宣告 `promotionPolicy`。建議第一版：人工建立的
ability／item 可走 authenticated Admin Package apply；內建 AI 產生／修改的 ability／item 必須
帶 server-issued proposal/verdict receipt；`vfx-script@1` 不論來源都先採 review-required；
`editor-capability-fixture` 永遠 forbidden。Importer 不能相信 package 自稱 `human-authored`；
review-required 內容只接受後台保存、hash 相符且尚未失效的 receipt。政策可由 authenticated
Admin 設定切換，但它是 target-profile／plan 中被 pin 的 server policy，不是 package 或
Editor 自己可以關掉的旗標。

### generator-owned 技能不能走通用整份文件 Promote

Editor 的「人工本機編輯」與「AI 輔助修改」是兩條不同授權路徑。人工編輯仍依
P0-1 的 `writePolicy` 寫 document 或 source adapter；凡是 AI 產生或調整技能機制、
動畫或 VFX，必須先送 proposal，再由後台人工審查。對 `generator-owned` ability 與
champion mirror，proposal 不可只保存一份 runtime JSON 候選，至少還要綁定：

```ts
{
  sourceBaseSha256: string;
  authoringOperation: unknown;       // main 匯出的 versioned source-adapter operation
  authoringOperationDigest: string;  // canonical digest
  expectedOutputs: Array<{ path: string; sha256: string }>;
}
```

verdict 必須同時鎖定 `candidateHash`、`sourceBaseSha256` 與
`authoringOperationDigest`。Promote 時只能用 P0-1 的 source adapter 做 CAS 修改真正來源，
執行唯一 regenerate command，重驗 ability 產物與 champion mirror，再 rebuild／audit；
不得把候選物件直接 `PUT` 到產生後的 JSON。

在 source adapter 尚未出貨以前，content-api 必須 fail closed：

- 可以收件與人工審查，讓候選不遺失；
- `/content-api/ai-review/promote` 遇到 generator-owned ability／champion 必須回 `409`；
- 通用 whole-document Promote、普通 PUT/PATCH 都不能成為繞路；
- hand-authored 文件只有在 authoritative `editor-source` 回報
  `writePolicy: "document"` 時才可沿用通用 Promote。

請加伺服器測試證明：偽造 `purpose`、取得 approve verdict、或直接呼叫通用 Promote，
都不能改動 generator-owned output；只有相同 source hash 的 source-adapter Promote 能成功，
且完整 regeneration 後 Owner 文案與 champion mirror 都一致。

本機 MVP 可以把最多 400KB 的 PNG／WebP frame 內嵌成 data URL；production 不要把它直接
搬進 proposal JSON 或單一 ledger 檔。請提供 content-addressed evidence upload／blob contract，
proposal 只保存：

```ts
{
  evidenceId: string;
  sha256: string;
  bytes: number;
  contentType: "image/png" | "image/webp";
  width: number;
  height: number;
  atMs: number;
  view: "side" | "top";
  renderReceiptDigest: string;
}
```

`renderReceiptDigest` 必須 pin candidate、ability／vfx-script、Base/profile、capability、asset
manifest、resolved appearance、effective VFX limits、renderer／render-bridge build 與 deterministic
seed。否則審查頁只知道「有一張圖」，不能重現它是用哪個模型、限制或內容版本拍的。
Evidence 有 byte／count／dimension／MIME 配額、immutable URL 與 retention；verdict 綁定完整
evidence-set digest。換圖、換模型、換 Base 或換限制都使舊 verdict 失效。

Production Admin 的「一頁批核」至少同屏顯示：target／Base、Owner 原文、typed mechanics／
VFX script diff、source-adapter dry-run、起手／中段／收尾 frames、side／top views、自動分數、
人類 0～10 分、asset/limit/model receipts、blocking diagnostics 與 candidate hash。Approve／Reject
記 verdict；Promote 是第二個明確按鈕並再次驗 CAS。頁面不得把 fixture pass 按鈕誤畫成
production Promote，也不得因自動分數高而預選 approve。

## P1-1：公開完整 Asset Manifest，不只 `_lod.json` digest

`content/editor-target-profile.json` 目前已有 `assetManifestDigest`，但產生器只 hash
`assets/models/_lod.json`；Desktop 按需抓 GLB／貼圖時仍無法逐檔驗證。

請新增 clock-free、決定性的 `content/assets-manifest.json`，每筆至少：

```ts
{ path: string; bytes: number; sha256: string; contentType: string }
```

涵蓋 models／vfx／projectiles／skins 實際可引用的二進位 closure。profile 的
`assetManifestDigest` 改為完整 manifest 的 canonical digest。未知路徑、hash 不符、超額與
manifest 外資產一律 fail closed。Editor 會在收到這份契約後把目前的 HTTPS＋byte limit
提升為逐檔 hash 驗證。

請同時讓 manifest 由遊戲同一 asset resolver 產生，而不是單純掃資料夾；每筆可另外帶
logical asset key／kind、dependencies、safety receipt digest 與 immutable fetch URL/template。
GLB 的外部或內嵌 textures、material images、skin／animation dependencies 都要進 closure。
HTTP 回應使用完整 ETag、immutable cache policy，較大 GLB 支援 bounded Range；URL bytes、
manifest hash 與 resolver 結果必須一致。這樣日後 CDN 改路徑不必再改 Editor schema。

Asset safety receipt 至少可追到 blend mode／alpha-backdrop、decode、bounds、missing texture 與
geometry ratchet 的產生器版本及結果；receipt 不是免驗證白名單，Importer／Editor 仍會對實際
引用做 applicability 檢查。

## P1-2：target profile 公開「實際生效」VFX 限制

請在靜態 `ggd-editor-target-profile@1` 加入 machine-readable `effectiveVfxLimits`，由和
遊戲客戶端相同的 resolver 產生，不能另抄常數。至少包含：

- 單一 particle system 最大粒子數／每秒 rate。
- Ribbon 同時上限／fade budget。
- 場景 VFX hard max life 與 hard-cap scope。
- 一次性 emitter 上限。
- round purge mode。

欄位名稱與 JSON 表示請固定為（`null` 是 JSON 對「無上限」的唯一表示，不可輸出
`Infinity` 字串或省略半份物件）：

```ts
effectiveVfxLimits: {
  schema: "ggd-effective-vfx-limits@1";
  limitProfileId: string;           // renderer／quality／device context 的穩定 id
  resolverFingerprint: string;      // 與遊戲實際 resolver 同源
  maxParticlesPerSystem: number; // 正整數
  maxRatePerSystem: number;      // 正整數／秒
  maxActiveRibbons: number;      // 正整數
  ribbonFadeBudgetSec: number;   // 正數
  hardMaxLifeSec: number;        // 正數
  hardCapScope: "scene" | "managed" | "off";
  maxOneShotEmitters: number | null; // 正整數；null = unlimited rollback mode
  roundPurgeMode: "off" | "soft" | "full";
}
```

Editor 已能讀取 Desktop 驗證並 pin 住的 profile：完整物件才採用；缺欄位或型別錯誤會
fail closed；profile 與目前預覽 renderer 的實際 resolver 任一格不同，也會以
`VFX_RUNTIME_LIMIT_DRIFT` 停止預覽，不會把兩套值混在同一頁。舊 profile 缺整個物件時
仍可用本機 runtime resolver，但 UI 會明示正式站尚未提供同源收據。

值必須由 `vfx-budget`、`vfx-cleanup` 與 runtime clamp 合併後得到。加 contract test：修改
任一 config 或 runtime clamp，profile 與遊戲有效值必須一起變；schema 最大值不算答案。
若不同 renderer／quality／device profile 會得到不同值，active profile 必須明示選到哪個
`limitProfileId`，Editor 只宣稱該 context 的 parity，不把桌機高階值冒充所有玩家裝置。

## P1-3：交付 authoritative appearance resolver；先修已知 `godie-e00r`

八招實機證據發現：`content/champions/godie-e00r.json` 的正式 `modelKey` 仍是
`champ.skin.rogue`，所以 Editor 忠實預覽「初號機」時得到的是泛用方塊／rogue 模型，
即使 repo 已有 Eva 相關 imported GLB 也不能私下替換。這會同時污染遊戲實際畫面、VFX
遮擋判斷與後台人工批核。

請由 main 在真正的 champion/model 來源修正映射並重生成；不要只改產物 JSON，也不要只為
初號機加一個特判。請匯出 versioned `resolved-appearance@1`（名稱可調整）或等價 shared
resolver，對 champion＋skin／form 回傳至少：resolved model key、model document／asset digest、
GLB path、scale／forward／up／ground transform、collision／camera bounds、attachment／bone map、
可用 animation clips，以及 resolver contract fingerprint。遊戲與 Editor 必須呼叫同一 resolver
或用同一批 golden vectors 證明輸出一致。

回交時附：

1. source file 與 regenerate command。
2. `godie-e00r` 最終 `modelKey`、GLB 路徑與材質／alpha 安全檢查。
3. 遊戲與 Editor 對同一 champion id 解到相同 model key 的測試。
4. 一張無 VFX 的角色基準圖與一張被技能命中的遮擋圖。

## P1-4：把 `[]` 七色 presentation 真正接到遊戲 client

Main 現在已有 `descriptionTokens.ts` 的安全 tokenizer，但仍有三個未閉合的事實：

1. client 玩家卡面沒有消費該 AST；
2. tokenizer 只有 5 個 palette ids／少量硬編 token，計畫要求的是全域 7 群；
3. 正式 profile 的 `tagManifest.matchesEngine=false`，所以 canonical tag authoring 仍被封鎖。

請由 tag／presentation generator 產生 `ggd-presentation-token-manifest@1`，每個 canonical token
恰好映射到一個 group，並帶 manifest digest、engine/capability fingerprint 與七色 palette：

| group | 色碼 |
| --- | --- |
| activation | `#7030A0` |
| cast | `#1565C0` |
| effect | `#D84315` |
| event | `#546E7A` |
| condition | `#9A6700` |
| movement | `#008C95` |
| scaling | `#BF8F00` |

Tokenizer 只做整個 `[token]` 的 presentation 分類，不搜尋子字串、不改 Owner 文案、不從台詞
或自然語言推導 mechanics；`GLADIARIA` 不得被切成 `[AD]`。第一行未知 canonical tag 是
authoring error；正文未知 token 保留為純文字並警告。Client 只渲染 text/token data nodes，
不接受 package 內 HTML、CSS、URL、任意色碼。palette 改色只改全域 manifest／theme，不重寫
421 份技能說明。

驗收要包含：全部出貨 token 恰好一群、七群都有消費端、直線 normalization 僅對完整 token、
引用／角色台詞不被規則引擎當機制、injection corpus、以及真 client 卡面 screenshot。

## P1-5：現在就 pin curation／distribution receipt，異動可等 G3

技能或道具 JSON 存在，不代表玩家能取得。G2 verified plan 現在就要 pin live curation 與
distribution digests，並輸出 reachability impact；否則同一包在 validate 後、apply 前可能因
白名單、商店、loot、recipe 或 feature flag 改變而得到不同玩家結果。

第一批可以明確禁止 package 修改 curation，但 profile／plan／activation 先保留：

- champion manual/random/bot/timeout/mob 的同一 pickability projection；
- item loot/offer/shop/recipe/book 的同一 reachability projection；
- `contentReachable` 與 `effectiveReachableUnderCuration` 分開；
- curation drift 使 plan 過期；content rollback 預設不偷偷回滾 curation；
- 未來 curation proposal 使用獨立 operation、權限、verdict 與 audit。

這樣傳說武器、英雄開放名單或新道具到貨時只新增 G3 transaction，不必回頭改 G2 plan digest。

## P2：現在先保留 contract，後續實作時不再改骨架

以下不是要求 Main 第一批全部實作，而是要求第 0 節的 registry／store／operation／audit 現在
就能表達 planned，不要等功能到來才換 schema：

- `vfx-script@1`：G5 後可走 Package 或 production AI proposal；package kind 固定為
  `vfx-script`，既有 `vfx` 只保留給未來 emitter `vfx@1` authoring。有 script 時取代
  default binding，不疊加。
- effect-template／Product／Chain：保留 representation、revision、scope、exact ref 與 future
  compiler receipt；目前 runtime-direct 不要求、不編譯、不建立假文件。
- 目前 planned 的 gameplay mechanisms：以 stable requirement id、state、applicability、
  constraints、evidence digest 表示；`notRequired` 是「尚未實作」，不是永遠刪除。
- delete、hot reload、Editor 直接 production publish、curation mutation：V1 都是 unsupported，
  但 operation diagnostics 必須可穩定表達，不要用 404 或未知欄位代替。
- VFX budgets 不要只留目前八個 scalar。保留 versioned `effectiveConstraints[]` 擴充點，至少有
  id、scope、unit、value／null、appliesTo、source fingerprint；日後增加 scene-total particles、
  active systems、model FX、lights、decals 或 per-frame budget 時，舊 Editor 可以顯示「新限制未
  理解」並 fail closed，而不是 Main 再加一個散落欄位。
- render bridge／event provenance：profile 先保留 contractVersion／fingerprint；事件逐步帶
  castId、ability/item id、effect path、origin、parent、target/point/direction、RNG stream，讓
  Editor 能判斷 production parity，不從名稱或 projectile id 猜來源。

G0/G2 第一批若只支援 ability／item，這些 row 的 state 就維持 planned／unsupported；它們不會
讓按鈕變亮，但能保證後續加入 VFX、Product 或新機制時不重做 importer、profile 與 audit。

## 建議分工與唯一交付順序

| 次序 | Main 擁有 | Editor 擁有 | 共同完成閘 |
| --- | --- | --- | --- |
| 1. Contract-only branch | shared schemas、contract index、endpoint/auth descriptors、generators、fixtures | 只 review fixture 是否足以建 client，不改 Main schema | freshness＋Node/Go golden；production 能力仍關閉 |
| 2. Editor fixture integration | reference server | 改 `exportPolicy/exportBuilder` 使用 `authoringProcessor`、profile 新版與 operation client；保留舊 public Base read | Editor 對 fixtures 全綠，不需 production endpoint |
| 3. Main G1/G2 | source adapter、validate/apply/rollback、immutable store、Admin upload/review | 不直接連 internal content-api；持續本機建包 | 同一 JSON/ZIP semantic digest、真 staging、CAS、rollback |
| 4. Parity receipts | asset manifest、effective constraints、appearance resolver、render bridge、七色 client renderer | hash-verified asset cache、實際生效值與 preview drift gate | 同 champion/model/VFX/limits golden＋真 client screenshot |
| 5. Staging E2E | authenticated gateway、shard preload/health、audit | 真 package round-trip 與八招 capability regression | validate→apply→read-back→rollback；fixture 永不 Promote |
| 6. Production enable | 逐 representation 將 state 從 planned 改 supported | 只依 profile 解鎖對應按鈕 | 不用再改 wire contract |

Main 不合併／cherry-pick 整個 Editor branch；只在 Main feature branch 實作自己擁有的 seam。
Editor 也不先猜未出貨的 request 欄位。雙方唯一接縫是第 0 節 generated contract kit；schema
變更先改 generator＋fixture，兩邊 freshness 同時紅，再各自在自己的分支修到綠。

Owner 只需要在真正的產品政策選擇時介入（例如 curation 是否隨 content transaction、部署
health 要 all 或 quorum）；route 名、欄位拼法、hash projection、重試語意與 VFX limit 擴充都由
machine contract／registry 決定，不再逐項請 Owner 人工仲裁。

## 已有、不要重做

- `vfx-script@1` 已有 `strike`／`strikeIndex`／`reflectSuccess`／`bodyMove` 等八招需要的軸。
- `manifest.json`、`bundle.json`、`editor-target-profile.json` 已可作遠端唯讀 Base。
- VFX Forge、真 CameraRig 預覽、時間軸與 AI proposal UI 由 Editor 分支負責。
- 八招是編輯器能力 fixture，不是要 main 直接換掉遊戲技能。

## main 回交時請附

1. feature branch/commit（不得直接 commit main）。
2. 第 0 節完整 conformance fixture pack、產生器、freshness test 與 reference server command。
3. 每項 machine schema、route、endpoint descriptor、auth scope 與權限測試。
4. importer crash/CAS/rollback/idempotency/plan-expiry 測試證據。
5. source-adapter dry-run/apply 經完整 regeneration 仍保留修改的證據。
6. asset manifest deterministic rebuild、tamper rejection 與 immutable fetch 測試。
7. presentation token manifest、七色 client screenshot、resolved appearance golden vectors。
8. 新 public／active target profile digest、capability／authoring-processor／render-bridge
   fingerprints，以及每項變更原因。

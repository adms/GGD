# 給 GGD main：Editor 完工所需接縫（可直接交給 Codex）

狀態：2026-09-02 03:08（Asia/Taipei）
Editor 分支：`feat/vfx-forge-codex`（禁止推到 `main`）
正式站實測：`cv_88cbb6486bf2` · capability `111434fa` · profile `3f8d4687566f`
最新 `origin/main@b8420abe` 產物：`cv_385f45e0afb8` · profile `99ef62b583c5`

請只實作 **main 擁有的接縫**。不要重做 Electron／Editor UI、VFX Forge、八招 fixture，
也不要把 AI 候選直接寫進 `content/`。完整語意見 `main_load_editor_plan.md` 與
`GGD_EDITOR_PACKAGE_SPEC.md`；以下是目前真的阻擋 Editor 完工的最短清單。

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
`compiler.contractVersion`／`compiler.fingerprint`，而 `GGD_EDITOR_PACKAGE_SPEC.md` 仍是
Draft 0.4 四層 compiler 模型。這三份 machine truth 不能同時成立；Editor 不會用
`none`／假 fingerprint 騙過 schema。

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
驗證，不建立假的第二表示法。請同步修改 spec、shared Zod、target profile、importer tests。

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

請依 `GGD_EDITOR_PACKAGE_SPEC.md` 實作：

```http
POST /api/v1/content-import/validate
POST /api/v1/content-import/apply
POST /api/v1/content-import/rollback
GET  /api/v1/content-import/active
GET  /api/v1/content-import/active/runtime-bundle
GET  /api/v1/content-import/operations/:operationId
```

必要條件：bounded ZIP preflight/extraction、JCS/hash、shared Zod、capability、authoring-rules、
ref closure、無任意 script、immutable version storage、PREPARED、fsync、Base CAS、原子
ACTIVE pointer、health read-back、rollback 與 operation audit。禁止用逐文件 PUT 拼成假 apply。

Delta 驗收另須證明：`selectionRoots[]` 只代表人工選取，不會把自動 closure 冒充成選取；
changed forward dependencies 使用 `reason=required-dependency`；未選本機草稿不會滲入或阻擋；
changed selected root 不得從 `changes[]` 消失；所有 omitted refs 都對 exact Base hash，而不是
打包當下的本機 hash。Editor 已有對應 builder 與變異守衛，Importer 必須獨立重驗，不能信任報告。

在能力真的完成前，`supportedModes`／`deltaExportAllowed` 必須維持目前誠實值；不要為了讓
Editor 按鈕變亮而提前宣告 full/delta。

## P0-4：AI 先審後上要成為 main 的授權邊界

正式環境請把 proposal、verdict、Promote 分權：

- AI／Editor credential 只有 proposal 權限。
- verdict 與 Promote 必須是 authenticated Admin actor，寫不可變 audit log。
- 核准綁定 candidate hash；Promote 前重驗 Base hash、最新 schema/capability/asset safety。
- `editor-capability-fixture` 永久 `promotable=false`，即使人工 pass 也不能上線。
- production candidate 在送審後有任何 byte 變更，舊 verdict 立即失效。
- Package 內 reviewer 字串不是身分證明；apply 仍需後台授權 receipt。

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

## P1-2：target profile 公開「實際生效」VFX 限制

請在靜態 `ggd-editor-target-profile@1` 加入 machine-readable `effectiveVfxLimits`，由和
遊戲客戶端相同的 resolver 產生，不能另抄常數。至少包含：

- 單一 particle system 最大粒子數／每秒 rate。
- Ribbon 同時上限／fade budget。
- 場景 VFX hard max life 與 hard-cap scope。
- 一次性 emitter 上限。
- round purge mode。

值必須由 `vfx-budget`、`vfx-cleanup` 與 runtime clamp 合併後得到。加 contract test：修改
任一 config 或 runtime clamp，profile 與遊戲有效值必須一起變；schema 最大值不算答案。

## P1-3：修正正式英雄到 3D Model 的 authoritative 映射

八招實機證據發現：`content/champions/godie-e00r.json` 的正式 `modelKey` 仍是
`champ.skin.rogue`，所以 Editor 忠實預覽「初號機」時得到的是泛用方塊／rogue 模型，
即使 repo 已有 Eva 相關 imported GLB 也不能私下替換。這會同時污染遊戲實際畫面、VFX
遮擋判斷與後台人工批核。

請由 main 在真正的 champion/model 來源修正映射並重生成；不要只改產物 JSON。回交時附：

1. source file 與 regenerate command。
2. `godie-e00r` 最終 `modelKey`、GLB 路徑與材質／alpha 安全檢查。
3. 遊戲與 Editor 對同一 champion id 解到相同 model key 的測試。
4. 一張無 VFX 的角色基準圖與一張被技能命中的遮擋圖。

## 已有、不要重做

- `vfx-script@1` 已有 `strike`／`strikeIndex`／`reflectSuccess`／`bodyMove` 等八招需要的軸。
- `manifest.json`、`bundle.json`、`editor-target-profile.json` 已可作遠端唯讀 Base。
- VFX Forge、真 CameraRig 預覽、時間軸與 AI proposal UI 由 Editor 分支負責。
- 八招是編輯器能力 fixture，不是要 main 直接換掉遊戲技能。

## main 回交時請附

1. feature branch/commit（不得直接 commit main）。
2. 每項 machine schema、route 與權限測試。
3. importer crash/CAS/rollback 測試證據。
4. source-adapter 經完整 regeneration 仍保留修改的證據。
5. asset manifest deterministic rebuild 與 tamper rejection 測試。
6. 新 target profile digest、capability fingerprint，以及變更原因。

# 給 GGD main：Editor 完工所需接縫（可直接交給 Codex）

狀態：2026-09-02 01:17（Asia/Taipei）  
Editor 分支：`feat/vfx-forge-codex`（禁止推到 `main`）  
目前公開 Base：`cv_cf9e53948752` · capability `111434fa` · profile `c20315afd90b`

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

## P0-2：Package importer G2（目前 validate/apply/rollback 明確回 501）

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

在能力真的完成前，`supportedModes`／`deltaExportAllowed` 必須維持目前誠實值；不要為了讓
Editor 按鈕變亮而提前宣告 full/delta。

## P0-3：AI 先審後上要成為 main 的授權邊界

正式環境請把 proposal、verdict、Promote 分權：

- AI／Editor credential 只有 proposal 權限。
- verdict 與 Promote 必須是 authenticated Admin actor，寫不可變 audit log。
- 核准綁定 candidate hash；Promote 前重驗 Base hash、最新 schema/capability/asset safety。
- `editor-capability-fixture` 永久 `promotable=false`，即使人工 pass 也不能上線。
- production candidate 在送審後有任何 byte 變更，舊 verdict 立即失效。
- Package 內 reviewer 字串不是身分證明；apply 仍需後台授權 receipt。

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

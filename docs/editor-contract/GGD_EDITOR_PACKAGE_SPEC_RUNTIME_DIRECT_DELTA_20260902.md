# GGD Editor Package Draft 0.5 runtime-direct delta

狀態：2026-09-02 04:00（Asia/Taipei）

用途：這是給 Main 原子升級 `GGD_EDITOR_PACKAGE_SPEC.md`、shared machine schema、
target profile 與 importer 的**差異規格**。它不是新的獨立 wire contract，也不能單獨拿來
開啟 production apply。

## 1. 為什麼不能直接改 Draft 0.4 文件

目前有三份互相衝突的 truth：

1. 正式 profile 宣告 runtime-direct，接受 `ability@1`／`item@1`，並將
   `effect-template@1`／`effect-product@1`／`effect-chain@1`／`expectedCompiled`
   列為 `notRequired`；compiler receipt 為 null。
2. `packages/shared/src/content/import/packageSchema.ts` 與 Editor builder 仍強制非空
   `compiler.contractVersion`／`compiler.fingerprint`。
3. `GGD_EDITOR_PACKAGE_SPEC.md` Draft 0.4 仍以四層 graph compiler 為目前 V1。

Spec 的 digest／label 由 `buildEditorTargetProfile.ts` 產生；Editor branch 若只手改 Markdown，
會讓 profile freshness 失效，卻沒有改到 machine schema。故 Draft 0.5 必須由 Main 在同一個
feature-branch change set 原子完成，不能 cherry-pick 本 delta 後只改其中一份。

## 2. Draft 0.5 的目前 V1 authority

- Package authoring truth 是 runtime-direct `ability@1`／`item@1`。
- Importer 必須共用 shared Zod、exact-ref collector、capability applicability、
  authoring rules、template-card expansion、final loader 與 derived rebuild。
- 不建立假的第二份 compiled representation。
- 四層 Product graph 與安全 `effect-graph-v1` 設計保留為未來 representation；只有 profile
  明示支援時才成為 package requirement，不能被設計掉。
- Runtime-direct package 不得因缺 Definition／Product／Chain／`expectedCompiled` 而失敗。
- 脫離 `ggd-editor-import@1` envelope 的單檔 `ability@1`／`item@1` 仍只是相容輸出，
  不得冒充可原子 apply 的 package。

## 3. Manifest machine delta

Runtime-direct manifest 必須以以下 receipt 取代強制 compiler：

```ts
authoringProcessor: {
  kind: "runtime-direct";
  contractVersion: "runtime-direct@1";
  fingerprint: string;
}
```

Fingerprint 至少覆蓋：shared runtime Zod、exact refs、template expansion、capability
applicability、authoring rules、runtime loader、derived rebuild rules 與雙向 golden vectors。
只 hash UI field list 或一小份 surface object 不合格。

`compiler` 改為 conditional：只有 package representation 真的需要 compile 時才允許出現。
Runtime-direct 不得填 `none`、空字串或假 fingerprint。`expectedCompiled` 必須省略或為空；
Importer 仍需自行重建 mirrors／indexes／bundle／distribution 並比對 `expectedDerived[]`。

其餘已出貨 invariant 保留：JCS／SHA-256、exact Base、`selectionRoots[]` 與 `changes[]`
分離、changed forward dependency、full implicit-delete guard、delta omitted-ref pin、JSON／ZIP
semantic digest 相同，以及 STORE ZIP transport safety。

## 4. Verified-plan 兩階段 API

### Validate

`POST /api/v1/content-import/validate` 是唯一接收 bounded Package JSON／ZIP 的 route。
它建立 immutable staging，完成全部驗證但不改 ACTIVE，回 `202 + operationId`；poll
`GET /api/v1/content-import/operations/:operationId` 到 `VALIDATED` 後才能取得 server-side
`planDigest`、candidate digests、expected active generation 與 expiry。

### Apply

`POST /api/v1/content-import/apply` **不得再次接收 package bytes**。它只引用同一 actor
可用且未過期的 verified plan，request 至少綁定：

```ts
{
  validationOperationId: string;
  planDigest: string;
  expectedActiveGeneration: number;
}
```

並要求 `Idempotency-Key`。Server 必須從保存的 staging／plan 做 Base/Profile/curation/
asset/capability CAS 重驗，再寫 immutable version、做 required health read-back，最後原子切
ACTIVE。相同 key＋相同 request 合併；相同 key＋不同 digest 回
`IDEMPOTENCY_KEY_REUSE_MISMATCH`。

### Rollback

`POST /api/v1/content-import/rollback` 至少綁 target activation、expected current
generation／digest 與 reason；它只條件式切回已驗證 immutable version，不重新匯入 ZIP。
Validate、apply、rollback 三條 route 必須分開授權與 audit。

Main 必須將 validate／apply／rollback request、operation、success result 與 error envelope
各自匯出 versioned shared Zod。Editor 不猜 multipart、header、polling 或 endpoint shape。

## 5. Target profile delta

Production-ready machine profile 至少公開：

- `implementedStage: "G2"`（真的完成後才宣告）。
- `authoringStoreState` 與 `supportedModes`。
- `authoringProcessor` 完整 receipt；runtime-direct compiler 為缺席而非假值。
- `base.gameRevision`、`base.contentVersion`。
- bootstrap `migrationFingerprint`。
- full／delta `base.activationDigest`、`base.authoringDigest`。
- versioned machine endpoints：capabilities、validate、apply、rollback、operation、active、
  active target profile、active runtime bundle、health。
- 完整 asset-manifest digest、live capability／policy／curation receipts 與由遊戲同一
  resolver 產生的 `effectiveVfxLimits`。

Public discovery profile 不得冒充 authenticated active receipt；短 digest 不是 signature。

## 6. Main 必須同一批更新的住處

1. `GGD_EDITOR_PACKAGE_SPEC.md` 升 Draft 0.5 並整合本 delta。
2. `packageSchema.ts` 與 request／operation／result／error Zod。
3. Editor target-profile machine schema與產生器；package spec label／digest 跟著文件生成。
4. Importer validate／apply／rollback／active／runtime-bundle／operation routes。
5. Shared golden fixtures：Package JSON 與 ZIP semantic equality、runtime-direct manifest、
   two-phase plan consumption、stale/expired/consumed plan、idempotency mismatch。
6. 產生物只跑官方 generator 更新；不得手改公開 profile 或 generated contract。

上述任一住處未同步時，`implementedStage`、`supportedModes` 與 `deltaExportAllowed` 必須維持
目前誠實值，Editor 也會繼續 fail closed。

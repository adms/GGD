# 遊戲主程式載入 Editor JSON／ZIP 的修改建議

狀態：**Revision 2.2 — 已對 `origin/main@007d9ffc`、正式站公開 profile、VFX Forge 與目前機器 schema 做第三次接縫審查**

最後驗證：2026-09-01 02:13（Asia/Taipei）

適用範圍：GGD 遊戲主程式、後台與 Content Import API；不是 Editor UI 實作說明。

本文只定義「遊戲端還必須實作什麼」與各階段的完成閘門。Package 欄位、JCS digest、Effect Definition／Product／Chain 形狀不在此重複，以 [`GGD_EDITOR_PACKAGE_SPEC.md`](GGD_EDITOR_PACKAGE_SPEC.md) 及 `packages/shared/src/content/import/` 的機器 schema 為準。

相關資料：

- [`GGD_EDITOR_PACKAGE_SPEC.md`](GGD_EDITOR_PACKAGE_SPEC.md)：Package JSON／ZIP 的共同資料契約。
- [`docs/_codex-handoff.md`](docs/_codex-handoff.md)：目前引擎能力與資料入口導覽。
- [`OPEN_HERO_WHITELIST.md`](OPEN_HERO_WHITELIST.md)：生成的英雄參考名單，不是 live curation authority。
- [`LEGENDARY_WEAPON_FULL_AUDIT.md`](LEGENDARY_WEAPON_FULL_AUDIT.md)：生成的傳說武器 census，不是 importer 常數。

## 1. 結論與系統邊界

遊戲端最終要能：

1. 明確辨識 Package JSON、Package ZIP 與 raw Runtime JSON，不依副檔名猜測。
2. 在隔離 staging 中驗 authoring truth，以遊戲端 compiler 重編並比對 expected compiled。
3. 重建 indexes、bundle、distribution 與 champion mirrors，不信任 package 內的 derived files。
4. 將 authoring、compiled runtime 與 derived projections 寫成同一個 immutable activation。
5. 用 verified plan、CAS 與 ACTIVE pointer 原子啟用，支援 health read-back、冪等重試與 rollback。
6. 對不支援、無法機器判定、known-broken、過期或不一致的 contract fail closed。

### 1.1 權威不是單一排名

每種資料只在自己的領域有權威性：

| 領域 | 權威來源 | 不可拿來代替 |
|---|---|---|
| 技能／道具設計意圖 | Owner source＋canonical authoring document | Runtime tooltip、彩色 tag、技能名推論 |
| Package wire format | Zod／JCS／digest／ZIP 機器實作＋同版 spec | 本文範例、檔案副檔名 |
| Runtime 可執行能力 | 目標環境 live capability receipt＋contract tests | Editor 自己的 union、散文 caveat |
| 公開內容 Base | 正式站 public profile 指向的完整 content receipt | Editor 下載後的可編輯子集合 hash |
| Activation Base | authenticated active target profile | public profile、contentVersion |
| Curation／可取得性 | platform curation service 與 distribution receipt | Markdown 白名單、starter seed |
| Presentation | tag manifest＋全域 palette | Gameplay mechanics |

這些來源必須互相一致，不存在「高順位內容自動覆蓋低順位內容」。只要 schema、spec、profile、compiler 或 receipt 彼此矛盾，就停止 validate／apply 並回報 contract drift。

### 1.2 目前真正的 blockers

正式站 [`editor-target-profile.json`](https://ggd.adms.ai/content/editor-target-profile.json) 已可讓外部 Editor 讀取公開 Base，但目前仍有以下阻塞：

| Blocker | 現況 | 影響 |
|---|---|---|
| Managed authoring／activation store | 尚不存在；只允許 `bootstrap` proposal | 不可產 production `full`／`delta` |
| Public compiler receipt | contract／fingerprint 仍為 `null` | 不可宣稱 Editor 與 production compiler parity |
| Public package contract | profile 仍指向舊 Draft 文字 | importer 無法安全協商 exact schema／spec |
| Tag engine 對帳 | `matchesEngine=false` | 不可用該 manifest 證明 canonical tag 與 mechanics 一致 |
| Authoring rules | 公開 pricing endpoint 為 `null` | MP／冷卻等規則只能當本機建議，不能當 production contract |
| Write API | validate／apply／rollback 仍回 501 | 目前只能讀 profile、離線建包與本機自驗 |

版本、數量、短 digest 與 capability 明細都只從 live receipt 讀取，不再抄入本文或程式常數。

三個環境不可再用一句「目前 G1」混稱：repo／local 已有 package schema 與 compiler 實作；public static profile 仍缺 compiler receipt 且宣告舊 spec；production private importer 尚未提供 validate／apply／rollback。 `implementedStage` 只供 roadmap 顯示，Editor 必須讀每個 operation 的明確 `supported／unsupported` 狀態，不能從 `G1` 字串推算功能。

### 1.3 Public descriptor 與 active receipt 必須分開

`ggd-editor-target-profile@1` 是公開、唯讀的 discovery／Base descriptor，不是 distribution receipt，也不是 activation receipt。它目前的短 digest 只適合偵測漂移，不代表簽章或可信來源。

`ggd-content-target-profile@1` 應只由遊戲後台的 authenticated active endpoint 產生。Desktop 若為 UI 相容性把 public profile 投影成類似形狀，必須標示 `source=public-adapter`，不得偽裝成後台簽發的 active receipt，也不得用它開啟 production apply。

`base.contentVersion` 必須 pin 正式站完整 public Base；Editor 將 maps 或其他非編輯集合排除後得到的本機 working-set hash，不得回填成 public Base。Editor package 仍不得因此夾帶 map-authoring entries。

G0 應讓 profile 明示 digest algorithm、完整 SHA-256、package schema version／digest、spec digest、compiler contract／fingerprint。公開 descriptor 可在 HTTPS 下只作 discovery；production plan／activation receipt 必須來自 authenticated endpoint，離開該信任通道時還要有 `keyId`／signature。

| Receipt | 用途 | 可否作 CAS Base | 是否代表已啟用 |
|---|---|---:|---:|
| Public editor target profile | discovery／公開 content Base | 否 | 否 |
| Active content target profile | 建包 target／active Base | 是 | 否 |
| Verified plan receipt | 短期 apply 授權與驗證證據 | 只限其 pinned Base，一次性 | 否 |
| Activation receipt | immutable deployed state | 是 | 是 |

### 1.4 可切換政策與不可繞過閘門

可以做成 Editor 開關的是兩種都能被 runtime 忠實執行的選擇，例如 Product 保持 host-local 或 Promote、是否顯示 degraded preview、匯出選取範圍，以及是否另外提出 curation proposal。

下列不可用開關、warning acknowledgement 或管理員勾選繞過：

- schema／exact ref／JCS digest／compiler receipt 不符。
- unknown、unsupported、無法機器判定的 partial，或命中 applicable known-broken。
- ZIP safety 超限、stale base／profile／plan、CAS 失敗。
- 遊戲端重編結果與 expected compiled 不同。
- required scenario、strict refs、full-tree loader 或 candidate health 失敗。

## 2. 唯一實作順序與可啟用範圍

不再維護另一套 P0–P3 優先級；只使用 G0–G5，避免同一工作在不同章節出現互相矛盾的等級。

| 階段 | 依賴 | 主要交付物 | 允許的結果 |
|---|---|---|---|
| G0 Contract alignment | 無 | 同版 schema／spec／profile、穩定 requirement IDs、golden fixtures | 讀取、離線 proposal；不可 production validate/apply |
| G1 Read-only validate | G0 | bounded upload、staging、game recompile、derived rebuild、verified plan | 可驗證；ACTIVE 不變 |
| G2 Atomic activation | G1 | immutable store、operation state machine、CAS、health、rollback | 僅能啟用不需要 G3/G4/G5 的 package |
| G3 Distribution／curation | G2 | distribution index、pickability、獨立 curation transaction | 才能啟用 item／curation 影響的 package |
| G4 Gameplay capability closure | G2 | 將 partial／unsupported 逐項變成可機器驗證的 supported | 才能啟用依賴該能力的 package |
| G5 Preview／provenance／VFX | G2 | render bridge、event provenance、VFX authoring capability | 才能匯入 VFX document；預覽可宣稱 production parity |

任何 package 的可啟用階段取其所有變更與依賴所需的最高階段。例：純技能、全部 capability 已 supported、無 curation 變更，可在 G2 啟用；道具取得性變更至少 G3；partial target-set 或 evade 語意至少等對應 G4 閘門關閉；VFX document 至少 G5。

Raw runtime JSON 永遠只供檢視／除錯，不屬於上述 production apply 路徑。

## 3. G0：先把契約關閉

### 3.1 Profile 與 capability 必須可機器判定

Target profile 至少要 pin：

- package schema version／digest 與 spec digest。
- compiler contract version／fingerprint。
- runtime capability fingerprint。
- authoring rules、tag manifest、asset manifest、curation 與 distribution receipts。
- supported package modes、reload mode、effective limits 與 verification method。

建議將它們收斂成一份 machine-readable `contractReceipt`，再加入 diagnostics registry、ZIP policy、JCS algorithm 與 validation build digests。Compiler fingerprint 至少覆蓋 compiler contract schema、primitive registry、runtime output schema、ability／item patch 規則與 golden-vector set；只 hash 一小份 surface object 不能證明 parity，遊戲端重編仍不可省略。

`runtimeCapabilities.planned[]` 的散文 `caveat` 只可顯示給人，不可讓 importer 解析。每項能力應改成：

- `state`: supported／partial／unsupported。
- `supportedVariants[]` 或 machine-readable `constraints`。
- `applicability`: 會命中哪些 effect／event／entity／context。
- `evidenceDigest`: 對應 contract／scenario／mutation tests。
- 穩定 `requirementId`，不可引用會改號的 Markdown 章節。

在這個結構完成前，production importer 一律把 `partial` 視為 unsupported。`knownBroken` 也必須有 machine-readable applicability；不能只靠 issue 散文判斷 package 是否命中。

Tag manifest 漂移不應封鎖所有 typed package。`matchesEngine=false` 時：

- 禁止新增／改寫 canonical tag，或以 tag 推導 mechanics。
- 仍可保留 Owner 原文與 presentation token。
- 若 authoring truth 已是完整 typed mechanics，且其 required capabilities 可獨立驗證，允許繼續做非 tag-authoring 的 staging validation。

### 3.2 Bootstrap／full／delta 的集合語意

- `bootstrap`：V1 建議一次建立 importer-managed 範圍的完整 canonical authoring corpus；package 必須帶 migration fingerprint 與 managed membership digest。只輸出使用者目前選取的幾份文件，不足以把 authoring store 標成 `ready`。
- `full`：必須明示完整 result membership；任一 base member 遺漏都是錯誤，不是 delete，也不是默默 carry forward。機器 schema 尚未有 membership contract 前，先不要宣告支援 full。
- `delta`：必須 pin active activation／authoring digests，帶非空 selection roots、forward dependencies 與受影響的 reverse closure。

每筆 `changes[].before` 都要對 immutable Base 驗 exact hash。Editor 的三方合併結果、衝突選擇與 provenance 要進 authoring／receipt；Importer 不可以改用 Editor 本機 working-set version 當 Base。

V1 只允許 upsert，不支援顯式或隱式 delete。若未來要支援「部分 bootstrap overlay」，必須新增明確 mode 與 legacy adoption／carry-forward 規則，不能偷用現有 bootstrap。

### 3.3 Digest 的 canonical projection

Machine contract 必須補齊下列 exact projection；只寫「做一個 hash」不足以互通：

- `authoringDigest`：完整 managed authoring store 的 JCS membership＋document digests。
- `compiledDigest`：遊戲端重編後 runtime collections／bundle 的 canonical digest。
- `derivedDigest`：mirrors、indexes 與其他 importer 重建結果。
- `distributionDigest`：可取得性 projection 與其 curation inputs。
- `activationDigest`：以上 digests，加上 compiler、runtime capability、authoring policy、tag、asset、curation receipts 的 canonical record。
- `planDigest`：package、candidate activation、完整 Base/profile/compiler/capability/policy receipts、selection roots、validation build 與 evidence 的 deterministic semantic projection。

Package digest 繼續採 RFC 8785 JCS 與完整 SHA-256。短版 public profile digest 不得當 package／plan／activation digest，也不得作安全簽章。

Actor、environment、issuedAt／expiresAt、一次性 consumed state 不塞進 deterministic `planDigest`；它們由伺服器保存的 verified-plan record 或簽章 envelope 綁定。Apply 只引用這筆 server-side plan，不接受客戶端重送一份自稱已驗證的 plan JSON。

所有 semantic object 預設使用 strict schema。需要向前擴充時只允許版本化 `extensions` namespace，且每個 extension 必須宣告 capability／schema；未知 extension fail closed。`.passthrough()` 可用於保留未知 bytes 供重新輸出，但絕不代表 importer 已理解或接受其語意。`validationPolicy` 等影響 pass/fail 的欄位不得維持 untyped `unknown`；reports 只是不可信證據，不能決定 pass/fail。

### 3.4 Raw JSON 與「單檔匯入」

Package endpoint 收到 `ability@1`／`item@1` 必須回 `RAW_RUNTIME_DOCUMENT_NOT_A_PACKAGE`。不再建議伺服器猜測並包裝 raw document，因為 raw runtime JSON 沒有 Product authoring truth、Base、dependency closure 與 expected compiled。

若後台要提供「單檔 JSON 匯入」，Editor 應輸出一個只選一個 root、但仍含完整 closure 與 manifest 的 **Package JSON**。使用者看到的是一個 JSON 檔，系統仍走同一條安全 pipeline。

### 3.5 Owner source、typed mechanics 與等級政策

- Owner 原始文案在同一 source revision 內 immutable，不縮寫、不潤飾、不刪除幽默內容；Owner 合法更新會建立新 revision，保存 actor、timestamp 與 source digest。
- Editor 只產生 resolved 數值、標籤與中文 Owner issue；Importer 不得再以 runtime tooltip 覆蓋 source。
- 目前 versioned authoring-rules 固定 Q／W／E 四級、R 三級。Editor 完成的線性取樣只由 importer 驗證，不再插值或裁切；規則升版靠 receipt 協商，不把級數硬編進 importer。
- Description、presentation tag 與 typed mechanics 是三種資料；任何一種都不能偷偷取代另一種。
- 事件、條件、目標集合、資源基數、機率、時序及 cross-ability／status／state 關係必須是 typed fields＋exact refs，不能從技能名、中文或 JSON Pointer 反推。

Owner regression corpus 只以 fixture-set id／digest／scenario digests 引用，不把技能數量、英雄名單或缺件寫進 importer 常數。驗證重點是 typed mechanics 完整覆蓋 authoring intent，不是技能是否已有 `template.ref`。

### 3.6 `[]` Markdown 與全域七色盤

儲存的說明只保留簡單 `[token]`，不在每份技能內寫 HTML 或色碼：

```markdown
[主動][指向][範圍]
60秒冷卻

對前方[大範圍]敵人造成350+100%[AP]傷害。
```

| group | 用途 | 色碼 |
|---|---|---|
| `activation` | 主動／被動／切換 | `#7030A0` |
| `cast` | 指向／指定／小範圍／範圍／大範圍 | `#1565C0` |
| `effect` | 傷害／狀態／治療／防禦 | `#D84315` |
| `event` | 觸發事件 | `#546E7A` |
| `condition` | 觸發條件 | `#9A6700` |
| `movement` | 位移／控制 | `#008C95` |
| `scaling` | AP／AD／防禦／魔抗等屬性 | `#BF8F00` |

遊戲端以 allowlisted tokenizer 產生 presentation AST，再依內建 palette id 著色；不解析 description 內的 HTML、CSS、URL 或 script。第一行未知 canonical tag 是 error；正文未知 `[token]` 保留原文並警告。Renderer 不得把 HTML 或 tokenized 結果寫回 authoring JSON。

最低守衛：相鄰 token 不合併；`【…】`／引言不作 mechanics 推論；`GLADIARIA` 不被切成 `GL[AD]IARIA`；獨立詞 `[直線]` 正規化為 `[指向][範圍]`；重複執行 parser 必須冪等。

## 4. G1：Read-only validate

### 4.1 API 與 envelope

建議正式 API：

- `GET /api/v1/content-import/capabilities`
- `GET /api/v1/content-import/active/target-profile`
- `GET /api/v1/content-import/health`
- `POST /api/v1/content-import/validate`
- `POST /api/v1/content-import/apply`
- `POST /api/v1/content-import/rollback`
- `GET /api/v1/content-import/operations/<operationId>`
- `GET /api/v1/content-import/active`
- `GET /api/v1/content-import/active/runtime-bundle`

公開 `/content/editor-target-profile.json` 維持無認證唯讀；validate／apply／rollback 必須有管理員身分、CSRF／CORS 邊界、rate／size limit 與 audit identity。

G0 必須固定：

- Package JSON／ZIP 的 vendor Content-Type、允許的 content sniffing、upload checksum 與錯誤碼；bare `ggd-editor-package@1` manifest 不得冒充完整 Package JSON envelope。
- `ggd-content-validate-request@1`、`ggd-content-apply-request@1`、`ggd-content-rollback-request@1`、`ggd-content-operation@1` 與 error envelope 的 Zod schema。
- apply 的 `planDigest`、expected Base/profile pins、Idempotency-Key 與 retry semantics。
- rollback 的 target activation、expected current activation 與 reason。

Validate／apply／rollback 可用 `202 + operationId` 非同步執行；apply 只收 `operationId + planDigest + expected active generation`，不得再上傳另一包可能不同的 ZIP。三條 route 分開授權。Package 內 `acceptedWarnings[].reviewer` 只是申請文字，真正批准必須由伺服器記錄 authenticated reviewer receipt；V1 未支援 package signature 時，收到 signature 應回 `SIGNATURE_UNSUPPORTED`，不可假裝已驗證。

請修正目前 501 response：在 operation 尚未建立前，用獨立 `ggd-content-import-error@1` envelope；不要用缺少必填欄位、`operationId=null`、未登錄 code 或非法 severity 的假 `ggd-content-import-result@1`。成功、拒絕與未實作回應都必須通過自己的 machine schema。

### 4.2 Bounded transport

JSON 與 ZIP 使用同一 semantic validation pipeline，但 upload／解壓必須 streaming 或寫入有上限的 spool，不能先把整包讀進記憶體。

有效上限採：

```text
effective limit = min(code hard ceiling, deployment policy, decoder/runtime ceiling)
```

Target profile 只宣告最後的 effective limits；`packageSchema`、`targetProfile` 與 `zipSafety` 的欄位映射要有 contract test。ZIP 先做 central-directory preflight，再做 bounded extraction；不得相信 entry 宣告大小。拒絕 encryption、未支援的 ZIP64、polyglot／trailing data，並核對 local header、central record、CRC 與實際解壓 bytes。

必查 zip-slip、absolute path、backslash、non-UTF-8、symlink／device、duplicate path／case collision、entry／archive／expanded size、compression ratio、path length 與 depth。解壓到隔離、不可執行且不可跟隨連結的暫存區；每份 entry 驗 raw bytes hash、JCS canonical hash 與 manifest size。

Payload 與 manifest 必須雙向一對一：每份文件恰有一筆 entry、每筆 entry 恰有一份文件，ZIP 不得夾帶未列 JSON；path、role、kind、id、schema、raw／canonical hash 與 size 必須相符。Package JSON／ZIP 的 authoring、compiled、validation、reports 映射一致，並得到同一 semantic package digest。

### 4.3 Validate pipeline

1. 驗身分、Content-Type、upload checksum 與 transport safety。
2. 驗 package schema、mode／Base invariants、JCS hash、membership 與 dependency closure。
3. 對 live profile、compiler、capability、tag／authoring policy、curation 與 asset receipts。
4. 建 isolated authoring staging tree，以遊戲端 compiler 重編兩次。
5. 比對 expected compiled，重建 mirrors／indexes／bundle／distribution。
6. 跑 strict loader／refs／registries、required scenarios 與 candidate health。
7. 產生有期限、綁定 actor 與所有輸入 receipt 的 verified plan；ACTIVE 不變。

Validate 不得寫 production store、修改 curation、占用 ACTIVE 名稱或產生之後會被誤認為已啟用的 version。

### 4.4 Plan、冪等與 operation state

Server-side verified-plan record 至少綁定 actor、environment／gameId、packageDigest、candidate activationDigest、selection roots、Base profile 與 active generation、compiler/capability/tag/policy/asset/curation digests、validation build、issuedAt／expiresAt 與 required health set。任一 pin 漂移，plan 失效。

Idempotency key 的 scope 是 actor＋environment＋route。相同 key／相同 request digest 的 concurrent retry 合併並回同一 operation；相同 key／不同 digest 回 409 `IDEMPOTENCY_KEY_REUSE_MISMATCH`。紀錄需跨 restart，至少保存到 plan／operation TTL 結束；client timeout 後以 operationId 查詢，不得重做第二次 activation。Plan 成功 apply 後不可被拿來產第二個 activation，但相同冪等重試可讀回第一次結果。

Operation 至少有：`VALIDATING → VALIDATED → PREPARING → PREPARED → ACTIVATING → ACTIVE`，以及 `FAILED`、`ROLLBACK_REQUIRED`、`ROLLED_BACK`。每個狀態要定義可重試性、terminal 條件與 audit event，不能只回模糊的 success／failed。

## 5. Shared compiler、Product 與效果鏈

Editor 與遊戲端必須共用實作，或以雙向 golden fixtures 鎖定：

- effect-template、effect-product、ability／item authoring 與 embedded effect-chain。
- package manifest、diagnostics、scenario 與 fidelity decision。
- RFC 8785 JCS、exact refs、scope／revision 規則。
- `effect-graph-v1` closed AST、finite-number／rounding、primitive registry 與 budgets。

禁止 arbitrary script、expression string、clock／network／filesystem I/O、compile-time RNG、unknown param 忽略、host-local 跨 host ref、ready revision 原地改寫，以及用 tooltip／顯示名稱當 exact ref。

Legacy `template.cards` 只適合同一 resolve phase、同一 target context 的 flat stack。`onHit`、`onLand`、`onTick`、`onTargets`、dash completion 等有時序或 target-set dependency 的行為必須保留 typed child edge。Graph 已編譯為 native effects 後，compiled `ability@1` 必須移除 legacy `ability.template`；兩種 authority 同時存在要回 `COMPILED_AUTHORITY_CONFLICT`。

Multi-card 最低守衛：

1. 每張 card 有非零、可追溯 contribution。
2. 任一 card 失敗時整組失敗，不保留前面 card。
3. 真實 `ContentLoader` 與 SimWorld 都看到每張 contribution。
4. `onLand`／`onHit` child 不被 hoist 到 cast tick。
5. JSON／ZIP reopen 後，遊戲端重編的 trace／digest 一致。
6. 移除第二 card、只讀第一 ref、吞 unknown param 或提前 child edge 的 mutation 會變紅。

## 6. G2：Atomic activation、health 與 rollback

建議流程：

```text
VALIDATED
  → 寫 immutable candidate（authoring＋compiled＋derived＋receipts）
  → fsync／object verification
  → PREPARED：目標 game shards 預載並驗 candidate
  → CAS ACTIVE（expected old → candidate）
  → shard read-back／new-match pin 驗證
  → ACTIVE
```

Candidate 未達 required pre-load health set 前，不可切 ACTIVE。ACTIVE pointer 同時帶單調 `generation`／versionId，CAS 比對 generation 與 digest，避免 A→B→A 的 ABA 問題。若 CAS 後 read-back 失敗，只有在 current generation 仍是本次 candidate 時才自動 CAS 切回 previous activation；若已有後續 activation，禁止覆蓋並標成 `ROLLBACK_REQUIRED`。因此 CAS 前失敗保證 ACTIVE 不變；CAS 後失敗可能短暫選到 candidate，但只能用條件式 rollback 收斂。

- Filesystem：temp version directory、逐檔與目錄 fsync、同 filesystem atomic rename、最後才換 pointer。
- Object store：immutable objects、完整 checksum、conditional pointer put；不要依賴 rename 語意。
- Cluster：profile 明示要求 all shards 或 quorum；`pointer-selected`、`shard-loaded`、`serving-new-matches` 分開回報。
- Match：建立時 pin ContentSnapshot；進行中的 match 不熱換 registry。
- GC：active、previous、pinned／leased activation 永不刪除；retention 到期仍要等 match lease 歸零。

Audit 保存 actor、request／package／plan／activation digests、狀態轉移與 reason code，不保存 secret 或整份 bearer credential。

## 7. G3：Distribution、curation 與 item reachability

Content 存在不代表玩家取得得到。Importer 從 candidate tree 重建 `distribution-index@1` 或等價 projection，至少分開：

- `contentReachable`：content graph 可達。
- `effectiveReachableUnderCuration`：加入 live whitelist／feature flag／ownership 後可達。

Champion manual、random、bot、timeout、mob 與 client 應共用一個 server-authoritative pickability projection；item 的 loot、offer、shop、recipe／book 亦同。`OPEN_HERO_WHITELIST.md`、audit Markdown 與 starter seed 都不能成為 live authority。

Package 不可靜默修改 curation。Curation proposal 使用獨立權限與 transaction；verified plan pin curation digests，apply 前再次 CAS／重算。Content rollback 預設不回滾 curation，只產生 reachability impact report；需要一併回滾時要走第二個明示操作與權限。

Refs 使用 schema-driven recursive collector，覆蓋 Product child chains、ability augment、status／state、projectile／VFX、recipe component／book、aura／hook、loot／offer／shop 與 assets。`itemHasEffect` 應由 typed capability inventory 判斷，不可只看 modifiers／passive。

## 8. G4：Gameplay capability closure

不在本文複製 target-set、evade 或其他會漂移的 capability 清單。每次 validate 只讀 live `runtimeCapabilities`；每關閉一個 caveat，同步更新：

1. machine-readable constraints／applicability。
2. runtime implementation。
3. scenario、golden 與 mutation evidence。
4. capability fingerprint 與 tag manifest 對帳。
5. stable requirement ID 的狀態。

一個 effect kind 出現在 schema union，不代表 execute basis、event source、fumble 區分、exclusive lifecycle、secondary target propagation 或 nested timing 已完整支援。

## 9. G5：Preview、event provenance 與 VFX

遊戲端應提供窄而版本化的 render bridge，只暴露 Arena／EntityView／Asset resolve／VFX event 所需 immutable interfaces，不帶登入、HUD、prediction 或完整 GameApp state machine。

Combat／VFX events 逐步加入 castId、abilityId／itemId、ProductRef／compiled effect path、source／target／point／direction、parent event、RNG stream 與 resolved VFX key。序列化必須 deterministic；舊 consumer 用 optional fields 或新 major schema 漸進遷移。

Editor 的 `IntentFrame → world.step()` 可證明數值與主要機制終態；Babylon 只呈現同一份結果。在 render bridge、secondary targets、projectile／impact timing 與 asset authority 對齊前，只能標示 degraded preview，不能聲稱 production renderer parity。

`vfx-script@1` 已是目前 VFX Forge 的唯一可寫演出文件，寫入位置只允許
`content/vfx-scripts/<abilityId>.json`。`content/abilities/*.json` 保留傷害、次數、
命中與權威時序，Editor 不得以演出操作回寫它；Importer 自己重建 manifest、bundle、
indexes 與 generated files。

目前腳本演出面包含 `modelFx`、`vfx`、`floatingText`、`screenFlash`、
`screenShake`、`sound`、`anim`、`hideBody` 與 `beam`。其中 `beam` 的長、寬、
高度、俯仰、偏航、移動距離、持續、顏色與透明度全是 presentation 值，不得反推命中
或傷害；遊戲端也不得在此套用或暴露全域 AP 傷害倍率。

`reflectSuccess`、`strike`、`castStart`、`castEffect`、`projectileSpawn` 與
`projectileHit` 必須從真實事件來源驅動。`spawnVfx`、螢幕 cue、浮動文字與
`modelFxSpawn` 要保留 authored `origin`，使有腳本的技能可以**取代**能力預設演出；
腳本合成的事件仍走同一個 VfxSystem consumer，但不帶 authored origin，因此不會被
自己的 replacement guard 擋掉。禁止同一刀同時播放預設綁定與腳本綁定。

### 9.1 VFX 有效上限必須來自系統變數

Editor 與 importer 都不可把 schema 最大值當成實際生效值。Target profile／runtime
config receipt 應公開並版本化至少下列變數：單粒子系統存量、每秒發射量、同時 Ribbon
數、Ribbon 停止後清除期限、場景特效強制回收期限、一次性 emitter 上限，以及回合間
清理／重新盤點／預載政策。Editor 顯示與驗證一律使用：

```text
effective value = min(schema bound, runtime config, device/profile clamp)
```

欄位未公開或 receipt 過期時標示「無法證明實際生效值」，不可退回 UI 常數。這些值由
同一份 config registry 驅動 runtime、Forge slider 與 importer diagnostics；參數變更後
coverage／profile fingerprint 必須一起變紅。

### 9.2 視覺驗收不是 schema 驗收

VFX 交付至少保留：雙向 framebuffer 校準結果、真 Sim 觸發班表、1/60 秒決定性重播、
起手／中段／收尾關鍵影格，以及原作參考與逐招 verdict。通過 schema、typecheck 或
coverage freshness 只證明管線可讀，不能替代畫面判讀。

2026-09-01 的 8 招驗收也揭露 imported GLB 的貼圖／隱藏 primitive 品質會直接污染
結果；`imported.herosaber` 等資產可在 0 秒就出現棋盤材質。遊戲端資產管線應加入
missing-texture、巨大遮罩 primitive、材質透明度與 bounds 的載入前守衛，資產未通過時
Forge 必須把「技能腳本」與「基礎模型資產」分開判責，不得把破圖算成腳本通過。

## 10. 驗證矩陣與完成條件

### Contract／transport

- JSON 與 ZIP 對同一 semantic package 得到相同 package／authoring／compiled／plan digests。
- Node／Go／macOS／Windows 的 JCS、Unicode、路徑與 ZIP golden fixtures 一致。
- JSON／ZIP parser、tokenizer、dependency collector 有 fuzz／property tests。
- 篡改 manifest／authoring／compiled／scenario／report entry 全部拒絕。
- Content-Type mismatch、raw runtime package、oversize、zip bomb、case collision 與 path traversal 有穩定中文診斷碼。

### Compiler／gameplay

- 遊戲端重編與 expected compiled byte-identical，unknown params／refs／capabilities 不 silent ignore。
- Multi-card 每份 contribution 與 nested child timing 在真實 SimWorld 發生。
- 相同 seed 的 RNG draws、targets、events 與 digest 一致。
- Partial／known-broken 只有 machine applicability 可證明未命中時才可能通過。
- Owner source 未改寫；presentation 不驅動 runtime。

### Concurrency／durability

- concurrent apply、相同／不同 idempotency key、stale plan／Base／curation 都有測試。
- 在 immutable write、fsync、PREPARED、CAS 與 shard ack 各點做 crash／failure injection。
- Crash 後只看到舊完整版或新完整版；不會出現混合 authoring／runtime／distribution。
- Rollback 不重編、不逐檔覆寫，且不覆蓋較新的合法 activation。
- Schema／compiler downgrade、unsupported major version 與 receipt negotiation fail closed。

### Distribution／presentation

- Champion／item 的所有取得通道使用同一 authority，無 hard-coded whitelist 遺漏。
- Curation 漂移使舊 plan 過期；content rollback 的 reachability 影響可查。
- `[]` tokenizer 無 HTML／CSS／URL／script injection，引用與一般字串不被錯切成 tag。

## 11. 明確不做

- 地形繪製、單位擺放、region、trigger 或完整地圖編輯。
- Binary asset upload、arbitrary script 或 package 自訂 HTML／CSS。
- 信任 Editor validation report 而略過遊戲端重編／重驗。
- 用整站搬遷 ZIP importer、逐文件 PUT 或 raw runtime JSON 模擬 atomic apply。
- 讓 game runtime 反向依賴 Electron／React／Editor UI。

Public Base 可包含 maps、map-spec 或 arena schema，但 Editor package scope 不因此擴張。Importer 驗 public Base 全包 identity，同時拒絕未允許的 map-authoring entries。

## 12. 建議實作落點

| 關注點 | 現行／建議路徑 |
|---|---|
| Package schema／digest／ZIP safety | `packages/shared/src/content/import/` |
| Runtime capabilities | `packages/shared/src/content/editorCapabilities.ts` |
| Target profile | `packages/shared/src/content/import/targetProfile.ts` 與 public profile builder |
| Import routes／operation contract | `apps/content-api/src/importRoutes.ts` |
| Authoring／graph compiler | `packages/shared/src/content/authoring/` |
| Legacy template resolution | `packages/shared/src/content/templates/` |
| Runtime effect／hook／combat | `packages/shared/src/sim/` |
| Content indexes／bundle | `packages/shared/src/content/node/` |
| Platform auth／curation／audit orchestration | `apps/platform/` |
| Client render／VFX seam | `apps/client/src/render/`、`apps/client/src/vfx/` |

Importer／authoring store 應是獨立 module，不拼進平台搬遷 ZIP route。TypeScript shared 層擁有 schema、compiler 與 semantic validation；Go platform 負責權限、upload、operation／audit 與部署編排，不重寫第二套 compiler。

外部管理員請求先由 Go platform 認證、限流並建立 operation，再呼叫內部 Content API 做 staging／compile／validate；game shards 只回 candidate preload 與 activation health。三層都使用同一 operationId／receipt，不讓外部 request 直接碰 production content filesystem。

## 13. 部署決策表

以下是系統所有權／運維選擇，不是逐技能語意提問：

| Decision ID | 建議預設 | 阻塞階段 | 需確認者 |
|---|---|---|---|
| `DEC-ACTIVATION-STORE` | Immutable object／version store＋具交易或 conditional write 的 ACTIVE pointer | G2 | Backend／Ops |
| `DEC-RELOAD-MODE` | `new-match-snapshot`；registry isolation 完成前不開 hot reload | G2 | Game runtime |
| `DEC-PLAN-TTL` | 短 TTL、可設定；過期後重新 validate，不延長舊 plan | G1 | Security／Ops |
| `DEC-HEALTH-SET` | 單機全數、叢集由部署明示 all 或 quorum，不用隱含預設 | G2 | Game／Ops |
| `DEC-RETENTION` | 保留 previous＋近期 versions；有 match lease／pin 者不受天數刪除 | G2 | Ops |
| `DEC-CURATION-APPROVAL` | Content 與 curation 分開 transaction／權限／audit | G3 | Product／Ops |
| `DEC-SIGNING` | Public descriptor 只供 discovery；跨信任通道的 production receipt 使用 keyId＋signature | G0/G2 | Security |
| `DEC-TEST-ENV` | 專用 staging 跑 golden fixtures 與真實 SimWorld，不在合約暴露 secrets | G1 | CI／Ops |

其餘技能語意由 Owner source、typed authoring、fidelity decisions 與 live capability constraints 決定；已結構化的決策不在 apply 時逐項重問。

## Appendix A：穩定 requirement anchors

Capability registry 應引用下列穩定 ID，而不是 `§6.3`、`§16.13` 等章節號；詳細狀態與 caveat 仍由 live registry 提供。

- `REQ-TARGET-SET-CHILD-CONTEXT`：named target set 的 deterministic selection、private context、child timing 與 budgets。
- `REQ-EVADE-EVENT-SOURCE`：真正 evade 與 attacker fumble 分流，miss 不誤觸 on-hit／lifesteal／damage-taken。
- `REQ-EXECUTE-RECOVERY-BASIS`：處決／吞噬的 HP basis、damage queue、invulnerability／shield 順序必須 typed。
- `REQ-EXCLUSIVE-FORM-VISUAL`：gameplay exclusive state 與改變 3D body／animation／asset identity 分開宣告。

G0 要把 registry 舊章節引用遷移成 requirement ID，重新產 capability/profile digests 並跑 freshness guards；不要為了維持舊章節號，在本文保留空洞或跳號段落。

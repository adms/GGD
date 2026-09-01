# 遊戲主程式載入 Editor JSON／ZIP 的修改建議

狀態：**Revision 2.8 — 一次性交付 contract kit；runtime-direct／VFX／來源／審查接縫前置對齊**

最後驗證：2026-09-02 04:24（Asia/Taipei）

適用範圍：GGD 遊戲主程式、後台與 Content Import API；不是 Editor UI 實作說明。

本文只定義「遊戲端還必須實作什麼」與各階段的完成閘門。Draft 0.4 與目前 profile
已發生 runtime-direct 漂移；Main 應以
[`GGD_EDITOR_PACKAGE_SPEC_RUNTIME_DIRECT_DELTA_20260902.md`](docs/editor-contract/GGD_EDITOR_PACKAGE_SPEC_RUNTIME_DIRECT_DELTA_20260902.md)
原子升級 spec、`packages/shared/src/content/import/` machine schema、profile 與 importer，
不能只挑其中一份當真相。

相關資料：

- [`GGD_EDITOR_PACKAGE_SPEC.md`](GGD_EDITOR_PACKAGE_SPEC.md)：Package JSON／ZIP 的共同資料契約。
- [`GGD_EDITOR_PACKAGE_SPEC_RUNTIME_DIRECT_DELTA_20260902.md`](docs/editor-contract/GGD_EDITOR_PACKAGE_SPEC_RUNTIME_DIRECT_DELTA_20260902.md)：Draft 0.5 runtime-direct 與 verified-plan apply 的原子更新差異。
- [`docs/_codex-handoff.md`](docs/_codex-handoff.md)：目前引擎能力與資料入口導覽。
- [`OPEN_HERO_WHITELIST.md`](OPEN_HERO_WHITELIST.md)：生成的英雄參考名單，不是 live curation authority。
- [`LEGENDARY_WEAPON_FULL_AUDIT.md`](LEGENDARY_WEAPON_FULL_AUDIT.md)：生成的傳說武器 census，不是 importer 常數。

## 1. 結論與系統邊界

遊戲端最終要能：

1. 明確辨識 Package JSON、Package ZIP 與 raw Runtime JSON，不依副檔名猜測。
2. 在隔離 staging 中以和 runtime 共用的 authoring processor 驗 `ability@1`／`item@1`、exact refs、capability 與 authoring rules；目前不建立假的第二份 compiled representation。
3. 重建 indexes、bundle、distribution 與 champion mirrors，不信任 package 內的 derived files。
4. 將 canonical runtime documents、derived projections 與完整 receipts 寫成同一個 immutable activation。
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

這些來源必須互相一致，不存在「高順位內容自動覆蓋低順位內容」。只要 schema、spec、profile、authoring processor 或 receipt 彼此矛盾，就停止 validate／apply 並回報 contract drift。

### 1.2 目前真正的 blockers

正式站 [`editor-target-profile.json`](https://ggd.adms.ai/content/editor-target-profile.json) 已可讓外部 Editor 讀取公開 Base，但目前仍有以下阻塞：

| Blocker | 現況 | 影響 |
|---|---|---|
| Managed authoring／activation store | 尚不存在；只允許 `bootstrap` proposal | 不可產 production `full`／`delta` |
| Runtime-direct receipt | profile 宣告 compiler 已移除，但 package schema 仍強制 compiler 欄位 | Editor 不會填假 `none`／fingerprint；三份 machine truth 對齊前不可建 production package |
| G2 Base receipts | 缺 `implementedStage=G2`、`base.gameRevision`、bootstrap migration fingerprint，full/delta 另缺 activation／authoring digests | 無法安全 pin Base 或判斷匯入模式 |
| Machine endpoints | 未公告 validate／apply／active runtime bundle 等版本化端點 | Editor 不從 URL 字串猜 route |
| Public package contract | Draft 0.5 delta 已裁定方向，但出貨 spec label／shared schema 仍是 Draft 0.4 | importer 無法安全協商 exact schema／spec |
| Tag engine 對帳 | `matchesEngine=false` | 不可用該 manifest 證明 canonical tag 與 mechanics 一致 |
| Authoring rules | 公開 pricing endpoint 為 `null` | MP／冷卻等規則只能當本機建議，不能當 production contract |
| Write API | validate／apply／rollback 仍回 501 | 目前只能讀 profile、離線建包與本機自驗 |

版本、數量、短 digest 與 capability 明細都只從 live receipt 讀取，不再抄入本文或程式常數。

三個環境不可再用一句「目前 G1」混稱：repo／local 有 package schema，但它仍殘留強制 compiler 欄位；public static profile 已宣告 runtime-direct authoring 並移除 compiler；production private importer 尚未提供 validate／apply／rollback。`implementedStage` 是必要的能力收據，不可由 Editor 猜測；每個 operation 仍須有明確 `supported／unsupported` 狀態，不能只從階段字串推算功能。

Editor 端已完成 deterministic Package JSON／STORE ZIP builder、JCS/hash、自我 reopen 與 ZIP safety preflight，也完成 Desktop 遠端唯讀 Base、三方合併與來源狀態顯示。上述 receipt 未對齊前，Export Center 會保留模式但停用 production 匯出，不把本機 bundle 冒充可套用 package。

### 1.3 Public descriptor 與 active receipt 必須分開

`ggd-editor-target-profile@1` 是公開、唯讀的 discovery／Base descriptor，不是 distribution receipt，也不是 activation receipt。它目前的短 digest 只適合偵測漂移，不代表簽章或可信來源。

`ggd-content-target-profile@1` 應只由遊戲後台的 authenticated active endpoint 產生。Desktop 若為 UI 相容性把 public profile 投影成類似形狀，必須標示 `source=public-adapter`，不得偽裝成後台簽發的 active receipt，也不得用它開啟 production apply。

`base.contentVersion` 必須 pin 正式站完整 public Base；Editor 將 maps 或其他非編輯集合排除後得到的本機 working-set hash，不得回填成 public Base。Editor package 仍不得因此夾帶 map-authoring entries。

G0 應讓 profile 明示 digest algorithm、完整 SHA-256、package schema version／digest、spec digest，以及 `authoringProcessor` 的 contract version／fingerprint。只有 representation 真的需要 compile 時才另外帶 compiler receipt；runtime-direct 不得用假 compiler 填欄。公開 descriptor 可在 HTTPS 下只作 discovery；production plan／activation receipt 必須來自 authenticated endpoint，離開該信任通道時還要有 `keyId`／signature。

| Receipt | 用途 | 可否作 CAS Base | 是否代表已啟用 |
|---|---|---:|---:|
| Public editor target profile | discovery／公開 content Base | 否 | 否 |
| Active content target profile | 建包 target／active Base | 是 | 否 |
| Verified plan receipt | 短期 apply 授權與驗證證據 | 只限其 pinned Base，一次性 | 否 |
| Activation receipt | immutable deployed state | 是 | 是 |

### 1.4 可切換政策與不可繞過閘門

可以做成 Editor 開關的是兩種都能被 runtime 忠實執行的選擇，例如 Product 保持 host-local 或 Promote、是否顯示 degraded preview、匯出選取範圍，以及是否另外提出 curation proposal。

下列不可用開關、warning acknowledgement 或管理員勾選繞過：

- schema／exact ref／JCS digest／authoring-processor receipt 不符。
- unknown、unsupported、無法機器判定的 partial，或命中 applicable known-broken。
- ZIP safety 超限、stale base／profile／plan、CAS 失敗。
- staging processor 的 canonical result、依賴 closure 或 derived rebuild 與 receipt 不同。
- required scenario、strict refs、full-tree loader 或 candidate health 失敗。
- AI 產生或 AI 調整的技能效果、機制、動畫與 VFX 尚未完成上線前人工批核。
- 人工核准的 candidate hash 與實際 Promote 內容不同，或目標 Base 在送審後已漂移。

### 1.5 AI 變更一律先審後上；不可沿用「先上線、事後否決」

既有「功能批次驗收」是一般功能批次的事後 rollback 流程，不能套用到 AI 內容。AI
目前的視覺與機制正確性不穩定，因此 AI 產生或調整的技能效果、機制、動畫、特效必須
先存成不生效的 proposal，進入後台同一頁人工批核；pending／rejected 都不得出現在
ACTIVE content、overlay、ZIP apply 或遊戲 registry。

AI proposal 至少保存 target collection／id、candidate JSON、candidate hash、Base hash、
來源、摘要、視覺證據、自動視覺分數與時間。人工 verdict 必須保存 reviewer、中文意見、
肉眼分數（視覺驗收時）與精確 candidate hash。任何內容修改都會使舊 verdict 變成
`changed-after-review`；Promote 時再次跑最新 schema／capability／asset safety，並用 Base
hash 作 CAS，禁止「核准 A、套用 B」。核准與 Promote 是兩個明確動作，不做自動核准。
自動截圖審查、schema、測試與 AI 自評只可作為證據；無論分數多高，都不能建立人工
verdict、不能解鎖 Promote，也不能把候選提前寫入 overlay、ZIP 或 live content。

本機 MVP 以 loopback-only content-api 隔離 proposal／verdict；production 必須把 verdict
與 Promote 放在 authenticated Admin API，以 session actor 寫 audit log，Editor／AI proxy
本身不得持有這兩條權限。只在前端隱藏按鈕、相信 `reviewer` 字串或讓 AI 呼叫同一支管理員
writer，都不能算 HITL 權限邊界。

八個指定技能是 `editor-capability-fixture`：只用來驗收 Editor 能否表達指定場景，後台
只能判定 Editor 驗收 pass／fail 並記錄 0～10 肉眼分數；其 proposal 永久
`promotable=false`，伺服器 Promote 端點也必須拒絕。fixture 應住 Editor／review material，
不住 `content/vfx-scripts/`，也不可因驗收通過而進遊戲主程式。若日後真的要上線其中一招，
必須另建 production candidate，重新和當時 Base 比對並獨立人工核准。

這個限制不是只靠 UI 隱藏按鈕：八個 fixture ID 由伺服器再分類，即使客戶端送成
`production-candidate` 也會被強制改成 fixture；普通內容 CRUD 也不能拿來寫入
`vfx-scripts`。正式環境還必須讓 AI／Editor 的 credential 只有「提案」權限，人工 verdict
與 Promote 使用不同的 Admin 權限，才能把省略標頭或直接呼叫 writer 的繞過路徑封死。

### 1.6 Main 應一次回交 contract kit，不逐 route 對接

Main 在 G0 第一批應從 shared machine schema 產生一包 conformance fixtures，讓 Editor、
Go platform、Content API 與 CI 讀同一份資料：public／authenticated profiles、contract index、
完整 Base bundle、asset manifest、resolved appearance、source-adapter descriptors／plans、
bootstrap／full／delta Package JSON＋STORE ZIP、operation success／error／stale／rollback receipts、
AI proposal／evidence／verdict fixtures，以及 planned `vfx-script@1` package。

Contract index 至少描述每個 authoring representation、operation endpoint、media type、auth scope、
stage、mode、quota、request／response schema 與完整 digest。第一批只開 ability／item G2，但
store／diff／audit／operation 不可 hard-code 成兩種；`vfx-script@1`、未來 Product／Chain 與
planned gameplay mechanisms 先以 registry row 表達 planned／unsupported。如此 G3–G5 只改
capability state 與新增 implementation，不必重做 importer wire contract。

Main 同時提供本機 reference server／fixture harness。Editor 只對 fixture contract 寫 client，
production 使用同一 conformance suite；不能用散文範例、短 digest 或人工貼 JSON 充當交接。
完整回交清單見
`docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md` 第 0 節。

## 2. 唯一實作順序與可啟用範圍

不再維護另一套 P0–P3 優先級；只使用 G0–G5，避免同一工作在不同章節出現互相矛盾的等級。

| 階段 | 依賴 | 主要交付物 | 允許的結果 |
|---|---|---|---|
| G0 Contract alignment | 無 | 同版 schema／spec／profile、穩定 requirement IDs、golden fixtures | 讀取、離線 proposal；不可 production validate/apply |
| G1 Read-only validate | G0 | bounded upload、runtime-direct staging validation、derived rebuild、verified plan | 可驗證；ACTIVE 不變 |
| G2 Atomic activation | G1 | immutable store、operation state machine、CAS、health、rollback | 僅能啟用不需要 G3/G4/G5 的 package |
| G3 Distribution／curation | G2 | distribution index、pickability、獨立 curation transaction | 才能啟用 item／curation 影響的 package |
| G4 Gameplay capability closure | G2 | 將 partial／unsupported 逐項變成可機器驗證的 supported | 才能啟用依賴該能力的 package |
| G5 Preview／provenance／VFX | G2 | render bridge、event provenance、VFX authoring capability | 才能匯入 VFX document；預覽可宣稱 production parity |

任何 package 的可啟用階段取其所有變更與依賴所需的最高階段。例：純技能、全部 capability 已 supported、無 curation 變更，可在 G2 啟用；道具取得性變更至少 G3；partial target-set 或 evade 語意至少等對應 G4 閘門關閉；VFX document 至少 G5。

Raw runtime JSON 本身永遠不是 production apply authority；它只能供檢視／除錯，或進入
`validate-single` 由 server 包裝成 canonical package／verified plan，不能被直接 PUT 到 ACTIVE。

## 3. G0：先把契約關閉

### 3.1 Profile 與 capability 必須可機器判定

Target profile 至少要 pin：

- package schema version／digest 與 spec digest。
- authoring processor contract version／fingerprint；只有非 runtime-direct representation 才另帶 compiler receipt。
- runtime capability fingerprint。
- authoring rules、tag manifest、asset manifest、curation 與 distribution receipts。
- supported package modes、reload mode、effective limits 與 verification method。

建議將它們收斂成一份 machine-readable `contractReceipt`，再加入 diagnostics registry、ZIP policy、JCS algorithm 與 validation build digests。Runtime-direct `authoringProcessor.fingerprint` 至少覆蓋 shared Zod、exact-ref collector、capability applicability、authoring rules、runtime loader、derived rebuild 規則與 golden-vector set；只 hash 一小份 surface object不能證明 parity。

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
- `runtimeDigest`：staging 驗證後 canonical runtime collections／bundle 的 digest。
- `derivedDigest`：mirrors、indexes 與其他 importer 重建結果。
- `distributionDigest`：可取得性 projection 與其 curation inputs。
- `activationDigest`：以上 digests，加上 authoring processor、runtime capability、authoring policy、tag、asset、curation receipts 的 canonical record。
- `planDigest`：package、candidate activation、完整 Base/profile/authoring-processor/capability/policy receipts、selection roots、validation build 與 evidence 的 deterministic semantic projection。

Package digest 繼續採 RFC 8785 JCS 與完整 SHA-256。短版 public profile digest 不得當 package／plan／activation digest，也不得作安全簽章。

Actor、environment、issuedAt／expiresAt、一次性 consumed state 不塞進 deterministic `planDigest`；它們由伺服器保存的 verified-plan record 或簽章 envelope 綁定。Apply 只引用這筆 server-side plan，不接受客戶端重送一份自稱已驗證的 plan JSON。

所有 semantic object 預設使用 strict schema。需要向前擴充時只允許版本化 `extensions` namespace，且每個 extension 必須宣告 capability／schema；未知 extension fail closed。`.passthrough()` 可用於保留未知 bytes 供重新輸出，但絕不代表 importer 已理解或接受其語意。`validationPolicy` 等影響 pass/fail 的欄位不得維持 untyped `unknown`；reports 只是不可信證據，不能決定 pass/fail。

### 3.4 Raw JSON 與「單檔匯入」

Package endpoint 收到裸 `ability@1`／`item@1` 必須回
`RAW_RUNTIME_DOCUMENT_NOT_A_PACKAGE`。Runtime-direct 是 package 內 canonical document 的
authority，並不表示可以省略 manifest、Base、dependency closure、receipts 與 operation
contract；通用 Package route 不可猜測 raw document。

但產品明確需要後台載入單檔 JSON，因此 Main 另提供 versioned `validate-single` convenience
route。它只收一份已知 runtime schema 與 authenticated active target／expected generation，
server 從 immutable ACTIVE snapshot 取得 exact external dependencies，建立 canonical single-root
delta Package、跑同一個 processor 並回 verified plan；apply 仍只消耗 plan。若 ref 不在 ACTIVE、
依賴 hash 漂移、文件需要另一份未上線變更或 representation 尚未 supported，就拒絕並要求
完整 Package JSON／ZIP。第一批只允許 ability／item；`vfx-script@1` 等 G5。

Editor 也可輸出只選一個 root、但仍含完整 closure 與 manifest 的 Package JSON。兩種 UI 都能
讓使用者看到「一個 JSON 檔」，但沒有任何路徑直接 PUT raw document 或略過 Base／closure／CAS。

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
- `POST /api/v1/content-import/validate-single`
- `POST /api/v1/content-import/apply`
- `POST /api/v1/content-import/rollback`
- `GET /api/v1/content-import/operations/<operationId>`
- `GET /api/v1/content-import/active`
- `GET /api/v1/content-import/active/runtime-bundle`

公開 `/content/editor-target-profile.json` 維持無認證唯讀；validate／apply／rollback 必須有管理員身分、CSRF／CORS 邊界、rate／size limit 與 audit identity。

G0 必須固定：

- Package JSON／ZIP 的 vendor Content-Type、允許的 content sniffing、upload checksum 與錯誤碼；bare `ggd-editor-package@1` manifest 不得冒充完整 Package JSON envelope。
- `ggd-content-validate-request@1`、`ggd-content-validate-single-request@1`、
  `ggd-content-apply-request@1`、`ggd-content-rollback-request@1`、
  `ggd-content-operation@1` 與 error envelope 的 Zod schema。
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

Payload 與 manifest 必須雙向一對一：每份文件恰有一筆 entry、每筆 entry 恰有一份文件，ZIP 不得夾帶未列 JSON；path、role、kind、id、schema、raw／canonical hash 與 size 必須相符。Package JSON／ZIP 的 documents、validation、reports 映射一致，並得到同一 semantic package digest。

### 4.3 Validate pipeline

1. 驗身分、Content-Type、upload checksum 與 transport safety。
2. 驗 package schema、mode／Base invariants、JCS hash、membership 與 dependency closure。
3. 對 live profile、authoring processor、capability、tag／authoring policy、curation 與 asset receipts。
4. 建 isolated runtime-direct staging tree，以 shared processor 驗 Zod、exact refs、closure、capability、rules 與 loader。
5. 重建 mirrors／indexes／bundle／distribution，並和 candidate receipts 比對。
6. 跑 strict loader／refs／registries、required scenarios 與 candidate health。
7. 產生有期限、綁定 actor 與所有輸入 receipt 的 verified plan；ACTIVE 不變。

Validate 不得寫 production store、修改 curation、占用 ACTIVE 名稱或產生之後會被誤認為已啟用的 version。

### 4.4 Plan、冪等與 operation state

Server-side verified-plan record 至少綁定 actor、environment／gameId、packageDigest、candidate activationDigest、selection roots、Base profile 與 active generation、authoring-processor/capability/tag/policy/asset/curation digests、validation build、issuedAt／expiresAt 與 required health set。任一 pin 漂移，plan 失效。

Idempotency key 的 scope 是 actor＋environment＋route。相同 key／相同 request digest 的 concurrent retry 合併並回同一 operation；相同 key／不同 digest 回 409 `IDEMPOTENCY_KEY_REUSE_MISMATCH`。紀錄需跨 restart，至少保存到 plan／operation TTL 結束；client timeout 後以 operationId 查詢，不得重做第二次 activation。Plan 成功 apply 後不可被拿來產第二個 activation，但相同冪等重試可讀回第一次結果。

Operation 至少有：`VALIDATING → VALIDATED → PREPARING → PREPARED → ACTIVATING → ACTIVE`，以及 `FAILED`、`ROLLBACK_REQUIRED`、`ROLLED_BACK`。每個狀態要定義可重試性、terminal 條件與 audit event，不能只回模糊的 success／failed。

## 5. Shared authoring processor、Product 與效果鏈

目前 production authoring authority 是 runtime-direct `ability@1`／`item@1`。Editor、Importer 與遊戲端必須共用 shared Zod、exact refs、capability applicability、authoring rules 與 loader，並以雙向 golden fixtures 鎖定。不要為了沿用舊 manifest 欄位建立假的 compiler 或第二份 authority。

若未來 profile 再明示支援 effect-template／effect-product／effect-chain，才加入下列 authoring representations：

- effect-template、effect-product、ability／item authoring 與 embedded effect-chain。
- package manifest、diagnostics、scenario 與 fidelity decision。
- RFC 8785 JCS、exact refs、scope／revision 規則。
- `effect-graph-v1` closed AST、finite-number／rounding、primitive registry 與 budgets。

禁止 arbitrary script、expression string、clock／network／filesystem I/O、authoring-time RNG、unknown param 忽略、host-local 跨 host ref、ready revision 原地改寫，以及用 tooltip／顯示名稱當 exact ref。

Legacy `template.cards` 只適合同一 resolve phase、同一 target context 的 flat stack。`onHit`、`onLand`、`onTick`、`onTargets`、dash completion 等有時序或 target-set dependency 的行為必須保留 typed child edge。若未來重新引入 graph-to-runtime compiler，compiled `ability@1` 必須移除 legacy `ability.template`；兩種 authority 同時存在要回 `COMPILED_AUTHORITY_CONFLICT`。目前 profile 宣告這些層 `notRequired`，Importer 不得要求 Editor 填它們。

Multi-card 最低守衛：

1. 每張 card 有非零、可追溯 contribution。
2. 任一 card 失敗時整組失敗，不保留前面 card。
3. 真實 `ContentLoader` 與 SimWorld 都看到每張 contribution。
4. `onLand`／`onHit` child 不被 hoist 到 cast tick。
5. JSON／ZIP reopen 後，shared processor 與 runtime loader 的 trace／digest 一致。
6. 移除第二 card、只讀第一 ref、吞 unknown param 或提前 child edge 的 mutation 會變紅。

## 6. G2：Atomic activation、health 與 rollback

建議流程：

```text
VALIDATED
  → 寫 immutable candidate（runtime documents＋derived＋receipts）
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

`vfx-script@1` 已是目前 VFX Forge 唯一能提出的演出文件。Forge 的儲存動作只能建立
`docs/_review` 之類隔離材料中的 AI proposal，不能直接寫 `content/vfx-scripts/`。
只有人工核准後的獨立 Promote 動作，才可將精確 hash 寫入
`content/vfx-scripts/<abilityId>.json`。`content/abilities/*.json` 保留傷害、次數、命中與
權威時序，Editor 不得以演出操作回寫它；Importer 自己重建 manifest、bundle、indexes
與 generated files。

目前腳本演出面包含 `modelFx`、`vfx`、`floatingText`、`screenFlash`、
`screenShake`、`sound`、`anim`、`hideBody` 與 `beam`。其中 `beam` 的長、寬、
高度、俯仰、偏航、移動距離、持續、顏色與透明度全是 presentation 值，不得反推命中
或傷害；遊戲端也不得在此套用或暴露全域 AP 傷害倍率。

`reflectSuccess`、`strike`、`castStart`、`castEffect`、`projectileSpawn` 與
`projectileHit` 必須從真實事件來源驅動。`spawnVfx`、螢幕 cue、浮動文字與
`modelFxSpawn` 要保留 authored `origin`，使有腳本的技能可以**取代**能力預設演出；
腳本合成的事件仍走同一個 VfxSystem consumer，但不帶 authored origin，因此不會被
自己的 replacement guard 擋掉。禁止同一刀同時播放預設綁定與腳本綁定。

投射物的 `projectileSpawn`、`projectileHit` 與非普攻 `projectileEnd` 也要攜帶同一份
authored `origin`。只靠共用 `projectileId` 反查會把一顆彈道認領給多份 script，並讓預設
發射／命中／落空特效與自訂演出重疊；呈現層必須先用精確 ability origin 判斷所有權，
舊 host 才允許退回 `projectileId` 相容查找。這個 origin 只控制演出歸屬，不改傷害、射程
或命中判定。

### 9.1 VFX 有效上限必須來自系統變數

Editor 與 importer 都不可把 schema 最大值當成實際生效值。Target profile／runtime
config receipt 應公開並版本化至少下列變數：單粒子系統存量、每秒發射量、同時 Ribbon
數、Ribbon 停止後清除期限、場景特效強制回收期限、一次性 emitter 上限，以及回合間
清理／重新盤點／預載政策。Editor 顯示與驗證一律使用：

```text
effective value = min(schema bound, runtime config, device/profile clamp)
```

公開 profile 的 canonical JSON 欄位固定為
`maxParticlesPerSystem`、`maxRatePerSystem`、`maxActiveRibbons`、
`ribbonFadeBudgetSec`、`hardMaxLifeSec`、`hardCapScope`、
`maxOneShotEmitters`、`roundPurgeMode`。其中 `hardCapScope` 只接受
`scene／managed／off`，`roundPurgeMode` 只接受 `off／soft／full`，無上限 emitter
以 JSON `null` 表示。整個 `effectiveVfxLimits` 缺席是舊版相容狀態；物件存在卻缺任一格
是契約損壞，不能拿本機值補洞。

欄位未公開或 receipt 過期時標示「無法證明實際生效值」，不可退回 UI 常數。這些值由
同一份 config registry 驅動 runtime、Forge slider 與 importer diagnostics；參數變更後
coverage／profile fingerprint 必須一起變紅。Desktop 必須先重驗 pinned profile digest；
Editor 再逐格比對 target profile 與目前 renderer resolver，任一格漂移即停止 production
parity 預覽，不可只把 profile 數字印在畫面上而讓 renderer 繼續用另一套值。

### 9.2 視覺驗收不是 schema 驗收

VFX 交付至少保留：雙向 framebuffer 校準結果、真 Sim 觸發班表、1/60 秒決定性重播、
起手／中段／收尾關鍵影格，以及原作參考與逐招 verdict。通過 schema、typecheck 或
coverage freshness 只證明管線可讀，不能替代畫面判讀。

2026-09-01 的 8 招是 **Editor-only capability fixtures**，不屬於遊戲內容。它們揭露
imported GLB 的貼圖／隱藏 primitive 品質會直接污染
結果；`imported.herosaber` 等資產可在 0 秒就出現棋盤材質。遊戲端資產管線應加入
missing-texture、巨大遮罩 primitive、材質透明度與 bounds 的載入前守衛，資產未通過時
Forge 必須把「技能腳本」與「基礎模型資產」分開判責，不得把破圖算成腳本通過。

目前 AI 生成視覺品質只能當預審：Owner 肉眼觀察約 0～4／10，自動截圖審查約
2～6／10。兩種分數都不可自行產生 pass；八招在後台維持 `fixture-pending`，直到人類逐招
查看起手／中段／收尾畫面、填 0～10 肉眼分數與中文原因，再明確按 pass／fail。就算
pass，也只證明 Editor 具有表達能力，仍沒有 Promote 按鈕或伺服器寫入路徑。

### 9.3 貼圖去背必須按實際合成式驗證

不能只檢查 PNG「有沒有 alpha」。例如透明區仍保留白色 RGB 時，標準 alpha 混合會
去背，但 `additive = ONE+ONE` 不讀 source alpha，實際遊玩仍會把整張白色矩形加進
framebuffer；反過來，沒有 alpha 的黑底光效在 additive 下是安全的，因為黑色加零。
因此 importer／CI 必須用「VFX 文件的 blendMode × 貼圖真實像素 × authored color」
計算 compositing-neutral 覆蓋率，並同時驗證引用檔存在且可解碼。禁止用副檔名、
`hasAlpha` 或壞檔名豁免清單代替。

目前來源抽取器會對大面積「透明但 RGB 明亮」的 map-archive matte 清除透明區 RGB；
`vfxTextureBackdrop.test.ts` 會掃描所有出貨 `vfx@1`／`ribbon@1` 與真 PNG。任何新增
素材若在它實際的合成模式下幾乎沒有可消失背景，內容建置必須失敗，不能進 ZIP。

同一條規則也要套到模型內嵌貼圖。遊戲會把 emissive model-FX 材質轉成 Babylon
`ALPHA_ONEONE`，所以 `modelFxTextureBackdrop.test.ts` 必須掃描 Editor 資源池全部
`model@1`，沿 `model document → glbPath → material → texture → embedded image` 讀真實
像素；含 cut-out 背景的 emissive 材質若在 `alpha≈0` 處仍保留亮 RGB，內容建置同樣
失敗。修正必須由 MDX／BLP 轉檔來源重生 GLB，只清理該 additive 材質的透明背景；
禁止用 model id 白名單、runtime 特判或把整張 UV atlas 自動去背，否則可能連角色本體
一起破壞。舊 GLB 若重新轉檔會改變幾何，只能採用由其自身 glTF material graph 定位
圖片、保留所有非圖片資料的 image-only sanitizer，並由 geometry ratchet 證明未漂移。

Editor 的資源池、拖放、儲存與包含 VFX Script 的 ZIP 匯出共用同一個 asset-safety
gate；`unknown`、缺檔、不可解碼或不安全一律 fail closed，顯示中文原因，不能靠使用者
略過。只有通過「真 blend mode × 真像素」檢查的資源才能寫入腳本。遊戲端仍要作最後
防守：貼圖缺失或未通過 receipt 時跳過該 emitter 並一次性記錄 asset id，不得顯示
checker／debug 貼圖；模型若角色本體不可用才退回乾淨的程序替身。

## 10. 驗證矩陣與完成條件

### Contract／transport

- JSON 與 ZIP 對同一 semantic package 得到相同 package／runtime／derived／plan digests。
- Node／Go／macOS／Windows 的 JCS、Unicode、路徑與 ZIP golden fixtures 一致。
- JSON／ZIP parser、tokenizer、dependency collector 有 fuzz／property tests。
- 篡改 manifest／document／scenario／report entry 全部拒絕。
- Content-Type mismatch、raw runtime package、oversize、zip bomb、case collision 與 path traversal 有穩定中文診斷碼。

### Authoring processor／gameplay

- Shared processor、Importer staging 與 runtime loader 對同一 runtime-direct corpus 得到相同 digest；unknown params／refs／capabilities 不 silent ignore。
- Multi-card 每份 contribution 與 nested child timing 在真實 SimWorld 發生。
- 相同 seed 的 RNG draws、targets、events 與 digest 一致。
- Partial／known-broken 只有 machine applicability 可證明未命中時才可能通過。
- Owner source 未改寫；presentation 不驅動 runtime。

### Concurrency／durability

- concurrent apply、相同／不同 idempotency key、stale plan／Base／curation 都有測試。
- 在 immutable write、fsync、PREPARED、CAS 與 shard ack 各點做 crash／failure injection。
- Crash 後只看到舊完整版或新完整版；不會出現混合 runtime documents／derived／distribution。
- Rollback 不重算、不逐檔覆寫，且不覆蓋較新的合法 activation。
- Schema／authoring-processor downgrade、unsupported major version 與 receipt negotiation fail closed。

### Distribution／presentation

- Champion／item 的所有取得通道使用同一 authority，無 hard-coded whitelist 遺漏。
- Curation 漂移使舊 plan 過期；content rollback 的 reachability 影響可查。
- `[]` tokenizer 無 HTML／CSS／URL／script injection，引用與一般字串不被錯切成 tag。

## 11. 明確不做

- 地形繪製、單位擺放、region、trigger 或完整地圖編輯。
- Binary asset upload、arbitrary script 或 package 自訂 HTML／CSS。
- 信任 Editor validation report 而略過遊戲端 staging 重驗。
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
| Runtime-direct authoring processor | shared runtime Zod、ref collector、authoring-rules、capability applicability 與 loader；由 main 匯出單一版本化入口 |
| Legacy template resolution | `packages/shared/src/content/templates/` |
| Runtime effect／hook／combat | `packages/shared/src/sim/` |
| Content indexes／bundle | `packages/shared/src/content/node/` |
| Platform auth／curation／audit orchestration | `apps/platform/` |
| Client render／VFX seam | `apps/client/src/render/`、`apps/client/src/vfx/` |

Importer／authoring store 應是獨立 module，不拼進平台搬遷 ZIP route。TypeScript shared 層擁有 schema、runtime-direct authoring processor 與 semantic validation；Go platform 負責權限、upload、operation／audit 與部署編排，不重寫第二套 validator 或偷偷改寫文件。

外部管理員請求先由 Go platform 認證、限流並建立 operation，再呼叫內部 Content API 做 staging／validate／derived rebuild；game shards 只回 candidate preload 與 activation health。三層都使用同一 operationId／receipt，不讓外部 request 直接碰 production content filesystem。

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

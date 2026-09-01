# 遊戲主程式載入 Editor JSON／ZIP 的修改建議

狀態：**Revision 3.0 — 依 `origin/main@de7006c6` 的實作重新收斂**

最後驗證：**2026-09-02 07:23（Asia/Taipei）**

適用範圍：GGD 遊戲主程式、後台、Content Import 與遊戲 runtime；不是 Editor UI 或地圖編輯器規格。

完整逐項差異與可直接交給 Main Codex 的驗收條件見：
[`docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md`](docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md)。

## 1. 一句話結論

Main 已完成 importer、來源轉接器與批核流程的**骨架**，不需要再從零設計；現在要補的是
四個承重接縫：**真 schema/rules 驗證、完整 snapshot、遊戲實際載入、批核後真的 apply**。

只有 API 回 `activated`、測試看到 ACTIVE pointer 或後台出現 Promote 按鈕，都不能單獨算完成。

## 2. 固定邊界

- Editor 是 Win／macOS 本機程式；所有草稿、修改、預覽與匯出先留在本機。
- Editor 可從 `https://ggd.adms.ai/content/editor-target-profile.json` 與其指向的公開內容讀唯讀 Base。
- Editor 可匯出：選取差異 Package、完整 Package、Package ZIP，以及單份 runtime JSON。
- 正式套用權限只在 authenticated Admin／internal importer；Electron 不持有 production Promote credential。
- AI 產生或調整技能、機制、動畫或 VFX，一律先成為 immutable proposal，人工審查後另按 Promote。
- 八個驗收技能只證明 Editor 表達能力，永久不可 Promote；真正上線須另建 production candidate。
- Editor 不修改地形、單位擺放、region、trigger，也不做完整地圖編輯器。
- 遊戲本體的系統 AP 乘數不屬於 Package 契約，不得寫進 Editor authoring schema。

## 3. 目前 Main 的真實狀態

基線：`origin/main@de7006c6`。

| 面向 | 現況 | 判定 |
| --- | --- | --- |
| runtime-direct manifest | `authoringProcessor` 已出貨，compiler 改為 optional | 已完成 |
| JSON／ZIP transport | bounded upload、ZIP 安全、CRC、hash 已有 | 已完成骨架 |
| import routes | validate/apply/rollback/active/runtime-bundle/operations/audit 已掛 | 已完成骨架 |
| import state store | candidate、staging、fsync、ACTIVE CAS、rollback 已有 | 已完成骨架 |
| source descriptor | GET/POST editor-source、來源 CAS、product guard 已有 | 已完成骨架 |
| AI review | proposer/Admin 分權、通過/Promote 分開、fixture 禁止 Promote 已有 | 已完成骨架 |
| asset safety receipt | 1,640 個「已被內容引用」資產 manifest 已有 | 適合驗引用，不是完整資源池 |
| effective VFX limits | 已由 runtime config resolver 產生 | 已完成；Editor 直接讀值 |
| document validation | importer 未逐份跑 collection Zod／hard authoring rules | **P0 未完成** |
| capability/asset validation | 仍相信 manifest 自述，未完整從 doc 推導 | **P0 未完成** |
| delta snapshot | 第二次 apply 會只剩本包文件，未和 ACTIVE 合併 | **P0 未完成** |
| runtime consumption | game client/server 沒有讀 import ACTIVE tree | **P0 未完成** |
| production orchestration | content-api 是 dev-only；Promote 未接 apply | **P0 未完成** |
| VFX Script package | `vfx-script@1` 尚未成為明確 representation | **P0 未完成** |
| review evidence UI | 只有摘要與按鈕，沒有 diff／圖片／事件／分數 | **P0 未完成** |

靜態 public profile 保持 bootstrap-only 是正確的：它看不到某台 production instance 的 ACTIVE。
是否支援 full／delta 應讀 authenticated active profile，不由 Editor 猜。

## 4. 最終資料流

```text
Public target profile／runtime bundle（唯讀 Base）
                 ↓
Electron Editor 本機 workspace
                 ↓
自我驗證 + 預覽 + 選取匯出
                 ↓
Package JSON／ZIP ────────┐
單份 JSON ─→ Admin 安全包成 single-root delta
                          ↓
Authenticated Admin upload／AI proposal
                          ↓
Main validator：Zod → rules → refs → capabilities → assets → full loader
                          ↓
Immutable candidate + diff + visual evidence
                          ↓
人工通過／否決（不套用）
                          ↓
明確 Promote（重新驗證 + Base CAS）
                          ↓
完整 immutable snapshot → ACTIVE → game runtime read-back
                          ↓
條件式 rollback
```

## 5. Package 與 representation

### 5.1 第一版正式支援

| package kind | collection | schema | 行為 |
| --- | --- | --- | --- |
| `ability` | `abilities` | `ability@1` | runtime-direct |
| `item` | `items` | `item@1` | runtime-direct；取得性另驗 distribution／curation |
| `vfx-script` | `vfx-scripts` | `vfx-script@1` | presentation-only；有 script 時取代預設演出，不疊加 |

`vfx` 保留給 `vfx@1`／`ribbon@1` emitter，不得拿來表示 `vfx-script@1` timeline。
Main 應從一份 representation registry 推導 package kind、collection、schema、source policy 與
promotion policy，避免 profile、validator、Admin 與 Editor 各維護一份陣列。

effect-template／Product／Chain 舊四層模型不是目前 runtime-direct 的上線前置；保留為未來能力，
不要要求第一版 Package 建立假的 compiler 或 compiled mirror。

### 5.2 Package JSON、ZIP 與單檔 JSON

- Package JSON 與 ZIP 是同一 semantic package 的兩種 transport，必須得到相同 semantic digest。
- 通用 Package endpoint 只接受 `ggd-editor-import@1`，不得猜測裸 runtime document。
- Admin 可接受單份 `ability@1`／`item@1`／`vfx-script@1`，但 server 必須以 ACTIVE Base 自行包成
  canonical single-root delta，再走完全相同的 validator／CAS／apply；不可直接 PUT。
- ref 不在 ACTIVE、需要另一份未上線變更或 representation 未支援時，單檔流程必須拒絕並要求完整 Package。

## 6. Validator 必須驗什麼

現有 `validatePackage()` 需補成同一條 pipeline：

1. bounded JSON／ZIP transport 與一對一 membership；
2. package schema、processor fingerprint、JCS／hash、Base pin；
3. `path ↔ collection ↔ id ↔ schema ↔ entry ↔ change kind` 一致；
4. 每份 document 使用 `COLLECTIONS[collection].schema`；
5. hard authoring rules、rank policy、finite numbers 與 principle warnings；
6. 由 document 自行推導 hard refs、required capabilities、asset refs，和 manifest 交叉比對；
7. ref closure、asset path/hash/type、安全貼圖與 effective VFX budgets；
8. 完整 candidate snapshot 的 indexes／manifest／bundle／loader／registry／duplicate-VFX 檢查；
9. VFX script 的 ability ownership、事件來源、replacement 語意與 presentation-only 邊界；
10. 產出 immutable diff、diagnostics、planDigest 與 candidate activation digest；validate 不改 ACTIVE。

Package 自稱 `requiredCapabilities=[]`、`reviewer=...` 或 `human-authored` 都不是授權或驗證證據。

## 7. Snapshot、apply 與 rollback

### 7.1 Snapshot 語意

- bootstrap 從出貨 Base 建立第一棵**完整** immutable snapshot。
- delta 以 exact ACTIVE tree 為底，套入 changes；未變更文件必須 carry forward。
- full 明示完整 managed membership；V1 禁止顯式／隱式 delete。
- 每棵 snapshot 重建所有 collection indexes、manifest、bundle、contentVersion、collection hashes、
  authoringDigest 與 activationDigest。
- Base facts、target profile、validate、apply 與 runtime-bundle 必須全部指向同一棵 immutable tree。

### 7.2 Apply

- Promote/apply 使用 server 保存的 immutable candidate；不得讓瀏覽器重送另一份內容冒充同一包。
- apply 前重驗 candidate hash、最新 Base、processor、schema、capability、asset manifest 與政策。
- PREPARED 寫完、fsync、逐份讀回且 full loader 成功後，才 CAS ACTIVE。
- `reloadMode` 是 runtime 真實能力，不是 UI label。若只能新對局採用，就讓新 match pin 新 snapshot；
  進行中的 match 不熱換 registry。
- API 回 activated 前，game runtime 必須讀回相同 activation digest；若需重啟則回
  `activated-awaiting-reload`，不可假裝已生效。

### 7.3 Rollback

- rollback 指向既有 immutable previous snapshot，不重算、不逐文件覆寫。
- 必須帶 expected current activation；世界已前進就拒絕，避免覆蓋較新合法版本。
- runtime read-back 也必須回到 previous digest，才算 rollback complete。

## 8. Production 權限與批核

保留 dev-only content-api 與 loopback guard；production 另由 Platform Admin gateway 呼叫 internal
importer worker／library。不要把 Content API 直接公開，也不要讓 Electron 持有 Admin credential。

AI／Editor proposer 只能：

- 建立／更新未生效 proposal；
- 上傳 candidate、Base pins、來源與證據；
- 讀取自己的狀態。

只有 Admin 能：

- 通過／否決並留下 actor、中文原因與分數；
- 另按 Promote；
- 查看 activation health 與條件式 rollback。

批核頁至少顯示：before/after diff、candidate 原文、validator diagnostics、Owner issue、Base／processor／
capability／asset receipts、關鍵幀或逐秒截圖、事件時間線、expected vs actual trigger count、人工分數、
自動視覺分數，以及不透明背景／placeholder／fallback／超 budget 警告。

任何 candidate byte 改變立即使 verdict 失效。Promote 成功還要保存 operationId、planDigest、
activationDigest 與 runtime health receipt；只寫一筆 promotion record 不算上線。

## 9. generator-owned source

`GET /content-api/editor-source` 決定一份文件是 hand-authored、generator-owned 或 normalizer-only。
generator-owned 產物的直接 PUT/PATCH 必須由 server guard 拒絕；這一點 Main 已完成。

仍需補：

- isolated dry-run／plan，顯示 source 與所有 affected outputs；
- Owner 原文 bytes 與幽默內容不被改寫的 verdict；
- CAS source digest，執行 server allowlisted adapter；client 不可傳 shell command；
- 在隔離 staging 完整 regenerate、validate、read-back 後，再一次提交 source＋ability＋champion mirror＋indexes；
- generator 任何階段失敗時，來源與所有已碰過產物都保持原 hash。

## 10. VFX、模型與資產

### 10.1 實際限制

Editor 不使用 schema `.max()` 或本機常數當實際值；只讀 target profile 的
`effectiveVfxLimits`。目前 Main resolver 已完成，出貨預設為：

| 欄位 | 目前有效值 |
| --- | ---: |
| `maxParticlesPerSystem` | 1200 |
| `maxRatePerSystem` | 600 |
| `maxActiveRibbons` | 10 |
| `ribbonFadeBudgetSec` | 0.2 |
| `hardMaxLifeSec` | 5 |
| `hardCapScope` | `scene` |
| `maxOneShotEmitters` | 96 |
| `roundPurgeMode` | `full` |

數值變更只改 runtime config；profile 與 Editor 自動跟隨。不要為先前口頭的 0.25 秒另建常數。

### 10.2 兩種資產清單

- `assets-manifest.json`：所有**已被 content 引用**的資產，用於 import safety。
- authoring asset catalog：所有**允許 Editor 選用**的資產，用於 VFX Forge 資源池。

後者須由 Main 產生 allowlisted rows：hash、bytes、type、preview URL、dimensions／alpha、model animations、
anchor／scale metadata、provenance、selectable/deprecated/owner-only。不要把 12,554 個檔案不加判斷全倒進 UI。

貼圖安全按真實 blend mode × 真實像素判定，不只看 PNG 有沒有 alpha。透明區仍保留亮 RGB 的 additive
魔法陣會在遊戲中出現矩形底，必須在內容建置、Editor 拖放與 importer 三層 fail closed。
模型內嵌貼圖也要檢查；不得以 model id 白名單或 runtime 特判掩蓋。

### 10.3 真實視覺 parity

Main 應提供共用 appearance resolver 或 receipt，決定 champion/form/skin/model/fallback；Editor 不複製
client fallback 表。最終視覺證據要由真 `VfxScriptPlayer`、CameraRig、asset resolver、事件來源與 runtime
budget 產生，至少保留起手／中段／收尾影格與 deterministic timeline。

## 11. 技能說明的 `[]` 七色 presentation

authoring JSON 只存簡單 bracket token，不存 HTML／CSS：

```markdown
[主動][指向][範圍][AP加成]
60秒冷卻

對前方[大範圍]敵人造成350+100%[AP]傷害。
```

遊戲 client 以 allowlisted whole-token tokenizer 著色，禁止 substring replacement，避免把
`GLADIARIA` 切成 `GL[AD]IARIA`。七組色彩沿用：activation、cast、effect、event、condition、movement、
scaling；`[小範圍]／[範圍]／[大範圍]` 為亮藍。已廢除的舊範圍標籤不得重新出現。

這一層只負責顯示，不驅動 gameplay；未知正文 token 保留原文並警告，不得改寫 Owner 文案。

## 12. 15 項 future capability

傷害轉移、儲存／釋放傷害、位置交換、狀態回溯、動態地形／傳送門、道具進化／犧牲、普攻衝刺、
通用控制限制模型等 `notRequired` 代表「引擎今天還不能做，之後會實作」，不是永遠排除。

現在不實作，但 representation registry、operation、diagnostics 與 capability schema 不得把它們設計死；
Editor 遇到時標 `request-new-capability`，禁止拿現有參數拼一個看似相近的錯誤效果。

## 13. 完成閘門

Main 只有在以下精簡閉環全過後，才可宣告 production seam complete：

1. 非法 ability/item/vfx-script 文件即使 package 自稱空 capability 也會被 validator 拒絕。
2. Package JSON 與 ZIP 對同一 semantic package 得到同一 digest、diff 與結果。
3. bootstrap A、delta B 後完整 runtime bundle 同時含 A+B。
4. apply 回成功後，game runtime 讀到同一 activation digest；拔掉 consumer 測試會紅。
5. crash injection 只會留下舊完整樹或新完整樹，不會混版。
6. AI proposal 需人工通過，再另按 Promote；八招 fixture 即使通過也無法 Promote。
7. Promote 會真正 apply 並回 activation receipt；candidate／Base 漂移會拒絕。
8. rollback 讓 runtime 回到前一份完整 snapshot。
9. generator 途中失敗不改任何 source 或 product hash；成功後再跑 sync 仍保留修改。
10. Admin 能看到差異、診斷、圖片與事件證據，而不是只看到一個 digest。

Main 回交請附 feature branch、commit、上述十項的實際 request/response／測試證據；禁止直接推 `main`。

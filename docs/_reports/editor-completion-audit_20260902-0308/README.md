# GGD 本機技能／VFX Editor 進度與收尾稽核

狀態：2026-09-02 08:28（Asia/Taipei）

Editor branch：`feat/vfx-forge-codex`

基準：`origin/main@de7006c69`；Main seam `origin/feat/editor-seam-20260902@4ec5e676`

稽核方式：需求逐條對程式、machine contract、測試、桌面 build 與實際瀏覽器 framebuffer 證據；
「測試存在」不等於完成，只有覆蓋到需求行為才列為已證明。

## 結論

Codex 擁有的 Electron 本機 Editor、Forge、VFX Forge、遠端唯讀 Base、局部工作樹、
單檔／完整／部分匯出與 AI 待審流程已具備實作及驗收證據。Editor 已修正 Main 新契約要求的
`runtime-direct` authoringProcessor、完整 ACTIVE runtime-bundle 重算與 VFX limits identity receipt。

Main seam 已可取得並整合。真實 contract-index 證明 representation 的欄名是 `schema`（不是先前文字摘要的
`representation`），Editor parser 已據此修正，並新增完整 JCS digest 重算、profile pin、最低 Editor 版本與
`unsupported` fail-closed。`active/runtime-bundle`、effective VFX limits、source adapter 與 generator-owned
寫入守衛皆用 Main 的 feature-branch 實作做窄閉環，不再有外部接縫阻塞。沒有 ACTIVE 時維持
G1／bootstrap-only 仍是正確狀態；`vfx-script@1` production Package 仍依 index 的 `planned/G5` 顯示規劃中。

分工已收斂：Main 只做可重用 primitive、runtime、resolver 與機器契約；八招成品、時間軸、鏡頭、配色、
視覺驗收、批核與 JSON／ZIP 都由 Editor 拼裝。只有 JSON vocabulary 確實缺少可重用語意時，Editor 才以
最小 failing fixture 向 Main 要一塊積木，不要求 Main 製作完整技能。

## 本輪驗收結果

- Editor full suite：45 files、257 tests 全通過；本次 ACTIVE bundle／limits／Export Center 變更另跑 4 files、18 tests 全通過。
- Editor typecheck：通過。
- Editor production build：通過；只有既有大型 Babylon chunk warning，沒有 build error。
- Main seam integration：Editor 3 files／17 tests；content-api 6 files／31 tests；shared 3 files／20 tests；
  client VFX limit/cleanup 4 files／17 tests，全通過。Editor、content-api、shared、client typecheck 全通過。
- 合併後的 focused shared content generator 通過；新 profile digest `737dc6a4d1a6`、contract-index digest
  `f0fa79b088ba`、contentVersion `cv_4697f677b761`。完整 root `content:build` 在進入 profile 產生前被
  74 個現有 VFX/model 去背安全 blocker 擋下；這是資產品質 gate 正常拒絕不合格素材，未把它誤報成 seam 回歸。
- Desktop suite：3 files、18 tests 全通過；typecheck 通過。
- Desktop renderer（Editor＋Admin）與 Electron main/preload build：通過。
- 跨平台 packaged smoke runner：macOS universal 實包回傳 app／runner 雙 receipt，
  五條 route 全 200；無 receipt、非 0 exit、signal、失敗 route 都 fail closed。
- Windows `windows-latest`：18/18 tests、`dist:win`、真 `.exe` 啟動、雙 receipt 與
  compact evidence upload 全通過；run `33552053135`。
- `pnpm caps:check`：通過，capability fingerprint `111434fa`。
- `editorCoverageFresh.test.ts`：2/2 通過，coverage fingerprint `71b5be5a4f57`、required 4943；capability fingerprint `111434fa`。
- `origin/feat/editor-seam-20260902@4ec5e676` 已抓取；四個 Main commits 已合併並以真 JSON 驗證，
  不再把文字回報冒充 integration。
- target profile 仍誠實宣告 `implementedStage=G1`、`supportedModes=["bootstrap"]`；
  Editor 不會為了讓 full／delta 按鈕變亮而猜 ACTIVE receipt。
- 正式站 profile 實測 `cv_8e0ba5078c33`／digest `5c202f60e0a9`，仍缺 contractIndex 與 VFX receipt metadata；
  contract-index／active runtime-bundle route 均回 404。
- contract-index bridge 維持 allow-listed HTTPS、固定同源 path、schema 與 bytes 上限；兩條唯讀 bridge 改為
  HTTP GET，因此 generator-owned route scanner 不會把讀取動作誤判成內容寫入，也沒有新增 URL 豁免。
- 第一次在受限 sandbox 執行兩項 tsx freshness command 時，Unix socket `listen EPERM`；
  改用允許的 `/private/tmp/ggd-tsx-ipc` 後同一命令通過。這是執行環境限制，沒有把它誤報成產品回歸。

## 需求逐項證據

| 原始要求 | 判定 | 權威證據 |
| --- | --- | --- |
| macOS／Windows 本機程式，低維護成本 | 已證明；公開簽章另列限制 | Electron；實際產出 universal macOS `dmg/zip` 與 Windows x64 `nsis/portable`。Desktop renderer 與 Web dist 隔離；macOS universal app 與 Windows hosted runner 都啟動真實 packaged executable，對正式站取得雙 receipt 且五條路由全 200。Windows run `33552053135`；證據與 SHA-256：`docs/_reports/editor-desktop-release-smoke_20260902-0337/README.md`。 |
| 可以用本機 GGD 資料夾，也可以用 `https://ggd.adms.ai` 當唯讀參考 Base；所有修改留本機 | 已證明 | `apps/editor-desktop/src/main.ts`、`remoteWorkspace.ts`；manifest/bundle/profile digest、三方合併、離線 cache、衝突保留與 host/byte/time bounds 的測試。 |
| 模組化、容易維護，不複製遊戲規則 | 已證明 | schema form、Forge、VFX Forge、Export Center、desktop shell 分模組；預覽使用真 `SimWorld`、`CameraRig`、`VfxSystem` 與共用 resolver。 |
| 效果模板定義 → 模板＋參數成品 → 成品效果鏈 | 已證明（現有 runtime vocabulary） | `ForgeStudio.tsx` 的每張 `AbilityTemplateCard {ref,params}` 是一份成品，鏈只放成品卡；可拖拉、排序、獨立參數、條件、衝突策略、展開來源；`forgeStudioStack.test.ts` 與 shared `stack.test.ts` 證明第二張卡真的進入 effects/hooks。 |
| 不支援的機制不可用近似參數假裝 | 已證明 | draft template 不可選；capability degrade 明示；unknown provenance 與 source ownership fail closed。19 個 draft family 目前 0 份出貨 ability 使用，未影響現有 82 份 templated ability；未來由 Main 增加 sim vocabulary 後自動進契約。 |
| 小場地、雙方 3D model、粒子／模型特效、對敵互動與時間軸 | 已證明 | Forge/VFX Forge 共用雙 actor arena、實際 GLB、真 VFX 系統、Sim event schedule、scrub/play/1/60 step；八招 browser framebuffer 證據見 `docs/_reports/vfx-forge-eight-skill_visual-proof_20260902-0233/README.md`。 |
| 八招是 Editor 能力 fixture，不直接改遊戲技能；AI 變更先經一頁人工批核 | 已證明（本機）；Production 授權待 Main | fixture 永久 non-promotable；候選 hash 綁定 JSON＋frame proof；Admin 一頁顯示與評分。Production actor/auth/audit 與 generator source Promote 列在 Main handoff P0-4。 |
| 圖片、魔法陣、模型貼圖不能帶不透明背景 | Gate 已證明；素材庫仍有 74 項 blocker | VFX asset safety gate、palette probe、frame backdrop audit 均會 fail closed；合併後 root build 實際拒絕 74 個不合格 VFX/model 使用點。Editor 不得把失敗素材放進可用資源池或送審；修素材本身是 Main 的「積木品質」，不是請 Main 拼完整技能。 |
| 顯示實際生效的粒子、Ribbon、生命週期、emitter、回合清理限制，不抄常數 | 已以 Main 真 feature route/profile 證明 | `runtimeLimits.ts` 直接讀 shipped resolver；遠端收據必須是 `ggd-effective-vfx-limits@1` 且含 profile id/fingerprint，`maxOneShotEmitters:null` 正確映射 Infinity；缺欄拒收並明示降級。 |
| 單檔 JSON、完整覆蓋、選取部分更新、一鍵 ZIP | ability/item scope 已證明；VFX production package 依契約維持 planned | `ExportCenterPage` 三模式與單檔按鈕有守衛；builder 產 deterministic JCS Package JSON／STORE ZIP。Full 擋 implicit delete；delta 分離 selection roots、changed closure 與 omitted refs。full／delta 只接受 `ggd-content-runtime-bundle@1`，重算每份文件、集合 count/hash 與 contentVersion；舊 `content-bundle@1` 不得冒充 ACTIVE。 |
| 嚴格自我驗證 | 已證明 | shared Zod、exact refs、JCS/package/archive hashes、ZIP safety、ACTIVE receipt、完整 Base collection/doc/contentVersion hashes、delta closure、UI reachability、4943 格雙向 coverage 與 README receipt 守衛。Importer 仍須獨立重驗。 |
| 不做 Warcraft 3 完整地圖編輯器 | 已遵守 | 沒有地形筆刷、單位擺放、region/trigger authoring 或素材匯入工作流。Contract 中 map/arena 的一般 schema 表單與檢視器只是內容文件 coverage，不是地圖編輯子系統。 |
| 不直接修改遊戲主程式 | 已遵守 | Main seam 只從 Main feature branch 合併到 Editor feature branch；兩邊都沒有直接提交或推送 `main`。後續 Main 僅提供缺少的可重用 primitive，不參與成品拼裝。 |

### Generator-owned 繞路核對

- Codex Editor 沒有呼叫 `POST :collection/:id/restore`。
- Forge 會用 `PATCH champions/:id/abilities/:slot` 寫 standalone ability 的 champion mirror；舊版只看
  ability provenance，無法證明 champion product 可直接寫。
- 現在確認畫面與實際執行都讀 Main `editor-source`：ability 與 champion 各自必須是
  `writePolicy=document`；source-adapter、readonly、缺收據皆在送出 PATCH 前拒絕。Main route guard 是第二鎖，
  不能用來取代 Editor 端來源真相提示。

## 本輪補出的真缺口

原先 Export Center 的 delta UI 只把選取 root 放進 package，再把其餘引用以「目前本機 hash」
列成 `requires[]`。這在 Main 尚未開放 delta 時看不出來，但一旦解鎖會有三個錯誤：

1. `selectionRoots[]` 與實際 closure 混為一談。
2. changed forward dependency 可能漏包，或偷偷依賴尚未上線的本機文件。
3. 未選、甚至無效的另一份本機草稿可能誤擋本次 partial export。

現在已改為從人工 root 沿 runtime refs 求 closure，穿過未變中介找出 changed dependency；
只驗證 reachable documents；自動納入者標成 `required-dependency`；unrelated local edits 不進
package；所有 omitted refs 必須與完整 exact Base snapshot 相同，否則回
`BASE_DEPENDENCY_DRIFT`。模板引用同時支援 single／array／`{cards,onConflict}` 三種形狀。

此外，Main 將 manifest 改為必填 `authoringProcessor`、compiler optional 後，Editor 舊 builder 會產出無法通過
Main schema 的 package。本輪已改成固定 pin `runtime-direct@1` receipt，只有真 compiler receipt 同時存在才輸出
compiler。ACTIVE Base 也不再接受一般靜態 bundle；新 parser 會保存 activation/package receipt，並對三層內容
hash 做 fail-closed 重算。

## Main seam 最終端到端閘結果

1. **通過**：抓取 `feat/editor-seam-20260902@4ec5e676`，依真實 JSON 修正 `schema` 欄名、
   `unsupported` 狀態、JCS digest 與最低 Editor 版本；文字摘要不再是 parser 依據。
2. **通過**：Main route fixture 驗證 runtime-bundle 的 doc、collection、count、contentVersion、activation
   receipt；Editor 對文件、集合與版本突變皆 fail closed。
3. **通過**：profile fixture 驗證 limits schema/profile/fingerprint、`null` emitter cap 與 resolver drift。
4. **通過**：bootstrap-only profile 只開 bootstrap；Main HTTP 窄閉環完成 validate/apply/read-back/rollback。
   `vfx-script@1` 仍是 planned，因此不列為 production Package 完成條件。

Main 接縫已結案。後續成品品質、八招還原與 no-code 操作完整度回到 Editor 分支持續處理；Main 只有在
最小 fixture 證明缺少可重用 primitive 時才需介入。

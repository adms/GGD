# GGD 本機技能／VFX Editor 完工稽核

狀態：2026-09-02 03:08（Asia/Taipei）

Editor branch：`feat/vfx-forge-codex`

基準：`origin/main@b8420abe`

稽核方式：需求逐條對程式、machine contract、測試、桌面 build 與實際瀏覽器 framebuffer 證據；
「測試存在」不等於完成，只有覆蓋到需求行為才列為已證明。

## 結論

Codex 擁有的 Electron 本機 Editor、Forge、VFX Forge、遠端唯讀 Base、局部工作樹、
單檔／完整／部分匯出與 AI 待審流程已具備實作及驗收證據。Production apply 仍刻意
fail closed，因為 GGD main 尚未交付 source adapter、對齊後的 runtime-direct package
receipt、G2 importer、完整 asset manifest、遠端 effective VFX limits 與正式英雄模型映射。

因此目前正確狀態不是「Editor 壞掉」，也不是「整條產品已可上線」：Editor-owned
工作面已完成；端到端 production Promote／apply 必須等 Main 回交，再用本報告最後一節
重驗後才能宣告整體完成。

## 本輪驗收結果

- Editor full suite：44 files、255 tests 全通過。
- Editor typecheck：通過。
- Editor production build：通過；只有既有大型 Babylon chunk warning，沒有 build error。
- Desktop suite：2 files、11 tests 全通過；typecheck 通過。
- Desktop renderer（Editor＋Admin）與 Electron main/preload build：通過。
- `pnpm caps:check`：通過，capability fingerprint `111434fa`。
- `editorCoverageFresh.test.ts`：2/2 通過，coverage fingerprint `8dec65b891b7`、required 4941。
- 第一次在受限 sandbox 執行兩項 tsx freshness command 時，Unix socket `listen EPERM`；
  改用允許的 `/private/tmp/ggd-tsx-ipc` 後同一命令通過。這是執行環境限制，沒有把它誤報成產品回歸。

## 需求逐項證據

| 原始要求 | 判定 | 權威證據 |
| --- | --- | --- |
| macOS／Windows 本機程式，低維護成本 | 已證明（本機發行版）；公開簽章另列限制 | Electron；實際產出 universal macOS `dmg/zip` 與 Windows x64 `nsis/portable`。Desktop renderer 與 Web dist 隔離，最終 macOS app 對正式站跑 packaged smoke，五條路由全 200。證據與 SHA-256：`docs/_reports/editor-desktop-release-smoke_20260902-0337/README.md`。 |
| 可以用本機 GGD 資料夾，也可以用 `https://ggd.adms.ai` 當唯讀參考 Base；所有修改留本機 | 已證明 | `apps/editor-desktop/src/main.ts`、`remoteWorkspace.ts`；manifest/bundle/profile digest、三方合併、離線 cache、衝突保留與 host/byte/time bounds 的測試。 |
| 模組化、容易維護，不複製遊戲規則 | 已證明 | schema form、Forge、VFX Forge、Export Center、desktop shell 分模組；預覽使用真 `SimWorld`、`CameraRig`、`VfxSystem` 與共用 resolver。 |
| 效果模板定義 → 模板＋參數成品 → 成品效果鏈 | 已證明（現有 runtime vocabulary） | `ForgeStudio.tsx` 的每張 `AbilityTemplateCard {ref,params}` 是一份成品，鏈只放成品卡；可拖拉、排序、獨立參數、條件、衝突策略、展開來源；`forgeStudioStack.test.ts` 與 shared `stack.test.ts` 證明第二張卡真的進入 effects/hooks。 |
| 不支援的機制不可用近似參數假裝 | 已證明 | draft template 不可選；capability degrade 明示；unknown provenance 與 source ownership fail closed。19 個 draft family 目前 0 份出貨 ability 使用，未影響現有 82 份 templated ability；未來由 Main 增加 sim vocabulary 後自動進契約。 |
| 小場地、雙方 3D model、粒子／模型特效、對敵互動與時間軸 | 已證明 | Forge/VFX Forge 共用雙 actor arena、實際 GLB、真 VFX 系統、Sim event schedule、scrub/play/1/60 step；八招 browser framebuffer 證據見 `docs/_reports/vfx-forge-eight-skill_visual-proof_20260902-0233/README.md`。 |
| 八招是 Editor 能力 fixture，不直接改遊戲技能；AI 變更先經一頁人工批核 | 已證明（本機）；Production 授權待 Main | fixture 永久 non-promotable；候選 hash 綁定 JSON＋frame proof；Admin 一頁顯示與評分。Production actor/auth/audit 與 generator source Promote 列在 Main handoff P0-4。 |
| 圖片、魔法陣、模型貼圖不能帶不透明背景 | 已證明 | VFX asset safety gate、palette probe、frame backdrop audit；最新八招報告含 framebuffer hygiene。失敗素材不能加入／送審。 |
| 顯示實際生效的粒子、Ribbon、生命週期、emitter、回合清理限制，不抄常數 | 已證明（本機）；遠端 profile 待 Main | `runtimeLimits.ts` 直接讀 shipped renderer/config resolver；測試修改 vfx-budget/vfx-cleanup 後畫面值同步改變。正式遠端 profile 的同源 `effectiveVfxLimits` 列在 Main handoff P1-2。 |
| 單檔 JSON、完整覆蓋、選取部分更新、一鍵 ZIP | 已證明；Production buttons 依契約 fail closed | `ExportCenterPage` 三模式與單檔按鈕有 render-tree 守衛；builder 產 deterministic JCS Package JSON／STORE ZIP。Full 擋 implicit delete；delta 分離 selection roots 與 changes、只驗選取 closure、加入 changed forward dependencies、排除未選草稿、以 exact Base pin omitted refs。 |
| 嚴格自我驗證 | 已證明 | shared Zod、exact refs、JCS/package/archive hashes、ZIP safety、完整 Base collection/doc hashes、delta closure、UI reachability、4941 格雙向 coverage 與 README receipt 守衛。Importer 仍須獨立重驗。 |
| 不做 Warcraft 3 完整地圖編輯器 | 已遵守 | 沒有地形筆刷、單位擺放、region/trigger authoring 或素材匯入工作流。Contract 中 map/arena 的一般 schema 表單與檢視器只是內容文件 coverage，不是地圖編輯子系統。 |
| 不直接修改遊戲主程式 | 已遵守 | Editor branch 不推 main；main-owned sim/schema/content/API 接縫集中在 `MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md`，由 Main 在自己的 feature branch 重做。 |

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

## Main 回交後的最終端到端閘

以下任一項未通過，都不能把整體 goal 標成完成：

1. `GET /content-api/editor-source` 與 source-adapter CAS/regenerate，證明 generated Owner 文字與 champion mirror 在完整 sync 後仍保存。
2. runtime-direct package machine contract 只有一套 truth，target profile 提供 G2、gameRevision、migration/activation/authoring receipts 與明確 endpoints。
3. validate/apply/rollback/active/runtime-bundle 實作 bounded ZIP、staging、原子 ACTIVE、health read-back、CAS、rollback 與 audit。
4. active runtime bundle 含全部註冊 collection 的 exact entries/doc/collection hashes；tamper、missing collection、Base dependency drift 都被拒絕。
5. Production AI verdict/Promote 使用 authenticated actor、不可變 audit、candidate/source/operation hashes；generator-owned output 無通用 PUT 繞路。
6. 完整 asset manifest 逐檔 bytes/hash/contentType；遠端 cache tamper rejection。
7. target profile 的 effective VFX limits 與遊戲同一 resolver；修改 config/runtime clamp 時兩邊同時變。
8. `godie-e00r` 等 champion/model authoritative mapping 回交後，遊戲與 Editor 對同 id 解到同 model，附無 VFX／受擊遮擋基準圖。
9. 用一個真 package 走 Editor JSON 與 ZIP 各一次 validate/apply/read-back/rollback，semantic digest 相同；再重跑八招與一項 template multi-card 技能的實際瀏覽器視覺驗收。

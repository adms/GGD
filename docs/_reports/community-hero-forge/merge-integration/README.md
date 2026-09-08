# PR #1112：戰鬥核心、平台與社群英雄的合併整合說明

**狀態：文件已提供 Owner 審閱，Owner 已授權 commit 回主工作流。Main 負責依本文件整合、驗證與合併；推送、查重開票與 PR 更新由主工作流承接。尚未解衝突、開票或部署。**

本次目標仍是用 37 名英雄、222 槽，驗證「Editor 建立／微調 → 投稿 → 後台審查 → 正式英雄名單 → 獨立版本回復」。本文件處理兩條分支交會的行為，不擴充新模板或重做既有美術。通過合併測試也不等於正式站已發布。

閱讀順序：先看下表與第 2 節決策，再由各模組負責人按第 3 節整合，最後使用第 5 節同批驗證。[票稿](issue-draft.md)與[完整衝突清單](conflicts.json)在同一目錄。

| 主要風險 | 單純保留一邊會造成什麼 | 整合方向 |
| --- | --- | --- |
| 戰鬥施法結算 | 丟失 Main 法術護盾／提交時連段判斷，或丟失社群施法識別、能量與生命支付 | 兩條施法入口使用一致順序，保留雙方上下文與事件規則 |
| 平台政策格式 | Main 新增設定被社群嚴格解碼器拒絕，完整英雄投稿回 503 | 同步 TS schema、Go 解碼與實際路由；保留嚴格驗證 |
| 內容更新與對局版本 | 新英雄名單與舊 runtime 不一致，或更新影響進行中對局 | 先取得一致的新內容世代，再固定新房間；舊房間繼續持有舊版本 |
| 正式英雄資格 | Main 的社群房過濾把已核准完整英雄排除於一般選角 | 來源資訊與正式可用資格分開；已核准英雄可進普通房 |
| 版本還原 | 還原內容卻漏掉出身／基線，或連帶修改共用依賴與其他英雄 | 先保存可回復版本，再原子切換；單英雄依賴必須實體化及固定 |
| 編輯器草稿 | 兩套 autosave 同時恢復同一文件，丟失未完成輸入或素材 | 一個存檔／恢復協調入口，保留舊草稿、raw input、模型位元組與衝突提示 |

## 1. 證據基準與限制

| 項目 | 本文件檢查的版本 |
| --- | --- |
| Repository／PR | `adms/GGD`；[PR #1112](https://github.com/adms/GGD/pull/1112) |
| 社群分支 | `codex/community-hero-forge-integration` |
| 社群文件基準 | `9acf806c5658c5ec6515690bf811e0c660f2b213` |
| 衝突評估使用的社群提交 | `4e682a7e865c8c239a741ca20a2ea47299a1fffe` |
| 評估使用的 Main 提交 | `4e11f1b0253c106e08a0e873e289f8822e32681d` |
| 共同祖先 | `1de2bd31fb6266ecb7738f110f2245e393c78071` |
| 已有 merge-tree 診斷物件 | `7ce9f1238a917206587e5bd1587ed28e5db516a4`；含衝突標記，不能當作可執行版本 |

本次只讀取既有診斷與兩側 Git 原始碼，沒有在工作樹執行 merge。診斷共有 **61 個衝突路徑**：34 個有已觀察到的產生步驟，27 個需要人工整合來源或查明權威。評估提交到文件基準只改了 `editor-publication/README.md` 與社群 coordination packet，未改動衝突程式。這使本次程式差異分析仍適用，但不代表遠端 Main／PR 此刻沒有新提交。

GitHub API 本次連線失敗，尚未刷新遠端 SHA、PR 狀態或完成重複票查詢。Main 真正接手時必須重新固定雙方 SHA 與共同祖先，重算衝突；新增的差異另補在此穩定文件，不沿用「61」作永遠不變的數字。

`conflicts.json` 保存全部路徑、診斷雜湊、逐側 blob 與本機 `sync-io.json` 觀察到的產生步驟。沒有觀察到 writer 不代表該檔可以自由手改，也不代表它必然不是產物。

## 2. 交接權責與固定決策

1. **Main 執行實際整合**。Owner 已授權文件 commit 回主工作流。本次只提交文件、票稿、衝突清單及目標／packet 的交接更新；主工作流承接推送與查重開票，票號回填 PR #1112 與 coordination packet。不在目前有其他未提交工作的目錄直接 merge。
2. **最新指示取代舊分工**。`../editor-publication/README.md`「本批集中執行目標」與 `docs/editor-contract/coordination/claim.community-hero-forge-integration.json` 已同步為 Main 整合，連到本文件與票稿。保留歷史 Owner 引言及驗收事實，最新交接要求由 packet 追加的逐字引言與 asks 表達。
3. **核准完整英雄就是正式英雄**。保留來源、作者與核准紀錄；不能因來源是社群而要求另開社群房。Main 已有一般素材的內容池政策仍可保留，但要明確排除「已核准完整英雄」被錯誤隔離的情況。
4. **每次發布固定完整依賴**。模板、生成器、英雄、六槽技能、模型、動作及必要效果綁定均有版本；選看舊版不改 ACTIVE，回復新增一筆操作／版本並切換該英雄。不能重新指向一份會被他人修改的共用模板。
5. **保留使用者已決定的額度**：一般作者每日新投稿候選 100、認證 Power User 200、同時待審 50。不是最多保存 100 份歷史，也不是每一次網路重試都扣一次。認證角色須由伺服器重讀，不能信任客戶端宣稱。
6. **不以代理素材冒充原設計完成**。保留指定名稱、完整原文、動漫來源與 requiredRefinement；保留已接受的相近風格模型及回退選項。OBJ 只算靜態預覽。裝置目標沿用平板 A17 Pro 約當效能 30 fps，不新增實機測試門檻。

## 3. 逐項整合方式

### M01 — 瞬發與吟唱結算：護盾、固定效果、施法識別

衝突：`packages/shared/src/sim/abilities/abilitySystem.ts`、`packages/shared/src/sim/systems/CastResolveSystem.ts`。

Main 新增 `spellWardRefusesCast`（程式註記 #1091），以及提交時固定連段條件／增幅結果的 `cast.effects`、`beganTick`、`castCommitTick`（#1086）。社群分支新增 `castInstance`，使同一次施法跨多波／載體傷害只取得一次施法信用。

**整合步驟：**

1. 在合法施法建立時產生並沿用同一 `castInstance`；將它保留於吟唱狀態及後續效果上下文，不能在每個命中或解算時重建。
2. 保留 Main 提交時增幅及條件固定。解算使用 `cast.effects ?? applyAugmentToEffects(...)`，不能無條件重算、也不能再增幅一次。
3. 瞬發與吟唱兩處均保留 `spellWardRefusesCast`；成功執行的 `runEffects` 上下文同時包含 `castInstance`、`castCommitTick`。檢查自動合併的 CastState、EffectContext、投射物／延遲效果傳遞，不能只修兩個標記區塊。
4. 依 Main 現有合約：法術護盾攔截前已付的魔力與冷卻不退；`onAbilityCast` 保留；被攔截時不能執行效果及 `onAbilityHit`／`abilityHit`。
5. **交會語意要特別固定：**社群 `spendHealth` 是效果節點，並非入口預扣的魔力成本。建議沿用 Main「整發攔截效果清單」：被法術護盾拒絕時，不執行此節點；正常釋放時按節點順序支付；吟唱中斷時不支付。不要在解衝突時自行把它搬到護盾之前。若 Main 認為生命成本應例外，也必須先明示新的引擎合約與測試，不能用刪除 guard 達成。

**必驗：**瞬發／吟唱 × 護盾成功／失敗；commit／resolve 連段窗口；同一施法多波只計一次、不同施法各計一次；中斷、無資源、1 HP 不致死；施法與命中事件不能重複。既有 `oncePerCast.test.ts`、`spendHealth.test.ts`、`abilityAugmentCastAndScope.test.ts` 仍保留，補的是兩側機制交會案例。

### M02 — 阿薩謝爾 THE END OF SON 與新條件葉

衝突：`packages/shared/src/content/schema/condition.ts`、`packages/shared/src/sim/content/condition.ts`、`apps/editor/src/forge/ConditionEditor.tsx`。

Main 增加 `form` 條件（#1070）；社群增加 `facing`、施加者限定的狀態查詢 `appliedBy`。須合併型別聯集、Zod discriminated union、執行器 dispatch、UI 欄位清單及標籤；只保留其中一個聯集會讓另一類內容拒收或靜默失效。不要把這些條件寫成角色名特判。

**不可退化的阿薩謝爾行為：**同一施法者的有效 R 詛咒，配合三層負能量觸發 EX，消耗自己的詛咒與三層資源，使敵方 AD/AP +10% 持續 2 秒；反轉分支不再執行普通 EX 傷害。不同施法者的詛咒不可互相誤用；詛咒已淨化／過期時走普通分支。原文保留，不把「對敵人增益」修成一般減益。

`communityRefinements/azazel.test.ts` 已有這些案例及同 tick 雙阿薩謝爾、E 的 ±60 度／距離邊界、施放後轉向等斷言。合併後重跑並增加 M01 的法術護盾交會；舊通過結果不能替代。`facing` 讀實際接觸時面向，`form` base／alternate 兩側也都要驗。

### M03 — 模板參數與寫回閘

衝突：`packages/shared/src/content/schema/template.ts`、`apps/editor/src/forge/forgeWritebackTemplateGate.test.ts`。

社群新增 `effects`／`hooks` 參數；Main 新增 `applyStatus`（#1066）、`dot`／`spawnVfx`（#1068）、`buffPerRank`（#993）。保留全部合法參數，但每類仍由對應節點 schema 驗證，不能為了合併改成 `any`。一併核對 `packages/shared/src/content/templates/paramsSchema.ts`、展開器、表單與 runtime capability；沒有文字衝突的消費端也可能漏接。

測試保留 Main「模板展開後，最終能力 refine 失敗，任何來源檔都不寫」案例。社群的 node-only 測試已把模式改在 fixture 並於 finally 恢復，避免把已同時支援兩種入口的真實模板誤當作 node-only。採用這個 fixture 修正，再保留 Main 新增斷言。

模板、生成器版本與成品 lineage 都必須更新；不能只修 37 份成品、下一次生成又失效。

### M04 — 戰鬥分類報表

衝突：`packages/shared/src/sim/castabilityVerdict.ts`。

Main #1088 已將 if-chain 改成 `CAST_CHANNEL_ORDER`，文字由同一表推導；社群新增 `healthSpend`。使用 Main 單表架構，把 `healthSpend` 加在原社群語意的 manaRestore 之後、shield 之前，沿用既有事件判準。不得恢復第二條 if-chain 或另抄分類文案。純生命支付要辨識為遊戲機制，純 VFX 仍是 VFX_ONLY。

### M05 — 英雄屬性正規化與已驗證套件

衝突：`packages/shared/src/content/registries.ts`。

Main 使用完整 `championRoster` 支援變身繼承原體出身（#1064），依出身推導 role（#1024），速度成長級距最後覆寫。社群抽出 `championRuntimeResolver.ts` 供註冊、生成器及套件編譯共用，並增加 `representation: "verified-runtime"`，避免已固定的 runtime 再套一次正規化。

**做法：**將 Main 的 roster／原體繼承邏輯併入共用 resolver，連同 `heroForge/generator.ts`、`packages/shared/src/content/import/heroPackage.ts` 的呼叫點一起傳入同一版依賴目錄。保留既有角色的作者值、稀疏新英雄的出身預設、statOverrides 消化以及 speed tiers 的順序。`verified-runtime` 仍只給驗證過的套件使用，不能由客戶端旗標繞過 schema／摘要檢查。

**必驗：**原有英雄、稀疏生成英雄、變身英雄；Editor 預覽／編譯／伺服器初始屬性一致；還原舊套件不被新出身或模板重算；既有 `championRuntimeResolver.test.ts` 與 Main `transformInheritsOrigin.test.ts` 都保留。

### M06 — 熱更新與每間房的固定內容

衝突：`apps/game-server/src/index.ts`、`apps/game-server/src/rooms/MatchRoom.ts`。

Main `contentHotApply.ts`（#1025）只熱註冊新 ID，既有 ID 的修改／刪除列為 withheld，不偷換進行中定義；`publishMode=next-match` 在建房前消化。社群 `apps/game-server/src/content/communityRuntime.ts` 在初始化時固定 base、target 與有界快取，房間持有獨立 context。

**現有兩者直接接上仍有時序問題：**社群目前先取得 room context，再進 `buildMatch`；Main 的 pending hot apply 位於 `buildMatch`。因此即使沒有語法錯誤，也可能用舊 context 搭配新 whitelist／全域 contentVersion。

**整合次序：**

1. 在新房間選定內容之前完成允許的 pending apply；得到同一個可識別的內容世代。
2. 由該世代建立新的 base／target，刷新新房可使用的快取；舊房已持有的 context 不替換。僅在新增內容完整可用時才對外宣告新的 active version；withheld／載入失敗必須可觀察。
3. 以同一世代取得發布 pins、相容性目標、內容池與 whitelist，再建立 MatchController。`contentVersion`、manifest、replay header 必須取自房間已固定的資料，不能在不同 await 後重讀可能已變的全域值。
4. 若 pending apply 或新 base 驗證失敗，新房不得用「有新英雄 ID、無對應定義」的混合資料。保留舊一致世代或明確拒絕該新內容開房；不能用 allow-all 掩蓋缺件。
5. 原有 ID 的普通 overlay 修改仍遵守 Main 的 withheld 政策。已版本化完整英雄的發布／回復用新的固定版本供新房解析；不要為了支援回復而覆寫舊房的 registry。

**必驗：**A 房持續對戰時發布／回復英雄，再開 B 房；A 的技能、模型摘要和回放 pins 不變，B 使用相容新版本；下載途中刷新不得把舊快取寫回新世代；兩房 tick、重連與回放均一致。沿用 `communityRuntimeCache.test.ts`、`communityRuntime.test.ts`、Main `contentHotApply.test.ts`，補跨模組時序斷言。

### M07 — 正式名單與 Main 社群內容池

Main `communityRoomOnly`／`contentPool` 會在預設 official 房排除 Community 清單；社群分支已讓核准的完整英雄進普通房並固定 pins。兩邊不是只差變數 `whitelist`／`resolvedWhitelist`。

保留 Main 房間設定的驗證、傳遞與既有素材池過濾；**核准完整英雄不能僅因 Community 出身被排除**。優先在發布資格／Community 清單的權威生成處區分「已核准完整英雄」與仍適用舊政策的素材，而不是在選角、bot、商店等多處硬塞特例，也不能靠全域關掉 communityRoomOnly 解決。

`gamelink`、伺服器內部開房請求、正常 roster 與客戶端載入器即使自動合併也要核對。顯式 whitelist／下架／核准狀態仍有效，未核准與不相容的候選不能因 union 操作混入正式池。

### M08 — 平台路由、耐久版本與還原

衝突：`apps/platform/internal/contentoverlay/handlers.go`、`versions.go`。

- 路由保留社群 `/content-overlay/assets/{name}` 與 Main `/content-overlay/community`，各用原有權限及回應投影；前者承載固定模型素材，後者回傳不含操作者資料的出身清單。不要因括號衝突刪掉其中一條。
- 版本機制以社群「先保存並核對 snapshot → 原子保存 active overlay／HistoryVersion」為基礎，保留首筆修改前的舊資料基線及失敗可回復性，不能倒退回先存資料、歷史 best-effort。
- `RestoreDoc` 的 `Bases` 恢復在社群已移到 switch 前，會先刪除現值再按舊值補回；不能又抄回 Main case 內的舊處理。加入 Main 同一 document 的 `Community` 恢復／刪除；`RestoreAll` 同步恢復該 map。未曾有覆蓋、被刪除、有文件三種情況都驗證。
- 檢查 `Overlay` 結構、normalize、codec、snapshot fingerprint、commit 與匯出是否完整攜帶 Community；不能只有回復函式認得，保存時卻漏失。
- 區分「文件回復」與「完整英雄回復」：單一 JSON restore 不是回復英雄所有依賴的證據。完整英雄必須經既有版本服務、相容性檢查與 CAS，再原子切换自己的 ACTIVE。

**必驗：**歷史寫入失敗不改 active、active 與歷史指標相符、重啟能恢復、舊無版本安裝先有基線；還原英雄 A 後 B 的完整摘要與上架狀態不變；先變更共用模板再還原 A 也不得改 B。既有 `versions_durability_test.go`、`hero_draft_versions_test.go` 與實際版本選單證據分工保留。

### M09 — 投稿配額、嚴格政策解碼與舊入口防護

衝突：`apps/platform/internal/submissions/submissions.go`、`content/config/ugc.json`、`apps/admin/src/configForms/specs/ugc.ts`。

Main 增加一般素材的每日／待審政策；社群保留 per-account intake lock、錯誤時拒絕的 pending 計數，以及 `store.Update` 內的擁有者與完整英雄不可變保護。要合併成單一受鎖的判斷與寫入流程，不可丟失 JSON CAS 回呼、也不可同時保留兩個 pending 宣告／兩套互相矛盾的上限。

**已確認的隱性格式不相容：**社群 `apps/platform/internal/server/hero_policy.go` 的 `parseHeroIntakePolicy` 使用 `DisallowUnknownFields()`，結構沒有 Main 新增的 `publishMode`、`communityRoomOnly`。若只合併 JSON，解碼會回 `hero_policy_unavailable`。須在 Go 嚴格解碼結構承認合併後合法欄位、按共用合約檢查值；不消費的欄位可以明示接收，不能把嚴格解碼整個關掉。並以真合併後 `ugc.json` 作跨語言 fixture。

**政策唯一權威：**`content/config/ugc.json`／後台 durable overlay。第二個住處：shared `schema/config/ugc.ts` 與預設／Admin 顯示；Go transport bounds 也是必須以同一 fixture 驗證的鏡像。消費端：`server/hero_policy.go`、`submissions/hero_intake.go`、Main 一般素材 UGC policy 與房間發布政策。不要把 100／200／50 複製成新的作業預設。

留存 Main 對收件 `enabled` 的實際路由守衛修正（#1103）；停收件不應一併禁止管理員發布所有其他來源的已核准內容。出貨 enabled 狀態不因本文件自動改變，正式開放由完整路由驗收及部署收據證明。

**必驗：**100／200 第 N 與 N+1 份、待審 50 邊界、重試不重扣、一般／認證／撤銷認證、並發最後一格、存儲錯誤拒收；舊素材入口不能改他人 ID 或覆寫完整英雄；偽造 reviewer／digest 仍被拒絕。完整英雄與普通素材的計數規則分清楚，歷史 snapshot 不算新 submit。

### M10 — Editor 草稿與 Admin schema 派生表單

衝突：`apps/editor/src/views/EditorView.tsx`、`apps/admin/src/configForms/specs/authoring.ts`。

Main `autosave/` 儲存作者本機設定與 tweaks，提供恢復／停用／拋棄 banner；社群 `drafts/` 有序列化保存、token 衝突、rawInputs、素材及桌面備份。**兩者均為本機保存，不是兩條伺服器投稿；問題是同頁有兩個保存與恢復者。**

建議保留社群 repository／session 作完整草稿的單一保存入口，整合 Main 作者可見的控制與錯誤提示，建立舊 Main 草稿讀取／轉入入口；轉入成功前不刪舊資料。不能將 Main 的 `replaceDraft` 恢復 hook 與社群 `restoreDocumentDraft` 同時掛在同一頁。雲端同步／投稿仍保留原本驗證與版本 CAS。

Main autosave 控制使用作者本機設定，社群有後台 `editor.autosaveIntervalMs`。整合需清楚定義優先序（建議作者本機明示設定優先，其次可用的後台預設，再其次出貨預設），沿用已有控制，避免再做新面板；正式部署讀不到後台時不能靜默變成完全無法存檔。

Admin 採 Main `derivedFields(zConfigAuthoringRulesDoc, [])`，新增欄位的標籤／界限寫回 Zod `.describe()`；不要把整份手寫欄位表抄回。必須能在實際出貨 Editor 操作控制，不能只證明 Admin 顯示有欄位。

**必驗：**輸入 `1e` 等未完成數字後重開仍在、離線與 IndexedDB 拒絕提示、保存途中繼續輸入、兩視窗衝突、舊草稿恢復、模型／動作位元組保留、伺服器拒絕錯誤資料時本機草稿仍可取回。

### M11 — 視覺證據工具與機器閘

衝突：`tools/skill-forge/build-codex-visual-advisory.mjs`、`build-visual-review-packet.mjs`、`check.mjs`。

Main 使用實際 captured／reviewed 數量及 awaitingCapture；社群加上驗收範圍與精確 ID 集合比對。保留 Main 動態數量報告，也保留「宣稱完整驗收時必須同一完整集合」的檢查。部分報告可以說 pending，不能被用成完整發布證據；同樣數量但換了一個 ID 必須查出。

Main #986 的機器 advisory freshness 不因 `--machine-only` 跳過，這一點應保留。檔案摘要／證據新鮮度是可機器查核的，Owner 的視覺判決仍由人決定，不自動改為 accepted。合併後以缺一張、替換同數量 ID、改一個來源摘要的案例確認會報錯；不新增另一套視覺驗收框架。

## 4. Main 執行順序與產物處理

1. 在 Main 管理的乾淨整合分支／工作樹固定兩側 SHA，確認新變更；不在 main 直接開發，也不清除目前社群工作樹的材料與未提交修改。把整合票、PR、packet 互相連結。
2. 先解 M02／M03／M05 的 schema、模板、型別與 resolver，再解 M01／M04 戰鬥；核對沒有文字衝突的傳遞端。
3. 再解 M08／M09 平台與版本、M06／M07 遊戲載入及資格，最後 M10／M11 Editor 與證據工具。這是依賴順序，不是要求每步重跑完整服務。
4. 來源穩定後統一重生成。以 `scripts/genguard.sh` 與當下 `tools/parallel-gates/sync-io.json` 查 writer，走現有 `scripts/genrun.sh`／`pnpm skills:sync`，保留退出碼。下表是目前實測 writer 的分組摘要；完整對照見 conflicts.json。

| 衝突產物組 | 已觀察到的生成步驟 | 注意事項 |
| --- | --- | --- |
| content indexes、bundle、manifest、target profile、技能總覽 | content:build／skillremake:json | 來源先整合，不能保留舊摘要或手拼 bundle |
| runtime capabilities、engine atlas、type catalog | caps:export／atlas:build／typecat:build | 同時包含 Main 新能力與社群節點 |
| brick census、decoration census、editor coverage | bricks:build／decor:build／editorcov:build | census 為產物；ggd-bricks.json／md 尚未觀察到 writer，另查來源及擁有權 |
| skill acceptance、human review index、VFX handback | skillforge:audit／skillforge:visual-review:build／vfxforge:handback:build | 重生成不等於重新人工判決；保留證據與來源範圍 |
| README、reference、requirements、task ledger | docs:readme／docs:status | 保留正確原始記錄、票據與結果，不以整份一側覆蓋 |
| ggd-board、overwrites ledger、技能引擎須知 | board:build／contract:numbers／skillremake:docs | 按實際 writer 重建，不手抹歷史 |

5. 手動來源／歷史與協調文件另處理：`apps/editor/README.md`、daily、既有日期戰情版、`claim.editor-form-receipts.json`、ggd-bricks 兩份。核對雙方條目身分後合併；禁止刪除失敗記錄或改他人 receipt 為成功。沒有 writer 的文件先辨認權威，不能一律當可丟棄衍生物。
6. 所有來源與生成產物穩定後，固定一個整合提交進入下面的同批驗證。後續只有文件整理不重跑產品全套；若修程式，重跑失敗項與受影響部分並更新整合 SHA。

## 5. 一次集中的驗證與停止條件

以下都是 **Main 合併後待執行**，本文件沒有執行或宣稱通過這些測試。

| Gate | 必須證明的結果 | 證據形狀 |
| --- | --- | --- |
| G1 編譯／契約 | TS、Go、模板展開及能力最終 refine；Main 新節點與社群節點均可用 | 固定 SHA、指令、退出碼及原始 log |
| G2 戰鬥交會 | M01–M05；阿薩謝爾同來源反轉與反例，Main 護盾／連段／變身不退化 | 現有 targeted tests 加少量必要交會測試；移除關鍵 guard／castInstance 的突變應使斷言失敗，再恢復 |
| G3 平台交會 | 實際 route 守衛、100／200／50、CAS、耐久歷史與來源 metadata、只回復 A | Go 同批相關 packages；分支與 Main 測試都保留 |
| G4 37／222 資料 | 名稱、完整原文、requiredRefinement、模板／生成器版本、素材載荷、六槽與舊版本仍完整 | 同一批 audit，逐名 digest；只沿用已比較等價的畫面證據 |
| G5 一版服務 E2E | 以該版目標重建 ZIP → 投稿／核准 → 普通選角／模型載入 → 正常 tick → 重連 → 結算／固定回放 | 服務 build stamp、target、package digest 與流程收據一一對應；含 A 舊房／B 新房 |
| G6 獨立回復 | 一名未上架歷史英雄及必要的已上架回復；模板／生成器／技能／模型一致，其他英雄不變 | 操作前後完整摘要、ACTIVE、發布狀態；選單只看不切換 |
| G7 Repo 必要閘 | skills、Editor release、coord 同一穩定批次，不拿不同修訂混合綠燈 | 三份 log 與退出碼；失敗逐項分類 |

可直接沿用的入口（Main 在整合工作樹執行；按合併後路徑補 Main 新增測試）：

```sh
pnpm exec vitest run packages/shared/src/sim/effects/oncePerCast.test.ts packages/shared/src/sim/effects/spendHealth.test.ts packages/shared/src/content/heroForge/communityRefinements/azazel.test.ts packages/shared/src/content/championRuntimeResolver.test.ts packages/shared/src/content/communityRoom.test.ts apps/game-server/src/content/communityRuntimeCache.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
```

Platform 在 `apps/platform` 目錄對 `./internal/submissions`、`./internal/contentoverlay`、`./internal/server`、`./internal/gamelink` 執行 `go test`。三項 repo 必要閘為 `pnpm skills:check`、`pnpm editor:accept:release`、`pnpm coord:check`，現有生成鎖／檢查鎖依 repo 腳本使用；測試時不並行重寫 content。

這些入口不是完整 coverage 清單；G2 必須再包含 Main 的護盾／連段／form／變身回歸，G3 必須包含 Main `ugcgate_routes_test.go`。不要只跑上面社群測試就關票。

**沿用與延後：**未變動且經內容等價核對的逐槽畫面／模型證據可沿用，記錄來源與覆蓋；不重拍全部 37 名。原作專屬美術、追加模板、跨平台簽署安裝、歷史 Python 完整重建延後，不能改成已完成。以前兩次對局快照異常根因未明；本輪若正常即記錄未重現，若再影響正常遊玩則修復，不能直接跳過 G5。

**既有基準失敗：**文件基準記錄 skills 有 58 列未對票、25 則前日漏列；Editor 583 項與 coord 10 份曾通過。這是舊隔離結果，不是整合結果。Main 應按實際訊息與既有票修正帳本，缺新票則按守則建立；不能捏造票號、刪掉訊息或因「原本就紅」直接視為合併可放行。

## 6. 部署、回復與材料可用性

戰鬥核心、平台 Go、Editor、game-server 與 shared 同時受影響，需要相容的一組服務建置與部署；不能只做 content-only 更新。先在隔離環境跑 G1–G7，再由 Main 按部署程序上線。正式站部署後重新讀取目標版本，重建 37 份 ZIP、投稿、審核與發布；不得直接拿舊隔離 ZIP 或收據冒充正式上線。

發布時保留舊相容服務／資料備份與不可變套件、素材。進行中的舊對局需由仍相容的服務完成或依部署流程停止接新房；不能把新存儲 schema 交給未验证可讀的舊 binary。回復英雄內容時使用版本服務；回復程式版本時依服務與資料相容性成組回復，不刪除新歷史或覆寫舊快照來強行降級。

本文件準備期間，主對話已另行建立材料提交 `aa24208cc72a362b09281e686db58f97895db41f`。本次只核對其變更範圍為 materials、歸檔工具及兩份交付／協調文件，未改戰鬥或平台程式；沒有重做大型歸檔還原驗證。此提交未納入前述 merge-tree 診斷，Main 接手應使用實際最新 head 重新評估。遠端是否已包含該提交尚未查實；材料摘要／分卷還原證據以原工作負責者的收據為準，不能將 Git blob 存在當成模型匯入、骨架重綁或視覺驗收。另有未提交報告仍不屬本次文件修改。已提交的驗收入口以 `../editor-publication/README.md` 中各階段收據為索引，較早子報告的歷史「尚未完成」不可拿來覆蓋較新的逐項結果。

## 7. 開票、審閱與完成紀錄

使用一張「PR #1112 整合」票承接本文件；不將 61 個路徑開成 61 張功能票，也不重開已在 Main 實作的 #991／#1025／#1086 等功能。這些號碼目前只依 pinned 原始碼註記引用，遠端狀態尚未核對。

開票前查 open／closed／進行中：第一組 `1112`／`community-hero-forge`，第二組「合併 衝突」／`CastResolveSystem`／`contentoverlay`，逐張讀進度。同一件事已有票則更新該票；已關但同問題重現按守則重開。連線失敗不能記成零命中。

- [x] 文件已提供 Owner 審閱，並取得 commit 回主工作流的授權。
- [x] 重新核對本文件以外的工作樹變動；本次提交範圍固定為五份交接文件，舊目標／packet 已更新 Main 分工。
- [x] 文件、票稿、衝突清單及目標／packet 一同納入本文件所在提交；提交識別以 Git 為準。
- [ ] 主工作流推送此提交，附遠端可重取 commit。
- [ ] 查重完成後建立或更新整合票，回填票號、PR、packet。
- [ ] Main 固定新的兩側 SHA，完成 M01–M11 與自動合併區交會檢查。
- [ ] G1–G7 收據連到同一個整合提交，必要失敗解決後審查合併。
- [ ] 正式部署後重建及發布 37 名，另附正式收據才標示正式開放完成。

文件驗證：61 路徑與附錄一致、引用路徑／Git 物件、Markdown、歷史 claims 保留及票稿 lint 均通過；本次社群 packet 通過。整體 `pnpm coord:check` 為 exit 1：10 份中 8 份舊 packet 的指紋 ede2a824444ea458 與目前 60eac8487db1f780 不符。這 8 份 packet 與契約檔在本次均未修改；主工作流需核對 origin/main 的歷史 packet 辨識與契約基準，不可直接批次重寫舊指紋。受影響 key：brick-request.solid-beam、claim.codex-lane-visual-advisory-and-brick-ids、claim.export-champion-package、claim.main-night-20260905-what-is-already-done、claim.model-fx-emitter-remaining-four-fields、claim.vfx-subtype-picker、owner-decision.20260906-main-tickets-codex-implements、question.effect-graph-bridge。沒有因單一 packet 通過而宣稱整體 coord 通過。產品測試、遠端查重、實際整合與正式上線均未在本次文件提交中執行。

## 附錄：61 個衝突的逐檔去向

此表的「人工／查權威」包括程式來源、政策及歷史文件；不代表每個都要人工重寫。產物最後由整合後的來源生成。未產生正式整合結果前，不填寫虛構的 resolved 狀態。

| 路徑 | 處理方式／已觀察 writer |
| --- | --- |
| `README.md` | docs:readme；來源完成後重生成 |
| `apps/admin/src/configForms/specs/authoring.ts` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `apps/admin/src/configForms/specs/ugc.ts` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `apps/editor/README.md` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `apps/editor/src/forge/ConditionEditor.tsx` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `apps/editor/src/forge/forgeWritebackTemplateGate.test.ts` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `apps/editor/src/views/EditorView.tsx` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `apps/game-server/src/index.ts` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `apps/game-server/src/rooms/MatchRoom.ts` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `apps/platform/internal/contentoverlay/handlers.go` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `apps/platform/internal/contentoverlay/versions.go` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `apps/platform/internal/submissions/submissions.go` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `content/ability-templates/_index.json` | content:build, skillremake:json；來源完成後重生成 |
| `content/bundle.json` | content:build, skillremake:json；來源完成後重生成 |
| `content/config/_index.json` | content:build, skillremake:json；來源完成後重生成 |
| `content/config/ugc.json` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `content/editor-target-profile.json` | content:build, skillremake:json；來源完成後重生成 |
| `content/manifest.json` | content:build, skillremake:json；來源完成後重生成 |
| `content/status-effects/_index.json` | content:build, skillremake:json；來源完成後重生成 |
| `docs/_daily/2026-09-06.md` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `docs/_release/ggd-board.html` | board:build；來源完成後重生成 |
| `docs/_release/戰情版-20260906.md` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `docs/_reports/editor-skill-acceptance-42x46.json` | skillforge:audit；來源完成後重生成 |
| `docs/_reports/editor-skill-acceptance-42x46.md` | skillforge:audit；來源完成後重生成 |
| `docs/_reports/editor-skill-human-review/index.html` | skillforge:visual-review:build；來源完成後重生成 |
| `docs/_reports/editor-skill-human-review/index.json` | skillforge:visual-review:build；來源完成後重生成 |
| `docs/_task-ledger.json` | docs:status；來源完成後重生成 |
| `docs/editor-contract/EDITOR_VFX_TEMPLATE_HANDBACK.md` | vfxforge:handback:build；來源完成後重生成 |
| `docs/editor-contract/coordination/claim.editor-form-receipts.json` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `docs/editor-contract/editor-vfx-template-handback.json` | vfxforge:handback:build；來源完成後重生成 |
| `docs/editor-contract/ggd-brick-census.json` | bricks:build；來源完成後重生成 |
| `docs/editor-contract/ggd-bricks.json` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `docs/editor-contract/ggd-bricks.md` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `docs/editor-contract/ggd-config-decoration-census.json` | decor:build；來源完成後重生成 |
| `docs/editor-contract/ggd-config-decoration-census.md` | decor:build；來源完成後重生成 |
| `docs/editor-contract/ggd-editor-coverage.json` | editorcov:build；來源完成後重生成 |
| `docs/editor-contract/ggd-runtime-capabilities.json` | caps:export；來源完成後重生成 |
| `docs/editor-contract/ggd-runtime-capabilities.md` | caps:export；來源完成後重生成 |
| `docs/editor-contract/ggd-type-catalog.json` | typecat:build；來源完成後重生成 |
| `docs/editor-contract/ggd-type-catalog.md` | typecat:build；來源完成後重生成 |
| `docs/engine-atlas.json` | atlas:build；來源完成後重生成 |
| `docs/legacy/_overwrites/_ledger.tsv` | board:build；來源完成後重生成 |
| `docs/reference/abilities.md` | docs:readme；來源完成後重生成 |
| `docs/reference/grail-wishes.md` | docs:readme；來源完成後重生成 |
| `docs/reference/items.md` | docs:readme；來源完成後重生成 |
| `docs/reference/mechanics.md` | docs:readme；來源完成後重生成 |
| `docs/reference/roster.md` | docs:readme；來源完成後重生成 |
| `docs/requirements-status.md` | docs:status；來源完成後重生成 |
| `docs/固有能力及寶具總覽.md` | content:build, skillremake:json；來源完成後重生成 |
| `docs/技能標記機制與效果規則.md` | content:build, skillremake:json；來源完成後重生成 |
| `docs/技能編輯器引擎須知 20260811.md` | contract:numbers, skillremake:docs；來源完成後重生成 |
| `packages/shared/src/content/registries.ts` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `packages/shared/src/content/schema/condition.ts` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `packages/shared/src/content/schema/template.ts` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `packages/shared/src/sim/abilities/abilitySystem.ts` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `packages/shared/src/sim/castabilityVerdict.ts` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `packages/shared/src/sim/content/condition.ts` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `packages/shared/src/sim/systems/CastResolveSystem.ts` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `tools/skill-forge/build-codex-visual-advisory.mjs` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `tools/skill-forge/build-visual-review-packet.mjs` | 人工整合／查權威，按 M01–M11 或第 4 節 |
| `tools/skill-forge/check.mjs` | 人工整合／查權威，按 M01–M11 或第 4 節 |

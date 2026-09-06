# 社群英雄整合：執行狀態與驗收邊界

目標來源：工作區上層的《社群創造後台審查英雄自動鑄造計畫最終執行版.md》。使用者授權本分支完成全部實作，Main 負責審查與合併。

- 分支：`codex/community-hero-forge-integration`
- 整合基準：`4793eaaaf2775b2081f5eca5881db32e0aab0ea8`，本次開始時的 `origin/main`。
- 實作分為五個 commits：`59edef71` 共用核心、`816a6cdb` 正式 importer、`ccdf7fa4` Platform 權限／發布、`fdc97183` Editor／Admin／Desktop、`92d6601a` 遊戲鎖版／回放。較早的測試於同一工作樹提交前執行；基準 commit 不是實作完成 commit。後續已以 `20702b3a` 合入 Main v0.39.4，`1d161dc8` 修正覆蓋層目標一致性，`365bbcbb` 修正驗收範圍，並補上七位被動情境測試。
- 原 `GGD` 與 `GGD-hero-auto-forge` 工作樹未修改。審查通道為本分支的草稿 PR；draft 不代表完成、Main 合併或正式部署。
- AI off 是交付路徑；local AI/E8 仍關閉。公開投稿與探索入口維持預設關閉。

## 分批狀態

| 批次 | 已實作／已取得的證據 | 尚未閉合的驗收 |
| --- | --- | --- |
| I0 基線 | 新 worktree／分支、保留舊 Forge 成果，追蹤 Main 正式 importer 與協作契約 | 最終逐檔清單、當前 commit 收據、Main review／CI |
| I1 單一核心 | 唯一 HeroProject、六槽、重複 Product、鎖定、逐級值、原文、演出腳本；完整 Main 模擬基線；可調整的試玩情境；重複 Product 的條件可用真實控制項獨立調整；155 顆 React 表單逐顆操作收據，其中 154 可用；已合入 Main v0.39.4 的五級距／AP 公式／subtype 契約 | 47 文件逐份視覺驗收；`tpl-dragon-shockwave` 仍不可用 |
| I2 草稿作品 | 本機 IndexedDB、未完成輸入保存、復原／重做、雲端 CAS、我的作品及授權改作 | 異常關閉／離線／衝突的完整實際 UI 證據 |
| I3 英雄匯入 | 現有 Main ImportStore 內的完整 authoring／compiled／資產快照、依賴重算、獨立 worker；最新核心的 HMAC 私有 Docker 入口真正建包／準備／回讀成功；macOS 包內 worker 經真 UI 建出含正規化肖像的完整英雄 | 部署環境驗收 |
| I4 審查發布 | 凍結候選、一頁審查、退回／更新、CAS 發布、冪等重試、下架／復原；先前已完成本機瀏覽器發布 | 最新 target 的瀏覽器重驗、故障注入與所有 UI 狀態的完整證據 |
| I5 遊戲隔離 | 最新 compiler 上兩名不同帳號使用不同社群英雄同局；真正選人、Q/W/E、發布新版／下架／真正重連；正常完整回合與結算；舊快照錄影重建 1,689 ticks 無分歧；官方排名／錢包不變 | 遊戲內模型／icon／動作的實際畫面 |
| I6 收斂交付 | 三門檻一起執行並保存失敗；真 Docker build、Helm／Compose render；桌面穩定來源、關閉保存協定、備份與可信更新驗證；macOS universal 未簽署安裝包 | 最新三門檻結果、8 組 E2E、受影響 47 文件逐份視覺證據、Windows／macOS 簽署安裝及更新／降級 |

## 可重播的本機證據

以下全部使用可丟棄的 loopback 服務與測試帳號，未部署至正式環境。JSON 與原始輸出並列保存；服務秘密、密碼及登入 token 不寫進報告。

- `combat-proof.json`：兩名人類座位與各自作品相符，兩人 Q/W/E 都有真正遊戲事件。
- `version-isolation-proof.json`：`m_01M1V4S26EWC6K68M07BF9QQ2K`，新版 Q 耗魔由 40 改成 41，另一作品下架；原房間仍固定舊 manifest，封包逐位元組相同，真正 reconnect 後再施放成功。
- `replay-after-publication-proof.json`：同一場錄影在新版發布及下架後重建至第 309 tick，manifest 為 `sha256:578cbc3c2e1e8fb1253e8bad973fb6f0d908f0dc37e501945f069c2052f880df`，沒有 divergence。
- `private-import-proof.json`：Docker 私有 Main 入口完成目標查詢、建包、inspect、prepare、相同操作重試及 ZIP 回讀。
- `replay-proof.json`：較早的另一場測試重建至 310 tick。

以上早期網路與容器證據使用 compiler fingerprint `1752c1bad9b5`，只代表前一實作快照。最新私有容器重驗使用 `c64145dac18b`，詳見以下獨立原始收據：

- `private-import-current-proof.json`：HMAC 私有 Main 正式入口建包、inspect、prepare、冪等重試與 authoring 無損回讀；package digest `sha256:c1024fc6e769fbfce66af8392738682c719accbd381879e7ddd0894855bbc75b`。
- `private-channel-game-proof.json` 與 `private-channel-replay-proof.json`：新核心的兩名人類選人／施法、發布新版／下架／真正重連，重建 326 ticks 無分歧。
- `complete-match-fixed-proof.json`：`m_01M1V742WZ6258Z77KDADV9BRH`，只透過普通房主設定 `combatMaxSec=30, maxRounds=1` 完成回合，無直接設定 phase／tick／HP。收到 matchSettlement、matchEnd，Platform 房間結束；兩帳號的官方 games／wins／MMR、排名及錢包與賽前相同。
- `complete-match-replay-proof.json`：同一完整對局在發布新版及下架後重建 1,689 ticks，沒有 refusal 或 divergence；manifest `sha256:351ea873c624a644cf321ad592483cc68afbf16517b5924e1c5855d4ff08d431`。

完整結算證據來自對局收據；replay seek 到末端後停在 paused，不把其 `finished` 旗標說成 true。以上仍是 HTTP／WebSocket 與 SimWorld 證據，不能替代遊戲畫面與安裝驗收。

`socket-proof.json` 是較早的選人測試，當時的座位清單包含 bot；兩位人類座位的斷言以後續 `combat-proof.json` 與 `version-isolation-proof.json` 為準。

可執行工具：

```sh
# 只允許可丟棄的 loopback 測試環境；密碼由本機環境提供。
GGD_LOCAL_COMMUNITY_PROOF=disposable-local-only GGD_LOCAL_PROOF_UPDATE=1 GGD_LOCAL_PROOF_COMBAT=1 node --import tsx tools/community-hero-forge/local-game-proof.mts
# 完整比賽另設 GGD_LOCAL_PROOF_FULL_MATCH=1；私有測試平台另設 GGD_LOCAL_PROOF_PLATFORM_PORT=8085。
GGD_LOCAL_COMMUNITY_PROOF=disposable-local-only GGD_LOCAL_PROOF_RECORDING=/absolute/path/to/game-proof.json node --import tsx tools/community-hero-forge/local-replay-proof.mts
GGD_LOCAL_COMMUNITY_PROOF=disposable-local-only node --import tsx tools/community-hero-forge/local-private-import-proof.mts
```

## 目前核心驗證

- 出身來自 Main 當前 10 項共享契約；30 組 origin／profile 測試。原報告的「72 Origin」沒有此總計畫依據，已移除。
- `test-evidence/desktop-bridge-tests-fixed.log`：桌面 7 檔、37 測試通過，含穩定來源、保存 ACK、備份／更新安全邊界與 Platform 代理。`desktop-four-types-fixed.log`：Desktop／Editor／Admin／Content API 型別檢查通過。
- `test-evidence/hero-condition-backup-tests.log`：真實條件控制項改第二個同模板 Product、JSON 無損回讀；備份原文與圖片編碼、破損／未来格式拒絕及恢復新副本。這是 headless 元件與儲存邏輯驗證，尚無真瀏覽器 IndexedDB 備份回讀證據。
- `desktop-restart-proof.json`：真 Electron 執行檔連續啟動兩次，每次五個 HTTP 入口成功且 origin 固定。`test-evidence/desktop-mac-package.log`：macOS universal DMG／ZIP 已建置，明確未簽署。
- 桌面更新是經簽署 feed、digest 與平台發行者驗證後的手動 installer 入口；目前穩定通道預設關閉，沒有設定發布 key／憑證。尚未取得簽署、安裝 UI、自動二進位替換或實際升降級證據。

- `main-editor-baseline-fixed.txt`：5 檔、26 測試通過，含六槽 runtime／完整 Main 封包、Editor 與 Main 同一投影、實際 MatchController 設定比對，以及已污染的外部登錄不影響重新載入。
- `playground-tests.txt`：3 檔、18 測試通過，含位置、HP/MP、條件標記、缺魔拒絕、未知狀態拒絕、模型來源與不可變 authoring。
- `editor-compatibility-tests-fixed.txt`：4 檔、27 測試通過；既有表單測試工具補上 Context 支援，模板寫入閘仍拒絕不允許的契約。
- `required-gates-latest.json`：三門檻同批執行全部 exit 0，Editor 完整測試 504 項通過。此輪在參照選單修復／153 顆新量測器之前；新量測器與 walker 的 8 項測試、修復後型別檢查另行通過，最終交付仍需三門檻共同重跑。

這些測試數目有重疊，不能相加成一次完整 suite；以上歷史收據在實作提交前取得。下列 current 證據對應已提交來源；最新三門檻結果另行更新，未完成者不記為通過。

## 已保留的失敗與修正

原始測試失敗留在 `test-evidence/`，不以刪除失敗檔製造全綠：

- 測試程序 IPC／監聽權限不足：環境限制；同命令取得本機執行權限後再跑。
- 第一次戰鬥測試未擷取事件，以及在合法施法 recovery 期間只送一次命令：測試機制問題；改為擷取事件並透過普通輸入重試。
- Main 版本紀錄的建立時間欄位與可攜投影不一致：產品讀取問題；明確投影並加上真 ImportStore 回歸測試。
- 下架測試呼叫錯 endpoint、離線 transport 重複清理、回放 status 早於 state patch：測試機制問題，各自修正後有新紀錄。
- 完整戰鬥基線下，`approaching` 是接近目標後施放的正常指令：驗收現在要求同一施放者、同一技能真正發出 abilityCast，未到達或被拒仍失敗。
- 出貨容器原本可能以空的 Vite glob 成功建置：加入完整離線模擬目錄與 Docker 中的目錄驗證；需以最新 image 重建結果閉合。

## 實際外部限制

CUA 曾完成本次瀏覽器建作品、保存與重開；後續 Mac 鎖定時回覆無法自動解鎖，已請使用者解鎖，待補畫面。原生 macOS 視窗操作曾回覆「Computer Use permissions are not granted」。Windows 實機、簽署安裝與跨版本升降級仍無本次證據。macOS 本機量到 0 個有效簽署 identity；GitHub repository secrets 名稱清單為空，未假設可用的簽署來源。Windows x64 NSIS／portable 交叉建置已成功，但不是 Windows 實機執行證據。

目前 Main 母體已增加為 43 主題／47 文件；舊的 46 份 framebuffer 不能代表完整覆蓋。工具現在比對完整 ID 集合，缺少 `godie-u034.passive` 時會明確失敗。即使接觸表 freshness 通過，也不表示本次已逐份人工視覺驗收。所有發布、跨平台及未完成項持續維持未完成狀態。

## 本次瀏覽器路徑

`browser-evidence/` 的 PNG／DOM 由 CUA 實際操作取得。服務由 macOS universal 包內程式提供，origin 為 `http://127.0.0.1:60474`，Platform 是可丟棄的 loopback `:8085`。瀏覽器沒有 Electron preload，因此這些證據不代表原生關閉保存 IPC 或安裝精靈。

- AI off 起稿「晨星守望者・桌面驗收」，六槽、完整三行 Owner 原文與兩行 Q 台詞。
- Q 加入兩份單體斬擊 Product，分別保留 350／175；原始 icon 上傳後，關閉分頁再開作品清單，參數、原文及圖片仍在（01–03）。
- 包內 worker 經 UI 建出第 10 版完整英雄：123 份資料、93 份資產，digest `sha256:749f4e6d67ed1664f64638a405183ef9fbd5099e23f80fd4f14130121a9f7c62`，正規化圖片可見（04）。
- 同步、投稿、作者續編後，後台仍審查第 10 版的原名稱；退回理由回到作者端。重建重送產生第 11 版，舊候選保持退回歷史（05、06、13、14）。
- 第 11 版由本機驗收帳號核准發布，後台確認固定版本 `hero-d9323c49b402f0df19521e9c011a9376ef30f527c70d684e62e69d2c4a2`；作者重新登入並更新審查結果後顯示「已發布」（15、16）。這是可丟棄平台的功能測試，不是 Owner 美術核准或正式發布。
- 固定候選逐槽開啟預覽並操作共用時間軸，擷取 Q 連續影格與其餘槽位（07–12）。畫面明示 `champ.thorne` 共用替身；這些代表性畫格不是完整美術核准，也不是 46 文件的替代品。

## Main 在執行期間的新變更

交付前刷新到 `origin/main@c71941180433d4fa89a68365b169990680d877d7`。相對初始基線有 772 個路徑變動，其中 11 個與本分支實作相交，涉及 resolver、VFX subtype／演出、模板、Hero schema、Admin 表單與 lockfile。已在 `20702b3a` 完成接縫合入，使用 Main 的五級距、AP 公式開關、VFX subtype 固定與新版模板；受影響表單、核心及私有匯入／遊戲已重驗。Main 的分支維持只供審查／合併。


## 七位社群概念作品：當前實測

`community-concepts/summary.json` 對應四組真正 HTTP／WebSocket 對局，覆蓋七位作品。每組兩個人類帳號各自選到自己的作品，Q／W／E 均收到相符 caster、slot、abilityId 的 authoritative `abilityCast`。PASSIVE／R／EX 沒有繞過遊戲的回合解鎖；它們以具名 SimWorld 情境另行驗證。

| 概念來源 | GGD 改編作品 | 重要規則調整 |
| --- | --- | --- |
| 沃維克 | 赤痕獵衛 | 低血量普攻追加、主動追獵加速、指定恐懼與可反擊連段；無全圖追蹤／無敵 |
| 卡爾瑟斯 | 暮鐘詠者 | 每場一次續命取代死亡施法；終曲改為有界落點；領域固定 3 秒 |
| 拉克絲 | 稜光引路人 | 單人束縛、自身護盾、四段線路；普攻追加採內置冷卻 |
| 犽宿 | 逐風浪客 | 物理護盾取代消彈風牆，旋風獨立 EX；突進與連段有固定距離及冷卻 |
| 好運姐 | 緋帆槍手 | 至多兩人連鎖、六發有界落點彈幕；換目標不重置被動 |
| 李星 | 聽雷行者 | 共通魔力；Q 與追擊 EX 分開，自身護盾，踢擊使用共通推移 |
| 齊勒斯 | 星牢砲師 | 固定時序與落點三連砲；最遠射程取 Main 極大級距，回魔改 EX |

- 七位、42 槽 schema／編譯／來源回讀及套件驗證通過；35 個主動槽有真實 SimWorld 施放。`deterministic/proof.json` 的 PASSIVE 欄明確保留 `passive`，不冒充主動施放。
- `passive-tests.log`：8 個具名測試驗證六位普攻被動與 2 秒內置冷卻、沃維克對健康目標不觸發，以及卡爾瑟斯消耗自己的初始標記續命一次、下一次致命傷確實死亡。
- `warwick-karthus-overlay.json`：完整對局 `m_01M1VDYESHGZM3F7X1X82EX7ZF`，正常房主設定 `combatMaxSec=30, maxRounds=1`，真正結算及房間關閉；正式統計、排名與錢包未變。發布新版／下架／重連仍固定原作品快照。
- `warwick-karthus-replay.json`：同一局錄影重建至 1,053 ticks 無 divergence／refusal；結算訊息另在主局收據，不把 replay 末端當成另一筆結算。
- `lux-yasuo-2.json`、`missfortune-leesin.json`、`xerath-lux.json`：其餘角色同局選角與 Q／W／E 成功。拉克絲第一次 Q 在射程外被拒，`lux-yasuo.json` 保留失敗；工具改成正常 move order 接近並更新活目標，未修改技能距離／角色位置／HP。
- `browser/`：CUA 真正建立七位、返回作品清單、在新分頁重開；拉克絲 W 護盾從 120 改為 175 並持久化。僅有代表性 3D 畫格；目前外觀為 `champ.thorne`／`champ.sela` 共用替身，不能算美術核准。

## 覆蓋層修正與部署證據

啟用社群入口會把 `config/ui-cues` 寫入 Platform 覆蓋層。原 importer 只讀出貨檔案、遊戲讀合併內容，造成已核准角色與遊戲 contentVersion 不同。`1d161dc8` 讓私有 importer 在每次目標／建包／檢查讀取一次可信 Platform 快照，將同一份覆蓋層傳入 worker；以與遊戲相同的 ContentLoader 解析依賴，並拒絕版本漂移。取得覆蓋層失敗回應 503，不能退回出貨目錄。變更後仍需沿用遊戲既有的內容 reload／restart 流程；運行中的房間保留原快照。

- `content-api-regression.log`：21 檔、173 測試全部通過，含既有 CRUD、正式 importer、來源保存與私有通道。
- `overlay-import-tests-passed.log`：真 worker 建包、檢查與 merged game room 成功；後台內容更新拒絕舊套件；離線／壞覆蓋層 fail closed。
- `importer-docker-build.log`／`game-docker-build.log`：兩個真 Docker image 建置並啟動；遊戲載入 `cv_a9b182edeb2b`，與投稿目標一致。
- `helm-render.json`／`compose-render.json`：兩端指向同一 Platform；匯入器沒有 host port、content 唯讀；Helm 開啟社群時才允許 importer 讀 Platform 覆蓋層的 NetworkPolicy。
- `desktop-build.log`、`mac-package.log`、`win-package.log`、`desktop-artifacts.json`：新版 Editor／Admin／worker 可建置，macOS universal DMG／ZIP 與 Windows x64 NSIS／portable 均產出。Mac 執行檔只有 linker ad-hoc signature（無 TeamIdentifier，未綁資源），Windows PE 憑證區為 0 bytes；均未取得發行者簽署、原生安裝、更新／降級驗收。

當前機器驗收不等於完整交付。47 文件實際 framebuffer／逐份審查、剩餘 UI 異常情境及跨平台原生安裝仍需完成；Mac 解鎖前不生成或假造瀏覽器畫面。


## 當前三門檻（90e5c16e）

`community-concepts/required-gates.json` 與 `gate-1.log`／`gate-2.log`／`gate-3.log` 保留同一批真實結果：`skills:check` exit 1、`editor:accept:release` exit 1、`coord:check` exit 0。前兩項都在 `tools/skill-forge/visual-proof-scope.mjs:27` 拒絕缺少 `godie-u034.passive` 的 framebuffer；未放寬閘。Editor release 因此前段停止，不能宣稱其後的完整 Editor suite 已在本批執行；獨立核心／表單／型別／打包結果另列。

交付前另查到 Main 的 `1de2bd31`（四個新提交，以既有 ledger／census 與相同 sim-audit 分母修正為主）；已以 `592f815d` 合回功能分支，四個衝突均解決，census 與 legacy 索引按來源重建。合入後三門檻同批重跑仍為 1／1／0，同樣只停在缺少 `godie-u034.passive` 的 framebuffer。沒有正式部署、Main 合併或完整跨平台交付。


完整 Editor suite 另行執行：79 檔、512 項中 511 通過，1 項 README 契約收據過期（`editor-full-first.log`）；從當前生成資料更新 README 的 coverage／capability／required 數字後，該項獨立重驗通過（`editor-readme-fixed.log`）。這不是宣稱一次 full suite 全綠。Admin／Desktop／Game-server 型別檢查全部通過（`other-types.log`）；Shared 新被動測試的事件欄位型別修正後通過（`shared-types-passed.log`），第一次錯誤保留在 `shared-types.log`。

兩次 CUA 回讀均確認 Mac 仍鎖定；已提出解鎖請求。其餘未受阻工作已繼續完成，視覺證據不以離線渲染或假圖補數。

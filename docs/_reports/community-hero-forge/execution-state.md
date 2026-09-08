# 社群英雄整合：執行狀態與驗收邊界

目標來源：工作區上層的《社群創造後台審查英雄自動鑄造計畫最終執行版.md》。使用者授權本分支完成全部實作，Main 負責審查與合併。

- 分支：`codex/community-hero-forge-integration`
- 整合基準：`4793eaaaf2775b2081f5eca5881db32e0aab0ea8`，本次開始時的 `origin/main`。
- 實作分為五個 commits：`59edef71` 共用核心、`816a6cdb` 正式 importer、`ccdf7fa4` Platform 權限／發布、`fdc97183` Editor／Admin／Desktop、`92d6601a` 遊戲鎖版／回放。較早的測試於同一工作樹提交前執行；基準 commit 不是實作完成 commit。後續已以 `20702b3a` 合入 Main v0.39.4，`1d161dc8` 修正覆蓋層目標一致性，`365bbcbb` 修正驗收範圍，並補上七位被動情境測試。
- 原 `GGD` 與 `GGD-hero-auto-forge` 工作樹未修改。審查通道為本分支的草稿 PR；draft 不代表完成、Main 合併或正式部署。
- AI off 是交付路徑；local AI/E8 仍關閉。公開投稿與探索入口維持預設關閉。

## 當前擴充：模型上傳與 37 名英雄

`ce12723f` 已提交通用 GLB 本體、相容獨立動作庫、六用途绑定、私人雲端原始素材、裁剪 runtime ZIP、投稿／固定審查／發布／署名改作及回滾開關。隔離瀏覽器生命週期與逐位元組證據見 [model-upload/README.md](model-upload/README.md)，最後三门檻 **1／0／0**，release 完整 Editor 549 項與 build 通過；skills 仍受既有每日訊息帳本未對應資料影響。

`60331b05` 已完成 37 名／222 槽交接資料夾匯入、完整原文與 requiredRefinement 顯示、模型來源標示、独立草稿和 GLB 雜湊回讀；當時模型為 19 名。後續本體已補至 **37 名／34 個 GLB**，18 名同角色、1 名互通版本、18 名風格替代，逐模型正面／六用途檢查及整批 37／222／37 匯入相符。最新收據見 [complete-body-coverage](library-models/complete-body-coverage/README.md)；可攜資料夾為工作區 `outputs/community-hero-asset-integration/handoff-with-models-v2`，不是投稿 ZIP。

模型版本下拉、保留舊版本、新版預設與 rollback 已於 `2a16ac68` 實作並完成隔離新→舊→新驗收，見 [model-versions](model-versions/README.md)。本批 37 名是隔離候選／草稿，尚未發布正式英雄或建立當前 target 的 37 份投稿包。

已補上同來源詛咒所需的施法者歸屬、獨立層數／到期／回放摘要，見 [caster-status](caster-status/README.md)。`681c595c` 又完成原子狀態消耗、成功／缺少狀態互斥分支，以及三層施法成本；真實施法治具確認 R→EX 移除自己的 R 詛咒後給敵方增益，沒有通常 EX 傷害。核心 99 項及完整 Editor 555 項／build 通過，見 [status-consumption](status-consumption/README.md)。

上一批新增可調的非致死生命支付、獨立生命支付事件與共用／逐階數值控制項。0.8 秒吟唱治具驗證釋放時才支付最大生命 3%、至少保留 1 HP；中斷不付未釋放的反噬，不觸發吸血／傷害反擊。核心整合 88 項通過，最終發布門檻與畫面證據見 [health-payment](health-payment/README.md)。

已補上 `oncePerCast` 與跨延遲載體來源追蹤，新增 34 項／相關回歸合計 129 項及隔離開關操作通過，詳見 [cast-credit](cast-credit/README.md)。

重開機後完成阿薩謝爾六槽配方、單槽資源控制與真實前置 R→EX 試玩；五檔 48 項針對性檢查及兩份瀏覽器操作收據通過，AD 微調已重開驗證並還原。畫面驗收抓到 Editor 漏接正式浮字池，已修正並實際看到目標金色反轉文字與施法者驚愕文字。詳見 [azazel-refinement](azazel-refinement/README.md)。E 方向／近身技能條件、專屬動作／特效／音效、敵方增益 UI 及原作完整演出仍未完成；原設計完整驗收仍為 0／37 名。

已更新隔離 Platform／private importer 至服務戳記 `6aeb6aeb39c1d3a4a16c185f035b3c0c65896b92`，完成 **37／37 當前服務建包與 inspect**，222 槽來源與全部 GLB 往返相等，完整檔案在工作區 `outputs/community-hero-asset-integration/packages-current-service-6aeb6aeb`。這是建包完整性證據，沒有整批發布。

阿薩謝爾透過真正 Editor 建包／同步／投稿，Admin 固定六槽模型載入及投稿後草稿修改隔離驗證通過。重验補上後台唯讀原設計／requiredRefinement 面板，並修正正常冷 GLB 被 750 ms 場景暖機期限誤判為替身的問題；獨立模型載入有界，材質／framebuffer 檢查仍保留。審查依 E 判定、W／EX 專屬演出缺項退回，作者收到同一份意見。最終 Editor 570 項、型別與 build，Admin 型別與 build 通過；三門檻為 1／0／0，skills 仍為既有訊息帳本問題。原始失敗、逐槽圖片、來源比對及退回紀錄見 [current-service](current-service/README.md)。最新服務的多人遊戲／回放／完整原作演出仍待驗證。

新增通用 `facing` 正面條件，阿薩謝爾 E 現在要求正面 120°、距離 ≤2.5；巢狀效果／觸發器條件可用選單修改。共用核心 51 項、Editor 針對性 55 項及真實頁面保存重開已通過，原始文字與 R→EX 反轉機制保留。新版來源在 `outputs/community-hero-asset-integration/handoff-azazel-direction-v2`；尚未更新服務或重建此版本投稿 ZIP。最終完整 Editor 572 項、型別及 build 通過，三門檻 1／0／0，skills 仍停在既有訊息帳本缺項。詳見 [defense-direction](defense-direction/README.md)。近身技能分類與影子演出仍待補，原設計整體仍是 0／37。

已完整讀取交接文件與 12 組機制規約，**逐槽 requiredRefinement 與原設計整體驗收仍待完成**，未宣告任一英雄原設計全部完成。保留所有名稱與原文，尤其阿薩謝爾 R→EX 的同來源詛咒反轉敵方增益、三層資源消耗與非致死反噬；上述共用機制證據仍需串成正式角色內容與整體情境驗收。代理素材、基本編譯／模擬／ZIP 往返證據都不能取代原設計驗收。以下各批與歷次服務指紋保留為各自快照的證據，不代表新 37 名已閉合。

## 分批狀態

| 批次 | 已實作／已取得的證據 | 尚未閉合的驗收 |
| --- | --- | --- |
| I0 基線 | 新 worktree／分支、保留舊 Forge 成果，追蹤 Main 正式 importer 與協作契約；本批逐檔清單與 commit 收據見 author-workflow | Main review／CI、批准推送前重新確認遠端狀態 |
| I1 單一核心 | 唯一 HeroProject、六槽、重複 Product、鎖定、逐級值、原文、演出腳本；完整 Main 模擬基線；可調整的試玩情境；重複 Product 的條件可用真實控制項獨立調整；155 顆 React 表單逐顆操作收據，其中 154 可用；已合入 Main v0.39.4 的五級距／AP 公式／subtype 契約 | 47 文件逐份視覺驗收；`tpl-dragon-shockwave` 仍不可用 |
| I2 草稿作品 | 本機 IndexedDB、未完成輸入保存、復原／重做、雲端 CAS、我的作品及授權改作 | 異常關閉／離線／衝突的完整實際 UI 證據 |
| I3 英雄匯入 | 現有 Main ImportStore 內的完整 authoring／compiled／資產快照、依賴重算、獨立 worker；`c31e8cb6a9be` 的 HMAC 私有 Docker 建包／準備／回讀與 `df99921d8f29` 的私有入口回歸；舊版 macOS 包內 worker 經真 UI 建出含正規化肖像的完整英雄 | 最新部署環境驗收 |
| I4 審查發布 | 凍結候選、一頁審查、退回／更新、CAS 發布、冪等重試、下架／復原；先前已完成本機瀏覽器發布 | 最新 target 的瀏覽器重驗、故障注入與所有 UI 狀態的完整證據 |
| I5 遊戲隔離 | `c31e8cb6a9be` 上七位作品、四組雙人同局；真正選人、Q/W/E、發布新版／下架／真正重連；正常回合與結算；該輪錄影重建 1,053 ticks 無分歧，較早另一局 1,689 ticks；官方排名／錢包不變 | 遊戲內模型／icon／動作的實際畫面、最新部署快照確認 |
| I6 收斂交付 | 三門檻一起執行並保存失敗；真 Docker build、Helm／Compose render；桌面穩定來源、關閉保存協定、備份與可信更新驗證；macOS universal、Windows NSIS／portable 交叉建置 | 8 組 E2E、受影響 47 文件逐份視覺證據、Windows／macOS 簽署安裝及更新／降級、PR CI／Main review |

## 後續完成度檢查：作者操作與投稿政策

`7f6278811ae71e3d4cac6fed8f0a3785faa19771` 補齊總計畫 §4.1／§7.2／§10.1 的具體缺口：

- 雲端衝突提供完整文字／圖片比較，以及採本機、採遠端、另存新作三種選擇。先耐久保存兩份資料，再依已比較的 revision 同步；第二次衝突不自動覆寫。切換帳號、作品或持續編輯時，過期結果不會替換當前原稿。
- 我的作品可複製未完成英雄；保留原文、raw input、來源、鎖定與原圖 bytes，建立新身分並清除舊投稿關聯。未知新版草稿提供唯讀檢視與既有原始資料匯出入口。草稿可與固定投稿逐欄比較。
- 作者可在兩處投稿結果撤回目前尚未審查的候選。撤回寫入既有操作紀錄，不製造管理員裁決；舊發布版、候選與歷史保留。重新送審需要新的修訂；相同撤回請求可安全重試，舊請求不會清掉新候選。
- 英雄投稿讀取 Main 現有 `config/ugc` 的即時覆蓋層：大小、待審深度與每日新候選額度都由伺服器執行，Editor 只顯示生效值。每日以 UTC 00:00 重置；撤回或重啟不清零，同候選重試不重複消耗。待審深度數目前候選而非所有歷史材料，遺失索引不會放寬限制。同帳號最後額度的並行請求只能一方成功。

`author-workflow/summary.json` 與原始 log 保存本批證據：完整 Editor suite **83 檔／541 項通過**；Admin 設定表單 **4 檔／44 項通過**；Platform 投稿與 Server 套件 `go test -race` 通過；Editor／Admin 型別檢查通過。測試過程曾修正兩個測試程式錯誤與一個 Admin 說明路徑錯誤，失敗輸出仍保留。Headless React、替身保存／網路邊界與 Go 測試不能替代實際 UI／安裝驗收。

`91d0abdb97fba7d7ce4139c32c024559fca293e2` 另外修正舊素材列表邊界：已發布／已撤回的完整英雄不再誤顯示於舊待審或我的素材列表。英雄專用審查頁保留全部歷史與正確狀態；兩個 Platform 套件的最終 `go test -race` 通過。第一次新增測試誤以為英雄列表回傳裸陣列，已改用既有 `items` 分頁格式，失敗輸出保留。

四份最新桌面測試包位於 `/private/tmp/ggd-community-desktop-author-final`，UI 來源為 `7f627881`；後續 `91d0abdb` 僅改 Platform。Mac／Windows 內 Editor 128 檔、Admin 122 檔分別與建置輸出逐位元組相同。雜湊、大小及簽章檢查見 `author-workflow/desktop-artifacts.json`；Mac 為 ad-hoc，兩份 Windows 包的 Authenticode certificate bytes 為 0。尚無受信發行者簽署、原生安裝或升降級證據。最新 Platform 本機執行檔亦已建置，未啟動或部署。

同批交付門檻為 **1／1／0**（skills／release／coord）；前兩項仍缺 `godie-u034.passive` 真實畫格。processor fingerprint 仍是 `df99921d8f29`。較早的桌面包未包含本批作者操作，新的建置與簽章檢查另記在本批 evidence。Mac 鎖定、GitHub 推送目的地授權與兩平台原生驗收仍未解決；不宣稱計畫完成。

## 後續完成度檢查：資產生命週期

`9d8c3934c4a12dc0ae8ff6268f1589a375ce12e0` 補上總計畫 §8／§10 的暫存與孤兒回收，`cde5ef06a887f223781b4974ddc71a374ac62a62` 保留來源收據。先前的實作會直接寫入圖示快取最終檔名，而且沒有回收程序；程序中斷可能留下半份檔案或長期累積未提交資料。

- 圖示原圖、正規化圖片及收據快取改為先寫暫存檔、fsync、rename。注入部分磁碟寫入失敗後，正式物件不可見；重新開 store 後同一上傳可成功重試。
- Main importer 啟動及每分鐘執行一個回收步驟，編譯 worker 忙碌時跳過。圖片快取保留 30 日，未提交 `.pending-*` 目錄至少保留 1 日。每步最多檢查 256 項、刪除 16 個檔案或空目錄，排程上限 10 ms；作業系統中的單次磁碟呼叫無法由 JS 強制中斷。游標跨步保留，關閉服務時釋放目錄 handle。
- 不走入有效作品版本、官方 staging、候選、操作或發布歷史；正規化收據作為永久稽核 metadata 保留，讓原圖 digest 與正規化 digest 的關係在快取過期後仍可追溯。不跟隨 symlink，也不遞迴強制刪除。未知檔案、過深或不完整權限的資料保留供管理員檢查。回收結果與錯誤數寫入現有 importer audit。
- 私人本機／雲端草稿仍攜帶圖片 bytes；發布、對局與回放從不可變版本取完整圖片。Editor 若缺少本機正規化圖片，會要求從完整 ZIP／雲端恢復，不能默默依靠會過期的伺服器快取。
- 實測清空圖示快取後，已保存版本仍可讀出原 bytes、完整包可再次 inspect；草稿送回內含圖片後重建出的 package digest 相同。這不等於瀏覽器保存／離線操作或原生安裝驗收已完成。

當前 processor fingerprint 為 `df99921d8f29`。七位角色的既有 HTTP／WebSocket 對局、舊 Docker image 與 `community-concepts/desktop-artifacts.json` 是上一個 `c31e8cb6a9be` 實作快照的歷史證據；不冒充本次最新版。最新回收、型別、私有入口、桌面建置與門檻原始輸出另存於 `asset-retention/`。

驗證紀錄：首批回收／匯入／原子性 22 項、私有入口／磁碟故障 6 項通過；完整 Content API suite 為 177 通過、1 項因 tsx IPC EPERM 失敗，受影響同檔以本機權限重跑 3 項通過。保留來源收據的中間實作曾漏清收據暫存，該次 9 通過／1 失敗；修正後完整回收測試檔 4 項通過。各輪有重疊，不能相加成一次完整 suite 全綠。

必要門檻的同批本機結果仍是 `skills:check=1`、`editor:accept:release=1`、`coord:check=0`，前兩項卡在缺少 `godie-u034.passive` 真實畫格。Mac 仍鎖定；推送尚待使用者回覆先前的目的地授權，自動核准審查拒絕後未重試。整體計畫維持未完成。

最終 `cde5ef06` 已重建四份桌面測試包，位於 `/private/tmp/ggd-community-desktop-retention-final`；檔案雜湊、大小及簽章檢查在 `asset-retention/summary.json`。macOS 為 adhoc、無 TeamIdentifier，兩份 Windows 安裝包的 Authenticode certificate bytes 都是 0；不是可信發布者簽署。尚未在兩平台完成實際安裝／升降級，沒有藉交叉建置宣告該組 E2E 完成。

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

CUA 曾因 Mac 鎖定受阻；現已恢復，並取得下述 47 文件 framebuffer 與作者衝突分支的實際 UI 證據。原生 macOS 視窗操作曾回覆「Computer Use permissions are not granted」。Windows 實機、簽署安裝與跨版本升降級仍無本次證據。macOS 本機量到 0 個有效簽署 identity；GitHub repository secrets 名稱清單為空，未假設可用的簽署來源。Windows x64 NSIS／portable 交叉建置已成功，但不是 Windows 實機執行證據。

Main 母體已增加為 43 主題／47 文件；本批新擷取已覆蓋完整 47 份，包括 `godie-u034.passive`。工具仍比對完整 ID 集合，缺少文件時會明確失敗。即使接觸表 freshness 通過，也不表示本次已逐份人工視覺驗收。所有發布、跨平台及未完成項持續維持未完成狀態。

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

| 概念來源 | 先前驗收名稱（歷史） | 重要規則調整 |
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

當前機器驗收不等於完整交付。47 文件的實際 framebuffer 已補齊；逐份審查、剩餘 UI 異常情境及跨平台原生安裝仍需完成。


## 當前三門檻（90e5c16e）

`community-concepts/required-gates.json` 與 `gate-1.log`／`gate-2.log`／`gate-3.log` 保留同一批真實結果：`skills:check` exit 1、`editor:accept:release` exit 1、`coord:check` exit 0。前兩項都在 `tools/skill-forge/visual-proof-scope.mjs:27` 拒絕缺少 `godie-u034.passive` 的 framebuffer；未放寬閘。Editor release 因此前段停止，不能宣稱其後的完整 Editor suite 已在本批執行；獨立核心／表單／型別／打包結果另列。

交付前另查到 Main 的 `1de2bd31`（四個新提交，以既有 ledger／census 與相同 sim-audit 分母修正為主）；已以 `592f815d` 合回功能分支，四個衝突均解決，census 與 legacy 索引按來源重建。合入後三門檻同批重跑仍為 1／1／0，同樣只停在缺少 `godie-u034.passive` 的 framebuffer。沒有正式部署、Main 合併或完整跨平台交付。


完整 Editor suite 另行執行：79 檔、512 項中 511 通過，1 項 README 契約收據過期（`editor-full-first.log`）；從當前生成資料更新 README 的 coverage／capability／required 數字後，該項獨立重驗通過（`editor-readme-fixed.log`）。這不是宣稱一次 full suite 全綠。Admin／Desktop／Game-server 型別檢查全部通過（`other-types.log`）；Shared 新被動測試的事件欄位型別修正後通過（`shared-types-passed.log`），第一次錯誤保留在 `shared-types.log`。

較早兩次 CUA 回讀確認 Mac 鎖定；這是歷史限制。現在已解鎖並透過真實 UI 重新擷取，沒有以離線假圖補數。


## 遠端送審尚未執行

本機已完成實作與證據提交。嘗試推送 `codex/community-hero-forge-integration` 到 `git@github.com:adms/GGD.git` 時，自動核准審查在執行前拒絕：開發／Main 審查授權尚未明確確認將原始碼及驗收紀錄外送到該 GitHub 目的地。已向使用者提出目的地確認；未以其他工具或指令繞過，尚未 push、建立 PR 或觸發該 PR 的 CI。

可供批准的 PR body 已保存為 `docs/editor-contract/coordination/claim.community-hero-forge-integration.json`；批准後以同一分支建立草稿 PR，保留視覺／原生安裝未完成狀態。


## 本批進度：實際 UI、角色名稱與 LoL 模型

- 瀏覽器重新擷取 43 主題／47 文件、205 張實際 WebGL 畫格，47 captured／0 blocked／0 failed；`visual-ui/browser-proof.json` 保存原始收據。人類裁決仍為 47 pending，沒有把擷取成功當成人工核准。工具的 42／46 固定分母已改成由當前驗收資料推導並比對完整文件集合。
- 作者 UI 已實際測試雙分頁雲端 CAS：原作品從第 1 版衝突到第 2 版；本機保留完整三行 Q 原文、鎖定與未完成數值 `2e`，選擇另存新作，再重新載入並同步自己的第 1 版。兩份獨立保存資料位於 `author-ui/after-copy-*.json`；採本機／採遠端的另外兩條 UI 分支尚未完成。
- 七個新範例名稱已改回沃維克、卡爾瑟斯、拉克絲、犽宿、好運姐、李星、齊勒斯；來源及作品列表卡片已修改與回讀。上述歷史驗收作品不自動改名。
- 從本機 LoL 安裝唯讀擷取七位基本造型、骨架、貼圖與 251 段原始動作，轉成 GLB。依 GGD 消費端裁出每位 6 段、共 42 段的候選；原始素材均另存。候選裁剪的幾何／骨架／貼圖資料逐位元組不變。細節與清單見 `lol-models/animation-requirements.md` 及 `lol-models/summary.json`。
- 遊戲用候選再精簡關鍵影格、跨片段常數屬性，以及不影響帶權重骨架／網格的定位節點動畫；所有候選仍保留各自 6 段。最新候選為沃維克 188、卡爾瑟斯 156、拉克絲 110、犽宿 170、好運姐 97、李星 196、齊勒斯 148 通道，其中四位符合 160 上限。714 個片段取樣點與 210 組片段切換的蒙皮頂點比較通過，最大差異約為待機高度的 0.0324%；幾何、綁定、貼圖逐位元組比較通過。原始收據在 `lol-models/runtime-candidate/`，舊候選保留。這些尚未改成 GGD 角色的正式 model 綁定，也未完成七位逐動作視覺驗收。
- 平板性能目標已修正為 iPad mini A17 Pro／30 fps。依開發機測量與既有 3 倍成本係數估算，每英雄 160 通道／全場 1,920；面數、Mesh、貼圖上限維持。A17 Pro 實機測試不再列交付門檻。估算標記同時寫在來源與預算頁。
- 動作裁剪器補上 ClipAnimator 的實際解析結果，保留 clipMap 外的格擋與閃避。預算／幀率測試 4 檔 40 項通過，裁剪測試 18 項通過，模型預算型別及既有超標基線檢查通過。首次測試對舊 55 通道門檻的期望失敗保留，更新為新規格後重驗。

`visual-ui/initial-*` 保留缺少範圍適配的首輪 1／1／0；`after-scope-fix-*` 保留修復後的 1／0／0（skills 停在版本看板過期）。看板已用既有生成器刷新；最新結果保存在 `visual-ui/required-gates.json`，不可把歷史綠燈當成最後一輪結果。

本批程式已保存於 `8ce1cd4c44533a913ecf824bf85e9cfa4ba169fe`。最後三門檻為 **1／0／0**：`skills:check` 停在既有訊息帳本未對票，Editor release 與 coord 通過；沒有變更帳本來製造綠燈。預算報告重新生成時不再列出本工作樹不存在的 40 個非出貨 Blizzard 本機模型，並納入目前出貨索引新增的一個模型；沒有刪除模型檔案。

## 本批進度：模型核准與七位原模型預覽

`1f29504b1901716ee42e990502429aa05c8fd9f0` 接通可信模型目錄的 `heroBody` 三態核准，Editor 與 Main importer 共用選用規則，新增本體不必先建立官方英雄。後台補上模型管理入口、三個可回復選項及內容路由切換修正。作者作品無法自行授予權限，套件依賴／素材清單檢查維持。

七位原名作品已由實際 UI 建立並選用各自原模型，取得待機／Q 施法共 14 張原生 JPEG 與完整 AX tree；畫面使用真 SimWorld、VfxSystem 與 Main ChampionView。後台隔離測試完成未填 → false → true → 未填，作者清單隨之移除／恢復模型，最後文件與 contentVersion 均回復。證據見 `lol-models/forge-preview/`。

本批僅完成隔離的英雄工坊接線。受擊暫用待機，格擋／閃避沿用回退；其餘動作尚未逐項畫面驗收。齊勒斯施法畫面的本體受特效遮擋，LoL 獨立能量特效未包含在 GLB。LoL bytes 未加入出貨素材清單，不能冒充正式套件發布／雙客戶端對局證據；三位通道超標仍列待辦。

針對性測試 6 檔 39 通過、1 個 opt-in build 測試略過；新增路由後另有 8 項既有路由測試通過。Editor／Admin 型別檢查通過。首次三門檻的契約新鮮度失敗已用既有產生器修正，隨後 README 指紋／5073 欄收據已同步；各批原始結果分別保留在 `forge-preview/gates/`，以最後一批結果為準。

`1f29504b` 的最後同批結果為 **1／0／0**：Editor 完整 542 項測試與 production build 通過，coord 通過；skills 仍停在既有訊息帳本未對票。原始紀錄存於 `forge-preview/gates/final/`。這一輪耗時約 13 分 27 秒，程序有持續 CPU 工作並正常完成，沒有將長時間無摘要輸出當成產品故障。

## 新增範圍：社群模型與動作庫匯入

新增社群自行匯入模型與動作庫的功能，持續在同一功能分支實作。現在的核准目錄／本機治具接線不等於已完成社群上傳。

實作先支援 glTF 2.0 的自含 GLB：作者匯入模型與獨立動作 GLB，選擇片段並對應六個核心用途，額外演出按需指定；同一片段可共用。獨立動作庫先限可驗證相容的骨架，不能把任意不同骨架的片段直接宣稱可套用。FBX 等轉換及任意骨架的動作重定向尚未列為已支援。

原始來源留在本機草稿／備份，遊戲套件只保留選用片段並固定素材版本。沿用現有 HeroProject 與 manifest.entries、雲端保存、不可變候選及後台審查；新模型不得藉上傳自行取得全域目錄核准。需要補齊格式／資源／動作對應檢查、草稿資產保存、封包資料通道、作者預覽、Main 重新驗證與後台審查的完整往返。

已確認目前 source ZIP 與 normalizeHeroSource 只接受七個圖示，現有身體模型 bytes 又必須來自可信出貨目錄；需擴充這兩處，不能只新增一顆上傳按鈕。Khronos glTF Validator 2.0.0-dev.3.10 對七位本機候選完成未截斷檢查，均為 0 errors／0 warnings；保留 UNUSED_OBJECT 資訊。獨立相容骨架 GLB 的片段合併原型通過，模型節點／幾何／骨架／原始 binary 與動畫目標／取樣值均保持一致；不同骨架拒絕。這只是 `lol-models/upload-prototype/` 的原型，未接入作者 UI／Main 上傳；格式通過不等於骨架可互換或效能驗收。

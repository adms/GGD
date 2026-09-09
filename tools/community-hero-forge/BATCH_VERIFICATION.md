# 社群英雄批次驗證（#1143）

用同一入口處理第一批或下一批，不把 37／222 寫死。輸入是既有 `index.json`、`handoff-manifest.json`、`projects/`、`recipes/`、`refinements/`；英雄身分、六槽、原文與 SHA 都從該批讀取。第二批尚未交付，不能宣稱它已通過。

```sh
# 一次完成原文／雜湊／编譯、已登記的行為測試，輸出所有失敗與逐槽缺口。
python3 tools/community-hero-forge/verify-authoring-batch.py \
  --batch-dir materials/community-hero-forge \
  --output /private/tmp/ggd-batch-check-01

# 完整發布前檢查：三閘一起啟動，另讀已在本機的模型封存，沒有 S3 操作。
python3 tools/community-hero-forge/verify-authoring-batch.py \
  --batch-dir materials/community-hero-forge \
  --release --jobs 3 \
  --release-root /private/tmp/ggd-model-upload-acceptance/release-13956d93b \
  --output /private/tmp/ggd-batch-release-01

# 同一輸入／程式版本續跑。只重用成功且日誌 SHA 完整的證據。
python3 tools/community-hero-forge/verify-authoring-batch.py \
  --batch-dir materials/community-hero-forge \
  --resume-from /private/tmp/ggd-batch-check-01 \
  --output /private/tmp/ggd-batch-check-02
```

`report.md` 是集中失敗與缺口清單；`report.json` 保留逐槽原文、requiredRefinement、適用測試、命令、退出碼、來源與日誌 SHA。每個步驟有獨立 `.log`，不用從最後 100 行猜原因。`skills:check` 若失敗，會自動展開其所有獨立子檢查，一次列齊，成功者可供同一版本續跑。逾時預設 600 秒，會終止整個程序群；可用 `--timeout` 調整。

退出碼：`1` 有輸入／測試／工具失敗；`2` 自動檢查通過但仍有技能槽未配行為測試；`0` 已登記自動檢查及逐槽測試覆蓋通過。**任何退出碼都不代表原設計、模型外觀／動作或正式發布完成。** 模型未提供 `--release-root` 時明列未核對位元組；有檔案、SHA 或編譯通過都不是視覺驗收。模型封存每次重新讀取，不用過期快取。

`validation-plan.json` 將一組既有測試檔對應到本批英雄／技能槽。它綁定 manifest SHA，來源更新後須重新核對對應，不能直接換 SHA 冒充案例仍適用。只收 repo 現有 `.test.ts`／`.test.tsx` 路徑，不接受任意命令。所有測試檔可合併成一個 suite，避免同一個測試反覆跑。

新批次可先不放 plan：腳本仍核對／編譯並列出全部未覆蓋槽。建立測試時，使用 `communityRecipeFixture`／`communityCombatFixture` 讀原始配方；批次執行器會設定 `GGD_HERO_BATCH_DIR`。只能在建立真實行為案例後，將对应 hero ID／slot 加進 plan。來源不同不得直接複製第一批的測試清單。發布閘仍測 repo 本身，不把批次環境變數誤傳給既有 Editor 回歸。

第一批 plan 目前對應 93 個已修正／部分修正槽，其餘仍有缺口。每槽 `originalDesignAcceptance` 保持未驗證，直到逐項 requiredRefinement 有足夠行為及畫面證據；它不是自動上架清單。

輸出必須是來源以外的新目錄。執行中如有人更改來源，整次證據標為失效，不拿它續跑。腳本不生成英雄、不修改原稿、不投稿、不發布、不操作正式帳號。

測試執行器本身：

```sh
python3 -m unittest discover -s tools/community-hero-forge -p test_verify_authoring_batch.py -v
```

武藤遊戲的陷阱另登記 `trap-view-and-transport` suite，一次檢查實際傳輸、Client 圖形生命週期及 Forge 回放。它使用 NullEngine，不等於已完成真實瀏覽器畫面驗收；仍需保留原稿素材與視覺缺口。

測試路徑限 `packages/shared/`、`apps/editor/`、`apps/client/`、`apps/game-server/`、`apps/content-api/` 中實際存在的 `.test.ts`／`.test.tsx`，不接受任意指令、來源外路徑或越界 symlink。新增 effect kind 後，除了能力契約也須用官方 `contract:numbers` 更新數字，所有程式變更完成後再執行 `decor:build`，避免過期文件使整批失敗。

柯南 E／EX 的 `motion-view-and-transport` suite 集中驗證實際狀態傳輸、Client 狀態圖形與預測暫停、Forge 回放；移動行為案例讀同一份版本化配方。滑板與牽引以實際模擬狀態驅動畫面，程序示意素材不代表專用原稿素材已完成。

## 瀏覽器位移畫面收集

`capture-motion-browser.mjs` 是指定英雄的 E 滑板／EX 牽引驗收設定，不適用所有技能。它從完整交接暫存選定英雄的原檔與模型，透過真正匯入介面開啟，避免重複驗證其他 36 名。輸出記錄完整來源 index SHA 與暫存 index SHA；不能把單英雄結果稱作整批通過。

```sh
node tools/community-hero-forge/capture-motion-browser.mjs \
  --handoff-dir /private/tmp/restored-handoff \
  --hero-index 26 \
  --origin http://127.0.0.1:5198 \
  --output /private/tmp/ggd-motion-capture-01
```

需另有可用的 Playwright 與 Chrome，以及同分支的本機 Editor／內容服務；可用 `--playwright-module /absolute/path/playwright/index.mjs` 指定既有模組。脚本不安裝依賴、不使用既有瀏覽器帳號，也不投稿或發布。建議使用正式建置的本機 preview，畫面收集期間不要重建服務。

它保留實際採用生成器後的草稿版本／原稿 SHA，等候雙方模型材質，逐張確認技能槽、時間及來自實際網格的位移狀態／座標，再收集加速、急轉、煞車、停止、撞牆、兩種牽引及清除共九張畫面。失敗時保留階段、文字及可取得的診斷畫面；失敗或未完的執行不可當作驗收通過。即使腳本通過，仍須查看圖片，判斷物件跟隨、顏色、遮擋與繩索端點；它不會自動裁決原稿美術。有效圖片依素材政策存 S3，Git 只留腳本、來源、SHA 與判讀結果。

這個瀏覽器設定目前仍未完成九張通過證據；冷載入與 PBR 光照就緒失敗見 [柯南修正紀錄](../../materials/community-hero-forge/refinements/conan-mobility-verification.json)。背景六槽初始驗證最多等三分鐘，模型就緒最多一分鐘；逾時仍失敗，不以替身通過。收據中的 checkout HEAD／dirty 狀態只識別執行腳本的程式樹，不能冒充本機服務部署版本證明。

`target-resource-acceptance` suite 同批檢查真實敵方事件取得資源、未取得／不足拒絕，以及 Editor 和可信投稿編譯器的六槽與整套情境一致性。它不直接建立目標資源，也不把試玩選项寫回英雄版本。既有實作 suite 額外固定包含阿薩謝爾重複詛咒反轉回歸；增加回歸檔不會自動擴大已對應的原稿槽數。

銀時六槽及共用格擋、施法中斷、hook 詞彙、形狀與純度回歸併入 `implemented-mechanisms` 同次執行。案例從版本化原稿／微調生成，包含自身招架來源、盾吸收命中、實際移動、受保護施法及跨區／免控反例。新增 effect kind 時，Editor 的完整表單回存、種類清單與預覽不可漏接；release 閘會一起檢查。

本批實際新增 effect／hook 時，另需更新 `tools/skill-spec/curated.json` 的中文詞彙來源，並依失敗清單執行 `spec:build`、`overview:build`、`skillforge:audit`、`skillremake:docs`、`atlas:build`、`docs:readme`。全部走 `bash scripts/genrun.sh <step> <step>:raw`；只更新型別／能力清單不足以保持這些相依文件新鮮。先讓批次完整結束、核對集中失敗，再生成與提交，最後重跑三閘；不可執行中改來源或偽造視覺收據。

SUN樂驗證使用共用 `communityActionFixture(number, rank)`：讀該批版本化原稿、產生編譯後在真正戰鬥世界操作，集中提供事件收集、擺位與有效資源讀取。`ready` 只供明確測試下一次施法，不可用來冒充正常冷卻連段。26 項實際行為、3 項試玩及來源授予／迴避／接近／前端拒絕回歸合併進同一 suite。單槽準備資源、全套未取得資源的拒絕及真實連段正例須分別保留，不能調高層數使煙霧測試看起來全過。

艾莉絲沿用共用治具與 `priorCast` 真實前置命中，集中驗證逐目標／逐來源交鋒、有限防禦、位移碰撞及超距拒絕。`allowApproach: false` 的技能要在扣費前直接拒絕；`dash.onHit` 要有首次合法接觸、牆後／背後／他人／死亡／跨區／替換及零方向反例。接觸測試保留現有友軍身體擠壓，不可為固定座標結果而關閉碰撞。25 項行為與3項試玩加進既有 suite，四項突變確認檢查確實攔截錯誤。

尼古貓貓六槽使用同一治具，移動必須送入 `orderSystem` 並確認位置改變；只寫 `nav.order` 不足以建立真實走路。停留蓄層每 tick 取樣，含冷卻內走動、轉向／撞牆、垂直位移、死亡／中場／換回合和不同英雄隔離。移動撤盾核對獨立池、同 tick 傷害前到期、替換錨點及其他盾不受影響。W 後實際等待再 EX 的試玩設為空資源，支付斷言觀察當下 tick，避免後續自然蓄層誤判。30 項行為、1 項試玩和共用護盾／hook／光環回歸併入同批；四项有效突變確認檢查能攔錯。

阿薩謝爾的當前來源以 `32.json` 為準，`azazelBatch.test.ts`／`azazelBatchAcceptance.test.ts` 直接讀這份配方。原 `azazel.test.ts` 是舊版本回放相容性，不能代替當前交接內容證據。批次入口與 `refine-azazel-handoff.mts` 同讀版本化 JSON，須比對所有作品位元組；兩者都不覆寫舊輸出。傷害輸出削弱／增益測實際固定傷害，不能只斷言 AD/AP 數值；反擊需實際受擊，不把一般出拳接成反彈或免傷。37＋3 項當前配方案例及距離／輸出／反彈回歸併入同次 suite。

不知火舞目前由 `03.json`、`mai.test.ts` 與 `maiAcceptance.test.ts` 提供 31＋3 項案例。整批仍使用相同入口，一併檢查每人一次接觸、自然位移結束、真正命中後連段、跨目標／波次施法去重和殘像不遞迴。Editor 可選 EX 作前置技能，真實解鎖並施放後保留狀態，不能直接填入同名 buff 冒充。技能彈與角色位移的地形規則分別依目前 GGD 契約驗證。

八神庵 E 的續段驗證登記在同一批次，包含三次獨立輸入、連按／晚按／中斷、首次成本與正常冷卻、真實 Editor 指令、伺服器快照編解碼、桌面／平板顯示及新伺服器讀取舊模板。模板來源更新時，需保留伺服器獨立認可的歷史版本，微調配方也要釘選原來源；不能因作品內附模板就認可未知 hash。新增模板欄位亦須分類 `shape_axes.json` 並執行官方 `shapes:build`；續段效果樹仍檢查未知欄位，獨立輸入不歸類為自動迴圈。

八神庵 v2 的其餘五槽沿用同一批次：測試治具從目前目錄自動登錄出貨投射物，避免下一批漏載依賴。R 後接 EX 有獨立真實前置施法案例，與會重設擺位／魔力的六槽煙霧測試分開；手動設定超距仍應拒絕。有限連段要同時驗「排下一段時」和「本段落地時」的目標與距離，並驗提早 EX、窗口過期、他人／其他目標、盾吸收、回合清除及單一分支扣费。

承太郎 v1 已加入同一批次驗證：時停需分別檢查施法／冷卻／DoT 等局部計時、投射物跨界、期限與對決倒數繼續、命中排隊、溢出、死亡／回合清除、重疊及解除時單次致死。伺服器快照、客戶端動畫／預測、Editor 真實前置施法與重播各有案例。畫面中的灰色邊界僅驗證範圍，不能替代副模型與原作演出驗收。

炭治郎 v2 納入同一批次驗證：呼吸是具名資源；實際防禦迴避與刀技命中形成破綻連動；Q 水火同成本且共用冷卻，火式以負擔交換傷害；調息需比較靜止／移動／HP或盾受擊；死亡、回合、到期及蓄勢中斷不可留下舊效果。18 項角色／匯入／Editor 案例對應六槽，無新增引擎機制。

跨批次結構比對工具 `compare-hero-batches.mts` 可讀第二批現有作品、編譯及行為報告，核對來源 hash，再以目前目錄重新編譯 74 名。`kit-diversity.mjs` 會將私有資源名稱正規化，避免改名假裝新組合；其四項測試以 `pnpm exec vitest run tools/community-hero-forge/kit-diversity.test.mjs --maxWorkers=1 --minWorkers=1` 獨立執行，不加入只接受產品測試路徑的 validation-plan。工具只診斷結構，**不宣稱已完成玩法因果、惡搞品質、素材畫面或正式驗證集准入**。本輪先完成炭治郎，跨批次剩餘工作待整理現況。

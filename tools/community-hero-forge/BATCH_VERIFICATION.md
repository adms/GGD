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

第一批 plan 目前對應 39 個已修正／部分修正槽，其餘仍有缺口。每槽 `originalDesignAcceptance` 保持未驗證，直到逐項 requiredRefinement 有足夠行為及畫面證據；它不是自動上架清單。

輸出必須是來源以外的新目錄。執行中如有人更改來源，整次證據標為失效，不拿它續跑。腳本不生成英雄、不修改原稿、不投稿、不發布、不操作正式帳號。

測試執行器本身：

```sh
python3 -m unittest discover -s tools/community-hero-forge -p test_verify_authoring_batch.py -v
```

武藤遊戲的陷阱另登記 `trap-view-and-transport` suite，一次檢查實際傳輸、Client 圖形生命週期及 Forge 回放。它使用 NullEngine，不等於已完成真實瀏覽器畫面驗收；仍需保留原稿素材與視覺缺口。

測試路徑限 `packages/shared/`、`apps/editor/`、`apps/client/`、`apps/game-server/` 中實際存在的 `.test.ts`／`.test.tsx`，不接受任意指令、來源外路徑或越界 symlink。新增 effect kind 後，除了能力契約也須用官方 `contract:numbers` 更新數字，所有程式變更完成後再執行 `decor:build`，避免過期文件使整批失敗。

柯南 E／EX 的 `motion-view-and-transport` suite 集中驗證實際狀態傳輸、Client 狀態圖形與預測暫停、Forge 回放；移動行為案例讀同一份版本化配方。滑板與牽引以實際模擬狀態驅動畫面，程序示意素材不代表專用原稿素材已完成。

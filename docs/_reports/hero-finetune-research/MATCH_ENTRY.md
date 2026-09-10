# 匯入後的隔離對局進入檢查

這是完整英雄驗收的一個必要步驟，**不是六槽機制完整性或可上場成品的總判定**。不使用 GPU、不修改教師或引擎、不修模型答案，也不發佈正式內容。

## 現有自動流程

`hero-distillation-action-handoff.py` 等待目前訓練程序完成並通過完整單輪及 adapter 重載閘；之後 `hero-distillation-action-workflow.py` 依序執行：

1. 凍結公開評測輸入，基底與 LoRA 使用相同資料及規則。
2. Base、LoRA 串行生成，無人工修補。
3. 逐名編譯、封裝、隔離 HTTP 匯入與 ZIP runtime 重讀比較。
4. `hero-distillation-match-batch.py` 對所有通過前置檢查的候選執行 headless 對局進入檢查。
5. 報告分開呈現 HeroPlan 組裝、JSON、匯入與對局進入結果；不得將它們合併宣稱機制正確。

全部英雄保留在原分母，只有兩組都沒有任何完整候選時才整段跳過 CPU 匯入。部分失敗不會阻止其他候選接受檢查，也不會從分母排除。對局批次每名最多一次、預設 180 秒（可調低，不能藉此工具提高），程序逾時會清理自身子程序群組。

## 對局入口做了什麼

`hero-distillation-match-entry.mts` 核對已保存 ZIP 的 SHA-256、成功匯入紀錄、英雄身分及固定 engine revision，從該 Git revision 建立隔離來源快照。它使用 ZIP 內的原始依賴和同版本 `generateHeroDraft` 重建 source documents，再走正式 `ContentLoader`（fail-closed）及 `registerAll`（模板失敗即 throw）。不以直接寫 registry 繞過內容載入閘。

接著使用遊戲伺服器的 `MatchController`：

- 六槽引用都須在登錄表可解析。
- 不存在的英雄必須被選角閘拒絕，而且不能修改座位選角狀態。
- 生成英雄必須能鎖定，並在正式 phase tick 推進後進入 combat。
- 座位實際生成的 champion entity 必須仍是指定英雄，不能被隨機備用英雄替代。

這條路使用正式 headless 控制器，但不包含 Colyseus 客戶端連線、畫面操作、六槽施放效果或跨槽正反行為測試。`fullHeroE2EProven` 與 `modelPromoted` 保持 false。

## 已驗證控制與修正原因

`match-entry-control-v2.json` 是既有已匯入作品 `community-review-16-20260907` 的真實 CPU 控制結果；不是本次 LoRA 的產物。固定 revision `2cdc3f902b4dbc0c45b2b49b4b74ed0436ff3d8b`；成功拒絕未知英雄、選角、生成正確實體，並經 12 個 tick 进入 combat。六槽引用皆存在。

`match-entry-control-v1.json` 保留初次失敗。當時測試錯把 `compiled` 內已解析的 item modifier 送回 authoring schema；tier 與已解析 value 同時存在而被拒絕。對照直接載入相同 pinned base content 成功，因此**不能將這次失敗歸咎於教師物品資料**。v2 改用 ZIP authoring 依賴與正式生成器；没有刪欄位、改物品或放寬 schema。

## 重跑

從研究 repository root 使用已安裝的 Node/tsx 與 Python；以下大寫參數須替換為實際路徑。`E2E_DIRECTORY` 必須含完成的 action E2E 收據；不接受把未匯入 JSON 冒充可用 ZIP。輸出目錄必須不存在。

```sh
python3 tools/editor-acceptance/hero-distillation-match-batch.py \
  --e2e E2E_DIRECTORY --out NEW_MATCH_DIRECTORY \
  --source-repo PINNED_SOURCE_REPOSITORY \
  --game-dependencies GAME_SERVER_NODE_MODULES \
  --shared-dependencies SHARED_NODE_MODULES \
  --node-binary NODE_EXECUTABLE --seconds-per-hero 180
```

下列測試不啟動模型，也不開正式服務：

```sh
node --import tsx --test tools/editor-acceptance/hero-distillation-match-entry.test.mts
python3 tools/editor-acceptance/hero-distillation-match-batch.test.py
python3 tools/editor-acceptance/hero-distillation-action-workflow.test.py
python3 tools/editor-acceptance/hero-distillation-action-report.test.py
```

批次測試使用程序替身驗證分母、hash、失敗不重試與串接；不能以這些單元測試代替真實對局控制。真實單名控制證據另存於上述 v2 收據。模型的批次對局結果，須等目前訓練及生成流程實際完成後才能取得。

# 來源匯入與外部核可

這是計畫 §7／§8／§12.1 的資料入口，尚不是完整產品的資料審查 UI。它不啟動訓練、不修改凍結 run、不把 repo JSON 數量當成 Gold，也不自動產生人類核可。

## 操作

```sh
node tools/forge-training/intake.mjs /absolute/bundle.json /absolute/policy.json /absolute/new-output
```

輸出目錄必須不存在。artifact 必須在 bundle 目錄內，不能透過相對路徑或 symlink 逃出；單一 JSON artifact 上限 2 MiB、Owner 原文 20,000 字元、每筆證據最多 20 份、一次最多 2,000 筆。近似去重與 engine 子程序各自限時 60 秒，超限停止，不靜默跳過。

第一遍通常沒有 approvedReviews，因此只產生待審摘要；將輸出交給真正的核可者確認原文、需求規格、target、來源授權及用途。核可者提供受信任的 registry 後，用新目錄重新匯入。工具不替人核可，也不為了讓測試變綠替真實資料填 review。

## 輸入契約

bundle：`schema: ggd-forge-source-bundle@1` 與 `records[]`。每筆使用計畫 envelope：

- `schema: ggd-forge-training-example@1`、`id`、`task: fill-slot`。
- `familyId`、`lineageRootId`、`split: train|dev|test`；可加 `heroId`、`archetypeId` 作隔離群組。
- `source.ownerText` 原文、`ownerTextSha256`、`revision`、`licenseRef`、`releaseCorpus`。原文不改寫，模型只見去掉完整台詞的 mechanicsText。
- `pins`：engineCommit、capabilityDigest、catalogDigest、contractDigest。
- `requestArtifact`、`targetArtifact`、`expectationArtifact`、`evidenceRefs[]`：bundle 內相對 JSON 路徑。

request artifact 只允許 `ownerText` 與 `context`，原文必須與來源一致。context 只允許 templateId、vfxKeys、allowedVfxFields、legalFallbackIds。模型訊息由現行固定 SYSTEM 重建；不允許輸入任意 system prompt、Gold 標籤、scorer 診斷或 test 答案範例。

目前可執行驗證器只支援 `ground-nova-research@1` 六欄位 IR（見 README），expectation 使用 scorer 的獨立 spec 形狀。其他家族不能宣稱已支援；必須先接入對應 validator。Silver 自動晉級、視覺語意 Gold、樣本權重與通用英雄 JSON 匯出尚未實作。

policy：`schema: ggd-forge-intake-policy@1`、`contract: ground-nova-research@1`、engineSnapshot 相對路徑、同一 pins、vfxKeys、vfxFields，以及：

- `allowedLicenseRefs`：受信任的來源授權清單。
- `splitAssignments`：事先固定的 `{lineageRootId,split}`，同 root 不能出現兩次。不是匯入後任意重抽 split。
- `blockedLineageRoots`、`blockedOwnerHashes`：已知 release／回歸／已看過測試的排除登錄。操作者須維護完整來源清單；工具無法從一個 `releaseCorpus:false` 證明未知改寫的來源。
- `nearDuplicateThreshold`：0.8～1，預設 0.9；跨 split 以家族、lineage、hero、archetype、精確機制文本、忽略數字的規格結構及文字 trigram Jaccard 檢查，兩側一起隔離。近似規則可能誤擋，也無法證明沒有語意改寫洩漏。
- `approvedReviews`：`{contentDigest,status:'human-confirmed',reviewerRef,reviewedAt,evidenceRef}`。digest 從待審資料取得，綁定整份原文、request、target、expectation、pins、證據、家族及 split。

**信任邊界：policy／review registry 必須由可信的操作者提供。** 工具驗證紀錄綁定與實際引擎結果，不驗證 reviewer 的真實身分、授權所有權或某個人是否真的閱讀過。不能自行造一份 registry，再把通過稱為人類核可。record 自帶的 qualityTier／review 宣告不具晉級效力。

## 匯出與隔離

先驗證來源與隔離，再看外部核可，最後對合格候選實際執行目前的 schema／compiler／SimWorld；任何一步失敗都不得作正確訓練答案。有 artifact 載入錯誤時暫停整包晉級，避免丟掉錯誤記錄後漏查跨 split。

- `source-ledger.private.json`：原文、來源、摘要、原始證據、判決。
- `review-queue.json`：Pending／Rejected、缺件、變更後待重審 digest。
- `train.jsonl`：只有已核可且驗證過的 train input／target；零合格資料時為空檔，report 為 `no-approved-training-data`，不得送進訓練。
- `dev/test-requests.json`：只含公開輸入；`dev/test-targets.private.json` 另存 target／expectation。
- `intake-report.json`、`engine-input.json`、`engine-results.json`：逐階段收據。

目前沒有匯入檢索範例，因此沒有跨 split retrieval；後續索引只可使用已匯出的 train。private 命名及檔案分離不是 OS sandbox，尚未建立獨立教師權限隔離。

目前匯出能對接 MLX worker 的 JSONL 形狀，但尚未接入原凍結實驗 CLI 的外部 dataset 分支。不要替換原 run 的 train.jsonl 繞過 hash；下一輪需新 run、policy、source family holdout 與明確授權。

## 已跑 smoke

`intake-example.mjs EXISTING_RESEARCH_RUN NEW_FIXTURE_DIRECTORY` 只產生明確標為 synthetic fixture 的例子，沒有任何真實 review。

2026-09-06 收據在 `outputs/forge-intake-smoke-20260906/`：4 筆，Pending 1、Rejected 3、Gold 0、train 0。兩筆跨 split 同源、另一筆 release 來源都被隔離；偽造 record 層 human-confirmed 宣告不能通過。薄單元守衛也確認摘要變更失效、engine 失敗不能晉級、路徑逃逸拒絕。單元中的正向核可紀錄明確是 TEST-ONLY，不是研究資料的人工核可證據。

# Hero74 訓練後同題生成對照輸入 v1

2026-09-09。這是 CPU 資料準備，**不是已跑推論、不是新模型分數、也不是權限隔離已驗收**。不啟動 GPU，不影響正在執行的 v19 訓練。

## 固定範圍

由 `../hero74-training-v3` 的全部 119 筆 internal-dev 原樣衍生，沒有再抽一小批，也沒有新增英雄。17 個完整英雄是主要創建成功率分母；102 個单槽只作輔助診斷，不可以六槽分數或 JSON 通過率充當完整英雄成功率。

- `public-cases.jsonl`：case metadata 與原本 system/user 兩則訊息。未變更 prompt；未放 assistant 答案、teacher hash 或 teacher metadata。推論只可使用每例的 `messages`。
- `private-teachers.jsonl`：保留教師答案原始 bytes、來源／目標 hash，僅供離線評分，不得提供推論 worker 或 RAG。既有來源不足以確認歷史 Codex 型號、effort、工具預算，寫 `unknown`，不自行補造。
- `plan.json`：同題 base／固定單輪最終 LoRA／既有 Codex 教師三組的比較規範與必要證據。各組不是各自重新選提示。
- `manifest.json`：來源 manifest、builder 與產物逐檔 hash。

此版本只凍結評測輸入、單位與邊界。`execution.enabled=false`；尚缺實際 final adapter hash、推論 runner／解碼／算術政策／scorer 的固定版本與完整對局驗證接線。`teacherFileAvailableToGenerationWorker=false` 是必須遵守的執行規範，不是本 script 已對未建立的 worker 做過檔案權限驗證。

## 不可誤用的成功定義

完整英雄需同時有設定／出身／屬性、六槽機制及跨槽資源／友敵／時序、格式與編譯、必要素材綁定、保存重讀匯入、隔離遊戲選取與實際行為證據，且零人工補填／補機制。缺測不准當通過，拒絕不算創建成功，VFX 不抵銷機制錯誤，CE 下降不等於可上場。

不要求逐字抄寫教師 JSON；等效方案需有行為證據。這 17 名的 95% 門檻實際要求 17/17（16/17 僅 94.12%），但即使全過仍只是已曝光 internal-dev，不足以宣稱未見需求高機率泛化；最終仍需要使用者另外提供的新英雄需求。

## 重現

```sh
HERO74_FROZEN=docs/_reports/hero-finetune-research/hero74-training-v3 \
node --test tools/editor-acceptance/hero-distillation-eval-plan.test.mjs

node tools/editor-acceptance/hero-distillation-eval-plan.mjs \
  docs/_reports/hero-finetune-research/hero74-training-v3 /private/tmp/hero74-new-eval-plan
```

新輸出目錄必須不存在；腳本拒絕覆寫、來源漂移、分組洩漏、重複 case、身分／槽位／輸出契約矛盾。3/3 測試包含真實 119 筆完整覆蓋與教師／提示 byte 比對，並驗證不從教師補出 prompt。這些測試不代替遊戲行為或生成評分。

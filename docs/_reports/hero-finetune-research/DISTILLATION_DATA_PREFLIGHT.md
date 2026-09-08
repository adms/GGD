# Codex → 12B：教師配對與 CPU 長度預檢

日期：2026-09-09。這是新版目標的資料準備實作，不是新模型訓練結果。

## 本輪已完成

- 可重跑的配對程式、12 項 Node 測試與 4 項 tokenizer 單元測試。
- 固定版本讀取 71 筆 shipping 英雄紀錄＋37 份社群 HeroProject，保留完整英雄與六槽任務。71 筆包含變身紀錄，不等於 71 名獨立英雄；48 筆 legacy 不混入。
- 576 個輸入 pin、4 份資料輸出的 hash 與序列化重建比對通過。資料直接由既有成品抽取，沒有新造英雄、重寫機制或改動原資料。
- 共用能力目錄按教師使用的兩個引擎版本讀取，未從答案挑選目錄；移除 `usedBy`、英雄範例與採用數，避免答案線索。
- CPU 本地 tokenizer 預檢，沒有載入模型權重、GPU 訓練、模型推論、雲端操作或 S3 寫入。

## 實際清冊

| 階段 | 完整英雄候選 | 單槽候選 | 合計 |
| --- | ---: | ---: | ---: |
| 成品任務保留 | 108 | 648 | 756 |
| 找到獨立需求，尚未排下述三筆衝突 | 52 | 312 | 364 |
| 排除確認衝突後的配對候選 | 49 | 309 | 358 |

總計 398 個任務因需求不完整／缺少對應成品欄位／已知配對問題而未進入配對候選。這不是把全部成品判為錯誤：原始成品、來源及理由都保留，可在取得同版本既有需求後重跑。

`pairingEligible` 只代表需求與成品欄位可配對，**不代表機制品質或上場驗收通過**。正式 train/dev 尚未凍結，本版不輸出可被誤用的 train.jsonl，`trainingAdmitted` 維持 false。這不是重設「全庫須獨立人工 Gold」門檻；後續沿用既有採用證據、schema/compile 與版本相符的問題排除，不另造標註專案。

原始 Codex prompt 不可得，輸入標為 reconstructed-input。37 名以固定 sidecar 的 Owner 原文與 sourceDesign 逐字核對；既有英雄採用獨立 Owner 文字及先前的身分來源清冊，不把答案的 effects/template ID 反塞進輸入。已找到的獨立 Owner 槽來源為 90 筆。

## 三筆已排除問題

| 英雄／槽 | 配對問題 | 處理 |
| --- | --- | --- |
| 武藤遊戲 E，r13 | 需求為陷阱抵消／反射；該固定成品仍明列未完成，配置為 self-buff＋shield | 排除此槽及該完整英雄正例，其餘槽保留候選 |
| 夜神月 Q | 較舊需求含 75% 生命代價，成品只有詛咒且新版描述不含此要求 | 排除版本不相符的配對，不逕稱新版遊戲設計錯誤 |
| 初號機 Q | 較舊來源明列主動指定；教師明列被動週期吞噬 | script 偵測明確標籤衝突後排除此配對 |

前兩筆排除理由在 [固定排除檔](../../../tools/editor-acceptance/hero-distillation-exclusions.json)，第三筆由程式產生。排除綁定教師 hash；換版不能靜默沿用舊排除。其餘候選並未因此被自動視為語意正確。社群舊「待補」文字只保留為線索，不批次套用為新版錯誤結論。

## 長度實測與對正式流程的影響

模型 tokenizer：本機 `gemma-4-12B-it-8bit`，使用與既有推論一致的 no-thinking 模板、完整終止 token、completion 邊界檢查，零截斷。

不含目錄的初步測量：52 個完整配對候選為 3,261～6,208 tokens，p95 5,248。這是下限，不是正式訓練成本。舊 1,536 上限連完整英雄本身都容不下。

加入同版本完整共用機制目錄後，排除三筆衝突的 358 個候選：

| 項目 | 數值 |
| --- | ---: |
| 完整英雄序列最短／p50／p95／最長 | 64,804／65,156／66,544／67,504 tokens |
| 單槽序列最短／p50／p95／最長 | 62,293／62,533／63,170／64,052 tokens |
| 全部配對候選總 token | 22,549,251 |
| 其中輸出 token | 300,229 |
| 超過 32,768 的候選 | 358／358 |
| 本次 CPU 預檢耗時 | 57.882 秒 |

**主要長度成本是反覆塞入整份目錄，不是完整英雄輸出。** 全量目錄不應直接套用舊訓練器：既有 loss 路徑會建立全序列 vocab logits，僅此預檢不足以保證 128GB 能安全承受。沒有量過正式步速與記憶體，不能把 57.882 秒當成訓練時間。

下一步的必要介接是「精簡全目錄索引＋按 ID 讀取需要的參數契約」，保留 schema/能力驗證對完整契約的存取；實際推論的查詢須來自需求或模型選擇，不能偷用教師答案。要先驗證縮短後的實際完整序列，再固定一輪 LoRA 設定、資源與時間上限。不得直接截掉需求／六槽／輸出，或因為單槽容易就取消完整英雄任務。

## 尚未完成，不能誤讀

- `hero-plan` 與 `native-content` 兩類教師格式仍需共用的生成輸出／編輯器介接；本輪 projection 不是已可上場的 HeroProject。
- 特效美術參數不作模型目標，必要預設與模型動作綁定要由後續 script 回填並驗證；未證明這個介接已完成。
- 尚未完成本版全部教師的 schema/compile 篩選、既有缺口排除、近重複群組與 train/dev 凍結。
- 來源分類 555 題等輔助資料未混入主生成候選，未遺漏為「不存在」，也未以它們灌大完整英雄數。
- 新英雄批次未收到，沒有新批教師、base／LoRA 比較或泛化結論。準備與候選訓練不必等待該批。
- GPU 新訓練尚未啟動；目前仍無達標的全自動上場模型。

## 重跑

在本 Git 倉庫根目錄執行；輸出位置必須不存在。`--workspace` 可改成還原後工作區路徑，`--source-repo` 須能讀到固定 Git objects 及 material manifest。

```sh
node --test tools/editor-acceptance/hero-distillation-pairs.test.mjs
python -m unittest discover -s tools/editor-acceptance -p test_hero_distillation_tokens.py
node tools/editor-acceptance/hero-distillation-pairs.mjs build \
  --workspace "/path/to/ABxVFX_EDIT" \
  --source-repo "/path/to/GGD-community-hero-forge-s3" \
  --source-commit 35df16f231861d7b22447c4aa29a6e7d68d77639 \
  --decisions tools/editor-acceptance/hero-distillation-exclusions.json \
  --out /path/to/new-pairs
python tools/editor-acceptance/hero-distillation-tokens.py \
  --pairs /path/to/new-pairs \
  --model /path/to/gemma-4-12B-it-8bit --catalogs \
  --out /path/to/new-pairs/token-preflight.json
```

測量用 Python 為既有本機 venv，需 transformers tokenizer；全程 local_files_only，不取得模型或新憑證。完整 [manifest](distillation-pairs-v1/manifest.json)、[逐例配對](distillation-pairs-v1/examples.json)、[教師成品](distillation-pairs-v1/artifacts.json)、[逐例長度](distillation-pairs-v1/token-preflight.json) 均保留。這些 JSON 不含模型二進位，權重／模型素材仍走既有 S3 策略。

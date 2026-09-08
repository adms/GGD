# 結構化解碼：固定四名英雄／基底與原 24 步 LoRA

這次沒有新增訓練。目的為拆開輸出格式與英雄原文／機制問題，不能將工程改善歸因微調學得更好。

| 指標 | 基底歷史 | 基底受限解碼 | 24 步歷史 | 24 步受限解碼 |
|---|---:|---:|---:|---:|
| JSON 合法 /4 | 4 | 4 | 4 | 4 |
| IR／來源檢查 /4 | 2 | 2 | 2 | 2 |
| 可編譯 /4 | 2 | 2 | 2 | 2 |
| 純結構 schema /4（事後拆分） | 4 | 4 | 3 | 4 |
| 局部行為 | 7/7 | 6/7 | 7/7 | 6/7 |
| 來源反例 | 0/3 | 1/3 | 0/3 | 1/3 |

四名皆为已曝光開發案例；既存對照為原始答案重評，不是本輪新生成。所有新舊輸出使用同一套釘選引擎、來源、scorer。
局部行為及反例僅涵蓋可編譯案例；未執行不是通過，不能以變動下游分母冒充完整英雄正確率。完整來源涵蓋與獨立留出仍未建立，合格英雄數維持 0，這不是人口準確率估計。

## 執行與相容性

- v1 基底完成四例；adapter 通用載入 API 在開始生成前失敗，原因為相對 self_attn 路徑不相容。不是模型答錯；原紀錄未刪除或改寫。
- v2 使用原訓練的 adapter_utils 線性層轉換，八個 key、319488 參數及每個已載入張量均與既存 checkpoint 完全一致；重新生成兩組。
- 舊研究卡中的 mlx_vlm.load(..., adapter_path=...) 範例對這個相對 key 格式不適用。移機後須使用本輪已驗的載入流程；歷史卡保留並以本段勘誤，不代表可部署。
- 原 oneOf 不受解碼器支援；只有程式證明必填 op 各不相同的 19 分支才等價轉為 anyOf。未放寬原驗證器；結構合法但來源造假的負例仍被原語義檢查拒絕。
- v2 兩組監督執行 275.13 秒；峰值 Metal 12.81 GiB。
- 含 v1 失敗的監督時間 425.76 秒；首輪啟動到 v2 結束（含相容修正）527.24 秒。不是訓練耗時。
- 共 212 次資源快照；各段接電 True，最低電池 100%，最大單段新增 swap 0 bytes。
- v1／v2 基底完整輸出逐字相同：4/4。worker 已退出，鎖未佔用：True。

生成時間與 token 數另記 summary.json。受限解碼改變空白格式與生成路徑；較短或較快不能歸因基底更快、微調更好，歷史與本輪亦非同時的效能 benchmark。

## 逐例新輸出

| 組別 | 英雄 | JSON | IR／來源 | 編譯 | 主要失敗 |
|---|---|---|---|---|---|
| base | community7-warwick | True | True | True | 局部可執行，不代表全英雄驗收 |
| base | community7-leesin | True | True | True | 來源反例未通過，見 cases.json |
| base | community7-missfortune | True | False | False | Error: TARGETED_DELIVERY_REQUIRED |
| base | community37-32 | True | False | False | Error: ACTION_DELIVERY |
| lora24 | community7-warwick | True | True | True | 局部可執行，不代表全英雄驗收 |
| lora24 | community7-leesin | True | True | True | 來源反例未通過，見 cases.json |
| lora24 | community7-missfortune | True | False | False | Error: TARGETED_DELIVERY_REQUIRED |
| lora24 | community37-32 | True | False | False | Error: ACTION_DELIVERY |

## 下一次微調決策

只根據固定原文與完整機制標籤定位真正模型錯誤。不得將 grammar 能解決的包裝錯誤當成追加訓練理由，也不將格式合格的機制錯誤當成模型成功。
仍遵守不扩資料、不修配方／引擎，問題樣本排除；不盲目增加 step 或用分類 loss 挑模型。缺乏可用完整英雄監督與独立留出時，95% 全自動目標不可宣稱完成。
未新增二進位權重，無本輪 S3 上傳；原始 12B 基底與 adapter 沿用既有封存。新脚本、原始輸出、失敗紀錄與報告直接進 Git，不公開推送。

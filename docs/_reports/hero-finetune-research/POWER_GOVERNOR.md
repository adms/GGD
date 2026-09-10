# 可複用的訓練電量控制與完整狀態續跑

## 預設行為

設定來源是 `power-governor-policy-20-30-70.json`；不要把數值寫死在專案的訓練迴圈。

| 參數 | 預設 | 意義 |
| --- | --- | --- |
| `hardStopPercent` | 20 | **低於**此值終止；不是可自動重試的充電暫停 |
| `pauseBelowPercent` | 30 | 運行中低於此值，在安全邊界存檔、退出 GPU worker |
| `fullSpeedResumePercent` | 70 | 初次啟動或充電暫停後，達此值才能啟動 GPU worker |
| `sampleIntervalSeconds` | 180 | 電量、AC、可用記憶體與 swap 的採樣間隔，秒 |
| `lowPowerMode` | `pause` | `pause` 或 `throttle`；預設以釋放 GPU 促進充電 |
| `throttleSeconds` | 0 | 選 `throttle` 時，每個安全邊界的休息秒數，必須大於 0 |
| `throttleDecliningSamples` | 2 | GGD 整合端看到連續下降達此採樣次數，將節流升級為存檔暫停 |

這是有遲滯的政策：**已經在跑的工作，70% 降到 30% 仍繼續跑；已暫停的工作，30% 升到 69% 仍等待。** 不在門檻附近頻繁開關。初次啟動若只有 48%，不先佔 GPU，等到 70%。電量剛好 20% 尚未低於硬底線，但保持暫停。

拔掉 AC、讀不到有效電量、低於硬底線、STOP、記憶體違規或超時是終止事件，不會自動重試。電量狀態最多有一個採樣間隔的延遲，不能保證恰好在跨過門檻的瞬間反應。30% 的軟暫停門檻是預留完成當前步驟與存檔的緩衝，不是保證機器永不斷電。

`throttle` 是在步驟間休息，**不是控制 Apple GPU 時脈或限制瓦數**，也不能保證接電後一定回充。預設 `pause` 更容易確實降低本實驗負載。其他應用仍可能耗電；腳本不會更改全機電源設定。

## 實作與續跑協定

可複用模組位於 `tools/editor-acceptance/`：

- `training_power_governor.py`：不依賴 ML 框架的政策驗證與純函式 `decide(policy, sample, mode)`，也提供 JSON 輸入的 CLI。
- `training_runtime_checkpoint.py`：由呼叫端提供 tensor codec 的完整狀態封裝；另提供本次 MLX 亂數鍵的 capture/restore。
- `hero-distillation-train.py`：GGD 的 supervisor、AC/電量感測與訓練迴圈整合範例；不是任意外部命令的通用暫停器。
- `training_power_verify.py`：一個命令執行 CPU 測試，選用 `--mlx` 增加小型真實 GPU 跨程序續跑測試。

Supervisor 每 180 秒更新一次共享 `resource-sample.json`；worker 讀同一份樣本，不另外高頻詢問電池。Supervisor 每 2 秒檢查程序、STOP、既定期限，這不是每 2 秒採樣電池。

正常充電循環：supervisor 寫 `checkpoint-pause` → worker 完成當前不可中斷的步驟 → 存完整 runtime checkpoint → 寫入帶 worker PID 的收據 → 以保留代碼 75 退出 → supervisor 確認退出後等待充電 → 到恢復門檻才建立下一個 worker，載入同一實驗的狀態。整段流程保留單 worker 鎖，不允許兩個 GPU worker 同時執行。

完整狀態包含：

- LoRA 權重、Adam optimizer state（包含更新步數與動量）。
- Python random state、MLX random key。
- 固定資料次序、下一步、已完成逐步 trace 與 adapter checkpoint 索引。
- 訓練階段，以及已完成的 dev-before / dev-after 結果；充電後不用重做已完成的驗證樣本。
- manifest digest 與 MLX / MLX-VLM / Transformers 版本，綁定資料、基底模型、配方、程式與環境。

Tensor 與 JSON 先寫入獨立 `.pending` 目錄，fsync 後才原子發布；載入時檢查收據、檔案 SHA-256 及契約。不用 pickle。這是完整性檢查，非對惡意來源的數位簽章。

MLX optimizer 的 constructor 設定仍必須一致；本專案以 manifest 與框架版本釘住設定。其他專案若有 scheduler、gradient accumulation、AMP scaler、NumPy RNG 或資料載入器游標，也必須自行納入 payload 與 contract，不能只存權重就宣稱等價續跑。

參考：[MLX optimizer state 文件](https://ml-explore.github.io/mlx/build/html/python/optimizers.html)、[MLX 0.32.2 Python random 實作](https://github.com/ml-explore/mlx/blob/v0.32.2/python/src/random.cpp)、[random key 實作](https://github.com/ml-explore/mlx/blob/v0.32.2/mlx/random.cpp)。本次 restore 不直接覆寫 `mx.random.state` sentinel，而是還原 key，並以跨程序隨機梯度實驗驗證。

## 本專案執行方式

先複製政策 JSON 到自己的設定位置，改門檻或間隔；政策必須滿足 `0 <= hardStopPercent < pauseBelowPercent < fullSpeedResumePercent <= 100`。GGD 的硬底線還必須符合已授權的 battery authorization，不能單靠改 policy 擴張授權。

以下大寫路徑都是需替換的參數，不是現存檔案。從 repository root 執行；`python3` 應是已安裝專案 MLX 相依套件的環境：

```sh
python3 tools/editor-acceptance/hero-distillation-train.py prepare \
  --data FROZEN_DATA_DIRECTORY \
  --base-receipt BASE_MODEL_RECEIPT.json \
  --out NEW_RUN_DIRECTORY \
  --battery-authorization docs/_reports/hero-finetune-research/battery-floor-20-authorization.json \
  --power-policy docs/_reports/hero-finetune-research/power-governor-policy-20-30-70.json \
  --time-authorization MATCHING_TIME_AUTHORIZATION.json

python3 tools/editor-acceptance/hero-distillation-train.py probe --run NEW_RUN_DIRECTORY
python3 tools/editor-acceptance/hero-distillation-train.py train --run NEW_RUN_DIRECTORY
```

`prepare` 固定政策與 helper hashes，並保存來源快照。probe 沿用原本的短時資源檢查；通過才可 train。不要改已經開始的 manifest，也不要覆寫舊 run。時間授權必須符合該資料／訓練配方，並非任意舊授權都可套用。

充電等待、重載和計算共用**同一個原始 wall-clock 期限**。例如配方授權 16 小時，等待充電不會另加 16 小時；抵達期限會終止而保留已寫入的 checkpoint。`--resume-checkpoint` 是 supervisor 管理的內部參數，不是繞過鎖與 run admission 的外部重試入口。

## 其他專案如何複用

若只要電量決策，可複製 `training_power_governor.py` 及政策 JSON；由該專案取得電量樣本，例如 `{"acPower": true, "batteryPercent": 29}`：

```sh
python3 training_power_governor.py --policy policy.json --sample sample.json --mode full-speed
```

CLI 只輸出決策，**不會**自行停止任何程序。呼叫端必須記住 `nextMode`、按採樣間隔更新資料，並依照 action 實作程序管理。

需要可恢復訓練時，再複用 `training_runtime_checkpoint.py`，在自己的訓練安全邊界呼叫 `save()`；退出後由外層等待充電，再啟動程序呼叫 `load()`。Framework-specific tensor 的存讀由 callback 傳入。其他框架需另外實作並驗證亂數與 optimizer 還原；MLX 的測試結果不能當成 PyTorch 等框架的驗證。

## 測試與目前限制

```sh
# 不載入模型、不使用 GPU
python3 tools/editor-acceptance/training_power_verify.py

# 加上 12 步的小型真實 MLX 測試；不載入 12B 模型
python3 tools/editor-acceptance/training_power_verify.py --mlx

# 保存包含原始 stdout/stderr 與程式 hash 的收據；拒絕覆寫既有檔案
python3 tools/editor-acceptance/training_power_verify.py --report NEW_VERIFICATION.json
```

證據檔：`power-governor-verification.json`（CPU 政策、完整狀態封裝、supervisor 模擬、既有 trainer 及狀態工具測試）與 `power-checkpoint-mlx-parity.json`（真實小型 MLX 跨程序測試）。MLX 實驗比較連續 12 步和三段各 4 步、兩次退出重載；要求權重、Adam、亂數、次序與逐步結果完全一致。

**尚未證明完整 Gemma 12B 訓練的充電暫停／恢復等價性，也未因此提升模型品質判定。** Supervisor 的充電轉移測試使用可控感測／程序替身，MLX 實驗則使用真實獨立程序與小 tensor。完整模型仍需另外的有界端到端驗證。

目前自動恢復限於同一 supervisor 存活期間的正常充電暫停。主機重開、supervisor 崩潰、硬底線終止或非預期錯誤後，不會無限自動重啟。已存完整 checkpoint 可供後续明確的 recovery 流程使用，但該跨 supervisor recovery 入口尚未實作。舊的 adapter-only checkpoint 不能補回遺失的 Adam / RNG 狀態，不能當成無損續跑點。

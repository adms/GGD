# 固定資料低學習率對照

狀態：completed-experiment-not-promoted
決策：rejected-regression

固定 24 步，只將 learning rate 2e-5 降至 5e-6。基底、資料、順序、seed、LoRA、prompt 與評分器不變。
既有 12 名訓練／4 名開發英雄；14 份已知有問題的完整 IR5 配方仍全數排除。
只使用預定第 24 步，不修答案、不依開發表現挑 checkpoint。這是已曝光小樣本對照，不是盲測。

| 指標 | 基底 | 原 24 步 | 低學習率 24 步 |
|---|---:|---:|---:|
| 訓練來源判斷 /72 | 48 | 66 | 71 |
| 開發來源判斷 /24 | 23 | 24 | 18 |
| 開發嚴格契約 /4 | 3 | 3 | 3 |
| 開發錯誤支持 | 0 | 0 | 0 |
| 生成可編譯 /4，非完整驗收 | 2 | 2 | 2 |
| 局部行為通過數 | 7 | 7 | 7 |
| 反例通過數 | 0 | 0 | 0 |

訓練 29.46 秒；峰值 Metal 18.23 GiB。
全流程 347.31 秒。

逐案例退步／改善：
{
  "outcome": "rejected-regression",
  "regressions": [
    "facts:facts-community37-06:jsonValid",
    "facts:facts-community37-06:verdictCorrect"
  ],
  "improvements": [],
  "modelPromoted": false,
  "releaseQualified": false,
  "freshBlind": false,
  "wholeHeroQualityEstablished": false
}

完整英雄資格尚未建立；未部署、不啟用 Editor。loss 或訓練題改善不算主要結果改善。
模型與原始答案全部保留；沒有新增資料或標籤，没有修配方或引擎。

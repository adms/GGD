# J-Stars 原生角色 009 容器分析

這個工作流只驗證 `parallel-ps-jstars-sample` 的三個 `$CMP` PAK，並保留 QuickBMS 嘗試的完整輸出與失敗收據。它不會把原生容器或部分 `STPK` 索引轉為 GLB，也不會登記後台模型選項。

以已驗證的輸入及 QuickBMS 0.12.0 執行：

```sh
python3 analyze.py \
  --source /absolute/intake/extracted/SAMPLE\ PAK\ FILES \
  --output /absolute/GGD-Asset-Library/conversions/jstars-009-20260911-v1 \
  --quickbms /absolute/quickbms \
  --script /absolute/cmp_scz.bms
```

驗收的唯一成功條件是每份 QuickBMS 輸出位元組數剛好等於其 `$CMP` 標頭的 `declaredDecodedBytes`。2026-09-11 的三份樣本均未通過：`i` 和 `v` 因 SIGBUS 中止；`m` 產生 405,220-byte `STPK`，但標頭宣告 671,808 bytes。`m` 的部分索引包含 `009_vegeta`、貼圖、表情、能力與 `jp_lps` 音訊容器名稱，因而可將原生 ID 009 暫記為貝吉達（Vegeta），但仍待完整解碼、模型／骨架／動作／音訊擷取與視覺驗收。

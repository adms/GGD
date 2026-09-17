# 枯星龍歷史模型減面候選 v1

輸入固定為 Git 歷史復原原件 `618a528…glb`，輸出為獨立候選，不覆蓋原件。一般位置減面在 7,997 triangles 時通過結構檢查，但明顯撕裂發光紋理；本流程鎖住取樣到高亮 emissive texel 的頂點，再把目標設為 7,900，實際輸出 7,996 triangles。

```bash
bash tools/model-budget/optimize/bootstrap-geometry.sh
node --import tsx tools/hero-model-library/source-workflows/palworld/historical-astralym-decimation-v1/generate_candidate.mts --out /absolute/path/astralym-decimated.glb
```

參數固定為 meshoptimizer 1.2.0、誤差 0.02、鎖定拓樸邊界、emissive RGB 任一通道大於等於 192 時鎖頂點。這個候選另啟用 `--sanitize-transparent-emissive-mattes`，只把 alpha 小於等於 5 且亮 RGB 大於 8 的隱藏色清成黑色；alpha 與所有可見像素不變。`generate_candidate.mts` 同時固定輸入／輸出 SHA；不同結果會停止。

視覺驗收使用既有 `render_historical_model.py`，對 `Idle`、`Walk`、`FarSkill_Action`、`HaloBeam_Loop`、`Damage` 各取 20% 時點，渲染前／後／等角三個視角。原始逐圖保留在本機轉換目錄，Git 保存三張完整 contact sheet、最差樣本的 source／candidate／放大差異並排圖，以及逐圖數值。5% 門檻與其他現行限制以 [`模型動作特效上架限制.md`](../../../../../materials/asset-library/模型動作特效上架限制.md) 為準。

`Damage` 同時用作 hurt 與經使用者授權的 death 淡出前動作；本流程沒有杜撰原生 Death clip。候選只作非預設選項，沒有 Main 合併或正式站部署證明。

完整來源、中間渲染與前一版 `f77cf1ee…glb` 共 91 檔已備份至授權的 `legacy/conversions/historical-astralym-decimation-v1/` S3 prefix。Git 保留 `s3-backup-receipt.json` 與 `s3-backup-manifest.json`；`integrate_source.py` 驗證這份前置備份，但不把它宣稱為新 `c45f111d…glb` 的備份。新候選在中央索引中明列 `pending-upload-and-readback-verification`，待後續 S3 上傳與讀回收據。

# Pokémon Trainer 男／女正式減面候選

此流程以 Git 內已驗收的 Worldblender c00/c01 靜態蒙皮 GLB 為輸入，使用專案固定 `meshoptimizer` worker 各建置兩次，保留材質、貼圖、骨架與蒙皮語意，再跑 Khronos、GGD model budget 和 Babylon 三視角 A/B。

```bash
ASSET_ROOT="/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library"
python3 tools/hero-model-library/source-workflows/ssbu-ptrainer-formal-decimation-v1/build_candidates.py --repo . --asset-root "$ASSET_ROOT" --write
python3 tools/hero-model-library/source-workflows/ssbu-ptrainer-formal-decimation-v1/compare_static_visuals.py --repo . --output-root "$ASSET_ROOT/conversions/ssbu-ptrainer-formal-decimation-v1" --accept
python3 tools/hero-model-library/source-workflows/ssbu-ptrainer-formal-decimation-v1/validate_preservation.py --repo . --output-root "$ASSET_ROOT/conversions/ssbu-ptrainer-formal-decimation-v1" --write
python3 tools/hero-model-library/source-workflows/ssbu-ptrainer-formal-decimation-v1/integrate_candidates.py --repo . --asset-root "$ASSET_ROOT" --write
```

`compare_static_visuals.py` 會用本機臨時 HTTP 埠啟動 headless Chrome。第二次及後續驗證可以加 `--reuse-existing-renders --accept`，但原始 PNG、Chrome log 和 render proof 仍全部保留在本機轉換目錄。

兩顆候選的原生與程序化動作都是 0；此批只完成正式採用幾何候選，不建立 `model@1`、不改既有手動預設、不註冊 runtime 下拉。新減面階段尚未上傳 S3；來源轉換的既有 S3 完整讀回收據分開保留，不能宣稱涵蓋本批新階段。

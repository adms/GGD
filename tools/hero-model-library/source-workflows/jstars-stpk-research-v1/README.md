# J-Stars `$CMP`／`STPK` 研究樣本工作流

本工作流處理 `zenhax-jstars-pak-stpk-comparison-v1`：公開研究帖提供的四名原生角色 PAK 與記憶體解壓 STPK 對照組。程式會逐檔驗證 SHA-256、解析 `$CMP` chunk 表、安全拆出 STPK 非空成員，並將每個輸入／輸出雜湊寫進 Git 證據。

輸出仍是 PS3 `SRD`／`SRDI`／`SRDV` 原生成員，不是 GLB。`$CLH` 內含尚未由現有 QuickBMS 腳本正確支援的 `$CH0` 階段；PS3 幾何配置及貼圖 swizzle 亦未由本機可執行轉換器驗證。因此本工作流只把狀態推進到「原生容器已安全拆分」，不會宣稱模型、貼圖、骨架、動作、特效或音訊已轉換，也不會登記後台選項。

```sh
python3 tools/hero-model-library/source-workflows/jstars-stpk-research-v1/inventory.py \
  --source ../GGD-Asset-Library/intake/public-models-20260914/zenhax-jstars-pak-stpk-comparison-v1 \
  --output ../GGD-Asset-Library/conversions/jstars-stpk-research-v1 \
  --git-evidence materials/hero-model-library/source-inventories/jstars-stpk-research-v1

python3 -m unittest tools/hero-model-library/source-workflows/jstars-stpk-research-v1/test_inventory.py
```

輸出目錄採拒絕覆寫。重建前應保留既有版本，改用新的 versioned output path。

完整整合順序如下。S3 指令只能使用 `AWS_PROFILE=vibe-coding`、`AWS_REGION=ap-east-2` 與唯一授權 bucket；`backup_intake.py` 會先驗證 assumed-role，並將整包下載讀回後逐成員重新驗證。

```sh
python3 tools/hero-model-library/backup_intake.py \
  --source ../GGD-Asset-Library/intake/public-models-20260914/zenhax-jstars-pak-stpk-comparison-v1 \
  --prefix legacy/public-model-sources/zenhax-jstars-pak-stpk-comparison-v1 \
  --output ../GGD-Asset-Library/backups/zenhax-jstars-pak-stpk-comparison-v1

python3 tools/hero-model-library/backup_intake.py \
  --source ../GGD-Asset-Library/conversions/jstars-stpk-research-v1 \
  --prefix legacy/conversion-stages/jstars-stpk-research-v1 \
  --output ../GGD-Asset-Library/backups/jstars-stpk-research-v1

python3 tools/hero-model-library/source-workflows/jstars-stpk-research-v1/register_source.py \
  --repo . --workspace .. \
  --intake ../GGD-Asset-Library/intake/public-models-20260914/zenhax-jstars-pak-stpk-comparison-v1 \
  --analysis materials/hero-model-library/source-inventories/jstars-stpk-research-v1/analysis.json

python3 tools/hero-model-library/source-workflows/jstars-stpk-research-v1/sync_backlog.py \
  --repo . --workspace ..
```

原生 ID 009 的早期樣本可另外執行 `diagnose_009.py`。公開 58 包 JUMP FORCE 音訊則由 `jumpforce-steam-streaming-audio-v1/reconcile_public_catalog.py` 以五份 S3 讀回索引核對；這兩項只修正證據狀態，不會建立未經聽審的事件綁定或模型選項。

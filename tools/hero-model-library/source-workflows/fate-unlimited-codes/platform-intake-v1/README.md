# Fate/unlimited codes 平台 intake v1

此流程把原作遊戲映像、PS2 公開音訊、Fate UC 社群 MOD 與 FateUBW Minecraft 儲備分開建檔。`platform-config.json` 是人工確認的來源對照；`source-index.json` 與 `source-index.md` 由 `build_source_index.py` 重建。

```bash
python3 tools/hero-model-library/source-workflows/fate-unlimited-codes/platform-intake-v1/build_source_index.py
python3 tools/hero-model-library/source-workflows/fate-unlimited-codes/platform-intake-v1/build_source_index.py --check
python3 -m unittest tools/hero-model-library/source-workflows/fate-unlimited-codes/platform-intake-v1/test_platform_intake.py
```

目前 LV99 清單中的日版 ZIP 與美版 ISO 都是 `inventory-metadata-only`：掃描只記檔名、路徑與大小，沒有讀映像內容，也沒有內容 SHA-256。取得唯讀實檔後，兩個版本須各用獨立的新目錄處理：

```bash
python3 tools/hero-model-library/source-workflows/fate-unlimited-codes/platform-intake-v1/extract_disc_payload.py '/read-only/Fate-Unlimited Codes Portable (Japan).zip'
python3 tools/hero-model-library/source-workflows/fate-unlimited-codes/platform-intake-v1/extract_disc_payload.py '/read-only/Fate-Unlimited Codes Portable (Japan).zip' --extract-to '/new/intake/fuc-psp-japan'
python3 tools/hero-model-library/source-workflows/fate-unlimited-codes/platform-intake-v1/extract_disc_payload.py '/read-only/Fate_Unlimited_Codes_USA_PSP-EMiNENT.iso' --extract-to '/new/intake/fuc-psp-usa'
```

工具只接受 ZIP／ISO，只讀來源，先拒絕絕對路徑、`..`、大小寫衝突與加密 ZIP，再解到不存在的目錄並逐檔計算 SHA-256。若發現 FPK，再用 `../first-batch/extract_fate_fpk.py` 建目錄或解包；這個 FPK／PRS 解析器目前只有合成測試，必須在真實 FUC 樣本上重新驗證。GMO／GIM 與音訊容器要依實際檔頭選轉換器，不能按副檔名直接宣稱可用。

PS2 Archer／Shirou／Saber 音訊已有本機實檔與索引，但只是公開擷取音訊，不代表 PS2 原作光碟已取得。FateUBW Minecraft 的 14 名英靈／127 個已轉換原生時長片段是另一個社群來源，保留獨立 source ID；它們目前是轉換儲備，未因這份索引而變成後台可切換或正式站已部署。

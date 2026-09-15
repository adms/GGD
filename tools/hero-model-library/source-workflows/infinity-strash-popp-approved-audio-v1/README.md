# Infinity Strash 波普已核准音訊轉換 v1

`build.py` 只接收統一素材審查中心中屬於 `b2-popp`／`PN020` 的 36 筆音訊候選，逐筆核對來源 WAV 的 bytes、SHA-256、單一原生事件與 owner 核准收據，再以固定 FFmpeg 參數轉為 48 kHz、mono、96 kbps MP3。相同來源內容只產生一份成品；36 筆候選目前對應 35 份不同內容。

核准收據的 `approvedBindings` 只包含 Infinity Strash 原生事件，且每筆都明列 `runtimeBindingAuthorized=false`。因此本流程產生 8 筆原生事件表與 36 筆逐候選 blocker，不把 GIRA／IO／IORA／BEGIRAMA 或腳步、蓄力事件猜成 GGD 的 Q／W／E／R／EX。取得、解碼、owner 聽審、遊戲格式轉換、原生事件表與 GGD runtime 註冊是分開狀態；本批 production deployment 維持 0。

重建：

```bash
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-approved-audio-v1/build.py
bash scripts/genrun.sh assets:manifest
python3 tools/hero-model-library/voice_index.py --workspace ..
python3 tools/hero-model-library/current_resource_index.py
```

若中央 `download-sources.json` 與 `public-source-files.json` 的既有其他來源暫時不一致，完整語音索引會拒絕重建；此時可用窄範圍 overlay 將本批證據疊到最後一份有效索引，且不清理或重排其他來源記錄：

```bash
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-approved-audio-v1/update_voice_index.py
```

檢查：

```bash
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-approved-audio-v1/build.py --check
```

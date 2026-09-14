# KOF XV Ash 音訊審查候選

`prepare.py` 從已驗證的 `XV_Ash` Float32 WAV 建立 86 個本機 MP3 審查候選。每一個來源 WAV 會用相同 FFmpeg 參數獨立編碼兩次；雜湊不同即失敗。輸出會完整解碼，並在 Git 保留來源與輸出 SHA-256 的 gzip JSONL 索引。

```sh
python3 tools/hero-model-library/source-workflows/kof-xv-ash-audio-review-v1/prepare.py \
  --repo . --workspace .. --write
python3 tools/hero-model-library/source-workflows/kof-xv-ash-audio-review-v1/prepare.py \
  --repo . --workspace .. --check
python3 -m unittest tools/hero-model-library/source-workflows/kof-xv-ash-audio-review-v1/test_prepare.py
```

來源目錄名稱只證明包級範圍為 `XV_Ash`；逐段語言、說話者、對白／喊聲／音效分類和技能事件仍是 `pending-confirmation`。產物是本機審查候選，沒有建立 runtime 綁定、後台下拉選項或部署宣稱。

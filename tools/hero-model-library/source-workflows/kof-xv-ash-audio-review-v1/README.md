# KOF XV Ash 音訊審查候選

`prepare.py` 從已驗證的 `XV_Ash` Float32 WAV 建立 86 個本機 MP3 審查候選。每一個來源 WAV 會用相同 FFmpeg 參數獨立編碼兩次；雜湊不同即失敗。輸出會完整解碼，並在 Git 保留來源與輸出 SHA-256 的 gzip JSONL 索引。

```sh
python3 tools/hero-model-library/source-workflows/kof-xv-ash-audio-review-v1/prepare.py \
  --repo . --workspace .. --write
python3 tools/hero-model-library/source-workflows/kof-xv-ash-audio-review-v1/prepare.py \
  --repo . --workspace .. --check
python3 tools/hero-model-library/source-workflows/kof-xv-ash-audio-review-v1/build_review.py
python3 tools/hero-model-library/source-workflows/kof-xv-ash-audio-review-v1/build_review.py --check
python3 -m unittest tools/hero-model-library/source-workflows/kof-xv-ash-audio-review-v1/test_prepare.py
python3 -m unittest tools/hero-model-library/source-workflows/kof-xv-ash-audio-review-v1/test_build_review.py
```

來源目錄名稱只證明包級範圍為 `XV_Ash`；逐段語言、說話者、對白／喊聲／音效分類和技能事件仍是 `pending-confirmation`。產物是本機審查候選，沒有建立 runtime 綁定、後台下拉選項或部署宣稱。

## 逐段聽審

`build_review.py` 只讀本流程的 `receipt.json` 與 `files.jsonl.gz`，逐段重新核對來源 WAV 與審查 MP3 的絕對路徑、大小與 SHA-256，然後產生：

- `materials/hero-model-library/review/kof-xv-ash-audio-review-v1/review-queue.json`
- `materials/hero-model-library/review/kof-xv-ash-audio-review-v1/review-decision.schema.json`
- `apps/client/public/kof-xv-ash-audio-review.html`

啟動既有 SHA allowlist 媒體伺服器時，明確傳入 Ash 佇列；伺服器只會提供這 86 個由佇列雜湊鎖定的 MP3，不能用本機路徑讀取其他檔案。

```sh
pnpm --filter @ggd/client dev --host 127.0.0.1 --port 5173
python3 tools/hero-model-library/source-workflows/asset-review-portal-v1/serve_review.py \
  --port 8768 \
  --queue materials/hero-model-library/review/kof-xv-ash-audio-review-v1/review-queue.json
```

開啟 `http://127.0.0.1:5173/kof-xv-ash-audio-review.html`。每段只能記錄 `pending`、`已聽，待分類` 或 `排除語音候選`，並匯出有 `sourceFingerprint` 的 JSON。匯出每一列的 `runtimeBindingAuthorized` 固定為 `false`；它不能新增語言、說話者、分類、技能事件或 runtime 綁定，後續仍須把具體聽審結論另行核對與整合。

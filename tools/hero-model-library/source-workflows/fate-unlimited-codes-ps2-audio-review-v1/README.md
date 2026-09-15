# Fate/unlimited codes PS2 音訊逐段聽審

這個流程只使用中央 `voice-index.json` 與 `voice-files.jsonl.gz` 已驗證的三組 PS2 公開 WAV：Archer 180、Shirou 222、Saber 251，共 653 段。它逐段重算檔案大小與 SHA-256，並讀取 WAV header 核對取樣率、通道及 frames；來源包名稱只表示收錄範圍，不能推定單段的語言、說話者、台詞／喊聲／音效分類或遊戲事件。

WAV 已可由本機瀏覽器播放，因此不建立有損轉碼副本。原始 RAR、解包 WAV 與其既有 S3 legacy 收據保持不變。

```sh
# 在 GGD repo 根目錄；workspace 是含 GGD-Asset-Library 的 ABxVFX_EDIT 根目錄。
python3 tools/hero-model-library/source-workflows/fate-unlimited-codes-ps2-audio-review-v1/prepare.py \
  --workspace .. --write
python3 tools/hero-model-library/source-workflows/fate-unlimited-codes-ps2-audio-review-v1/prepare.py \
  --workspace .. --check
python3 tools/hero-model-library/source-workflows/fate-unlimited-codes-ps2-audio-review-v1/build_review.py
python3 tools/hero-model-library/source-workflows/fate-unlimited-codes-ps2-audio-review-v1/build_review.py --check
python3 -m unittest tools/hero-model-library/source-workflows/fate-unlimited-codes-ps2-audio-review-v1/test_prepare.py
python3 -m unittest tools/hero-model-library/source-workflows/fate-unlimited-codes-ps2-audio-review-v1/test_build_review.py
```

產物：

- `priority-evidence/fate-unlimited-codes-ps2-audio-review-v1/receipt.json` 與 `files.jsonl.gz` 是來源 WAV 的 653 筆 SHA 鎖定清單。
- `review/fate-unlimited-codes-ps2-audio-review-v1/review-queue.json` 與 JSON Schema 是可重建的審查契約。
- `apps/client/public/fate-unlimited-codes-ps2-audio-review.html` 是本機審查頁。

啟動既有 SHA allowlist 媒體伺服器時，必須明確傳入本流程佇列；它只會提供這 653 個已驗證 WAV，不能依本機路徑讀取其他檔案。

```sh
pnpm --filter @ggd/client dev --host 127.0.0.1 --port 5173
python3 tools/hero-model-library/source-workflows/asset-review-portal-v1/serve_review.py \
  --port 8768 \
  --queue materials/hero-model-library/review/fate-unlimited-codes-ps2-audio-review-v1/review-queue.json
```

開啟 `http://127.0.0.1:5173/fate-unlimited-codes-ps2-audio-review.html`。每段只能記錄 `pending`、`已聽，待分類` 或 `排除語音候選`，並匯出含 `sourceFingerprint` 的 JSON。匯出資料固定 `runtimeBindingAuthorized=false`，不能自行建立語言、說話者、分類、技能事件、runtime 綁定、後台選項或部署。

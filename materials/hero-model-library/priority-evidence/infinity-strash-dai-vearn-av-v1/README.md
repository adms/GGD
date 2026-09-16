# Infinity Strash 達伊／老年巴恩 AV 索引 v1

此工作流只處理 PN010 小呆／達伊與 EN801 老年、變身前巴恩。EN653 密斯特巴恩、EN680／EN681 巴蘭和跨角色共用媒體全部排除。young／變身後巴恩完整 payload 仍為 0。

- 音訊候選：485（逐檔 WAV、WEM、事件路徑、SHA-256；全部 pending，runtime 綁定 0）。
- VFX 來源套件：175 組、351 檔（只證明已擷取，GGD VFX 轉換與視覺驗收均為 0）。
- 審查頁：`apps/client/public/infinity-strash-dai-vearn-av-review.html`。

重建與檢查：

```bash
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-av-v1/build_index.py
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-av-v1/build_index.py --check
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-av-v1/serve_review.py
```

媒體伺服器只允許 queue 內宣告且 SHA-256 相符的 WAV，支援瀏覽器 Range；頁面匯出的決定固定 `runtimeBindingAuthorized: false`，後續必須由 checked integration 另行套用。

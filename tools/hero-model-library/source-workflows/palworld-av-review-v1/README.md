# 帕魯三英雄音訊與動作審查

產生器只讀中央帕魯索引、Hero Forge 整合收據、現行模型文件與配方來源。它會驗證 18 段叫聲的本機實檔、字節數與 SHA-256，並從 GLB 讀取原生動作名稱與時長。

叫聲一律標為非語言生物聲。來源的情緒標籤只產生通用戰鬥事件建議，不產生技能綁定。所有叫聲與動作候選的初始狀態都是 `unreviewed` 與 `runtimeSelectable=false`。未取得的原始 VFX、Wwise bank 與事件對照只列 blocker。

重建與檢查：

```bash
python3 tools/hero-model-library/source-workflows/palworld-av-review-v1/build_review.py
python3 tools/hero-model-library/source-workflows/palworld-av-review-v1/build_review.py --check
python3 -m unittest tools/hero-model-library/source-workflows/palworld-av-review-v1/test_build_review.py tools/hero-model-library/source-workflows/palworld-av-review-v1/test_serve_review.py
```

開啟審查頁要同時啟動專案 Vite 伺服器與唯讀音訊伺服器：

```bash
pnpm --filter @ggd/client dev --host 127.0.0.1 --port 5173
python3 tools/hero-model-library/source-workflows/palworld-av-review-v1/serve_review.py --port 8766
```

瀏覽 `http://127.0.0.1:5173/palworld-av-review.html`。音訊服務啟動時會重新核對 18 個來源檔的 bytes 與 SHA-256，並支援瀏覽器的單段 HTTP Range 請求；只接受佇列內 candidate ID。頁面將草稿存在瀏覽器 `localStorage`，「下載裁決 JSON」會輸出與資料指紋綁定的決定。導出檔仍需由整合工作流依 schema 驗證與人工驗收後才能套用。

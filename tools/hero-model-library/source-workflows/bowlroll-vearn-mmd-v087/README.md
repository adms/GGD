# BowlRoll 鯖缶359 巴恩 MMD ver0.87

`convert_static_review.py` 將五個 PMX 分別轉成嵌入 diffuse 貼圖的靜態 GLB；`validate_static_review.mjs` 固定 Khronos 驗證結果；`build_review_page.py` 產生人工身分裁決頁。`integrate.py` 驗證原始 ZIP、安全解包清單、來源條件、轉換收據與 S3 完整讀回，再更新既有中央索引。

這個來源只有老年巴恩、影巴恩與附件，沒有年輕真身，也沒有原生動作。轉出的 GLB 只是人工視覺身分審查物；在 owner 裁決、動作與 runtime 驗收完成前，不會被註冊成後台可切換選項。來源 readme 的條件完整保留在索引。

```sh
python3 tools/hero-model-library/source-workflows/bowlroll-vearn-mmd-v087/integrate.py --workspace ..
```

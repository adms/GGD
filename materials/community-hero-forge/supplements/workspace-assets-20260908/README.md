# S3 素材完整性補漏

先前三批封存不能稱為整個工作區素材全覆蓋。本次先查出新增分支 68 張驗收圖，再檢查目前四個 GGD 工作樹及 editor pack，發現既有語音、模型、貼圖、Warcraft 地圖資料與歷史畫面未列入原封存；全部列入本補充批，沒有改寫原 manifest 或原 S3 分段。

- 20,830 個路徑副本，去重為 **5,444 份素材／426,993,636 bytes**；11 個分段共 **364,655,311 bytes**。
- 上傳後從全新快取下載，完整還原 20,830 檔並逐檔驗 SHA-256。還原出的重複檔案為獨立副本。
- 重新讀取四個工作樹及 editor pack 的 **29,108 個素材路徑**，用實際 SHA-256 比對全部封存清單，缺件為 **0**；副本不是獨立素材數。
- 原始素材庫及社群材料的 331 個必要遠端物件存在且大小相符。legacy 搬移後並未再下載全部 47.69 GiB；原始全量上傳／讀回證據仍保留。原備份未跳過符號連結，37 名封存原有三份可重建 Platform 執行檔排除不屬模型／動作／音效漏件。九份腳本大小差異是既有密碼移除處理，不把未去敏感資訊的腳本重新上傳。

`inventory.json` 是補漏前逐檔清單，`manifest.json` 是可還原封存，`s3-location.json` 固定 S3 位置，`upload-receipt.json`／`restoration-receipt.json` 與 `coverage-final.json` 保存結果。Git 只加入這些文字、JSON 與工具；封存分段不進 Git。

```sh
python3 materials/community-hero-forge/restore.py \
  --manifest-dir materials/community-hero-forge/supplements/workspace-assets-20260908 \
  --download --parts-dir /private/tmp/ggd-extra-parts \
  --output /private/tmp/ggd-extra-restored
```

只使用預先配置的 vibe-coding profile、ap-east-2 與同一授權 bucket。目錄必須是新位置，原檔與已上傳物件均保留。來源工具／定義另見 ../../asset-library-sources/README.md。

本次範圍是已登記原始遊戲素材庫、37 名工作材料，以及四個 GGD 工作樹目前追蹤的資源格式；不宣稱涵蓋整台 Mac、所有 Git 物件歷史、依賴／建置快取或其他工作流的 AI 訓練產物。現有 Git 資源檔及歷史仍保留，遊戲仍可照舊讀取；後續若要從 Git 移除，須由 Main 整合部署／載入流程，不能直接刪檔。素材備份也不代表全部角色已完成匯入、動作綁定、視覺驗收或正式發布。

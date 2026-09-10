# 角色模型資料

**共編操作只看 [素材庫共編入口](../asset-library/README.md)。** 本目錄是它的角色模型資料，不是另一個資源庫。

| 檔案 | 用途 |
|---|---|
| [全角色模型盤點.md](全角色模型盤點.md) | 人閱讀：81 名新角色與既有角色、預設、候選及下載安排 |
| [inventory.json](inventory.json) | 程序讀取：同份盤點的角色 ID、modelKey、S3 路徑與取得狀態 |
| [download-sources.json](download-sources.json) | 可共編：下載網址、改造備註、免費／論壇付費交付及每筆必要的後台整合追蹤 |
| [public-source-files.json](public-source-files.json) | 免費／付費來源完整備份的逐檔 SHA-256、S3 位置與尚未上傳紀錄；沿用檔名，不是成品清單 |
| [pairing-inputs.json](pairing-inputs.json) | 可共編：第二批與舊英雄配對來源 |
| [default-policy.json](default-policy.json) | 預設核准範圍：僅 11 組加工替身，其他相似模型留候選 |
| [derivatives.json](derivatives.json) | 可共編：獨立模型副本的製作要求 |
| [manifest.json](manifest.json) | 已發布的可用模型候選與順位；未完成來源不得加入可用選項 |
| [release.json](release.json) | 此 Git 版本對應的 S3 成品版本與逐模型位置 |
| [inventory-context.json](inventory-context.json) | 正式機與原始目錄的觀測快照 |
| [derivative-validation.json](derivative-validation.json) | 11 個副本的獨立檔案、貼圖、骨架、動作與來源不變證據 |
| [spider-identity.json](spider-identity.json) | 蜘蛛子原生表格與模型身分對應證據 |
| [s3-publication-receipt.json](s3-publication-receipt.json) | S3 上傳後讀回驗證；不是網站部署收據 |

本版包含 97 筆來源選項、90 個不同模型，以及成品庫中既有的 60 個 GGD 作者化 VFX 元件。模型／動作元件與完整英雄包分開計算；不得宣稱 156 筆盤點 ID 已全部上架。

已有可用 300 模型就預設用 300；既有版本先核對，避免重買。其他工作流經使用者授權付費取得的素材，一律與免費來源保留整合，預設順位不得刪減候選；尚未取得或轉換的來源不冒充已上架。銀時、蜘蛛子、海克力斯及各來源未完成步驟的細節統一放在盤點。

靜態解析使用 `tools/hero-model-library/public-source-requirements.txt` 的固定版本。`extract_public_sources.py` 會保存 DLL 中的原生資源，並以 `embedded_resources.py` 拆出 Wwise BNK 的 DIDX／DATA 媒體；保留原 bank 和事件資料，WEM 尚未解碼、可能是串流預取片段，不計為完整可播放音效。

`convert_unity_prefab.py <bundle> <intake輸出目錄> --root-name <精確 prefab 名稱>` 僅將已檢查的 Unity 蒙皮模型轉為自包含 GLB，保留骨節順序與綁定矩陣，驗證座標轉換前後頂點位置。遇到未支援的 morph、透明材質或 UV 變換會停止；動作尚未轉換，輸出屬於 intake 半成品。高速婆婆的 `converted-prefab/` 保存 GLB、格式驗證、三面截圖及瀏覽器收據；32 繪製批次尚超過上架上限 5，不能據 GLB 可開啟就登記成品。

靜態預覽來源為 `tools/hero-model-library/preview-unity.html` 與 `preview-unity.mjs`：以工作區的 esbuild 將 JS 和 Babylon.js／glTF loader 打包成 `preview.js`，HTML 另存 `index.html`，與 `body.glb` 放同一個本機 HTTP 目錄即可檢查；三面預覽不等於後台實際切換驗證。

# 如月電車原創本體

`../assets.mjs` 是唯一幾何來源，生成自含 GLB，沒有外部貼圖或借用騎士模型。白綠通勤電車包含車廂、擋風玻璃、頭尾燈、車頂集電部件、滑動車門與兩組車輪；六個動作分別對應 idle/run/attack/cast/hurt/death。

重跑 `node tools/editor-acceptance/batch2-37/assets.mjs`，以正式 `prepareUploadedHeroModel()` 及 `verifyUploadedHeroModel()` 檢驗真正字節，再生成 model@1、uploadedModel、clipMap、SHA-256 與 budget 收據。原始 `kisaragi-tram.source.glb` 與以 SHA 命名的標準化 GLB 均保留；目前六段全選，所以兩者字節相同。

`python3 tools/editor-acceptance/batch2-37/render-assets.py` 使用 Pillow、NumPy 讀取標準化 GLB 的實際頂點與動畫 accessor，經 CPU 深度緩衝產生六動作檢查圖及 `kisaragi-tram-render.json`。預覽不是正式遊戲截圖，也不測量遊戲效能。

`../verify-package.mjs` 只有在從字節通過正式模型檢查後才設置離線 catalog 的 `validatedUploadedModel`；另測試未驗證 descriptor 及受損字節都被拒絕。套件存至 `docs/_reports/hero-validation-batch2-37/data/private/packages/`，從磁碟讀回並走正式 ZIP reader 及 package validator。資產來源 hash、manifest hash、來源依賴 hash 均記錄於 package-report.json。每個 ZIP 自帶相依 bytes，無需參照來源工作樹才能打開 ZIP。

限制：模型沿用正式 uploaded-body 的 0.6 碰撞半徑與共用高度正規化。長車體的視覺／碰撞貼合、部署端匯入、正式遊戲顯示與上場尚未驗證。五個 draw mesh 超過警戒值三，但未超過硬上限五；不得把離線 budget 通過說成遊戲效能通過。另 36 名目前採核准代理本體；角色及技能圖示採既有 UI fallback，沒有宣稱原作外觀或專屬圖示完成。

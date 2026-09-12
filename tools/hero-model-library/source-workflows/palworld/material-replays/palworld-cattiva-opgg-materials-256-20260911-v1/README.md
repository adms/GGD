# 搗蛋貓 Cattiva：256 貼圖候選

`result/body.glb`：**2,148,052 bytes、5 張 256×256 PNG、43 根骨架、33 段來源動作**。SHA-256：`b404c9a9593e9c5f742eb929ff78f707fa6bc262f2d8cbefa311b653599dc0a5`。

使用現有 GGD `normalizeUploadedModel` 與 `resizeImageWithFfmpeg`，5 張圖片依既定 Lanczos 流程縮至 256。原高解析材質版另存於相鄰 `palworld-cattiva-opgg-materials-20260911-v1`，95 檔封存資料未修改。

| 現行預算項目 | 實測 | 上限 |
|---|---:|---:|
| 三角面 | 5,798 | 28,000 |
| 繪製網格 | 3 | 6 |
| 貼圖邊長 | 256 | 256 |
| 單段最多通道 | 129 | 500 |

直接呼叫 `heroModelBudgetIssues`：**errors=[]、warnings=[]**；未改 gate。高解析版的同一預算測試會明確擋住 2048 貼圖，保留為高解析儲備。規格／程式 SHA 與前後結果記於 `result/validation/current-budget.json`。

全部 3,358 個 accessor 的有效資料逐一比對不變；骨架、節點、材質及 33 段動畫 JSON 不變，沒有裁切動作、修改幾何或新增 Death。Khronos 0 errors、2 warnings（來源缺 tangent、原有 non-root skin）；GGD 匯入通過；Babylon 33 段皆有實際頂點位移。`render-v1` 存全部動作起始／中段 66 張 WebGL 圖，`contact-sheets` 存總覽。

900px Idle 與第 2 張總覽已目視確認面部／身體綁定；256 版會失去高解析毛髮細節，這是縮圖的實際差異。來源材質無法以核心 GLB 完全表達的額外透明裁切／深度偏移、未編入動畫的眼睛 UV 表情、缺 Death 動作及尚未完成的 GGD 六態／後台／遊戲驗收，仍如高解析版；本版不含音訊。

從 `GGD-hero-model-options` 目錄重跑，使用不存在的新輸出目錄：

```sh
node --import tsx \
  ../GGD-Asset-Library/conversions/palworld-cattiva-opgg-materials-256-20260911-v1/tools/normalize.mts \
  . ../GGD-Asset-Library/conversions/palworld-cattiva-opgg-materials-20260911-v1 \
  /private/tmp/cattiva-256-replay

node --import tsx \
  ../GGD-Asset-Library/conversions/palworld-cattiva-opgg-materials-256-20260911-v1/tools/validate.mjs \
  . /private/tmp/cattiva-256-replay
```

`tools/render_server.py`、`contact_sheets.py` 提供相同本機預覽；`tools/backup_conversions.py` 只讀兩個已凍結目錄，使用指定 vibe-coding profile 寫入 S3 legacy 並完整 Get 回驗。備份壓縮檔、readback 及收據位於兩個 conversion 目錄之外，封存根不被修改；中央索引、content、Git 由根工作流另行整合。

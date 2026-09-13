# KOF XV 不知火舞標準化前檢查

此工作流保存 KOF XV Mai Shiranui 原始 FBX 的一次拒絕性前檢查。它不產生可交付 GLB，也不改變不知火舞既有手動代理預設。

輸入為已驗證的 `Mai Shiranui.fbx`。先以 Assimp 6.0 匯出 GLB；該 GLB 的外部貼圖 URI 指向來源包外的舊 Noesis 位置，因此只能建立移除貼圖引用的幾何分析副本。這不是貼圖完整模型。`decimate.mjs` 以目標 26,000 triangles 分別測試 0.10、0.25、0.50 error bound，結果仍是 87,086／87,083／87,083 triangles。`optimize.ts` 因未達目標拒絕寫入候選。

保留階段檔後，執行：

```sh
python3 freeze.py --source-fbx /absolute/Mai\ Shiranui.fbx \
  --stage /absolute/GGD-Asset-Library/conversions/kof-xv-mai-preflight-20260911-v1
```

`analysis.json` 必須保持 `convertedModel=false`、`backendRegistered=false`、`runtimeSelectable=false`，直到材質映射、FBX 骨架等價性、預算、視覺和後台切換全數通過。

中央索引只同步交付記錄的候選、驗證文字、整備狀態和後台狀態，保留既有 S3 備份收據：

```sh
python3 integrate.py --entry materials/hero-model-library/kof-round20/mai-xv-raw/public-source-entry.json \
  --downloads materials/hero-model-library/download-sources.json
```

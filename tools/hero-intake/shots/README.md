# 📸 實拍台 —— 把一顆 glb 變成一張「真的看得到」的預覽圖

> owner 2026-09-11：「你應該是要給我**審查頁** 裡面**可以看跟聽**吧」

一次性的渲染台：靜態供應 glb → 頁面用 three.js 逐顆載入、框好、渲染 →
`POST /save` 把 PNG 寫回磁碟。⭐ 給新英雄上架檢核頁用（`tools/hero-intake/build-review-page.py`）。

```sh
# ① 在 .claude/launch.json 暫時加一條（autoPort: true），指向 shots/serve.py
#    ⛔ 用完就把那一條刪掉 —— 它不屬於這個 repo 的常駐設定
# ② 準備 <work>/render/models.json ＝ [{id, name, glb}]（glb 是相對 serve.py 的上一層）
# ③ preview_start 那條設定 → navigate 到 /render/index.html → 等 window.__shot.finished
```

## ⛔ 它存在的理由是三個「壞掉跟正常長得一模一樣」

| # | 症狀 | 真相 |
|---|---|---|
| ① | 迴圈一步都不動，而 glb 與貼圖**都載完了** | `requestAnimationFrame` 在**背景分頁**不觸發 ⇒ 改用 `setTimeout` |
| ② | 回報 `✓`，而圖是**全透明**的 | 算 bounding box 前沒有 `updateMatrixWorld(true)` ⇒ 相機框到空的地方。⚠️ 多數模型根節點是單位矩陣所以**看起來沒事**，只有有階層變換的那一顆會空 |
| ③ | 「渲染成功」≠「圖上有東西」 | ⇒ 內建量尺：`readPixels` 數非透明像素，<1% 記進 `failed`。⭐ 而量尺自己要先對一張**已知全透明**的控制組回 0（⛔ 只驗「有東西」那一邊不算校準） |

⚠️ 這三個都是 2026-09-11 真的踩到的，②是量尺抓到的 —— ⛔ 肉眼看 26 張縮圖時它混在裡面看不出來。

## ⛔ 它不做的事

- ⛔ 不入庫、不改 `content/`：它只產一張給人看的圖。
- ⛔ 不是模型檢查：那是 `tools/w3x-import/model_intake.py`（第一·四之零）——
  一張看起來正常的圖**答不了** glTF 驗證、draw call、零長度動作、貼圖掉成佔位圖那四題。

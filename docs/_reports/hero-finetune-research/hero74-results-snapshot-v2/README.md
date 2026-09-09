# Hero74 訓練中快照與自動報告

這是 v21 正式訓練 **124/500** 步時的不可變檔案快照，不是最終模型結果，也不會即時更新。已完成訓練前 119 題 CE，訓練後 CE、base/LoRA 自動生成與真正對局仍未測。不能以歷史教師的結構／封裝控制組分數代替模型品質。

- `report-data.json`：來源 SHA-256、訓練進度與逐英雄三方欄位；未測品質及危險接受數保留 null。
- `report.html`：離線報告，無外部資源；17 名主分母和 102 輔助單槽分開。
- `visual-verification.json`：360/736/1024px、明暗兩色共六組排版與展開互動檢查。另已人工查看桌面渲染。檢查的是報告排版，不是遊戲特效圖片。

工具位於 `tools/editor-acceptance/`：

1. `hero-distillation-results.py` 收集固定資料與收據；拒絕題序、槽位、來源、答案 token 長度及編譯／封裝 hash 不一致。
2. `hero-distillation-report.py` 純離線呈現；不把 null 轉成 0，不宣告 E2E 或模型達標。
3. `hero-distillation-report-visual-check.mjs` 以 `--report HTML --out NEW_DIR --playwright MODULE_PATH` 檢查報告；無頭瀏覽器停用 GPU。
4. `hero-distillation-evaluate-batch.py` 已接上 collect-results/render-report。正式訓練成功、最終 adapter 重載驗證通過後，原本的一次性 base→LoRA 推論與編譯／封裝流程將自動輸出 `report-data.json`、`report.html`。生成不讀教師答案；報告可讀已固定的教師控制組收據。來源和輸入 hash 逐階段檢查，報告失敗也不偽造整批成功。

測試：`hero-distillation-results.test.py` 7 項、`hero-distillation-evaluate-batch.test.py` 7 項通過；均為 CPU 測試，不載入模型、不啟動第二 GPU worker。mock 控制器測試不是實際 12B 推論證據。

語意忠實度、友敵／時序／資源／跨槽正確性、隔離匯入與實際對局仍須取得獨立證據。本 internal dev 已見來源，不是使用者尚未提供的新批盲測；完整目標維持未完成。這次不改訓練器、凍結資料、epoch、保護或預算。

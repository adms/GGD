# 達伊 PN010 特效支援元件候選

本批由六個原作 NiagaraSystem 根建立 94 個 package 的遞迴閉包，實際保存 208 個檔案、7,198,193 bytes。UModel 匯出 25 張貼圖；7 張 Engine／空白工具圖仍留在本機來源關係，但不作獨立候選。Git 收錄 18 張依 live `vfx-model` 上限正規化的 PNG 與 8 顆 StaticMesh GLB。

現行政策驗收由 [policy-check.json](policy-check.json) 直接記錄 `tools/model-budget/limits.ts`、`roles.ts` 與 `glb.ts` 的 SHA，18/18 貼圖與 8/8 GLB 通過 hard limit；8 顆 GLB 的 Khronos 結果皆為 0 error／0 warning。詳細 package path、角色身份、來源 SHA、轉換參數、本機路徑與缺口在 [candidates.json](candidates.json)；靜態視覺證據在 [contact-sheet.png](contact-sheet.png)。

這些是特效支援元件，不是完整效果。Niagara 播放時序與動態材質參數仍缺，視覺接受待使用者審查，技能綁定 0、runtime 可選 0、正式站部署 0。大型原始／轉換工作目錄保留於本機：

- `GGD-Asset-Library/intake/windows-readonly-20260914/infinity-strash-dai-vfx-components-v1`
- `GGD-Asset-Library/conversions/infinity-strash-dai-vfx-components-v1`

兩者的 S3 legacy 備份狀態皆為 pending。

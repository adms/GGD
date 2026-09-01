# VFX Forge 八招驗收批次（2026-09-01）

- 性質：八招只驗收 Editor 能否用通用積木表達場景，不是遊戲內容，也不是待上線的技能改版。
- 儲存：fixture 由 `acceptanceFixtures.ts` 即時組裝，分支不新增或改寫這八招的 `content/vfx-scripts/*.json`。
- 批核：八招送入同一頁後台時會被伺服器強制標成 `editor-capability-fixture`，只能填肉眼 0～10 分並判定 pass／fail，永久沒有 Promote 路徑。
- AI 產生或調整的正式技能效果、機制、動畫、VFX 一律先成為不生效 proposal；人工裁決綁 candidate hash，通過後仍須顯式 Promote，且寫入前重驗 schema、Base hash 與 asset safety。
- 演出：經典氣功砲以旋轉 90 度的 WC3 `ReviveHuman` MDL 為主體，粒子只作輔助；多段演出由可重用 recipe 拼裝，不為每招硬寫一套 primitive。
- 所有權：有 script 的技能會取代預設演出；投射物 spawn／hit／end 的精確 authored origin 會阻止預設投射特效再次疊播。
- 預覽：真 Sim 班表、真 `VfxSystem`、真 `CameraRig`、雙方 3D model、精確秒數與全螢幕預覽。
- 最新 main 契約：required 4,925、notRequired 15、owner-only 39；coverage `557b813e510e`，capability `111434fa`。
- 關鍵驗證：四個 app typecheck；VFX／真 Sim／HITL 123 tests；coverage freshness 2 tests。
- 視覺狀態：**全部等待 Owner 人工裁決**。先前文件中的「4 招通過、4 招部分通過」只是 AI 自評，已撤銷，不能當上線或能力驗收 verdict。
- 現況基準：Owner 肉眼評價約 0～4／10，自動截圖審查約 2～6／10；自動分數只能排序與提示，不得解鎖 pass 或 Promote。
- 關鍵影格與既有缺陷紀錄：`docs/_reports/vfx-forge-visual-proof-20260901/frames.md`；其歷史 verdict 文字僅供比對，不是現行裁決帳本。

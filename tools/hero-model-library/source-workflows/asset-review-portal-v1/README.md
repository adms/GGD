# GGD 素材逐項審查中心 v1

這個流程把現有且仍未核准的審查契約集中成單一頁面，來源仍各自維持權威：

- 波普 PN020 的事件音訊候選；
- 帕魯三名的叫聲與原生動作語意候選；
- JUMP FORCE 的角色群組固定抽樣；
- 已通過目標 GLB／骨架播放前置驗證的借用、重定向或死亡替代動作；
- KOF XIV 的 55 張已轉換特效貼圖與 71 組原生 EFF 參照群組；
- 達伊 PN010 的 18 張合格特效貼圖與 8 顆 mesh 支援元件；
- 波普 PN020 的 12 個 GGD VFX 靜態重建候選；
- 尚未符合播放條件的動作線索，僅顯示缺口且沒有核准控制。

JUMP FORCE 目前只有 89 個群組級審查項目。產生器會從每組選出字典序第一個可播放檔案，重新核對該抽樣的 SHA-256，供角色群分類聽審。這不是逐檔說話者、語言或技能事件證據，所以該類核准不會產生事件綁定權限。

所有進入這個頁面的候選固定以 `pending` 開始，頁面可逐項記錄 `approve`、`reject` 或 `pending`，並匯出 `ggd.asset-review-decisions@1`。視覺候選另固定 `ownerDecision=pending`，其 `approvedBindings` 在 schema 中限定為空陣列；視覺核准只記錄素材觀感，不能當成技能事件或 runtime 綁定授權。已有 owner 決定與 runtime 收據的候選不會重新排入頁面；完成項保留在其來源契約及收據。匯出檔的 `runtimeMutationAllowed` 與每列 `runtimeBindingAuthorized` 都固定為 `false`；後續整合流程仍需驗證使用者裁決、來源指紋與實際 runtime 實作。

重建及驗證：

```bash
python3 tools/hero-model-library/source-workflows/asset-review-portal-v1/build_review.py
python3 tools/hero-model-library/source-workflows/asset-review-portal-v1/update_four_day_report.py --write
python3 tools/hero-model-library/current_resource_index.py --git-link-root /path/to/integration-checkout
python3 tools/hero-model-library/source-workflows/asset-review-portal-v1/build_review.py --check
python3 tools/hero-model-library/source-workflows/asset-review-portal-v1/update_four_day_report.py
python3 tools/hero-model-library/current_resource_index.py --check --git-link-root /path/to/integration-checkout
python3 -m unittest \
  tools/hero-model-library/source-workflows/asset-review-portal-v1/test_build_review.py \
  tools/hero-model-library/source-workflows/asset-review-portal-v1/test_serve_review.py
```

啟動既有 client Vite 伺服器及 SHA allowlist 音訊伺服器：

```bash
pnpm --filter @ggd/client dev --host 127.0.0.1 --port 5173
python3 tools/hero-model-library/source-workflows/asset-review-portal-v1/serve_review.py --port 8767
```

開啟 `http://127.0.0.1:5173/asset-review-portal.html`。動作預覽使用既有 `champion-model-audition.html`，並等待 `__settled`、確認可見三角形後才移除狀態遮罩，避免黑畫面被誤當成成功。每項另有「全頁查看」方便排除 iframe 問題。媒體服務只暴露生成佇列中已核對 bytes 與 SHA-256 的音訊或視覺預覽檔，支援 `HEAD` 和單段 HTTP Range，無法用路徑讀取其他本機檔案。KOF EFF 尚無完整原生 renderer，EFF 卡片顯示其精確引用的轉換貼圖；沒有直接貼圖參照的群組顯示該角色接觸表。達伊 mesh 卡片使用含逐元件線框與 ID 的固定接觸表。

新出現的 `hurt-ascend-fade` 候選會播放已驗證的受傷／倒地 clip，再對整個預覽框做半透明升天淡出示意；預覽本身不是原生 Death 或 runtime 世界座標實作證據。波普已有獨立 owner 決定與 runtime 收據，因此不再出現在 pending 佇列。相同作品借用動作同樣必須先有目標 GLB、骨架相容性與播放證據，才可進可裁決清單。

# 七位原模型的英雄工坊接線

程式來源：`1f29504b1901716ee42e990502429aa05c8fd9f0`。七位作品均透過正常 UI 建立、選用本機轉出的模型，並保存待機與 Q 施法時點，共 14 張原生瀏覽器截圖與完整 accessibility tree。畫面走實際 SimWorld、VfxSystem 與 Main ChampionView；七位、42 槽的編譯與模擬均在畫面顯示通過。這不是 42 槽逐一畫面驗收。

瀏覽器回傳的是 JPEG；初存檔名誤用 `.png`，檔頭檢查發現後只改副檔名為 `.jpg`，原始 bytes 不變。`capture-format.json` 留下修正紀錄。

## 可操作的模型管理

後台「內容·素材管理 → 模型管理 → 英雄本體選用」有三個選項：沿用既有英雄綁定、允許創作者選用、停止提供新作品選用。模型表單同時列出六個核心動畫欄位。

可信模型目錄可用 `heroBody: true` 核准新的英雄本體，不需先建立假官方英雄；`false` 停止提供新作品使用；未填則保留既有英雄綁定的規則。Editor 與 Main importer 共用同一個選用函式，作者作品不能自行核准模型，也沒有略過固定依賴、素材清單與套件檢查。

實際後台驗收使用隔離目錄的 `champ.thorne`，依序保存未填 → false → true → 未填。作者端回讀確認停止後選項消失、核准後恢復。最後模型 JSON 與出貨來源語意相同，contentVersion 回到 `cv_f534f6680435`。每次都走既有差異預覽、寫入及備份流程。另修正內容路由間共用元件沿用前一集合狀態的問題，確保從英雄管理切到模型管理真的顯示模型。

## 素材範圍

`model-docs/` 是七份隔離模型文件；GLB 位於本機素材備份 `outputs/community-lol-models-20260907/ggd-runtime-candidate/`，沒有加入 Git 的出貨素材清單。它們只在 `/private/tmp/ggd-lol-forge-preview/content` 核准供預覽。

- 保留 idle／run／attack／cast／death／celebrate 六段，共 42 段原作動作。受擊明確暫用 idle；格擋／閃避使用既有播放器回退。
- 每位只檢視待機與一個施法時點，尚未完成移動、普攻、死亡、慶祝或完整動作銜接的畫面驗收。
- 齊勒斯施法時本體被 GGD 特效遮住較多；本體轉換也沒有包含 LoL 獨立的能量特效。不能將本批算作原作外觀完全還原。
- 沃維克、犽宿、李星仍超過目前每英雄 160 通道的估算上限。A17 Pro 實機效能測試不列門檻。
- 這不是 LoL 素材的完整套件發布或雙客戶端對局證據。先前七位網路對局使用 GGD 既有替身模型，不能挪作本次 GLB 的驗收。

## 重建本機治具

從本分支複製 `content/` 至另一個可丟棄目錄，加入 `model-docs/` 中的七份 JSON，並把本機備份的七個候選 GLB 複製到該內容樹的 `assets/models/community-local/`。透過既有 `packages/shared/src/content/node/fsStore.ts` 的 `rebuildAllIndexes(contentDir, { write: true, bundle: true })` 重建索引；不變更出貨素材清單。

`server.mjs` 保留本次實際啟動程式與固定治具路徑。從 repo root 以 `node --import tsx` 執行，使用 loopback `8799`；Editor 以 `VITE_CONTENT_API_URL=http://127.0.0.1:8799` 啟動於 `5199`。Admin 使用相同 API，啟動於 `60800`。只有試驗目錄可寫，repo 的 `content/` 未變。

`checks/` 保存針對性測試、型別檢查與首次失敗。`gates/` 依批次保留三門檻紀錄：首次契約過期、IPC 權限限制、README 收據尚未刷新，以及最後重驗；失敗收據不覆蓋。

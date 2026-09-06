# 英雄模型版本與回復驗收

後台每位英雄新增「上線模型版本」選單。新增版本時預設套用新模型，並保存原上線 GLB、動作映射、尺寸與朝向。切換只修改英雄的模型指向；原名稱、技能與其他欄位保持原值。

版本記錄區分同一角色、同角色其他形態、相近風格替代及原上線版本，保留實際素材角色、作品、素材庫與來源依據。版本檔案採追加保存；一般 JSON 寫入、刪除與備份還原不能移除歷史或繞過版本選單。過期的編輯會被拒絕；切換前重新核對模型與 GLB 的完整 SHA-256。

## 已完成的證據

- `proof.json`：127.0.0.1:8805 的隔離 Sela 作品，先新增拉克絲六動作版本、切回原版、再切回新版。兩份 GLB 與模型設定完整保存，其他英雄欄位相同，留有三份英雄備份。
- `new-default.jpg`、`rollback.jpg` 及兩份 `*-ui.txt`：實際後台選單操作與來源顯示。這是模型版本操作驗收，並非 Sela 或 37 名英雄原設計的視覺裁決。
- `regression.log`：ContentAPI、CRUD 寫入保護、後台 API、遊戲外觀選擇，以及獨立骨架實例載入的回歸結果。另涵蓋來源刪除後雙向回復、並行更新、毀損版本、越界符號連結及舊備份繞過。
- `editor-release.log`：Editor 549 項測試、型別與正式建置通過。
- `content-types.log`、`admin-types.log`、`admin-build.log`：相關服務與後台建置結果。
- `coord-check.log`：協作契約檢查通過。

## 範圍與未完成項目

本次只在 `/private/tmp/ggd-model-versions-acceptance` 的隔離服務操作，未部署正式站。新模型使用實際 GLB；原版本保留既有 voxel／overlay 外觀解析。外部共用的 overlay 配置與整體遊戲程式版本不屬於這份模型快照。

三項必要檢查同批執行。`skills:check` 的產生器新鮮度問題已修正，之後停在既有 `msgledger:check`：`docs/_daily/2026-09-06.md` 尚有未對票列。原始輸出保留於 `/private/tmp/ggd-model-versions-skills-verified.log`；此報告不複製其他工作流的對話內容，也未捏造票號讓檢查變綠。

37 名英雄的素材選配、全部 `requiredRefinement`、完整畫面驗收與依當下服務重建投稿 ZIP 仍在進行。替代模型的採用不代表原技能機制已完成。

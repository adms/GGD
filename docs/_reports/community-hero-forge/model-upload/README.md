# 社群模型與動作庫上傳驗收

實作提交：`ce12723f4d0a418870fdfa286c0dea65c9b37ed3`。隔離資料：`/private/tmp/ggd-model-upload-acceptance`。服務使用提交前同一工作樹，公開 build stamp 仍為 `7d4ba5aa-model-upload-working-tree`；不改寫舊收據以冒稱正式版部署。

實際瀏覽器完成：GLB 本體匯入、相容獨立動作庫、六用途映射、原始雙檔備份還原、裁剪後 ZIP 還原、经正式 nginx 路由的私人雲端同步、作者投稿、固定候選六槽模型載入、管理員發布，以及另一帳號建立帶來源署名的改作。新 origin 從空資料庫恢复原始動作庫。`roundtrip-proof.json` 保存大小、雜湊及來源／改作關係；四個原始與衍生檔案逐位元組往返相等。非擁有者讀私人原始素材為 404，匿名為 401；允許改作的已發布 runtime ZIP 可供改作者下載。

Admin 模型投稿開關經關閉、Editor 看到暂停、草稿仍保留，再重新開啟；最終設定 generation 4，開關為開啟。設定只在隔離平台。

驗收作品「模型上傳驗收」使用實際 Lux 模型與額外相容動作檔，技能為通用法師治具。六張固定審查畫格為有界模擬步進，證明模型、材質與相同比例能載入，不能證明原作六槽演出或多人遊戲完成。原模型、私人 JSON／ZIP 及驗收憑證不入 Git。

檢查：核心／Main／預算 35 項，Editor 子集 23 項，renderer／部署鏡像 15 項，另 sparse/CUBICSPLINE 與實例隔離 2 項通過；批次有重疊，不相加當完整 suite。四應用型別檢查、Admin／Editor build、兩個 Go 套件 race 檢查通過。最後同時執行三門檻為 skills／release／coord = **1／0／0**，release 含完整 Editor **549 項**與 production build。skills 到既有 `docs/_daily/2026-09-06.md` 未對應訊息帳本失敗；此處保留失敗前輸出及原因，完整原始 log 留於本機以避免複製無關對話。不製造帳本對應以令閘門轉綠。

新交接範圍為 37 英雄／222 槽。它的代理模型與替代模板不因本模型功能通過而獲得原設計驗收。

# 已串接隔離匯入的訓練中快照

快照為 v21 **188/500** 個正式 optimizer 更新；119 題 dev-before 完成，dev-after 與 base/LoRA 生成仍未完成。既有教師控制組：17 名結構通過、15 名封裝准入、14 名隔離 HTTP 匯入及 runtime 一致。這些不是模型生成分數，也不是完整上場成功率。

## 自動流程

原 `hero-distillation-evaluate-batch.py` 命令仍可使用，成功完成單輪與 adapter roundtrip 才允許啟動。順序固定為：

1. 基底全部 public cases 推論 → LoRA 全部同題推論。
2. 兩組各自編譯、完整封裝准入。
3. 兩組各自使用 Main 固定版本、獨立 loopback 服務／work-storage 做 HTTP 匯入、保存與下載，之後離線比較全部 runtime 文件。
4. 驗證來源與逐例順序，合併教師／base／LoRA 結果，產生 JSON 與 HTML。

新增 `--api-dependencies` 可明示既有 content-api 套件目錄；省略時由原 shared 套件目錄推導同工作樹 `apps/content-api/node_modules`。必要套件缺少會在推論前停止。教師匯入控制組由 `--teacher-import` 指定，預設使用已保存 v3 的 report/runtime-audit；教師答案依然不进入模型輸入。

每個既有 CPU 階段上限仍是 **180 秒**，匯入階段也不例外；沒有提高 GPU、RAM、swap、電量、推論或訓練時間上限。先前獨立控制組的檔案時間跨度約 189 秒，正式批次匯入仍有超時風險，不能保證此階段會完成。超時終止自己的 subprocess group，保留 `progress.json` 中已完成及正在處理的項目，不重試、不延長，也不出具整批成功收據。所有 base/LoRA 原始生成及先完成的編譯證據保留。

## 評分界線與驗證

收據必須依 SHA-256 連回相同 package admission、匯入 run 與 runtime audit，逐英雄順序／分母一致；未匯入的英雄不准出現 runtime audit 通過。單純匯入成功、或是 runtime 一致，均不把語意、平台選角、真正對局、完整英雄成功及危險接受數從未驗證提升成通過或 0。

測試：結果彙整 10 項、批次控制器 9 項、匯入工具 7 項，共 26 項 CPU 測試通過。這包含錯誤收據、缺少依賴、匯入 timeout 不重試與不得升級模型品質；不是實際 base/LoRA 生成驗收。報告另通過 360/736/1024px 明暗六組排版、互動與無外部請求檢查，已查看桌面暗色渲染。`visual-verification.json` 為排版收據，不是特效／遊戲視覺驗證。

本輪只接通既有驗證工具與報告；没有改資料、答案、訓練器、prompt、checkpoint 或選模。原生格式兩名的匯入介接、完整六槽機制忠實度、平台選角與對局證據仍未完成，目標維持 active。

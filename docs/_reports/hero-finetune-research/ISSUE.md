[重要][improve] 封存英雄模型研究並交付有界自動微調對照流程

## Objective

交付可追溯的英雄模型研究 scripts、資料版本、原始實驗證據、配對報告及研究 adapter。正常執行由單一入口完成，不以人工逐題重試或持續修改評分標準換取高分。

## Scope / 影響檔案

- 新增 `tools/editor-acceptance/hero-finetune-archive.py`：封存、逐檔校驗與安全解包。
- 新增 `docs/_reports/hero-finetune-research/README.md` 及同目錄研究封存包、模型授權、結果報告。
- 新增 `docs/editor-contract/coordination/claim.hero-finetune-research.json`：帶可重跑證據的 Main 交接 packet。
- 由既有 `decor:build` 刷新 `ggd-config-decoration-census.json`／`.md`：新增兩支工具使語料檔數 2308 → 2310，機制判斷、分類及逐檔結果完全不變；不手改產物。
- 保留歷史 4B、9B、12B、27B 不同題組的界線，不混算成單一成功率。

## Implementation constraints

Mac-only，雲端 GPU 支出為 0。固定新 IR5 的資料、評分器、16 training steps 和末步 checkpoint；單一 GPU worker、總時間上限及報告保留時間。遇到資料漂移或資源異常即停止並產出紀錄，不自動重試／重標註／更換模型。

原始資料不改寫。node_modules、環境、重複引擎副本和大型基底／融合權重不塞入普通 Git；selected adapter 是實際位元組，未提交的大型權重另列 hash、來源及保存紀錄。

## Acceptance criteria / 驗證方式

- [ ] 一個入口留下基底、LoRA、同題評分及自動報告的階段退出碼與原始收據；失敗不能標成完成。
- [ ] 完整配對的每個輸入皆計入分母，包括非法 JSON、契約不合與截斷。
- [ ] 封存工具逐檔及模型 hash 驗證通過；解包拒絕覆寫既有目的地。
- [ ] 資料限制及模型未獲正式驗收明列；不啟用 Editor，不宣稱 95% 全自動成功。
- [ ] commit、分支 push、PR 與 coordination packet 可追溯；不直接推 main 或自動 merge。

封存驗證命令：`python3 tools/editor-acceptance/hero-finetune-archive.py verify docs/_reports/hero-finetune-research/bundle`。

本票只交付非視覺的終端證據與研究報告，不修改玩家畫面，不新增 visual-proof 宣稱。

## 思考策略

[思考策略] 量到再說；閘不是判準。工具測試只能證明工程約束，不能替代完整原文機制和獨立來源的模型品質。

## 解決模板

[解決模板] 承重守衛+突變：保留 `ir5-evaluation.test.mts`、錯誤機制 mutation 證據與資料遮罩測試；刻意刪除吟唱或改錯目標時，對應斷言必須失敗。

## Dependencies / Non-goals / Known risks

相依：已固定的 GGD 引擎 revision、現有 schema/compiler/SimWorld、MLX 本機模型及 tokenizer。這次不要求 Main 增加機制積木，也不修改遊戲數值、特效參數或產生器。

相關票 #1108 處理 Editor 共用 JSON 輸出包裝；本票只交付研究實驗、封存及證據，不重複該產品實作，也不替它宣稱完成。

已知風險：合成資料只有一個家族、措辭重複、名稱含吟唱提示；兩個真實英雄控制組已曝光。此批只用來驗證流水線與工程學習，不能支持獨立泛化結論。過去 4B 局部改善也不等於新英雄或機制計畫全面改善。

數值沒有第二個住處：權威結果在原始 manifest／配對收據；Markdown 是帶來源的摘要，不新增平衡設定。後續資料品質改進另定範圍，本票不追加訓練迭代。

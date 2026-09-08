# 12B 英雄鑄造重啟：目前入口

本目標仍在進行，尚未核准「穩定全自動創建」或新的微調成品。首要目標是英雄設定、機制及跨槽關係正確；特效只給既有模板建議。

## 最新追加：序列邊界控制恢復 JSON，機制仍未合格

保持相同 8 筆／16 步、未改 worker、原評分器與六例輸入，只在訓練排除值前後加入空白，避免 331 個額外 JSON 標點被遮罩。固定對照得到 JSON **基底 5/6、原遮罩 LoRA 1/6、新控制 6/6**；IR／編譯／完整工程仍全部 **0/6**，不採用模型。全流程 506.97 秒、訓練 198.03 秒、Metal 34.45 GiB，worker 已退出。

- [新控制自動結果](ir5-serialization-workflow-v1/REPORT.md)、[三組原始收據](ir5-serialization-workflow-v1/result.json)。
- [CPU 稽核與介入限制](SERIALIZATION_AUDIT_REPORT.md)、[逐例錯誤與資料覆蓋](ir5-serialization-followup-v1/manifest.json)。
- 新控制有 356/375 已知來源欄位吻合，但不可將它寫成 95% 英雄成功：仍有目標方式、落點／沿線和「未說明」／「不需要」的關鍵錯誤。
- 覆蓋盤點確認 Q 槽的沿線機制在本批訓練中為 0 筆、合成 dev 為 4 筆。這是未見槽位組合的外推挑戰，不是錯標；不應把同一批 dev 補進訓練後仍稱盲測。
- [PR #1114 CI 核對](PR1114_CI_REVIEW.md)：遠端 unit 在既有豁免到期失敗，已重現與回饋 Main；不宣稱 CI 全綠。

## 最新：IR5 固定配對已完成，微調未採用

單一 script 已跑完基底 → 16 步 LoRA → 同題推論 → 固定評分 → 自動報告，共 838.09 秒（約 14 分鐘），沒有人工修答案或追加重試。訓練步驟 207.44 秒，峰值 Metal 34.27 GiB；adapter 重載核對通過，11 個基底模型檔 hash 核對通過，GPU worker 已結束。

六例的 JSON 合格 **5/6 → 1/6**；IR／編譯／完整工程通過皆 **0/6 → 0/6**。本批微調退化，不採用；loss 下降不是品質改善證據。資料只有 8 份同家族合成訓練、4 份同家族合成 dev、2 位已曝光真實英雄，不能推論独立泛化能力。完整英雄身分原文並未自動驗收。

- [自動報告](ir5-workflow-v1/REPORT.md)、[配對結果及完整執行收據](ir5-workflow-v1/result.json)、[資料問題清單](ir5-workflow-v1/data-issues.json)。
- [自動入口](run-ir5-workflow.py)、[研究 adapter 與基底版本](ir5-workflow-v1/research-adapter/model-card.json)。
- 交付票 [GGD #1113](https://github.com/adms/GGD/issues/1113)；保留歷史失敗及原始模型輸出，不再擴充本輪實驗。

以下 IR4／IR3 與較早 LoRA 為不同 cohort 的歷史結果，不與 IR5 混算。

最新兩位IR4基底GPU推論已完成：JSON2/2、契約及編譯0/2，98.40秒、Metal峰值12.774GiB，接電100%、新增swap0，worker已退出。人工控制組58/58來源檢查與4/4獨立冷卻政策通過；另完成34項schema／訓練遮罩檢查。新證據指出「必須吟唱」與「未知秒數」仍混在同一格，不能把數值遮罩後就直接入訓；完整SFT准入與全自動核准仍0。[最新基底與遮罩報告](IR4_MASK_AND_BASELINE_REPORT.md)。

上一輪IR4接入三種原生動作、52項CPU測試與反例26/27的歷史結果保留。[完整配方與反例報告](WHOLE_PLAN_DEVELOPMENT_REPORT.md)。

前次 IR3 短契約兩批基底推論均4/4 JSON，但只有0/4及1/4通過契約／編譯，不勝IR2的2/4，因此不升級。9位／54槽完整意圖尚未准入完整配方訓練。[IR3報告](IR3_DEVELOPMENT_REPORT.md)。

前次24步本機 LoRA：原文判讀71/96→90/96，但完整英雄編譯2/4→2/4、李星新增負向檢查0/3→0/3，完整核准仍0。adapter僅保留研究。12位／72項判讀標籤准入的是辅助訓練，不是完整六槽配方；222舊映射仍隔離。[LoRA完整報告](LORA_FACT_PILOT_REPORT.md)。

- [新版目標與驗收計畫](PLAN.md)
- [兩位模型逐槽人工診斷](IR4_CONTROL_MANUAL_REVIEW.json)、[GPU收據](IR4_CONTROL_GPU_VERIFICATION_V1.json)、[34項新測試與資料核對](ir4-mask-stage-verification-v1/manifest.json)。
- [兩位六槽完整候選及事件](whole-plan-candidates-v3/whole-heroes.private.json)、[反例逐項證據](whole-plan-mutation-audit-v2/cases.json)、[52項CPU與hash收據](whole-plan-work-verification-v1/manifest.json)。
- [IR3四位逐份人工診斷](IR3_JSONSCHEMA_MANUAL_REVIEW.json)、[9位完整意圖資料](whole-intent-review-v1/manifest.json)、[原生能力及測試誤差校正](extension-admission-v3/manifest.json)、[54項CPU檢查](ir3-extension-tests-v1.txt)。
- [LoRA配對逐例結果](lora-facts-pilot-v1-assessment/cases.json)、[16位判讀人工審查](FACTS_PILOT_MANUAL_REVIEW.json)、[原權重／資源收據](LORA_FACT_PILOT_GPU_VERIFICATION_V1.json)。
- [上一輪純prompt／schema改善](IR2_DEVELOPMENT_REPORT.md)，不與本輪LoRA增益混算。
- [44 英雄／264 槽來源盤點](intake-v1/REPORT.md)：舊映射未自動升格訓練正例，所有既有英雄已曝光，不當新盲測。
- [37 英雄／222 槽逐份來源審查](community37-source-review-v1/README.md)：完整原文／身分／文末審查段落、逐槽註記與4項明列歧義；36名僅為未准入候選。
- [IR 與引擎能力邊界](CAPABILITY_BOUNDARIES_V1.json)：27段連擊、受傷喚醒、carry、form、proxyCast；結構證據不代替完整行為。
- [8 英雄初次来源條件標定](source-review-v1/manifest.json)：194 條證據、4 個跨槽關係，不等於完整 Gold 審查。
- [當前引擎快照](current-engine-v1/manifest.json)及[65 項既有測試收據](current-capability-tests-v1.json)。
- [4 槽真實行為前後對照](behavior-probes-v1/manifest.json)及[逐例事件](behavior-probes-v1/cases.json)。
- [GPU 啟動前檢查](gpu-preflight-v1.json)、[4 英雄開發小測協定](development-smoke-v2/manifest.json)、[執行狀態](development-smoke-v2/state.json)。
- [LoRA 技術驗證](lora-compat-v2/result.json)、[獨立收據核對](GPU_VERIFICATION_V1.json)。
- [IR 人工 fixture 4/4 編譯](ir-compiler-check-v2/manifest.json)、[21/21 針對性模擬](ir-fixture-probes-v2/manifest.json)：工具證據，不是模型成績。
- [IR 實際模型結果](ir-smoke-v1-assessment/manifest.json)、[新 GPU 收據](IR_GPU_VERIFICATION_V1.json)：原始答案不修補，未通過仍隔離。

## 已確認、但容易訓練錯的四個槽

| 槽 | 來源必要語意 | 舊映射實測 | 研究修正實測 |
| --- | --- | --- | --- |
| 拉克絲 E、好運姐 E | 3 秒、每秒極小級傷害 | 三次命中，但每次只有完整級距的 1/3 | 三次完整級距；離開後不再命中、後來進入可命中 |
| 好運姐 R | 指定有界區域、六發物理彈幕 | 第一發後離開仍吃六發；後來進入 0 發 | 第一發後離開只吃 1 發；後來進入吃剩餘 5 發 |
| 齊勒斯 R | 選定落點、三發、不可重新瞄準 | 第一發後離開仍吃三發；後來進入 0 發 | 第一發後離開只吃 1 發；後來進入吃剩餘 2 發 |

兩個 seeds 得到一致邊界結果。修正使用現有合法效果序列，沒有改引擎或來源。R 的幾何與時序未全部由原文明示，研究參數不是 Owner 最終裁決；四槽均未冒充整隻英雄 Gold。原 `random-barrage` 本來就記錄了 DoT 近似，因此這是來源與映射不符的證據，並非新發現的產品回歸。

## 重跑

Node 資料工具使用工作區根目錄；產生器拒絕覆寫輸出，請使用新的輸出名稱。

```sh
node --test outputs/hero-forge-12b-restart-20260908/normalize.test.mjs outputs/hero-forge-12b-restart-20260908/intake.test.mjs outputs/hero-forge-12b-restart-20260908/replay.test.mjs outputs/hero-forge-12b-restart-20260908/source-review.test.mjs outputs/hero-forge-12b-restart-20260908/smoke-contract.test.mjs
```

編譯／模擬工具從 `GGD-community-hero-forge` 目錄使用 `node --import tsx` 執行；tsx CLI 在目前沙箱的 IPC socket 被拒絕，所以使用無該 IPC 的 Node loader。當釘選程式或目錄改变時，工具會拒絕沿用快照，需另立版本。

GPU 小測是有界研究用監督器，不是正式服務。既有 run 不可直接覆寫重啟；需要續跑時先保留停止原因和 partial 結果，再新增明確續跑版本。把 `STOP` 放進本次 run 目錄即可要求停止；不會清除舊研究的 STOP 或動到其他任務程序。

IR 工具從 `GGD-community-hero-forge` 目錄執行：

```sh
node --import tsx --test ../outputs/hero-forge-12b-restart-20260908/semantic-ir.test.mts
node --import tsx ../outputs/hero-forge-12b-restart-20260908/ir-compile-check.mts ../outputs/hero-forge-12b-restart-20260908/ir-compiler-check-rerun
node --import tsx ../outputs/hero-forge-12b-restart-20260908/ir-fixture-probes.mts ../outputs/hero-forge-12b-restart-20260908/ir-fixture-probes-rerun
```

本輪收尾：IR5 已分離吟唱必要性與未知秒數，完成同契約配對，但未證明收益。封存 scripts、資料、權重與完整負面結果，交付專用分支／PR。未來若重啟，須另行固定更獨立且多樣的資料及研究假說；不把本輪 loss 下降當擴訓依據。最終獨立留出及完整英雄資格仍未完成。

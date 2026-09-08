# [一般][feature] 第二批 37 名惡搞英雄完整生成驗證集

## Objective

為基底／微調 12B 的完整英雄生成能力建立獨立比對資料；不是擴充訓練集，不啟動模型訓練。

## Scope

依《第二批37全自動創建英雄名單.md》產生題目、完整六槽教師成品、出身屬性、技能機制、特效模板綁定、逐名審查及腳本驗證證據。37 名全部保留。後續使用者已允許大膽惡搞重設與現有機制拼裝，取代原草案較嚴格的原作技能還原要求。

## Files / modules likely affected

- `tools/editor-acceptance/batch2-37/`：版本化配方與檢查程式。
- `docs/_reports/hero-validation-batch2-37/`：資料集、證據、審查與工作流入口。
- `docs/editor-contract/coordination/claim.hero-validation-batch2-37.json`：完成後的實證交接。

## Implementation constraints

不改引擎、schema、全域平衡或其他任務工作樹；只組合正式 enabled 模板與現有效果。詛咒／致盲／混亂直接重用既有標籤與施加配方。不得用基礎編譯通過冒充完整機制、素材或對局驗收。二進位素材不進 Git。

## Acceptance criteria

- [ ] 37 名完整教師成品、222 槽，包含生成需求、設定與兩條有條件的連動。
- [ ] 至少一次逐英雄完整自審，保存發現及修訂，不預先填通過。
- [ ] 正式 schema／模板編譯、引用、行為與序列測試通過；保留未驗證層級。
- [ ] 如月電車：周圍多名敵人隨機合法傳送後同時套用既有三狀態；固定亂數可重現，友軍不受影響。
- [ ] 模型可見題目與不可見教師／評分答案分離；不得自動併入訓練。
- [ ] 證據依引擎、配方及資料雜湊綁定；受影響資料更動會使舊證據失效。
- [ ] commit + push + PR，以專案既有 CI 與 review 流程合併，不略過紅燈。

## Test / verification criteria

先執行批次專用 schema／compiler／SimWorld 驗證及有限負例，再一批跑專案規定的 skills、editor release、coord 閘。腳本結構合法、編譯通過、行為通過、完整素材與上場驗收各自報數；未完成者不計為合格黃金資料。

## [思考策略]

需求先固定 → 既有能力組合 → 教師自審 → 正式執行器測效果 → 驗證集隔離 → 可重跑交接。惡搞不受原作招式束縛，機制正確性仍需證據。

## [解決模板]

N 個英雄 = 可重用效果組合 + 明確逐英雄配方；產生器與檢查器共用正式引擎，不以腳本替模型補語意。

## Dependencies / Non-goals / Known risks

依賴凍結的 GGD 能力版本、素材目錄與 GitHub CI。非目標：fine-tune、引擎補功能、正式站投稿／部署、圖片生成。部分人物缺原作模型，代理與電車外形的實際驗收需分開記錄。這批如用來挑模型或改提示，應稱開發驗證而非最終盲測。

## Owner decisions

逐字原話與電車三狀態需求保存在 `tools/editor-acceptance/batch2-37/decisions.json`。本文件是開票來源，尚不代表已完成驗收。

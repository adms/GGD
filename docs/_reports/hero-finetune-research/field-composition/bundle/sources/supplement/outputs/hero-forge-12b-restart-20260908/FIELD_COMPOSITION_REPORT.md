# 指定地點領域：替代配方對照結案

結論：不採用 `delayed(single, frozen) → damageArea` 替代現有週期領域。這是合法內容配方的負面結果，不是模型訓練，也不是所有可能配方的不可行證明。

## 方法與結果

`audit-field-composition-v1.mts` 一次執行三位已曝光開發英雄（拉克絲 E、好運姐 E、齊勒斯 R）× 兩個 seeds × 初始空地／敵人在中心／敵人偏離中心 × 後來在圈內／圈外 × 兩種配方，共 72 個 SimWorld 情境。

兩組皆從 HeroProject 重新經 schema 與正式編譯器處理，不直接改寫 runtime mirror。完整 sourceDesign 及其他五槽保留；圈半徑、傷害級距、三發與原有時間參數沿用。每個情境均確認落點未被射程夾限、註冊內容一致、180 幀敵人沒有移動偏差；施法後將施法者移開以排除身體分離干擾，未停用一般身體碰撞。

| 配方 | 通過 | 偏移情境的錯誤錨點 | 敵人到圈外仍被擊中 |
| --- | ---: | ---: | ---: |
| 原本 circle / reresolve / damage | 24/36 | 12/12 | 0 |
| 候選 single / frozen / damageArea | 18/36 | 12/12 | 12 |

本次擴大了既有反例的幾何情境，分母與舊 18 例不同，不能說原配方變好或模型退化。候選測試退出碼 1 是如實拒絕，原始 manifest、事件、幀與編譯成品保存在 `field-composition-audit-v1/`。全部 72 例位置治具檢查有效。

## 原因

先前提出的替代假設以為 ground 施法的 targets 是空陣列，實際並非如此：

1. `abilitySystem.ts:688` 先用 `groundAoeTargets` 帶入初始圈內敵人。
2. `shapeTargets.ts` 的 single 複製上游 targets，不會清空它。
3. `delayed.ts` 在 `anchor: point` 下仍優先取第一個 frozen 敵人的位置；single 並未修正落點。
4. 每次延遲執行把 frozen targets 傳給 `damageArea`；後者再優先以該敵人的當前位置當圓心，因此離開指定區域的人仍會受傷。

另有未當成正例放行的契約差異：damageArea 的半徑不套用 combatEnv.abilityRange，且有 20 目標上限；不能只靠預設環境的傷害次數相同，就稱一般語意等價。

## 資料與自動化處置

- 候選隔離、不進正式訓練；不改歷史配方、既有分數或引擎。
- 沒有模型推論、GPU 訓練、雲端花費或 adapter 啟用。
- 真實資料閘門重新驗證：44 英雄／264 槽，完整正式訓練准入 0，新獨立留出 0；七項 ledger 測試通過。這是准入狀態，不是宣稱全體資料不可修復。
- 原八項問題清單和新增三個領域問題分開保存；本次是同三槽的替代配方反例，不新增三名英雄、不增加三個獨立來源問題。
- 沿用既有 Main 點位機制問題；不為相同問題另開重複票。這批詳細診斷的公開推送仍待明確批准，沒有繞過先前被拒絕的公開留言。

## 重跑

在記錄的 isolated-engine-v1/GGD-community-hero-forge 目錄，以其相鄰研究腳本和新輸出路徑執行：

```sh
node --import tsx ../outputs/hero-forge-12b-restart-20260908/audit-field-composition-v1.mts ../outputs/hero-forge-12b-restart-20260908/field-composition-audit-rerun
```

預期退出碼 1。腳本拒絕覆寫，檢查引擎與目錄 pins。這不是依賴安裝器；須還原既有研究包與相同引擎版本。正式全自動英雄模型仍未合格。

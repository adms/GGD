# 正式訓練資料准入現況

完整目標仍未達標。現在可重跑地確認：現有 44 名／264 槽都有過往來源閱讀記錄，但沒有可直接整批投入的完整可執行 Gold，也沒有未曝光的最終独立留出。將既有模板全部餵回去，會把不在原文裡的機制一起訓練進去。

## 本輪完成

- `source-admission-ledger-v1/ledger.json` 整合全部 44 名、33 個暫定來源家族，核對完整英雄與每槽來源 hash。9 名有更細的完整意圖標註，仍不等同逐原子語意與全部行為認證。
- 8 個具體問題逐筆保存原文、source SHA、類別及證據入口：4 個來源歧義、3 個既有配方的未明示附加機制、1 個指定空地彈幕錯誤。這不是所有尚未完成機制的總數。
- `audit-source-additions-v1.mts` 重新編譯兩個原始英雄配方並核對凍結 reference，在兩個 seed 實測三種現象；6/6 觀察確認。這是證明問題存在，不是六項來源準度通過。
- 清單工具 7/7 CPU 測試通過。`verify` 正常 exit 0；`check-training` 正常拒絕並 exit 2，表示正式資料未准入。沒有生成冒名的正式 train.jsonl，也沒有重啟 GPU。

## 三個新確認的來源／配方差異

| 槽 | 原文明示 | 實際額外行為 | 資料處理 |
| --- | --- | --- | --- |
| 卡爾瑟斯 PASSIVE | 每場一次，致命傷消耗一層並回血；死後不能施法 | 另有 0.5 秒物理／魔法／真傷免疫及免控；下一發真傷實際被擋 | 不能教成來源必需機制；既有模板 `lethalMode=save` 固定帶至少 0.1 秒無敵 |
| 卡爾瑟斯 W | 指定敵人命中後減速 35%，2 秒 | 另造成一發魔法傷害 | 「命中」不自動等於「傷害」，額外傷害不得冒充來源標籤 |
| 好運姐 EX | 自身全傷害護盾，3 秒，掩護換位 | 另有極小級移速加成 | 加速不得從「掩護換位」默認成必要機制 |

來源沒有明說這些附加效果，也沒有逐字禁止。因此它們是 **未獲來源支持的附加機制**，不是 literal-negative Gold；不能再把「沒有明說」訓成「明確禁止」。若保留為創意建議，必須與忠實還原分欄。

卡爾瑟斯原生引擎的 MarkLethalRule 可以表示不同 selfEffects；目前限制在 `tpl-mark-stacks` 的固定無敵輸出，以及 HeroProject 禁止覆寫 marks 的產品合约。不能誤報成「引擎完全沒有免死能力」。

## 空地彈幕的安全替代檢查

重新檢查 `randomArea` variant、schema、handler，`delayed` 的固定／跟隨錨定，以及 `proxy-cast`／`random-barrage` 模板。未找到本次已驗證、可忠實替代的空地散布組合：

- `randomArea` 明示只有 self／target，沒有 point 選項；無首個實體時回退 caster。
- `delayed` 可保留空地點，但自身不做隨機散布；包住 randomArea 也不會消除後者的 caster 回退。
- `proxy-cast` 沒有可承載任意巢狀散布的參數；`random-barrage` 仍是綁在初始單位上的 DoT 近似。

這是有限範圍的契約／程式檢查，不是假裝窮舉全部可能圖。現有 `question.ground-barrage-anchor` 協作票件已在本地提交，尚未推送；需要合法新組合的證據或對應能力修正，不能只改研究分數。

## 一鍵資料閘門

从工作區根目錄執行：

```sh
node outputs/hero-forge-12b-restart-20260908/source-admission-ledger.mjs verify outputs/hero-forge-12b-restart-20260908/source-admission-ledger-v1
node outputs/hero-forge-12b-restart-20260908/source-admission-ledger.mjs check-training outputs/hero-forge-12b-restart-20260908/source-admission-ledger-v1
```

退出碼分别应为 0 和 2。这个閘門用於新的正式真實英雄資料擴訓，不回改既有合成 IR5 控制實驗。來源、審查標記、原始行為證據或腳本有變動，都須新版本與重驗；單純把 trainingAdmitted 改 true 會被拒絕。

## 仍需外部輸入與後續順序

1. 尚未曝光的完整英雄原文：本輪已詢問使用者檔案位置，未取得。來源／機制家族分組與隔離須在新推論前固定；不能把舊 44 人改名當新盲測。
2. 將既有 Main 協作票件推送到 PR 的授權：持續目標明定不自動發布／推送，因此目前只做本地提交，不宣称 Main 已收到本輪票件。
3. 來源與可執行配方的差異解除後，重新跑同一套正反例才准入；接著建立新的同契約基底／LoRA 對照。數值可調提案與機制未知不混為同一種 blocker。

最新已完成的模型對照仍是 JSON 6/6、完整 IR／編譯／工程通過 0/6。沒有新模型收益，沒有啟用任何 adapter；本輪不重複消耗 GPU 來迴避資料品質問題。

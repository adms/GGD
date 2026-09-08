# 第二批37名：12B完整英雄生成驗證集接收與抽驗

結論：**37名／222槽已接成獨立驗證資料集，不加入訓練。** 本次風險抽驗5名／30槽，25項檢查全部通過；沒有重現到確定的機制錯誤。不是37名完整人工審查、正式遊戲驗收或模型品質分數。

## 固定版本與交付

- 資料與驗證器來源：`0a8da174ead82e2241fa595d0f1c37f3194df334`，引擎版本見 `intake.json`。這是修正跨技能因果測試後的版本，不沿用較早 `7a618cd93` 的驗收結論。
- `intake.json`：121份讀入來源的位元組hash、37名分组、凍結訓練集比對與上游收據檢查。
- `cases.json`：37個完整英雄驗證案例及各自公開題目／私有教師／編譯結果的路徑。
- `rubric.json`：比較對象、品質優先度、等價設計與資訊隔離政策；不是已完成的通用候選輸出行為評分器。
- `sample.json`：本次重新執行的抽驗結果。原始時間線gzip留於本機驗證集，檔案hash記錄於此，不把二進位放Git。
- 本機資料入口：`outputs/hero-forge-12b-restart-20260908/batch2-validation-v1/`（相對ABxVFX_EDIT工作區）。公開輸入39檔＝37題＋共用目錄＋1個原創電車GLB。

`model-input/`是唯一可掛載給受測12B的目錄。`evaluator/`含37份教師HeroProject及37份compiled答案，僅供評分端使用。`cases.json`、抽驗報告及全角色清單也不提供給受測模型。私有是邏輯分隔，不能用同一個可讀整庫的檢索工具繞過。

## 本次做過的驗證

1. 37名全量來源、題目、教師、compiled、來源審查hash與六槽一致性核對；使用上游唯讀 `check.mjs --receipt-only`，exit 0。
2. 另執行上游唯讀 `check.mjs`，exit 0；核对本機37個ZIP及公開資產bytes。這只是檔案／收據核對，不冒稱本輪重新編譯全部英雄或重新生成ZIP。
3. 公開題目欄位白名單、私有答案路徑防漏、公開檔案範圍、重複ID與禁止訓練保護；4項工具測試通過。
4. 和當前凍結的124筆訓練／內部dev樣本（110 train＋14 dev）比對，已知正規化ID／別名／heroName精確重疊為0。比對前後檔案hash一致，沒有改動任何訓練資料。這不包含未提供的所有歷史訓練、別名或語意近重複，不能宣稱完全無曝光。
5. 實際讀取以下5名全部30槽purpose與compiled effects/passive，並執行CPU SimWorld抽驗：10組因果連動、每組4條對照共40條時間線，另含5個被動正反控制及10項額外斷言，共25項檢查通過。

| 角色 | 說明／機制重點與額外抽驗 | 結果 |
| --- | --- | --- |
| 岩谷尚文 | 六槽友敵與盾／治療一致；Q確實給隊友盾，不是自己盾；對敵Q拒絕；Q→W消耗標記與E→R接隊友 | 通過 |
| 遠坂凜 | 六槽儲存／消耗／返還對象一致；Q→W花掉nen-banked，未將回魔給敵人；E→R催款標記 | 通過 |
| 諾爾 | 六槽反彈收據／治療／護盾一致；物理技能來襲觸發反彈收據，魔法與真傷不觸發；兩組連動與被動對照 | 通過 |
| 羽賀 | 六槽標記來源／位移／沉默／驅散一致；無標記W不位移；E是沉默而非定身；Q→W與E→R | 通過 |
| 如月電車 | 六槽拉人／手閘消耗／位移／隨機分支一致；R三種狀態存在、友軍及遠處敵人不搬動、不加狀態，到期移除，固定種子可重現；Q→R與W→E | 通過 |

此抽樣是事先選定的高風險覆蓋，不是隨機抽樣，不能由5/5推估全庫正確率。重播使用上游固定SimWorld harness，另加本接收工具的斷言；不是一套完全獨立引擎。Rank 1、level 18隔離情境未涵蓋全部技能等級、多英雄交互、UI操作、渲染與平衡。特效本輪查模板與引用，沒有視覺品質評測。原作身分的外部來源未重新逐一考證。

## 保留的問題／評分限制

- **不是完整遊戲上場成品認證**：上游仍標記completeLiveHeroes=0、36名代理本體；遊戲匯入、操作、碰撞及完整對戰未驗收。這不阻止用作機制生成驗證，但不能當作已證明可上場的100% Gold。
- **不是严格盲測**：歷史曝光未完整簽核，本任務也已讀招名與抽驗教師。保留external-evaluation-only、trainEligible=false；不要回灌訓練、挑checkpoint或改prompt後仍宣稱最終盲測。
- **不能以私有答案新增需求**：多数公開題目未指定採用時期或完整原作能力，不能因12B未猜中教師私下選定的版本、招名、模板排列或跨槽設計而扣分。如月的明示要求則應按公開題目驗證。
- **教師專屬連招測試不可直接當通用模型評分器**：本次連招測試证明教師自洽；其他合理等價設計可接受，不要求同槽位或同狀態ID。候選輸出的通用行為驗收介接與A/B解碼設定仍須在模型推論前凍結。
- 上游明列11對共用子循環／相似家族；不將37名視為37種全然獨立玩法。

沒有發現需要另開一張重複機制修正票的確定錯誤；既有准入缺口沿用[#1142](https://github.com/adms/GGD/issues/1142)。本次不修英雄、不修引擎，也不替教師補答案。

## 自動化重現

在本研究repo執行，輸出目錄必須尚不存在：

```sh
node --test tools/editor-acceptance/hero-distillation-batch2-validation.test.mjs
node tools/editor-acceptance/hero-distillation-batch2-validation.mjs SOURCE_REPO NEW_OUTPUT docs/_reports/hero-finetune-research/distillation-training-v1/frozen-factorized/examples.json
node tools/editor-acceptance/hero-distillation-batch2-sample.mjs SOURCE_REPO NEW_OUTPUT
node tools/editor-acceptance/hero-distillation-batch2-validation.mjs --receipts NEW_OUTPUT NEW_RECEIPT_DIRECTORY
```

工具讀固定commit及hash，要求相關來源／引擎／content與該版本逐字一致；其他工作線只改不相關交接檔不會改變本資料版本。本次有一次在來源HEAD前進時由保護檢查停下，未啟動抽驗；確認相關檔案完全相同後，改用精確範圍位元組核對完成重播，未忽略資料差異。

**此次沒有啟動GPU、訓練或12B推論，沒有新增模型分數，沒有push／合併或正式上架。**

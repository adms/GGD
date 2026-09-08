# IR4 與完整六槽候選：資料品質驗證報告

日期：2026-09-08，Asia/Taipei。

結論：拉克絲、齊勒斯的兩份人工六槽計畫已可編譯，最新 58/58 針對性檢查通過；新增 52 項契約／原生動作測試通過。這是資料與驗證工具的進展，不是新的模型成績、正式訓練正例或全自動成功率。本批沒有 GPU 推論或訓練；本機 GPU 授權仍有效，雲端 GPU 支出仍為 0。

## 1. 本批交付

- [IR4 契約](ir-v4.mts)及[確定性編譯](ir4-compiler.mts)：保留 IR2 引文與關係檢查，加入純位移、自己最大魔力比例回復、沿線分段命中，共 22 種動作。原 19 種子動作仍維持舊契約，暫不接受巢狀新動作。不是採用表現較差的 IR3 短契約。
- [兩份六槽來源計畫](whole-plan-seeds-v1.mts)、[最新完整原文／編譯／事件與逐 tick 證據](whole-plan-candidates-v3/whole-heroes.private.json)。重新讀完整 GGD 改編原文，不以 LoL 常識補機制，不複製舊映射。
- [52 項 CPU 測試](whole-plan-work-verification-v1/cpu-tests.txt)：其中 IR4 26 項含四份既有 fixture 的專案、編譯結果完全相等與原行為回歸；原生動作另 26 項。這不是 52 個模型樣本。
- [反例原始結果](whole-plan-mutation-audit-v2/cases.json)及[独立收據核對](whole-plan-work-verification-v1/manifest.json)。兩個 seeds 是重複性檢查，不是兩倍獨立英雄數。

## 2. 正例結果與測試修正

| 檢查版本 | 拉克絲 | 齊勒斯 | 變更原因 |
| --- | --- | --- | --- |
| [v1](whole-plan-candidates-v1/manifest.json) | 24/26 | 28/32 | 首版對護盾儲存及地面超距行為的測試假設錯誤 |
| [v2](whole-plan-candidates-v2/manifest.json) | 26/26 | 32/32 | 只計有效護盾，實際補打一發；超距改查落點限制與遠方不命中 |
| [v3](whole-plan-candidates-v3/manifest.json) | 26/26 | 32/32 | 加入原文明示級距與實際 runtime registry 核對 |

三版使用完全相同的原文、IR、編譯配方；沒有修改引擎、把失敗例刪掉，或回改舊分數。

護盾陣列可以保留已過期物件，但傷害結算會忽略它。v2 驗證 91 ticks 後新增真實傷害確實扣血。地面施放的原生行為是把點限制在射程內，不是回覆 targeted 技能的 out-of-range；齊勒斯 Q/R 的實際落點分別受大／極大級距 8/12 約束，遠處敵人不被命中。這些是測試修正，不是已確認的產品回歸。

## 3. 故意做錯，驗證是否攔得住

[首批反例](whole-plan-mutation-audit-v1/manifest.json)攔下 21/27；[修正版](whole-plan-mutation-audit-v2/manifest.json)攔下 26/27，所有被攔反例在兩個 seeds 都失敗，且沒有因 runtime mirror 不一致而算作攔截成功。

修正的漏檢包括被動傷害級距、每秒傷害誤除以三、移速級距、齊勒斯 W 傷害級距。原先只驗「每次相等／有傷害／有加速」不足；現在額外比對原文明示級距與凍結的引擎級距表。參數可調不代表可以把來源明說的級距判錯。

另一項是反例注入錯誤：測試 harness 以 champion 的 embedded 技能覆寫 registry。修改共用巢狀物件會生效，但重新指定 cooldown 陣列不一定同步 embedded 版本。新反例同步四個鏡像，並在每次 probe 先核對實際 registry；齊勒斯 R 的錯誤重放因此被抓到。這不是模型或產品本身的錯誤。

剩餘 EX 反例：原文只要求受 EX 冷卻限制，沒有寫 60 秒。候選的 60 秒來自既有組裝政策，不能訓練成「原文明示數字」。[冷卻專項實測](WHOLE_PLAN_COOLDOWN_AUDIT_V1.json) 4/4 證明：

- 候選：初始 1,800 ticks，立即及第 4 tick 都拒絕重放。
- 零 authored cooldown：引擎仍給 3 ticks（0.1 秒）下限，立即拒絕，但第 4 tick 可重放。

因此「立即第二次按鍵被拒絕」不足以驗證持續冷卻。原 26/27 保留；此項是需要增加延遲邊界與獨立組裝政策檢查的證據，不把未知原文數值硬判成語意錯誤。這些反例直接注入編譯後 runtime；未重新編譯 template binding。驗 author schema 時僅在檢查副本移除 compiler 已解析的移速值，runtime 本體不變；不能稱為完整套件往返驗證。

## 4. 逐英雄資料狀態

拉克絲六槽已涵蓋普攻追加與 ICD、指定一人鎖足、自身全傷害護盾及保留較大值、固定落點逐秒重判、四段可重複命中、自己回血與三秒移速加成；未替 Q 補原文沒說的傷害。跨槽沒有原文未授權的標記需求、法術觸發被動或自動位移。光束幾何、未知傷害／半徑等仍是研究提案，現有線段檢查不等於所有空間邊界已驗完。

齊勒斯六槽已涵蓋被動不回魔、吟唱後四段、地面爆破、固定 0.8 秒指定暈眩、固定落點三發不可重瞄、自己回復 15% 最大魔力及魔法護盾。Q 的同一人能否重複受傷，來源未指定；目前 once_per_cast 是研究選擇，`trainingLabelEligible=false`，不得灌成唯一正解。EX 護盾秒數與疊加政策也非原文明示。

兩位都是已曝光的歷史改編來源，不是新 Owner 核准或盲測。仍為 0 份完整六槽 SFT 新准入、0 隻正式全自動核准。局部 auxiliary 判讀資料資格不因此撤回或升格。

## 5. 下一步與 GPU 條件

1. 把 EX 延遲冷卻及繼承政策檢查分欄；補全來源條件／空間邊界覆蓋表。不得從局部全綠直接升格完整 Gold。
2. 讓來源未知的分類選擇可以明確保留待定或在 SFT 中遮罩，不訓練成既有模板預設正解；用兩份六槽配方作工具控制組，再擴充可審查的來源。
3. 在同一固定 IR4 契約下建立完整機制輸出的小規模 base／LoRA 配對。對照觀察重點是六槽與關係是否變好，不是再追分類題或 loss。
4. 本機 GPU 可用，不需重問授權；仍一次一個 worker、啟動前檢查接電與資源，有界訓練及停止點。沒有足夠正例／獨立評估前，不擴大訓練。

引擎依然釘選到 `382fd664303a31ed56cb5a9d7832778a059f671c` 的隔離副本；node_modules 是既有依賴連結，並非完整可攜依賴封存。本批沒有修改 Main 的引擎、schema、live content，沒有發布或推送。

重跑：由隔離 repo 執行 `node --import tsx ../outputs/hero-forge-12b-restart-20260908/build-whole-plans-v3.mts ../outputs/hero-forge-12b-restart-20260908/whole-plan-candidates-rerun`。反例用 `whole-plan-mutations-v2.mts` 加新的輸出目錄；目前因保留 EX survivor 預期 exit 1，不把它當成功 exit 0。收據核對由工作區根目錄執行 `node outputs/hero-forge-12b-restart-20260908/verify-whole-plan-work-v1.mjs outputs/hero-forge-12b-restart-20260908/whole-plan-work-verification-rerun`。舊目錄拒絕覆寫。

# 英雄技能鑄造小模型：最終研究報告

2026-09-07｜Mac-only｜4B 不推理｜停止新增實驗、訓練與 GPU 推論｜研究模型未達正式部署門檻

## 一、結論

**微調有局部收益，但沒有得到可穩定優於基底、可放心全自動使用的模型。** 來源判讀在部分歷史題改善，新七角色與新 37 名英雄卻沒有勝過基底；機制推薦出現「更敢推薦，卻忽略必要限制」的退步。不能靠混合平均分或格式合法宣稱成功。

本次研究到此收尾。最後一批 373 題原文判讀已完成，不再補跑剩餘 1072 題，不啟動 R8，不恢復訓練、不量化、不發布或啟用 Editor。後續若要再做實驗，須重新獲得使用者明確授權；舊目標文字不能當成自動重啟許可。

## 二、可以直接比較的結果

每列內三模型對相同輸入配對；不同列的來源、暴露與條件不同，不合併成一個品質總分。數字為正確數／分母，括號是該任務定義的錯誤放行數。

| 題組 | 基底 4B | R3 | R7 |
| --- | ---: | ---: | ---: |
| 舊主隊列英雄設定 | 322/348（誤放行 4） | 338/348（誤放行 0） | 339/348（誤放行 0） |
| 舊主隊列機制原文先完成部分 | 542/606（誤放行 15） | 566/606（誤放行 5） | 564/606（誤放行 5） |
| 最後補完的機制原文 | 342/373（誤放行 14） | 355/373（誤放行 8） | 355/373（誤放行 8） |
| 新 37 英雄來源判讀 | 529/555（誤放行 1） | 500/555（誤放行 1） | 511/555（誤放行 1） |
| 主隊列機制計畫 | 212/295（誤放行 22） | 180/295（誤放行 110） | 212/295（誤放行 76） |
| 另列機制組合補充 | 17/20（誤放行 1） | 12/20（誤放行 8） | 12/20（誤放行 8） |

新七角色（沃維克、卡爾瑟斯、拉克絲、犽宿、好運姐、李星、齊勒斯）147 題：基底 139、R3 134、R7 135，三者誤放行均 0。這是舊 954 題內的子集，不是額外 147 題；微調主要把明確矛盾判成未提及。

主隊列機制計畫原始 296 輸入，1 題在推論前撤回，只計 295。這 295 題只有 158 種需求文字，含兩版候選目錄；39 個輸入精確匹配 R7 訓練資料，不是全新泛化測試。

最後 373 題的失敗聯集 33 題已全部助理覆核，另有 1 題「0 秒冷卻是否含內置冷卻」Gold 歧義；保留凍結分數，排除此題的敏感度為 base 342/372、r3 355/372、r7 355/372。歧義題不作新訓練正例。這不代表其餘 Gold 已取得獨立人類認證。

## 三、最重要的洞察

1. **推薦能力與拒絕邊界必須分開。** R7 在可接受計畫上由基底 65/147 提升到 116/147，但應拒絕需求由 147/148 降到 96/148；總分同為 212/295，錯誤放行卻由 22 增至 76。漏掉共享冷卻、跨目標、延遲、護盾或反击範圍，不是次要參數問題。
2. **不能只修輸出格式。** 機制計畫中，R7 仍有 58 題是契約合法卻機制錯配。Script 檢查 JSON、合法 ID、已批准組合很重要，但不能單獨證明原文所有條件被滿足。
3. **來源理解有局部進步，不是穩定泛化。** 歷史來源題的主要收益包含避免把冷卻當持續時間、射程當半徑、命中標記當消耗標記；新角色結果卻退步。R7 完整訓練匹配的 39 個計畫輸入答對 34，其他 256 輸入答對 178，仍低於基底 189。不能據此單獨診斷過擬合成因。
4. **「沒說」不等於「否定」。** 來源判讀需一致界定 supported／contradicted／not-stated；永久與暫時、生命歸屬、效果順序必須精確。原文省略時不該靠遊戲常識補完，標註政策也不能看模型答什麼再改。
5. **簡單模板分類未證明需要微調。** R1 單一合成語法上，事後規則 48/48、LoRA 47/48。較廣來源理解中非 LLM 基線也有明顯不足，但這不代表目前微調已勝過可靠規則＋人工審查工作流。
6. **沒有逐輪穩定收斂。** Loss 降低不等於機制正確；R6 新 checkpoint 未守住原能力而被拒，R7 降學習率後仍未整體勝出。資料補強、拒絕邊界對比題可能值得未來獨立驗證，但本次沒有證明「繼續加資料／訓練就會好」。

## 四、資料集交付與品質狀態

| 資料 | 現況與使用限制 |
| --- | --- |
| 舊 1872／188／260 | 共 2320 列，未直接認定為正式 Gold；依家族問題隔離／重建。497 筆歷史機制中仍有 480 筆未逐筆核驗。 |
| 歷史盤點 | 45 份、22386 歷史列含大量版本複本；八個主要來源合併得到 2695 個完全 messages 去重輸入。不是同等數目的獨立機制。 |
| 新 37 英雄校正包 | 37 身分＋222 技能槽，共 259 份來源、555 個來源判讀命題；82 槽校正／隔離說明。 |
| 新 37 英雄原模板映射 | 222 槽全部隔離，0 槽獲准作原意→模板正例；編譯與 ZIP 往返不等於機制忠實。 |
| 新 555 題 | train-candidate；沒有用來訓練三個受測模型，不是獨立 Owner Gold。automaticMerge=false、TRAINING_DISABLED 保留。 |
| 原始交接 HeroProject／ZIP | 未修改，不能把校正參考資料當可投稿的遊戲內容修正版。 |
| VFX 範圍 | 僅既有模板推薦，不訓練特效微調參數，也不做視覺驗證。 |

[校正資料入口、重建與檢查方法](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/community37-corrected-dataset-20260907-v1/README.md>)

覆核不是全量人類 Gold：舊 954 題失敗聯集 104 題中只記錄 67 題個案複查，剩 37 題未聲稱人工裁定；新 555 題的 55 題失敗、組合補充 9 題失敗、計畫 152 個失敗輸入對應 89 種需求，以及最後 Owner 批次失敗均有助理覆核。這些分母可能有語意重疊，不加總成獨立審查數。

## 五、時間與記憶體

歷史訓練收據：

| 輪次 | 訓練 worker 分鐘 | Metal 峰值 GiB | 結果 |
| --- | ---: | ---: | --- |
| R1 | 35.007 | 17.792 | 单一合成任務，未合格 |
| R2 | 84.679 | 36.198 | 不含英雄來源任務 |
| R3 | 108.632 | 21.883 | 保留 epoch2 作研究對照 |
| R4 | 131.530 | 21.883 | 未證明優於 R3 |
| R5 | 85.028* | 39.972 | 原流程失敗，未採用 |
| R6 | 75.644 | 59.007 | 新 checkpoint 均拒，保留原 R3 |
| R7 | 80.077 | 59.007 | 部分停止，保存 step48；未整體勝出 |
| R8 | 未訓練 | 未測 | 沒有權重 |

*R5 為逐例計時總和，口徑不同；不含資料審查、評測、下載、其他失敗試跑或 Codex 推理時間。來源：[逐輪帳本](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/forge-final-three-hours-20260906/experiment-ledger-inference-only-v1/LEDGER.md>)。

近期完成推論：新 555 題 11.80 分鐘，20 題補充 1.38 分鐘，296 個計畫輸入 20.53 分鐘，最後 373 題 8.92 分鐘；皆為三臂 worker 合計，另有檔案校驗時間。Metal 約 8.53–9.72 GiB，不是整機 RAM、耗電量或 16GB 機器驗收。

全程 Mac-only，沒有雲端 GPU，雲端 GPU 費 USD 0；Codex 費用與電費沒有可靠量測，不能稱整個實驗免費。充電問題沒有瓦數資料，不判定電池／充電器故障。

## 六、模型成品與保存位置

交付的是**可重載研究模型與可追溯證據**，不是已驗收的正式全自動模型。基底為 Qwen/Qwen3.5-4B native BF16、MLX、不推理；R3／R7 是 adapter，需配合相同基底。沒有本次融合／8-bit 品質對照，沒有 16GB MacBook 實測。

- [R3 native 研究包：模型、授權、入口、契約範例](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/forge-final-three-hours-20260906/ggd-mac-r3-native-research-v1/>)。搬移後入口實測語意 7/10、契約 9/10；可載入不是語意合格。
- [R3 原生參照與 adapter 摘要](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/forge-mechanism-priority-r3-20260906/native-reference.json>)。
- [R7 step48 參照與 adapter 摘要](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/forge-low-lr-r7-v2-20260906/native-reference.json>)。

近期每個新推論 run 均核對相同基底與 adapter 前後雜湊；原舊取消 run 沒有 models-after，不能追溯補稱當時完成。沒有模型發布、Editor 啟用、push 或 PR。

## 七、主工作流回饋

先前已回饋 traveling-wave 終點傷害漏掉最後一步首次命中者的 [main 回饋紀錄](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/forge-final-three-hours-20260906/MAIN_FEEDBACK_STATUS.md>)（記錄票號 #1094；本輪未重新查遠端狀態）。新 37 英雄校正 ledger 可供主工作流修正來源配方。模型錯答、Gold 歧義不是新產品缺陷，不重複開票、不上傳私人資料或權重。

## 八、收尾界線與未完成事項

| 主隊列任務 | 已三臂配對／計畫 |
| --- | ---: |
| 英雄設定 | 348/348 |
| 技能原文機制 | 979/979 |
| 機制計畫（含單卡控制） | 296/296；正式計分 295 |
| 單模板推薦 | 0/700 |
| VFX 模板推薦 | 0/372 |
| 合計 | 1623/2695；准予計分 1622 |

剩餘 1072 題明列未測，不再自動執行。新 555 題與補充 20 題獨立，43 題 smoke 已包含於 555 題；不灌入主隊列分母。完整需求抽取、所有英雄機制組合、獨立 Owner Gold、量化品質、16GB MacBook 與遊戲端整合仍未完成。

依使用者要求，本次以報告、校正資料、已保存模型和原始證據收尾。原目標的「穩定更好的全自動模型」未達成，不追認成功；也不因目標仍存在而繼續消耗算力。

## 九、完整證據入口

- [最新報告索引](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/forge-final-three-hours-20260906/REPORT_INDEX.md>)
- [舊停止快照與完整歷史分析](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/forge-final-three-hours-20260906/FINAL_REPORT.md>)
- [新 37 英雄 555 題](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/community37-inference-full-20260907-v1/REPORT.md>)
- [機制組合 20 題補充](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/forge-composition-supplement-inference-20260907-v1/REPORT.md>)
- [全部機制計畫 296 輸入](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/forge-stack-full-inference-20260907-v1/REPORT.md>)
- [最後 Owner 373 題](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/forge-owner-remaining-inference-20260907-v1/REPORT.md>)
- [剩餘逐 ID 清單](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/forge-owner-remaining-inference-20260907-v1/main-coverage.json>)

原始資料／權重／private 檔只作本機交付，不新增公開分享或上傳授權。

## 十、後續獨立授權的27B基底比較（不改寫本次微調結論）

使用者後續選擇Qwen3.8-27B，已完成MLX 8-bit同96題不推理／medium兩臂。兩者均91/96、錯誤放行0；生成時間5.33對43.95分鐘。相同輸入的歷史4B基底78/96、R7 83/96；差異包含世代、參數量、精度和runtime，不能當成27B微調收益。

建議27B不推理為下一階段研究候選；未啟用Editor、未恢復訓練、未證明穩定全自動鑄造。96題全數有助理來源覆核，3個Gold政策疑義另報敏感度，非独立Owner Gold。所有本次程序已結束；Flash取消，無後續算力工作。[完整27B報告與證據](</Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/qwen38-local-comparison-20260907/FINAL_RESULT.md>)。

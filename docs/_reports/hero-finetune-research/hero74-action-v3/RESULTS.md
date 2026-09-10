# 12B bounded-action LoRA：實測結果（不通過）

## 範圍與資料

這輪將完整英雄生成拆成連續、有界的動作：identity、六個槽位的模板選擇、參照，以及最終受限 JSON。腳本負責候選集、狀態累積、JSON/schema 驗證、compiler、封裝與後續 E2E；LLM 只回答單一動作。這是為了量測每一個決策，不能將任意長的整隻英雄文字輸出當作成功。

- 訓練：2,116 個動作任務、59 名完整英雄。
- 內部開發回歸：586 個動作任務、15 名英雄。
- 評估集是已見內部開發集，不能當成未見英雄泛化；使用者尚未另提供最終盲測批。
- 本結果只比較本輪 Gemma 4 12B IT 8-bit base 與同一個 final LoRA；不比較舊 4B/9B/27B 研究結果。

資料定義與切分見 [README.md](README.md)；原始訓練、adapter 與推論證據位於工作區 `outputs/hero-forge-12b-restart-20260908/`，不納入 Git。

## 訓練收據

| 指標 | 結果 |
| --- | ---: |
| 更新步數 | 2,116 |
| 訓練時間 | 3,104.197 秒（51 分 44 秒） |
| Peak Metal 記憶體 | 14,676,512,422 bytes（14.68 GB） |
| dev mean CE（前 → 後） | 3.0525 → 0.7333 |
| final checkpoint | `checkpoint-2116` |
| adapter SHA-256 | `3029d4b3eb1f81259f72cd5d72fd0787585a0f4f009306a6d815b851416043fa` |
| adapter round-trip | 通過；8 個 LoRA tensor keys，reload loss 0.9397 |

CE 的下降代表模型對固定動作文字的 token 預測較接近訓練資料；它**不是**完整英雄、機制、特效正確率，也不是 E2E 成功率。

## 生成回歸結果

| arm | 嘗試英雄 | 有界 LLM calls | 零人工修正的完整英雄 | 結論 |
| --- | ---: | ---: | ---: | --- |
| Base | 15 | 15 | 0 / 15 | 不通過 |
| final LoRA | 15 | 61 | 0 / 15 | 不通過 |

LoRA 多做了 46 次有界呼叫，但沒有完成任何英雄；不能把「進到比較多的動作」描述成品質提升。

final LoRA 的終止失敗分布：

| 終止原因 | 英雄數 | 意義 |
| --- | ---: | --- |
| `ACTION_IDENTITY_INVALID` | 9 | 初始 identity JSON 無法通過受限格式 |
| `ACTION_INCOMPLETE_OR_INVALID_JSON` | 5 | 動作輸出不完整或 JSON 無效 |
| `ACTION_SELECTION_INVALID:PASSIVE` | 1 | PASSIVE 候選選擇不在允許集合 |

這表示目前瓶頸首先是輸出構成與動作契約，不是證明模型已能理解完整機制。無論 loss、adapter 重載、模板選擇局部命中如何，這組模型均不具備可上場英雄的自動產能。

## E2E 與品質門檻

| 門檻 | 狀態 |
| --- | --- |
| 完整英雄 95% 成功 | 未達成（0/15） |
| 零人工補填 | 未達成 |
| compiler/package/import/readback | 未量到模型 E2E；沒有一個可進入此階段的完整生成 plan |
| 實際對局／機制／特效正確性 | 未測 |
| 未見英雄盲測 | 未提供、未測 |
| 模型 promotion | 拒絕 |

流程型 E2E controller 曾因受保護 worker PATH 找不到 Node 而在前置失敗（`NODE_REQUIRED`）。此為自動化環境缺陷，不是模型分數；已將 Node binary 明確 preflight/傳遞，修正提交為 `98c8f1b68`。修正不能改變本次 0/15，也不能把沒有產生的完整 plan 偽裝為 E2E 通過。

## 可驗證的下一輪假設（尚未執行）

先不要擴大資料或重跑同樣訓練。下一個可證偽假設是：由腳本固定 identity/欄位框架、以受限解碼或 schema 產生每一步 JSON，讓 LLM 僅從受限候選集合選值，能否先使「無效 JSON／identity」從 14/15 降到可進入 compiler 的水準。這必須以新的 frozen setup 對同一 base 和 adapter 做一次配對評估，並分開報告：

1. 每一動作的合法率與選擇正確率；
2. 完整 plan 率與 compiler/package/import/readback；
3. 使用者提供的未見英雄盲測；
4. 最後才是 SimWorld／實際對局的機制與特效驗收。

若不先通過輸出契約，追加訓練資料或拉長 epoch 無法合理宣稱會改善全英雄 E2E。

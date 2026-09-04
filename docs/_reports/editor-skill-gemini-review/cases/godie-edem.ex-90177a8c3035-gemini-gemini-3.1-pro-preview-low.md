# VFX visual review: godie-edem.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 8.63s
- Source digest: `90177a8c30350e6841a3eedde6be20e9ea426da592bef36f6519e3b7adca56a3`
- Confidence: 0.500 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6, 7 | 可見紅色像素化燃燒範圍效果 |
| familyMatch | pass | 1, 2, 3, 4, 5, 6, 7 | 表現為紅色方塊狀燃燒特效，符合預期 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供明確來源要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | uncertain | — | 未提供機制描述或確切的十秒結束幀，無法確認 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 特效與角色及地面未見明顯穿模 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 特效與角色關係清楚 |

## Model notes

- 無法從純圖片推斷攻擊力降低或沉默是否同時存在。
- 無法確認燃燒是否剛好持續十秒。

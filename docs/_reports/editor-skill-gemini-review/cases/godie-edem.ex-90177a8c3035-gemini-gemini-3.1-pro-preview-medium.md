# VFX visual review: godie-edem.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 7.40s
- Source digest: `90177a8c30350e6841a3eedde6be20e9ea426da592bef36f6519e3b7adca56a3`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6, 7 | 可見紅色燃燒特效與大範圍指示圈。 |
| familyMatch | pass | 2, 3, 4 | 符合預期的燃燒視覺表現。 |
| colorMatch | uncertain | — | 未提供特定顏色要求。 |
| spawnOrigin | uncertain | — | 未提供生成位置要求。 |
| impactPlacement | uncertain | — | 未提供命中位置要求。 |
| temporalOrder | uncertain | — | 無法確認準時結束，因無後續幀。 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 特效未見明顯穿模。 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 特效與角色關係清楚，無過度遮擋。 |

## Model notes

- 預期提到了『持續十秒』及『準時結束』，但圖片只提供到10313ms，無法確認結束狀態。

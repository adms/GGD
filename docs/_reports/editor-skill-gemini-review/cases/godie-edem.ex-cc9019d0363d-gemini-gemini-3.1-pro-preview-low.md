# VFX visual review: godie-edem.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.97s
- Source digest: `cc9019d0363dcc541590b70bfada5dfab1ac316d9264b12b8f42d5fb7657d65f`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 4, 5, 6, 7 | 未見大範圍燃燒效果 |
| familyMatch | fail | 1, 2, 3, 4, 5, 6, 7 | 現有視覺不符合預期描述 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | uncertain | — | 無法確認準時結束 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 未見穿模/裁切 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 現有效果與角色關係清楚 |

## Model notes

- 畫面中僅有角色身上的小型紅色特效，未見大範圍燃燒
- 最後一張圖未顯示效果完全結束
- 無法從純視覺判斷沉默與攻擊力降低

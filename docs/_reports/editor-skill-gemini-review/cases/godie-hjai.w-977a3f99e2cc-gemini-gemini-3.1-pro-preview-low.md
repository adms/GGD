# VFX visual review: godie-hjai.w

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.78s
- Source digest: `977a3f99e2cc69362390cf179251e9a4c8ff2aeab7de1770047ab2919a17b92a`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | — | 預期效果（火柱、殘留DoT）在所有候選幀中均未出現。 |
| familyMatch | fail | — | 沒有可見的特效可以判斷其類型。 |
| colorMatch | uncertain | — | 未提供特定顏色要求且未見特效。 |
| spawnOrigin | uncertain | — | 未提供特定來源要求且未見特效。 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求且未見特效。 |
| temporalOrder | fail | — | 未見任何特效階段，無法確認時間順序。 |
| clipping | uncertain | — | 未見特效，無法判斷是否穿模/裁切。 |
| readability | uncertain | — | 未見特效，無法判斷其與角色/地面的關係。 |

## Model notes

- 所有候選幀中皆未看見任何技能特效（火柱、殘留DoT）。
- 因缺乏特效，effectPresence 和 temporalOrder 等必要檢查為 fail。

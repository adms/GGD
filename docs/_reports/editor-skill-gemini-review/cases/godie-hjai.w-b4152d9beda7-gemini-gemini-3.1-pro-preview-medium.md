# VFX visual review: godie-hjai.w

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 12.85s
- Source digest: `b4152d9beda79c910aea41286b7a15210d7f202f82ec34c84c445d4373832bc8`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 4, 5, 6 | 未見明確火柱，僅有破圖般的紅色方塊 |
| familyMatch | uncertain | — | 未提供明確風格要求 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供生成位置要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | fail | 1, 2, 6, 7 | 無法辨識火柱消失與殘留DoT的兩階段 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 未見明顯穿模 |
| readability | fail | 1, 2, 4, 5 | 特效呈現破碎方塊，難以閱讀為預期效果 |

## Model notes

- 紅色特效呈現出疑似破圖或遺失材質的方塊狀，無法辨認為火柱

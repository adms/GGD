# VFX visual review: godie-e00s.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.79s
- Source digest: `1f689ebe3bee2193de446bd82f5ac49b3d118897b11af9cd9d55aeed6a7a6a39`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1 | 畫面中未見任何樹精效果，只有紫色光球。 |
| familyMatch | fail | 1 | 可見效果為紫色光球，與樹精不符。 |
| colorMatch | uncertain | — | 未提供顏色規格。 |
| spawnOrigin | uncertain | — | 未提供生成位置規格。 |
| impactPlacement | uncertain | — | 未提供命中位置規格。 |
| temporalOrder | fail | — | 因無樹精，無法確認時間順序。 |
| clipping | pass | 0, 1 | 未見明顯穿模。 |
| readability | pass | 1 | 現有效果與角色關係清楚。 |

## Model notes

- 預期為樹精，但畫面中顯示的是紫色光球。
- 無法從給定幀中確認樹精的生成或清除。

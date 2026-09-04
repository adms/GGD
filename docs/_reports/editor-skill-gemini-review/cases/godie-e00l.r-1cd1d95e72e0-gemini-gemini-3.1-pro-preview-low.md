# VFX visual review: godie-e00l.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.19s
- Source digest: `1cd1d95e72e050a838e44995e168548bc17333f180ea3d9d36188263b10d49f5`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 看到了反彈狀態的視覺特效 |
| familyMatch | uncertain | — | 未提供預期的 VFX 類型 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未提供特效產生位置 |
| impactPlacement | uncertain | — | 未提供特效作用位置 |
| temporalOrder | pass | 1, 2 | 主特效出現於第1幀至第2幀 |
| clipping | pass | 1, 2 | 未見明顯穿模 |
| readability | pass | 1, 2 | 主效果與角色/地面關係清楚 |

## Model notes

- 未提供明確的機制描述及部分預期視覺細節，所以部分檢查回傳 uncertain

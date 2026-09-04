# VFX visual review: godie-o00k.e

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.67s
- Source digest: `fdcf718bbbf41a18b94d14774fd64d68f65cbf156881c5f7efde0b1171ff9fa1`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1 | 前方直線與模板瞬發範圍衝突，未顯示直線積木 |
| familyMatch | uncertain | — | 未提供預期 VFX 類型 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未提供預期發生位置 |
| impactPlacement | uncertain | — | 未提供預期命中位置 |
| temporalOrder | uncertain | — | 無明確的時間順序要求 |
| clipping | pass | 0, 1 | 未見穿模/裁切 |
| readability | pass | 0, 1 | 主效果與角色/地面關係清楚 |

## Model notes

- 預期視覺描述提及前方直線與瞬發範圍模板衝突，但畫面並未顯示直線積木，因此 effectPresence 判定為 fail。

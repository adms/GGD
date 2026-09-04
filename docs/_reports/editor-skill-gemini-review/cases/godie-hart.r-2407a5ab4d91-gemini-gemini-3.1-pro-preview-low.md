# VFX visual review: godie-hart.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.60s
- Source digest: `2407a5ab4d917bd5510ffb6a52a6d3e14f1fbe43fedb44d29d05998389dffb8c`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 4, 5, 6 | 可見大量月牙特效代替七次揮砍 |
| familyMatch | fail | 1, 2, 4, 5, 6 | 出現不被允許的月牙特效 |
| colorMatch | pass | 7 | 終結光柱呈現黃藍色 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | fail | 1, 2, 4, 5, 6 | 未見七次逐擊對齊揮砍，且大量月牙取代 |
| clipping | pass | 1, 2, 4, 5, 6, 7 | 未見明顯穿模或裁切 |
| readability | pass | 1, 2, 4, 5, 6, 7 | 效果與角色關係清楚 |

## Model notes

- 預期要求不得用大量月牙代替角色動作，但畫面中多次出現巨大月牙特效。
- 最後的終結光柱顏色符合黃藍要求。

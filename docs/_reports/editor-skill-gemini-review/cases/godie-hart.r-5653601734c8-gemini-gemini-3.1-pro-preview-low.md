# VFX visual review: godie-hart.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 9.56s
- Source digest: `5653601734c887f806cf387d7c57d9438c7c86a8abe4b883a3ba2723f1f18b69`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 5, 6, 7 | 月牙過多且未對齊施法者揮砍動作。 |
| familyMatch | fail | 1, 2, 3, 5, 6, 7 | 出現大量月牙代替揮砍，不符預期。 |
| colorMatch | pass | 7 | 終結光柱呈現黃藍色。 |
| spawnOrigin | fail | 1, 2, 3, 5, 6, 7 | 大量月牙特效位置偏離且不合理。 |
| impactPlacement | uncertain | — | 未提供特定命中點要求。 |
| temporalOrder | fail | 1, 2, 3, 5, 6, 7 | 月牙未對齊揮砍，時序與動作脫節。 |
| clipping | pass | 0, 1, 2, 3, 4, 5, 6, 7 | 未見明顯穿模。 |
| readability | fail | 1, 2, 3, 5, 6, 7 | 終結光柱偏移目標且大量巨大月牙遮擋。 |

## Model notes

- 預期要求不得用大量月牙代替揮砍，但畫面中出現多個巨大且脫離施法者的月牙特效，違反 mustNot 條件。
- 終結黃藍光柱偏離目標中心，未能有效表現受擊。

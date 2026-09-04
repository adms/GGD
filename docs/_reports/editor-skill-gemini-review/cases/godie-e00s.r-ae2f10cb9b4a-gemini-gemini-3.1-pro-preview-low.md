# VFX visual review: godie-e00s.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.04s
- Source digest: `ae2f10cb9b4a4a89bb67e40711d8e4f2af63710983b62a36c757fd41e3721628`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3 | 未見樹精模型，僅有紅色結晶與紫色光球 |
| familyMatch | fail | 2, 3, 4 | 紅色結晶不符合樹精特徵 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未提供預期發生點 |
| impactPlacement | uncertain | — | 未提供預期命中位置 |
| temporalOrder | fail | 7 | 無法確認八秒後清除，且無樹精生成 |
| clipping | pass | 2, 3, 4, 5, 6, 7 | 未見明顯穿模 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 效果與背景對比清晰 |

## Model notes

- 畫面中出現的是紅色結晶物，非預期中的樹精
- Candidate 7為9.5秒後，紅色結晶物仍存在，未在8秒後清除

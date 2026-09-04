# VFX visual review: godie-e00s.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 8.02s
- Source digest: `0d5672de5b386b47471b0a48cfe8338b1caf12264b09a25d436b9307bc9e76f0`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 4, 5, 6 | 未見生成樹精，僅有紅色特效 |
| familyMatch | uncertain | — | 未提供預期特效類型 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未提供預期生成位置 |
| impactPlacement | uncertain | — | 未提供預期命中位置 |
| temporalOrder | fail | — | 缺少樹精生成過程 |
| clipping | pass | 1, 2, 3, 4, 5, 6 | 未見明顯穿模 |
| readability | pass | 1, 2, 3, 4, 5, 6 | 特效與角色關係清楚 |

## Model notes

- 畫面中僅出現紅色法陣/爆炸特效，未見預期的樹精模型或相關視覺。

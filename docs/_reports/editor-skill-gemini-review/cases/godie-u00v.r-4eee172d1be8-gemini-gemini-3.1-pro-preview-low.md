# VFX visual review: godie-u00v.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.92s
- Source digest: `4eee172d1be8e7bad0806a2f3834c9c06e8ed7847723fc1ab15aa59e78d35a2a`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1 | 未見衝鋒、撞擊、擊退與暈眩等預期效果 |
| familyMatch | uncertain | — | 未提供預期 VFX 類型 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未提供預期生成位置 |
| impactPlacement | uncertain | — | 未提供預期命中位置 |
| temporalOrder | fail | 0, 1 | 未見預期的時序過程 |
| clipping | pass | 1 | 未見明顯穿模或裁切 |
| readability | pass | 1 | 可見的特效與角色關係清楚 |

## Model notes

- 預期需要衝鋒、撞擊等過程，但畫面中只有黃色環狀特效出現
- Candidate 0 只有待機狀態，Candidate 1 只有環狀特效，未見位移

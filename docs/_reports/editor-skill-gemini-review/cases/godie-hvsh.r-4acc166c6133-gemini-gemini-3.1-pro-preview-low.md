# VFX visual review: godie-hvsh.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.48s
- Source digest: `4acc166c613391ba6fdc7143a7d1778494da40ca8c0e18620ad102ca61254cb7`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3 | 未見飛馬與藍色橫向砲 |
| familyMatch | fail | 1, 2, 3 | 未見飛馬或砲擊相關特效 |
| colorMatch | uncertain | — | 無砲擊效果，無法確認顏色 |
| spawnOrigin | uncertain | — | 未提供起點資訊 |
| impactPlacement | uncertain | — | 未見砲擊命中 |
| temporalOrder | fail | 1, 2, 3 | 未見衝刺後接砲擊之時序 |
| clipping | pass | 1, 2, 3 | 現有畫面未見穿模 |
| readability | pass | 1, 2, 3 | 現有效果尚能辨識 |

## Model notes

- 畫面中僅有角色位移及些許藍光線條，未見飛馬與橫向砲擊
- 因主效果缺失，無法進行完整評估

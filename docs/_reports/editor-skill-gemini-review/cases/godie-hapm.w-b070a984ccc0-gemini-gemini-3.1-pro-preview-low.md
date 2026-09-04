# VFX visual review: godie-hapm.w

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.96s
- Source digest: `b070a984ccc0bbcc6e29bc0271f8a0ac0fa2780d53baade76593fb92a290aa40`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1 | 未見抓取、拋出及沿線碰撞分階段效果 |
| familyMatch | uncertain | — | 未見主效果 |
| colorMatch | uncertain | — | 無顏色要求 |
| spawnOrigin | uncertain | — | 無來源要求 |
| impactPlacement | uncertain | — | 無命中位置要求 |
| temporalOrder | fail | 0, 1 | 未見各階段效果，無法確認時序 |
| clipping | pass | 0, 1 | 未見穿模/裁切 |
| readability | fail | 0, 1 | 主效果不存在，無法辨識 |

## Model notes

- 畫面僅見角色與右方些許煙塵，未見預期的抓取、拋出及沿線碰撞分階段效果。

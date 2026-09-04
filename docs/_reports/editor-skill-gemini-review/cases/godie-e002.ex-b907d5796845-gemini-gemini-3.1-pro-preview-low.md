# VFX visual review: godie-e002.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 8.65s
- Source digest: `b907d57968453fbb1e1bd4c1eb23639cee3a73c87a7a498746809373527d1e0a`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 0, 1, 2, 3, 4, 5, 6, 7 | 未見七斬逐擊與直線終結砲的完整過程 |
| familyMatch | uncertain | — | 缺乏機制描述與參考 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供來源要求 |
| impactPlacement | uncertain | — | 未提供位置要求 |
| temporalOrder | uncertain | 6, 7 | 無法確認攻擊受擊與特效施放的完整順序 |
| clipping | pass | 6, 7 | 可見效果未出現嚴重穿模 |
| readability | pass | 6, 7 | 可見效果與角色關係清楚 |

## Model notes

- 畫面中僅見衝刺特效，未能確認是否為『七斬逐擊』或『直線終結砲』。
- 缺乏足夠的幀數與參考來確認特效的完整表現。

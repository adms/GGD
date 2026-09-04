# VFX visual review: godie-edem.e

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.18s
- Source digest: `4b4507b999af54946ad4be215eeb91517cc4725514e2f7c0ee2a36d739cf5d0b`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1 | 只見折線效果，角色未見明顯位移，無法確認衝刺 |
| familyMatch | uncertain | — | 未提供特定VFX類型要求 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供來源要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | fail | 0, 1 | 未見角色衝刺位移 |
| clipping | pass | 0, 1 | 畫面中未見明顯穿模或裁切 |
| readability | pass | 0, 1 | 主效果與角色關係清楚可見 |

## Model notes

- 圖片中角色並未沿著直線或折線進行位移，只出現一條折線特效，不符合'沿直線衝刺'的預期。

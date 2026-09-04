# VFX visual review: godie-edem.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 15.24s
- Source digest: `e2099738aef1c714ef7d22d5419851a1798430b85426064446e74f04bb5cdd2d`
- Confidence: 0.700 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 可見紅色直線傷害特效 |
| familyMatch | uncertain | — | 未提供特定類型要求 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供起點要求 |
| impactPlacement | uncertain | — | 未提供位置要求 |
| temporalOrder | uncertain | 0, 1 | 幀數不足，無法確認衝刺或瞬移 |
| clipping | pass | 1 | 未見明顯穿模 |
| readability | pass | 1 | 特效與角色關係清楚 |

## Model notes

- 中間幀缺失，無法確認是否退化為瞬移

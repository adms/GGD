# VFX visual review: godie-hjai.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.13s
- Source digest: `22bebc490852506e64ed514b43dcbad983549e08602692de177bb95813728f61`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3 | 爆炸效果與沿途飛行軌跡均可見 |
| familyMatch | pass | 1, 2, 3 | 火焰與爆炸特效符合龍破斬設定 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供生成位置要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | pass | 1, 2, 3 | 先有飛行軌跡再有遠端爆炸 |
| clipping | pass | 1, 2, 3 | 未見明顯穿模 |
| readability | pass | 1, 2, 3 | 特效與角色及地面關係清楚 |

## Contract warnings

- Google Gemini positive verdict is not calibrated; forced to human review

## Model notes

- 飛行與爆炸過程清楚

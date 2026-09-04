# VFX visual review: godie-nbbc.e

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.31s
- Source digest: `06aed08558edc1df0ccfb84f169ee1dd55a6427a7bfafa26c74e88f3edfccb00`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2 | 未見從角色前方發射的氣功砲，僅在敵方後方有特效 |
| familyMatch | fail | 1, 2 | 未見氣功砲特效，僅有類似殘影的特效 |
| colorMatch | pass | 1, 2 | 特效包含藍色 |
| spawnOrigin | fail | 1, 2 | 特效出現在敵方後方，而非角色前方 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | fail | 1, 2 | 特效出現位置與預期方向不符，無明確發射過程 |
| clipping | pass | 1, 2 | 未見明顯穿模 |
| readability | pass | 1, 2 | 特效與角色關係清楚 |

## Model notes

- 預期是從角色前方發射橫向氣功砲，但畫面顯示特效在敵方後方出現。
- 特效方向與角色面向不一致。

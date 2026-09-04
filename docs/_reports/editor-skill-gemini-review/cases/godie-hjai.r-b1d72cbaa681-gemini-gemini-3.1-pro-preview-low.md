# VFX visual review: godie-hjai.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.04s
- Source digest: `b1d72cbaa681b81ceb58b1775788d99bd1cc8fd0f3a3a9d5801c2762713d863c`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 2 | 未見黑色光刀斬擊效果 |
| familyMatch | fail | 2 | 僅有微弱紫色弧光，不符 |
| colorMatch | fail | 2 | 預期黑色，實際偏紫 |
| spawnOrigin | uncertain | — | 未提供明確來源要求 |
| impactPlacement | pass | 2 | 光效位於命中目標附近 |
| temporalOrder | pass | 1, 2 | 角色衝刺後出現光效 |
| clipping | pass | 2 | 未見明顯穿模 |
| readability | pass | 2 | 光效與角色關係清楚 |

## Model notes

- 角色有衝向目標動作 (Candidate 1, 2)
- 出現的光效為紫色弧形，而非預期的黑色光刀
- 因缺少核心主效果，整體判定為fail

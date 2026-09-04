# VFX visual review: godie-etyr.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.72s
- Source digest: `986ed7c563c1b948c55385419f3ef319da5fa58a30f1d229dfcc07ae0b2b4c2c`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 6, 7 | 第三個角色作為式神與範圍傷害皆有出現，到期後有消失 |
| familyMatch | uncertain | — | 未提供特效種類要求 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供明確生成位置要求 |
| impactPlacement | uncertain | — | 未提供受擊位置要求 |
| temporalOrder | pass | 1, 6, 7 | 召喚與範圍傷害同時發生，8秒後消失 |
| clipping | pass | 1, 2 | 模型及特效未見異常穿模現象 |
| readability | pass | 1, 2 | 新增角色及傷害特效清晰可辨 |

## Contract warnings

- Google Gemini positive verdict is not calibrated; forced to human review

## Model notes

- Candidate 1 顯示召喚與傷害特效
- Candidate 2-6 顯示召喚的角色持續存在
- Candidate 7 顯示召喚角色消失

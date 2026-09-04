# VFX visual review: godie-etyr.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.73s
- Source digest: `0080f5d170452bd4ad933071ce0dcd7eb919e2d70679e43171d58dd25e35eef3`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6 | 第三個角色成功出現並維持 |
| familyMatch | pass | 1 | 第三個角色（同模型）出現 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | pass | 1, 6, 7 | 召喚後維持約八秒，然後消失 |
| clipping | pass | 1, 2, 3, 4, 5, 6 | 未見明顯穿模 |
| readability | pass | 1, 2, 3, 4, 5, 6 | 召喚角色清楚可見 |

## Contract warnings

- Google Gemini positive verdict is not calibrated; forced to human review

## Model notes

- 在第 1 幀召喚第三個角色，第 7 幀時已消失（約八秒）。
- 範圍傷害特效不明顯，但主要要求為召喚第三個角色。

# VFX visual review: godie-nbbc.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.55s
- Source digest: `4d2d34872ac73442150c99eeea562cfaa67a8aaabfd62158449039b9832d4136`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 橫向氣功特效在角色右側可見。 |
| familyMatch | pass | 1, 2 | 有橫向發射的氣功/光束視覺表現。 |
| colorMatch | pass | 1, 2 | 主特效顏色為藍色，符合預期。 |
| spawnOrigin | fail | 1, 2 | 特效未從角色前方發射，而是憑空出現在遠處。 |
| impactPlacement | uncertain | — | 未提及特定命中位置。 |
| temporalOrder | pass | 1, 2 | 施法後出現特效。 |
| clipping | pass | 1, 2 | 未觀察到明顯穿模。 |
| readability | pass | 1, 2 | 特效與角色關係相對清楚。 |

## Contract warnings

- overall failed without a required visual check failure

## Model notes

- 預期為從前方發射，實際特效離角色太遠，直接出現在畫面右側。

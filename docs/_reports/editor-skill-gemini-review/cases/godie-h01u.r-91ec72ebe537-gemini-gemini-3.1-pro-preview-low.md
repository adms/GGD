# VFX visual review: godie-h01u.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 9.79s
- Source digest: `91ec72ebe53770d118d4dbac0a9d56f0fc600b941f2630e2c22adb39ec8b858f`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6, 7 | Red aura and rings are visible on the character. |
| familyMatch | pass | 1, 2, 3, 4, 5, 6, 7 | Effect matches an aura/buff representation. |
| colorMatch | pass | 1, 2, 3, 4, 5, 6, 7 | The effect is primarily red, matching expected visuals. |
| spawnOrigin | pass | 1 | Aura spawns around the character. |
| impactPlacement | pass | 1, 2, 3, 4, 5, 6, 7 | Aura stays attached to the character. |
| temporalOrder | pass | 1, 2, 3, 4, 5, 6, 7 | Effect spawns and remains over time. |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | No obvious clipping issues observed. |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | Effect does not completely obscure the character. |

## Contract warnings

- Google Gemini positive verdict is not calibrated; forced to human review

## Model notes

- Expected mechanics related to buffs and triggers cannot be verified visually.

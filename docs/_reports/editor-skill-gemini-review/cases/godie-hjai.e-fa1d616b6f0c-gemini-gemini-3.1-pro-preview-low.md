# VFX visual review: godie-hjai.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.23s
- Source digest: `fa1d616b6f0c1095c2307c0a30e8c12e9010f829017a595c9cd3628957abe553`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | Projectile and distant explosion are visible. |
| familyMatch | uncertain | — | No family requirement provided. |
| colorMatch | uncertain | — | No color requirement provided. |
| spawnOrigin | uncertain | — | No exact spawn origin provided. |
| impactPlacement | uncertain | — | No exact impact position requirement provided. |
| temporalOrder | pass | 1, 2 | Projectile flies first, then explodes at a distance. |
| clipping | pass | 1, 2 | No obvious clipping observed. |
| readability | pass | 1, 2 | Effects are clearly readable against background. |

## Contract warnings

- Google Gemini positive verdict is not calibrated; forced to human review

## Model notes

- Projectile trail and end explosion sequence verified.
- Uncertain fields due to lack of specific constraints.

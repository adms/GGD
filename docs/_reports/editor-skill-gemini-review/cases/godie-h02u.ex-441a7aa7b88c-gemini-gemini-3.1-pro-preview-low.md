# VFX visual review: godie-h02u.ex

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.94s
- Source digest: `441a7aa7b88c7226c687397e292cdf03b912f00bc0b7fa81037210774b93b233`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1 | Expected 6 times but only observed once. |
| familyMatch | uncertain | — | No specific VFX family specified. |
| colorMatch | uncertain | — | No color specified. |
| spawnOrigin | uncertain | — | No origin specified. |
| impactPlacement | uncertain | — | No impact placement specified. |
| temporalOrder | fail | 1 | Effect only appeared once instead of six times. |
| clipping | pass | 1 | No clipping observed. |
| readability | pass | 1 | Effect is readable. |

## Model notes

- Effect is expected to trigger 6 times, but it only triggers once at Candidate 1.

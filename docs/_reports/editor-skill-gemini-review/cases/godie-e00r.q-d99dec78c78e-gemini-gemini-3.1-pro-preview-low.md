# VFX visual review: godie-e00r.q

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.54s
- Source digest: `d99dec78c78e0c3b04c7ac36494aeae02cf2ea0f24a9af9fe61652a9a7e395b0`
- Confidence: 0.500 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 0, 1 | Red burst/devour effect is visible on the target |
| familyMatch | uncertain | — | No expected VFX family provided |
| colorMatch | uncertain | — | No specific color requested |
| spawnOrigin | uncertain | — | No specific spawn origin requested |
| impactPlacement | uncertain | — | No specific impact placement requested |
| temporalOrder | pass | 0, 1 | Effect plays over the candidate frames |
| clipping | pass | 0, 1 | No obvious clipping observed |
| readability | pass | 0, 1 | Effect is readable against the background |

## Model notes

- Effect presence is observed as a red burst/splatter on the target.
- Many details are missing from the summary, so only basic checks are passed.

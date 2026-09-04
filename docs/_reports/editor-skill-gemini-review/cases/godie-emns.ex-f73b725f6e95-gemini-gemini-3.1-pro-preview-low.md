# VFX visual review: godie-emns.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.76s
- Source digest: `f73b725f6e9526cb8d6e6858f06f816322fa8aac92528dcdc4e5ec9c2362e0d0`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6, 7 | Red burst/swap effects are visible on both characters. |
| familyMatch | uncertain | — | No specific VFX family was requested. |
| colorMatch | uncertain | — | No specific color was requested. |
| spawnOrigin | uncertain | — | No specific spawn origin was requested. |
| impactPlacement | uncertain | — | No specific impact placement was requested. |
| temporalOrder | pass | 1, 2, 3 | Effects trigger across both targets in sequence. |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | Effects do not exhibit significant clipping issues. |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | Effect clearly encompasses both targets. |

## Model notes

- Numerical HP exchanges are not verified visually.

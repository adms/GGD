# VFX visual review: godie-hvwd.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.62s
- Source digest: `411340f4395f7969b827acfb4718f7074f81de00a41a1399b46a996c205e606c`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1 | Red conflict visual (missing shader/material) is visible on the target. |
| familyMatch | pass | 1 | Effect matches Editor conflict marker. |
| colorMatch | uncertain | — | No specific color requirement provided. |
| spawnOrigin | uncertain | — | No specific spawn origin provided. |
| impactPlacement | uncertain | — | No specific impact placement provided. |
| temporalOrder | pass | 0, 1 | The effect appears on the target. |
| clipping | pass | 1 | No severe clipping is observed. |
| readability | pass | 1 | The conflict marker is clearly visible. |

## Model notes

- The expected visual is a red conflict marker to indicate a mismatch between card text and template.
- Candidate 1 clearly shows a red 'missing texture' or conflict visual on the target, satisfying the requirement.

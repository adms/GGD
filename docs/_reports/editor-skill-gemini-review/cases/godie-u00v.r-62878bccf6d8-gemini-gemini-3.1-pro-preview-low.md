# VFX visual review: godie-u00v.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.68s
- Source digest: `62878bccf6d8ae7b6573b3669780c45161e0981e298a84bf6e62ff899db06248`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1 | Missing expected dash/knockback/stun effects. |
| familyMatch | uncertain | — | VFX type details not provided. |
| colorMatch | uncertain | — | VFX color details not provided. |
| spawnOrigin | uncertain | — | Spawn origin details not provided. |
| impactPlacement | uncertain | — | Impact placement details not provided. |
| temporalOrder | fail | 0, 1 | Expected temporal sequence not observable. |
| clipping | pass | 1 | No visible clipping issues. |
| readability | pass | 1 | VFX is readable against characters/ground. |

## Model notes

- The summary notes a blink instead of a dash.
- Impact, knockback, and stun effects are missing or unclear in provided frames.

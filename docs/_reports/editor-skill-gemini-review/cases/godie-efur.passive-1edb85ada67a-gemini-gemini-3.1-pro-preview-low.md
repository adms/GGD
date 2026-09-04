# VFX visual review: godie-efur.passive

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.44s
- Source digest: `1edb85ada67aa55a40827d71ac58e6717782211271c81e635f820cb5e466528a`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | — | VFX details (AP, AD, defense, magic resist) are unclear. |
| familyMatch | uncertain | — | Effect details and logic are not distinct. |
| colorMatch | uncertain | — | Specific colors not requested. |
| spawnOrigin | uncertain | — | Spawn origin not explicitly requested. |
| impactPlacement | uncertain | — | Impact placement not explicitly requested. |
| temporalOrder | uncertain | — | Cycle of states cannot be confirmed from frames. |
| clipping | pass | 0, 1 | No obvious clipping observed in current frames. |
| readability | uncertain | — | States are not clearly readable. |

## Model notes

- Only faint red effects visible; cannot verify AP/AD cycle.
- Not enough frames to verify sequential temporal logic.
- Effects are indistinct.

# VFX visual review: godie-e00s.w

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.92s
- Source digest: `b828df1f30171234a17109c5091638a0bdaa1f3ee599ef7fb2e76056ed7912fa`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 0, 1 | Effect triggers upon auto attack |
| familyMatch | pass | 0, 1 | VFX style matches expected short-range aoe |
| colorMatch | uncertain | — | Color match not requested |
| spawnOrigin | uncertain | — | Spawn origin not specifically detailed |
| impactPlacement | pass | 0, 1 | Impact visible upon the target |
| temporalOrder | pass | 0, 1 | Effect plays at the right time based on available frames |
| clipping | pass | 0, 1 | No apparent clipping |
| readability | pass | 0, 1 | VFX does not severely occlude character |

## Model notes

- Passive triggering small area effect correctly without active cast animation.

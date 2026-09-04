# VFX visual review: godie-hvwd.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 9.22s
- Source digest: `36b9f0446399fcd412e79ccc1133c17978995a192f2870f641a9695ee6cf3e89`
- Confidence: 0.500 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6, 7 | Red visual effects are clearly visible in the sequence. |
| familyMatch | uncertain | — | No specific VFX family was requested to check against. |
| colorMatch | uncertain | — | No specific color requested. |
| spawnOrigin | uncertain | — | No specific spawn origin requested. |
| impactPlacement | uncertain | — | No specific impact placement requested. |
| temporalOrder | pass | 1, 2, 3, 4, 5, 6, 7 | The effect sequence appears logically ordered across frames. |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | No obvious clipping or cropping issues observed. |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | The effect is readable against the background and characters. |

## Model notes

- 卡面描述為直線，模板卻是單體，Editor 必須標紅語意衝突。

# VFX visual review: godie-nbbc.e

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.47s
- Source digest: `9889979d059290b72d0fb924de837553944c3dc8235d5a2844957ec286058502`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 藍色橫向氣功砲可見。 |
| familyMatch | pass | 1, 2 | 呈現橫向氣功砲形狀與線條，符合預期。 |
| colorMatch | pass | 1, 2 | 氣功砲呈現藍色。 |
| spawnOrigin | fail | 1, 2 | 氣功砲發射位置異常，不在角色前方，而是從右側出現。 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求，且未觀察到明確碰撞點。 |
| temporalOrder | pass | 0, 1, 2 | 施法後出現氣功砲。 |
| clipping | pass | 1, 2 | 未見明顯穿模或裁切。 |
| readability | fail | 1, 2 | 氣功砲發射位置和方向與角色脫節，關係不清楚。 |

## Model notes

- 預期氣功砲從角色前方發射，但在畫面中是從右側憑空出現往右飛，方向與位置皆異常。

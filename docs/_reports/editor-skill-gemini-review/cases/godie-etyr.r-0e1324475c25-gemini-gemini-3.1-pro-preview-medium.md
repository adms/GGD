# VFX visual review: godie-etyr.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 6.54s
- Source digest: `0e1324475c25ed78b54e0d6e6fadd7507cce0ae3d17b315d3cc6674618f34132`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 2, 3, 4, 5, 6, 7 | 召喚了第三個角色作為式神，且有範圍傷害，最後消失。 |
| familyMatch | uncertain | — | 未提供特效類型要求。 |
| colorMatch | uncertain | — | 未提供顏色要求。 |
| spawnOrigin | uncertain | — | 未提供出生點要求。 |
| impactPlacement | uncertain | — | 未提供命中位置要求。 |
| temporalOrder | pass | 2, 3, 6, 7 | 先召喚並造成傷害，隨後維持一段時間，最後消失。 |
| clipping | pass | 2, 3, 4, 5, 6 | 未見明顯穿模或裁切問題。 |
| readability | pass | 2, 3, 4, 5, 6 | 召喚角色及範圍傷害效果清晰，與地面和角色關係明確。 |

## Model notes

- 召喚出的第三個角色模型與施法者相同，符合描述。

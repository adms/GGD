# VFX visual review: godie-hvwd.e

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.62s
- Source digest: `db2714b21fb92f7c8a0eeb741c6a232995d5e0959bc6b005b862f7cba10be533`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1 | 可見單體效果。 |
| familyMatch | uncertain | — | 未提供明確的特效類型預期。 |
| colorMatch | uncertain | — | 未提供顏色要求。 |
| spawnOrigin | uncertain | — | 未提供生成位置要求。 |
| impactPlacement | uncertain | — | 未提供命中位置要求。 |
| temporalOrder | uncertain | — | 幀數不足，無法確認時序。 |
| clipping | pass | 1 | 未見明顯穿模或裁切。 |
| readability | pass | 1 | 主效果與角色關係清楚。 |

## Model notes

- 根據預期描述，卡面為直線但模板為單體，此為語意衝突，因此判定 fail。

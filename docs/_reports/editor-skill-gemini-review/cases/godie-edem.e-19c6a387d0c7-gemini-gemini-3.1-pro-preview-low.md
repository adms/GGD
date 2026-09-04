# VFX visual review: godie-edem.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.50s
- Source digest: `19c6a387d0c72acebdc3c35cabbaac53697c86fb854c6337e75d2f7fbadb5a7b`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 0, 1 | 可見角色衝刺路徑上的折線特效及敵人身上的受擊特效。 |
| familyMatch | uncertain | — | 未提供預期的 VFX 類型。 |
| colorMatch | uncertain | — | 未提供特定顏色要求。 |
| spawnOrigin | uncertain | — | 未提供特定來源要求。 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求。 |
| temporalOrder | uncertain | 0, 1 | 提供的影格數量不足以確認完整的時間順序及位移距離。 |
| clipping | pass | 0, 1 | 未見明顯穿模或裁切問題。 |
| readability | pass | 0, 1 | 主效果與角色關係清楚。 |

## Model notes

- 影格僅顯示技能初期的折線特效及第一個受擊敵人，無法確認角色是否完成沿線衝刺。

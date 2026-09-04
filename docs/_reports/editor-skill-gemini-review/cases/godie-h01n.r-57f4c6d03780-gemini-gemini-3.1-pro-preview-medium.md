# VFX visual review: godie-h01n.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 6.45s
- Source digest: `57f4c6d03780164f6909691c5a8196a35cb6185b3dae4e18a589124c831f9bd1`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 紅色爆氣效果可見。 |
| familyMatch | uncertain | — | 未提供預期效果類型。 |
| colorMatch | uncertain | — | 未提供特定顏色要求。 |
| spawnOrigin | uncertain | — | 未提供特定生成位置要求。 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求。 |
| temporalOrder | pass | 0, 1, 2, 3 | 爆發效果出現後消失，順序合理。 |
| clipping | pass | 1, 2 | 未見明顯穿模或裁切。 |
| readability | pass | 1, 2 | 特效與角色關係清楚可見。 |

## Model notes

- 預期包含數值變化如『攻速』與『冷卻』，這無法由視覺檢查，但畫面可見變身效果。
- 八秒結束後恢復外觀的過程沒有足夠幀確認，僅可見短期特效。

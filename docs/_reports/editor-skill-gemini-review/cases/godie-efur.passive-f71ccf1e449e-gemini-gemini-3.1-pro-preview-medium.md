# VFX visual review: godie-efur.passive

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 8.90s
- Source digest: `f71ccf1e449e427a37f45dcac230bd0ac6de402d675b851a69621a8815434b2e`
- Confidence: 0.500 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 0, 1 | 僅有紅色特效，無法確認循環 |
| familyMatch | uncertain | — | 未提供預期的具體VFX類型 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | uncertain | 0, 1 | 未觀察到完整的循環順序 |
| clipping | uncertain | 0, 1 | 畫面過暗且難以判斷穿模 |
| readability | uncertain | 0, 1 | 特效與角色關係不夠清楚 |

## Model notes

- 預期包含四種狀態的循環，但畫面中只看到紅色的打擊特效，無法驗證完整的循環與順序。
- 畫面非常暗且視野有限，難以清楚辨識細節。

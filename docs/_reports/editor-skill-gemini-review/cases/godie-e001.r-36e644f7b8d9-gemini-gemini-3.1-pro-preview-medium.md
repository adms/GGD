# VFX visual review: godie-e001.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 6.61s
- Source digest: `36e644f7b8d950f1c9575471135763b14bdcc7eeb91699d62c411f10cc1984f4`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6, 7 | 可見角色周圍帶有紅色特效與圓圈。 |
| familyMatch | uncertain | — | 未提供預期的 VFX 類型。 |
| colorMatch | uncertain | — | 未提供特定顏色要求。 |
| spawnOrigin | uncertain | — | 未提供來源位置要求。 |
| impactPlacement | uncertain | — | 未提供命中位置要求。 |
| temporalOrder | pass | 1, 3, 5, 7 | 特效隨時間持續存在於變身期間。 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 未見明顯穿模或裁切。 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 主特效與角色關係清楚。 |

## Contract warnings

- Google Gemini positive verdict is not calibrated; forced to human review

## Model notes

- 無法從畫面確認數值變更及結束後是否完整復原。

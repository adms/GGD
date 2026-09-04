# VFX visual review: godie-h01n.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.06s
- Source digest: `c72cc05d2088a660ac407790a2692761694d85f59c9e47e681e1a13c0af2de47`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 可見紅色氣流爆發效果，代表變身技能的視覺表現。 |
| familyMatch | uncertain | — | 未提供特定的 VFX family 規格。 |
| colorMatch | uncertain | — | 未提供特定顏色要求。 |
| spawnOrigin | uncertain | — | 未提供特定產生位置要求。 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求。 |
| temporalOrder | pass | 1, 2, 3 | 效果隨時間發生並消散，順序合理。 |
| clipping | pass | 1, 2 | 未觀察到明顯的穿模或裁切問題。 |
| readability | pass | 1, 2 | 主效果與角色/背景關係清楚，易於辨識。 |

## Model notes

- 預期文字中提及的『八秒結束後外觀與冷卻規則一起恢復』無法僅憑這幾幀短暫畫面證實，故只能針對可見的變身瞬間效果進行判定。

# VFX visual review: godie-h01n.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.68s
- Source digest: `57f4c6d03780164f6909691c5a8196a35cb6185b3dae4e18a589124c831f9bd1`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1 | 可見紅色氣流爆發效果，符合變身預期 |
| familyMatch | uncertain | — | 未提供預期VFX類型 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未提供預期發生位置 |
| impactPlacement | uncertain | — | 未提供預期命中位置 |
| temporalOrder | pass | 0, 1, 2, 3 | 效果隨機發生並消散，順序合理 |
| clipping | pass | 1, 2 | 未見穿模或裁切問題 |
| readability | pass | 1 | 主效果與角色關係清楚 |

## Model notes

- 外觀恢復等數值規則無法從單一變身瞬間畫面確認

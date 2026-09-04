# VFX visual review: godie-nbbc.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.21s
- Source digest: `fbb42d92f3c051291fc1a32e5456f7c337af7162e277658b34c01a21eaafbf63`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2 | 未見A式直線衝擊波，只有殘影和斬擊光弧 |
| familyMatch | uncertain | — | 未提供特定VFX類型要求 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | fail | 1, 2 | 無法確認A式與B式的先後順序 |
| clipping | pass | 1, 2, 3 | 未見明顯穿模或裁切 |
| readability | pass | 1, 2 | 主效果與角色/地面關係清楚 |

## Model notes

- 預期包含A式直線衝擊波與B式瞬移斬擊，但畫面中未見A式直線衝擊波。
- 無法確認交叉點產生額外範圍傷害的效果。

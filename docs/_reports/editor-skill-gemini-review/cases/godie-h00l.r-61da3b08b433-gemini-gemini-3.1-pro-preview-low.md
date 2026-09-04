# VFX visual review: godie-h00l.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.11s
- Source digest: `61da3b08b4334df8973bbcf67294003cff713f0becbe1541106036a2781673ef`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 防禦動作與效果在圖1與圖2中可見。 |
| familyMatch | uncertain | — | 未提供特定VFX家族或類型要求。 |
| colorMatch | uncertain | — | 未提供特定顏色要求。 |
| spawnOrigin | uncertain | — | 未提供特定生成位置要求。 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求。 |
| temporalOrder | pass | 1, 2 | 防禦效果隨時間出現並消散。 |
| clipping | pass | 1, 2 | 效果未見明顯穿模或裁切。 |
| readability | pass | 1, 2 | 防禦效果與角色及地面關係清楚。 |

## Model notes

- 預期中的「反彈技能AP傷害並回復及擊退」等邏輯屬性無法由單純畫面確認。
- 防禦動作只播放一次的條件無法從僅有的三張靜態截圖完全確認，需更多連續幀。

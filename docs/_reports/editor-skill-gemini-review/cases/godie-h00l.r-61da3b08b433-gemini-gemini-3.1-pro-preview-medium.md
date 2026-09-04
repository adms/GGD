# VFX visual review: godie-h00l.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 14.82s
- Source digest: `61da3b08b4334df8973bbcf67294003cff713f0becbe1541106036a2781673ef`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 可見防禦動作與伴隨的特效粒子 |
| familyMatch | uncertain | — | 未提供具體的特效類型要求 |
| colorMatch | uncertain | — | 未提供特定的顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定的特效來源要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | pass | 1, 2 | 防禦動作與特效出現順序合理 |
| clipping | pass | 1, 2 | 畫面中未見明顯穿模或裁切 |
| readability | pass | 1, 2 | 特效與角色的關係清楚可見 |

## Model notes

- 預期文字主要描述機制，未詳細定義反彈或擊退的具體視覺表現。
- 防禦動作與粒子特效可見，但無法從單純畫面確認反彈是否成功或數值變化。

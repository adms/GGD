# VFX visual review: godie-e00l.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.40s
- Source digest: `dc4940ab10b34150ea13c7894144ef9aefe0e5e8765aa5a440ec3744cfbc85f1`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 可見角色周圍出現光暈或魔法陣效果 |
| familyMatch | uncertain | — | 未提供明確的主效果類型要求 |
| colorMatch | uncertain | — | 未提供顏色規格 |
| spawnOrigin | uncertain | — | 未提供來源規格 |
| impactPlacement | uncertain | — | 未提供命中位置規格 |
| temporalOrder | pass | 0, 1, 2 | 特效隨時間展開並消退 |
| clipping | pass | 1, 2 | 未見明顯穿模 |
| readability | pass | 1, 2 | 特效與角色關係清楚 |

## Model notes

- 候選圖片展示了左側角色周圍產生某種發光與紋章狀特效，但無法從單一視覺確認是否為'反彈狀態'

# VFX visual review: godie-e001.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.38s
- Source digest: `14866a1e07624a6e36ad0034189e332a1bf1e6486ea9605f065d4ba193a968c4`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1 | 可見紅色特效出現 |
| familyMatch | uncertain | — | 未提供具體的 VFX 類型要求 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供來源位置要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | pass | 0, 1 | 特效出現在角色動作之後 |
| clipping | pass | 1 | 未見明顯穿模 |
| readability | pass | 1 | 特效與角色關係清晰 |

## Model notes

- 預期文字主要描述數值與狀態變化，缺乏具體視覺特效細節描述，故多項檢查判定為 uncertain。

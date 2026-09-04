# VFX visual review: godie-emns.passive

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 7.29s
- Source digest: `f0875fbd8289dd16fddf5c1d911d1ca20b583f08c559680e9592bf76ceba811f`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 4, 5, 6, 7 | 可見角色周圍出現紅色特效，可能違反被動不顯示主動特效的要求 |
| familyMatch | uncertain | — | 未提供預期 VFX 類型 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未提供預期來源位置 |
| impactPlacement | uncertain | — | 未提供預期命中位置 |
| temporalOrder | uncertain | — | 缺乏足夠證據判斷時序 |
| clipping | pass | 1, 2 | 無明顯穿模 |
| readability | pass | 1, 2 | 特效與角色關係清晰 |

## Model notes

- 畫面中出現了主動技能般的紅色方塊擴散特效，與預期『被動不得顯示或播放主動施法』相悖

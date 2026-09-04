# VFX visual review: godie-h00l.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.26s
- Source digest: `80de577c08ab52a844c9abdf05b47fff64d6727331e35e75da79b90cb34b332d`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 可見角色前方產生盾反效果或防禦性特效 |
| familyMatch | uncertain | — | 未提供特定VFX類型要求 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | pass | 1, 2 | 特效隨時間展開並向前推進，順序合理 |
| clipping | pass | 1, 2 | 未見明顯穿模或不合理裁切 |
| readability | pass | 1, 2 | 特效與角色及環境的關係清晰可辨 |

## Contract warnings

- Google Gemini positive verdict is not calibrated; forced to human review

## Model notes

- 預期文字中的『回復並擊退』與數值相關，不屬視覺審查範圍
- 防禦動作與特效（半弧形防禦罩與光點）在畫面中可見

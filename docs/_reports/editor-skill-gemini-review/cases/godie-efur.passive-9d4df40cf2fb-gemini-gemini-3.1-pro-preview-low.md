# VFX visual review: godie-efur.passive

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.25s
- Source digest: `9d4df40cf2fb6c99b275df917af5bacca7fa2677f32e668efb1b65ce4283732d`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 0, 1 | 僅見受擊紅光，未見各屬性特效 |
| familyMatch | uncertain | — | 規格未提供特效樣式 |
| colorMatch | uncertain | — | 規格未提供特效顏色 |
| spawnOrigin | uncertain | — | 規格未提供特效生成位置 |
| impactPlacement | uncertain | — | 規格未提供特效命中位置 |
| temporalOrder | uncertain | 0, 1 | 幀數不足，無法確認時序與並存 |
| clipping | pass | 0, 1 | 未見明顯穿模 |
| readability | uncertain | 0, 1 | 缺乏預期主效果，無從判斷 |

## Model notes

- 圖片僅展示普攻命中紅光，未見AP、AD、防禦、魔抗等四種狀態特效
- 兩幀間隔一秒，但畫面幾乎相同，無法確認時序與循環

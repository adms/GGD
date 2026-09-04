# VFX visual review: godie-e00l.ex

- Classification: **ai-prechecked**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.5-flash-lite`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 3.19s
- Source digest: `f5ba7aed32ac1e2e2a76a0c0259bace42f017c83c612ae2ebcad5941f18e68ae`
- Confidence: 0.950 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3 | 預期特效與多次斬擊完整可見 |
| familyMatch | pass | 1, 2 | 符合預期之解構與光劍類型 |
| colorMatch | pass | 1, 2, 3 | 色彩表現正常 |
| spawnOrigin | pass | 1, 2 | 特效生成位置正確 |
| impactPlacement | pass | 2, 3 | 打擊位置與角色動作吻合 |
| temporalOrder | pass | 0, 1, 2, 3 | 依序承接反彈並播放多段攻擊 |
| clipping | pass | 1, 2, 3 | 未見明顯穿模或裁切 |
| readability | pass | 1, 2, 3 | 主效果與角色關係清楚 |

## Model notes

- 特效播放順序正確
- 未觀察到穿模異常

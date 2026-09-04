# VFX visual review: godie-hapm.w

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.82s
- Source digest: `2e629f870285a5e3ae0d87161b580404840cac82fa10717ed06694dd2bae77ab`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | — | 抓取、拋出、碰撞等細節未完全可見 |
| familyMatch | uncertain | — | 無指定 VFX 類型要求 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供發射點要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | uncertain | — | 未能從畫面上確認完整的時間順序 |
| clipping | pass | 0, 1 | 畫面中未見明顯穿模 |
| readability | pass | 0, 1 | 效果與場景角色關係清楚 |

## Model notes

- 預期的抓取、拋出及沿線碰撞過程在提供的兩張圖中無法完整辨識
- 無法從靜態圖中確認『無敵窗不得超過動作』的條件

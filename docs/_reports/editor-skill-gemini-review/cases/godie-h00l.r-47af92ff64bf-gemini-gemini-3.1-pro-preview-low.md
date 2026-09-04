# VFX visual review: godie-h00l.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.83s
- Source digest: `47af92ff64bf24da7ebc56a1456d82b1c6c2bcee3f4204aa5ba102b07c6309a9`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | — | 缺少擊退與回復效果的直接視覺證據 |
| familyMatch | uncertain | — | 未指定具體特效類型 |
| colorMatch | uncertain | — | 未指定顏色要求 |
| spawnOrigin | uncertain | — | 未指定生成位置 |
| impactPlacement | uncertain | — | 未指定命中位置 |
| temporalOrder | uncertain | — | 無法確認反彈與擊退的時間順序 |
| clipping | pass | 1, 2 | 可見的特效未出現穿模問題 |
| readability | pass | 1, 2 | 可見特效與角色關係清楚 |

## Model notes

- 預期包含反彈、回復與擊退，但畫面僅見揮砍與防禦動作。
- 缺乏足夠的幀確認回復與擊退是否發生。

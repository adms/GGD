# VFX visual review: godie-hjai.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.25s
- Source digest: `37b0d385fb6b7d38233e91c29e00cc420b8ff2c8c2916c76baa3dc81738da647`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 2 | 可見黑色光刀斬擊效果。 |
| familyMatch | pass | 2 | 斬擊效果符合預期形狀。 |
| colorMatch | pass | 2 | 光芒顏色偏紫黑，符合黑色光刀。 |
| spawnOrigin | pass | 2 | 隨角色衝向目標後出現。 |
| impactPlacement | pass | 2 | 打擊點位於目標處。 |
| temporalOrder | pass | 1, 2 | 角色先移動，後出現斬擊。 |
| clipping | pass | 2 | 未見明顯穿模。 |
| readability | pass | 2 | 效果與場景對比清晰。 |

## Model notes

- 預期中的傷害與暈眩、EX增幅次數等無法從視覺直接確認。

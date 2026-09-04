# VFX visual review: godie-ogrh.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.22s
- Source digest: `aeec5aff1db9b42e012273fff19ead7f453bb60ae4349053d2eaed187e0f344f`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2 | 未見橘色橫向光束 |
| familyMatch | fail | 1, 2 | 可見效果不符合光束特徵 |
| colorMatch | fail | 1, 2 | 未見橘色光束 |
| spawnOrigin | uncertain | — | 未見光束發射 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | fail | 1, 2 | 未見光束相關之時序 |
| clipping | pass | 1, 2 | 未見明顯穿模 |
| readability | pass | 1, 2 | 現有效果與角色關係清楚 |

## Model notes

- 畫面中僅見角色周圍的煙塵及右側的速度線效果。
- 預期中的『橘色橫向光束』及『超級賽亞人增幅』均未出現。

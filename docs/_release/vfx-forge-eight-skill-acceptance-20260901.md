# VFX Forge 八招驗收批次（2026-09-01）

- 驗收清單改為 owner 指定的 8 招，不再沿用舊三招清單。
- `vfx-script@1` 新增純演出 `beam` 段，支援長寬、高度、偏航、俯仰、移動、顏色、透明度與持續時間。
- 有 script 的技能會取代 ability-owned `modelFxSpawn`、`vfxSpawn`、screen cue 與 floating text；不再疊播兩套演出。
- `spawnVfx` 與 screen cue payload 補 authored origin，replacement rule 由 shared provenance parser 判斷。
- Forge 新增精確秒數與全螢幕預覽，使用真 Sim 班表、真 VfxSystem、真 CameraRig 與雙方 3D model 產生關鍵影格。
- focused tests 28/28、coverage freshness 2/2；runtime capability `9d43feef`，coverage `bbc5f1c27654`（4,853 格，owner-only 39）。
- 視覺 verdict：4 招通過、4 招部分通過；詳見 `docs/_reports/vfx-forge-visual-proof-20260901/frames.md`。

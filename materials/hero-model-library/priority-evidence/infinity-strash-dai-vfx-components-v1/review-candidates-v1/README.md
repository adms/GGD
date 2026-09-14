# 達伊 PN010 VFX 視覺重建候選 v1

本批把既有 18 張合格貼圖與 8 顆 mesh 支援元件組成六個可重現的靜態／程序化視覺候選。每個候選固定輸出 t=0.0、0.5、1.0 三個畫面，供後續統一審查頁產生器收錄。

- 六項 `ownerDecision` 均為 `pending`；`approvedBindings` 是空陣列。
- 這些畫面不是 Niagara 播放時序還原，也沒有指定技能事件、骨架掛點或音訊。
- 沒有寫入 `content/vfx`、英雄設定或 runtime 綁定；正式站部署為 0。
- 權威候選：`review-candidates.json`；未綁定元件：`unused-assets.json`。
- 獨立審查頁：`apps/client/public/infinity-strash-dai-vfx-review-candidates.html`。

## 重建與檢查

```sh
bash scripts/python-pillow.sh tools/hero-model-library/source-workflows/infinity-strash-dai-vfx-components-v1/build_review_candidates.py
bash scripts/python-pillow.sh tools/hero-model-library/source-workflows/infinity-strash-dai-vfx-components-v1/build_review_candidates.py --check
python3 -m unittest tools/hero-model-library/source-workflows/infinity-strash-dai-vfx-components-v1/test_review_candidates.py
```

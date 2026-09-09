# 第一批 37 名功能交付的畫面證據

本批保存 689 張 PNG（包含菜月昴失敗畫面），84,300,892 bytes，三個壓縮分段共 80,326,207 bytes。36 名完成 Q/W/E/R/EX，菜月昴保留 Q 圖片及 W 預覽像素拒絕；[逐名收據](../../refinements/parody-visual-review.json) 與 [原始 JSON 報告](../../refinements/visual-captures/) 在 Git。截圖收集不代表全部美術通過。

Owner 最後裁決只以技能、特效或機制失效等重大問題阻擋交付，鏡頭／遮擋／美術微調只記錄。本次沒有因此修改 37 名英雄配方；當前服務 ZIP 與 37 名隔離發布收據仍有效。正式站未部署。

```sh
python3 materials/community-hero-forge/restore.py \
  --manifest-dir materials/community-hero-forge/supplements/visual-37-20260909 \
  --download --parts-dir /private/tmp/ggd-visual37-parts \
  --output /private/tmp/ggd-visual37-restored
```

使用既定 vibe-coding profile、ap-east-2 region 與授權 bucket；圖片留 S3，清單、SHA、來源與紀錄留 Git。

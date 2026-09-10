# 37 名全數通過投稿的新版 ZIP

37 份完整英雄 ZIP，服務版本 `417abec9d90424b5ccbe7948331a60f98dd0f689`。全部通過當前服務建立／檢查、隔離投稿、管理員發布及異帳號署名下載還原；[發布收據](../../refinements/parody-publication-proof.json) 與來源在 Git。

四個分段共 102,869,535 bytes，已上傳授權 S3、重新下載並逐檔 SHA-256 還原 37 份。固定位置見 [s3-location.json](s3-location.json)，上傳及還原收據保留於本目錄。舊版封存仍可還原。

```sh
python3 materials/community-hero-forge/restore.py \
  --manifest-dir materials/community-hero-forge/supplements/admission-37-20260909 \
  --download --parts-dir /private/tmp/ggd-admission37-parts \
  --output /private/tmp/ggd-admission37-restored
```

使用既定 `vibe-coding` profile、`ap-east-2` region 與授權 bucket；不覆寫原素材，不更改正式服務。這份封存證明完整作品可還原，不能取代畫面驗收或正式部署。

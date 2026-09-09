# 第一批惡搞改編驗收材料

本封存包含 32 份通過當前服務建包的完整英雄 ZIP、167 份原始因果模擬紀錄及 2 張明確失敗的瀏覽器截圖，共 201 份。三個分段共 91,135,993 bytes，已上傳授權 S3 並重新下載、逐檔 SHA-256 還原驗證。

這不是 37 名全部發布或畫面完成的證明。武藤遊戲、坂田銀時、奇犽、艾莉絲與 SUN樂的預設投稿情境仍失敗；兩張圖片記錄 PBR 光照預载阻擋。最新狀態見 [驗證收據](../../refinements/parody-verification.json)，全部 37 名編輯來源仍在 Git。

固定位置與 manifest SHA 見 [s3-location.json](s3-location.json)，[上傳收據](s3-upload-receipt.json) 與 [重新下載還原收據](s3-restoration-receipt.json) 分別記錄兩個階段。Git 保留程式、英雄／技能設定、原文、版本與精簡驗證 JSON；此處 ZIP、原始大型模擬資料與 PNG 只放 S3。

```sh
python3 materials/community-hero-forge/restore.py \
  --manifest-dir materials/community-hero-forge/supplements/parody-37-20260909 \
  --download --parts-dir /private/tmp/ggd-parody-parts \
  --output /private/tmp/ggd-parody-restored
```

使用既定 `vibe-coding` profile、`ap-east-2` region、授權 bucket，工具自行驗角色與 SHA。還原目錄必須不存在；不覆寫原素材、Git 或執行中的測試服務。

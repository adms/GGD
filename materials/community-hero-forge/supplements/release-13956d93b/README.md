# 整合後同版驗收材料

新建的 37 份 ZIP、帶圖示載荷的原始 inspection／snapshot、封存對局錄影，以及未上架英雄還原驗收的版本庫二進位素材已存至指定 S3。6 分段共 200,332,478 bytes，還原 2,202 個檔案；Git 保留完整來源／技能／微調設定、執行腳本、版本 JSON、manifest、SHA-256 與驗收收據。

固定位置由 `s3-location.json` 記錄，manifest SHA-256 為 `abecb2b2cb9d47d981b7688903d22c6627cf7e8b84af9c1cc7c852159390dada`。`s3-upload-receipt.json` 確認每個遠端物件的大小及 checksum；`s3-restore-receipt.json` 確認從 S3 全新下載後逐檔還原，37 ZIP 與本次原件完全相同。沒有讀取 AWS credentials 檔、使用其他 profile、刪除或覆寫既有物件。

版本庫的 **2,445 份 JSON** 在此目錄 `control/legacy-backups-attempt2/`；相對路徑與 S3 中的素材一致。下載到新目錄後，將 `control/` 的內容複製進該還原目錄，即可重組這次完整 4,534 份檔案的歷史版本庫；本機已實際合併核對所有 bytes。

在 repo 根目錄執行既有還原工具（兩個 `/private/tmp` 目錄必須是新的）：

```sh
python3 materials/community-hero-forge/restore.py \
  --manifest-dir materials/community-hero-forge/supplements/release-13956d93b \
  --download --parts-dir /private/tmp/ggd-release-new-parts \
  --output /private/tmp/ggd-release-new-materials
cp -R materials/community-hero-forge/supplements/release-13956d93b/control/. \
  /private/tmp/ggd-release-new-materials/
```

只使用既有 `vibe-coding` profile／ap-east-2／ggd-390630837668-ap-east-2-an。工具自行驗證 AssumeRole 身分，AccessDenied 即停止。

Git 的驗收設定與逐名 before／after project 位於 [同版服務報告](../../../../docs/_reports/community-hero-forge/release-13956d93b/README.md)。帶 base64 圖示的原始 HTTP inspection／snapshot 僅作不可變證據放在 S3，權威英雄與技能設定則在 Git；完整 ZIP 同時保存這些依賴。原有材料清單不變，新包作為追加版本，不取代舊包。帳號 DB、密碼、登入票據與服務金鑰排除。

此材料完整性收據不等於正式部署、原作素材完全還原或所有舊生成器均能重新執行。

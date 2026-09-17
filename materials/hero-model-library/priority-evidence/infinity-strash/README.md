# Infinity Strash／達伊大冒險優先素材證據

`dai-jumpforce-audio-local-files.json` 提供達伊現有 JUMP FORCE 音訊儲備的逐檔絕對路徑、大小、SHA-256、時長、分類與 S3 備份位置。可用以下命令直接重驗全部本機位元組：

```bash
python3 tools/hero-model-library/verify_voice_group_files.py \
  'parallel-ps-jumpforce-audio:JForce_Dai' \
  --output materials/hero-model-library/priority-evidence/infinity-strash/dai-jumpforce-audio-local-files.json \
  --check
```

這批共有 261 個 OGG、7,868,623 bytes、420.931453 秒；其中 14 個依原始目錄分類為音效，247 個只標示為待聽審語音來源。語言、逐段說話者、逐段事件及台詞仍未確認，因此不可用此收據宣稱日文、可合成、已綁定英雄、可切換或已部署。

Infinity Strash 的達伊、波普、巴恩變身前後角色本體仍需從使用者已擁有的 Windows 遊戲資料擷取；目前 SMB 未掛載時無法以研究網址或音訊包取代模型實檔。

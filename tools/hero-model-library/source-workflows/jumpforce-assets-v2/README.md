# JUMP FORCE 已取得素材整合稽核 v2

這個流程不重新下載，也不要求共享卷在線。它把五批共 58 個公開音訊原包、Steam 未封裝 Streaming 音訊、六個 PAK 的固定目錄索引，以及達伊 `chr0430` 已抽出模型資料合成一份中央查詢入口。

`build_inventory.py` 會重新計算 58 個本機原包的 SHA-256，並對照 `public-source-files.json`；Streaming 的 4,034 個 WAV 與達伊 2,000 個凍結檔沿用已完成 S3 完整讀回與逐成員 SHA 的權威清單。這避免為了生成精簡報告重複掃描數 GB 已固定內容。

角色身份只接受兩種證據：公開原包／解包資料夾的精確角色群標籤，以及專案既有 `chrNNNN` 對應表。聽審清單是群組層級入口；任何一段音訊的說話者、語言、台詞、事件與技能綁定都維持未確認。

```bash
node --import tsx tools/hero-model-library/source-workflows/jumpforce-assets-v2/audit_dai_candidate.mts \
  --glb ../GGD-Asset-Library/converted/jump-force-steam-dai-v1/dai-chr0430-review-v4.glb \
  --output materials/hero-model-library/source-inventories/jumpforce-assets-v2/dai-current-policy.json
python3 tools/hero-model-library/source-workflows/jumpforce-assets-v2/build_inventory.py --workspace ..
python3 tools/hero-model-library/source-workflows/jumpforce-assets-v2/update_four_day_report.py
```

重現檢查使用相同命令加 `--check`；單元測試入口是 `python3 -m unittest tools/hero-model-library/source-workflows/jumpforce-assets-v2/test_inventory.py`。

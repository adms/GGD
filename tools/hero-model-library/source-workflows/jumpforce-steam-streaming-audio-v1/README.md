# JUMP FORCE Steam Streaming 音訊

這個流程只讀取 Steam App 816020、build 8523149 安裝目錄中未封裝於 PAK 的 `JUMP_FORCE/Content/Sound/Streaming/*.awb`。它複製 43 個原始 AFS2/AWB，使用指定且記錄 SHA-256 的 `vgmstream-cli` 解碼所有 CRI HCA 子串流，並保存逐檔格式、時長與 SHA-256。

```sh
python3 tools/hero-model-library/source-workflows/jumpforce-steam-streaming-audio-v1/extract.py \
  --source-dir '/Volumes/common/JUMP FORCE/JUMP_FORCE/Content/Sound/Streaming' \
  --output '../GGD-Asset-Library/extracted/jumpforce-steam-streaming-audio-v1' \
  --vgmstream '../GGD-Asset-Library/conversions/alucard-audio-20260911-v1/tools/vgmstream-cli'
```

`EvnVoice`、`ActSE`、`BGM` 與 `SE` 只作原生 bank 分類證據。`EvnVoice` 不代表每段都已確認為指定角色本人台詞；語言、說話者、對白、事件與技能綁定仍須逐段聽審。原始 AWB、解碼 WAV 與大型逐檔 manifest 保留在本機及 S3 `legacy/`，Git 只保存流程、中央索引與壓縮逐檔查詢索引。

完成本機解碼與逐檔驗證後，使用來源修正腳本加入中央來源設定，再重建正式語音索引：

```sh
python3 tools/hero-model-library/source-workflows/jumpforce-steam-streaming-audio-v1/integrate.py \
  --workspace '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT'
python3 tools/hero-model-library/voice_index.py \
  --workspace '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT'
```

S3 完整讀回並由 `promote_uploaded_backup.py` 提升中央記錄後，用 `build_evidence.py` 重新核對本機封存檔、讀回收據、中央來源及 41 個音訊群，再產生 Git 內的精簡驗證收據。

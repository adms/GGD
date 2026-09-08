# 解析與轉換相依來源

`source/outputs/game-asset-library-20260907/tools/` 保存工具來源；資料依原工作区相對目錄另由 S3 提供。

- `index_300_models.py`：僅使用 Python 標準庫。JUMPX／EG3D 解析、OBJ 與原生動畫 payload 擷取均在此檔；JumpXToolchain 是格式參考，不是此 Python 工具的執行相依。
- `extract_300_packages.py`、`extract_mba_gdp.py` 等解析程式已列在 `source-manifest.json`。
- `extract_300_audio.py`：同目錄的 `python-fsb5/fsb5/` Python 來源與 LICENSE 已納入 Git。FADPCM 本機 adapter 的 `fadpcm_local.c` 及 upstream 參考 `fadpcm_decoder.c` 也在 Git；執行時的 dylib 由 C 來源建置。
- `convert_mba_models.py`：需要 Python Pillow 與系統 Assimp CLI。FSB Vorbis 轉換還需要系統 Ogg／Vorbis 函式庫。這些是執行環境相依，沒有把系統安裝的二進位檔加入 Git；不宣稱只 clone 就具備完整轉換環境。

macOS 在還原的工作區根目錄建置 FADPCM adapter：

```sh
cc -O2 -dynamiclib outputs/game-asset-library-20260907/tools/fadpcm_local.c \
  -o outputs/game-asset-library-20260907/tools/libfadpcm_local.dylib
```

不要直接在 Git 的純文字來源鏡像內產出或匯入整批素材。legacy 原檔仍需人工明確許可才可還原及取用。

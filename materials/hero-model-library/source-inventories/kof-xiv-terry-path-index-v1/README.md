# KOF XIV Terry（TRY）路徑級素材索引

> 本頁由 `build_inventory.py` 產生。WAD listing 是來源證據，不等於已抽出檔案；所有 runtime 綁定皆維持待審查。

## 結果

- 固定 `Chara/TRY/` 路徑 375 筆，共列示 239,511,922 bytes。
- 模型容器 2（完整身體 1、帽子配件 1）、骨架／蒙皮中繼 3、原生動作容器 3。
- 角色貼圖 92、VFX 記錄／網格／貼圖 87，其中 `.eff` 可讀名稱候選 25。
- 語音路徑 122、音效路徑 37、音訊中繼 7；實體音訊 0，聽審核准 0。
- 逐路徑索引：`files.jsonl.gz`，SHA-256 `ae0acf2c331977713df723fa7826d0f6ebef5477687242e4d9251cce56b202de`。

## 狀態

| found listing | mounted payload | extracted | converted | reviewed | backend option | deployed |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 0 | 0 | 0 | 0 | 0 |

身份以 `TRY` 根目錄、`TRY.obac`、`v_006_try_` 音訊命名與現有 `ssbu-dolly` Terry 記錄交叉核對；仍須在重新掛載並抽出身體後做視覺確認。

## 重建

```bash
python3 tools/hero-model-library/source-workflows/kof-xiv-terry-path-index-v1/build_inventory.py --workspace ..
python3 tools/hero-model-library/source-workflows/kof-xiv-terry-path-index-v1/build_inventory.py --workspace .. --check
```

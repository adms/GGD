# KOF XIV 原生容器只讀前導解析

> 由 `probe.py` 生成。此文件只記錄長度前綴 ASCII 名稱表與工具讀取結果，不能手改，也不代表模型、動作或特效已轉換。

## 結論

- 三名角色的原檔 SHA-256 已與原始 `files.jsonl.gz` 交叉驗證。
- OMIR 與 OSEC 的有序名稱表逐一相同；OTRA 的連續名稱表包含該骨架名稱集合。這證明可安全產出骨架名稱與動作標籤前導資料，不代表骨架 hierarchy／bind pose 已解碼。
- OTRA 可讀到精確長度前綴的原生動作標籤；尚未讀出 transform key、frame rate、時長、插值或事件時序。
- Assimp 對這 12 個 OBAC／OMIR／OSEC／OTRA 原生容器皆沒有可用 reader；本機 Blender 沒有已稽核的對應 importer。OBAC 幾何、材質、權重和 bind 資料仍是完成模型 pilot 的阻擋點。

| ID | 角色 | 骨架名稱 | OTRA 動作標籤候選 | 模型 GLB | 原生動作 GLB |
|---|---|---:|---:|---|---|
| `MAI` | 不知火舞 / Mai Shiranui | 211 | 105 | 未轉換 | 未轉換 |
| `IOR` | 八神庵 / Iori Yagami | 220 | 114 | 未轉換 | 未轉換 |
| `KYO` | 草薙京 / Kyo Kusanagi | 227 | 119 | 未轉換 | 未轉換 |

## 可重跑

```sh
python3 tools/hero-model-library/source-workflows/kof-xiv-native-container-probe-v2/probe.py --repo . --workspace ..
python3 tools/hero-model-library/source-workflows/kof-xiv-native-container-probe-v2/probe.py --repo . --workspace .. --check
python3 -m unittest discover -s tools/hero-model-library/source-workflows/kof-xiv-native-container-probe-v2 -p 'test_*.py'
```

完整容器 SHA、magic、offset、骨架名稱與動作標籤見同目錄 `receipt.json`。

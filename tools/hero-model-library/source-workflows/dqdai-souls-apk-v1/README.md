# 《勇者鬥惡龍 達伊的大冒險－燃魂羈絆》日版 APK 唯讀盤點

這個工作流先回答「APK 裡面是否有可繼續解析的巴恩資源」，不直接宣稱已取得模型、動作、特效或語音。`inventory_apk.py` 只把 APK 當作 ZIP 唯讀容器，不解包成實體目錄，不執行 APK、DEX、`.so`、Unity 腳本或 Managed assembly。

已確認的日版 1.17.0（138）公開來源、大小、檔案雜湊、簽章雜湊與取得狀態固定在 `source-reference.json`。實際 APK 不進 Git；只有逐位元讀回相符後才可把 `payloadAcquired` 改為 `true`。遊戲安裝後原本還需「一括下載」，且最終章晚於 APK 發佈日；因此 APK 中沒找到鬼眼王時，不能推論遊戲從未有該素材。

盤點內容包含：

- APK 絕對路徑、位元組與 SHA-256。
- `assets/bin/Data`、`StreamingAssets`、IL2CPP metadata、`libunity.so`、`libil2cpp.so` 等 Unity 線索。
- 依副檔名與 `UnityFS` / `UnityRaw` / `UnityWeb` 檔頭偵測的 AssetBundle / serialized resource 候選。
- Addressables `aa/`、`addressables/`、`catalog*.json|hash|bin` 候選。
- CRI Atom、Wwise、FMOD 與已解碼音訊容器候選。
- 檔名與成員內容中的 UTF-8 / UTF-16 別名命中：巴恩、老巴恩、年輕巴恩、鬼眼王巴恩、密斯特巴恩。
- `バラン` / `巴蘭` / `巴兰` / `baran` 另列為排除證據，永遠不會被登記為巴恩候選。

## 執行

從 repository root 執行：

```bash
python3 tools/hero-model-library/source-workflows/dqdai-souls-apk-v1/inventory_apk.py \
  '/absolute/path/to/dqdai-souls-jp-1.17.0.apk' \
  --expected-sha256 2f41820782a048cee4c162f80d8a26c5979df352687a60f285c34a3db5832e8d \
  --output '/absolute/path/to/receipt.json'
```

不給 `--output` 時 JSON 寫到 stdout。來源 APK 不會被修改。預設單一成員最多掃描 256 MiB、整包最多掃描 4 GiB 的解壓後內容；超過的成員會出現在 `scanLimits` 而不會靜默略過。可依取得的 APK 實際大小調整：

```bash
python3 tools/hero-model-library/source-workflows/dqdai-souls-apk-v1/inventory_apk.py \
  '/absolute/path/to/file.apk' \
  --max-scan-member-bytes 536870912 \
  --max-scan-total-bytes 8589934592 \
  --output '/absolute/path/to/receipt.json'
```

## 解讀 JSON

`identitySearch.matches` 只代表「別名在某個 APK 成員的路徑或內容出現」。它不足以證明有完整身體、貼圖、骨架、動作、特效或語音，也不代表已轉換、已驗收、已登記、可切換或已部署。

若 APK 只有 Addressables catalog 或 bootstrap 資源，而真正 bundle 原本要在開服後下載，收據會呈現 catalog 候選但沒有對應 bundle。此時正確狀態是「APK 已取得／已盤點，巴恩 payload 待取得」，不能寫成已取得模型。

取得真實 APK 並有別名命中後，下一步才是用專案已固定的 UnityPy 1.25.3 或 AssetRipper 靜態解析命中 bundle，建立 Unity object/path ID 與 Mesh、Texture2D、AnimationClip、ParticleSystem、TextAsset/音訊容器的對應。轉換必須依實際 object 關聯分開老巴恩、年輕巴恩、鬼眼王與密斯特巴恩，不可根據單一字串猜測。

## 測試

```bash
python3 -m unittest tools/hero-model-library/source-workflows/dqdai-souls-apk-v1/test_inventory_apk.py
```

測試會在臨時目錄建立最小合成 APK，驗證 Unity、AssetBundle、Addressables、AWB、四種巴恩形態與巴蘭排除規則，不會寫入主索引。

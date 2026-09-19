# 巴恩大魔王 3D 候選跨來源工作流

`index_bonds_assets.py` 以靜態解析方式解開已保存的《燃魂羈絆》 `ALI2`
索引，不執行 Android 應用。它會將 Unity 資產路徑對到內容雜湊 blob，
核對 blob 存在與位元組數，大型 gzip JSONL 放在 `GGD-Asset-Library`，Git 只收
有界的摘要與巴恩關鍵字候選。檔名命中只能當發現證據，仍須解析物件與視覺辨識。

`build_inventory.py` 會根據本機已驗證的 BowlRoll PMX 轉換收據、WebGL 三視圖及《燃魂羈絆》完整快取下載進度，重建中央索引與「2026-09-11～2026-09-17」總清單。

```sh
python3 tools/hero-model-library/source-workflows/vearn-related-3d-v1/build_inventory.py --workspace ..
python3 tools/hero-model-library/source-workflows/vearn-related-3d-v1/build_inventory.py --workspace .. --check
python3 -m unittest tools/hero-model-library/source-workflows/vearn-related-3d-v1/test_build_inventory.py
python3 -m unittest tools/hero-model-library/source-workflows/vearn-related-3d-v1/test_index_bonds_assets.py
```

完整資產索引與候選抽出可重跑：

```sh
python3 tools/hero-model-library/source-workflows/vearn-related-3d-v1/index_bonds_assets.py \
  --cache-files-root "../GGD-Asset-Library/intake/public-game-archives-20260917/heros-bonds-final-cache-1.17.0.121/extracted/cache-v1/sdcard/Android/data/com.square_enix.android_googleplay.dqdaihb/files/downloaded/files" \
  --bundledtree-apk "../GGD-Asset-Library/intake/public-game-archives-20260917/heros-bonds-final-cache-1.17.0.121/extracted/xapk/bundledtree.apk" \
  --local-output "../GGD-Asset-Library/indexes/heros-bonds-v1/bonds-assets.jsonl.gz" \
  --extract-output "../GGD-Asset-Library/conversions/heros-bonds-vearn-candidates-v1"
```

解密與 Unity 物件盤點由 `bonds-aladin-decrypt-v1` 工作流接續完成。
51/51 個加密 blob 已還原為 UnityFS。`ch027005800`、`ch027005801`
的材質與模型物件名直接命中 `kiganBurnHead`、`kiganBurn_body`、
`kiganBurn_eye`，因此列為鬼眼王原作模型候選；仍缺 rig-aware GLB
與最終視覺驗收。`ch027003800` 已依 `chyoZaboera` 物件名排除為
超魔生物札波耶拉；`ch027003700` 為 `shinBurn` 真巴恩系。

容器判定依據是 DeNA 公開的 Aladin 架構：內容雜湊 blob、FlatBuffers index、
可替換的加密，以及可 random access 的 stream cipher 與 resource key ID。
官方資料：<https://speakerdeck.com/dena_tech/techcon2021-10>。本工作流的
`probe_bonds_blobs.py` 保留解密前的 magic、entropy 與常見密碼佈局排除證據；它另會解出
base APK 的 `ALDC` catalog，記錄 349 筆 blob metadata 與 3 組 key-info，並從
arm64 split APK 確認 `Aladin.Core.dll`、`Aladin.Core.Unity.dll` 與
`Abdool.Integration.Aladin.dll` marker。公開
<https://github.com/mao-test-h/SeekableAesAssetBundle> 只作 AES-ECB block-counter
作法對照，不視為 Aladin 實作。

當前解密結果與逐檔 SHA-256 見
`materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/decryption-receipt.json`；
UnityPy 物件、OBJ 與 PNG 匯出見同目錄 `unity-object-receipt.json`。

```sh
python3 tools/hero-model-library/source-workflows/vearn-related-3d-v1/probe_bonds_blobs.py \
  --manifest "../GGD-Asset-Library/conversions/heros-bonds-vearn-candidates-v1/manifest.json" \
  --base-apk "../GGD-Asset-Library/intake/public-game-archives-20260917/heros-bonds-final-cache-1.17.0.121/extracted/xapk/com.square_enix.android_googleplay.dqdaihb.apk" \
  --arm64-apk "../GGD-Asset-Library/intake/public-game-archives-20260917/heros-bonds-final-cache-1.17.0.121/extracted/xapk/config.arm64_v8a.apk" \
  --output materials/hero-model-library/source-inventories/vearn-related-3d-v1/bonds-aladin-probe.json
```

`extract_bonds_audio.py` 只處理已確認為 AFS2 的 AWB，將內含 HCA 解碼成 WAV，
逐檔保留 SHA-256。輸出仍是未綁定編號流，說話者與技能事件須另行聽審。

這個工作流不會將 OBJ 記成已完成的 rig-aware GLB，也不會將未註冊候選寫成已上架。

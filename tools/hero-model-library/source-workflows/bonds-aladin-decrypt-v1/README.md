# 《燃魂羈絆》Aladin 解密工作流

本工作流只讀取已保存的 APK、ALI2 清單與 hash blob，將結果寫到指定的轉換目錄。它不修改來源快取，也不需要啟動已停服的遊戲。

## 已還原的實作

- `global-metadata.dat`：去除遊戲加的 4-byte prefix，再從標準 header offset 8 開始套用固定 8-byte XOR key。還原後是 IL2CPP metadata v27、header 0x100。
- IL2CPP 靜態分析：`ChaCha20BurstCryptProvider.Decrypt` 位於 RVA `0x64213A8`，`Acpb.Create` 位於 `0x641FA2C`，`ChaCha20SectorStream<Acpb>.Read` 位於 `0x48115AC`。
- 資產 cipher：自訂 sigma `A3AxwtfWD<PbxMx$`、32-byte ALDC runtime key、12-byte nonce（ALI2 `pathHash` little endian + `0x63686368` little endian）、counter 1 起算、依 key/nonce 選 5 或 6 turns、32 KiB sector。
- 關鍵修正：nonce 的前 8 bytes 是 ALI2 `pathHash`，不是 blob 檔名／`blobId`。這是先前標準 ChaCha 探測無法命中 `UnityFS` 的原因。

## 重建

```bash
python3 tools/hero-model-library/source-workflows/bonds-aladin-decrypt-v1/decrypt_bonds_blobs.py \
  --manifest ../GGD-Asset-Library/conversions/heros-bonds-vearn-candidates-v1/manifest.json \
  --base-apk ../GGD-Asset-Library/intake/public-game-archives-20260917/heros-bonds-final-cache-1.17.0.121/extracted/xapk/com.square_enix.android_googleplay.dqdaihb.apk \
  --output-dir ../GGD-Asset-Library/conversions/heros-bonds-aladin-decrypted-v1 \
  --receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/decryption-receipt.json
```

只有所有加密候選都解成已知容器時命令才回傳 0。產物保留完整輸入／輸出 SHA-256、絕對路徑、turn index 與容器判定。

```bash
PYTHONPATH=/private/tmp/bonds-pylibs python3 -m unittest discover \
  -s tools/hero-model-library/source-workflows/bonds-aladin-decrypt-v1 \
  -p 'test_*.py'
```

要繼續盤點 Unity 物件並匯出無骨架 OBJ／PNG，先將分析依賴裝在暫存目錄：

```bash
python3 -m pip install --target /private/tmp/bonds-pylibs UnityPy==1.20.26
PYTHONPATH=/private/tmp/bonds-pylibs python3 \
  tools/hero-model-library/source-workflows/bonds-aladin-decrypt-v1/export_unity_objects.py \
  --decryption-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/decryption-receipt.json \
  --output-dir ../GGD-Asset-Library/conversions/heros-bonds-unity-objects-v1 \
  --receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/unity-object-receipt.json
```

OBJ 只作視覺身分判定與幾何備份，不可宣稱已保留骨架、蒙皮或動作綁定。

## Rigged GLB 與 runtime LOD

`export_rigged_gltf.py` 從 mesh bundle 的 137 個 Transform、SkinnedMeshRenderer bone list、inverse bind matrix 及逐頂點權重直接產生來源版 GLB。mesh bundle 的貼圖 PPtr 已被來源建置清空，因此程式只按同包的原始 material／texture 命名規則配回 base-color，並在收據逐項留下規則、絕對路徑與 SHA-256。`ch027005801` 沒有獨立 texture bundle，明列共用 `ch027005800` 貼圖組。

```bash
PYTHONPATH=/private/tmp/bonds-pylibs python3 \
  tools/hero-model-library/source-workflows/bonds-aladin-decrypt-v1/export_rigged_gltf.py \
  --object-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/unity-object-receipt.json \
  --output-root ../GGD-Asset-Library/conversions/heros-bonds-rigged-v1 \
  --receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/rigged-gltf-receipt.json \
  --animation-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/animation-clips.json
```

來源版兩個形態都是 29,990 triangles，原檔保留不覆蓋。`make_runtime_lod.py` 由 Blender 5.2.1 LTS 批次減面，優先保留臉與頭髮；5800 為 7,898 triangles，5801 為 7,897 triangles。這個 runtime-v1 **只通過面數**，實測仍是 12 draws 與 1024px 最大貼圖，因此只保留為中間產物，不能註冊或部署。

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python tools/hero-model-library/source-workflows/bonds-aladin-decrypt-v1/make_runtime_lod.py -- \
  ../GGD-Asset-Library/conversions/heros-bonds-rigged-v1/ch027005800/ch027005800-rigged.glb \
  ../GGD-Asset-Library/conversions/heros-bonds-rigged-v1/ch027005800/ch027005800-runtime-lod.glb \
  materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/ch027005800-runtime-lod.json
```

5801 使用同一命令替換 ID。`make_runtime_v2.py` 再把每個 mesh 的原始材質確定性排入 256x256 atlas，依 polygon 的原 material slot 重映射 UV，並合併成單一材質。兩個 runtime-v2 都是 5 meshes、5 skinned primitives、5 張內嵌 256px atlas、1 skin；面數維持 7,898／7,897。AnimationClip 尚未嵌入，GLB animations 為 0。

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python tools/hero-model-library/source-workflows/bonds-aladin-decrypt-v1/make_runtime_v2.py -- \
  ../GGD-Asset-Library/conversions/heros-bonds-rigged-v1/ch027005800/ch027005800-runtime-lod.glb \
  ../GGD-Asset-Library/conversions/heros-bonds-rigged-v1/ch027005800/ch027005800-runtime-v2.glb \
  materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/ch027005800-runtime-v2.json
```

三視圖以 `render_gltf_preview.py` 產生，已由 Blender 成功重新匯入兩個 runtime-v2；收據是 `ch027005800-runtime-v2-preview.json` 與 `ch027005801-runtime-v2-preview.json`。

官方 Khronos Validator 固定使用 `gltf-validator@2.0.0-dev.3.10`，依賴只裝在暫存目錄，不修改專案套件：

```bash
npm install --prefix /private/tmp/ggd-gltf-validator gltf-validator@2.0.0-dev.3.10
node tools/hero-model-library/source-workflows/bonds-aladin-decrypt-v1/validate_glb.js \
  /private/tmp/ggd-gltf-validator/node_modules/gltf-validator/index.js \
  materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/khronos-validation.json \
  ../GGD-Asset-Library/conversions/heros-bonds-rigged-v1/ch027005800/ch027005800-rigged.glb \
  ../GGD-Asset-Library/conversions/heros-bonds-rigged-v1/ch027005800/ch027005800-runtime-lod.glb \
  ../GGD-Asset-Library/conversions/heros-bonds-rigged-v1/ch027005800/ch027005800-runtime-v2.glb \
  ../GGD-Asset-Library/conversions/heros-bonds-rigged-v1/ch027005801/ch027005801-rigged.glb \
  ../GGD-Asset-Library/conversions/heros-bonds-rigged-v1/ch027005801/ch027005801-runtime-lod.glb \
  ../GGD-Asset-Library/conversions/heros-bonds-rigged-v1/ch027005801/ch027005801-runtime-v2.glb
```

目前收據涵蓋來源版、runtime-v1、runtime-v2 共 6 檔，結果為 0 errors、32 warnings。warnings 是 Khronos 對 skinned mesh 非 root node 的可攜性提醒；Blender 5.2.1 已成功匯入 runtime-v2 並產生三視圖。AnimationClip 來源另列於 `animation-clips.json`：5800 有 1 段，5801 有 3 段，仍保留在解密 UnityFS，尚未把曲線嵌入 GLB，也不冒稱完整戰鬥動作。

## 重建庫存文件

`inventory.json` 和同目錄 `README.md` 只能由 `build_inventory.py` 產生。命令須同時帶入 rigged、LOD、preview 與 validator 收據；這可避免已完成 GLB 後仍顯示舊的 `awaiting-rig-aware-export` 狀態。現在的註冊數與部署數都明列為 0。

```bash
python3 tools/hero-model-library/source-workflows/bonds-aladin-decrypt-v1/build_inventory.py \
  --receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/decryption-receipt.json \
  --object-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/unity-object-receipt.json \
  --rigged-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/rigged-gltf-receipt.json \
  --animation-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/animation-clips.json \
  --runtime-lod-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/ch027005800-runtime-lod.json \
  --runtime-lod-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/ch027005801-runtime-lod.json \
  --runtime-v2-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/ch027005800-runtime-v2.json \
  --runtime-v2-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/ch027005801-runtime-v2.json \
  --preview-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/ch027005800-runtime-v2-preview.json \
  --preview-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/ch027005801-runtime-v2-preview.json \
  --validation-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/khronos-validation.json \
  --published-candidates materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/published-candidates.json \
  --output-dir materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1
```

Main 或其他工作流需要直接讀取成品時，先執行 `publish_candidates.py`。腳本會重新解析 GLB bytes 並交叉核對 runtime-v2、preview、Khronos 收據與 SHA-256，通過後才把兩顆 GLB 放進 `candidates/`、六張三視圖放進 `previews/`，並生成只含 Git 相對路徑的 `published-candidates.json`。

```bash
python3 tools/hero-model-library/source-workflows/bonds-aladin-decrypt-v1/publish_candidates.py \
  --repo-root . \
  --output-dir materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1 \
  --runtime-v2-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/ch027005800-runtime-v2.json \
  --runtime-v2-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/ch027005801-runtime-v2.json \
  --preview-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/ch027005800-runtime-v2-preview.json \
  --preview-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/ch027005801-runtime-v2-preview.json \
  --validation-receipt materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/khronos-validation.json
```

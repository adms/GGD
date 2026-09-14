# KOF XIV / JUMP FORCE 容器覆蓋工作流

這個工作流只讀既有固定索引與本機已抽出檔案，不要求 Steam 共享卷在線，也不重新下載。它會：

1. 從 JUMP FORCE 六個 PAK 的完整路徑索引列出全部 `chrNNNN` token 及模型、設定、VFX、音訊路徑數。
2. 從 KOF XIV `assets.wad` 完整 QuickBMS listing 列出全部 `Chara/<ID>` 及副檔名／素材種類數。
3. 明確區分只有 listing 的 KOF ID，與已抽出且逐檔 SHA 驗證的 MAI／IOR／KYO。
4. 將已抽出的 MAI／IOR／KYO `Effect/*.dds` 轉成 256px PNG 候選；不自動建立 VFX 或音訊綁定。
5. 以精確 ASCII basename 交叉參照解析 71 個 `EFF` 對 DDS／PNG／OBAC／ONC 的直接依賴，產生逐組 SHA 證據與視覺審查頁。這不是完整二進位格式解碼；blend、秒制時序、發射器及骨架掛點仍 fail-closed。

```bash
python3 tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/build_inventory.py --workspace ..
python3 tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/convert_kof_xiv_vfx_textures.py --workspace ..
python3 tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/probe_kof_xiv_effects.py --workspace .. --write
python3 tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/query.py chr0430
python3 tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/query.py MAI --game kof-xiv

python3 tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/build_inventory.py --workspace .. --check
python3 tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/convert_kof_xiv_vfx_textures.py --workspace .. --check
python3 tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/probe_kof_xiv_effects.py --workspace ..
python3 -m unittest \
  tools.hero-model-library.source-workflows.kof-jump-container-coverage-v1.test_build_inventory
```

由於目錄含連字號，實際單元測試請用 discover：

```bash
python3 -m unittest discover -s tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1 -p 'test_*.py'
```

產出的 PNG 是來源保留與人工檢視候選。專有 `EFF/OBAC/ONC` 關係、混合模式、時序、掛點及技能事件尚未解析，因此不是 GGD VFX 成品，也未加入後台選項。

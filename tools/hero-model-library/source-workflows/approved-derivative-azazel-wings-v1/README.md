# 阿薩謝爾小型蝙蝠翼加工副本 v1

此流程只接受既有 `derivative:azazel` 獨立 GLB，沒有擴大加工到其他角色。它保留已核准的「上半身咖啡色、下半身深咖啡色」改色，將 512px 內嵌 atlas 以 Lanczos 縮到現行 256px 上限，再加入一個小型深紅／紫色蝙蝠翼 primitive。翅膀所有頂點以 100% 權重綁定 `Bip01 Spine1`，因此跟隨胸背骨；來源身體 primitive、骨架、節點和五段借用動作不改。成品依 owner 最新裁決採 `<= 8,000` 面，並保留 draw <= 6、貼圖 <= 256px、單段通道 <= 500 的現行硬限制。

```sh
python3 tools/hero-model-library/source-workflows/approved-derivative-azazel-wings-v1/build_candidate.py
node --import tsx tools/hero-model-library/source-workflows/approved-derivative-azazel-wings-v1/validate_candidate.mts
python3 tools/hero-model-library/source-workflows/approved-derivative-azazel-wings-v1/build_candidate.py --output /private/tmp/azazel-wings-v1-rebuild.glb
python3 tools/hero-model-library/source-workflows/approved-derivative-azazel-wings-v1/validate_preservation.py
node --import tsx tools/hero-model-library/source-workflows/approved-derivative-azazel-wings-v1/publish_candidate.mts
node --import tsx tools/hero-model-library/source-workflows/approved-derivative-azazel-wings-v1/register_candidate.mts
python3 tools/hero-model-library/source-workflows/approved-derivative-azazel-wings-v1/freeze_registration_validation.py
python3 tools/hero-model-library/source-workflows/approved-derivative-azazel-wings-v1/render_and_inventory.py
```

輸入 GLB 仍保留在原 content path；輸出先放 `GGD-Asset-Library/conversions/approved-derivative-azazel-wings-v1/`。`publish_candidate.mts` 建立 content-addressed source model，`register_candidate.mts` 透過 `ModelVersions` 新增獨立版本、保留全部舊選項，並依 owner 指示設為 automatic 預選。本流程不聲稱正式站部署，也不把喜羊羊來源動作寫成阿薩謝爾原生動作。

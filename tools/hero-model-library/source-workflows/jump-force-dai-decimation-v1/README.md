# JUMP FORCE 達伊 `chr0430` 正式減面候選

本工作流只讀既有 `review-v4` 原件，以通用 `tools/model-budget/optimize.ts` 建立可重現候選。原始 GLB 不修改；輸出留在本機素材庫，因 draw call 與動作仍不合規，不複製到 Git runtime，也不註冊後台選項。

## 固定來源與結果

- 原件：`GGD-Asset-Library/converted/jump-force-steam-dai-v1/dai-chr0430-review-v4.glb`，76,796,608 bytes，SHA-256 `53b3b19eb04e2eb0e6d1827122f5b41a403c2ced188bd3042371c9dec80cd810`。
- 候選：`GGD-Asset-Library/conversions/jump-force-dai-decimation-v1/run-a/dai-chr0430-review-v4.glb`，2,619,896 bytes，SHA-256 `f8f3f1c025b50c76f0c31beddd2876733215bc48dc0a47238cb35c58016d1b23`。
- 59,768 → 7,947 triangles；2048 → 256px；1 skin／159 joints／20 個蒙皮 primitives／材質與貼圖槽配置保留。
- 獨立第二次重建位元組完全相同。Khronos 0 errors；24 個 warning 都是 PNG metadata 的 `IMAGE_FEATURES_UNSUPPORTED`，另有 10 個 unused tangent/object info。
- 三個固定鏡頭的亮像素分類 XOR 最大 1.016250%，低於正式減面 5% 門檻；A/B 圖保存在 Git 證據目錄。

## 明確阻塞

候選仍有 20 draw primitives，超過角色 hard limit 6。現有單通道 atlas 只安全支援 2/20 primitives：16 個有 normal／MR／AO 等第二貼圖、一個 MASK 鏡片使用超出 `[0,1]` 的 tiling UV、一個沒有 base color 貼圖。即使只合併完全相同的材質語意，仍有 11 組，因此不能把它寫成 hard-policy pass。

來源與候選都沒有動畫片段，尚無 GGD 六態動作。候選狀態固定為 `geometry-and-texture-validated; draw-call-hard-blocked; no-six-state-motion`；未進成品庫、未註冊、不可切換、未部署。

## 重建與驗證

```bash
python3 tools/hero-model-library/source-workflows/jump-force-dai-decimation-v1/build_candidate.py \
  --repo . --asset-root ../GGD-Asset-Library --write

python3 tools/hero-model-library/source-workflows/jump-force-dai-decimation-v1/draw_call_audit.py \
  ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v1/run-a/dai-chr0430-review-v4.glb \
  --repo . \
  --output ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v1/draw-call-audit.json

node --import tsx tools/hero-model-library/source-workflows/jump-force-dai-decimation-v1/validate_candidate.mts \
  ../GGD-Asset-Library/converted/jump-force-steam-dai-v1/dai-chr0430-review-v4.glb \
  ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v1/run-a/dai-chr0430-review-v4.glb \
  ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v1/run-b/dai-chr0430-review-v4.glb \
  ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v1/conversion.json \
  ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v1/draw-call-audit.json \
  ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v1/validation.json

python3 tools/hero-model-library/source-workflows/jump-force-dai-decimation-v1/compare_visuals.py \
  --repo . \
  --source ../GGD-Asset-Library/converted/jump-force-steam-dai-v1/dai-chr0430-review-v4.glb \
  --candidate ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v1/run-a/dai-chr0430-review-v4.glb \
  --output-root ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v1/visual \
  --accept-human-review

python3 tools/hero-model-library/source-workflows/jump-force-dai-decimation-v1/integrate.py --check
python3 -m unittest tools/hero-model-library/source-workflows/jump-force-dai-decimation-v1/test_workflow.py
```

`compare_visuals.py` 需要本機 headless Chrome。Git 只保存程式、JSON 收據與 A/B 圖；原件、兩次重建、raw render 與依賴保留在本機素材庫。S3 轉換階段備份另列狀態，不能用既有 review-v4 備份冒充本候選已備份。

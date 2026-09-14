# JUMP FORCE 達伊 `chr0430` UV／眼部修正版 v2

這個工作流從固定的 JUMP FORCE 原始 GLB 建立兩次獨立輸出。原件不修改；Blender 依材質拆開 primitive，使用 UV seam 限制做 Collapse 減面，保留臉與眼球較高配額，再把缺失 Unreal opacity 的 `lens`／`eyeshadow` 覆蓋層改成透明 RGBA。最後用既有貼圖工具將全部貼圖限制在 256px。

## 固定結果

- 原件：59,768 triangles，24 張貼圖，最大 2048px，1 skin／159 joints，0 animations。
- v2：7,930 triangles，24 張貼圖，最大 256px，20 個 skinned draw primitives，1 skin／159 joints，0 animations。
- run-a／run-b 位元組相同：SHA-256 `2b3030a97ff3add18e8addbc5d0ab39153e66d2da45a0d5ccf1dc10ff0fc55ba`。
- Khronos：0 errors；所有 float accessor 為有限值；joint 名稱、階層及材質／貼圖槽 multiset 保留。
- 現行採用規則：超過 10,000 面才觸發減面，正式候選須不超過 8,000 面；v2 通過這兩項及 256px 貼圖限制。
- 執行期仍被 20 draw primitives（上限 6）阻擋，且沒有六態動作，因此尚不可在後台切換，也未部署。

owner 於 2026-09-15 授權所有資源可登記／上架；這項授權不會放寬技術閘。v2 新畫面的視覺品質核准仍獨立標為待審。

v1 的人工 `accepted` 判斷已由 `priority-evidence/jump-force-dai-decimation-v1/owner-review.json` 明確推翻：臉部貼圖與眼睛不正常，v1 不可再作為有效視覺驗收證據。

## 重建

輸出目錄必須不存在；工作流拒絕覆蓋舊轉換階段。

```bash
python3 tools/hero-model-library/source-workflows/jump-force-dai-decimation-v2/build_candidate.py \
  --repo . \
  --asset-root ../GGD-Asset-Library \
  --write
```

建置使用 Blender 5.2.1 LTS、`replace-textures-by-name.mjs` 與既有 `tools/model-budget/optimize.ts`。`conversion.json` 保存完整命令、參數、工具 Git 路徑／SHA，以及 run-a／run-b 的絕對路徑與 SHA。

## 驗證

```bash
python3 tools/hero-model-library/source-workflows/jump-force-dai-decimation-v1/draw_call_audit.py \
  ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v2/run-a/dai-chr0430-review-v4.glb \
  --repo . \
  --output ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v2/draw-call-audit.json

python3 tools/hero-model-library/source-workflows/jump-force-dai-decimation-v2/validate_candidate.py \
  ../GGD-Asset-Library/converted/jump-force-steam-dai-v1/dai-chr0430-review-v4.glb \
  ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v2/run-a/dai-chr0430-review-v4.glb \
  ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v2/run-b/dai-chr0430-review-v4.glb \
  ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v2/conversion.json \
  ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v2/draw-call-audit.json \
  ../GGD-Asset-Library/conversions/jump-force-dai-decimation-v2/validation.json \
  --repo .

python3 -m unittest tools/hero-model-library/source-workflows/jump-force-dai-decimation-v2/test_workflow.py
```

Git 保存工作流、JSON 收據及固定畫面；原始 GLB、兩次建置、中間 GLB、完整 log 與 renderer bundle 保留在本機素材庫。這批尚未建立 S3 v2 讀回收據，不能沿用 v1 的 S3 收據宣稱 v2 已備份。

# 搗蛋貓 Cattiva：OP.GG 材質綁定版

成品是 `result/body.glb`，包含 5 張內嵌 PNG、3 個材質／網格部件、43 根骨架及來源全部 33 段動作。這是新的轉換版本；既有 OP.GG 原件、AtlasForge 版本及中央內容均未修改，未操作 Git／S3。

來源為 [OP.GG 搗蛋貓頁](https://op.gg/palworld/pals/cattiva) 對應 PinkCat 的公開 viewer export。不是本批直接取得的原始 Unreal 動畫包。`result/evidence/materials.source.json` 及 `opgg-viewer.source.js` 是原件的逐字副本，沒有執行來源程式。

| Primitive | 原材質名 | 使用圖片 |
|---|---|---|
| 0 | MI_PinkCat_Mouth | Mouth base color |
| 1 | MI_PinkCat_Eye | Eye base color |
| 2 | MI_PinkCat_Body | Body base color、Body Normal、Body MetallicRoughness |

5 張 WebP 解碼後另存 PNG，RGBA 像素逐字比對相同。所有來源骨架、場景、節點、動作 JSON、動畫 time/value 資料及原 BIN 前綴均保留。唯一幾何儲存轉譯是把 normalized Int16 法線另存 Float32，誤差小於 3e-8，以移除 GGD 不支援的 KHR_mesh_quantization 需求。

材質由 manifest 名稱精確配對。Body MASK cutoff=0.3333、法線方向、金屬 B／粗糙度 G、Repeat UV 依来源 viewer；眼／嘴沿用 BLEND 與雙面。Body MROS alpha 全像素 255，所以 specular mask 可精確化為常數 1。依 [KHR_materials_specular 的 reflectance 轉譯](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_specular#materials-with-reflectance-parameter)，使用 specularFactor=1、specularColorFactor=2×來源 scalar，保留 F0=0.008 與 F90=1。

驗證入口在 `result/validation/`：Khronos **0 errors、2 warnings**；既有 GGD `inspectModelUpload` 通過；GGD 同版 Babylon 7.54.3 對 33 段動作每段抽查三個時間點，均有實際 skinned vertex 位移。`render-v2/` 有全部動作兩時點共 66 張真實 WebGL 圖，`contact-sheets/` 有 3 張總覽；全圖總覽和 Idle 900px 圖已目視檢查眼／嘴／身體的綁定、明顯破面及缺材質。

仍有界限：

- Khronos 警告：原來源缺 tangent，使用引擎產生的切線空間；另保留原有 non-root skinned mesh 階層。三個舊法線 accessor 刻意保留，顯示為 unused info。
- 核心 GLB 無法同时表示來源眼／嘴的 BLEND、額外 alphaTest=0.01 和 polygonOffset=-4；本版保留 BLEND，但不虛構額外深度偏移。不同角度／引擎仍需驗收。
- 原 UE clear-coat／Burley 參數保留在 evidence；來源 viewer 並未做原生 clear-coat，Cattiva 的 SSS 分支也沒有 subsurfaceTexture 可啟用。colorCorrection metadata 未在來源 viewer 使用，因此本版不重染貼圖。
- 來源互動式眼睛表情 UV 偏移未編入 skeletal clips；睡眠等動作不因此宣稱已整合閉眼表情。
- 沒有 Death clip；沒有新增程序動作，也沒有任意指定 GGD 六態。後台登記、戰鬥狀態綁定、碰撞／接地及遊戲內驗收皆待主工作流執行。這份 GLB 也不包含聲音。

可重跑（從 ABxVFX_EDIT 目錄；每次使用尚不存在的新輸出目錄）：

```sh
/private/tmp/ggd-public-model-venv/bin/python -P \
  GGD-Asset-Library/conversions/palworld-cattiva-opgg-materials-20260911-v1/tools/convert.py \
  --source GGD-Asset-Library/intake/public-models-20260911/parallel-palworld-cattiva-opgg \
  --viewer GGD-Asset-Library/intake/public-models-20260911/parallel-palworld-astralym/evidence/opgg-3d-viewer.js \
  --out /private/tmp/cattiva-materials-replay
```

從 `GGD-hero-model-options` 目錄使用既有依賴做驗證：

```sh
node --import tsx \
  ../GGD-Asset-Library/conversions/palworld-cattiva-opgg-materials-20260911-v1/tools/validate.mjs \
  . /private/tmp/cattiva-materials-replay
```

`tools/render_server.py --repo <repo> --result <result> --output <新目錄>` 可重跑獨立 Chrome loopback 渲染；`tools/contact_sheets.py <render目錄> <新目錄>` 建立總覽圖。解析工具只讀來源；不下載、不更動中央索引。

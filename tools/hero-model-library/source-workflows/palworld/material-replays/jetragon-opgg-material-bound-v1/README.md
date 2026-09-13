# 空渦龍 Jetragon：OP.GG 材質綁定交付

本目錄是獨立、可重跑的材質轉換。原始已備份 intake 完全不改；不修改中央索引、content、預設或 Git；後續明確授權將此新目錄完整備份至 S3 legacy，驗證狀態記在外部備份收據。

## 檔案與用途

- `models/jetragon-materials-native-res.glb`：原貼圖解析度、自含材質、75骨／29個來源動作名称。11,266,728 bytes。可直接載入預覽；2048貼圖不符合GGD的256上限。
- `models/jetragon-materials-256.glb`：所有貼圖最大256，4,297,580 bytes。GGD inspect與模型預算均通過；保持全部29名稱／28種不同動作內容。
- `candidate-additions.json`：交根工作流整合的2個候選，均非自動預設、非已完成英雄上架。
- `inputs/`：本次使用的GLB／外置materials.json／全部8個原WebP之完整副本。
- `textures/source-png/`：8張原WebP解碼後的PNG；RGBA像素完全相同。
- `textures/native-res/`與`textures/256/`：實際嵌入的PNG；另保留從MROS alpha產生的高光RGB圖。
- `evidence/material-mapping.json`：3個材質、primitive及貼圖精確對應、shader依據、逐圖SHA。
- `evidence/preservation.json`：骨架／場景／網格／全部原生動作及4,712個動畫accessor與BIN資料不變。
- `evidence/ggd-inspect.json`、`evidence/khronos-*.json`：實際專案解析器與Khronos收據。
- `webgl-256-v1/`：Babylon 7.54.3實際WebGL，全29動作首幀／60%共60張PNG，另1.2秒Idle實播。
- `webgl-native-res-v1/`：原解析度Idle 4張PNG及實播。
- `evidence/contact-256.jpg`與`contact-native-vs-256.jpg`：已人工目視的部分姿勢與正側背／解析度比較；未宣稱逐一人工核完60張。

## 材質映射與限制

GLB材質名稱和公開metadata逐一完全相同：`MI_JetDragon_Body`、`MI_JetDragon_Eye`、`MI_JetDragon_Extra`；分別8204、200、64三角形。所有8個原WebP均保存；7張以標準glTF欄位綁定，SSS第8張嵌入GLB並在`extras.sourceSubsurfaceBinding.textureIndex`精確指向。

公開viewer程式確認：normalScale(1,1)、不翻轉Y、Repeat；身體masked cutoff=.3333，眼睛與晶體為透明。MROS alpha為來源高光通道，全部4,194,304像素alpha=255。採KHR_materials_specular的specularFactor=1、specularColorFactor=[.2,.2,.2]，保留F0=.008與未縮減F90；保留一張alpha→線性灰→sRGB的衍生RGB圖（此檔因mask恒1而為白色，可日後另外優化，未暗刪任何來源）。晶體發光強度20保留於KHR_materials_emissive_strength。

SSS是網站的自訂、依視角變化之indirectDiffuse shader，不是glTF標準AO或transmission。普通Babylon/GGD目前不會執行這個extras；不假裝已重現散射。原始subsurface map、profile、mean-free-path等參數完整保留。網站自己的MeshStandardMaterial也未套用metadata的Unreal clearcoat與colorCorrection，因此此版同樣不憑猜測新增那些效果。網站polygonOffset、depthWrite、alpha-to-coverage没有glTF核心對等欄位，記錄原設定但未改GGD renderer。

僅將3個normalized SHORT法線accessor轉成語意等值的FLOAT，消除原本不在GGD白名單內的KHR_mesh_quantization需求。沒有重取樣、重綁、補鍵或程序化動畫；原29個名稱保留，Carrying／Carrying_Start仍為同內容。

Khronos兩版均0 errors、3 warnings（2個runtime tangent generation＋1個原有skinned mesh非root）；3個原法線bufferView留存與SSS未標準引用列為infos，不隱藏。256版GGD inspect及預算0 errors／0 warnings，75骨與所有29動作通道均可載入。

**這不是完成六態接線的GGD英雄。** 原包沒有可確認的Death片段，尚無合法完整clipMap；專案`prepareUploadedHeroModel`會只保留六個選定用途，`verifyUploadedHeroModel`不允許其餘未引用片段。此任務要求保留29，所以未偽造死亡／未刪原動作／未生成假的ready receipt或model.json。SSS與實際英雄行為／落地碰撞仍待整合。

## 重跑

於工作區根目錄，以既有可信環境執行，無新安裝；腳本遇到內容不同的既有输出會拒絕覆寫。

```sh
/private/tmp/ggd-public-model-venv/bin/python -P GGD-Asset-Library/intake/conversions-20260911/jetragon-opgg-material-bound-v1/tools/bind_materials.py
python3 GGD-Asset-Library/intake/conversions-20260911/jetragon-opgg-material-bound-v1/tools/verify_preservation.py
```

於`GGD-hero-model-options`執行專案實測；收據位置必須尚未存在，原有收據勿覆寫：

```sh
node --import tsx ../GGD-Asset-Library/intake/conversions-20260911/jetragon-opgg-material-bound-v1/tools/check_ggd.mts . ../GGD-Asset-Library/intake/conversions-20260911/jetragon-opgg-material-bound-v1
```

畫面重跑：設`GGD_REPO_ROOT`為原專案絕對路徑，執行`tools/render.py <GLB絕對路徑> <全新輸出目錄>`；`render-idle.py`只驗Idle。使用已備Chrome與專案Babylon，所有畫面留新目錄，不需要連正式站。Khronos重跑請使用`tools/check_khronos.mjs <GGD repo絕對路徑> <全新收據目錄>`。

來源：[OP.GG空渦龍](https://op.gg/zh-tw/palworld/pals/jetragon)。材質網站程式證據：`evidence/viewer-scripts/3wek8qob4owgm.js`，SHA `b5af5cb6636397d9a9dd01d3c60c5cbf4f53af6b955848e5bda09471ae82b4dc`。來源原檔授權資訊沿用原intake，未新增公共授權主張。

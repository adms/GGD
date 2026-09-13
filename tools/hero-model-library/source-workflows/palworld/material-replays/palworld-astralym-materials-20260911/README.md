# 枯星龍 Astralym 材質轉換交付

本目錄與已封存來源 intake 分開。`delivery.json` 是交付入口，`model-candidates.json` 保留三種候選，`motion-library.json` 列出全部58個原生動畫條目：57變動、1固定姿勢。無英雄ID、沒有生成六狀態對照，未註冊後台。

候選：
- `astralym-material-bound.glb`：完整58段、原解析度9圖；Khronos零錯誤，Babylon全部58段×3時間點通過。JSON 4,753,652 bytes 超過 GGD 4MiB 匯入上限，保留完整動作來源用途。
- `idle-walk/astralym-idle-walk.glb`：只引用原生Idle/Walk並精簡JSON，其他動作仍在完整庫。法線改成等值FLOAT，無位置、骨架、動畫key改動。通過GGD格式檢查，原圖2048超過256预算。
- `idle-walk-256/astralym-idle-walk-256.glb`：使用既有GGD normalizeUploadedModel及ffmpeg縮圖到256；通過實際inspectModelUpload、heroModelBudgetIssues與Khronos。145 joints、435 channels/clip，低於500通道上限；23928面低於28000，但超過16000警戒。3 primitives低於6。沒有把通過檢查宣稱為完整英雄後台成品。

材質以原GLB材料名精確匹配materials.json，不猜其他部件。Body/Extra/Eye三種baseColor、三種emissive、法線、金屬粗糙及specular alpha都有可查來源映射。第9張SSS貼圖嵌入且於extras記錄引用，來源subsurfaceColor=[0,0,0]，不虛構非零散射。GLTF無法完整表達來源Eye的微小alphaTest和深度偏移；來源只給clearcoat模型標籤，未猜coat強度。高解析度PNG與原WebP解碼像素完全一致；256版是明確獨立縮圖衍生，完整圖保留。

驗證證據：`validation/`保存完整Khronos與Babylon截圖/骨骼矩陣取樣；`idle-walk-256/receipt.json`驗證876個accessor所有取樣bytes與縮圖前一致。Khronos剩餘兩警告：來源skinned mesh非root與未提供tangent；沒有隱藏或刪骨。早期Babylon報告的materials.ready是錯用無mesh參數的診斷（可為false），不是畫面載入失敗；`validation/babylon-idle-walk-256-final`改用實際mesh呼叫，舊證據保留。

重跑需已有來源檔案、Python+Pillow、Node、repo的node_modules（tsx、gltf-validator、Babylon7.54.3、esbuild0.28.1）、ffmpeg、Chrome。乾淨clone不自帶原始素材/本機環境。只能指定**新的輸出目錄**；程式多數用排他寫入保護交付。

執行順序（SRC=已封存Astralym intake，OUT=新的轉換目录，REPO=GGD checkout）：
1. `python tools/bind_materials.py SRC OUT`
2. `node --import REPO/node_modules/tsx/dist/loader.mjs tools/validate.mts REPO OUT`
3. `python tools/make_idle_walk.py OUT`
4. `node --import REPO/node_modules/tsx/dist/loader.mjs tools/validate_subset.mts REPO OUT`
5. `node --import REPO/node_modules/tsx/dist/loader.mjs tools/normalize_subset.mts REPO OUT`
6. `node tools/bundle-render.mjs REPO OUT`，接 `python tools/render_server.py OUT`；子集用 `--model idle-walk/astralym-idle-walk.glb --run-directory validation/babylon-idle-walk`；256版用相應路径與新的render目录。
7. `python tools/finalize_delivery.py SRC OUT --repo REPO`（需三類render證據到齊；此交付另保留末次material-context修正的final render目录）。

本次只寫此轉換目錄，未改中央、content、Git、S3或已備份來源。共享程式SHA見shared-toolchain.json。

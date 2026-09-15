# OU99 2026-09-10 轉換與驗收程式歸檔

這裡保存當次執行程式及其維護用重跑副本。除下方記錄的兩份 lint 修正外，檔名與內容維持原樣。模型、原生 ZIP、圖片、解析 JSON、輸入清單與大型驗收資料不包含在此工具目錄。程式內有當次工作區、日期與 `/private/tmp` 的固定路徑；它們是可追溯的執行來源，不是乾淨 clone 即可執行的獨立套件，也不會代為下載缺少的素材。

## 本次補齊的程式

| 程式 | 用途、必要輸入 | 輸出 |
| --- | --- | --- |
| `ggd-ou99-atlas-alpha-v3.py` | 讀 v2 `manifest.json` 與 458777／473324／491448 的 runtime、original；把 OPAQUE atlas 空白 alpha 修為255，保留原圖、RGB、幾何、UV、骨架與動作 | 新 v3 root 的 `converted/body.glb`、原件副本、alpha 修復收據與 conversion manifest |
| `ggd-ou99-verify-v3.mts` | v3 conversion manifest、目前 repo 的 champion/model/來源選項；呼叫 shared inspect/prepare/verify、Khronos、實際 ModelVersions.prepare | v3 `runtime/`、隔離 backend 內容副本與 prepare 收據；不呼叫 writeArtifacts |
| `ggd-ou99-audit-v3.py` | v3 runtime、完整原件、v2 control、目前 repo 未修改的 backdrop checker | 原生 sample／骨架／幾何一致性證明；舊 v2 失敗與新 v3 通過的 backdrop 收據 |
| `ggd-ou99-atlas-alpha-v3-visual.mjs` | 瀏覽器由配套 server 提供 v2／v3 GLB、clipMap | Babylon WebGL 前後 idle/run 截圖與 render proof |
| `ggd-ou99-atlas-alpha-v3-visual-server.py` | v3 backend manifest、控制版／候選 GLB、預先打包的同名 `-bundle.js` | v3 `visual-audit/` 的12張截圖與原始 render proof |
| `ggd-ou99-v3-visual-summary.py` | 上述12张截圖 | 三張對照圖、六組 RGBA 像素差統計 |
| `ggd-freeze-ou99-v3.py` | v3 驗證、render、來源資料齊全，且最終 manifest 尚未建立 | 最終3列 `manifest.json`、handoff、逐檔 SHA、padding-only 證據與 `/private/tmp/ggd-ou99-standards-v3-final-report.json` |
| `ggd-ou99-priority10-visual.mjs`、`ggd-ou99-priority10-visual-server.py` | 10角色 GLB 與 `/private/tmp/ggd-ou99-priority10-visual-input.json`，server 需同名 bundle | 初次側面 idle/run 的20張 WebGL 截圖與 render proof |
| `ggd-ou99-priority10-front.mjs`、`ggd-ou99-priority10-front-server.py` | 同一份10角色 GLB／clipMap 輸入，server 需同名 bundle | 正面 idle、斜前 run 的20張 WebGL 截圖與 render proof |
| `ggd-ou99-atlas-lod-review.mjs`、`ggd-ou99-atlas-lod-review-server.py` | v2 最終 manifest 中三個 atlas 與兩個 LOD，完整來源及候選 GLB，server 需同名 bundle | 五模型原／成品 idle/run，共20張截圖與 render proof |
| `ggd-freeze-priority10-visual.py` | 以上三組已完成渲染、input manifest、原始截圖與已人工檢視的對照圖 | 視覺報告、三個輸出 root 的 file manifest、`/private/tmp/ggd-priority10-visual-final-report.json` |
| `ggd-final-priority-integrity.mts` | 目前 repo 的81角色 registration、首次 registration、workflow/runtime options、15優先角色清單、11加工政策與目前 Git HEAD | 逐 frozen version SHA、15優先選用來源、15既有手動預設及11加工預設的唯讀稽核：`/private/tmp/ggd-final-priority-integrity.json` |

`ggd-freeze-priority10-visual.py` 內的中文外觀判斷是當次已檢視截圖的記錄，程式沒有自動判斷臉部、身份或美術品質。換輸入後必須重新看圖，不能沿用這些結論。初次優先10及 atlas/LOD 的拼圖來自當次臨時排版步驟；原始 `.mjs` 可重建逐張截圖，這裡沒有聲稱補回未存成程式檔的拼圖步驟。v3 拼圖與像素比較程式已完整歸檔。

## 既有工具

`ggd-ou99-standardize-v2.py`、`ggd-ou99-verify-v2.mts`、`ggd-ou99-verify-budget-v3.mts` 建立前一批22件標準化候選。`ggd-ou99-native-preserving-lod.py` 只對幾何及權重做 LOD，再接回原始骨架／動作；`ggd-ou99-native-motion-check.mjs` 與 `ggd-ou99-native-motion-budget-v3.mjs` 核对 CPU skin 取樣；`ggd-freeze-ou99-v2.py` 封存前批。它們仍為原樣，這次未覆寫。

`ggd-glb-io-helper.py` 是當次共用 GLB 讀寫／accessor helper 的原樣副本，SHA-256 `700d6a150f95f137404722771093024ea1bc3aa51d1d07404621eab6a295b180`。它雖含程序化動作函式，OU99 v2/v3 程式只使用 GLB 讀寫與 accessor 函式；本批原生動作沒有改成程序化動作。

## 必要本機輸入與依賴

- 歷史 workspace 根目錄為 `/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT`，repo 為其中 `GGD-hero-model-options`。v1/v2/v3、優先10正面／側面、atlas/LOD 的輸入輸出都在該 workspace `outputs/priority-ou99-*/`；資料須由既有本機檔案或具權限的備份恢复，Git 工具歸檔不等於素材已下載。
- v3 是對完整 v2 的衍生修復，必須保留 v2 `manifest.json`、各 `original/`、runtime 和 control。優先10輸入的備份在 `outputs/priority-ou99-priority10-front-audit-20260910/input-manifest.json`，不能只依模型名稱重組為其他版本。
- Python 當次使用 `/private/tmp/ggd-public-model-venv/bin/python -P`，需要 NumPy、Pillow。`-P` 避免 `/private/tmp/inspect.py` 等檔案遮蔽標準函式庫。多支程式仍把 helper import 固定為 `/private/tmp/ggd-procedural-six-state.py`；執行前需讓該路徑存在且內容對應上述已歸檔 helper。
- 只有既有 native-preserving LOD 需要 Blender Python；當次為 `/private/tmp/ggd-kof-bpy-arm-venv/bin/python -P`、bpy5.2.1 LTS，使用隔離 `BLENDER_USER_*`。atlas alpha 修復與唯讀稽核不需要 Blender，也不執行下載的遊戲／MOD 程式。
- Node 程式依賴該 repo 已安裝的 `tsx`、shared/content-api 原始碼、`gltf-validator@2.0.0-dev.3.10`、Babylon7.54.3；WebGL `.mjs` 需用 repo 的 `esbuild@0.28.1` 打包，解析路徑包括 `apps/client/node_modules`。版本與目前 `content/config/model-lod.json` 會影響後台驗證，不能拿歷史成功收據取代新版本驗證。
- WebGL server 使用 macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，透過 `/usr/bin/arch -arm64` 啟動、獨立臨時 profile、SwiftShader、localhost HTTP；需要允許本機連線與瀏覽器程序。它不使用個人瀏覽器 profile。server 預期 `/private/tmp/<同名渲染程式>-bundle.js` 已存在；生成 bundle 屬暫存編譯產物，本目錄只保留原始碼。

執行入口通常是 `python -P <程式.py>`、`node --import tsx <程式.mts>` 或 `node <程式.mjs>`；瀏覽器 `.mjs` 必須經 server 與 bundle 執行，不能直接當 Node 腳本。Python／TypeScript 程式的工作目錄、固定路徑及 self-copy `/private/tmp` 檔案也必須先核對。若要重跑，使用新的輸出 root、暫存 profile、報告檔名與重新核驗的輸入；多數腳本採 `mkdir(exist_ok=False)`／`flag:wx`，不允許覆寫已凍結證據。請在新的工作副本調整路徑，不改這批原始程式或舊收據來配合新結果。

## 重跑副本的 lint 修正

`ggd-ou99-priority10-front.mjs` 與 `ggd-ou99-priority10-visual.mjs` 各移除一個恆真的 `if(true)`，保留原本必定執行的區塊、變數作用域、逐姿勢包圍盒與鏡頭計算。這兩份 Git 工作副本的 SHA 因此不同於 2026-09-10 已封存原件；`replay-patches.json` 記錄原件絕對路徑、原件與重跑副本的 SHA／大小及精確修改。歷史 `outputs/` 原件、file-manifest、截圖與收據全部保留，不更新成重跑副本的 SHA。

重跑這兩份渲染程式時，先將本目錄的維護副本放入對應 `/private/tmp/<檔名>`，再從同一份程式建立 bundle；配套 server 的 self-copy 才會把本次實際使用的版本歸檔到新的輸出資料夾。既有凍結輸出不因 lint 修正重新宣稱經過渲染驗收。

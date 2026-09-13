# JUMP FORCE Steam：達伊 `chr0430`

這個工作流把使用者自有 Steam 安裝中的六個加密 PAK 建成可查詢索引，並從中擷取達伊的原生角色套件。原始 PAK 透過唯讀 SMB 讀取；程式不保存或輸出 AES 金鑰。

## 狀態界線

- PAK 索引：完成，保留 256,619 筆容器關係與 221,877 條唯一路徑。
- 達伊原生套件：已擷取 1,942 個目前版本檔案至本機素材庫。
- 模型：UModel 已匯出 11 組含 159 關節皮膚的 glTF 元件；六個角色分區已組成完整身體並通過三視角 WebGL 檢查，但仍未完成正式 GGD intake。
- 貼圖：修正版 UModel 已匯出 36 張 PNG；來源貼圖與原生混合模式提示已綁定並通過一般 PBR 視覺檢查，原遊戲 parent shader parity 與效能驗收仍未完成。
- 特效、音訊及角色／技能設定：原生套件已擷取；仍待解析、解碼與事件綁定。
- 動作：目前沒有可驗收的原生動作剪輯，不宣稱已完成。
- 後台選項與部署：未註冊、不可切換、未部署。

## 重建索引

只從既有原始清單重建，不需要 AES 金鑰：

```bash
python3 tools/hero-model-library/index_encrypted_unreal_paks.py \
  --container-manifest ../GGD-Asset-Library/intake/windows-readonly-20260913/jumpforce-kof-core-containers-v1/core-containers.sha256.json \
  --raw-list-dir ../GGD-Asset-Library/intake/windows-readonly-20260913/jump-force-pak-index-v1/raw-lists \
  --source-id steam-jump-force-priority-original-assets-build-8523149 \
  --character-map chr0420:Asta \
  --character-map chr0230:Kenshiro \
  --character-map chr0430:Dai:godie-nbbc,godie-n01c \
  --key-sha256 4620c3dc26cccf0f11d0a4764ac135d31ed1077d8f9efd16cb2fde33936008fc \
  --summary-json materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json \
  --summary-md materials/hero-model-library/source-inventories/jump-force-steam-pak-index.md \
  --full-index ../GGD-Asset-Library/intake/windows-readonly-20260913/jump-force-pak-index-v1/full-path-index.jsonl.gz
```

需要重新讀取 PAK 目錄時，另加 `--refresh --repak /absolute/path/to/repak`，並把公開取得的遊戲 AES 金鑰只放在 `UNREAL_PAK_AES_KEY` 環境變數。程式只記錄解碼後金鑰的 SHA-256。

## 工具來源

- PAK 目錄與擷取：repak 0.1.8。
- Unreal 套件匯出：UE Viewer / UModel，JUMP FORCE 指定 UE 4.19。
- 貼圖匯出：素材庫內的 UModel `UTexture2D` exporter 修正版；修正是在啟動時註冊 `ExportTexture`，沒有改動來源資產。

AES 金鑰與 UE 4.19 判定來源：<https://www.gildor.org/smf/index.php?topic=6523.15>。

## 建立待驗收 GLB

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python tools/hero-model-library/source-workflows/jump-force-steam-dai-v1/convert_blender.py -- \
  --model-dir ../GGD-Asset-Library/extracted/jump-force-steam-original-chr0430-dai-v1/umodel-character-export-v2/Character/chr0430 \
  --texture-dir ../GGD-Asset-Library/extracted/jump-force-steam-original-chr0430-dai-v1/umodel-texture-export-fixed-v1/Character/chr0430/Textures \
  --output ../GGD-Asset-Library/converted/jump-force-steam-dai-v1/dai-chr0430-review.glb \
  --receipt ../GGD-Asset-Library/converted/jump-force-steam-dai-v1/conversion-receipt.json
python3 tools/hero-model-library/source-workflows/jump-force-steam-dai-v1/validate_glb.py \
  ../GGD-Asset-Library/converted/jump-force-steam-dai-v1/dai-chr0430-review.glb
```

這一步只建立待驗收組件。第一個 `form0 + form0_head + equipment1` 實驗版經 WebGL 發現缺少上身；第二版加入 `damage_AB` 後仍有褲管缺口，兩者均已拒收並保留證據。目前預設組合依原生分區加入 `damage_A + damage_B + damage_AB`，正背面完整。UModel glTF exporter 另會替材質槽填入紅、綠、藍診斷色；這些不是 MaterialInstanceConstant 的來源顏色。轉換器會在綁定來源貼圖時清除診斷色，依原生材質用途套用 MASK／BLEND，並把六個分區合併到同一套 159 關節骨架。修正版 `review-v4` 已通過結構與三視角一般 PBR 視覺檢查；原遊戲 parent shader parity、正式 GGD intake、效能、動作與後台註冊仍待完成。

## 角色／技能設定與既有音訊稽核

PAK 全路徑索引可證明 `Content/Game/` 中有 20 個套件 stem（40 個 `.uasset`/`.uexp` 檔），包含角色 action／anim／flow 與四組 skill anim／frmd。這 40 檔目前全部只是已索引，並未在凍結擷取集中；不能寫成已擷取角色／技能設定。

現有 `parallel-ps-jumpforce-audio:JForce_Dai` 是先前取得的獨立公開音訊來源，不是這次 Steam PAK 新解碼的音訊。稽核會對 261 個 OGG 重算 SHA-256／大小／時長，並交叉比對中央 `voice-files.jsonl.gz`；`ActVoice` 與 `ActSE` 只保留為來源目錄分類，不代表語言、說話者或台詞已經聽審。

```bash
python3 tools/hero-model-library/source-workflows/jump-force-steam-dai-v1/audit_existing_scope.py \
  --workspace . \
  --local-extraction-root ../GGD-Asset-Library/extracted/jump-force-steam-original-chr0430-dai-v1 \
  --full-pak-index ../GGD-Asset-Library/intake/windows-readonly-20260913/jump-force-pak-index-v1/full-path-index.jsonl.gz \
  --output-dir materials/hero-model-library/source-inventories/jump-force-steam-dai-v1
```

產物為 `game-config-index.json`、`audio-summary.json` 與 `audio-file-index.jsonl.gz`。可重現檢查用同一命令加 `--check`。

這台主機的 Blender 5.2.1 目前會在 Metal 後端偵測時、尚未執行 Python 前崩潰。可先用不依賴 Blender 的等價 GLB 組裝器：

```bash
python3 tools/hero-model-library/source-workflows/jump-force-steam-dai-v1/compose_glb.py \
  --model-dir ../GGD-Asset-Library/extracted/jump-force-steam-original-chr0430-dai-v1/umodel-character-export-v2/Character/chr0430 \
  --texture-dir ../GGD-Asset-Library/extracted/jump-force-steam-original-chr0430-dai-v1/umodel-texture-export-fixed-v1/Character/chr0430/Textures \
  --output ../GGD-Asset-Library/converted/jump-force-steam-dai-v1/dai-chr0430-review.glb \
  --receipt ../GGD-Asset-Library/converted/jump-force-steam-dai-v1/conversion-receipt.json
```

`render_review.py` 會以隔離的本機 HTTP 服務與 headless Chrome 載入 GLB，保存正面、背面、等角圖與實際骨架／材質證據。它要求傳入已由同版 `render_static_glb.mjs` 建出的本機 bundle；bundle 是可重建依賴，不作來源資產或成品。

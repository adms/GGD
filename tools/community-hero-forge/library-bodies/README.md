# 本機素材庫模型接入

先由工作區 `ASSET_LIBRARIES.md` 指向的 `query.py` 查詢，保存完整回傳。確認 `exists_local`、`readiness`、角色 ID 與關聯依據，再讀取絕對路徑。角色名稱相同只能作為候選；替代角色另外記錄實際來源，遊戲內名稱仍依設計稿。

目前提供 MBA 1.60 的單本體 GLB 準備工具。它保留原骨架、動作變換與時間，把不相容的 Assimp 材質轉成無光照貼圖、合併材質繪製並正規化原權重。輸出到新路徑，原素材不修改；不支援的布局明確拒絕。

以木之本櫻為例，在 repo 根目錄執行，路徑參數須指向本次 query.py 的回傳檔；每次使用新的輸出路徑：

```sh
python3 tools/community-hero-forge/prepare_mba_body.py \
  --query <mba-model-query.json> \
  --asset mba:ce884f239ba2fa1f0e05bceb \
  --out <new-preparation-directory>/atlas.glb

node --import tsx tools/community-hero-forge/finalize-library-body.mts \
  --receipt <new-preparation-directory>/atlas.receipt.json \
  --clips tools/community-hero-forge/library-bodies/mba-sakura.clips.json \
  --out <new-runtime-directory>

node tools/community-hero-forge/inspect-library-motion.mjs \
  <new-runtime-directory> <new-motion-proof.json>

python3 -m unittest discover -s tools/community-hero-forge -p 'test_prepare_mba_body.py' -v
```

第二步核對原始及衍生檔 SHA-256，保留六項用途引用的片段，證明裁剪未改變模型、骨架、材質與留下的動作，再走共用上傳驗證、預算與再匯入檢查。輸出 `body.glb`、`uploaded-model.json`、`model.json` 與 `receipt.json`；後續用這份模型綁定建立 HeroProject，仍須依當下服務重建投稿 ZIP。

第三步使用 Client 安裝的 Babylon，檢查真實骨架對頂點的變形。它跳過材質，不能代替畫面驗收。小櫻仍需確認六項用途、貼圖、朝向、尺寸及實際技能畫面；`D-Down` 暫映射為死亡倒地，未宣稱原作獨立死亡演出已驗收。

300 英雄原生模型使用獨立的 JUMPX 轉換器；不是把 OBJ 當成有骨架的模型，也不是通用 DirectX X 讀取器。需要 Python NumPy 與 Pillow，先分別查詢該角色的模型及貼圖，保存 query.py 回傳，再填入明確的網格、貼圖 ID、片段及播放速度選擇。以 Archer 的已驗證布局為例：

```sh
python3 tools/community-hero-forge/convert_jumpx_body.py \
  --model-query <300heroes-156-models.json> \
  --texture-query <300heroes-156-textures.json> \
  --selection tools/community-hero-forge/library-bodies/300-archer.selection.json \
  --out <new-preparation-directory>/body.glb

node --import tsx tools/community-hero-forge/finalize-library-body.mts \
  --receipt <new-preparation-directory>/body.receipt.json \
  --out <new-runtime-directory>

node tools/community-hero-forge/inspect-library-motion.mjs \
  <new-runtime-directory> <new-motion-proof.json>

python3 -m unittest discover -s tools/community-hero-forge -p 'test_convert_jumpx_body.py' -v
```

原生轉換保留加權骨骼及祖先，將全域姿勢轉為局部父子階層，輸出實際蒙皮模型。只支援已實作的浮點鍵與網格格式；壓縮旋轉鍵、帶剪切的局部矩陣及會影響其他本體的網格隱藏明確拒絕，不會靜默丟失。原生粒子、附加外觀及未選網格不納入本體。來源工具結構參考的授權保留於 `JumpXToolchain.LICENSE`，不代表遊戲素材採用該程式碼授權。

原生姿勢樣本另外與 Babylon 實際頂點變形比對。這只驗證轉換數學及播放資料，材質仍跳過。每個角色仍需畫面與六項用途驗收；Archer 的 hurt 暫共用 idle，保留此替代資訊。角色身分與替代用途由接入紀錄保存，不由檔名自動宣稱相同。

> 原始素材／半成品另備份於 `s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/`；僅限備份或人工明確許可使用，其他程序不得自動取用。

> 共享成品已改用 `s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/`；[下載方式](../../GGD-Asset-Library/SHARED_README.md)。本頁僅為本機原始候選存檔。

> 此頁已轉為原始候選存檔。正式資源請使用 [固定資源庫](../../GGD-Asset-Library/README.md)，本頁的 GLB／原生檔不代表已標準化入庫。

# GGD 素材庫統一查詢入口

本索引整理目前工作區內已建立的三批實體素材與一批設計交接資料。原檔保留原位；索引是快照，可由 build_registry.py 重建。不是下載清單，也不是 GGD 已發布素材清單。

| ID | 資料庫 | 已有內容 | 使用狀態 |
|---|---|---|---|
| 300heroes | 300 英雄 202609021 | 276 筆角色候選；32,012 原生模型、2,366 OBJ、36,924 角色動作、70,395 可播放音訊；58,922 個 VFX 路徑內資源 | OBJ 靜態預覽；骨架動作為原生格式；VFX 需重建 |
| mba | 魔法少女武鬥祭 Complete Form 1.60+ | 223 GLB（含角色／武器／場景／特效）、1,614 已轉換全模型動作，其中 1,552 角色主模型動作；423 特效設定、640 音訊 | 21 份定義皆有原生主模型、20 份成功轉 GLB；柯柯麗一形態轉換失敗；不含 1.70 |
| lol | 七位 LoL 角色 | 沃維克、卡爾瑟斯、拉克絲、犽宿、好運姐、李星、齊勒斯；完整 251 動作、精簡 42 動作，原始骨架／貼圖與各轉換階段 | GLB；已有局部本機 GGD 預覽證據；未取得原作獨立 VFX／音效 |
| community37 | 37 名社群英雄交接 | 37 HeroProject、222 技能槽、185 VFX 腳本及離線預覽包 | 設計與 GGD 代理素材，專屬造型／動作待製 |

數量有交集：VFX 目錄內也含模型和貼圖；完整與精簡 LoL 動作是版本關係，不能相加當作獨立原作動作。SQLite 的 indexed_records 包含原檔、衍生檔、內嵌動作及脚本定位，不是模型總數。

## 2026-09-08 新增：魔法少女武鬥祭 1.60+

**莉娜・因巴斯｜《秀逗魔導士》**（查詢 ID：`mba:Chara02`）

已補齊原生本體、骨架、貼圖與動作，並轉出 **GLB：31 個關節、78 段動作、6 張內嵌貼圖**。

| 資源 | 開啟 |
|---|---|
| 莉娜本體（含骨架與動畫） | [Lina.glb](../game-asset-library-20260907/magical-battle-arena/models/Model/Chara02/Lina.glb) |
| 武器模型 01 | [Wep_Lina_01.glb](../game-asset-library-20260907/magical-battle-arena/models/Model/Chara02/Wep_Lina_01.glb) |
| 武器模型 02 | [Wep_Lina_02.glb](../game-asset-library-20260907/magical-battle-arena/models/Model/Chara02/Wep_Lina_02.glb) |
| 武器模型 03 | [Wep_Lina_03.glb](../game-asset-library-20260907/magical-battle-arena/models/Model/Chara02/Wep_Lina_03.glb) |
| 動作名稱與模型資訊 | [Lina.json](../game-asset-library-20260907/magical-battle-arena/models/Model/Chara02/Lina.json) |
| 原生模型 | [Lina.x](../game-asset-library-20260907/magical-battle-arena/raw/Model/Chara02/Lina.x) |
| 武鬥祭全素材 | [資源清單](../game-asset-library-20260907/magical-battle-arena/ASSET_LIBRARY.md) |

來源：[社群分享頁](https://kazasou.wordpress.com/2011/05/19/doujin-game-magical-battle-arena/) · [1.60+ 追加包下載頁](https://www.mediafire.com/?h7sndh7dmf7y075)。

本次亦補齊娜卡、柯柯麗兩形態、金色魔王與吉他吉他老伯的原生主模型。全庫現有 **224 原生模型、223 GLB、423 特效設定及 640 段音訊**。柯柯麗一般形態的 GLB 轉換失敗，原檔保留；莉娜已通過 GLB 結構檢查，尚未逐動作驗收 GGD 畫面。版本為 1.60+，不含 1.70。

## 給其他工作流

- [一鍵複製交接文字](COPY_TO_WORKFLOW.txt)：開啟後全選複製；本次對話也提供帶複製按鈕的文字區塊。
- [catalog.json](catalog.json)：資料庫 ID、版本、絕對根路徑、原始入口、索引指紋與統計。
- [characters.json](characters.json)：角色 ID、原始名稱／別名、動漫或作品出處、主模型與可用狀態。
- [community-crosswalk.json](community-crosswalk.json)：37 名社群英雄與素材角色的名稱候選對照。
- [issues.json](issues.json)：缺件、原生格式限制及對應不足。
- [validation.json](validation.json)：本次檔案存在性和索引完整性檢查。
- [catalog.sqlite](catalog.sqlite)：可直接唯讀查詢，或使用下列 Python 工具。

## 查詢

以下命令可從任意目錄執行，無額外套件；引號須保留。

```sh
python3 '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/asset-library-registry-20260907/query.py' --mode libraries
python3 '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/asset-library-registry-20260907/query.py' '火影忍者'
python3 '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/asset-library-registry-20260907/query.py' '奈葉'
python3 '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/asset-library-registry-20260907/query.py' --mode assets --character 'mba:Chara01' --kind model --format glb --available
python3 '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/asset-library-registry-20260907/query.py' --mode assets --character '300heroes:13' --kind animation --limit 5
python3 '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/asset-library-registry-20260907/query.py' --mode assets --character 'lol:lux' --kind animation --stage full
python3 '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/asset-library-registry-20260907/query.py' --mode assets --character 'lol:lux' --kind model --stage runtime_candidate
python3 '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/asset-library-registry-20260907/query.py' --mode assets --library mba --kind vfx 'nanoha'
python3 '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/asset-library-registry-20260907/query.py' --mode crosswalk '武藤遊戲'
```

一般查詢預設搜角色名／已收录別名／作品，大小寫與 Unicode 寬度正規化，沒有自動翻譯全部簡繁字或猜測別名。找不到時改用原名、作品或 ID。`--mode assets` 的自由文字搜尋的是檔案路徑與動作名；需先查角色 ID 再傳 `--character`。`--limit` 預設 20，最大 1000；`--offset` 分頁，輸出包含總數。

角色關聯有明確界線：300 官方主模型為 `official_base_model`，數字前綴變體／語音為 `numeric_prefix_candidate`；MBA 為 `character_definition`；LoL 為 `source_manifest`。名稱對照是 `name_match_candidate_not_identity_proof`，不自動合併 ID。角色 VFX／音訊尚未建立完整語意關聯，查無結果時改用全库 `--library ... --kind vfx/audio` 的路徑搜尋。

回傳 `path` 是本機絕對路徑，`exists_local` 表示這次建索引時有檔案，`readiness` 說明格式用途；動畫 `locator` 是模型中的 clip 位置，社群 VFX `locator` 是配方 JSON Pointer，不是獨立檔案。轉交別台機器須同步來源資料夾並重建索引，僅複製 registry 不包含模型本體。

## 缺件與驗證範圍

2026-09-08 已取得 1.60+ 追加包，補齊原本六份缺失的角色主模型。莉娜 GLB 含 31 關節、78 動作與 6 張內嵌貼圖，三個武器 GLB 另列；21 份角色定義皆有原生主模型，20 份成功轉 GLB。柯柯麗一般形態因 Assimp 崩潰而標記 `native_model_conversion_failed`，保留原生模型；另一形態已成功轉換。尚未取得 1.70。

300 尚有 4 段音訊未解碼、4 個 OBJ 轉換問題與 3,236 個未解決材質引用；原生檔仍保留。LoL 各角色僅有待機與一次 Q 施法時點的局部畫面證據，完整動作與遊戲效能驗收尚未完成。37 名交接包為離線版本，須按活動服務 target 重建後才能投稿。

本次檢查所有索引路徑與資料庫關聯，不重新宣稱逐模型視覺檢查、骨架重綁、VFX 重建或 GGD 匯入已完成。來源資訊沿用各批既有索引，沒有再花時間全面校訂動漫出處。

## 維護

來源批次更新後先重建其原始索引，再執行：

```sh
python3 '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/asset-library-registry-20260907/build_registry.py'
```

工具只建立本資料夾的索引，不修改來源模型、遊戲、GGD 內容或投稿狀態。來源索引 SHA-256 記錄在 catalog.json，供工作流判斷快照是否過期。

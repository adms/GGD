# 300英雄與魔法少女武鬥祭 MBA 未使用素材中央索引

固定快照：`20260908T075704221576Z`。本頁由 `build_index.py` 產生；數字來自受驗證備份清單、本機實檔 stat、資產 registry 與中央角色設計索引。

## 範圍與證據

- 已建索 `73,852` 個不同實體檔，共 `17,034,245,346` bytes；其中 `73,791` 個精確檔尚未被目前 runtime 成品引用。
- 以 SHA-256 去重後為 `68,669` 個位元組對象；`3,651` 組有重複路徑，共包含 `5,183` 個額外路徑列。每列來源、版本、角色關係與 S3 member 仍保留。
- 動作邏輯紀錄 `51,473` 筆；300 原生 VFX 紀錄 `58,922` 筆。
- 角色目錄定義 `297` 筆；中央待設計索引 `291` 筆，另 `6` 筆因缺角色本體或實為技能道具而不杜撰 GGD 英雄 ID。重新 SHA-256 核對 `311` 個已存在的來源宣告 body。
- 備份快照已讀回驗證；逐檔 SHA 來自 `20260908T075704221576Z` 清單，本批另對每個索引檔做存在與 bytes 核對。

## 處理階段

| 已取得 | 已解包 | 已轉換候選 | 已通過 GGD 最終驗收 | 原始檔已註冊 | 原始檔可切換 | 已部署 | 已被 runtime 衍生選項引用 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 73,852 | 73,852 | 223 | 0 | 0 | 0 | 0 | 61 |

`runtime 衍生選項引用` 表示這個來源 asset ID 已被 Git 成品使用；原始檔本身仍不是後台可切換選項。

## 來源與使用狀態

| 來源 | 版本 | 已直接使用實體檔 | 未使用已對應角色 | 未使用未對應角色 | 未連結儲備 |
|---|---:|---:|---:|---:|---:|
| 300英雄官方用戶端 | v202609021 | 59 | 1,594 | 5,405 | 65,924 |
| Magical Battle Arena Complete Form | Complete Form 1.60+ | 2 | 16 | 23 | 829 |

## 目前缺口

- 來源定義宣告但本機不存在的 body 路徑 `5` 個；精確路徑可查 `index.json → missingDeclaredBodyPaths`。這些不等於整個角色沒有其他形態或替代容器。
- `index.json → catalogOnlySourceDefinitions` 保留未進待設計英雄清單的 6 筆定義及原因；技能道具仍可由逐檔索引查詢。
- MBA `1.70` 未取得；本批不從網路重複下載或購買。
- 原生特效設定、原生動作與道具候選仍需 GGD 轉換、視覺及播放驗收後，才能登記成後台獨立選項。

## 查詢

```sh
python3 tools/hero-model-library/source-workflows/300-mba-unused-assets-v1/query.py 300heroes:135
python3 tools/hero-model-library/source-workflows/300-mba-unused-assets-v1/query.py --library mba --kind vfx --unused-only --limit 20
python3 tools/hero-model-library/source-workflows/300-mba-unused-assets-v1/query.py --kind model --dedupe-sha256 --unused-only --limit 20
```

`files.jsonl.gz` 是逐實體檔索引；`animation-clips.jsonl.gz` 另保留同一容器內的每個動作邏輯紀錄。S3 位置只是備份證據，不是正式 runtime 取用入口。

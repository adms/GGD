# 300英雄與魔法少女武鬥祭 MBA 未使用素材中央索引

固定快照：`20260908T075704221576Z`。本頁由 `build_index.py` 產生；數字來自受驗證備份清單、本機實檔 stat、資產 registry 與中央角色設計索引。

## 範圍與證據

- 已建索 `73,852` 個不同實體檔，共 `17,034,245,346` bytes；其中 `73,791` 個精確檔尚未被目前 runtime 成品引用。
- 動作邏輯紀錄 `51,473` 筆；300 原生 VFX 紀錄 `58,922` 筆。
- 中央角色來源 ID `291` 筆。重新 SHA-256 核對 `311` 個已存在的來源宣告角色 body。
- 備份快照已讀回驗證；逐檔 SHA 來自 `20260908T075704221576Z` 清單，本批另對每個索引檔做存在與 bytes 核對。

## 來源與使用狀態

| 來源 | 版本 | 已直接使用實體檔 | 未使用已對應角色 | 未使用未對應角色 | 未連結儲備 |
|---|---:|---:|---:|---:|---:|
| 300英雄官方用戶端 | v202609021 | 59 | 1,594 | 5,405 | 65,924 |
| Magical Battle Arena Complete Form | Complete Form 1.60+ | 2 | 16 | 23 | 829 |

## 目前缺口

- 來源定義宣告但本機不存在的 body 路徑 `5` 個；精確路徑可查 `index.json → missingDeclaredBodyPaths`。這些不等於整個角色沒有其他形態或替代容器。
- MBA `1.70` 未取得；本批不從網路重複下載或購買。
- 原生特效設定、原生動作與道具候選仍需 GGD 轉換、視覺及播放驗收後，才能登記成後台獨立選項。

## 查詢

```sh
python3 tools/hero-model-library/source-workflows/300-mba-unused-assets-v1/query.py 300heroes:135
python3 tools/hero-model-library/source-workflows/300-mba-unused-assets-v1/query.py --library mba --kind vfx --unused-only --limit 20
```

`files.jsonl.gz` 是逐實體檔索引；`animation-clips.jsonl.gz` 另保留同一容器內的每個動作邏輯紀錄。S3 位置只是備份證據，不是正式 runtime 取用入口。

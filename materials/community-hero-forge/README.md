# 社群英雄交付材料

本批大型材料保存在授權 S3 bucket；Git 保留原文、37 名配方、逐檔 manifest、固定下載位置、還原工具及驗證收據。34 個 `payload.tar.gz.part*` 分段不在本分支的檔案或提交歷史中，不能只 clone repository 就假定已下載材料。原 Git 交付分支保留為歷史，不改寫、不強制推送。

固定位置：`s3://ggd-390630837668-ap-east-2-an/community-hero-forge/3382fab8c12badd9c298ebc937620efa99345d88b06e6b4d387ae5a321d91e74/`。`s3-location.json` 固定 bucket、region、profile 及 manifest SHA-256；`manifest.json` 原有逐檔與分段雜湊不變。

封存內的計畫與交接文字保留當時內容；目前分工以 [整合說明](../../docs/_reports/community-hero-forge/merge-integration/README.md) 及 [#1115](https://github.com/adms/GGD/issues/1115) 為準。大型材料改放 S3 不表示核心／平台衝突整合或正式發布已完成。

## 讀取與還原

`documents/` 保存四份原文件的歷史副本，`recipes/` 保存 37 名原配方。完整資料使用標準 gzip／tar；需要 Python 3.10 以上，以及已配置 `vibe-coding` profile 的 AWS CLI。工具只使用 `ap-east-2`、授權 bucket 和該 profile，由 AWS CLI 自動處理 AssumeRole／更新；不讀取、列印或寫入憑證，不使用其他 profile，不操作 IAM 或刪除 S3 物件。

```sh
# 在 repository 根目錄執行；下載快取放 Git 之外，還原目的地必須不存在。
python3 materials/community-hero-forge/restore.py --download \
  --parts-dir /private/tmp/ggd-community-parts \
  --output /private/tmp/ggd-community-delivery
python3 materials/community-hero-forge/verify.py --restored-root /private/tmp/ggd-community-delivery
# 已下載時可離線重驗，或還原到另一個新目錄。
python3 materials/community-hero-forge/restore.py --parts-dir /private/tmp/ggd-community-parts
```

每次 AWS 傳輸先核對角色為 `vibe-coding-s3-role`；不符即停止。下載寫入暫存檔，SHA-256 與大小相符後才成為可用快取；損壞的既有快取拒絕覆寫。AccessDenied 會指名操作及物件並停止，不重試其他權限或 profile。分段可重用，還原後每份檔案彼此獨立，不因封裝去重而共享可變硬連結。

發布工具為 `s3_transport.py upload --source-parts <本機分段目錄> --receipt <新收據路徑>`。先驗全部本機分段，再用單次 PutObject 與 `If-None-Match: *` 建立各物件，保留 S3 SHA-256；相同既有物件可核對後略過，不同物件拒絕覆寫。manifest 最後上傳。本批不使用 ACL、刪除或 IAM 操作。

完整還原後的重要入口（相對於還原目錄）：

| 材料 | 路徑 |
| --- | --- |
| 目前目標與原交接文字 | `社群創造後台審查英雄自動鑄造計畫最終執行版.md`、`GGD社群英雄完整上傳內容與工作流交接_37名.md` |
| 37 名原始配方／投稿資料 | `GGD社群英雄上傳內容_37名/` |
| 編輯器資料夾匯入（含 37 名模型綁定） | `outputs/community-hero-asset-integration/handoff-azazel-direction-v2/` |
| 目前 37 份隔離受審 ZIP | `outputs/community-hero-asset-integration/editor-publication-20260907/generator-rebuild/01..37/package/` |
| 目前可開啟作品備份 | 上述各英雄目錄的 `after/*-draft.json` |
| 逐槽畫面、原文微調核對與發布紀錄 | 上述各英雄目錄、`delivery-review/` 及前輪證據 |
| 實際遊戲／回放與版本回復證據 | 同一發布目錄的 `live-match/`、`catalog-overlay/` 等子目錄 |
| 模型來源、轉換與風格替代證據 | `outputs/community-hero-asset-integration/` |
| 七名 LoL 模型與動作候選 | `outputs/community-lol-models-20260907/`；包含原轉換及六動作候選，未宣稱取得原作獨立特效／音效 |
| 素材查詢工具與當時索引 | `ASSET_LIBRARIES.md`、`outputs/asset-library-registry-20260907/` |

`verification.json` 是原交付的驗證收據，記錄實際還原後 37 名、222 槽、每份 ZIP 內所有 entries 的位元組核對；不是重新完成技能視覺、遊戲或正式發布的證據。配方及作品中的指定名稱、原文、requiredRefinement 與阿薩謝爾的設計均保留。

## 來源與限制

- 舊紀錄裡的絕對路徑、連接埠、服務版本、當時狀態是歷史證據。它們不會因還原而變成目前正式服務；查閱原紀錄時依 `manifest.json` 的相對路徑找還原檔案。
- 查詢資料庫保存當時的完整索引；它引用的整座 300 英雄／MBA 外部素材庫並未全部搬入。**本批 37 名實際使用的素材已隨作品與 ZIP 保存**，從 S3 取得本批分段即可還原，不依賴那些未選用的外部素材。跨庫名稱匹配仍只是候選，300 英雄的動漫來源及 MBA 1.60／缺件狀態不變。
- 九份歷史驗收腳本的隔離登入密碼改為 `REDACTED_TEST_PASSWORD`，須另行提供自己的隔離帳號才能操作。清單保留修改原因及原檔雜湊；不把處理過的副本稱為原始 bytes。英雄 ZIP、模型、動作、原文與技能資料不作此修改。其他登入憑證、私密服務設定及執行中的帳號資料庫不在本次來源範圍內。
- 三份可由程式重建的本機 Platform 執行檔未封裝，來源與建置紀錄保留，排除項逐筆列在 `manifest.json.excluded`。
- 重開機交接檔作為歷史材料保存，其中的舊待辦及授權狀態不覆蓋目前執行計畫。代理模型與效果不代表原作完整還原；資料 commit 不代表正式上架。

`s3-upload-receipt.json` 記錄 S3 物件大小與伺服器 SHA-256；`s3-restoration-receipt.json` 記錄重新下載及完整還原結果。兩者只驗材料傳輸與還原，未改變模型／技能原有視覺驗收範圍。`s3-branch-proof.json` 列出原產品樹、43 份原文／配方／manifest／verify 的雜湊及排除的 34 個 Git blob；`s3-transport-tests.log` 是 6 項保護測試結果。整體 coord 仍有 8 份既有歷史指紋差異，原始 log 一併保存，待 Main 整合。

封裝工具為 `tools/community-hero-forge/archive-materials.py`。原始材料保留在原處；重建封裝時必須另給本機密碼辨識檔以移除歷史腳本中的測試密碼，該辨識檔不進 Git。後續以現有 PR 的固定版本及部署服務重建正式 ZIP。

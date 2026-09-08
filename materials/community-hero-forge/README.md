# 社群英雄交付材料

此目錄把原先位於 Git 工作樹外的計畫、交接、實際 ZIP、模型／動作／特效／音效、圖片、來源版本庫與驗收證據保存在同一 Git 分支。`payload.tar.gz.part*` 是實際資料，**不是 Git LFS 指標或本機路徑捷徑**；`manifest.json` 列出每份還原檔案及每個分段的大小與 SHA-256。封裝內重複資料只保存一次，還原後各檔案彼此獨立，不會因硬連結而連帶修改其他英雄。

封存內的計畫與交接文件保留當時內容；目前分工與後續整合以 [整合說明](../../docs/_reports/community-hero-forge/merge-integration/README.md) 及 [#1115](https://github.com/adms/GGD/issues/1115) 為準。Main 接手核心／平台衝突整合，原分段與雜湊不因交接更新而改動。

## 讀取與還原

`documents/` 保存四份原文件的可讀副本，`recipes/` 保存 37 名原配方。完整資料使用標準 gzip／tar，分段不超過 32 MiB；需要 Python 3.10 以上，無須其他套件或外部素材庫即可還原本批資料。

```sh
# 在 repository 根目錄執行；先只核對已提交分段。
python3 materials/community-hero-forge/restore.py
# 目的地必須不存在；不會覆寫原工作區、測試服務或正式資料。
python3 materials/community-hero-forge/restore.py --output /private/tmp/ggd-community-delivery
python3 materials/community-hero-forge/verify.py --restored-root /private/tmp/ggd-community-delivery
```

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

`verification.json` 記錄實際還原後 37 名、222 槽、每份 ZIP 內所有 entries 的位元組核對；不是重新完成技能視覺、遊戲或正式發布的證據。配方及作品中的指定名稱、原文、requiredRefinement 與阿薩謝爾的設計均保留。

## 來源與限制

- 舊紀錄裡的絕對路徑、連接埠、服務版本、當時狀態是歷史證據。它們不會因還原而變成目前正式服務；查閱原紀錄時依 `manifest.json` 的相對路徑找還原檔案。
- 查詢資料庫保存當時的完整索引；它引用的整座 300 英雄／MBA 外部素材庫並未全部搬入。**本批 37 名實際使用的素材已隨作品與 ZIP 保存**，不依賴那些未選用的外部素材才能還原。跨庫名稱匹配仍只是候選，300 英雄的動漫來源及 MBA 1.60／缺件狀態不變。
- 九份歷史驗收腳本的隔離登入密碼改為 `REDACTED_TEST_PASSWORD`，須另行提供自己的隔離帳號才能操作。清單保留修改原因及原檔雜湊；不把處理過的副本稱為原始 bytes。英雄 ZIP、模型、動作、原文與技能資料不作此修改。其他登入憑證、私密服務設定及執行中的帳號資料庫不在本次來源範圍內。
- 三份可由程式重建的本機 Platform 執行檔未封裝，來源與建置紀錄保留，排除項逐筆列在 `manifest.json.excluded`。
- 重開機交接檔作為歷史材料保存，其中的舊待辦及授權狀態不覆蓋目前執行計畫。代理模型與效果不代表原作完整還原；資料 commit 不代表正式上架。

封裝工具為 `tools/community-hero-forge/archive-materials.py`。原始材料保留在原處；重建封裝時必須另給本機密碼辨識檔以移除歷史腳本中的測試密碼，該辨識檔不進 Git。後續以現有 PR 的固定版本及部署服務重建正式 ZIP。

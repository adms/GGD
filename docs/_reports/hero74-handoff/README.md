# 兩批各37名英雄：Main材料交接

交付總票 [#1145](https://github.com/adms/GGD/issues/1145)。第一批沿用 [PR #1135](https://github.com/adms/GGD/pull/1135)；第二批與本次補漏沿用 [PR #1144](https://github.com/adms/GGD/pull/1144)，不另開PR繞過原本的驗收。

## 快速入口

- [給模型驗證工作流的完整複製指令](COPY_TO_MODEL_EVALUATION.txt)。這是評估協調者指令，受測模型本身只能拿公開輸入。
- [逐檔交付清單](../../../materials/hero74-handoff/frozen/inventory.json)：39,041個檔案項目、3,428,780,753來源bytes。路徑與SHA都保留；相同bytes可能在多個歷史路徑出現，不把檔案項目數當獨立素材數。
- [第二批37名／222槽總報告](../hero-validation-batch2-37/README.md)及[各英雄特色與相似說明](../hero-validation-batch2-37/特色差異矩陣.md)。
- 第一批目前可維護作品與修正：PR #1135 的 `materials/community-hero-forge/`、`tools/community-hero-forge/`、`packages/shared/src/content/heroForge/communityRefinements/`，本次固定提交 `9a7583e0ee79812c79befe3e992dc3d39909c9c7`。

## 每項交付在哪裡

| 類別 | 檔案項目 | 定址方法 |
|---|---:|---|
| 已推送Git固定提交 | 2,660 | inventory每列的commit、path、blob與SHA；包括兩批產生器／資料與第一批實際機制來源 |
| 本次補入Git的來源／設定／文件快照 | 3,798 | `materials/hero74-handoff/frozen/snapshots/`；保留原相對路徑及原SHA |
| 已有S3封存 | 32,477 | inventory的manifest／member／SHA；四份既有manifest、位置及既有傳輸收據也複製到`frozen/existing-archives/` |
| 新S3封存 | 106 | 第二批37個ZIP、電車GLB與預覽，以及新增歷史模型驗證產物；本次已上傳並全新下載逐檔還原 |

新增封存原始123,638,832 bytes，102份不同內容；壓縮77,724,789 bytes、3分段。新位置：`s3://ggd-390630837668-ap-east-2-an/community-hero-forge/d83f95f5d29ac52bd5419170f3b6ba383c77e67a3afb5652b6ddbc6756ffbd74/`。使用既有`vibe-coding` profile、`ap-east-2`，沒有覆寫舊物件或更改權限。

9份歷史腳本原本含本地測試憑證；這次从已驗證的舊封存取出既有去識別版本直接入Git，保留sourceSha與payloadSha的區別。未提交憑證、node_modules、快取、可重建執行檔或無關模型權重。所有排除項與原因均在inventory，不把排除項算成缺漏已解決。

## 成品、半成品與歷史不要混讀

第一批初始37份作品、原文、build.mts／recipes.mts／finalize.mts也保存在快照中；後續修正的可執行來源仍以PR #1135固定版本為準。快照不是要覆蓋目前runtime的檔案清单。

第一批工作樹在本次盤點時仍有人修改機制。本交接保留捕捉到的未提交檔案作WIP快照，不更動它的分支、index或來源。不同檔案的捕捉時間不構成一份已編譯的原子引擎版本；其後新修改也不屬於這份凍結快照。Main應在PR #1135審查完成版本，不直接套用全部快照。

第二批資料是`0e001412a32ae1dddffb64e3528cfff923bf6cf6`上驗證的版本，buildHash `5117955476f4fd14832936836a3b1c1633905fd8d0cd1edb32cfe5bb731c308c`，引擎`ed547549fb453f6652f53bd7ed9548b0ccef3a36`。37名離線參考通過，完整遊戲上場及嚴格盲測均0/37。第一批原設計缺口仍由#1132追蹤，不能將兩批合稱74名完成上場。

本輪不重新評分既有模型。封存中的舊推論、r3/r7結果及訓練程式只是歷史資料，未授權新訓練，也不代表對第二批做過模型驗證。

## 還原與核對

在含本次提交的repo root，用新目錄：

```sh
python3 tools/hero74-handoff/verify.py
python3 tools/hero74-handoff/restore.py \\
  --manifest-dir materials/hero74-handoff/frozen/archive \\
  --download --parts-dir /absolute/new/parts \\
  --output /absolute/new/restored
```

還原保留原工作區路徑，因此第二批ZIP位於還原目錄下`GGD-hero-validation-batch2/docs/_reports/hero-validation-batch2-37/data/private/packages/`。不要把私有教師套件提供給受測模型。

已有S3封存使用同一restore.py，將manifest-dir改為`materials/hero74-handoff/frozen/existing-archives/<manifestSha256>`即可。預設不大量下載所有舊材料；按inventory找需要的封存。舊資料仍保留原有品質／驗收限制。

`verify.py --verify-git`會額外讀取2,660個固定Git檔案並核SHA；需先取得inventory所列來源提交。一般CI的`verify.py`驗本次Git快照與封存收據，不聲稱重新下載S3。收據驗證和實際下載驗證分開記錄。

## Main驗收順序

1. 沿PR #1135審查第一批可執行來源與局部修正，保留未完成原設計要求。
2. 沿PR #1144審查第二批及本交接，核對材料清單、S3還原與模型輸入隔離。
3. 更換引擎版本或合併後重跑各自驗證；舊引擎綁定的第二批收據不能直接當新引擎結果。
4. CI及必要review通過後由Main合併；本輪未執行合併或正式部署。

## 本輪檢查結果

材料清單39,041項、2,660個固定Git檔案及3,798份快照核對通過；S3新增106檔全新下載還原通過；完整性檢查器4項測試通過，包含快照竄改、封存來源不符及路徑越界負例。公開模型輸入39檔＋allowlist已另匯出並核SHA，見[export收據](model-input-export.json)。

三项倉庫gate在同一版本一起執行，全部exit1，見[完整收據](prepush/summary.json)。skills仍卡在sparse缺9份音效manifest；Editor通過185項Skill Forge測試後卡在既有advisory過期；coord只有舊editor-form packet指紋不符，本批兩份packet均通過。詳細既有原因見[前輪只讀分類](../hero-validation-batch2-37/prepush/final-classification.json)。後段未觸達的檢查仍未驗，未修改歷史產物或引擎以換綠燈。

兩個原依賴symlink已恢復，6項外工作樹快取前後雜湊不變。此次只提交本任務檔案，第一批進行中工作樹的原檔與index沒有被本任務修改。

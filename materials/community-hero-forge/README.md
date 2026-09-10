# 社群英雄交付材料

## 正式上架狀態更正（2026-09-10）

正式站 `cv_a5039179a7ff` 的內容包、營運白名單及公開覆蓋層已確認：第一批 37、第二批 37、LoL 7 名，共 **81 名／486 槽**已存在，全部在白名單，沒有 retired／hidden／deleted。LoL 正式 ID 是 `lol-*`；下方與歷史收據中的「尚未正式上架」只描述當時狀態，不能當作目前名單。`hero-works/published` 為空也不能推論正式英雄未上架。

目前另有模型缺檔：固定 Main `7b639e630` 中，81 名使用的 77 個模型實檔有 44 個未進 Git，這 44 個正式 URL 回 404。此次依已上架綁定補入相同 SHA 的 44 個 GLB，全部原件保留；[交付收據](receipts/live-model-git-delivery.json) 記錄逐檔大小、版本與來源。合併部署後仍須確認模型 URL 已恢復，不能把 Git 補檔稱為線上缺檔已修復。

離線核對：`python3 tools/community-hero-forge/verify-live-model-delivery.py`；核對已提交 bytes 加 `--git-ref HEAD`。本次不重複投稿、不更改英雄技能與模型版本，也未重新逐招驗證玩法。

## 第一批歷史交付與設計說明

第一批 37 名／222 槽已依核准的惡搞方向全部更新：21 名重新組合、11 名局部調整、4 名保留已完成核心，阿薩謝爾另套用最新極大範圍反轉。37 份微調和作品都保留獨立版本，原名、完整原稿、requiredRefinement 與模型綁定不變；本輪沒有新增引擎功能、模板定義或全域機制標籤。

逐名玩法見 [37 名對照](refinements/parody-review.md) 與 [222 槽機器清單](refinements/parody-review.json)。42 組四條件連动、105 個主動槽效果、20 項被動事件探針與 157 項邊界檢查通過；其他保留核心與新增代價由產品回歸檢查。37 套正規化技能組沒有完全或近似重複，但這個數字不單獨证明創意、平衡或視覺品質。

**行為測試、畫面、當下服務 ZIP 與發布分開記錄。** 原稿忠實還原已依核准方向簡化，不能把這批改編叫作原作設計全數完成。目前 37 名皆通過當前服務 ZIP 建立／檢查，以及隔離投稿、管理員發布和異帳號下載逐位元還原，見 [投稿情境](refinements/parody-admission-scenes.json) 與 [發布收據](refinements/parody-publication-proof.json)。前置召喚、命中和資源改由實際操作取得；移除取得來源仍會拒絕。3D 畫面尚未全數通過：菜月昴 W 的模型像素檢查失敗，八神庵 EX／空條承太郎 Q 有遮擋畫面待處理；其餘截圖不可未經判讀就列為通過。依最後裁決，鏡頭／遮擋／美術微調只記錄，不阻擋 37 名功能交付；只有技能、特效或機制失效才屬重大問題。這不是正式站部署。

阿薩謝爾 R→EX 使用既有「極大」範圍：先反轉自己 R 的詛咒，使敵人輸出 +10% 並受嘲諷兩秒，再進入三秒賢者時間，護甲／魔抗歸零、攻速／移速降低60%，到期還原。現有 GGD 嘲諷、可驅散規則及最低數值仍適用。防禦歸零的輸入由當下 combat-env/base-bonus 換算；更改這兩份配置必須重建並驗證，不能沿用舊結果。

## 最新可共用作品（2026-09-09）

[index.json](index.json)、[projects/](projects/)、[recipes/](recipes/) 與 [refinements/](refinements/) 是完整編輯來源。逐檔版本與 SHA-256 見 [handoff-manifest.json](handoff-manifest.json)，驗證策略見 [批次操作說明](../../tools/community-hero-forge/BATCH_VERIFICATION.md)。所有 222 槽已登記目前適用的產品測試；登記本身不代表測試通過。

生成來源在 [parody/](../../tools/community-hero-forge/parody/)，先修改 designs/adapt-existing，再重新產出微調，不手改成品。模板版本由現有產生器釘選，套用時各英雄獨立實體化；baseline-refinements.json 保留改編前配方，阿薩謝爾另有舊版回放回歸。

```sh
# 生成或檢查微調，接著集中驗證新連動；來源改變會拒絕舊 build。
pnpm exec node --import tsx tools/community-hero-forge/parody/build.mts --check --out /private/tmp/ggd-parody-check
pnpm exec node --import tsx tools/community-hero-forge/parody/verify.mts /private/tmp/ggd-parody-check
# 核對 Git 的 37 份作品、原文與 222 槽編譯。
pnpm exec node --import tsx tools/community-hero-forge/prepare-published-handoff.mts
# 模型封存已還原時，將 Git 最新作品和既有模型組成新的可匯入目錄。
pnpm exec node --import tsx tools/community-hero-forge/prepare-published-handoff.mts \
  --release-root /private/tmp/ggd-release-payload \
  --output /private/tmp/ggd-current-authoring-handoff
```

首次需要模型時，先依固定 profile/bucket 使用 restore.py 還原 supplements/release-13956d93b；下節保留封存流程。本輪沒有新增或替換模型；修正後全部 37 份當前服務 ZIP 已另行 [S3 封存並重新下載還原](supplements/admission-37-20260909/README.md)。前次 32 份 ZIP、原始大型模擬證據及失敗截圖仍保留在 [歷史封存](supplements/parody-37-20260909/README.md)。上述位置是既有封存紀錄。2026-09-10 起依 [目前存放規則](../../docs/素材庫與-S3-統一資源庫.md)：成品實檔進 Git，其餘半成品、來源與準備材料進 S3，本機全保留；不能再以模型／圖片或二進位格式為由排除成品。本次文件更新尚未把既有封存內的成品逐項補入 Git。正式整合由 [PR #1135](https://github.com/adms/GGD/pull/1135) 交 Main 審查與合併。

## 歷史驗收

炭治郎、承太郎、八神庵等前批提交／測試結果保留於各自 refinements/*-verification.json；那時的 93/129 槽、965 項回歸或服務版本都是歷史數字。當前範圍與證據請讀上方入口及本次批次收據。

## 歷史大型材料

本批大型材料保存在授權 S3 bucket；Git 保留原文、37 名配方、逐檔 manifest、固定下載位置、還原工具及驗證收據。34 個 `payload.tar.gz.part*` 分段不在本分支的檔案或提交歷史中，不能只 clone repository 就假定已下載材料。原 Git 交付分支保留為歷史，不改寫、不強制推送。

固定位置：`s3://ggd-390630837668-ap-east-2-an/community-hero-forge/3382fab8c12badd9c298ebc937620efa99345d88b06e6b4d387ae5a321d91e74/`。`s3-location.json` 固定 bucket、region、profile 及 manifest SHA-256；`manifest.json` 原有逐檔與分段雜湊不變。

封存內的計畫與交接文字保留當時內容；目前分工以 [整合說明](../../docs/_reports/community-hero-forge/merge-integration/README.md) 及 [#1115](https://github.com/adms/GGD/issues/1115) 為準。大型材料改放 S3 不表示核心／平台衝突整合或正式發布已完成。

## 補充盤點與來源

2026-09-08 全量盤點發現原三批未涵蓋所有既有 Git 素材，已另建 [素材補漏封存](supplements/workspace-assets-20260908/README.md)：5,444 份去重素材已上傳、重新下載並逐檔還原；四個工作樹目前 29,108 個資源路徑核對為 0 漏件。原 34 分段及 manifest 不變。[資源庫歷史快照與維護來源](asset-library-sources/README.md) 保留 156 份 script、JSON 與文件，以及另一任務維護的 Git 來源指標。當時採用的「原始模型、動畫與大型解析 JSON 放 S3；程式、設定及文件放 Git」分工屬歷史規則，目前依上方 2026-09-10 裁決按完成狀態處理。共用素材庫來源由 [PR #1119](https://github.com/adms/GGD/pull/1119) 的 `codex/asset-library-management` 統一維護，已推送的固定來源見上述指標，本分支負責 37 英雄工作流與上述歷史證據。歷史備份、現有 Git 素材及未涵蓋範圍詳見補漏說明，不能擴大解讀為整台 Mac 所有檔案或正式上線均已完成。

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

鹿目圓 revision 13→14 需包含機制提交 `597db32918ad27262ca6e343217a9d12672d672d`：`onAllyProtected`、`applyStatus.grantMark`、`lethal.maxSavesPerRound`。19 項角色行為、207 項集中回歸與三項反例見 [鹿目圓驗證](refinements/madoka-verification.json)。其餘 36 份作品逐位元組不變；本次不代表畫面或正式發布驗收。

奇犽 revision 12→13 需包含機制提交 `996fa4a45053c3831d3a820c03f342cda76de5b8`：具名資源 toggle 維持費、`statusCost.count=all`、`onEvade` 的來源／通道過濾。24 項角色測試與 213 項回歸見 [奇犽驗證](refinements/kirua-verification.json)。所有 37 名重編譯可用，整體原設計與畫面仍有缺口；新版不能套用舊服務收據。

本輪實際畫面與預览失敗圖另存 [畫面 S3 封存](supplements/visual-37-20260909/README.md)，Git 保存 [逐名收據](refinements/parody-visual-review.json)。

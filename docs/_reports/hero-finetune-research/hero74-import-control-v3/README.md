# 固定 Main 本機匯入控制組

這次前進到真正 HTTP 匯入、隔離作品保存與下載重讀，不只 schema／編譯／SimWorld。但尚未接平台選角或對局，不是模型生成成功率。

## 實測

- 分母仍是 17 名 internal-dev 教師英雄；原始需求、教師答案和模型訓練資料未改。
- 14 名通過 Main `/hero-package`、`/inspect-hero-package`、`/prepare-work`、作品詳細資料及 ZIP 下載；source 完全一致，下載 ZIP 與建包 ZIP 位元組一致，有上傳模型者模型位元組一致。
- 1 名 `community-review-09-20260907:HERO` 發生 `TypeError: fetch failed`。本次舊錯誤訊息未保留 route/cause，原因尚不能定位；不斷言教師或引擎有缺陷，不自動重試或將它算成功。後續工具已保留 method/route/cause code，沒有憑證或授權 header。
- 2 名 native-content 格式仍需獨立匯入介接，保留分母；沒有轉換成另一套英雄模板來湊通過率。
- `runtime-audit.json` 對上述已保存的 14 份 ZIP 做離線全量比對：14/14 runtime 文件集合與 pre-import package admission 完全相同；0 差異，3 名未測。不是只查檔案存在或數量。
- 工具 7 項測試通過；測試含來源套件別名不得指向其他工作樹、版本衝突、資料／ZIP 變更、artifact hash、runtime 文件遺漏／多出／重複／改值及固定分母。

## 隔離與版本

Main source/content 精確 pin `2cdc3f902b4dbc0c45b2b49b4b74ed0436ff3d8b`。由 Git archive 建立獨立來源，第三方套件版本記錄在 `source-evidence.json`；`@ggd/shared` 必須指向歸檔來源，不借用其他工作樹的 shared 程式。啟動前使用 Main `snapshotHeroGenerator`／`snapshotHeroProcessor` 驗證建置來源完整。

Main `buildHeroImportServer` 只監聽 `127.0.0.1` 的隨機埠，作品寫入專屬 run 的 `work-storage/`。使用固定 base catalog、沒有 platform overlay；因此這不是既有服務的目前內容快照。HMAC secret 只在程序記憶體產生／使用，沒有取用既有服務或 AWS 憑證。所有服務已正常關閉，沒有公開發布、官方 apply、覆寫既有英雄或修改其他服務。

`report.json` 的 script SHA 對應 commit `be0260bc8` 的匯入器；後續離線 runtime audit 使用同工具的新子命令，不重做 HTTP 或挑選較好的模型輸出。

## 可重跑入口

工具：`tools/editor-acceptance/hero-distillation-import-roundtrip.mts`。

匯入模式需要 `--admitted PACKAGE_ADMISSION_DIR --out NEW_DIR --source-repo REPO --dependencies SHARED_NODE_MODULES --api-dependencies API_NODE_MODULES --asset-root ASSET_ROOT`，asset-root 可重複。必須使用全新輸出目錄；來源／模型不修理，既有 run 不覆寫。

離線比對模式使用 `--admitted PACKAGE_ADMISSION_DIR --verify-saved-runtime IMPORT_RUN_DIR --source-repo REPO --out NEW_AUDIT_DIR`，只讀既有 ZIP，不發 HTTP、不重試失敗英雄。

本機原始 ZIP、保存狀態及完整來源保留在 workspace `outputs/hero-forge-12b-restart-20260908/hero74-import-control-v3/`；Git 保存索引、來源指紋、target profile、結果與原始失敗收據。權重沒有加入 Git。

## 保留失敗與尚未完成

`harness-v1-sandbox-failure.json` 是沙箱禁止 listen；`harness-v2-source-packaging-failure.json` 是驗證工具漏帶 pnpm-workspace.yaml。舊結果不覆寫，不把兩項測試環境故障當作模型品質。現版補齊來源並在測第一名之前做 Main source snapshot 檢查。

還需要：base/LoRA 真實生成後套用相同匯入流程；native 格式介接；零人工、友敵／時序／資源／跨槽與全六槽語意及真實對局證據。現有固定範例 socket proof 只涵蓋 Q/W/E，不能當作這批完整英雄驗收。沒有擴充資料、重訓候選或改動本次 GPU worker；整體目標仍未完成。

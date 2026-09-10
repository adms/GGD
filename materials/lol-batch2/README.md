# 第四批：LoL 第二批 11 名／66 槽

本批為 **可重建的設計候選，尚未上架**。第一批 37＋第二批 37＋先前 LoL 7 共 81 名的正式狀態不由本批更動。

角色：賽特、稻草人、鄂爾、科加斯、艾希、布里姿、阿璃、瑟雷西、威寇茲、墨菲特、蓋倫。保留指定角色名，PASSIVE／Q／W／E／R 優先保持來源辨識與操作，EX 承擔惡搞。原版無法沿用的核心由 Main 補機制，不能把技術候選直接當最終替代。

## 已完成與尚未完成

| 項目 | 狀態 |
|---|---|
| 11 名、66 槽候選／模板快照／獨立作品身分 | 已建立；本批全部通過編譯 |
| 共用 recipe factory 與舊七名相容 | 3 項定向測試通過；舊七份完整作品修改前後逐 bytes 相同 |
| 艾希 E「鷹擊長空：強制簽收」 | 已通過正常施法、延遲繳械、可移動／施法、到期恢復普攻的 SimWorld 測試 |
| 11 名原生模型 | GLB 格式／共享模型契約／CPU 動作檢查通過，GLB 與 model doc 已納入 Git；尚未完成畫面驗收 |
| 原始素材及處理中間資料 | 本機保存，S3 存放與校驗見 storage.json |
| 原版關鍵機制 | 4 張 Main 需求票、6 類用法、8 槽仍待接入 |
| 其餘候選的原版差異 | 每名 adaptations 逐槽列明；編譯通過不代表已完成全部玩法驗收 |
| 編輯器作品 | 可重建及手動開啟；完成預設清單仍停用本批 |
| 當下服務 ZIP／投稿／管理員發布／正式選人名單 | 尚未執行；不得以離線編譯取代這些結果 |

艾希 E 因地圖全開而改為惡搞功能：指定區域在 0.7 秒後使仍在範圍內的敵人繳械 0.8 秒；不能普攻，但仍可移動與施法。它不提供視野，不造成傷害。W 緩速可幫助命中，對手可在預警期間離開。

## Main 的必要機制

| 票 | 對應技能 | 必須保留 |
|---|---|---|
| [#1187](https://github.com/adms/GGD/issues/1187) | 阿璃 R、瑟雷西 Q、鄂爾 R | 次數型重施放／命中後自選進場／再次施放撞羊改向 |
| [#1189](https://github.com/adms/GGD/issues/1189) | 瑟雷西 W | 隊友自主點燈接受位移與燈籠護盾 |
| [#1190](https://github.com/adms/GGD/issues/1190) | 鄂爾 Q、E | 暫時地形柱及只在撞有效地形時發生的震波 |
| [#1191](https://github.com/adms/GGD/issues/1191) | 稻草人 W、威寇茲 R | 持續引導的中斷／完成／取消後停止波次；射線持續瞄準 |

完整要求見 [main-requirements.json](./main-requirements.json)。沒有艾希遠端視野需求。總票 [#1185](https://github.com/adms/GGD/issues/1185) 保持開啟，實作接回、驗證及實際發布完成後才記錄關票。

## 來源與重建

唯一技能候選來源是 `packages/shared/src/content/heroForge/communityLolBatch2.ts`；`projects/` 與 `drafts/` 為產物，不能各自手改。`drafts/` 使用現有 ggd-local-draft@1 wrapper，可經編輯器「開啟作品檔」檢閱。每份 HeroProject 保存模板版本快照；不同作者建立副本不會共享可變物件。模型候選已按精確 native ID 綁定，見 [models.json](./models.json) 的 Git 路徑、SHA 及原始來源。

```sh
node --import tsx tools/community-hero-forge/lol-batch2.mts
node --import tsx tools/community-hero-forge/lol-batch2.mts --check
pnpm exec vitest run packages/shared/src/content/heroForge/communityRecipe.test.ts packages/shared/src/content/heroForge/communityLolBatch2.test.ts --maxWorkers=2 --minWorkers=2
```

這支腳本只產生編輯作品，沒有寫入正式 champions／abilities、投稿、部署或 whitelist 的權限行為。核心機制接入後，沿現有 Editor 開啟作品 → target-profile → hero-import/build／inspect → hero-submissions → 管理員發布流程；ZIP 應在執行時按服務版本重新建包。

## 模型限制與來源材料

每名有六個 GGD state bindings，但只有五個獨立原生 clips，**hurt 全部沿用 idle**。Sett、FiddleSticks、Ornn、Ahri、Thresh 超過 300 通道警戒，均低於當下 500 上限。没有硬體效能或美術驗收宣稱；未提取獨立 LoL 技能特效，音訊仍是未綁事件候選。

固定 SHA 的中間 GLB 可由 `tools/community-hero-forge/lol-batch2-assets/rebuild-from-converted.py` 接既有工具重建。細節見 [MODEL_PREPARATION.md](./MODEL_PREPARATION.md)，其中 raw WAD 工具缺件與「組合重建腳本未再完整執行」限制仍保留。原生 WAD 完整副本仍在本機素材庫；本批處理輸出另保存在 `outputs/lol-batch2-prepared-20260911`，不依賴臨時目錄存活。

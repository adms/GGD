# 第四批：LoL 第二批 11 名／66 槽

本批已接入編輯器的獨立草稿入口，並在合併最新版 Main 的功能分支中完成 **11／11 本機隔離發布**；正式 Main 服務尚未上架。英雄屬性、出身、六槽技能、機制參數、基本 GGD 特效、模型與動作綁定由同一配方產生。來源核心操作尚待 Main；不可把本機發布、基本特效或模型檔存在當作原作機制及正式站上架完成。

角色：賽特、稻草人、鄂爾、科加斯、艾希、布里姿、阿璃、瑟雷西、威寇茲、墨菲特、蓋倫。保留指定名字；QWER 優先維持來源操作與用途，EX 承擔惡搞。逐槽差異隨草稿保存並顯示在入口，不把簡化候選寫成原版機制。

## 這輪實作

- 「我的作品」可建立 11 名獨立草稿；作品保留模板快照、屬性、出身、配方及模型選擇，可備份／開啟。未通過驗證的作品不能建立完整 ZIP。
- 修正實際 Editor 的 41 字元 `hero-UUID` 造成盾的 `stackKey` 超長：只對超過 48 字元的疊層鍵做穩定雜湊，跨槽引用一致、作品彼此獨立，技能與狀態 ID 不截斷。舊七名短 ID 作品逐 bytes 不變。
- 55 個主動槽有基本演出腳本；11 個被動槽在既有效果成功分支綁基本提示。投射物命中、延遲擊中及落點效果沿既有事件執行，不宣稱還原 Riot 特效。
- 賽特 W 修正中心真傷／兩側物傷與蓄勢消耗；R 帶行後在終點結算。稻草人 R 前搖及落地群鴉已有定向模擬驗證。其他逐槽簡化仍列於配方，沒有擴大成新引擎功能。
- 11 份原生模型成品及版本設定留 Git，模型索引已重建。瑟雷西透明材質修正為新 SHA／modelKey，保留舊未發布候選的本機及 S3 材料，沒有覆寫同一版本。

艾希 E「鷹擊長空：強制簽收」依全圖可見情境改編：指定區域在 0.7 秒後使仍在半徑 2 內的敵人繳械 0.8 秒，仍可移動與施法，不提供視野、不造成傷害。W 緩速可協助命中；敵人可在預警期間離開。

完整驗證結果及未通過項目見 [validation.json](./validation.json)。本機服務 11 名／66 槽 ZIP 往返已通過；同一套 current loopback 服務也已完成 11 名投稿、管理員發布、公開名單核對，以及賽特 v1→v2→v1 且不改動阿璃的版本隔離驗收。正式 Main 發布與完整原作視覺還原仍未完成。

## Main 尚待接入的核心

| 票 | 槽 | 操作缺口 |
|---|---|---|
| [#1187](https://github.com/adms/GGD/issues/1187) | 阿璃 R、瑟雷西 Q、鄂爾 R | 次數型重施放、命中後自選進場、同一羊再次撞擊改向 |
| [#1189](https://github.com/adms/GGD/issues/1189) | 瑟雷西 W | 隊友自主點燈接受位移與護盾 |
| [#1190](https://github.com/adms/GGD/issues/1190) | 鄂爾 Q、E | 暫時地形柱及撞有效地形才發生的震波 |
| [#1191](https://github.com/adms/GGD/issues/1191) | 稻草人 W、威寇茲 R | 可中斷持續引導，結束後停止後續波次；射線持續瞄準 |
| [#1197](https://github.com/adms/GGD/issues/1197) | 阿璃 Q／E、瑟雷西 R、威寇茲 Q／W、蓋倫 Q | 法球返航／魅惑、觸碰破牆、當前彈體分裂／固定裂痕與充能、僅解除既有減速 |

共 5 張票、14 槽，核對基準 Main `6da992509`；見 [main-requirements.json](./main-requirements.json)。這個數字不是其餘 52 槽均已取得完整來源驗收的宣稱。總票 [#1185](https://github.com/adms/GGD/issues/1185) 保持開啟；核心接回、必要驗證、投稿與管理員發布完成後才記錄關票。

## 重建與集中驗證

技能來源：`packages/shared/src/content/heroForge/communityLolBatch2.ts`。基本演出來源：同目錄 `communityLolBatch2Presentation.ts`。各作品由共用 factory 生成後微調，獨立模板快照與版本清單由 Git 保存。

```sh
node --import tsx tools/community-hero-forge/lol-batch2.mts --out /private/tmp/lol-batch2-authoring
node --import tsx tools/community-hero-forge/lol-batch2.mts --check
pnpm exec vitest run packages/shared/src/content/heroForge/communityRecipe.test.ts packages/shared/src/content/heroForge/communityLolBatch2.test.ts packages/shared/src/content/heroForge/communityLolBatch2Mechanics.test.ts packages/shared/src/content/heroForge/communityLolBatch2Presentation.test.ts --maxWorkers=2 --minWorkers=2
pnpm --filter @ggd/editor exec vitest run src/hero/CommunityHeroExamples.test.tsx --maxWorkers=2 --minWorkers=2
```

腳本預設把準備用 projects／drafts 放到本機 `outputs/lol-batch2-authoring`，可指定輸出；Git 僅保存配方、重建工具與 [authoring-manifest.json](./authoring-manifest.json) 的版本摘要及 SHA。檢查模式不要求 clone 附帶中間草稿。

服務端一次完成全部 11 名來源、六槽、模板依賴、特效、模型 GLB 與 ZIP 還原核對：

```sh
node --import tsx tools/community-hero-forge/lol-batch2-service-check.mts \
  --origin http://127.0.0.1:8831 --editor-origin http://127.0.0.1:5211 \
  --out /private/tmp/lol-batch2-service-new-run
```

僅允許 loopback，輸出須為新的暫存子目錄；不登入、不投稿、不發布。建包時讀取服務的 target-profile，批次結束再次確認版本一致。產出的 ZIP 為候選驗證材料，正式上架時須依當時服務版本重建。

## 模型與材料

[models.json](./models.json) 保存精確 native ID、Git 模型／GLB 路徑、SHA、片段對應及警戒。每名有六個 GGD state bindings、五個獨立原生 clips，**hurt 全部沿用 idle**。Sett、FiddleSticks、Ornn、Ahri、Thresh 超過 300 通道警戒，均低於當下 500 上限。未作硬體效能或所有英雄畫面驗收宣稱；音訊為未綁事件候選。

[storage.json](./storage.json) 記錄本機與 S3 準備材料位置。[MODEL_PREPARATION.md](./MODEL_PREPARATION.md) 是初次模型處理的歷史收據，內部相對路徑指向該材料封存，不是本文件所在目錄。精確工具缺件、hurt 替代及組合重播未完整再跑的限制仍保留。瑟雷西後續透明修正由 `tools/community-hero-forge/lol-batch2-assets/repair-body-alpha.py` 產生新版本。

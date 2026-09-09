# 七名 LoL 英雄來源

七份完整 `HeroProject`，每名 PASSIVE／Q／W／E／R／EX 六槽。名称保留沃維克、卡爾瑟斯、拉克絲、犽宿、好運姐、李星、齊勒斯；穩定 `projectId`／`heroId` 為 `community-concept-<英文名>`，不冒充還原舊瀏覽器的隨機草稿 ID。

技能配方直接來自 `packages/shared/src/content/heroForge/communityExamples.ts` 的 `createCommunityHeroExample`，模型選用沿 Editor 的 `editHeroProject` API。七份 `models/*.json` 原樣複製既有 `docs/_reports/community-hero-forge/lol-models/forge-preview/model-docs/`，沒有修改技能、模板、模型比例或動畫對應。專案內的配方文字與模板快照完整保留；配方中的舊替身說明是歷史來源文字，實際本體以 `presentation.modelKey` 和本目錄模型文件為準。

從 repo root 重建：

```sh
node --import tsx materials/community-hero-forge/lol/rebuild.mts
```

預設 GLB 來源是 repo 同層的 `outputs/community-lol-models-20260907/ggd-runtime-candidate/<英文名>.glb`。可用 `GGD_LOL_ASSET_ROOT` 指向另一份相同 SHA 的本機副本。生成前逐份核對 SHA，僅寫本目錄；不啟動服務、不生成圖片、不更動出貨 `content/`。

`manifest.json` 記錄來源程式版本與 SHA、編譯所讀模板／設定／VFX 子類的摘要、七份專案／模型文件 SHA、GLB SHA 和原證據路徑。每名只執行一次既有 `compileGeneratedHeroDraft`，並核對六槽、穩定身分、原模型、模板版本快照與寫回完整性。技能方案與建立函式產生的原方案逐欄相等。

這次交付只包含 JSON 來源及模型文件，**GLB 尚未隨 Git 交付，也未確認已在正式服務素材目錄**。既有本機預覽／隔離平台收據不能當作正式服務的發布結果。尚未取得整合後正式 target 建包，未投稿、未發布；後續由主線沿既有 `buildHeroSourcePackage` 與 `/hero-import/build` 流程處理。

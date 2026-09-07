# 37 名英雄目前服務建包與固定審查驗收

本批以隔離的 Platform 8091、私有 importer 8801、nginx 8803、Editor 5201、Admin 60801 執行。保留既有 `/private/tmp/ggd-model-upload-acceptance` 帳號、資料與投稿歷史；Platform 重新建置、importer 重新啟動，兩者使用服務建置戳記 `6aeb6aeb39c1d3a4a16c185f035b3c0c65896b92`。本批後續修改的是 Editor／Admin 與驗收工具，沒有改動這份服務的編譯核心。

## 37 份當前版本 ZIP

`tools/community-hero-forge/handoff-service-proof.mts` 透過測試作者登入正式路由，讀取服務 target，為全部 37 份來源重新建立 source ZIP，再由服務編譯並 inspect。批次前後四項 target 相符：

- gameRevision：`6aeb6aeb39c1d3a4a16c185f035b3c0c65896b92`
- contentVersion：`cv_d1152f314f87`
- migrationFingerprint：`c1d421940674`
- processorFingerprint：`bcc591d39076`

37／37 通過，222 槽存在；每份完整 authoring 與輸入逐欄相等，包含原文、requiredRefinement、處理說明、模型來源。模型 GLB 逐位元組相等，ZIP 有真正 compiled 與 simulation validation 文件，並由當前服務再次 inspect。每份 package／archive／source／model 摘要見 `service-build-report.json`。這項檢查證明當前服務可建包及無損還原，不是原設計全部完成的證據。

完整檔案在工作區 `outputs/community-hero-asset-integration/packages-current-service-6aeb6aeb`：37 份 ZIP 共 147,352,811 bytes，包含逐份 inspection、完整 target 與批次報告。輸入為 `handoff-azazel-refinement-v1`，沒有改寫原交接資料或舊離線 ZIP。

重跑使用新輸出目錄；測試密碼由環境提供，不寫入報告：

```sh
GGD_LOCAL_COMMUNITY_PROOF=disposable-local-only \
pnpm exec tsx tools/community-hero-forge/handoff-service-proof.mts \
  --handoff ../outputs/community-hero-asset-integration/handoff-azazel-refinement-v1 \
  --out /private/tmp/ggd-community37-new-run \
  --platform-port 8803 --username model-author
```

另需設定 `GGD_LOCAL_PROOF_PASSWORD`。工具只可連線 127.0.0.1，不會投稿或發布，不覆蓋既有輸出。

## 實際瀏覽器與審查結果

阿薩謝爾由 Editor 登入、建包、下載、同步私人模型與草稿，再投稿。瀏覽器稿為第 9 版，package digest `sha256:92b393e421c2506cc0c67587d20d9784088711dd923ee80c311c4592ec3ffaba`，包含 130 份遊戲資料、98 份資產。批次稿為第 4 版；兩者只差 revision、sections、validationState，完整 sourceDesign、方案、演出與模型相等，故 ZIP 摘要不同是有依據的版本差異。

Admin 讀取真正固定的投稿快照，六槽均採用同一份上傳模型，雙方 GLB 材質正常，沒有 Runtime exception。`ui/review-*.png` 六張實際畫格已逐張查看：可見雙方卡通羊本體與範圍／浮字；它們是載入與固定預覽畫格，不代表原作全段動作或專屬演出完成。軟體渲染也不代表 A17 Pro FPS 測量。

實際審查發現原後台只有目前概念與技能描述，未顯示交接的完整 sourceDesign／requiredRefinement。已重用 `HeroSourceDesignPanel`，新增唯讀模式，讓 Admin 逐槽查看原文、交接時行為、待補要求與作者處理說明。七項表單測試與 `ui/source-review.json` 都直接比對完整內容；實際 UI 六槽與下載 ZIP 相符，沒有可編輯原文／處理說明的欄位。

作者在投稿後修改 Q 處理說明並同步雲端第 2 版；管理員重新載入仍看到第 9 版固定來源及相同 package digest。之後作者說明已還原並同步第 3 版。第一輪證據讀取器誤用折疊 `<details>` 的 innerText，取得空字串而失敗；改用 textContent 後接續原步驟完成，沒有重建或冒換候選。兩份紀錄均保留於 `ui/frozen-draft*.json`。

本次正式測試審查結果是**退回修改**。管理員填寫 E 方向／近身技能分類、W 專屬白雨演出、EX 金光／增益 UI／驚愕演出三項問題；作者透過「更新審查結果」收到同一份意見，見 `ui/return-review.json`。R→EX 同來源詛咒反轉的已完成機制不因外觀待補而被刪除，也沒有用代理模型或編譯通過宣稱整名英雄完成。

## 冷模型載入修正

實際 Editor 曾因 GLB 未在 750 ms 內完成採用，固定顯示替身並封鎖驗收，原始文字見 `ui/before-load-fix.txt`。750 ms 原本同時用於短暫的場景暖機及完整 GLB 載入，會把正常冷解碼誤判為資產失敗。

GLB 採用現有獨立 10 秒有界等待，模型準備好就立即往下執行；切換／關閉場景則取消。未完成仍會超時，材質暖機、貼圖與 framebuffer 可見性檢查全部保留。三項時間測試覆蓋 900 ms 後才完成、永不完成與已替換場景，既有 20 項 paused-render 檢查通過；瀏覽器重新開啟以及固定審查六槽均能取得雙方真模型。

## 驗證與剩餘工作

來源面板及既有技能表單 12 項通過；模型載入與既有 stage 23 項通過。Admin 型別檢查、production build 通過。初次 focused 指令從錯誤 cwd 執行而找不到測試；初次來源面板測試誤用 headless harness API；原始失敗與修正後輸出都保留。第一次完整門檻的 tsx IPC EPERM 另存於本機；本機權限重跑及最終門檻結果見 `gates.json`。

仍需逐槽完成 37 名原設計、專屬 VFX／音效／動作及整體驗收，原設計完整驗收仍為 0／37。本批未發布這 37 名、未完成當前版本多人遊戲画面／回放驗收；桌面原生安裝與更新／降級、PR CI／Main review 仍保留在總計畫範圍。遠端推送先前被自動核准審查拒絕，沒有重試或繞過。

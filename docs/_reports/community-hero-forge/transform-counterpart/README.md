# 鑄造器變身對應體驗收（#1120）

由 `117057a82` 建立 `codex/community-hero-forge-release`，延續 Main 已合併的 #1118（`ed3909de0`）。修正提交為 `4be59032e`。本頁只記錄 #1120，不代表 37 名英雄已完成正式部署。

## 最終行為

生成器依實際編譯後的 `championForm` 效果生成獨立、穩定 ID 的變身態，建立雙向 `transform.counterpartId`。不以模板名稱判斷機制；兩態經過共用 roster 屬性解析，保持技能、模型與屬性副本獨立。生成英雄沒有 WC3 原作出處，因此 transform 的 rawcode／trigger provenance 改為可選；原作資料與現有精確來源斷言保留。

Editor 的單槽、整套與互動情境取得對應體。ZIP 包含對應體，Main 房間入場驗證允許同一作品擁有它，但不增加獨立選角項、不污染原出貨 Registry；既有內容身分衝突拒絕。新生成來源隨既有生成器版本快照保存。

本體與變身態目前共用所選模型／技能。增益仍由模板效果決定，沒有憑空增加屬性，也沒有替角色捏造另一套原作美術。`tpl-transform` 參數及出貨英雄未修改。

## 實際驗證

| 檢查 | 結果與證據 |
| --- | --- |
| 修正前移除舊 gap 排除 | 兩個矩陣測試失敗；第 1、4 階及 74 組有序組合皆有 `no-form`，`before.log` |
| 生成、Editor、ZIP、房間 | 4 檔 34 項通過，`targeted.log` |
| 完整預設模板矩陣、既有變身、來源版本保存 | 6 檔 24 項通過，`matrix-and-legacy.log`；1–8 所有子集的選擇性耗時測試未執行（1 skipped） |
| 反向故障測試 | 暫時只移除編譯輸出的 relatedChampions，兩階皆回到 `no-form`；原始碼依相同 SHA-256 還原，再跑模板測試通過，`mutation.log`、`mutation-receipt.json`、`restored.log` |
| 型別與 lint | shared、Editor、game-server 型別及修改檔案 eslint 通過；各自 `.log` |
| 實際 Editor | 127.0.0.1:5196，生成器 `1476928e`；由視覺編輯選取「變身」模板，第 1、4 階皆完成施放並有 `championForm`，詳見 `ui-receipt.json` |

畫面確認既有 `champ.thorne` 代理模型可顯示且明標共用替身。這是編輯器操作與變身機制驗證，不是原作模型、裝置效能或正式發布證明。瀏覽器文字匯出工具不支援本內嵌瀏覽器；收據逐字記錄可見狀態，未捏造截圖檔案。時間軸移至 5983 ms 後仍可重播，但 console 有 Babylon `postprocess+rgbdDecode` 重試逾時；根因尚未判定，不能把本次畫面檢查稱作零錯誤的完整視覺驗收。

## 出貨檢查與剩餘工作

`skills:check`、`editor:accept:release`、`coord:check` 已同批執行：Editor 592 項、型別、正式建置及 coord 21 份 packet 通過。全工作區 `pnpm typecheck` 亦通過。

skills 初次在上一日 15 列未對票停止；用 `ledger_table.py --map` 對到已查證的既有票或明確免開票理由，也補入當日 2 則並經官方工具重生成看板（`7ca30efe2`）。原訊息與時間未改，詳見 `ledger-map-receipt.json`。重跑後訊息帳本通過；後續在 `decor:check` 發現新增 `forms.ts` 使 corpusFiles 從 2512 增至 2513，已由 `pnpm decor:build` 更新兩份索引。自該失敗步驟接續全部剩餘檢查均通過，未重跑已通過的 Editor 測試。

因此 skills 的證據是 `skills-check-final.log` 中 decor 之前的成功步驟，加上 `skills-tail.log`／`skills-tail-receipt.json` 的剩餘成功步驟；不是宣稱某一次完整 skills 指令直接 exit 0。初次失敗亦保留在 `skills-check.log`。37 名的後續工作仍以 [集中執行目標](../editor-publication/README.md) 為準；部署版本、正式投稿發布及整合後完整對局尚未以本次單項修正驗證。

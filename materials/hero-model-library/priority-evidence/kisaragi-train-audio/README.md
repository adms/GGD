# 如月列車兩類鐵路音訊

使用者指定以日本 JR 山手線常見廣播與配樂補「嘲諷」「勝利」。網站標示的關門廣播與 JR 發車旋律各一段，完整轉成現有戰鬥音訊規格：MP3 128 kbps、44.1 kHz、單聲道，loudnorm I=-16 / TP=-1.5。沒有裁切或合成。

- 嘲諷：`content/assets/audio/voices/lines/b2-kisaragi/taunt.mp3`，約 7.22 秒。
- 勝利：`content/assets/audio/voices/lines/b2-kisaragi/victory.mp3`，約 10.03 秒。

`source-manifest.json` 保留擷取當下尚未綁定的快照；目前綁定以遊戲 MANIFEST 與本批收據為準。來源、成品逐檔 SHA 及處理參數見 [conversion.json](conversion.json)。`COMBAT_ORIGINALS.json` 是類別映射來源；用 `build-combat-lines.mjs --hero b2-kisaragi` 及 `index-lines.mjs` 重建 status 與遊戲 MANIFEST。原有九類成品及其 line 記錄不變，所有其他角色檔案保留。

網站與檔案標籤是目前內容歸屬證據，未宣稱已逐段聽審或確認現今使用頻率。音訊重用授權未確認；網站地圖的 CC 標示不適用於音源。音樂與未聽審廣播均標 `excludedFromSpeechInput=true`，不可自動當成角色語音合成輸入。

原始音源、網頁與準備材料保留本機並封存至 S3 legacy，完整 GetObject 讀回核對見 [s3-backup.json](s3-backup.json)。本分支成品待 Main 合併部署；不是正式站已更新的收據。

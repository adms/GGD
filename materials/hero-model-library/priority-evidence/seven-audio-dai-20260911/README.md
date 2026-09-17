# 七名 LOL 語音登記與達伊獨立武器元件

本批把既有七名 LOL 音訊交付納入中央語音索引，並接收兩份達伊獨立劍元件。沒有新購買、擴抓 LOL 名單、英雄預設、後台選項或部署變更。

## 成品與來源範圍

達伊來源為 `patreon-shinteo-dai-daz-v2`，Shinteo 的 JUMP FORCE 造型 Daz 社群改作，並非 Infinity Strash 原生擷取。完整角色仍缺 Genesis 身體；手持劍與背劍各自具有獨立完整幾何和內嵌貼圖，可以作為武器元件保存。

| 元件 | 成品 SHA-256 | 大小 |
|---|---|---:|
| 手持劍 | `9ad148092a0da2ed09fb2036e8ff7f76157827e164bc2f6632017aa34cb9a975` | 732,280 bytes |
| 背劍 | `756420793cb772ff4a00b5cd85f3ffaba251af5641136e24695e3b888c8cb4e9` | 732,224 bytes |

Git 路徑為 `content/assets/models/community/<SHA-256>.glb`。固定入口 `materials/asset-library/current-resources.json → modelComponents` 分別列出兩件 `resourceRole=weapon-prop`；來源的原包與部件儲備狀態保留。`fullHeroModel=false` 表示元件不構成完整英雄，既有 `relatedHeroIds` 僅供來源關聯，不是英雄綁定。

每件保留 1,854 三角面、2 個材質 draw primitives、7 張內嵌 256px 貼圖，骨架及動畫均為零。現行 GGD upload／budget 檢查沒有錯誤或警告；逐面幾何與 UV seam 比對通過，原生尺寸版及正規化版的獨立重建 SHA 相同。父整合工作流檢視手持正反面及背劍正面／斜面；斜面預覽略裁到劍尖，完整性以正面和原始幾何驗證核對。

保留的限制：未驗證 Daz 原渲染器的 layered gloss 或 tangent-space normal 完全等價；尚未配適英雄持握／背掛；沒有完整身體、原生動作、特效、音訊或後台可切換版本。原件、兩次轉換、工具與依賴保留本機及 S3 `legacy/`，Git 收錄成品與可重建程式。

## 七名 LOL 音訊

既有官方 `ja_JP / 16.18.8159717` 交付只涵蓋 Karthus、LeeSin、Lux、MissFortune、Warwick、Xerath、Yasuo。來源 ID 為 `lol-project-seven-ja-jp-16.18.8159717`。

| 角色 | WAV |
|---|---:|
| Karthus | 225 |
| LeeSin | 1,069 |
| Lux | 1,142 |
| MissFortune | 695 |
| Warwick | 531 |
| Xerath | 223 |
| Yasuo | 1,042 |

共 4,927 WAV、113 原生 banks、4,927 WEM；WAV 為 5,429,873,080 bytes／18,611.429 秒。本批是中央登記及備份，不是新取得或遊戲音訊成品。2,264 個 float WAV 含超過 unity 的取樣，需聽審及音量處理；聲優、逐句語言及技能事件未核實，`synthesisReady=false`。

七名新增 4,927 筆來源關係，448 個本機路徑已由舊來源登記；因此新增可查詢路徑是 4,479 個。固定語音索引分開列 `sourceFileRelationshipRows`、`uniqueLocalPaths`、`uniqueSha256Payloads`，不將重複來源關係當作新檔案。這批與既有 47 個 prefetch aliases 不重疊，仍新增以路徑和 group ID 配對的回歸測試，避免未來同路徑跨來源誤配。

封存只讀固定 `allFiles` 加逐位元相同的交付 JSON，共 15,691 個檔案；沒有遞迴封存全角色來源根目錄。取得、封存與解碼原檔均保留；下載範圍守門、交付 SHA、manifest SHA、逐檔 SHA、完整 S3 讀回及 receipt 身分均由程式檢查。

## 固定查詢入口

以中央 `download-sources.json`、`public-source-files.json`、`voice-index.json` 與 `voice-files.jsonl.gz` 為準。本目錄是這一批驗證證據，不是另一份可變素材清單。語音的本機絕對根目錄在 `voice-index.json` 的 `backups[backupId].absoluteLocalRoot`；逐檔路徑及 SHA 在 `voice-files.jsonl.gz`。也可使用既有 `query_voice.py` 依七名角色或來源 ID 查詢。

`audit-summary.json` 及模型／音訊核對檔是分支 `b5fd4fd0` 時的只讀稽核快照；它們不能證明完整原生動作、聲優身份或部署。它們確認 81 份啟用模型 GLB 和 81 份模型文件的 SHA，以及 486 份技能文件所引用的 62 個 VFX key 存在。六態映射不等於六段原生動作，文件 key 存在不等於特效視覺或遊戲驗收。

本批完整驗證結果及 S3 收據在同目錄的 `validation.json`；全專案 release 狀態以該批紀錄為準，不由單項測試、Git push 或 S3 upload 推論部署。

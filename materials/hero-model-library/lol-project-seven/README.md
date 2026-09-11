# LOL 專案七角色日文音訊

範圍固定為 Karthus、LeeSin、Lux、MissFortune、Warwick、Xerath、Yasuo；project-seven-config.json 是供 Git 保存的精簡設定。control/allowlist.json 是本機執行控制，不可自行擴為全角色或英文。

本輪只允許下載 LeeSin、Lux、Warwick、Yasuo。其餘三名沿用已取得資料，原始 CDN chunks、WAD、native banks、WEM、PCM 與歷史交付全保留。停止前取得的其他角色不刪除，也不納入這份七角色交付。

## 重現命令

需要既有 Python 環境的 CDTB 與 pyzstd、已固定的 hashes.game.txt、vgmstream-cli r2117。工具不安裝系統程式，也不執行遊戲或 MOD。來源為公開官方 release 7CAC3C60C863BF12、16.18.8159717、ja_JP；沒有使用登入憑證。

在此 metadata 目錄執行：

```sh
/private/tmp/ggd-lol-assets-venv/bin/python tools/run_project_ja.py \
  --control control/allowlist.json \
  --metadata-root . \
  --hashes /private/tmp/ggd-lol-hashes/hashes.game.txt \
  --decoder /private/tmp/ggd-vgmstream-r2117/cli/vgmstream-cli
```

原包已完整時可加 `--skip-fetch`。搬到別的工作區時，用 `--source-root` 指向保留原包與 audio 子目錄的來源根；不要改為未授權英雄。不得用 Python `-O` 關閉完整性檢查。

## 取用與狀態

完成後 latest-seven-delivery-receipt.json 指向不可變 deliveries/local-audio-delivery-*.json。其 localRoot 指向來源根，files[].path 是相對來源根的 PCM 路徑，audioGroups 含專案 heroIds。seven-voice-index.json 是便於其他工作流讀取的七名索引。它們引用既有檔案，不重製音訊或更改舊交付。

git-handoff-files.json 列出窄版 Git 交付：程式、設定、精簡索引、SHA 與文件。含逐檔詳情的完整 delivery JSON 另留本機，精簡索引用路徑與 SHA 引用，交主工作流決定備份位置；實際音訊／WAD 依主工作流儲存規則處理，本輪不執行 Git 或 S3 操作。native banks、event 關聯、語系來源標記、逐段聽審是不同狀態；PCM 檔數不代表已確認角色台詞數。

本輪僅 ja_JP 來源語系已由 manifest 確認；未逐段聽審、未確認說話者、未轉錄、未整理為可合成資料集。Float32 保留超過 1 的原始峰值，播放或轉整數格式前由使用者記錄 gain 決策。

## 原生事件映射

`control/shared-event-metadata.json` 固定七名角色與同一 Riot release。`tools/acquire_shared_event_metadata.py` 只擷取指定 shared WAD 的目錄及 skin BIN 所需官方 chunks，驗證 RMAN 大小、WAD 3.4 entry checksum、解碼大小與 SHA-256；稀疏擷取不代表完整 shared WAD 已取得。`tools/build_event_bindings.py` 再把 BIN 事件名稱經 `_events.bnk` HIRC 圖對應到同形態 WPK 的 WEM 與既有 Float32 WAV。

七名指定英雄的 base／skin0 均已建立事件證據，合計 232 個原生事件、754 個事件對應 WAV：Karthus 35／135、LeeSin 50／151、Lux 39／104、MissFortune 9／35、Warwick 46／159、Xerath 24／79、Yasuo 29／91。每份 `event-bindings/*-base.json` 的 `eventBindingsVerified=true` 只證明該基礎造型的原生事件圖關係。`abilitySlotCandidate` 來自固定控制檔中的原生事件名稱 token，還不是 GGD 技能綁定；其他造型、逐段語言、說話者、台詞與聽審仍為 false／pending。中央索引由 `tools/hero-model-library/voice_index.py` 讀取這些報告重建，不能只手改 `voice-files.jsonl.gz`。

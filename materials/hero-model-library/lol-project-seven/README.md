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

本機實檔驗證入口為 [local-file-verification/README.md](local-file-verification/README.md) 與 [local-file-verification/index.json](local-file-verification/index.json)。七名合計 4,927 個 WAV 已逐檔核對存在、bytes 與 SHA-256，缺檔及不符均為 0；這項驗證不取代逐段語言、說話者、台詞、事件、合成用途或 runtime 聽審。

git-handoff-files.json 列出窄版 Git 交付：程式、設定、精簡索引、SHA 與文件。含逐檔詳情的完整 delivery JSON 另留本機，精簡索引用路徑與 SHA 引用，交主工作流決定備份位置；實際音訊／WAD 依主工作流儲存規則處理，本輪不執行 Git 或 S3 操作。native banks、event 關聯、語系來源標記、逐段聽審是不同狀態；PCM 檔數不代表已確認角色台詞數。

本輪僅 ja_JP 來源語系已由 manifest 確認。戰鬥候選的 311 檔已由使用者逐項聽審並確認說話者、日文、原生事件用途與保留來源增益；其餘 443 個事件關聯檔仍未核准。全庫仍未轉錄，也未整理為可合成資料集。Float32 原始檔完整保留，runtime 另產生 44.1 kHz mono 128 kbps MP3，不覆寫來源。

## 原生事件映射

`control/shared-event-metadata.json` 固定七名角色與同一 Riot release。`tools/acquire_shared_event_metadata.py` 只擷取指定 shared WAD 的目錄及 skin BIN 所需官方 chunks，驗證 RMAN 大小、WAD 3.4 entry checksum、解碼大小與 SHA-256；稀疏擷取不代表完整 shared WAD 已取得。`tools/build_event_bindings.py` 再把 BIN 事件名稱經 `_events.bnk` HIRC 圖對應到同形態 WPK 的 WEM 與既有 Float32 WAV。

七名指定英雄的 base／skin0 均已建立事件證據，合計 232 個原生事件、754 個事件對應 WAV：Karthus 35／135、LeeSin 50／151、Lux 39／104、MissFortune 9／35、Warwick 46／159、Xerath 24／79、Yasuo 29／91。每份 `event-bindings/*-base.json` 的 `eventBindingsVerified=true` 只證明該基礎造型的原生事件圖關係。`listening-review-decisions.json` 另外保存已核准的 311 個戰鬥候選；未列入決策的片段及其他造型仍為 pending。中央索引由 `tools/hero-model-library/voice_index.py` 讀取報告、決策與 runtime 註冊收據重建，不能只手改 `voice-files.jsonl.gz`。

逐檔聽審入口為 [listening-review-queue.md](listening-review-queue.md)、`listening-review-queue.json` 與可播放的 [listening-review.html](listening-review.html)，驗證收據為 `listening-review-receipt.json`。佇列會重新核對 754 個本機 WAV 的大小與 SHA-256，並保留原生事件、類別與技能槽候選；人工結果只寫入 `listening-review-decisions.json`，再由 `tools/build_listening_review_queue.py` 重建。未聽審的片段不會啟用 runtime，也不會把 Joke、Death 或技能事件改成另一種用途。

用以下命令啟動本機審查頁，再開啟 `http://127.0.0.1:8765/`：

```sh
python3 materials/hero-model-library/lol-project-seven/tools/serve_listening_review.py \
  --asset-workspace "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT"
```

頁面預設只顯示 Q／W／E／R、攻擊與死亡的戰鬥候選，可切換全部原生用途或全部 754 檔。它逐檔播放、逐檔寫入核准／拒絕／待更多上下文決定；正式核准同時記錄說話者、實際語言、原生事件用途及增益。伺服器只監聽 loopback 並只供應佇列已登記的 WAV。

已核准戰鬥項目由下列命令轉換並註冊。固定映射只有 `ability-Q/W/E/R → skill-name.q/w/e/r`、`attack → attack-light`、`death → defeat`；不從檔名或時長推定 hurt、crit、kill 或其他事件。`runtime-registration.json` 記錄 311 個來源／輸出 SHA-256、runtime 類別與 manifest 讀回驗證。Karthus 的 Q 與 MissFortune 的 E 沒有單一原生事件候選；Xerath 的 4 個 Q 來源同時對應技能與其他事件類別，維持未註冊。七人都沒有 EX 原生候選，以上缺口不猜配。

```sh
python3 materials/hero-model-library/lol-project-seven/tools/apply_approved_battle_runtime.py \
  --asset-workspace "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT"
```

`runtimeApproved=311` 與 `runtimeRegistered=311` 表示核准及本分支 runtime manifest 註冊完成；`productionDeployed=false`，不能把這份本機／Git 交付稱為正式站已部署。

交付索引由 `tools/make_seven_handoff.py` 重建。在隔離 worktree 執行時，使用 `--metadata-link-root` 指定整合 checkout 的固定共編路徑，避免把暫存 worktree 路徑寫入 `seven-voice-index.json` 與收據。

核准後的範圍稽核由 `tools/audit_approved_battle_runtime.py` 重建。它會逐檔核對已核准來源 WAV 與 runtime MP3 的 bytes／SHA-256、MP3 44.1 kHz mono 容器、Git index blob、`COMBAT_ORIGINALS.json`、runtime manifest 與中央語音索引；可重現收據為 `runtime-audit.json`。

```sh
python3 materials/hero-model-library/lol-project-seven/tools/apply_approved_battle_runtime.py \
  --asset-workspace "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT" --check
python3 materials/hero-model-library/lol-project-seven/tools/audit_approved_battle_runtime.py \
  --asset-workspace "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT"
```

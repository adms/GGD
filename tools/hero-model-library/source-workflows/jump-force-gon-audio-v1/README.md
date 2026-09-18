# JUMP FORCE 小傑音訊候選

這個流程從中央 `voice-files.jsonl.gz` 固定 `chr0300` 的兩組已解碼音訊：

- `chr0300_ActVoice`：225 段 OGG；
- `130300_chr0300_EvnVoice`：25 段 WAV。

原生目錄可以證明它們屬於 Gon 角色 family 並區分 `ActVoice` / `EvnVoice`，但不能證明每段的說話者、語言、台詞或 Q/W/E/R 事件。Owner 於 2026-09-15 核准的是角色群抽樣分類，原收據也明記 `runtimeBindingAuthorized=false`。

重建並在本機重算 250 檔 SHA-256：

```bash
python3 tools/hero-model-library/source-workflows/jump-force-gon-audio-v1/build.py --write --verify-local
```

只使用 Git 內索引驗證漂移：

```bash
python3 tools/hero-model-library/source-workflows/jump-force-gon-audio-v1/build.py --check
python3 -m unittest tools/hero-model-library/source-workflows/jump-force-gon-audio-v1/test_build.py
```

產物：

- `priority-evidence/jump-force-gon-audio-v1/files.jsonl.gz`：250 段候選的來源路徑、SHA-256、時長與審查狀態；
- `receipt.json`：逐檔本機讀回驗證與中央索引輸入收據；
- `runtime-candidate-registration.json`：後端整合邊界。沒有核准事件的檔案不會被假裝成已綁定的戰鬥語音。

這些檔案可直接供後續逐段聽審。審查結果需固定 candidate ID 和 source SHA，再由整合器建立 runtime 事件；不用檔名編號猜技能。

# J-Stars owner archive 唯讀擷取盤點

這個工作流只讀盤點 `J-Stars Victory Vs+.7z` 與其內含 ISO，產生可重跑的 extraction receipt。它不修改原始檔；若 7-Zip 不支援將 ISO 透過 stdin 二次解析，可將已解出、保留在素材庫的 ISO 用 `--materialized-iso` 傳入。

擋案會記錄：

- owner archive 絕對路徑、大小與 SHA-256。
- 7z 成員清單；若包內有 ISO，以 pipe 直接串流列出 ISO 內容。
- 從 `PS3_DISC.SFB` / `PS3_GAME/` 等結構辨識平台與 VS+ 版本。
- 從路徑提取 `character_model_018_*`、`chr0300` 類的原生角色 token；只記錄 token，不推測角色身分。

預設會檢查素材庫 intake、Downloads 與 Desktop：

```bash
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/inventory.py
```

若檔案在其他位置，傳入絕對路徑：

```bash
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/inventory.py \
  --archive "/absolute/path/J-Stars Victory Vs+.7z" \
  --materialized-iso "/absolute/path/J-Stars Victory Vs+.iso" \
  --param-sfo "/absolute/path/PS3_GAME/PARAM.SFO"
```

PS3 盤內容會先分離成 7 個 CRI CPK 容器。`cpk_inventory.py` 可解密 CPK/TOC 的 `@UTF` 表，並對每個成員的原始 stored bytes 計算 SHA-256；它不會修改 CPK，也不會把尚未解碼的成員冒稱轉換成品。

```bash
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/cpk_inventory.py
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/cpk_inventory.py --check
```

完整逐成員 manifest 是大型解析產物，保留於 `GGD-Asset-Library/conversions/jstars-owner-archive-extract-v1/cpk-members.jsonl.gz`；Git 中只放它的位置、哈希、統計、原生 ID 群組與六名優先角色證據。

有原生數字 token 的 CPK 成員會另外安全分離到 `native-token-members/<token>/`，並逐組寫入 manifest。`cmp_probe.py` 再對其中 `$CMP` 逐檔列出 `$CL0/$CLH`，保留最小 `$CLH/$CH0` 失敗樣本，並用已封存的 QuickBMS 0.12.0 + `cmp_scz.bms` 對奇犚 `018` 跑一次可重現探測。解出的 STPK 若小於容器宣告解碼尺寸，只記為 partial output。

```bash
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/cmp_probe.py
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/cmp_probe.py --check
```

`identity_probe.py` 對 56 組 `character_model_<id>_m.pak` 重跑相同 QuickBMS 探測，只從 partial STPK index 的內部 `<id>_<name>` 成員名取得身分。它會保留每組 partial output 與雜湊，但不會將 partial index 寫成完整模型或轉換成品。

```bash
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/identity_probe.py
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/identity_probe.py --check
```

目前六名唯一對應是銀時 `028`、神眉 `041`、小傑 `017`、奇犍 `018`、幸運超人 `037`、飛影 `012`。這只確立原生 token 身分；六名的完整模型仍受 `$CMP/$CH0` 與 PS3 SRD/SRDI/SRDV 轉換擋住。

六名的 `sound/JP/CV_*`、`PV_*` ACB/AWB 不經 `$CMP`。`audio_extract.py` 會安全拆分 AFS2、保留 HCA，並用本機 FFmpeg HCA decoder 產生確定性的 PCM WAV 聽審副本。ACB 內的數字 cue 名會逐檔保留，但程式不猜技能事件或說話者；在 owner 聽審前仍不可寫 runtime 綁定。

```bash
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/audio_extract.py
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/audio_extract.py --check
python3 -m unittest tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/test_audio_extract.py
```

完整 HCA、WAV 與逐檔 manifest 保留於 `GGD-Asset-Library/conversions/jstars-priority-audio-v1/`；Git 只存摘要收據與其 SHA-256。

沒有檔案時仍會產生 `blocked-archive-not-found` 收據與完整重跑指令。檔案出現後重跑同一指令即可更新。

驗證：

```bash
python3 -m unittest tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/test_inventory.py
python3 -m unittest tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/test_cpk_inventory.py
python3 -m unittest tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/test_cmp_probe.py
python3 -m unittest tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/test_identity_probe.py
python3 -m unittest tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/test_audio_extract.py
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/inventory.py --check
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/cpk_inventory.py --check
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/cmp_probe.py --check
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/identity_probe.py --check
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/audio_extract.py --check
```

固定產出：

```text
materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/receipt.json
materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/cpk-inventory.json
materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/cmp-probe.json
materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/identity-probe.json
materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/audio-extract.json
```

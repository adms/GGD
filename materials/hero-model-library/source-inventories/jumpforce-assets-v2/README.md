# JUMP FORCE 已取得素材、角色群與抽取狀態

本頁由 `build_inventory.py` 從中央來源、逐檔備份清單、Steam PAK 索引與本機實檔重建。包名、原生 `chrNNNN` 與 bank 標籤只證明來源群組；不證明每段音訊的說話者、語言、台詞或技能事件。

## 本批核對結果

- 公開音訊原包：58 包，57 個角色標籤包＋1 個共用音效包；本機重新 SHA-256 通過 58/58。
- 公開音訊檔：15,207 檔，約 7.33 小時；數量沿用中央逐檔索引與已讀回備份，不等於已聽審語音句數。
- Steam 原生 Streaming：43 個 AWB，已解碼 4,034 WAV；來源標籤分類為語音候選 1,794、音效 2,170、音樂 70。
- 角色身份交叉表：32 個原生 ID 可直接連到公開角色群；5 個原生 ID 尚未確認，沒有送入角色聽審佇列。
- 可聽審角色群：89 組（公開角色包 57＋Steam 原生角色群 32）；逐段說話者／事件已自動綁定 0。

## 模型、骨架、動作與特效

| 範圍 | 模型／貼圖／骨架 | 動作 | VFX | 狀態 |
| --- | --- | --- | --- | --- |
| Steam 六個 PAK | 索引有 13,437 個現行 character paths | animation-package 索引 1；未解析角色動作 | 索引有 57,870 個現行 VFX paths | 共享卷未掛載；只沿用固定容器 SHA 與完整路徑索引 |
| 達伊 `chr0430` | 已抽出 1,942 個原生套件、11 個蒙皮元件、36 PNG、159 joints；v1 7,947 面已被 owner 拒絕；v2 7,930 面／256px | 原生 clips 0 | 套件已抽出，未解析／未轉 GGD | v2 結構驗證通過、owner 新畫面待審；20 draw > 6，未註冊 |
| Asta `chr0420`／Kenshiro `chr0230` | PAK 路徑已索引 | 路徑已索引，未抽出 | 路徑已索引，未抽出 | 本機及 S3 沒有這兩名的已凍結 payload，待共享卷再次掛載 |

## 可直接核對的角色群

| 原生 ID | 角色群 | 公開群組 | Steam 檔數 | 公開檔數 |
| --- | --- | --- | ---: | ---: |
| `chr0000` | Goku | `parallel-ps-jumpforce-local-second10:jumpforce-goku` | 161 | 228 |
| `chr0010` | Vegeta | `parallel-ps-jumpforce-local-second10:jumpforce-vegeta` | 33 | 222 |
| `chr0020` | Trunks | `parallel-ps-jumpforce-local-second10:jumpforce-trunks` | 68 | 220 |
| `chr0030` | Frieza | `parallel-ps-jumpforce-local-second10:jumpforce-frieza` | 60 | 211 |
| `chr0040` | Piccolo | `parallel-ps-jumpforce-local-second10:jumpforce-piccolo` | 56 | 220 |
| `chr0050` | Cell | `parallel-ps-jumpforce-local-10:jumpforce-cell` | 16 | 219 |
| `chr0060` | Luffy | `parallel-ps-jumpforce-local-next32:jumpforce-luffy` | 144 | 227 |
| `chr0070` | Zoro | `parallel-ps-jumpforce-local-next32:jumpforce-zoro` | 15 | 216 |
| `chr0080` | Sanji | `parallel-ps-jumpforce-local-next32:jumpforce-sanji` | 73 | 313 |
| `chr0090` | Blackbeard | `parallel-ps-jumpforce-local-next32:jumpforce-blackbeard` | 30 | 215 |
| `chr0100` | Hancock | `parallel-ps-jumpforce-local-next32:jumpforce-hancock` | 15 | 265 |
| `chr0110` | Sabo | `parallel-ps-jumpforce-local-next32:jumpforce-sabo` | 20 | 213 |
| `chr0120` | Naruto | `parallel-ps-jumpforce-local-next32:jumpforce-naruto` | 119 | 218 |
| `chr0130` | Sasuke | `parallel-ps-jumpforce-local-next32:jumpforce-sasuke` | 19 | 225 |
| `chr0140` | Kaguya | `parallel-ps-jumpforce-local-next32:jumpforce-kaguya` | 2 | 224 |
| `chr0150` | Gaara | `parallel-ps-jumpforce-local-next32:jumpforce-gaara` | 34 | 231 |
| `chr0160` | Kakashi | `parallel-ps-jumpforce-local-next32:jumpforce-kakashi` | 7 | 226 |
| `chr0170` | Boruto | `parallel-ps-jumpforce-local-10:jumpforce-boruto` | 1 | 213 |
| `chr0240` | Ichigo | `parallel-ps-jumpforce-local-10:jumpforce-ichigo` | 28 | 222 |
| `chr0260` | Aizen | `parallel-ps-jumpforce-local-10:jumpforce-aizen` | 10 | 239 |
| `chr0270` | Rukia | `parallel-ps-jumpforce-local-10:jumpforce-rukia` | 15 | 213 |
| `chr0300` | Gon | `parallel-ps-jumpforce-local-next32:jumpforce-gon` | 25 | 225 |
| `chr0310` | Killua | `parallel-ps-jumpforce-local-second10:jumpforce-killua` | 18 | 226 |
| `chr0320` | Kurapika | `parallel-ps-jumpforce-local-second10:jumpforce-kurapika` | 17 | 251 |
| `chr0330` | Hisoka | `parallel-ps-jumpforce-local-second10:jumpforce-hisoka` | 17 | 215 |
| `chr0360` | Yusuke | `parallel-ps-jumpforce-local-next32:jumpforce-yusuke` | 15 | 215 |
| `chr0370` | Toguro | `parallel-ps-jumpforce-local-next32:jumpforce-toguro` | 9 | 212 |
| `chr0410` | Deku | `parallel-ps-jumpforce-local-next32:jumpforce-deku` | 16 | 210 |
| `chr0420` | Asta / 亞斯塔 | `parallel-ps-jumpforce-audio:JForce_Asta` | 6 | 223 |
| `chr0450` | Kane | `parallel-ps-jumpforce-local-final3:jumpforce-kane` | 143 | 213 |
| `chr0460` | Galena | `parallel-ps-jumpforce-local-next32:jumpforce-galena` | 89 | 224 |
| `chr0470` | Prometheus | `parallel-ps-jumpforce-local-next32:jumpforce-prometheus` | 77 | 233 |

## 明確缺口

- `chr0430` 原始 review GLB 獨立保留：76,796,608 bytes，SHA-256 `53b3b19eb04e2eb0e6d1827122f5b41a403c2ced188bd3042371c9dec80cd810`。完整抽出樹共 2,000 files／299,020,729 bytes（native packages 1,942、model components 11、textures 36）；v1 與 v2 也各自保存，沒有覆蓋原件。
- `/Volumes/common` 與 `/Volumes/game` 本批均未掛載，沒有重新讀取六個 PAK，也沒有從 metadata 假裝取得 payload。
- 六個 PAK 的既有目錄索引由已授權流程建立；本批不保存、不輸出、不重新要求 AES 金鑰。
- v1（7,947 面／256px）原收據的人工 accepted 已被 owner 於 2026-09-15 明確拒絕；原因是臉部貼圖及眼睛不正常。v1 不再算有效視覺驗收。
- v2 已從 59,768 降至 7,930 面、貼圖 2048px 降至 256px；雙重建置 SHA 相同、159 joints／蒙皮／材質槽保留、Khronos 0 error，眼部透明層技術修復通過。owner 已授權資源發布，但新 v2 畫面仍待視覺品質審查。
- v2 仍有 20 draw；現有安全 atlas 只適用 2/20 primitives，精確材質語意至少 11 組，無法達到 hard limit 6。原生 animations 為 0；未註冊、不可切換、未部署。
- 達伊目前沒有任何原生 gameplay clip；即使 draw call 後續修正，也不能直接登記成完整六態後台模型。
- 達伊 VFX／PAK 音訊套件尚未解析。另有的 261 OGG 公開包及 Steam Streaming 音訊是獨立來源，不能冒充 PAK 事件綁定完成。
- 公開 58 包中 `_Common Sounds` 是共用音效包，不是第 58 名角色。
- 說話者、語言、逐字稿、音效事件、技能事件及 runtime 綁定全部維持待人工聽審。

## 重建與檢查

```bash
node --import tsx tools/hero-model-library/source-workflows/jumpforce-assets-v2/audit_dai_candidate.mts --glb ../GGD-Asset-Library/converted/jump-force-steam-dai-v1/dai-chr0430-review-v4.glb --output materials/hero-model-library/source-inventories/jumpforce-assets-v2/dai-current-policy.json
python3 tools/hero-model-library/source-workflows/jumpforce-assets-v2/build_inventory.py --workspace ..
python3 tools/hero-model-library/source-workflows/jumpforce-assets-v2/build_inventory.py --workspace .. --check
```

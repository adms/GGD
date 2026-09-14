# Fate/unlimited codes PSP 素材來源盤點

> 本文件由 `build_psp_asset_audit.py` 逐檔讀取本機 manifest、SHA-256 與候選收據生成。PSP、PS2、平台未核社群 MOD 永久分列；取得或標準 GLB 候選不等於後台可切換或正式站上架。

## 結果

- PSP 原作映像：Windows 清單 2 筆；本機 payload 0、已解包 0、原生模型／動作／VFX／音訊轉換均為 0。
- PSP 已核平台的社群補充：1 組，103 張替換 PNG；其中 FUC 原生 FPK/GMO 包 0。
- 平台未核社群 MOD：6 組；標準 GLB 候選 13 顆（SHA 驗證 13），骨架候選 13，MOD 動作項 349，FUC 原生動作證據 0。
- 音訊：PS2 公開 WAV 653；平台未核角色音訊 56；另有音樂 60，不列入語音。所有說話者、語言與事件仍待聽審。
- 本機逐檔 SHA：2440 檔／789487979 bytes；S3 讀回收據 10/10 組。

## 來源分流

| 來源 ID | 平台證據 | 模型／骨架 | 動作（原生 FUC） | 替換貼圖 | 音訊 | 狀態 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `spritedatabase-fate-ps2-archer` | confirmed-ps2-supplemental | 0／0 | 0（0） | 0 | 180 | acquired/indexed；runtimeSelectable=false |
| `spritedatabase-fate-ps2-saber` | confirmed-ps2-supplemental | 0／0 | 0（0） | 0 | 251 | acquired/indexed；runtimeSelectable=false |
| `spritedatabase-fate-ps2-shirou` | confirmed-ps2-supplemental | 0／0 | 0（0） | 0 | 222 | acquired/indexed；runtimeSelectable=false |
| `github-udienzebeer-fate-uc-hd-c8c2d52b` | confirmed-psp-supplemental | 0／0 | 0（0） | 103 | 0 | acquired/indexed；runtimeSelectable=false |
| `gamebanana-fate-bgm-dnf-62195` | platform-unverified-community-supplemental | 0／0 | 0（0） | 0 | 60 | acquired/indexed；runtimeSelectable=false |
| `gamebanana-fuc-dark-sakura-492607` | platform-unverified-community-supplemental | 2／2 | 0（0） | 0 | 15 | acquired/indexed；runtimeSelectable=false |
| `gamebanana-fuc-kotomine-kirei-291438` | platform-unverified-community-supplemental | 1／1 | 349（0） | 0 | 0 | acquired/indexed；runtimeSelectable=false |
| `gamebanana-fuc-rin-474593` | platform-unverified-community-supplemental | 4／4 | 0（0） | 0 | 12 | acquired/indexed；runtimeSelectable=false |
| `gamebanana-fuc-shirou-473819` | platform-unverified-community-supplemental | 4／4 | 0（0） | 0 | 16 | acquired/indexed；runtimeSelectable=false |
| `gamebanana-zero-lancer-493444` | platform-unverified-community-supplemental | 2／2 | 0（0） | 0 | 13 | acquired/indexed；runtimeSelectable=false |

## 原作 PSP 缺口

日版 ZIP 與美版 ISO 目前仍只有 `E:\Game\單機遊戲` 的 Windows 清單紀錄；這台 Mac 沒有可讀 payload，因此沒有內容 SHA、FPK/GMO/GIM 成員清單或角色 ID。取得唯讀掛載後先跑 `scan_local_payloads.py`，再用 `extract_disc_payload.py` 建獨立版本 intake。

Kirei 的 349 個動作項來自 Sven/GoldSrc MOD；其 `fateOriginalMotionCount=0`。13 顆 GLB 是五名角色的社群 MOD 轉換候選，來源平台未核，不能寫成 PSP 原生模型。103 張 PNG 是 PPSSPP 替換貼圖／介面素材，沒有模型、骨架、原生動作或 VFX。

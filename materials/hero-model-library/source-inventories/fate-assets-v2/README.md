# Fate 素材平台分流與 14 名英靈整合狀態

本頁由 `build_inventory.py` 從 Fate/Unlimited Block Works、Fate/unlimited codes 平台索引、現行模型限制與本機實檔重建。Minecraft 社群模型與 PSP／PS2 原遊戲來源永久分開；專案候選註冊核准與上游授權分欄保存，後台可切換也不代表正式站已部署。

## 結果

- FateUBW Minecraft 英靈：14 名；來源模型／貼圖／動作各 14/14/14 檔重新 SHA-256 通過。
- 標準化模型：14 顆本機 GLB 通過逐檔 SHA；現行 hard policy 14/14；14 顆已釘入 Git 成品庫。上游 ARR 另記，專案候選註冊核准 14。
- 原生來源動作：132 段，已轉 127，另 5 段無來源時長；14 名已用同來源片段補齊六態映射，明確標示語意替代。
- 後台候選：4 名已對應角色、5 個英雄 ID 可選；全部 `automaticEligible=false`，不搶既有預設。其餘 10 名保留待設計。
- FUC PSP：2 筆遠端盤點，實際讀取 0 bytes、解包 0；維持 metadata-only。
- FUC 補充素材：10 組本機來源逐檔 SHA 通過 2440 檔；平台未核社群 MOD 有 13 顆標準 GLB／349 個 MOD 動作項，PSP 已核來源只有 103 張替換貼圖。原生 FUC 包／動作／VFX 都是 0。
- FUC 其他平台／社群補充來源：10 筆；PS2 公開音訊 653 檔，與 PSP 原遊戲 payload 分列。

## FateUBW 14 名逐角狀態

| 原生角色 ID | 作者名稱 | 對應 GGD 英雄 | 面／draw／貼圖／通道 | 動作 | 六態缺口 | 註冊狀態 |
| --- | --- | --- | --- | --- | --- | --- |
| `artoria_pendragon_saber` | Artoria Pendragon (Saber) | `godie-e002`, `godie-e00l` | 336／1／128px／17 | 10/10；六態同來源替代 | 無 | 後台候選可選 |
| `cu_chulainn_lancer` | Cu Chulainn (Lancer) | 待設計英雄 | 336／1／128px／19 | 7/8；六態同來源替代 | 無 | Git 成品；待建立英雄定義 |
| `diarmuid_ua_duibhne_lancer` | Diarmuid Ua Duibhne (Lancer) | 待設計英雄 | 336／1／128px／19 | 7/8；六態同來源替代 | 無 | Git 成品；待建立英雄定義 |
| `emiya_archer` | Emiya (Archer) | 待設計英雄 | 336／1／128px／19 | 11/11；六態同來源替代 | 無 | Git 成品；待建立英雄定義 |
| `gilgamesh_archer` | Gilgamesh (Archer) | `community-review-18-20260907` | 336／1／128px／17 | 9/9；六態同來源替代 | 無 | 後台候選可選 |
| `gilles_de_rais_caster` | Gilles de Rais (Caster) | 待設計英雄 | 336／1／128px／7 | 4/4；六態同來源替代 | 無 | Git 成品；待建立英雄定義 |
| `hassan-i-sabbah_assassin` | Hassan-i-Sabbah (Assassin) | 待設計英雄 | 336／1／128px／17 | 8/8；六態同來源替代 | 無 | Git 成品；待建立英雄定義 |
| `heracles_berserker` | Heracles (Berserker) | `godie-hapm` | 480／1／128px／19 | 16/17；六態同來源替代 | 無 | 後台候選可選 |
| `iskander_rider` | Iskander (Rider) | 待設計英雄 | 336／1／128px／17 | 9/9；六態同來源替代 | 無 | Git 成品；待建立英雄定義 |
| `lancelot_berserker` | Lancelot (Berserker) | 待設計英雄 | 336／1／128px／18 | 13/13；六態同來源替代 | 無 | Git 成品；待建立英雄定義 |
| `medea_caster` | Medea (Caster) | 待設計英雄 | 456／1／128px／18 | 6/7；六態同來源替代 | 無 | Git 成品；待建立英雄定義 |
| `medusa_rider` | Medusa (Rider) | `godie-hvsh` | 336／1／128px／20 | 11/11；六態同來源替代 | 無 | 後台候選可選 |
| `nero_claudius_saber` | Nero Claudius (Saber) | 待設計英雄 | 336／1／128px／21 | 6/6；六態同來源替代 | 無 | Git 成品；待建立英雄定義 |
| `sasaki_kojiro_assassin` | Sasaki Kojiro (Assassin) | 待設計英雄 | 336／1／128px／18 | 10/11；六態同來源替代 | 無 | Git 成品；待建立英雄定義 |

## 平台界線

- `Fate/Unlimited Block Works`：Flemmli97 的 Minecraft Java 1.21.1 社群實作，來源版 2.2.0、commit `07e9d79b...`、授權標示 ARR；不是 Fate/unlimited codes PSP 原作模型。
- `Fate/unlimited codes` PSP：目前只有 Windows 清單中的日版 ZIP 與美版 ISO 名稱／記錄大小，Mac 本機沒有 payload，沒有讀取 SHA、內容檢查、解包或轉換。
- PS2：目前取得的是 Sprite Database 的 Archer／Shirou／Saber 公開音訊集合；不是 PS2 光碟映像，也沒有模型／骨架／動作／VFX。
- GameBanana 等補充來源按各自未知／PC MOD 平台保存，不能據此推定 PSP 或 PS2 原生出處。

## 註冊結論

14 顆 Minecraft 候選都通過現行模型 hard policy 與 10,000 面減面觸發規則，並已作為獨立成品與模型文件釘入 Git。已有英雄定義的 4 名建立 5 個候選選項；10 名未杜撰英雄 ID，保留待設計。上游 ARR 與專案註冊核准分欄保存，沒有把專案核准寫成上游授權。

六態映射全部引用 GLB 內既有來源片段；缺精確 idle／run／hurt／death 名稱者採同來源語意替代，death 可沿用使用者核准的受傷＋淡出呈現。這些欄位不冒稱來源原生事件名稱。

## 重建

```bash
node --import tsx tools/hero-model-library/source-workflows/fate-assets-v2/audit_candidates.mts
python3 tools/hero-model-library/source-workflows/fate-assets-v2/register_runtime_options.py
python3 tools/hero-model-library/build_priority_runtime_catalog.py
python3 tools/hero-model-library/source-workflows/fate-assets-v2/register_backend_options.py
python3 tools/hero-model-library/source-workflows/fate-assets-v2/build_inventory.py --workspace ..
python3 tools/hero-model-library/verify_fateubw_reserve.py --workspace ..
```

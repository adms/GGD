# Fate 素材平台分流與 14 名英靈整合狀態

本頁由 `build_inventory.py` 從 Fate/Unlimited Block Works、Fate/unlimited codes 平台索引、現行模型限制與本機實檔重建。Minecraft 社群模型與 PSP／PS2 原遊戲來源永久分開；通過模型限制不代表取得再散布權、動作事件已核准、後台可切換或正式站已部署。

## 結果

- FateUBW Minecraft 英靈：14 名；來源模型／貼圖／動作各 14/14/14 檔重新 SHA-256 通過。
- 標準化模型：14 顆本機 GLB 通過逐檔 SHA；現行 hard policy 14/14，但授權核准 0、事件映射完成 0、後台可切換 0。
- 原生來源動作：132 段，已轉 127，另 5 段無來源時長；只保留語意候選，沒有自動綁定。
- FUC PSP：2 筆遠端盤點，實際讀取 0 bytes、解包 0；維持 metadata-only。
- FUC 其他平台／社群補充來源：10 筆；PS2 公開音訊 653 檔，與 PSP 原遊戲 payload 分列。

## FateUBW 14 名逐角狀態

| 原生角色 ID | 作者名稱 | 對應 GGD 英雄 | 面／draw／貼圖／通道 | 動作 | 六態缺口 | 註冊狀態 |
| --- | --- | --- | --- | --- | --- | --- |
| `artoria_pendragon_saber` | Artoria Pendragon (Saber) | `godie-e002`, `godie-e00l` | 336／1／128px／17 | 10/10；語意候選 9 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `cu_chulainn_lancer` | Cu Chulainn (Lancer) | 待設計英雄 | 336／1／128px／19 | 7/8；語意候選 7 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `diarmuid_ua_duibhne_lancer` | Diarmuid Ua Duibhne (Lancer) | 待設計英雄 | 336／1／128px／19 | 7/8；語意候選 6 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `emiya_archer` | Emiya (Archer) | 待設計英雄 | 336／1／128px／19 | 11/11；語意候選 9 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `gilgamesh_archer` | Gilgamesh (Archer) | `community-review-18-20260907` | 336／1／128px／17 | 9/9；語意候選 7 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `gilles_de_rais_caster` | Gilles de Rais (Caster) | 待設計英雄 | 336／1／128px／7 | 4/4；語意候選 1 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `hassan-i-sabbah_assassin` | Hassan-i-Sabbah (Assassin) | 待設計英雄 | 336／1／128px／17 | 8/8；語意候選 6 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `heracles_berserker` | Heracles (Berserker) | `godie-hapm` | 480／1／128px／19 | 16/17；語意候選 12 | idle、hurt | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `iskander_rider` | Iskander (Rider) | 待設計英雄 | 336／1／128px／17 | 9/9；語意候選 7 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `lancelot_berserker` | Lancelot (Berserker) | 待設計英雄 | 336／1／128px／18 | 13/13；語意候選 10 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `medea_caster` | Medea (Caster) | 待設計英雄 | 456／1／128px／18 | 6/7；語意候選 5 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `medusa_rider` | Medusa (Rider) | `godie-hvsh` | 336／1／128px／20 | 11/11；語意候選 6 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `nero_claudius_saber` | Nero Claudius (Saber) | 待設計英雄 | 336／1／128px／21 | 6/6；語意候選 5 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |
| `sasaki_kojiro_assassin` | Sasaki Kojiro (Assassin) | 待設計英雄 | 336／1／128px／18 | 10/11；語意候選 10 | idle、run、hurt、death | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |

## 平台界線

- `Fate/Unlimited Block Works`：Flemmli97 的 Minecraft Java 1.21.1 社群實作，來源版 2.2.0、commit `07e9d79b...`、授權標示 ARR；不是 Fate/unlimited codes PSP 原作模型。
- `Fate/unlimited codes` PSP：目前只有 Windows 清單中的日版 ZIP 與美版 ISO 名稱／記錄大小，Mac 本機沒有 payload，沒有讀取 SHA、內容檢查、解包或轉換。
- PS2：目前取得的是 Sprite Database 的 Archer／Shirou／Saber 公開音訊集合；不是 PS2 光碟映像，也沒有模型／骨架／動作／VFX。
- GameBanana 等補充來源按各自未知／PC MOD 平台保存，不能據此推定 PSP 或 PS2 原生出處。

## 註冊結論

14 顆 Minecraft 候選都通過現行模型 hard policy 與 10,000 面減面觸發規則，但目前 **0 顆可直接加入 Git runtime／後台下拉選單**。共同阻塞為 ARR 再散布／商用權未核准、Minecraft 動畫與來源引擎完整 parity 未證實、GGD 事件映射未經人工核准；10 名尚無英雄定義，已有英雄 ID 的 4 名也只有名稱身份映射，視覺形態尚未核准。

Heracles 是唯一同時含精確 `run` 與 `death` 名稱的來源；其 `idle` 只有無原生時長的程序化衍生候選。其他角色的招式名稱只能列為 attack 審查候選，不自動補成 idle／run／hurt／death。

## 重建

```bash
node --import tsx tools/hero-model-library/source-workflows/fate-assets-v2/audit_candidates.mts
python3 tools/hero-model-library/source-workflows/fate-assets-v2/build_inventory.py --workspace ..
python3 tools/hero-model-library/verify_fateubw_reserve.py --workspace ..
```

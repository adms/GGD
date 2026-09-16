# 帕魯三名原作技能 VFX／SFX 索引

本索引把角色技能、模型內原生技能動作、獨立 VFX、技能專屬 SFX 與一般叫聲分開。Windows 盤點已證明 Palworld 本體存在於 `F:\SteamLibrary\steamapps\common\Palworld`，但本輪沒有掛載 `common` 分享，也沒有 PAK／IoStore 逐檔清單，因此沒有讀取遊戲本體 payload。

目前共 27 個去重來源技能、70 段技能動作候選、18 段一般叫聲；其中 30 段動作可由原生名稱詞幹連到技能代碼，另有 3 段只有翻譯別名候選。取得的獨立 VFX 與技能專屬 SFX 都是 0。沒有新增 runtime 綁定，也沒有宣稱部署。

| 角色 | 來源技能 | 技能動作候選 | 單段最大通道 | 獨立 VFX | 技能專屬 SFX | 一般叫聲 |
|---|---:|---:|---:|---:|---:|---:|
| 空渦龍／Jetragon | 10 | 8 | 225 | 0 | 0 | 6 |
| 枯星龍／Astralym | 9 | 54 | 435 | 0 | 0 | 6 |
| 搗蛋貓／Cattiva | 8 | 8 | 129 | 0 | 0 | 6 |

## 邊界與下一步

- `sourceSkillMotionCandidates` 已直接從逐檔 SHA 驗證的 29／58／33 動作 GLB 讀取名稱、時長與通道數；它們是模型骨架動作，不能當成 Niagara／粒子特效。
- 原生名稱詞幹關係仍只是審查候選；`bindingApproved=false`、`runtimeBinding=false`，不因名稱相同自動綁定技能事件。
- 三顆現用審查 component 的動態政策結果與證據雜湊在 `preserved-source-audit.json.currentReviewComponentPolicy`；數值來自既有驗收收據，不在此文件另寫一套門檻。
- 18 段叫聲全部保留絕對路徑與 SHA-256，但技能事件尚未核實，使用者聽審狀態為 pending，runtime binding 固定為 0。
- `scan_palworld_packages.ps1` 只讀列舉並雜湊遊戲容器；找到 `UnrealPak.exe` 時才嘗試標準 `-List`。它不找 AES key、不解密、不擷取。
- 已有合法解包目錄或 package-list 後，用 `scan_extracted_assets.py` 建立逐檔候選。檔名命中仍需 UE 依賴解析、VFX 視覺驗收、Wwise event-bank 關係及逐項聽審。

## 未使用素材

[unused-assets.json](unused-assets.json) 保存 18 段一般叫聲；[preserved-source-audit.json](preserved-source-audit.json) 逐檔驗證現有模型、貼圖、動作與音訊容器。裡面的模型貼圖與發光材質仍不算獨立 VFX；目前沒有可列入的獨立 VFX 或道具。

重建：`python3 tools/hero-model-library/source-workflows/palworld-vfx-sfx-v1/build_inventory.py`；檢查加 `--check`。

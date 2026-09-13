# Ultimate「16 名」與 NSandNS2 核對

「16 名」指 Ultimate14 社群 MOD 中有 NUANMB 的 16 個 fighter 路徑群。435 個路徑分為 282 個身體動作、129 個部件／複製動作及 24 個模型中繼資料；411 個變換動作路徑去重為 175 份內容。

既有固定入口：[原生動作 JSON](../../source-inventories/ultimate14-native-motions.json)、[Windows 來源索引](../../source-inventories/windows-game-library.json.gz)。本頁由同目錄 [reconciliation.json](reconciliation.json) 產生，完整逐檔關係仍由固定索引維護。

| 角色 | 原生 ID | NUANMB | 身體 | 部件／複製 | 中繼資料 |
|---|---|---:|---:|---:|---:|
| 庫洛姆 | chrom | 9 | 9 | 0 | 0 |
| 黛西 | daisy | 13 | 13 | 0 | 0 |
| 加儂多夫 | ganon | 10 | 10 | 0 | 0 |
| 卡比 | kirby | 25 | 3 | 22 | 0 |
| 林克 | link | 85 | 61 | 24 | 0 |
| 路卡斯 | lucas | 7 | 7 | 0 | 0 |
| 露琪娜 | lucina | 105 | 41 | 48 | 16 |
| 瑪利歐 | mario | 64 | 40 | 16 | 8 |
| 碧姬公主 | peach | 1 | 1 | 0 | 0 |
| 黑暗彼特 | pitb | 14 | 14 | 0 | 0 |
| 里希達・貝爾蒙多 | richter | 5 | 2 | 3 | 0 |
| 黑暗薩姆斯 | samusd | 60 | 60 | 0 | 0 |
| 西施惠 | shizue | 4 | 4 | 0 | 0 |
| 西蒙・貝爾蒙多 | simon | 20 | 4 | 16 | 0 |
| 索尼克 | sonic | 10 | 10 | 0 | 0 |
| 卡通林克 | toonlink | 3 | 3 | 0 | 0 |

重新 SHA 驗證 Ultimate14 原包及清單內 1,071 檔／112,082,424 bytes，0 不一致；435 aliases 全數吻合固定動作索引。

另一來源 Worldblender 的這 16 名，每人已有 c00–c07 body Blender 候選，共 128 份。本次只核對存在與大小，未重新計算這 128 份的 SHA、配對骨架或驗收模型。Ultimate14 本身不含完整角色本體。

Kirby 的 daisybody／richterbody／samusdbody／sonicbody 是複製能力 target；common、mariod、samus 是參數／motion_list，Luigi 僅音訊，均不增加 16 名。已有獨立 19 WAV 解碼版，保留 56 個配色 bank 關係／152 個容器條目；說話者、語言與事件尚未聽審。

NSandNS2：`E:\Game\單機遊戲\模擬器\NSandNS2`。LV99 原掃描 payload 讀取 0 bytes；以下只表示盤點時存在的 metadata，不表示格式、版本或 DLC 已驗證，也不表示已擷取、轉換或部署。

| 容器檔名 | 盤點大小 |
|---|---:|
| `Super Smash Bros Ultimate[01006A800016E000][US][v0].nsp` | 14,638,743,603 B |
| `Super_Smash_Bros_Ultimate_Switch_NSP_XCI_Archive_full_6200.zip` | 38,366,835 B |
| `Super_Smash_Bros_Ultimate_Switch_NSP_XCI_Archive_latest_790500.zip` | 38,366,835 B |

核對當時 `/Volumes/game` 未掛載；Steam 的 `common` 分享不是此來源。若既有 game 分享可用，Finder Cmd-K → `smb://lv99/game`，沿用既有登入。Windows 可先用 `Get-SmbShare -Name game | Select-Object Name,Path` 只讀確認分享路徑；不必提供聊天密碼或改 ACL。

只讀 [工具與重跑方式](../../../../tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/README.md)。PowerShell helper 尚未在 Windows 執行；預設 metadata-only，`-InspectContainers` 只讀表頭／成員表，`-HashPayload` 才完整計算 SHA，不解密或執行來源內容。

固定 JSON 的 SHA、完整本機報告位置、128 份 body 候選的查核限制及分階段狀態皆保留於 reconciliation.json。這批沒有新增取得素材、後台選項或部署。

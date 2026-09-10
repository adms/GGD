# 角色模型資料

**共編操作只看 [素材庫共編入口](../asset-library/README.md)。** 本目錄是它的角色模型資料，不是另一個資源庫。

| 檔案 | 用途 |
|---|---|
| [角色語音索引.md](角色語音索引.md) | 全角色音訊儲備分組、S3 取檔索引、逐檔 SHA-256 與合成素材查詢 |
| [全角色模型盤點.md](全角色模型盤點.md) | 人閱讀：81 名新角色與既有角色、預設、候選及下載安排 |
| [inventory.json](inventory.json) | 程序讀取：同份盤點的角色 ID、modelKey、Git／S3 路徑與取得狀態 |
| [download-sources.json](download-sources.json) | 可共編：下載網址、改造備註、免費／論壇付費交付及每筆必要的後台整合追蹤 |
| [public-source-files.json](public-source-files.json) | 免費／付費來源完整備份的逐檔 SHA-256、S3 位置與尚未上傳紀錄；沿用檔名，不是成品清單 |
| [pairing-inputs.json](pairing-inputs.json) | 可共編：第二批與舊英雄配對來源 |
| [default-policy.json](default-policy.json) | 九級預設順位、來源分級與 11 組手動指定副本 |
| [derivatives.json](derivatives.json) | 可共編：獨立模型副本的製作要求 |
| [manifest.json](manifest.json) | 已發布模型快照；現行排序以 default-policy.json 為準 |
| [../asset-library/git-release.json](../asset-library/git-release.json) | 成品 Git 固定版本、全部檔案與 SHA-256；包含模型／動作及 VFX 元件 |
| [rimuru-audio-validation.json](rimuru-audio-validation.json) | 利姆路 13 段音訊解碼與完整保留證據；分類／綁定尚待驗收 |
| [release.json](release.json) | 此 Git 版本對應的 S3 成品版本與逐模型位置 |
| [inventory-context.json](inventory-context.json) | 正式機與原始目錄的觀測快照 |
| [derivative-validation.json](derivative-validation.json) | 11 個副本的獨立檔案、貼圖、骨架、動作與來源不變證據 |
| [spider-identity.json](spider-identity.json) | 蜘蛛子原生表格與模型身分對應證據 |
| [s3-publication-receipt.json](s3-publication-receipt.json) | S3 上傳後讀回驗證；不是網站部署收據 |
| [turbo-granny-compaction-validation.json](turbo-granny-compaction-validation.json) | 招財貓合併版的 GGD 格式與網格／貼圖預算檢查；尚缺動作與後台切換驗收 |
| [goku-audio-validation.json](goku-audio-validation.json) | 悟空 69 個浮點 WAV 母檔的解碼、取樣數、峰值與獨立 FFmpeg 驗證；尚缺事件／技能對應與聽審 |

本版包含 97 筆來源選項、90 個不同模型，以及成品庫中既有的 60 個 GGD 作者化 VFX 元件。模型／動作元件與完整英雄包分開計算；不得宣稱 156 筆盤點 ID 已全部上架。

預設依盤點第二守則；原著模型指原作遊戲直接擷取，300／MBA 維持第 6／7 位。成品一律進 Git，半成品／原始來源進 S3，本機全保留；既有版本先核對，避免重買。其他工作流經使用者授權付費取得的素材，一律與免費來源保留整合，預設順位不得刪減候選；尚未取得或轉換的來源不冒充已上架。銀時、蜘蛛子、海克力斯及各來源未完成步驟的細節統一放在盤點。

靜態解析使用 `tools/hero-model-library/public-source-requirements.txt` 的固定版本。`extract_public_sources.py` 會保存 DLL 中的原生資源，並以 `embedded_resources.py` 拆出 Wwise BNK 的 DIDX／DATA 媒體；保留原 bank 和事件資料，擷取出的 WEM 可能是串流預取片段，必須另行解碼及驗證。

`decode_wwise_intake.py <WEM目錄> <新輸出目錄> --decoder <vgmstream-cli>` 使用官方 [vgmstream r2117](https://github.com/vgmstream/vgmstream/tree/r2117)（`71e2361042531fe767fb98300cf8c1ee95e539a0`）解碼，工具依官方建置說明準備，不執行 MOD。預設 Float32 WAV 保留原取樣率、聲道與超過 1 的峰值；不加循環、淡出、正規化或重取樣。逐檔檢查 RIFF 長度、來源 SHA、解碼器中繼資料與實際取樣數，結果寫入 `audio-index.json`，失敗檔也列入；`--sample-format pcm16` 僅供診斷，可能截波。原 bank、WEM 與歷次解碼產物全部保留。

悟空已解碼 69 份浮點 WAV（178.307 秒），另以 FFmpeg 全檔解碼驗證。25 檔浮點峰值超過 1，播放增益與整數格式匯出仍待確認；先前 69 份 PCM16 診斷版不作母檔。逐檔索引在 intake 的 `decoded-audio-float/audio-index.json`，與整個素材包一併存 S3 legacy。尚缺逐檔聽審、bank 事件／技能對應、模型動作整合及後台切換，這批音訊不會自動進入正式成品庫。

`convert_unity_prefab.py <bundle> <intake輸出目錄> --root-name <精確 prefab 名稱>` 僅將已檢查的 Unity 蒙皮模型轉為自包含 GLB，保留骨節順序與綁定矩陣，驗證座標轉換前後頂點位置。遇到未支援的 morph、透明材質或 UV 變換會停止；動作尚未轉換，輸出屬於 intake 半成品。`compact_unity_skin.py <GLB> <新輸出目錄>` 進一步合併共骨節蒙皮與單色材質，在多組骨節姿勢下比對頂點位置，保留有圖案貼圖的原尺寸。高速婆婆已由 32 降至 5 繪製批次，全部 9,432 面及 29 骨節保留；`converted-prefab/`、`compacted-prefab/` 各自保存 GLB、格式驗證、三面截圖及瀏覽器收據。仍缺動作與後台切換驗收，不能據 GLB 可開啟就登記成品。

靜態預覽來源為 `tools/hero-model-library/preview-unity.html` 與 `preview-unity.mjs`：以工作區的 esbuild 將 JS 和 Babylon.js／glTF loader 打包成 `preview.js`，HTML 另存 `index.html`，與 `body.glb` 放同一個本機 HTTP 目錄即可檢查；三面預覽不等於後台實際切換驗證。

`convert_collada_intake.py <DAE> <新輸出目錄>` 使用已安裝的 Assimp 轉出含原圖的 GLB，保留未修正版。只有原 Collada 的輸入／材質綁定與所有使用該材質的網格均證明只有 UV 0 時，才修正引用不存在 UV 的錯誤；二進位資料、貼圖 SHA 與三角面數另行比對。辛巴達巴力魔裝已取得並轉換，一般形態仍是獨立待下載線索；不能因同一角色已有魔裝就取消一般形態的取得安排。此轉換不代表動作、尺寸、繪製預算與後台切換已驗收。

已通過標準化的來源，由 `register.mts` 全部註冊；`automaticEligible` 只控制自動預選，不再以預設資格略過候選。未核准相似模型保留為「手動選用」，11 組核准副本由同一 `default-policy.json` 明確給予預設資格。未帶此欄位的舊相似模型不會自動取得核准；再次匯入時，核准副本會追加具明確資格的新版本，保留舊版本。不同來源／版本即使二進位相同，也依來源及版本名稱保存獨立選項；同一筆完整交付重複註冊則拒絕。開發 Content API、正式站 Go 選擇服務與後台共同遵守此規則，實際站點仍須發布該程式與資料版本才生效。

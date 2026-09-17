# Fate 角色 3D 本體 MOD：第七批凍結交付

本批取得兩個此前未登記的完整作者附件，原包、全部內含檔、來源收據、解析與轉換結果全部保留。本機即可透過 source-manifest.json、各角色 candidate-manifest.json、motion-index.json、audioFileIndex-frozen-v1.json 查詢。中央、Git、S3 與舊批均未修改。

| 來源 | 實際取得與標準候選 | 範圍 |
| --- | --- | --- |
| GameBanana 291438，NicholaiParadox 言峰綺禮 | 1 個 MDL、4 張內嵌貼圖、1 個標準 GLB、191 個原始序列 | Sven Co-op／GoldSrc MOD；原本 PSP 或 PS2 平台未知 |
| GameBanana 492607，7Negative_Creep／MEKMKII 黑櫻 | Unity 原包、2 個不同配色 GLB、15 段 PCM WAV／16.209 秒 | Bomb Rush Cyberfunk MOD；作者指稱模型和語音來自 Fate/UC，但原平台未知 |

言峰 RAR 1,105,055 bytes，SHA-256 8f9434471e43d6b10b826b41d154ae66e948841b99e02385ab979210ddbc63ef。黑櫻 7z 598,429 bytes，SHA-256 890b71eae085035e68dd3bcb60437acdc74c602e1fa3f2ba955f8939da5a3ecc。兩包均 HTTP 200，來源大小與 MD5 符合，系統 libarchive 完整安全解包。

言峰原 MDL 為 IDST v10、22 個唯一骨架節點、191 sequences，其中 55 loop、186 多幀與 5 單幀。每段原始 FPS 保留，範圍 4–40，不猜統一播放率。Assimp 展開成 349 個 blend entries，其中 336 隨時間變化、9 單幀 pose、4 多幀静態 pose；有 182 個來源 sequence 確實會動。不能把 349 個匯入項全算成 349 個有效動作，更不能算 Fate 原生動作。

所有每幀／骨架／通道展開值（1,005,312 個 DOF 樣本，包含靜態預設值）已從原 MDL RLE 解析，原量化 int16 與骨架預設值、scale 留在 analysis/source-motion-keys.npz。22 骨架命名／階層、各段 FPS／frames／loop／events／blend metadata 與 GLB TR 通道核對。最大位置誤差 3.82e-6、quaternion 誤差 2.91e-7、時間誤差 3.82e-7 秒。349 項各 5 幀，共 1745 幀 CPU 蒙皮全有限，336 項有頂點位移；站立、跑步、揮手的 12 張實際模型畫面已目視檢查。

Assimp 原始匯出把 4 張 image/rgba8888 貼圖截斷為 width bytes。本批從原 MDL 完整索引像素與 RGB palette 重建 PNG，保留原不標準 GLB作解析證據；只有 kotomine-kirei-standard.glb 是候選。同時修正 inverse bind matrix 最後一列約 1e-7 的舍入誤差，保留修正紀錄。三個不同 GLB 全數 Khronos maxIssues=0 驗證：0 error、0 warning、未截斷。

黑櫻來源有 4 個 outfit entries，但轉出的 P1/P2 各重複一次，已按完整 GLB SHA 合併成 2 個下拉候選；4 份原轉出檔與引用全部保留。每個候選有 57 個 skin joints、1 mesh，原包沒有 AnimationClip／ParticleSystem。MOD 動態頭髮／骨架控制資料留在完整 bundle／解析 JSON，未執行，也未冒充 GLB 動畫。15 WAV 已檢查 PCM frame payload 並全部 FFmpeg 解碼，角色身分與語音用途按作者／MOD 標籤保留，未逐段人工聆聽。

限制：Fate PSP 原生 FPK／GMO／動作缺口仍存在。言峰保留原 GoldSrc 座標，公尺尺度與英雄統一尺寸未定；事件、混合控制器、根位移語意與 shader 不等同原引擎實作。候選可供索引及後續整合，runtimeReady=false，未做 GGD 引擎／後台 E2E。原包與非標準中間檔不能冒充可用成品；參照 candidate-manifest.json 指定路徑。

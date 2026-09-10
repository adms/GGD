# 本次模型整合交付

**Main 優先合併 81 名（37＋37＋7）**：逐角色成品與缺口請讀 [81英雄優先合併清單.md](81英雄優先合併清單.md)，程序讀 [priority-81-handoff.json](priority-81-handoff.json)。所有角色仍列於 [全角色模型盤點.md](全角色模型盤點.md)。

已合入 main `b6686109a`。81 名的 **283 個版本引用／245 個不同凍結模型文件**均經實際 `ModelVersions.verify` 和 SHA 驗證；Main 的 60 個版本引用與本分支原 222 個版本引用完整保留，另新增開司 MOD 成品版本。15 個既有手動預設、11 個指定加工副本未改，來源分類及候選均保留。完整性稽核 0 失敗、0 警告：[收據](priority-evidence/kaiji-community/final-integrity.json)。

74 名已有 **1,016 個 Git 戰鬥音訊成品**：308 個來源重用、708 個合成。74 名核心 9 類齊備，原 Main 快照為 73 名擴展 11 類齊備；本分支新增如月列車的山手線關門廣播（嘲諷）及 JR 發車旋律（勝利），目前 74 名擴展 11 類齊備，共 **1,018 個成品**（來源重用 310、合成 708）；不能把來源標籤當成已確認原角聲優。其餘 7 名 LOL 有 **4,927 個日本語 WAV 儲備**，本機可立即讀取，仍待戰鬥類別綁定。精確成品路徑、SHA、合成／原來源及缺口見 [81 名最新合併索引](priority-81-handoff.json)；[原 Main 音訊稽核](priority-evidence/main-81-handoff/audio/per-hero.json) 保留為 1,016 檔基準。

優先 5＋10 名模型已登記。貓貓、凱茲、岩谷尚文、野原新之助兩版、高速婆婆、辛巴達及開司的八件成品採 GGD 程序化六態動作；其他來源按真實 GLB clips 與 clipMap 記錄，不將六格映射當六段原生動作。羽賀原生顯隱修復保留 13 段原動畫及原件，82 個實際 Babylon 取樣證據見 [原生顯隱驗證](priority-evidence/haga-native-visibility/render-proof.json)。

開司已使用 [holya 的 kaiji_suit_2](https://thunderstore.io/c/lethal-company/p/holya/kaiji_suit_2/) 社群模型，完成轉換與 36 個播放取樣、後台登記，保留原有三個候選；81 名目前均有模型對應，沒有新增角色仍用引擎佔位。完整原始骨架、三材質及貼圖保留；六段動作是 GGD 程序化基本動作，原包沒有動畫、音效、語音或特效。原件及四版轉換均已 S3 完整讀回核對。新取得的不知火舞 DOA6→GTA SA 162 段 IFP 亦待配骨架及轉換，不列為已完成後台動作。辛巴達巴力魔裝兼用、高速婆婆招財貓形態依既有確認保留。

合併另外修復 JPEG 縮圖後 MIME 不符，以及移除零長動畫後可能選错片段；既有 36 項相關測試通過；另修復 ffmpeg PNG 縮圖的 0:1 像素比例，兩個真實縮圖回歸案例驗證修正前失败、修正後通過，RGB 像素不變。固定來源索引同步 Main 已正規化模型，原取得 SHA 仍釘選至原 Git commit，沒有重寫原始收據或凍結版本。

發布完整檢查以 [最新驗證](priority-evidence/kaiji-community/validation.json) 為準；歷史日誌保留於各批 evidence，不代表目前全部通過。這是 **分支交付**，尚待 Main 審查合併與部署。

本工作流負責轉換、驗收、版本及中央索引；來源工作流負責取得與初步分析，Main 負責審查合併及部署。成品、程式、設定、索引和文件進 Git；原始與半成品進 S3 `legacy/`，本機全保留。未做 S3 讀回的原包仍為待備份，不以本次 Git 推送宣稱完成。

補充儲備：FateUBW Minecraft 社群 MOD 已取得 19 份幾何來源、156 段動作與 5 個音訊檔，已作 S3 完整備份並登記；尚未標準化為後台成品，並非 Fate/unlimited codes PSP 原生素材。既有英雄的 Saber、Gilgamesh、Heracles、Medusa 來源對應已保留。

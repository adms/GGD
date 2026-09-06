# 37 名英雄本體覆蓋驗收

本批把模型綁定從 19 名補至 37 名，使用 34 個不同 GLB：18 名同角色、1 名互通版本、18 名近似風格替代。31 個模型由 300 英雄原生帶骨架資料轉換、1 個來自 MBA 1.60、2 個為 GGD 自製卡通替身。原始動漫／作品來源與替代差異均保留，沒有以 OBJ 宣稱動作已完成。

完整逐英雄來源、舊本體、新 GLB 雜湊與六用途映射見 `model-bindings-report.json`；逐模型判讀見 `visual-review.json`。`fronts/` 保留全部 34 個實際 Editor WebGL 正面截圖與六張聯絡表，已逐張檢查本體、貼圖與 +Z 朝向。新選用模型的六用途畫面及完整準備／共用驗證／Babylon 蒙皮收據在 `models/`；先前 19 名的六用途判讀保留於 `../native-batch/`。軟體渲染截圖不代表 A17 Pro FPS 測量。

來源查詢先核對存在性、readiness、角色 ID 與官方關聯，再讀取回傳路徑。吉爾伽美什角色 104 的官方本體為 099.x，改以角色資料中的精確 base_model 路徑及名稱／作品證實，沒有偽造素材關聯。已有官方關聯但角色衝突時仍拒絕。卡比／殺老師搜尋未找到可用本體後，建立明確標示的程序化替身；保留生成程式快照、自有骨架和六項獨立動作。

本批人工選擇包括：衛宮士郎採 Archer、赫蘿及尼古貓貓採含尾巴的玉藻前、利姆路採移除獨立翅膀的藍髮珂朵莉、坂田銀時採奴良陸生。這些替代未改英雄名稱或原稿。未採用的小埋、莉姆、缺尾巴玉藻前、有翅膀珂朵莉及早期卡通版本均列於 `visual-review.json`，不能算最終成果。

實際資料夾匯入結果在 `folder-import/acceptance.json`：37 個獨立草稿、222 槽完整原文／requiredRefinement／規約、原 acceptedPlan／presentation 逐份比較相符，37 份綁定的 IndexedDB 模型雜湊重新計算相符，未出現 Runtime exception。原文查看與模型来源／六用途下拉選單有實際畫面。11 項轉換／表面／權重測試通過；Editor TypeScript 通過，原始輸出並列保存。

可攜資料夾位於工作區 `outputs/community-hero-asset-integration/handoff-with-models-v2`，可用英雄工坊「批次匯入英雄交接」選取。它是保留完整來源及 GLB 的新資料夾，不是投稿 ZIP，也沒有套用舊 ZIP 的通過標記。來源映射在 `tools/community-hero-forge/library-bodies/community37.bindings.json`，重建方式見同目錄 README。

本體覆蓋已通過上述範圍；原生 hurt 共用 idle、部分施法共用及風格差異明示於作品。尚未完成 37 名逐槽原設計、專屬 VFX／音效、當前服務 ZIP、投稿／審查／遊戲內整體驗收，尤其阿薩謝爾 THE END OF SON 的重複詛咒反轉不能以代理模型或原文保存取代。已實作的後台模型版本下拉與 rollback 見 `../../model-versions/`，本批只建立隔離候選與草稿，未更動正式英雄上線版本。

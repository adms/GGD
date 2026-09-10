# 莉娜：GGD 實際載入與版本登記驗收

此批是既有 footloop-v2 的驗收收據，沒有新增來源、模型、音效或動作。原始候選完整保留。**實際 GGD 元件可載入；目前不能完成後台版本登記，也未變更任何預設。**

| 範圍 | 實測結果 |
| --- | --- |
| AssetManager → ChampionView | 原件載入成功，69 節骨架；3 個身體 primitive 使用 bone texture，2 個手掌為骨骼子節點的剛性網格。 |
| StorePreview | 直接使用專案元件，貼圖和待機可顯示；附實際影片及畫面。 |
| 上傳／登記 | `parseUploadGlb` 與兩筆莉娜的 `ModelVersions.prepare(register)` 均拒絕原件：422「GLB 宣告尚未支援的擴充。」沒有呼叫 writeArtifacts。 |
| 材質擴充 | `KHR_materials_specular` 實際在 3 材質上生效；`KHR_materials_volume`、`FB_ngon_encoding` 只有宣告。不能一律移除並聲稱無差異。 |
| 六格 clipMap | idle/run 已對應真實重綁片段；attack/cast/hurt/death 缺少。測試用 MISSING_SOURCE 字串只為觸發診斷，不能作為登記資料。 |
| 缺動作實際行為 | GGD 四次警告並 fallback idle@3x；`currentClip` 仍回傳要求的行為，不能當成該動作已播放。 |
| 尺度 | GGD 實際倍率 1.155637048，靜態身高 1.799999793；沒有重現預先擔心的 bounds／比例錯位。 |
| 跑步倍率 | 速度 4.522414609 時，GGD 使用全局基準 5.8，真實 rate=0.779726657；原樣本的 1x 落腳標定不能直接套用。 |
| 容量 | 80 nodes、69 joints、9072 triangles、5 rendered primitives、3×1024 PNG（2 個不同影像）、每段20 channels。真實 budget 函式回傳0 errors、2 warnings（網格數、貼圖邊長）。這是容量獨立檢查，不是上傳成功。 |
| 發布狀態 | 本機獨立 fixture；後台下拉未新增、本機主內容與正式站均未替換。 |

待機：`300heroes_bat_idle_retargeted_to_Rays_Lina_processed_footplant_loop`（1.21875秒）。跑步：`300heroes_single_run_retargeted_to_Rays_Lina_processed_footplant_loop`（0.40625秒原片時間）。兩者都是 **300英雄動作重綁到 Rays 模型，另經落地與循環加工**；Rays 原生動作仍為0，原生 FPS 未知，Babylon 顯示60是載入慣例。

左腳尖峰的 960 Hz 數值：核心接觸區 >0.1 m/s 共3.125毫秒；中央差分支持範圍 0.203125–0.207291667秒，4.166667毫秒內淨水平位移5.030942毫米，路徑長5.063060毫米，峰值1.995018 m/s。這是落腳邊界的小幅快速位移，不能只用峰速判斷嚴重程度，也不能因小於一幀就宣布看不到。右腳在核心接觸區無 >0.1 m/s 事件。GGD 倍率套算約5.814毫米／5.344毫秒，僅為尺度與時間換算。

GGD 真實倍率下，依既有站立足底軌跡推算穩態水平腳滑約0.447353單位／秒。這是運動學推算，影片只在原地播放並將真實速度傳入 ClipAnimator，沒有假冒已跑過 SimWorld 移動配速驗收。以後若改時間或配速，須另存衍生版與處理參數。

三段穩定錄影各解碼57個不同畫面，附MP4預覽。第一次空 idle 錄影與灰色地板 fixture 保留在 `evidence/runtime-attempt-1/`；第二次已補四張專案地板貼圖並使用逐次渲染擷取。SwiftShader/Rosetta 低幀率紀錄不代表產品效能，不能用來驗收5毫秒尖峰。畫面只能證明目前取樣中沒有明顯肢體飛散；披風會遮住遊戲鏡頭下的腿部。

下一批整合順序：

1. 複製原件至新候選目錄，核對 extension-inventory。只刪除真正未引用的宣告；有效 specular 要正確轉譯並保留原材質對照，再跑 GGD parser 與格式驗證。
2. 從本機300莉娜20段完整來源核對原名、實際通道、視覺行為再重綁。attack/cast/death 有名稱線索，hurt 尚無已確認原片，不能以 idle/冰凍任意冒充。
3. 保留 model@1 嚴格六格規約；名稱必須是GLB內真實具名片段。若素材不足，繼續列為儲備缺口，不能偽造六格通過。
4. 正式接入需建立 content model doc，對 `godie-h020` 和 `godie-hjai` 使用版本服務 register，保留舊版、expectedHash 並先 automaticEligible=false。來源建議 community-mod、精確角色；body 原作 Rays 與300重綁動作同時留在索引 reference。這是提案，未寫入中央。
5. 下拉選單來源是 champion.modelVersions，不會因資源庫多一個檔案就自動出現。完成登記、實際選用／回復、動畫與移動驗收後，再由主工作流統一 Git／內容索引／S3 與各站部署。

實際來源檔路徑、逐檔 SHA 與行號摘錄在 `evidence/project-source-evidence.json`，包含 model schema、upload parser、budget、版本服務、後台選單、AssetManager、ChampionView、ClipAnimator、StorePreview。`evidence/real-contract-audit.json` 是實際服務拒絕收據；`evidence/runtime/runtime-proof.json` 是實際載入／播放收據。fixture 中的 GLB 是原 SHA 的測試複本，不重複計入模型。

重現：使用 scripts 中的 TypeScript 合約驗收、build.cjs、runtime.mjs 與 localhost server。須建立新驗收目錄並調整腳本 DST，不能重跑覆蓋本凍結批次。固定 repo 檔案 SHA／版本及既有 Babylon7.54.3、esbuild0.21.5、tsx4.23.1。contract 以 node --import tsx loader 執行；runtime 只開127.0.0.1，採独立Chrome profile，結束時關閉自己啟動的程序。

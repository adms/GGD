# Editor 可重跑驗收

Editor 的資料與機制驗收必須先由 script 完成；LLM／人工只處理無法可靠量化的語意與美術判斷。

```bash
pnpm editor:accept          # 快速：契約、coverage、鑄技工坊、特效工坊
pnpm editor:accept:visual   # 再加貼圖透明／不安全素材檢查與既有 GPU 證據帳本
pnpm editor:accept:release  # 再加 Editor 全測試、typecheck、production build
```

真 Renderer 證據也有單一入口；Editor 未啟動時會暫時啟動，開啟預設瀏覽器後自動逐支跑
46 份真 Sim／GPU／framebuffer、自動 POST 到一次性 localhost 接收器、匯入逐幀圖片、更新 42／46
收據，最後追加 Gemini 時序分流（有 key 才送圖，失敗只降級）：

```bash
pnpm editor:proof:capture
pnpm editor:proof:capture -- --ids godie-etyr.r,godie-hart.r
pnpm editor:proof:capture -- --no-gemini
```

一般項目 30 秒、重型 fixture 60 秒硬上限，單一壞模型不能拖死整批。聚焦重跑會先產生 partial proof，
再依 ID 合併回既有的 46 份帳本；未列出的技能與其人工裁決不會遺失。匯入器會拒絕少於 46 份、
重複 ID、未知 ID、假 `captured`、無圖卻有人工作出裁決，以及把 diagnostic-only 失敗幀
偽裝成通過等資料；`editor:accept:visual -- --proof ...` 的最終發版模式還會拒絕任何已擷取但仍待看圖、缺分數或缺理由的技能。
它會把 data URL 自動拆成逐幀 WebP/PNG 並建立 `docs/_reports/editor-skill-basic-visual-proof/manifest.json`，
不必人工逐招存圖或抄表。肉眼裁決另存 0～10 分與判定理由，機器的素材衛生分數不會冒充美術分數。

安全守衛失敗也會自動擷取失敗當下的 framebuffer，標成 `diagnosticOnly`；這張圖只能證明
失敗，永遠不能作為批核／Promote 證據。規則引擎會把每列歸入棋盤載體、角色材質純白、
替身、缺事件積木、動作時間軸、取代契約、Sim、逾時或低清晰度，並寫明下一步屬於
Editor、Main 或 Editor 先查。未知錯誤保持 fail closed，不交給 LLM 自由猜測。

修正擷取器後可按「只重跑技術失敗」；改特效或驗收規則後可按「只重跑未通過」，也可在
任一技能按「重跑此項」。這些路徑只重建指定 queue，其餘結果與人工裁決不會被清空。人工分數另以完整
framebuffer 資料計算指紋存在本機；同一張圖可在重新載入後恢復，任何像素資料改變就不沿用
舊 verdict，必須重新看圖。

棋盤、局部白卡與整幕過曝都不能因來源收據而自動通過。同一影格移除 Telegraph 後仍存在的
棋盤才分類為技術性 `FRAMEBUFFER_CARRIER`；只隨已收據的 Telegraph／呈現層消失的棋盤、底板或過曝
仍保留原影格，分類為 `PRESENTATION_ARTIFACT` 交給 Editor／人工否決與重做。這避免把安全但醜的素材冒充成
乾淨畫面，也避免把透明的 targeting geometry 誤報成遺失貼圖。

需要除錯接縫時，仍可拆開啟動一次性接收器：

```bash
pnpm editor:proof:receive -- --out docs/_reports/editor-skill-basic-visual-proof.browser.json \
  --origin http://127.0.0.1:5174
```

把輸出的 `sinkUrl` 放進 `proofSink` query 或貼到批次區再寫入。正式 script 會自動完成前者；頁面只接受
`http://127.0.0.1`／`localhost`，接收器另使用隨機路徑、限制 128 MiB、核對 42／46 header，完成單次
原子寫入後立刻關閉。圖片不會被送往任意遠端 receiver。

成功階段只輸出一行；失敗才保留尾端診斷，避免例行檢查把大量測試輸出塞進人或 Agent 的上下文。
第一行是 `ggd-editor-acceptance-run@1` JSON 收據，包含執行時間（精確到分鐘）、目前
feature branch、HEAD、`origin/main`、coverage 與 capability 指紋；複製該行即可精確重現
「驗的是哪一版」。若 working tree 尚未提交，收據會明列 `dirty: true` 與變更檔數，避免把
HEAD 冒充成完整受驗內容；不再引用可能過期的交接文件 commit。

## 自動化邊界

- `skillforge:check` 驗新技能入口不能從 UI 消失、新技能骨架、Q/W/E 四級／R 三級、Main 五級距、出身推薦、模板疊卡、條件 UI、42 個技能主題／46 份現役技能機制覆蓋與真 Sim 試放；另核對 `skillforge:audit:check` 的逐技能收據。證據畫面剛更新、人工 advisory 尚未重新審閱時，快速／visual 閘會用 `skillforge:check -- --machine-only`：機器驗收可繼續，但明確印出 `PENDING`；release 閘仍要求 advisory 指紋完全一致。
- `skillforge:audit` 重新產生 `docs/_reports/editor-skill-acceptance-42x46.{json,md}`。它把「設計師從哪個 no-code 入口做」、「自訂 VFX 是否有真正事件可綁」及「是否已有 framebuffer＋人工裁決」分開；沒有看圖不會被測試冒充成通過。
- `skillforge:visual-proof:import` 驗證瀏覽器整批輸出、解碼所有 framebuffer、保存人工分數／理由，再交給 `skillforge:audit` 彙整；這是唯一受支援的批次證據落盤路徑。
- `visualAcceptanceIssues.ts` 是唯一技術根因分類器；瀏覽器與匯入器各重算一次並逐 code 比對，手改匯出 JSON 無法把失敗改名成通過。
- `skillforge:check` 也會用完整 42／46 ID 集合跑匯入器的無檔案 self-test，避免匯出／匯入介面長期沒人按就悄悄壞掉。
- `vfxforge:check` 驗 Main 演出收據、角色動作原則、八招 fixture、來源對照、配方、時間軸、限制、素材安全與 framebuffer 證據帳本。
- `editor:accept:visual` 讀 Main 的 `config.unsafe-textures@1`，逐位元核對貼圖 hash，並重算每個
  `(貼圖, blendMode)` 消費關係；Editor 對契約未知的新素材再做即時像素檢查。它不再使用會把
  `babyface`、additive `zap1/zap1b` 判成失敗的舊單圖門檻。
- 顏色是否像原作、構圖是否有力量、動作節奏是否自然，無法由像素門檻安全決定；仍由後台人工看實際連續影格裁決，不能以 script 全綠冒充視覺通過。

### 可選的 Gemini 時序預審

`editor:proof:capture` 在確定性守衛、真 Renderer 擷取與 proof 匯入後呼叫 Gemini；`.env.gemini.local`
有 `GEMINI_API_KEY` 時才啟用，沒有 key、明確加 `--no-gemini`、網路錯誤、429／503 或 timeout 都會寫成
未審／需人工審查並正常結束，不會把整批判成失敗。它依技能複雜度自動挑 2～18 張按時間排序的非診斷
關鍵格，普通技能不濫送圖片，長連段、位移與召喚生命週期才提高張數；預設 Gemini 3.1 Pro、low reasoning，
只有明確加 `--escalate-uncertain` 才對不確定項升級一次。

Gemini 只取代 Agent 逐張讀圖的初步時序分流，不取代 SimWorld／event trace、framebuffer／素材守衛或
Owner 人工視覺批核。正向模型結果仍保持 `needs-human-review`；模型否決可優先排入重做，但不能自行
Promote。金鑰只從環境檔讀取，不寫進報告、prompt、cache key 或 log；圖片只會送往固定的 Google Gemini
API origin，任何自訂遠端 endpoint 都不支援。

Main 只提供可重用 primitive、權威事件、runtime、限制 resolver 與機器契約。上述時間軸、配色、鏡頭、拖拉組合、截圖和反覆調整均由 Editor 驗收流程負責。

經典光束另有不可省略的來源對帳：[W3X_CLASSIC_BEAM_RECIPE.md](W3X_CLASSIC_BEAM_RECIPE.md)。
驗收器先核對 JASS `CreateNUnitsAtLoc`、蝗蟲 unit model 與 Main `model@1`，再分類責任；已存在的
`ReviveHuman＋FragDriller` 不得因 Editor 冷啟動白卡或錯誤配方而被誤報成「缺少光束模型」。但來源存在
不代表全部 authoring 參數已打通：聚焦 A/B 已證實 `model@1.fxEmitters` 尚未繼承該次 `modelFx` 的
縮放、方向、色彩與透明度，六份藍白／黃藍技能因此保留一個精確 Main 低階接縫，不逐招硬調掩蓋。

VFX Forge 另由 `pnpm vfxforge:handback:build` 從現行配方原始碼產生
`editor-vfx-template-handback.json` 與 `EDITOR_VFX_TEMPLATE_HANDBACK.md`。Main 可據此參考收編真正可重用的
低階能力；技能時間軸、配色和鏡頭仍留在 Editor。`vfxforge:check` 會驗證交接檔未過期。
工坊本身以「家族 → type1/type2…」呈現 21 個可選完整預設，另保存 42／46 已實際使用的 36 個
機制推薦 type。套用 type 後才展開成可拖拉的積木與時間軸；矩陣／slider 只用於最後微調，不能把
從零塑形的成本丟給設計師，也不能讓既有調整成果退回成一堆無名參數。

視覺問題也採固定路由：顏色、方向、形狀、大小、錨點或物理意義的明顯錯誤由 Editor 重做；亮度、
飽和度、尾焰密度、數幀節奏、鏡頭手感與美術偏好只送人工細修。兩者同時出現時先處理大錯，不能用
「微調」延後。Gemini prompt 與 Editor 人工註記共用同一判斷原則，但仍只有 advisory 權限。

## 最近一次關鍵收據

2026-09-04 11:17 CST 在 `feat/vfx-forge-codex` working tree（基底 `d71d027be7ce`）對
`origin/main@b45a2957fe1c` 完成 42 主題／46 文件帳本更新：46 份都有真 framebuffer、0 capture
failed、0 blocked，全部保持人工待審；其中 6 份精確歸因到 Main 的
`model-fx-owned-emitter-instance-inheritance` 接縫。`godie-hart.r` 聚焦重驗留下 8 張時間序影格、
7 個真 `comboStrike` 節點、11 個 presentation events，沒有機器 issue。Gemini 確認斬擊、黃藍光柱、
角色可讀性與無穿模，但靜態影格無法獨立證明七擊逐段對齊，因此保持 `needs-human-review`；真 Sim 收據與
人工批核仍是權威。審查 prompt 也已禁止把「不同時間每段各一個斬弧」誤判成同時堆疊大量月牙。

同輪重建 `editor-vfx-template-handback.json`，指紋 `e8514105cb11`：21 個可選完整 type、36 個
依結構化機制自動推薦 type，共保存 57 個既有成果。設計師必須先選或接受推薦 type，再以矩陣／slider
微調；不得把已驗過的配方退回無名參數，也不得讓矩陣成為從零塑形入口。

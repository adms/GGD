# W3X 經典光束配方來源契約

狀態：歷史來源對帳＋Editor 組合規則；不是 Editor 的執行期輸入、不是新的 runtime/schema，也不是正式技能內容。

## 不可再遺忘的來源鏈

| 原始用途 | JASS 建立的蝗蟲 unit | unit model | Main 積木 |
| --- | --- | --- | --- |
| 龜派氣功主光束 | `h007` 特效龜派 | `Abilities\Spells\Human\ReviveHuman\ReviveHuman.mdl` | `w3x.stock.revivehuman` |
| 勝利劍／理想鄉終結光束 | `h00S` 勝利劍 | `Abilities\Spells\Human\ReviveHuman\ReviveHuman.mdl` | `w3x.stock.revivehuman` |
| 龜派／勝利劍能量核心 | `h008` 特效三號 | `Abilities\Weapons\FragDriller\FragDriller.mdl` | `w3x.stock.fragdriller` |

來源：`tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j` 的 `CreateNUnitsAtLoc(1, …)`、
`tools/locust-census/census.json` 與 `docs/蝗蟲群對應表.md`。這一段只解釋本次責任判定，
屬於 Main 造積木的 provenance；Editor 不讀取、解析、轉換或直接使用 `.mdl` 與蝗蟲 unit。
Editor 的自動守衛只核對 Main 已出貨的 `model@1` model key 與可用 authoring 欄位。

原作不是沿線建立一排光球。光束本體是一個帶模型的蝗蟲單位，JASS／unit 資料控制生成位置、
面向、比例與頂點色；Editor 將既有 `modelFx` 積木的 `scale`、`scaleAxis`、`yawOffsetDeg`、
`spinDegPerSec`、`tint`、`alpha`、`lifeSec` 暴露為可視化控制，再由時間軸組合角色動作、槍口與命中效果。

## 已證實的 instance 接縫

兩顆 `model@1` 都已出貨，模型 mesh 也會套用這次 `modelFx` 的變換與色彩；但目前
`ModelFxRig` 生成 `model@1.fxEmitters` 時只傳入 `vfxId` 與世界座標。內建 emitter 因此不會繼承該次
instance 的 `scale`／`scaleAxis`／`yaw`／`tint`／`alpha`。聚焦 framebuffer 重驗已證實：縮小、改色或
移動模型後，固定黃色大球仍維持原尺寸與顏色，遮住角色並破壞藍白／黃藍配方。

這不是缺少光束模型，也不是要求 Main 拼技能。Editor 只要求 Main/Owner 選擇一個可重用且可收據驗證的
語意等價能力：讓模型自帶 emitter 繼承 instance 參數，或允許 per-instance override/disable。
Editor 不直接改 renderer、不讀 MDL/JASS，也不另疊每招專用粒子遮掉問題。機器交接清單見
[EDITOR_VFX_TEMPLATE_HANDBACK.md](EDITOR_VFX_TEMPLATE_HANDBACK.md)。

## 污染防線

`ReviveHuman` 的 WC3 glow 是 additive 素材。Main 的 `ModelFxRig` 已依 glTF/WC3 metadata 設定混合模式，
而 Editor 必須在確定性 seek／截圖前預載貼圖並編譯材質。冷啟動時看到的白色方板不得被解讀為
「缺少光束積木」，也不得用刪除模型、沿線排 pulse/flare 的方式掩蓋；應由同格 framebuffer 隔離確認
是素材本身、材質混合，還是尚未完成 GPU upload／shader compilation。

## Main／Editor 邊界

- Main 已出貨上述兩顆模型積木；舊的「缺少連續光束模型」判定已撤回。
- `godie-nbbc.e`、`godie-ogrh.r`、`godie-o00x.r`、`godie-e002.ex`、`godie-e00l.ex`、
  `godie-hvsh.r` 的精確顏色／尺度仍受上述 emitter instance 接縫阻塞。`godie-hart.r` 的直立終結柱使用
  其他 primitive，不在此阻塞內。
- Editor 負責黃藍／橘金／藍白配方、橫直方向、粗細長度、角色動作、時間軸、鏡頭與視覺驗收；Main
  只補可跨技能重用的低階 emitter instance 能力。
- `ReviveDemon.mdl`（蝗蟲 `n00M`）目前在 census 存在，但沒有對應 `model@1`／GLB。它不在本輪七招的
  JASS 呼叫鏈上，因此是非阻塞的 Main 資產缺口；未來有成品需要它時，應請 Main 匯入可重用模型積木，
  Editor 不得自行偽造替代模型。

# 魔法陣透明底實機驗收

驗收時間：**2026-09-01 10:31（Asia/Taipei）**
程式版本：`feat/vfx-forge-codex`，基底 `298393b5`，本報告隨本次修正提交。

> 📅 **證據的時間身分（GH#795）**：`HEAD=298393b5` 工作樹

## 根因

素材的 PNG 已有 alpha，但 `ModelFxRig` 對所有發光材質一律套用 Babylon
`ALPHA_ONEONE`（`SRC + DEST`）。這個模式不讀來源 alpha，因此透明區若仍保留 RGB，
實際遊戲會把整張平面卡片畫成白色或有底色的矩形。這不是只補一張 PNG 能解決的素材問題。

## 修正

- 優先讀 glTF material extras 保存的 WC3 原始混色；`AddAlpha`／filter mode 4 改用
  `ALPHA_ADD`，讓貼圖 alpha 真正參與合成。
- 發光材質若明確指定 `alpha < 1` 也必須讀 alpha；只有舊 GLB 沒有原始混色 metadata
  時，才用薄且近正方形的符文／魔法陣幾何作退路。
- 細長光束仍使用 `ALPHA_ONEONE`，保留原作疊光亮度。
- 判斷來自 mesh 幾何，不維護魔法陣 model id 白名單；新加入的同形素材會自動受保護。

## VFX Forge 實機 A/B

同一份未儲存草稿、同一技能 `godie-hart.r`、同一時間 `1.080s`、真 Sim／真
`VfxSystem`／真 `CameraRig`：

- [修正前：midchilder 的透明區被 ONEONE 忽略，出現實心亮方片](before_midchilder_oneone.jpg)
- [修正後：midchilder 只留下紅紫符文形狀，底板可見](after_midchilder_alpha_shape.jpg)
- [第二素材：grandundeadaura 只留下圓環與符文，沒有方形底板](after_grandundeadaura_alpha_shape.jpg)

以上草稿只用來驗收，沒有寫回 `content/vfx-scripts/`。

## 自動守衛

守衛直接載入出貨 GLB，再經真 `ModelFxRig.spawn()` 檢查最後掛在 mesh 上的 Babylon
材質。下列 7 個魔法陣／符文模型即使節點 alpha 為 1，仍至少有一個發光材質必須
依原始 metadata 或舊素材幾何退路讀 alpha：

`darkportaltarget`、`divinering`、`grandorcaura`、`grandundeadaura`、
`midchildernanohaaura`、`oblivionaura`、`war3mapimported-poweraura`。

另以 `oblivionaura`、`tomeofretrainingcaster` 驗證技能節點指定 alpha 0.9 時，所有
發光材質都會讀 alpha，不會讓這格設定成為死資料。

同一組測試另要求 `revivehuman` 與 `monsoonbolttarget` 的長條光束核心仍保留
`ALPHA_ONEONE`，避免用去背修正換來光束整體變暗。

最後逐份載入目前 repo 內全部 **14 份**帶 WC3 `AddAlpha` metadata 的 GLB，確認每一份
標為 `AddAlpha` 的材質都實際採用 `ALPHA_ADD`，不是只修正上述魔法陣樣本。

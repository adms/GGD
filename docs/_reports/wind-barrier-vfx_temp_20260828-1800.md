# 20-01 風王結界特效 —— 「太奇怪、太濃 且太久」(GH#848)

> owner 2026-08-28 逐字：「風王結界特效太奇怪、太濃 且太久」

## 它現在（修之前）畫什麼 —— 量到的，⛔ 不是猜的

| 層 | 來源 | 內容 |
|---|---|---|
| 開啟那一下的施法演出 | `ability-vfx-bindings.json`（**第三階**推導綁定，A0DZ 的 w3a art:caster）蓋掉文件自己的 `fx.prim.wind.tornado`（第四階） | **HolyAwakening 整組 6 顆** —— 一支風系隱形結界，開關時炸一發**金色聖光** |
| 開著期間（手部） | `ambient-vfx.json` 的 `whileToggle:"W"` → `godie-herosaber-p1`（GH#546，owner 要的開/關指示） | 左手連續青色光點流 |
| 開著期間（身體） | `form-visuals.json` `godie-e00l`（青白 tint ×1.04 身高） | 刻意的美術決定，沒動 |

### 三個形容詞各對到的數字

**太奇怪** —— 綁定表把 A0DZ（w3a art:caster = HolyAwakening.mdl，證據正確）推上來：
金色聖光圈 + modulate 黑煙，蓋在「風之結界」上。階梯第 1 層（owner 設計）> 第 5 層（w3x 設定）。

**太濃** —— 前載（frontLoadDoc）後每次開啟 ≈ **126 顆**：
p00 10 + p01 10（modulate 黑煙,size 1.11–1.39）+ p02 36（additive 星）+ p03 10
+ **p04 30（additive 圓盤 size 1.85→7.39u）** + p05 30（光芒 1.40→3.83u）。
對照文件自己挑的風旋渦 prim：**44 顆**。

**太久** —— 兩半：
1. ⭐ **先驗了接線：toggle 關閉「真的會停」**，⛔ 不是缺陷 ——
   `AmbientVfx.gateSig`（每幀 attach 重算）+ `detach()` 真拆；守衛
   `apps/client/src/vfx/toggleVisuals.test.ts`（走出貨 snapshot→hudStore→AmbientVfx），本輪跑過 ✅ 綠。
   關閉那一下也**不會**再炸一發：`abilitySystem.ts` 的 toggle-off 分支在
   `world.emit("abilityCast")` **之前** return（第二次按下＝關閉排在冷卻閘前）。
2. 授權壽命：holy 組 0.9–1.2s（vs 風旋渦 0.3–0.72s）；手部流 rate 50/s × 1.0s
   （穩態 ≈50 顆掛在手上、下墜 ~1.9u）—— 開著期間永遠在噴，密度讓它讀成「一直很濃」。

## 修了什麼（全部可 rollback）

| # | 檔 | 改動 | 舊值（rollback 用） |
|---|---|---|---|
| 1 | `tools/skill-remake/common.py` | 新增 `vfx_layers=` 表格欄位出口（同 `vfx_key`/`persistent_vfx` 形狀，⛔ 不是逐支 if） | 無此欄位 |
| 2 | `tools/skill-remake/heroes/godie-e002.py` | 20-01 加 `vfx_layers=[{"vfxKey":"fx.prim.wind.tornado"}]` —— **第一階作者堆疊贏過綁定表** | 無此格（⇒ 綁定表接管） |
| 3 | `content/abilities/godie-e002.w.json` + `content/champions/godie-e002.json` | `bash scripts/genrun.sh skillremake:json` 重生成（只多 `vfxLayers` 一節，鏡像同步） | 無 `vfxLayers` |
| 4 | `content/vfx/godie-herosaber-p1.json`（genguard：手編） | 手部流 `rate` **50→30**、`lifetimeSec` **1.0→0.65**（穩態 ≈50→≈20 顆；仍清楚可見，GH#546 的開關指示保留） | rate 50.0 / life {1.0,1.0} |

⇒ 開啟演出：126 顆聖光（0.9–1.2s 授權）→ **44 顆風旋渦（0.3–0.72s，swirl 540°/s）**。
rollback ＝ 刪 heroes/godie-e002.py 那一格 + genrun；手部流兩個數字改回舊值。

## 守衛（體驗層，各一條薄的）

- **新** `apps/client/src/render/vfx/windBarrierCastVfx.test.ts`（~60 行）：
  出貨技能 JSON + 出貨綁定表過**出貨解析器** —— ①第一階 identity（表碰不到它）
  ②解析層無 holyawakening、有 wind。
  **突變紀錄**：修之前（出貨 doc 尚無 vfxLayers）先跑 → **兩條紅**；genrun 之後 → 綠。
- `packages/shared/src/content/vfxBindings.test.ts`：`covered` 母體補上「第一階（authored
  vfxLayers）不屬於表該換掉的母體」—— 解析器的階梯本來就這樣寫，20-01 是第一個實例。
  （⚠️ 這一檔在柵欄外，改動只有母體過濾一處 + readAbility 型別，理由如上。）

## 給主 session 的交接

- ⛔ 本 lane 未跑 `skills:sync`；`genrun skillremake:json` 的步驟鏈自帶兩次 `content:build`，
  所以 bundle/manifest/_index 已含本改動，但**未 commit**（那幾份本來就被其他 lane 弄髒）。
- genrun 的 `deriveCastTimes --write` 順帶把 4 份既有過期的 castTimeSec 重算了
  （godie-emns.ex 1→1.033、godie-ewar.ex/.r 1→1.233、godie-hapm.ex；含 godie-ewar.json 鏡像）——
  **不是本票的改動、未 commit**，主 session 的 skills:sync 會產出一樣的結果。
- `skillremake:docs`（90支 md / 引擎須知 §13.10）將因 vfxLayers 過期 → `skills:check` 會指名；
  主 session 統一 `pnpm skills:sync` 即可。
- godie-e00l.w（變身態的 W）綁定表也有 holy 組，但 toggle-off **不發 abilityCast** ⇒
  變身態永遠不會播它；刻意不動（e00l 不在 skillremake 產物裡，改它要另走鏡像規矩）。
- 👁 AC 的「owner 實場確認」仍待 owner —— 本 lane 的證據止於守衛 + 靜態量測。

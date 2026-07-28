# 交接：2026-07-26 深夜這一段的前情提要與未完成品

> **下次說「重新開始」時先讀這一份。** 它記的是**還沒完成的東西在哪、為什麼停在那裡、
> 重啟時要注意什麼**。已完成並合併的東西在 `docs/_execution-batches.md` 與 git log 裡，
> 這裡不重複。

---

## 一、這一段的三個重點結論（重啟時最容易踩回去的坑）

### 1. 這個專案的頭號失敗模式，這一夜抓到 **10 次**

**「做了，但玩家拿不到」** —— 而且測試全綠。已知的變體有五種：

| 形狀 | 案例 |
|---|---|
| 東西在畫面外／地板下 | #93 煙火、#247 跳躍出框、#235 |
| 算出來了但沒接到終點 | #259 語音距離模型算完沒變成音量 |
| 從渲染樹刪掉還是全綠 | #265 兩行 `<RoundReportCard />` → `{null}`，3566 條全綠 |
| **斷言方向與缺陷方向相反** | #73 對「零件缺席」寫了「某物不該在」的斷言，永遠不可能紅 |
| **受測體根本不是真的東西** | #221 用 registry 裡不存在的 `championId: "probe"`，且 order 只餵第一個 tick |

**因此每一份工作流交辦都必須要求：**
1. 一條**接線守衛**（斷言端到端行為，不是純函式算術）
2. 明確指出**刪掉哪一行會讓功能靜默失效**
3. **實際做那個變異一次**並回報幾條變紅 —— 沒做過就是沒交付

### 2. 我自己踩過、下次要避開的三個具體陷阱

- **`expect(babylonObject).not.toBe(...)` 失敗時會偽裝成 OOM 崩潰。**
  vitest 為了印 diff 深度序列化 Babylon 材質 → 材質反向參照整個 scene →
  4GB heap 爆掉 → worker 死 → JSON reporter 收到 **0 條 failed**。
  **對 Babylon 物件一律比 `.name` 字串。** (#276 的 M6 變異因此假報「0 紅」)
- **讀巢狀結構的 reader 要附「真的讀到東西」的地板斷言。**
  我寫過讀 `champ.q` 的測試，實際結構是 `champ.abilities.Q`（大寫、深一層）——
  它一支都沒讀到、永遠是綠的。是因為真的做了變異才抓到。
- **掃描式守衛要分得出 JSX child 與屬性值。** `title={x}` 完全符合 regex 卻一個像素都不畫。

### 3. 工作流交辦的結構性錯誤（我犯了三次）

**勘查／量尺階段的 agent 沒有 `isolation: 'worktree'`，所以它們在主 worktree 裡跑。**
→ 檔案漏進 main、agent 在主 worktree checkout 自己的分支害我整段工作落在錯分支、
併行工作流在我跑全套時建立又刪除檔案造成假 FAIL。

**規則：每一個會寫檔的 agent 都要 `isolation: 'worktree'`，不只實作 agent。**
docs commit 一律逐檔列出路徑，永遠不用 `git add -A`。

---

## 二、被中斷的工作流（分支都在，可以續做）

session 結束時有 **9 條工作流在跑**，全部被中斷。**分支上的 commit 都還在**，
但驗證階段多半沒跑完。**續做前先 `git log main..<branch>` 看它做到哪。**

| 分支 | 在做什麼 | 狀態 |
|---|---|---|
| `feat/262-vfx-lifecycle` + `feat/262b-vfx-gaps` | 特效回收表 + 煙火密度 | 262 被推翻（四個洞），262b 在補 |
| `feat/275-battlefield-items-and-forge` + `feat/275b-gutter-chrome` | 戰場道具欄 + 鍛造層數 | 275 被推翻（三個洞），275b 在補 |
| `feat/276-lod-hookup` + `feat/276b-lod-cache` | LOD 接線 | 276 被推翻（快取反噬），276b 在補 |
| `feat/277-mouse-target-assist` | 滑鼠世界座標索敵 | 剛開始 |
| `feat/278-invite-friend` | 拉好友進房 | 剛開始（第一階段是實測找斷點） |
| `feat/279-death-notice` | 死亡通知 | 剛開始 |
| `feat/280-round-end` | WIN/LOSE + MVP 新公式 | 剛開始 |
| `fix/281-firering-mobs` | 火圈燒殭屍 | 剛開始 |
| `fix/282-invisibility` | 隱形沒作用 | 剛開始（第一階段是普查） |

⚠️ **重啟時不要盲目重開全部。** 每一條的完整交辦（含已查清楚的前提、禁區、
變異要求）都存在
`/Users/Takuro/.claude/projects/-Users-Takuro-GGD/<session>/workflows/scripts/*.js`，
但那個路徑會隨 session 變。**下面第四節有每一條的核心事實，重寫交辦時直接用，不要重查。**

---

## 三、被推翻但**診斷有價值**的三份交付（不要重做診斷）

### #268 技能射程（兩輪都被推翻）
量尺已經量對了，**直接沿用，不要再量**：
- 用 shipped `CameraRig` + `scene.createPickingRay`（= `rig.screenToGround`）
- 正前方 **5.499**、正後方 **3.895**、16:9 極大 **10.601 @58.75°**、4:3 極大 8.739
- `pickUnit` 圓盤 = body 0.6 + slack 0.45 = **1.05** → **`CLICK_MIN` = 4.945**（全 360° 保證點得到）
- **1280×720 與 1920×1080 逐位元相同**（fov 是垂直的，解析度不進入幾何）
- **最保守的是 4:3 不是手機橫向**（`effectFraming.MIN_ASPECT = 4/3`）
- HUD 底部 66px + 相機跟隨落後 0.75u → **實戰最壞全方位可達半徑 ≈ 2.6u**
- 判準核心：**可瞄準性由 castType 決定**。`self` 42.6% / `skillshot`+`dash` 9.9% 完全不受限；
  `ground` 13.9% 單向受限；`targeted` 33.4% **唯一會靜默失敗**

**但砍射程被真對戰推翻**：targeted 成功率 45.6% → **12.6%**，
遠程英雄「射程 < 0.9× 自己普攻」從 53/74 變成 **74/74**。

→ **正確答案是 `#277`：給滑鼠加世界座標目標輔助。**
`GamepadInput` 用 `nearestEnemy(self, range, aimDir)`、`TouchInput` 走 `pickNearestUnit`，
**兩個都完全繞過螢幕。滑鼠鍵盤是唯一沒有的那條，而那正是 owner 家人在玩的主要路徑。**
一旦滑鼠也走那條，4.945 的硬天花板直接消失，**217 支射程一支都不用改**。

### #269 自動攻擊（已由 #274 修好並合併）
真因是 `OrderSystem.ts:230` 的 `if (nav.moveTarget !== null) continue` 碰上
客戶端每一幀重送 move order。**已修**。剩下的：
- 普查速率閘掉出 **6 位英雄**（`u011 0.14 / zombiex 0.29 / h01u・hpb1・naka・udea 0.43`），
  用 ratchet 停住沒調低門檻。真因追到 tick 級：`godie-u011` t45 提交揮擊並立刻扣掉整段
  45 tick 冷卻 → t52-57 前搖被 hitstop/hitstun 凍住 → t56 擊退把目標推出射程 → t58 取消＝空揮。
  **修正點在 `BasicAttackSystem` 與擊退手感。**

### #276 LOD（被推翻）
接線是真的（真 Chrome 驗過抓 `-mid.glb`、換階無縫、tint 跟著走），但：
- **cache key 從「模型」變成「模型+tier」，而那個 cache 明文不淘汰** →
  滾一次滾輪拉遠拉回：container 12→23、常駐三角形 **+36.0%**、texture **+88%**、下載 **+53.6%**
- 那張「−69.5%」的表每列都是 `new Scene` + `clearAssetByteCache()` 之後量的 = **執行期不存在的狀態**
- `modelLod.ts` 檔頭本來就禁止這件事，而這次沒動它 → **文件與程式碼互相矛盾**
- **41/166 個變體因減面削掉輪廓被隔離**（heroxelloss 翅膀 −71.8%、heromiku 雙馬尾 −39.2%）
- ⚠️ **我交辦裡的前提是錯的**：小怪用 `blocky-undead.glb` 只有 **168 tris**，
  在 `gen_lod` 的 1500 tris 底線之下、**根本沒有變體**。雜兵那一階一分錢都省不到。

---

## 四、owner 的裁決（已生效，不要再問）

| 項 | 裁決 | 狀態 |
|---|---|---|
| 魔力雙峰 | `maxMana ×1` · `manaRegen ×6`；七位吃魔英雄 baseStats `maxMana +100` / `manaRegen +2` | ✅ 已推 |
| #274 bot 邊退邊打 | **保留**（風箏的定義本來就是邊退邊打） | ✅ 無程式改動 |
| 取得半徑 6 vs 48 | **不放大**（「不要被拉過去打」），`MELEE_ACQUIRE_FLOOR` 維持 6 | ✅ 無程式改動 |
| 鍛造 capstone | **60~150%**（期望值 55% → 105%） | ✅ 已推 |
| 肉鴿殭屍 | 血 20% / 攻 10% / 數量減半 / **回血歸零** | ✅ 已推 |
| 火圈 vs 殭屍 | **燒，但小怪吃固定傷害**（不是 %最大生命） | ⏳ `fix/281` |
| 結算 HP 剩餘量 | 用**比例**(0~1) 不是絕對值 | ⏳ `feat/280` |
| 等級上限 | 先記錄戰況，後面再參考分析 | 擱置 |
| 打我阿笨蛋 | **不開放，不要列進清單** | — |
| 三條描述↔JASS 衝突 | **照 JASS 修正** | 待辦 |
| 節拍疊層 | (a) 給小怪 StatsComp **和** (b) 節拍改掛攻擊者身上，**兩個都要做** | 待辦 |

---

## 五、還沒開工的 owner 要求

1. **`1 vs bot 可以用作弊碼，但一旦用了就不算分數跟藍水晶獎勵`**
   ← 這是 session 最後才進來的，**完全還沒開工**。
   已知：HUD 有 `cheats` slot（`hudLayout.ts`，`cheatsAvailable` 為真才渲染）。
   要做的是「用過作弊碼」這個旗標要能傳到結算與水晶發放那一端。
2. **武器道具欄要在戰場上顯示** —— `#275b` 在做，但被推翻兩次，狀態未定
3. **遠距投射物太陽春、全部共用，要參考 w3x 逐英雄移植** —— 完全沒開工
4. **#259 的語音空間混音試聽頁要收進後台** —— 沒開工
5. **喪標麥可補滿五格技能**（#236）· **技能組忠實度 114 位**（#230）· **變身系統**（#249/#119）
6. **延遲改進計畫**（`docs/_延遲改進計畫.md`）批次二的另一半（客戶端 zone 剔除）、批次三（施法輸入回饋）

---

## 六、⛔ 兩個會讓人白做工的機制陷阱

### 1. 後台 override 逐 key 蓋掉內容檔
`normalizeCombatEnv({ ...content, ...admin })`（`apps/game-server/src/config/combatEnv.ts:141`），
而後台每次存檔 PUT **完整 26 個 key**（`apps/admin/src/combatEnv.ts:336`
「ALWAYS the complete table」）。

**→ owner 只要在 後台→戰鬥系統 存過任何一次，改 `content/config/combat-env.json`
對他玩到的那一場就是零影響。** 而帳本記著那份 override 已經搬到他的主機上了。

更糟：後台對 `maxMana` 的「重設」值是 `defaultForKey("maxMana") = 1`
（`packages/shared/src/sim/combatEnv.ts:212`），不是出貨值。

**這次改了 `maxMana 3.0 → 1.0` / `manaRegen 4.0 → 6.0`，
⚠️ 若線上有 override，必須同步去後台改，否則這次的平衡調整不會生效。**

### 2. 「跑測試就重寫」的產物檔
`docs/_castability-128.md` 與 `content/assets/model-budget/report.json`
是測試自己重生成的。在缺 gitignore 的 `data/curation/whitelist.json` 的 worktree 裡，
前者會自動從「61 英雄/366 格」縮成「50/300」並刪掉來源說明行。

**→ 任何人在這個 repo 跑完整測試都會弄髒它們。** 上一版被指控「說謊覆寫」很可能是不公平的。
**這個陷阱本身該修**（產物寫進 gitignore 的路徑，或測試在缺白名單時拒跑）。

---

## 七、已知的 flaky 測試（不要為它們改程式）

- `apps/client/src/render/intermission/assetReuse.test.ts`
  「round 2 re-opens the identical market with ZERO network requests」—— 負載敏感，單獨跑必綠
- `packages/shared/src/content/bundle.test.ts` 的 fallback 那幾條 —— 5 秒逾時，
  併行跑全套時會紅，單獨跑 15/15 綠
- `tools/model-budget/report.test.ts` —— 缺營運狀態檔時會紅，與程式無關

---

## 八、重啟時的建議順序

1. **先讀本檔 + `docs/_execution-batches.md`**
2. **確認線上 admin override**（第六節的陷阱一）—— 這次的平衡調整可能沒生效
3. **`git log --oneline -20`** 看最後推到哪
4. 續做 `#277`（滑鼠目標輔助，解 #268 的死結）與 `#281`（火圈燒殭屍）——
   這兩條的前提都查清楚了、範圍明確、風險低
5. 三條「補洞」分支（262b / 275b / 276b）看要不要續做或重開
6. **新開的那條「作弊碼不算分」還沒開工**

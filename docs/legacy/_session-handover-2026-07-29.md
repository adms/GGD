# 交接：2026-07-29 session 暫停點

> **下次說「重新開始」時先讀這一份。** 它記的是「還沒做完的」與「為什麼這樣做」，
> 不是架構說明 —— 架構看 `docs/_session-handover.md`，待辦看 `docs/_execution-batches.md`。

---

## 0. 這次 session 停在哪裡

- **已 push**：`8b405869` = `v0.9.13`，tag 與 GitHub release note 都發了。
- **已 deploy**：ggd.adms.ai 已 `git reset --hard origin/main` 到 `8b405869`，
  `docker compose up -d --build` 丟在背景跑，log 在主機的 `/tmp/ggd-deploy.log`。
- ⚠️ **六步部署協定的第 3 步（localhost 實打）與第 6 步（線上實打）都沒做** ——
  owner 要關機，明確指示直接切版。這一版的玩法變動**沒有任何人真的打過**。
  **下次開機第一件事：線上打一場，把發現記進 `docs/_execution-batches.md`。**

### 這一版特別要盯的三件事（因為沒實打過）

1. **生命倍率 3.0 → 4.0** —— 回合會不會變得太長？TTK 是 #153 調過的，這次直接把分母動了。
2. **`#290` 特殊殭屍改成「該 zone 全英雄、死活都算」** —— 中後期殭屍會明顯變強
   （以前跟小怪等級走、第 9 回合封頂 15,356；現在跟英雄走，L40 就 22,748）。
3. ⚠️ **後台 override 會蓋掉 `content/` 的檔案。** 如果線上曾在「戰鬥系統」頁存過 combat-env override，
   生命倍率 4.0 **不會生效**。上線後先去後台確認有沒有存過。

---

## 1. 被我中途停掉的工作流（要重啟）

**`wf_64e3d9b3-d73` · VFX top-33 → 21 家族原型 + 編輯器**

腳本還在：
`/Users/Takuro/.claude/projects/-Users-Takuro-GGD/1fc1e42e-e26b-4bec-88ef-ca25238c0f4c/workflows/scripts/ggd-vfx-top33-families-wf_64e3d9b3-d73.js`

重啟方式（已完成的 agent 會走 cache）：
```
Workflow({ scriptPath: "<上面那個路徑>", resumeFromRunId: "wf_64e3d9b3-d73" })
```
⚠️ 它在 Census 階段就被我停掉了，所以**大概沒有 cache 可用，等於重跑**。腳本本身沒問題。

它要做的三件事（owner 已裁決，不需要再問）：
1. **修普查方法** —— w3a 覆寫 ∪ JASS ∪ 蝗蟲群 ∪ **base 繼承**（最後一項完全沒做過）
2. **21 個家族原型** + 用真實地圖參數重新綁定
3. **鑄技工坊編輯介面** —— 家族/元素/尺寸下拉 + per-invocation scale/tint/alpha/timeScale/高度

---

## 2. owner 這次下的裁決（都已開單，不要重問）

| 裁決 | 單 |
|---|---|
| 對戰資料記錄 + 後台覆盤分析頁 | [#207](https://github.com/adms/GGD/issues/207) |
| 巴恩大魔王：變身為**非英雄單位** | [#208](https://github.com/adms/GGD/issues/208) |
| 魔法老師：技能書 → **改成輪替施展**（工程量 L→S/M） | [#209](https://github.com/adms/GGD/issues/209) |
| 擴充傳說武器 + **近戰擴散機制目前不存在** | [#210](https://github.com/adms/GGD/issues/210) |
| 商店顯示 **N/20** + 屬性面板套用 | [#211](https://github.com/adms/GGD/issues/211) |
| 回合勝利：自己隊伍 3D model + 評價建議 + 團隊累積積分 | [#212](https://github.com/adms/GGD/issues/212) |
| **白木卡迪那 + 傑富力士**上架（51 → 53） | [#213](https://github.com/adms/GGD/issues/213) |
| 悟空超級賽亞人：靈氣 AoE + 超賽攻擊特效 + 超3球體 + hover | [#214](https://github.com/adms/GGD/issues/214) |
| 衝擊波環優先 + **繼承來的特效沒被普查到** | [#215](https://github.com/adms/GGD/issues/215) |

**已直接改進 repo 的兩件（v0.9.13 內）**：喪標麥可新描述、生命倍率 4x。

### 2b. 工作流分配（2026-07-30 補 —— owner 指出上一版只登記了一個工作流）

⚠️ **分配準則：同時在跑的工作流必須領域互斥。** 上一批發生過 lane 互相覆蓋、
把守衛一起蓋掉、且沒有任何測試發現的事故。

| 工作流 | 涵蓋 | 佔用的檔案領域 |
|---|---|---|
| `wf_64e3d9b3-d73`（VFX 家族） | #215 · #230 · #50 · #205/#272 的特效那半 | `tools/w3x-import/**` · `render/vfx/**` · `content/vfx/**` · `content/abilities/**` · `apps/admin/src/**` |
| `wf_8296b8ab-997`（v0.9.14） | **#207 · #210 · #211 · #212** | `sim/stats/**`(barrier) · `game-server/**` · `platform/**` · `client/src/ui/**` · `sim/effects/**` · `content/items` · `content/loot-tables` |

**還沒分配、以及為什麼：**

| 單 | 擋住的原因 |
|---|---|
| **#208** 巴恩非英雄變身 | 撞 VFX 工作流的 `tools/w3x-import/**`。**等 VFX 收工。** |
| **#213** 白木卡迪那 + 傑富力士上架 | 撞 `content/abilities/**`（要補五格技能）。**等 VFX 收工。** |
| **#214** 悟空超級賽亞人 | 撞 `render/vfx/**` + `content/abilities/**`。**等 VFX 收工。** |
| **#209** 魔法老師輪替技能書 | ⛔ **等 owner 裁決**：①「雷天大狀」四字全圖不存在，疑為 `A0PP`「82-04-01 術式兵裝-疾風迅雷」（推斷，非地圖字串）②`godie-emfr`「魔法老師-涅吉」是編號 **15**，但術式兵裝是編號 **82** —— 要做哪一隻？ |

---

## 3. 這次量到、下次會用到的硬數字

### 變身
- w3x 宣告 **26 對**變身，全部走 WC3 Metamorphosis（`Eme1`/`Emeu`）
- **21 對兩半共用同一個 `modelKey`** —— 但 `usca`/`umvs` 差距很大
  （妙蛙種子 1.2→妙蛙花 3.0、皮卡丘 0.9→1.8、安云移速 300→522、草泥馬移速→0）
- 出貨名單 51 位，其中 **19 對**在名單內；真的換模型且在名單內的只有 3 支
- ⚠️ **抽取器沒有 hero 濾網**（我先前說有，是錯的）。放寬到非英雄目標**多 0 對** ——
  巴恩漏掉的真正原因是**技能家族不同**：`A01Z`「37-04 魔界之王」base 是 `ANef`
  = Brewmaster 三分身，分裂成 `u001`/`u00D`/`u00E`，根本不是 Metamorphosis

### 特效模型（四源合掃）
- **497 種 / 1,694 次**（技能覆寫 236/669 · JASS 118/560 · 蝗蟲群 132/223 · 一般單位 164/242）
- 蝗蟲群/dummy 特效單位 **231 個**；JASS `AddSpecialEffect*` 呼叫 **558 次**
- `WarStompCaster` **111 次**（w3a 只有 45）· `ThunderClapCaster` **105 次**
- `BlinkTarget.mdl` **77 次裡 76 次在 JASS，w3a 一次都沒有**
- owner 指定優先的 **33 個模型 = 722 次 = 43%**，歸成 **21 個家族**
- ⚠️ **1,694 仍是低估**：`A0D5` 約束與勝利之劍 base 是暴雪 `AOsh` Shockwave，
  衝擊波環是**從 base 繼承**的，w3a 一個字都沒寫

### VFX 綁定現況
- 技能文件 697 份 · 有 `vfxKey` 的 646 (93%) · 不同 key 157 種
- 指向 `fx.prim.*`（**依中文名猜的**）**595 支 (92%)**
- 指向 `fx.w3x.*` / `godie-*`（**真的來自原作**）**只有 34 支 (5%)**
- ⚠️⚠️ **綁定不走 ability doc 的 `spawnVfx`，走 `vfxKey` → `ContentDb.vfxFor`。**
  我掃錯欄位過一次，量到「99% 技能沒有 VFX」這種戲劇化但完全假的結論。
  **任何覆蓋率斷言都要讀 `vfxFor` 的輸出**（第⑦號故障形態）。

### 悟空（#214，從 raw w3u/w3a 二進位讀的，抽取器全部沒讀出來）
- `ua1f/ua1h/ua1q`（普攻濺射）**兩形態都沒設** —— 不是 attack splash
- `A0SI`「09-002a 悟空指令靈氣 (25%)」base `ACac` Cloak of Flames = **光環型 AoE**，特效 `poweraura.MDX`
- `A017`「超賽攻擊」= `WarStompCaster.mdl` 衝擊波環 + `StampedeMissileDeath.mdl`，掛 `weapon` 點
- `A0MI`「球體(悟空正常)」`Gokuhead.mdx` ⇄ `A0MJ`「球體(悟空超3)」**`Goku3head.mdx`**
- `A0S7`「09-002b 悟空**隱藏法術書**」base **`Aspb`**，提示字串竟是「**涅吉魔法大全**」
- 攻擊冷卻 1.90 → 1.20 · 移速 310 → 400 · **`umvt: hover` + `umvh: 30`**
- ⚠️ **hover 跟 #168「Models float up when idle」直接衝突** —— #168 把浮空當 bug 修掉了，
  悟空變身態的浮空是**設計**。上架前要確認 #168 的修法不會把他壓回地面
- `Aspb` 至少三位英雄在用（悟空 / Saber `A05M`「20-01-00 風王法術書」/ 魔法老師）→ **是核心 primitive 不是特例**

### 魔法老師（#209）
- ⚠️ **「雷天大狀」四個字整張地圖不存在。** 疑似對應
  `A0PP`「82-04-01 術式兵裝-疾風迅雷」（施法特效 `HeroRaichuS3.mdx`），
  另有火屬性兄弟 `A0PS`「82-04-02 術式兵裝-獄炎煉我」。**這是推斷，需 owner 確認。**
- ⚠️ **owner 說的「魔法老師」和機制所在的英雄可能不是同一隻**：
  `Emfr` = 編號 **15** = `godie-emfr`「魔法老師 - 涅吉」（在開放名單內），
  但術式兵裝是編號 **82**。**要問 owner。**

---

## 4. 下次開機的建議順序

1. **線上打一場**（六步協定第 6 步，這次欠的）→ 記進 `docs/_execution-batches.md`
2. 確認後台有沒有 combat-env override 蓋掉生命倍率 4.0
3. 重啟 `wf_64e3d9b3-d73`（VFX 21 家族 + 編輯器）
4. 依 roadmap 走 v0.9.14（對戰資料記錄 —— 它是後面所有平衡決策的證據來源）

**Roadmap（五版，平行最大化）**：hosted 頁面
`/private/tmp/claude-503/.../scratchpad/ggd-roadmap.html`
（重發同一個 file path 即原地更新，URL 不變）
- 變身英雄總表 · 特效模型頻率表也都是 hosted 頁面，見對話紀錄

---

## 5. 這次 session 學到、值得寫進守則的

**① 平行 lane 會互相覆蓋，而且守衛會跟著被蓋掉。**
上一批工作流有一個 lane 交付的 `mobs.ts` 被另一個 lane 蓋掉，
結果 `matchHighest` 從「有守衛、突變會紅」變成「完全沒生效」，**沒有任何測試發現**。
→ 同版的 lane 必須**領域互斥**。這不是效率考量，是正確性考量。

**② 「已量測」的宣稱有兩種錯法，我這次兩種都遇到。**
- 假的量測：「不帶 self 的正好是 `Aoar`/`Aabr` 兩筆」→ 實際 7 筆
- **過度的駁斥**：駁斥者說 7 筆所以結論錯 → 但其中 5 筆是 enemy 光環，`self` 本來就沒意義，
  結論其實成立，只是句子漏掉「友方」兩字
→ **自己重量一次，不要照單全收任何一邊。**

**③ 掃錯欄位會得到戲劇化但完全假的結論。**
我量 VFX 綁定率時掃 `spawnVfx`，得到「99% 技能沒有特效」。實際綁定走 `vfxKey`。
→ 覆蓋率一律讀**出貨的解析函式**的輸出，不要掃 doc 欄位。

**④ 註解說謊的四層版本。** 鳳凰蛋的 10 秒：`adur`(0.01s) 與 `ahdu`(10s) 被一句註解混為一談，
抽取器、fixture、出貨表、**以及一條把 bug 釘住的測試**四層自洽地一起錯。

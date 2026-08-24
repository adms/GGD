# P1 閃電「還是沒上線」—— 逐段量到底斷在哪（2026-08-24）

owner（第二次回報）：
> 「閃電特效**還是沒上線** 連鎖閃電 是在連鎖的對象間拉出閃電 但我用**飛鼠天譴** 什麼閃電都沒看到」

⭐ **結論：源碼這一側，整條鏈是通的。逐段量過，⛔ 沒有找到斷點。**
⇒ 剩下唯一沒被排除的嫌疑犯是**部署**（見文末）。

---

## 逐段量測（⛔ 不引用任何 commit 訊息或票的結論，全部自己跑）

跑法：真的 `content/` → 真的 `SimWorld.step()` → 出貨的 `isFannedOutEvent`
→ 出貨的 `VfxSystem.handleEvent` + `update()` → 讀真的 Babylon ribbon 頂點。

| # | 段 | 量到的 | 判定 |
|---|---|---|---|
| 1 | 出貨 `godie-udea.r` 文件 | `effects = [dash, chainLightning, damageArea]` | ✅ |
| 2 | `content/bundle.json`（真正送到玩家的那一份） | 同上，`chainLightning` 參數齊全 | ✅ |
| 3 | 客戶端 `resolveCastTarget`（`castType:"dash"`） | 送 `{type:"dir"}`，⛔ 不是 `self` | ✅ |
| 4 | `castAbility` | `"ok"` | ✅ |
| 5 | sim 逐跳 `world.emit("chainLightning")` | **36 則**，`segments` 座標有效 | ✅ |
| 6 | `isFannedOutEvent`（出貨白名單） | 36/36 過線 | ✅ |
| 7 | `MatchRoom.deliverSimEvent` | `{type,tick,data}` 原樣，⛔ 無投影/改名 | ✅ |
| 8 | `EventBatcher` / 客戶端 `drainEvents` | 只分批不丟；512 上限遠不會碰到 | ✅ |
| 9 | `GameApp.handleDrainedEvent` | `vfx.handleEvent` 是**第一行** | ✅ |
| 10 | 客戶端 `case "chainLightning"` | 呼叫 `strikeArc`，全檔只有這一個真 case | ✅ |
| 11 | 畫面上真的有東西 | **90 幀中 32 幀**有亮著的弧，尖峰 22 條同時 | ✅ |

### 主動排除的四個嫌疑犯（任務點名的）

| 嫌疑 | 量到的 |
|---|---|
| **#638 zone 隔離把它丟掉**（最新的嫌疑犯） | ⛔ **不成立** —— `vfx.handleEvent` 在 `zoneOk` 計算**之前**就跑完了；`cueEventZone` 只擋音效／語音 |
| **`EventMessage.data` 中途被弄丟**（失敗形態⑧） | ⛔ 不成立 —— 逐格量到 `segments` 一路到客戶端 |
| **弧畫在畫面外／零像素**（失敗形態①） | ⛔ 不成立 —— y = 0.84–0.95（軀幹高度）、`mat.alpha > 0`、`alphaMode = ALPHA_ADD`、`alwaysSelectAsActiveMesh = true`（⇒ 不會被視錐剔除） |
| **`ArcBoltFx` 上限吃掉它** | ⛔ 不成立 —— `take()` 滿了會**搶最舊的**，⛔ 不回 null，不丟跳 |

### 另外排除

- **打小怪不算數**？⛔ 不成立 —— `enemiesInCircle` 只排除**同隊**，改用 `MONSTER_TEAM` 重跑：36 則、32 幀有弧。
- **`case` 有三個所以後兩個是死碼**？⛔ 不成立 —— 另外兩處是註解，真 case 只有一個。
- **`arcCastPlan` 那 28 支走另一條路**？與這一支無關（天譴走 `chainLightning`）。

---

## ⚠️ 剩下唯一沒排除的：**部署**

- 修這條的 commit `24c198d1`（2026-08-23 08:23）**已在** `v0.26.0 / v0.26.1 / v0.26.2` 裡。
- 客戶端 JS 是 **build 時烘進映像**的，⛔ 只有 `content/` 是 live bind-mount。
  ⇒ 若最後一次部署走的是 `--content-only`，**新內容 + 舊客戶端映像** ——
  玩家拿到的 `bundle.json` 有 `chainLightning`，而畫弧的那段 JS 是舊的 ⇒ 症狀逐字吻合「什麼閃電都沒看到」。

⭐ **建議 owner 側的下一步（我不碰正式站）**：完整重建部署一次
（⛔ 不加 `--content-only`），然後**開全新分頁**看 console 那一行 `content loaded`。

---

## 這一輪留下的閘

`apps/client/src/vfx/chainLightningShippedChain.test.ts` ——
把**三段各自為政的守衛**接起來跑一次，斷言**幾何**（弧的兩端貼在 sim 真的跳過的線段上），
⛔ 不是「事件有送」。

⚠️ 在此之前的三條守衛為什麼全綠：
`sim/…/chainLightning.test.ts` 手寫 `EffectDef`、
`vfx/chainLightningArc.test.ts` 手寫 payload、
fanout 白名單只證明「那個字串在一個 Set 裡」——
**三條各守一段，接縫沒有人守**（失敗形態⑤）。

**突變紀錄**：`case "chainLightning"` 裡的 `this.strikeArc(...)` 停掉 →
①（36 則事件過線）**仍然綠**，②（畫面上有弧）**紅**。
⇒ 這一條真的在問「玩家看到什麼」，⛔ 不是「事件有沒有送」。

---

## ⛔ 不屬於我的、但擋著 typecheck 的東西

`pnpm typecheck` 目前 **EXIT=1**，兩個錯誤都在 `apps/client/src/vfx/chainLightningAudition.ts`
（未追蹤檔 `??`，另一條 lane 在飛）：

```
chainLightningAudition.ts(182,31): TS2554: Expected 1 arguments, but got 2.
chainLightningAudition.ts(197,5):  TS2353: 'debug' does not exist in type 'ChainAuditionHandle'.
```

⛔ 柵欄外，我沒有動它。同一條 lane 也在 `VfxSystem.ts` 加了 38 行（`MoveTrailFx`），
所以**我的 commit 只收自己的守衛檔**，⛔ 沒有把 `VfxSystem.ts` 送上車。
（突變驗證的還原是用 `Edit` 逐行改回，⛔ 不是 `git checkout <檔>`。）

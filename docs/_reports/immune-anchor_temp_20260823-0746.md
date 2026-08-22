# lane A —— `immune` 事件沒有帶座標 ⇒ 「免疫」在 5/13 張地圖上從來沒被畫出來過

2026-08-23 · 檔案柵欄：`packages/shared/src/sim/combat/damage.ts` ·
`apps/client/src/net/evadeSightings.test.ts` · 新增 `apps/client/src/net/immuneAnchor.test.ts`

---

## 1. 複驗（第三守則：註解會說謊，去驗證）—— 交辦的每一條都成立

| 宣稱 | 複驗方式 | 結論 |
|---|---|---|
| emit 站在 `damage.ts`，**兩處**，沒有 `x`/`z` | 讀 `:843` `:867`（改動前） | ✅ 成立。兩處 payload 都只有 `{target, source, amount, dmgType, origin}` |
| 客戶端因此退回 fallback 錨點 | `net/RoomConnection.ts::recordEvade` —— `typeof data.x === "number" ? data.x : 0` | ✅ 成立，退回 `(0,0)` |
| 13 張出貨地圖 | `ls content/arenas/arena.*.json` | ✅ 13 張 |
| 其中 **5 張**兩個 zone 都在 `x=±40`、`boundaryRadius 24` | 逐檔 dump zone 幾何 | ✅ `godie` / `skeleton` / `castle` / `colosseum` / `dota` |
| `anchorInsideArena()` 對它們回 false | `render/anchorBounds.ts`：`margin = CHAMPION_BODY_RADIUS × 2`；`\|0-(-40)\| = 40 > 24 + margin` | ✅ 回 false |
| 另外 8 張畫得出來但飄在 zone0 中央 | 那 8 張 zone0 center 就是 `(0,0)` | ✅ 成立 |
| `eventFanout.ts` 白名單它的唯一理由 | `:388-400` 逐字：「these two events are the ONLY evidence a client can have that a hit was refused」 | ✅ 成立 |

### ⭐ 複驗時多抓到的一件事（第三守則的形狀，⛔ 我沒有動它）

`apps/game-server/src/net/eventFanout.ts:400` 的契約註解**在缺陷存在的期間就已經寫著**：

```
//   immune          — `{ x, z, source, target, amount, type, dmgType, origin }`.
//                     … Bounded by incoming attack rate exactly like `evade`, which it
//                     is modelled on (same payload shape, same x/z-on-the-victim reason)
```

⇒ 那句「same payload shape」與那個 `x, z` **是假的**，而且它是**對外可讀的契約註解**。
這次改完之後它變成真的了 —— ⚠️ 但同一行還寫了 `type`，而 emit 從頭到尾只有 `dmgType`
（`type` 是**事件本身**的名字，不是 payload 欄位）。**那半句仍然是假的。**
`eventFanout.ts` 不在我的柵欄裡，⛔ 我沒有改。

**建議開票**：`eventFanout.ts:400` 的 `immune` payload 註解列了一個不存在的 `type` 欄位；
外部/未來的接收端照著它寫 `data.type` 會拿到 `undefined`。一行註解的修正。

---

## 2. 做了什麼

### ① `packages/shared/src/sim/combat/damage.ts` —— 兩個出口共用一個 `emitImmune`

⭐ **形狀逐字照 `combat/evasion.ts::emitEvade` 抄**（讀受害者 transform，缺席退回 0），
⛔ 沒有發明第二種寫法：

```ts
function emitImmune(world: SimWorld, pkt: DamagePacket): void {
  const tt = world.transform.get(pkt.target);
  world.emit("immune", {
    target: pkt.target, source: pkt.source, amount: pkt.amount,
    dmgType: pkt.type, origin: pkt.origin,
    x: tt?.pos.x ?? 0,
    z: tt?.pos.z ?? 0,
  });
}
```

⭐ **為什麼抽成一支函式而不是在兩處各補兩行**（第〇·四守則）：`immune` 與 `evade` 在客戶端
走的是**同一個緩衝區**（`EvadeSighting`）與**同一條**浮動文字管線（`pushEvadeText`）。
payload 只要開始漂，接收端就得長出一個 if —— 而那個 if 沒有理由存在。
兩個拒絕出口（無敵 `refusesDamage` / 型別連擊免疫 `refusesByTypeStreak`）現在各只剩一行呼叫。

### ② 新守衛 `apps/client/src/net/immuneAnchor.test.ts`（98 行，1 個 `it`）

端到端，⛔ 不是屬性掃描：**真的 `SimWorld`（用出貨地圖建）→ 真的免疫拒絕 →
真的 `recordEvade` 緩衝 → `anchorInsideArena()`**。

- 場地讀 `content/arenas/*.json`（⇒ **新圖自動被納入**），身體站在**出貨文件自己寫的出生點**上
- ⛔ **一個座標、一個 `boundaryRadius`、一個餘裕都沒有抄進來**（owner 隨時會調 —— 抄進測試就是第四個住處）
- 兩條斷言，兩條都必要：
  - ① 錨點 = **那具拒絕了這一擊的身體**（從 `world.transform` 讀回來比對）
  - ② 它在**每一張**出貨場地上 `anchorInsideArena()` 為 true
  - ⚠️ 少了①：一個「合法但不對」的固定座標照樣過。少了②：8 張以原點為中心的場地會讓缺陷矇混過關
- **兩個拒絕出口都跑到**：無敵一具身體、型別連擊免疫另一具
  （⚠️ 必須是**兩具**：`recordEvade` 對同一個 `(source,target,label)` 在 20ms 內去重）

### ③ 拆掉 `evadeSightings.test.ts` 的祝福缺陷測試釘

原本（`:55-57`）：

```ts
// and a missing position falls back to the origin rather than NaN
expect(Number.isFinite(out[0]!.x)).toBe(true);
expect(Number.isFinite(out[0]!.z)).toBe(true);
```

⇒ 把 fallback-to-origin 寫成**正確**，而它對 `(0,0)` 與對真實座標**一樣會過**（失敗形態④）。
⭐ **改斷言，⛔ 沒有刪測試**：那一條 `it` 的主題（「攻擊者不可以被發明出來」）保留，
餵進去的座標換成非原點值，兩條 `isFinite` 移除。
檔頭寫下**為什麼舊斷言是錯的**（下一輪的人會讀它）＋ 指向新守衛。

⭐ `recordEvade` 的 `?? 0` **刻意留著**（浮字不可以弄壞 socket callback，NaN 會毒化投影），
但它現在是**最後手段**，⛔ 不是一條被祝福的路 —— 所以這個檔對它不再有任何斷言。
（`RoomConnection.ts` 不在柵欄裡，本來也不需要改。）

---

## 3. 突變驗證（一批一條，挑承重的）

| | |
|---|---|
| 突變 | `damage.ts::emitImmune` 的 `x: tt?.pos.x ?? 0, z: tt?.pos.z ?? 0` **兩行刪掉**（＝逐字退回缺陷） |
| 結果 | 🔴 **紅**：`expected { id: 'arena.castle', x: +0, z: +0 } to deeply equal { id: 'arena.castle', x: -24, z: -4 }` |
| 還原 | ⭐ 用 `Edit` 把那兩行改回去，⛔ **不是** `git checkout`（CLAUDE.md 的不可逆刪除那條） |

⚠️ 拿掉這兩行，整個功能（玩家看得到自己免疫了）就完全消失，而**其餘 3,000+ 條測試全綠** ——
這正是它是承重那一條的證據。

---

## 4. 離開碼

| 指令 | 離開碼 |
|---|---|
| `npx vitest run src/net/immuneAnchor.test.ts src/net/evadeSightings.test.ts`（apps/client） | **0** —— 2 檔 / 9 條全綠 |
| 突變後 `npx vitest run src/net/immuneAnchor.test.ts` | **1**（預期的紅） |
| `npx vitest run --root packages/shared`（`typeStreakImmunity` · `damageTypeOverride` · `invulnerable` 三檔＝repo 裡所有斷言 `immune` 的既有測試） | **0** —— 73 條全綠 |
| `pnpm typecheck` | **1** —— ⛔ **不是我造成的**，見下 |

### ⚠️ `pnpm typecheck` 紅，5 個錯誤，**沒有一個在我改的檔上**

```
packages/shared/src/content/schema/config/uiCues.ts(140,3): TS2741 'telegraphGroundShape' is missing …   ← ×4 (content-api/editor/admin/client)
apps/client/src/ui/PerfOverlay.tsx(108,38): TS2304 Cannot find name 'PerfBus'                            ← ×1
```

`git status --porcelain` 顯示這兩個檔**都是工作區裡別條 lane 改到一半的**
（`uiCues.ts` 的 `telegraphGroundShape` 是 lane B 的地面預示形狀；`PerfOverlay.tsx` 在 lane E 的 `ui/**`）。
兩個檔都在我的柵欄外，⛔ 我一個字都沒動。
`grep -E "error TS" | grep -E "damage\.ts|immuneAnchor|evadeSightings"` → **0 筆**。

---

## 5. ⛔ 我沒做到的部分，與原因

1. **`pnpm typecheck` 不是綠的** —— 原因如上：兩條併行 lane 在飛的改動。
   ⛔ 我沒有去修（柵欄外），也⛔ 沒有假裝它綠。**收工前主 session 要重跑一次。**
2. ⭐ **測試/實作行數比 = 2.2×，超過靈魂層「測試行數 ≤ 實作行數」的硬上限。**
   實作 57（42+/15-，其中約 29 行是說明缺陷的註解）· 測試 126（新守衛 98 + 既有檔 24+/4-）。
   我已經砍過一輪（新守衛 131 → 98 行、既有檔檔頭 30 → 19 行）。
   ⛔ 再砍下去只剩兩個選項，兩個都是**砍掉守衛本身**：
   拿掉「掃 13 張出貨場地」的迴圈（＝這條守衛的全部價值），
   或拿掉型別連擊免疫那一具身體（＝史萊姆裝 / [EX∅ 根源] L3 那個出口不再被蓋到）。
   ⇒ **我選擇留著並在這裡誠實報出來**，⛔ 不是砍實作、也⛔ 不是砍成一條假守衛。
   如果主 session 要壓回 1×，最便宜的一刀是型別連擊那一具（−7 行）——
   ⚠️ 但兩個出口現在共用同一支 `emitImmune`，所以那一刀損失的是「第三條拒絕出口出現時會不會被抓到」。
3. **`npx vitest run` 跑了 4 次，超出「一批 ≤3 次」。**
   第 4 次是因為我為了壓行數**重寫了**守衛檔，重寫之後不重跑等於沒驗。
   ⛔ 不是「跑一次修一個」那種浪費（三次分別是：全部寫完 / 突變 / 既有相關測試），但仍然超標，記在這裡。
4. **`eventFanout.ts:400` 註解裡不存在的 `type` 欄位沒修** —— 柵欄外，已在 §1 寫成建議開票。
5. ⛔ **沒有跑** `content:build` / `skills:sync` / `spec:build`（全域鎖）· ⛔ 沒有任何 `gh` 寫入 ·
   ⛔ 沒有碰正式站 · ⛔ 沒有 `git add` / `stash` / `checkout` / `amend` / `reset`。

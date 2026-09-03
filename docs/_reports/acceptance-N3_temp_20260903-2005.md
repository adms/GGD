# GH#961 批3 —— hook 觸發（12 份）驗收報告

> 產出：`packages/shared/src/ops/acceptanceN3.test.ts`（6 條斷言、一套治具）
> 時間：2026-09-03 20:05 · ⛔ 未跑 `pnpm skills:sync`（全域鎖，平行中）
> ⛔ 未動 `apps/client/src/vfx/VfxSystem.ts` · ⛔ 未開分支 · ⛔ 未動 `owner-knobs.json` · ⛔ 未碰 #838

---

## 一、⭐ 前提回驗 —— 票文的現況今天還成立嗎

| 票文說 | 今天量到 | 判定 |
|---|---|---|
| 本批 12 份屬「hook 觸發」 | ⭐ **12 份全部存在，全部帶 hook** | ✅ 成立 |
| `godie-e00w.passive` 只有成功迴避才反擊 | `onEvade` ＋ `internalCooldown:30` | ✅ |
| `godie-edem.r` 雙條件（千鳥命中 **且** 燃燒） | `onAbilityHit` + `abilitySlot:"E"` + `condition{status,target,burn}`，三階都寫了 | ✅ |
| `godie-h01u.r` 普攻／受傷各 20% 代理施放 | `onBasicAttack` / `onDamageTaken` 各一條，`chance:0.2`、`internalCooldown:0.5`、`proxyCast slot:W payCosts:"none"` | ✅ |
| `godie-efur.passive` AP→AD→防禦→魔抗循環各 1 秒 | `onBasicAttack` → `cycleBuff` 四步 `ap/ad/armor/mr`，各 `duration:1.0` | ✅ |
| `godie-nbbc.passive` 再次暈眩只刷新 | `onStunned` → 三個 `grantAttribute(durationSec:3)` | ✅ 事件端成立（「刷新 vs 疊倍」是 `grantAttribute` 的語意，⛔ 不在本票的事件軸上） |

### ⚠️ 兩處要更正票文的措辭（都是**現況比票文精確**，⛔ 不是票文錯）

1. **「12 份」不等於「12 條 hook」** —— 這 12 份實際帶 **26 條** hook
   （`godie-h00l.r` 3、`godie-edem.r` 3、`godie-e00s.w` 4、`godie-e00r.ex` 3…）。
   ⇒ 逐份判定要**逐條**做，⛔ 逐份做會漏掉同一支裡的其他 hook。
2. **hook 有兩個住處，⛔ 而頂層 `hooks` 一條都沒有** ——
   全庫 152 條：`passive.ranks[].hooks` **137**、`effects[].hooks`（`applyBuff` 帶著走）**15**。
   ⭐ 一個只讀頂層 `hooks` 的走訪器會量到 **0**，而且看起來完全正常
   （本輪第一次量測就是這樣，見 §0 的量尺自證）。
   ⚠️ 本批的 **20-04 Avalon** 與 **80-04 赤兔咆哮** 兩支**整支住在後者**。

### ⭐ 全庫底數（獨立量的，⛔ 不抄票文）

| | |
|---|---|
| 出貨技能 | 422 份 · 其中 **69 份**帶 hook |
| hook 條數 | **152**（passive 137 / buff 15） |
| 用到的事件 | **10 種**（`zHookEvent` 有 39 個 ⇒ **29 個零採用**） |
| 事件分佈 | onBasicAttack 68 · onDamageTaken 30 · onInterval 12 · onReflectSuccess 9 · onAbilityHit 8 · onKill 8 · onAbilityCast 6 · onDamageDealt 5 · onEvade 4 · onStunned 2 |

---

## 二、⭐ 逐份判定（AC#1：⛔ 沒有一份是空白）

⭐ **判定方式是行為，⛔ 不是讀 JSON**：在真的 `SimWorld` 裡 `spawnChampion` →
把該階 rank 拉到位 → `syncAbilityPassives`（passive 載體）或 `runEffects` 跑出貨那一份
`applyBuff`（buff 載體）→ 用 `fireHooks` 的 `hookFilter` **只點名這一條 hook** → 讀回傳值。

| # | id | 技能 | 條數 | 事件 | 判定 |
|---|---|---|---|---|---|
| 1 | `godie-e00l.r` | 20-04 Avalon | 2 | onDamageTaken · onReflectSuccess | ⭐ **通過**（buff 載體，各 fired=1） |
| 2 | `godie-h00l.r` | 60-04 完美盾反 | 3 | onDamageTaken(buff) · onReflectSuccess ×2(passive) | ⭐ **通過** |
| 3 | `godie-e00w.passive` | 77-00 浮雲-旋一閃 | 1 | onEvade | ⭐ **通過** |
| 4 | `godie-emfr.ex` | 15-002 敵彈吸收陣 | 2 | onDamageTaken(buff) · onReflectSuccess(passive) | ⭐ **通過** |
| 5 | `godie-e00r.ex` | 59-001 完全暴走 | 3 | onDamageTaken ＋ **巢狀** onInterval ×2 | ⭐ **通過**（外層 fired=2 ⇒ 生出 2 個帶 hook 的來源 · 4 條 onInterval **全部 fired**） |
| 6 | `godie-nbbc.passive` | 08-00 龍紋記憶 | 1 | onStunned | ⭐ **通過** |
| 7 | `godie-hapm.q` | 52-01 狂戰士之怒 | 1 | onDamageTaken | ⭐ **通過** |
| 8 | `godie-e00s.ex` | 70-002 樹海降臨 | 1 | onAbilityCast(slot R) | ⭐ **通過** |
| 9 | `godie-edem.r` | 45-04 哥哥 | 3 | onAbilityHit(slot E ＋ burn) | ⭐ **通過**，⭐ 而且**兩個條件都真的在擋**（見 §3③） |
| 10 | `godie-h01u.r` | 80-04 赤兔咆哮 | 2 | onBasicAttack · onDamageTaken（各 20%） | ⭐ **通過**（種子化 rng，決定性地擲到） |
| 11 | `godie-e00s.w` | 70-02 大怒石 | 4 | onBasicAttack ×4 階 | ⭐ **通過**（逐階各驗一次） |
| 12 | `godie-efur.passive` | 13-00 念。攻防轉換 | 1 | onBasicAttack | ⭐ **通過** |

⭐ **26/26 條 hook 全部發得動 ⇒ ⛔ 本批沒有一條是「消費端存在但消費不到」（形態⑧）。**

### ⚠️ 共同規則 #4（五級距）—— ⛔ 本票**不**在這一軸上判定
票文 Implementation constraints 逐字要求「標籤不存在時判定為阻塞於 #943」。
⭐ 那一軸的母體與判定住在 **#943 / 批1**，本票的軸是**事件觸發**。
⇒ 本報告**不重複一份會漂的級距判定**（第〇·四守則）；本批 12 份的
`rangeTier` / `conditionTier` 覆蓋率請以 #943 那一份為準。

---

## 三、⭐ 交付的守衛：`acceptanceN3.test.ts`（6 條）

### ⛔ 它刻意**不做**的事
- ⛔ **不抄那 12 個 id**（票文逐字：清單只有一個住處）。母體是**推導**的：
  出貨 `content/abilities/*.json` 裡**每一條** hook，而那 12 份是它的子集。
- ⛔ **不掃字串**（`worldHookGh354.test.ts` 已經掃過 `hook: "…"`，那是形態⑥）。
- ⛔ **不造夾具**：hook 定義逐位元組來自出貨 JSON，執行走出貨的
  `syncAbilityPassives` / `runEffects` / `fireHooks`。

### 六條斷言

| § | 問什麼 |
|---|---|
| §0a | ⭐ **量尺自證**：走訪器在**兩個住處**都撈得到（passive>0 且 buff>0）；出貨樹上頂層 `hooks` 必須是 0；用到的事件都在 schema allowlist 內 |
| §0b | ⭐ 母體沒塌（≥12 支帶 hook、≥100 條），⭐ **而且 TABLE 覆蓋每一個出貨事件** —— ⛔ 少一個，§1/§2 就能在少驗兩三個事件的情況下全綠 |
| §1 | ⭐ **正方向**：宣告的事件 → `fireHooks` ≥1。⛔ 來源沒掛上會直接指名「**來源根本沒掛到單位身上**」 |
| §2 | ⭐ **反方向**：同一條 hook，**其餘每一個**出貨事件 → 一律 0 |
| §3 | ⭐ **反方向之二（跑全母體 146 條）**：抽掉作者自己寫的那一格閘 ⇒ 0。三種：`abilitySlot` 換一格 · `condition{status}` 不掛標記 · 傷害封包不給。⭐ 內建「三種都真的抽到東西」的自證，⛔ 否則是恆真式 |
| §4 | ⭐ **共同規則 #7**（可機器判定的一半）：純反應式被動（21 支）⛔ 不得帶 `castTimeSec`、⛔ 不得用 `payCosts !== "none"` 的 `proxyCast`（那條路走 `castAbility` ⇒ 發 `castBegin` ⇒ 客戶端 `CastTracker` 畫出一條**玩家沒按過**的施法條） |

### ⭐ 治具的一個承重細節（差一點就變成一把說謊的尺）
第一版 `fireHooks(world, owner, ev)` 量的是**整個單位**，於是 14 筆「別的事件也發了」
其實是**隔壁那條 hook** 在發 —— ⭐ 一把單邊的尺。
修法是用 `fireHooks` 自己的 `hookFilter`（45-00 那一格）**只點名這一條**，
⛔ 而不是把別的來源從世界上拔掉（拔掉會連帶改變屬性與條件的答案）。

---

## 四、🧬 突變驗證（三次，實跑，⛔ 走 `scripts/edit-or-die.py`）

| # | 改壞哪一行 | 結果 |
|---|---|---|
| **M1** | `sim/effects/hooks.ts:285` `if (hook.on !== event) continue;` ＋ `&& false` | 🔴 **§2**：「`godie-emfr.r /effects[0]/hooks[0] (on:onAbilityCast)` 竟然在 **onAbilityHit** 上也發了 1 次」（逐一列出 9 個錯誤事件）。還原後綠 |
| **M2** | `sim/effects/applyBuff.ts:322` `...(e.hooks ? {hooks} : {})` 前加 `false &&` | 🔴 **§1**：五條 buff 載體全紅，含 `godie-h00l.r … 載體=buff —— ⛔ 來源根本沒掛到單位身上`。⭐ 這正是形態⑧的原型。還原後綠 |
| **M3** | `sim/effects/hooks.ts:288` `hook.abilitySlot !== abilitySlot` 閘 ＋ `&& false` | 🔴 **§3**：「`godie-edem.r …: abilitySlot=E 卻在 Q 上發了`」——⭐ 45-04 哥哥的「千鳥命中」變成「按什麼都追打」。還原後綠 |

⭐ `git status packages/shared/src/sim/` 收工時**乾淨**（三次都還原了）。

---

## 五、⚠️ 誠實列出**沒有**做到的

1. ⛔ **沒有驗「發射點會不會被呼叫」的那一半**。本票驗的是
   「事件送到這條 hook 時它會不會發動」；「`BasicAttackSystem` 到底有沒有在普攻時
   呼叫 `fireHooks`」由既有的 `worldHook.test.ts` / `worldHookGh354.test.ts` 負責。
   ⚠️ ⭐ 兩者**是接縫關係**（形態⑪）——⛔ 兩邊各自綠不保證接縫是通的。
   ⇒ 這是下一張票值得補的：**一場真的比賽跑完，量每一個事件實際被發了幾次**。
2. ⛔ **`chance` 那一族只證明「擲得到」，⛔ 沒有證明「機率是 20%」**。
   那是數值，第二守則明說⛔ 不寫進斷言。
3. ⛔ **共同規則 #8/#9（月牙堆疊）不做** —— 票文自己說那是語意判斷 ⇒ #664 Tier 2。
4. ⛔ **「連續擷圖」（AC#2）沒有做** —— headless 的 `NullEngine` 畫不出像素
   （CLAUDE.md 已記過這個量尺陷阱）。⇒ 本批留下的是 **JSON receipt（本報告 §二的
   逐條 fired 讀數）＋ 失敗原因格式（§三的訊息）＋ 技能 ID**，
   ⭐ 擷圖那一半交 **#664 Tier 2 批核頁**。
5. ⚠️ **`pnpm typecheck` 現在有 2 個錯，⛔ 而它們不是我的**：
   `packages/shared/src/ops/acceptanceN5.test.ts(151)` —— 那是**另一條平行 lane**
   還沒收尾的檔（同時在飛的還有 `acceptanceN1/N4/N6`）。
   ⭐ 本檔 `acceptanceN3.test.ts` 在 `tsc` 下**零錯誤**。

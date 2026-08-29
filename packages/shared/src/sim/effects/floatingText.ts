/**
 * ⭐【喊招字的方向】GH#853 —— 原作 `SetTextTagVelocityBJ(tag, speed, angle)`。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⓪ 這是**翻譯**，⛔ 不是「湊一個看起來像的」
 * ═══════════════════════════════════════════════════════════════════════════
 * Blizzard.j 的那支 BJ 只有兩行：
 *
 * ```
 * function SetTextTagVelocityBJ takes texttag tt, real speed, real angle
 *     local real vel = TextTagSpeed2Velocity(speed)
 *     call SetTextTagVelocity(tt, vel * Cos(angle * bj_DEGTORAD),
 *                                 vel * Sin(angle * bj_DEGTORAD))
 * ```
 *
 * ⇒ 它是一個**地面平面**上的速度向量 `speed × (cos θ, sin θ)`
 *   （texttag 的位置是 `SetTextTagPos(tt, x, y, heightOffset)` —— x/y 是**世界**
 *   座標，heightOffset 是另外一格。⭐ 這就是為什麼 `angle` 可以直接吃
 *   `GetUnitFacing(u)`：那是一個**世界**角度，⛔ 螢幕空間解釋不通）。
 *
 * ⇒ GGD 的對應軸是 **(x, z) 地面平面**（`Transform.facing` 也住在這個平面），
 *   ⛔ 不是 `riseSpeed` 的垂直軸。兩者是**互相獨立的兩根軸**，見 ② 的誠實邊界。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ① 量到的母體 —— 120 次呼叫，⛔ 不是印象
 * ═══════════════════════════════════════════════════════════════════════════
 * `tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j` 全檔 `SetTextTagVelocityBJ`
 * **120 次**（⛔ 零次裸的 `SetTextTagVelocity`），角度來源只有**四種**：
 *
 * | 角度來源 | 次數 | 佔比 | GGD 這一支怎麼翻 |
 * |---|---:|---:|---|
 * | 字面度數（**全部都是 `90`**） | 94 | 78% | `driftFrom:"world"` ＋ `driftAngleDeg:90` |
 * | `GetUnitFacing(<unit>)` | 18 | 15% | `driftFrom:"casterFacing"`（basis = `t.facing`） |
 * | `GetRandomDirectionDeg()` | 6 | 5% | ⛔ **這一批沒做** —— 見 ③ 的誠實缺口 |
 * | `udg_superAngle`（腳本變數） | 2 | 2% | `driftAngleDeg` ＋ `driftAngleStepDeg`（見 ④） |
 *
 * ⚠️⚠️ **票文（#853）說「war3map.j 的喊招字大宗是 64/90 度以外的角度」——
 * 那句話是假的**：78% 逐字就是 `90`。⭐ 而它是我自己寫進票裡的推測
 * （CLAUDE.md：「我的推測會變成他的需求」——票裡沒有 `>` 引言格式的句子
 * **預設是我的推測**）。⇒ 這一支照**量到的**母體做，⛔ 不照票文的形容詞做。
 * ⭐ 但**缺口本身是真的**：那 26 次（22%）非 90 度的呼叫在此之前**表達不出來**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ② 誠實邊界：`riseSpeed` **不是**這條 JASS 的第二個住處
 * ═══════════════════════════════════════════════════════════════════════════
 * 出貨的 `riseSpeed` 把字往**垂直**（世界 y）推 —— 那是 GGD 對「浮動文字會往上飄」
 * 這個**觀感**的既有表達，⛔ 它在 `SetTextTagVelocity` 上沒有對應的參數
 * （原作那 94 次 `90` 是**地面平面朝 +Y**，在 WC3 預設鏡頭下**看起來**像上升）。
 *
 * ⇒ ⭐ **`drift*` 這一族永遠只講地面平面**，逐格對得到 BJ 的一個參數；
 *   `riseSpeed` 維持原樣（缺席 `drift*` ⇒ 逐位元組同以前 ＝ 票的 rollback 條件）。
 * ⛔ 我**沒有**把同一個 JASS 數字拆成兩根軸 —— 那會是第〇·四守則說的第二個住處，
 *   而且會產生一個荒謬的不連續（`90` 走垂直、`91` 走水平）。
 *
 * ⚠️ **單位不共用**：BJ 的 `speed` 是 WC3 texttag 的內部單位
 * （`TextTagSpeed2Velocity(s) = s * 0.071 / 128`），⛔ 換算到 GGD 世界單位的常數
 * **推導不出來**。⇒ `driftSpeed` 的單位是**GGD 世界單位/秒**（與 `riseSpeed` 同一格），
 * 翻譯時要保住的是**角度關係**與**速度比例**（JASS 用過 8/10/12/32/48/60/64/70/75/100/150/180/350），
 * ⛔ 不是把 `64` 直接填進來。⭐ 我不編一個沒有出處的換算常數（判準 5）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ③ ⛔ 這一批**沒有**做 `GetRandomDirectionDeg()`（6 次 / 5%）
 * ═══════════════════════════════════════════════════════════════════════════
 * 出處：`unit-Edem.j` `unit-Eevi.j` `unit-Emns.j` `unit-Harf.j` `unit-Hvsh.j`
 * `unit-Huth.j` … 全部是 `SetTextTagVelocityBJ(tt, 64, GetRandomDirectionDeg())`。
 * ⭐ 它**擋住 0 支**票上點名的招牌技（第〇·五：按擋住的支數排序），而做它要把
 * `ctx.rng` 拉進一條本檔宣告「不碰 rng」的路。⇒ 留成一個**寫得出來的**缺口，
 * ⛔ 不是一句「以後再說」：要補時是 `driftFrom` 多一個 `"random"` 臂。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ④ ⭐ `driftAngleStepDeg` 的出處是**一行 JASS**，⛔ 不是我覺得好看
 * ═══════════════════════════════════════════════════════════════════════════
 * 超究武神霸斬（克勞德，`war3map.j:33850–33857`）：
 *
 * ```
 * set udg_superAngle = ( udg_superAngle + 270.00 )          ← j:33850
 * ...
 * call CreateTextTagUnitBJ( ( I2S(udg_SupI) + "Hit" ), ... ) ← j:33856
 * call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 100.00, udg_superAngle ) ← j:33857
 * ```
 *
 * ⇒ **每一刀的「iHit」飛的方向都不一樣**，每段轉 270°（`udg_superAngle` 在
 *   `j:2426` 初始化為 0，而 `+= 270` 跑在建 texttag **之前** ⇒ 第 1 刀 = 270°）。
 * ⭐ GGD 這一段已經有現成的段號：`{{i}}` 讀的 `EffectContext.sequenceIndex`。
 *   ⇒ `deg = driftAngleDeg + driftAngleStepDeg × (i − 1)`，
 *   克勞德 = `driftAngleDeg:270, driftAngleStepDeg:270`（i=1→270、i=2→540≡180…）。
 * ⛔ 沒有這一格，七個 Hit 會朝**同一個方向**飛 —— 那就不是原作了。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⑤ 為什麼 sim 送「基準向量 ＋ 度數」而不是送算好的方向
 * ═══════════════════════════════════════════════════════════════════════════
 * `sim/purity.test.ts` 禁 `Math.cos` / `Math.sin`（跨平台 ulp ⇒ 兩個複本會分歧）。
 * ⇒ ⭐ **sim 一個三角函式都不碰**：
 *   · `driftFrom:"world"` ⇒ 基準 = `(1, 0)`（常數）
 *   · `driftFrom:"casterFacing"` ⇒ 基準 = `Transform.facing` —— **逐位元抄過來**
 *     的模擬狀態，零算術 ⇒ 同種子重跑送出逐位元相同的事件（本族的既有承諾）
 * ⇒ 客戶端拿到 `{speed, deg, basisX, basisZ}` 之後做的**就是** BJ 的那兩行：
 *   把基準向量轉 `deg` 度。基準 `(1,0)` 轉 θ 度 ＝ `(cos θ, sin θ)` —— 逐字相等。
 * ⛔ 反過來（sim 把 facing 換算成度數）要 `Math.atan2`，那是禁令。
 *
 * ⚠️ 角度慣例：`0° = +x`、`90° = +z`，逆時針（＝ BJ 的 `(cos, sin)` 直接搬到
 * `(x, z)`）。⭐ 真正翻得過來的是**相對關係**（克勞德每段轉 270°、字往施法者
 * 面向飛），⛔ 世界絕對方位在原作本來就綁著 WC3 的預設鏡頭，翻不過來也不該翻。
 */
import type { EffectContext } from "./effect";

/**
 * 地面平面飄移的速度上界（GGD 世界單位/秒）。
 *
 * ⚠️ 逐字等於 `FLOATING_TEXT_MAX_RISE` —— 兩者是**同一個單位、同一個量級**
 * （一個垂直一個水平），給它一個不同的數字會變成一個沒有出處的旋鈕。
 * ⛔ 它住在這裡而不是 `kindLimits.ts`：那個檔是**別的 lane 的落點**，而這一格
 * 只有這一族在讀。
 */
export const FLOATING_TEXT_MAX_DRIFT = 20;

/** 角度欄位的上下界（度）。一整圈就是全部的表達力，⛔ 沒有第二圈。 */
export const FLOATING_TEXT_MAX_DRIFT_DEG = 360;

/**
 * 一發浮字的**地面平面**速度 —— 送過線的那一份。
 *
 * ⭐ 它是 `SetTextTagVelocityBJ` 的兩個參數 ＋ 一個**基準向量**：
 * 客戶端算 `dir = rotate((basisX, basisZ), deg)`，⇒ 基準 `(1,0)` 時
 * `dir = (cos deg, sin deg)` —— 逐字就是 BJ 的那一行。
 */
export interface FloatingTextDrift {
  /** GGD 世界單位/秒（⛔ 不是 JASS 的 texttag 速度單位，見檔頭 ②） */
  speed: number;
  /** 相對 `basis` 要轉幾度（含 `driftAngleStepDeg × (段號−1)`） */
  deg: number;
  /** 基準方向的 x（`world` ⇒ 1；`casterFacing` ⇒ `Transform.facing.x`） */
  basisX: number;
  /** 基準方向的 z（`world` ⇒ 0；`casterFacing` ⇒ `Transform.facing.z`） */
  basisZ: number;
}

/** `zFloatingText` 上與飄移有關的那四格（⛔ 這裡只讀，不定義上下界 —— schema 管）。 */
export interface FloatingTextDriftSpec {
  driftSpeed?: number;
  driftAngleDeg?: number;
  driftAngleStepDeg?: number;
  driftFrom?: "world" | "casterFacing";
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * 把作者寫的四格解算成一份 payload。⛔ 沒有 `driftSpeed` ⇒ `undefined`
 * ⇒ payload 上連這一格都不會出現 ⇒ **逐位元組同以前**（票的 rollback 條件）。
 *
 * ⚠️ `casterFacing` 而施法者沒有身體（或面向退化成零向量）⇒ 退回 `world` 基準，
 * ⛔ 不是「這一發不飄」—— 後者會讓一支技能在某些場合**靜默地**少一半演出，
 * 而那正是本檔上游 `nearbyBothSides` 逐字寫下的同一個理由。
 */
export function resolveFloatingTextDrift(
  e: FloatingTextDriftSpec,
  ctx: EffectContext,
): FloatingTextDrift | undefined {
  const speed = e.driftSpeed;
  if (speed === undefined || speed <= 0) return undefined;
  // 段號從 1 起算（`{{i}}` 同一格）⇒ 第一段不轉，第二段轉一個 step。
  const step = e.driftAngleStepDeg ?? 0;
  const seq = ctx.sequenceIndex ?? 1;
  const deg = (e.driftAngleDeg ?? 0) + step * (seq - 1);
  if (e.driftFrom === "casterFacing") {
    const f = ctx.world.transform.get(ctx.caster)?.facing;
    if (f !== undefined && (f.x !== 0 || f.z !== 0)) {
      return { speed: clamp(speed, 0, FLOATING_TEXT_MAX_DRIFT), deg, basisX: f.x, basisZ: f.z };
    }
  }
  return { speed: clamp(speed, 0, FLOATING_TEXT_MAX_DRIFT), deg, basisX: 1, basisZ: 0 };
}

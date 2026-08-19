/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { EffectCondition } from "../../content/condition";
import type { ResourcePctTerm } from "../dynamicTerms";
import type { DamageType, EffectDef, Scaling } from "../effect";

/**
 * damageArea (task #210 近戰擴散) — 傷害一個**圓**, 圓心是這次事件的受害者。
 *
 * -------------------------------------------------------------------------
 * 為什麼需要一個新的 kind, 而不是給 `HookDef` 加一個 `spread`
 * -------------------------------------------------------------------------
 * 技能之所以打得到多人, 是因為**技能的 targeting 先解出一組受害者**
 * (CastResolveSystem 的 AoE re-query), 再讓每個 effect 對每個人各跑一次。
 * `radius` 從來就掛在 ability 上 (schema/ability.ts:「skillshot width or AoE
 * radius」), 不在 effect 上。
 *
 * 於是 `onBasicAttack` 這種 hook 完全沒有辦法表達「順便打到旁邊的」——
 * `fireHooks` 把 `targets` 寫死成 `[event 的那一個實體]`, 而 effect 只認
 * `ctx.targets`。丈八蛇矛的「擴散傷害60%」、霸王槍的「40%機率造成225點範圍
 * 傷害」、熾天使之弓的「火焰擴散傷害44」在文案上承諾了三年, 在 sim 裡從來
 * 沒有一行程式碼實作過 (七種失敗形態的第 ② 種)。
 *
 * 給 HookDef 加 `spread` 只能修 hook 這一條路; 把圓做成 EFFECT 之後,
 * 小怪、守衛塔、status DoT、augment —— 任何跑 `runEffects` 的東西都同時拿到
 * 了「打一個圈」的能力, 而且是同一個 runner、同一組決定性規則。
 *
 * -------------------------------------------------------------------------
 * 決定性 (sim/purity.test.ts 在守)
 * -------------------------------------------------------------------------
 * 命中集合來自 `queryOverlap` (保證回傳**遞增的 entity id**), 然後用
 * 「(距離平方, id)」這個 TOTAL ORDER 排序才套 `maxTargets`。沒有任何一步吃
 * Map 的插入順序, 所以同一顆 seed 的兩次重播命中順序逐字相同 —— `canCrit`
 * 每個受害者各擲一次 rng, 順序一變傷害就會變, 這是必須排序的真正理由。
 */
export interface DamageAreaVariant {
  kind: "damageArea";
  /**
   * ⭐ S2（GH#299）—— 資源百分比項。與 `damage.resourcePct` **同一份型別、
   * 同一個讀取器**（`dynamicTerms.ts::resourcePctAmount`），per-target 解算。
   */
  resourcePct?: ResourcePctTerm;
  /**
   * 傷害型別。**省略 = `world.damageRules.defaultAbilityDamageType`**
   *（出貨 `magic` —— owner 2026-08-05「技能傷害預設都改成 AP 傷害」）。
   *
   * ⚠️ 這一格與**係數來源**（`amount` 的 `Scaling` 讀 ap/ad/str/agi/int）
   * 是兩件事：型別決定吃護甲還是魔抗，係數決定數字多大。
   */
  damageType?: DamageType;
  /** 每個受害者在**圓心**吃到的量 (再乘 falloff 的距離衰減) */
  amount: Scaling;
  /**
   * 半徑, GGD 單位。⚠️ 不經過 combatEnv.abilityRange —— 那顆旋鈕的定義是
   * 「技能的施法距離 / AoE 半徑」(#136), 而這是一件**道具**掛在普攻上的
   * 濺射。把它偷偷乘上 0.6 會讓後台顯示的半徑不是實際半徑, 也就是 #125
   * 「顯示值 == 實際值」被打破。要調就調 item 文件裡的這個數字本身。
   */
  radius: number;
  /**
   * 邊緣倍率 0..1: 圓心吃滿額, 半徑處吃 `falloff` 倍, 中間線性內插。
   * 省略 = 1 = 不衰減。月牙魔杖「距離越遠流星傷害越低」就是這個欄位。
   */
  falloff?: number;
  /** 這一次最多濺到幾個人 (預設 `SPREAD_MAX_TARGETS`, 由近到遠取) */
  maxTargets?: number;
  canCrit?: boolean;
  /**
   * 震央 (`ctx.targets`, 也就是被普攻打中的那個人) 要不要**再吃一次**。
   * 預設 false: `onBasicAttack` 的情境下他已經吃過普攻本身了, 再算一次
   * 就是雙重計費。技能想用同一個 kind 打「以自己為圓心的爆炸」時才開。
   */
  includeOrigin?: boolean;
  /**
   * ⭐ G1 ① —— 圈**內**逐一過濾（`condition.target-status@1` 在範圍技上的
   * 那一半：「範圍內只打帶〔恐懼〕的敵人」）。
   *
   * ⛔ 與 {@link EffectCommon.condition} **不是**同一格，而這正是它必須存在
   * 的理由（實測）：
   *   · `condition` 讀的是**上游交下來的** `ctx.targets`，決定「這一段跑不跑」；
   *     `effectRunner::gateOnCondition` 在 handler 被呼叫**之前**就過濾完了，
   *     一個都沒通過就 `return undefined`（handler 完全不被呼叫，那是 owner
   *     自己要的語意⑤）。
   *   · 於是「以自己為圓心的爆炸，只打帶恐懼的敵人」（`ctx.targets` 是空的）
   *     會讓 `subject:"target"` 讀 FALSE → **整圈永遠不發**；而「打 A、濺到
   *     旁邊帶恐懼的人」在 A 乾淨時會被上游閘擋掉 → **整圈消失**。
   *     兩種寫法都拿不到那張卡。
   *   · 這一格讀的是**這個圓自己用 `enemiesInCircle` 解出來的人**，只在
   *     handler 解完圈之後逐一過濾，**不參與**上游閘。
   *
   * 同一個型別、同一個求值器（`evaluateCondition`）、同一組葉子 ——
   * ⛔ 不是第二套條件系統。
   *
   * 缺席 = 一次 `evaluateCondition` 都不呼叫 = 零 rng draw = 今天的行為逐位元
   * 不變（既有 12 份 `damageArea` + 6 份 `damageLine` 文件全部缺席）。
   *
   * ⚠️ rng 預算：`conditionChanceCount(cond) × 候選數`，而且**與
   * {@link maxTargetsCounts} 無關** —— 求值一律跑滿排序後的整份候選清單再切
   * cap，讓 draw 次數不會因為某個人站遠一點而分叉（同 `randomArea` 檔頭②
   * 「看得見的預算」）。
   */
  victimCondition?: EffectCondition;
  /**
   * ⭐ G1 —— `maxTargets` 數的是誰。
   * · `"qualified"`（省略 = 這個）—— 通過 `victimCondition` 的**前 N 個**
   *   （卡面「最多 5 名帶〔恐懼〕的敵人」讀起來就是這個）。
   * · `"candidates"` —— 先取最近的 N 個候選**再**過濾（「最近 5 人裡帶恐懼的」）。
   * 沒填 `victimCondition` 時這一格沒有作用。
   */
  maxTargetsCounts?: "qualified" | "candidates";
  /**
   * ⭐ G1 ② —— `effect.target-set-chain@1`：把這一圈**真的打到的那群人**
   * 當成 `ctx.targets` 交給這一段（`victimCondition` 過濾之後、`maxTargets`
   * 切完之後的那一份）。
   *
   * ⛔ 交的必須是那一份，不是 `ctx.targets`：下游看到的人要跟血條上真的掉血
   * 的那群人是同一批，否則就是「畫面上打到 A、狀態蓋在 B」。
   *
   * ⛔ **不需要 bake**：這一段與母效果在**同一個 tick** 執行，不是延遲
   * payload，所以 #247 那個「窗口在飛行途中過期」的問題在這裡不存在
   *（對比 `leap.onLand` / `spawnProjectile.onHit` / `randomArea.effects`
   * 三個都要 bake）。
   *
   * ⚠️ 深度：一段 `onHitTargets` 裡可以再放一個帶 `onHitTargets` 的
   * `damageArea`。JSON 不可能有環，所以深度由文件本身的巢狀決定、必然有限；
   * `EFFECT_CHAIN_MAX_STEPS` 只擋**寬度**。與 `randomArea.effects` 的既有姿態
   * 一致，⛔ 不加深度計數器（那會是一個沒有需求的機制）。
   */
  onHitTargets?: EffectDef[];
  /**
   * ⭐ G1 ② —— 一個人都沒打到時，要不要照樣跑 {@link onHitTargets}。
   * 省略 = **false** = 不跑（＝今天什麼都不會發生的那個語意）。
   * 開著才寫得出「打空了也留下一個落地特效」。
   * ⚠️ 開著時下游拿到 `targets: []`，帶 `subject:"target"` 條件的效果會退化成
   * 整段閘並讀 FALSE（`effectRunner` 的④）—— 那是一個真的、但不該是預設的語意。
   */
  runOnEmptyHit?: boolean;
  /**
   * ⭐ G1 ② —— {@link onHitTargets} 收到的是**整群人一次**還是**一個一個**。
   *
   * 省略 = `"batch"` = 整群一次交下去（`ctx.targets = struck`），也就是
   * {@link onHitTargets} 上面那段檔頭**已經公告過**的語意 —— ⛔ 這一格不是新
   * 語意，是把那句話裡本來就藏著的二選一拿出來當欄位（第一守則：決策點）。
   *
   * · `batch` —— 「打到的每個人都中毒」「濺射到的人被擊退」：下游 handler 自己
   *   會 for 過 targets，一次交完最省。
   * · `perTarget` —— 「每個被打到的人腳下再炸一小圈」：下游是 `damageArea` /
   *   `damageLine` 這種**自己解幾何**的 kind，而它們只讀 `ctx.targets[0]` 當
   *   圓心 —— batch 模式下 5 個受害者只會炸出 1 個圈，而且**畫面上跟壞掉一模
   *   一樣**（失敗形態②）。
   *
   * ⚠️ `perTarget` 讓下游的 rng draw 隨受害者數線性成長；受害者清單本身已經是
   * 全序決定性的，所以決定性不破，但它是一筆看得見的成本。
   */
  onHitTargetsMode?: "batch" | "perTarget";
}

/**
 * 【跨技能強化】的執行期 —— 一支技能改寫**另一支**技能的數字。
 *
 * 授權契約（欄位語意、界、為什麼操作是 enum 而不是 JSON Pointer）住在
 * `content/schema/ability.ts` 的 {@link zAbilityAugment}，⛔ 不在這裡重複一份
 * （兩份會分岔）。這個檔只回答兩個問題：**誰的強化算數**，以及**數字怎麼改**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ 執行期 vs 編譯期 —— 這一版**沒有**做到計畫要的那一半，不要當成做到了
 *
 * `main_load_editor_plan.md` §2.1.1 P1 要的是**編譯期**：載入時把 augment 併進
 * 目標技能，並依 exact ref 重編 reverse dependency closure，所以執行期讀到的
 * 就已經是強化後的那一份，一次都不用再算。
 *
 * **這一版做的是執行期**：`abilityPassives.ts::rankBlock` 在把 passive 區塊
 * 轉成 `ModifierSource` 的那一刻，去問一次「持有者身上有沒有指名這支技能的
 * 強化」，有就在**那一份 clone** 上改。
 *
 * 為什麼先做這一半：編譯期需要一個 compiler（closure 重編 + 失效傳播 + 快取
 * 鍵），而它會落在 `content/registries.ts`；那個檔今天由另一條線持有，而且
 * 一個沒有 closure 失效的「假編譯期」比執行期更糟 —— 它會把過期的結果烘進去
 * 而且看不出來。⭐ 執行期版本是**可觀測等價**的第一步：同一組 ops、同一個
 * 目標解析規則、同一份界，所以之後接上 compiler 時要搬的是**時機**，不是語意。
 *
 * ⛔ 兩者**不等價**的地方要說清楚（`editorCapabilities` 的 caveat 逐字同步）：
 *   ① 沒有 closure：一個強化「一支自己也被強化的技能」不會遞迴解析。
 *      四支出貨卡片沒有一支是這個形狀，做了也沒有客戶。
 *
 * ⭐ 2026-08-10（G6）—— 上一版這裡寫著「只有 `abilityPassives` 這一個 seam
 * 接上了，主動施放路徑還沒問過這裡」。**那句話現在是假的，所以它被刪掉了**
 *（第三守則：語意改了，舊文案就是謊話）。今天有**四個** seam，每一個都是
 * 「組出那一份 clone 的前一刻」問一次 {@link collectAugmentOps}：
 *
 *   | 面（{@link AugmentSurface}） | 誰問 | 改到什麼 |
 *   |---|---|---|
 *   | `hooks`     | `abilityPassives.ts::rankBlock` | `HookDef.chance` + hook 效果樹 |
 *   | `effects`   | `abilitySystem.ts::castAbility` + `systems/CastResolveSystem.ts` | 主動施放的 `def.effects` |
 *   | `grants`    | `abilityPassives.ts::rankBlock` | `critStrike.chance` |
 *   | `modifiers` | `abilityPassives.ts::rankBlock` | `StatModifier.value`（`op:"modifierValue"`） |
 *
 * ⚠️ 施放路徑有**兩個**入口（瞬發在 `castAbility`、有吟唱的在
 * `CastResolveSystem`），兩個都要問 —— 只接一個的話「強化一支有吟唱的技能」
 * 會安靜地失效，而畫面上跟沒強化一模一樣（失敗形態②）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * fail closed —— 指不到的目標在**載入時**就死，不是在執行期靜默跳過
 *
 * `zAbilityAugmentTarget.abilityId` 是 `zRef("abilities")`，而 `content/refs.ts`
 * 的 `abilityRefs` 把它推成一條**硬** ref edge，所以 `validateReferences` 會在
 * 內容載入時丟 `DanglingRefError` 並指名那一格。⛔ 這個檔**刻意不做**
 * 「找不到目標就跳過」的補救 —— 那會把一個死掉的強化變成一場看起來正常的比賽。
 *
 * ── 純度 ──────────────────────────────────────────────────────────────────
 * 沒有時鐘、沒有三角函式、沒有 `**`，也沒有 Map 迭代（只讀
 * `world.abilities.get(id)` 一格，再走它的固定槽位順序 Q→W→E→R→EX→PASSIVE，
 * 與 `syncAbilityPassives` 逐字相同）。
 *
 * ⚠️ **有一處 rng**，而且是 2026-08-10 新加的：{@link collectAugmentOps} 對
 * `AugmentTarget.condition` 呼叫 `evaluateCondition`，那支每個 `chance` 葉抽一次
 * `world.rng`。這不違反 `sim/purity.test.ts`（禁的是 `Math.random` / 時鐘），
 * 但它讓「這一組強化算不算數」變成**呼叫序敏感**的 —— 呼叫序是固定槽位順序，
 * 所以錄影仍然逐位元可重播。⛔ 不要把這個求值搬進任何 Map 迭代裡。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { AbilityDef } from "../content/defs";
import type { EffectDef, Scaling } from "../effects/effect";
import type { HookDef, StatModifier } from "../stats/modifiers";
import type { EffectCondition } from "../content/condition";
import type { CritStrikeGrant } from "../combat/critStrike";
import { evaluateCondition } from "../content/condition";
import { Abilities } from "../content/registry";
import { Stat } from "../stats/statTypes";
import { AUGMENT_OP_BOUNDS, type AugmentOpName } from "../../content/schema/ability";

/** 一條操作 —— mirrors `zAbilityAugmentOp`。 */
export interface AugmentOp {
  op: AugmentOpName;
  mode: "set" | "add";
  value: number;
  hookOn?: string;
  nodeKind?: string;
  /**
   * ⭐ G6-1 —— 這條操作打得到技能的**哪一面**。mirrors `zAbilityAugmentOp.scope`，
   * ⛔ 不在這裡再寫一份 `z.enum`（授權契約住在 schema 上）。
   *
   * 省略 = `"all"` = 目標技能裡每一個同名數字（hooks + effects + grants + modifiers）。
   * ⭐ 2026-08-10：四個面**全部接上了**（見檔頭那張表），所以這一格的預設現在
   * 與實作逐字一致 —— 上一版這裡寫著「與今天的實作不同」，那句話已經過期。
   * 讀它的唯一地方是 {@link opHitsSurface}。
   */
  scope?: "all" | "hooks" | "effects" | "grants";
  /**
   * ⭐ G6-2 —— `op: "modifierValue"` 時指名**哪一條屬性**的加成量。
   * mirrors `zAbilityAugmentOp.stat`；schema 的 `superRefine` 已經把兩個方向都關死
   *（`modifierValue` 必填、其餘 op 禁填），所以這裡不需要第二道檢查。
   *
   * ⛔ 少了它，sim 拿不到「要改哪一條」，就會把一份被動上的三條加成一起改成同一個
   * 數字 —— 計畫 §13 明說「不得套到相鄰效果」。
   * ⚠️ 同一條屬性上有多條 modifier（armor 的 flat +10 與 pctAdd +0.2）時，一條
   * `stat: armor` 的 op **兩條都改**：op 指名的是「一種數字」不是一個位置。
   */
  stat?: Stat;
}

/** 一個目標 —— mirrors `zAbilityAugmentTarget`。 */
export interface AugmentTarget {
  abilityId: string;
  ops: AugmentOp[];
  /**
   * ⭐ G6-3 —— 這一組操作**什麼時候**算數（77-002「裝備了某類道具時」）。
   * mirrors `zAbilityAugmentTarget.condition`。
   *
   * 省略 = 無條件生效 = `collectAugmentOps` 今天的行為逐字。
   * ⚠️ 今天的缺陷不是「不生效」而是**被完全忽略、無條件生效**（實測：一個永遠 false
   * 的 `equipment` 條件之下，被強化技能的 hook chance 仍然讀到 1）。
   *
   * ⭐ 為什麼掛在 **target** 層級：77-002 一張卡同時強化兩支技能而**共用同一個前提**。
   * 掛頂層或每條 op 都會讓那個前提分岔成兩份。
   * ⚠️ 求值點只給得起 `self`（沒有事件、沒有 target），所以 `subject:"target"` 的葉子
   * 恆為「主體不存在」。⛔ 不要為了讓它有東西可讀而偽造一個 target。
   */
  condition?: EffectCondition;
}

/** `ability@1.augment` —— mirrors `zAbilityAugment`。 */
export interface AbilityAugment {
  targets: AugmentTarget[];
}

/**
 * 目標技能上「一種數字」住的**四個面**。⚠️ 這不是一份新字彙 —— 它就是
 * `AugmentOp.scope` 那格 enum，多一個 `"modifiers"`：schema 的 enum 是
 * `all / hooks / effects / grants`，所以一條 `modifierValue` 只有在
 * `scope` 省略（= `"all"`）時才打得到 `modifiers`。那是刻意的，因為
 * 「改加成量」本來就靠 {@link AugmentOp.stat} 挑，再多一格 scope 是兩個
 * 互相重疊的選擇器（作者只會挑錯其中一個）。
 */
export type AugmentSurface = "hooks" | "effects" | "grants" | "modifiers";

/**
 * 這條操作打不打得到這一面。
 *
 * ⛔ **全 sim 只有這一個地方讀 `op.scope`。** 四個 seam 各自寫一次
 * `op.scope === "hooks" || op.scope === undefined` 就是第零守則⑨的反面標記：
 * 加第五個面時漏掉的那一處不會紅，那格 scope 會安靜地被忽略。
 */
export function opHitsSurface(op: AugmentOp, surface: AugmentSurface): boolean {
  const scope = op.scope ?? "all";
  return scope === "all" || scope === surface;
}

/**
 * 讀 `def.augment`。
 *
 * ⚠️ 2026-08-10 之前這裡是一個 `as` cast，因為 `AbilityDef`
 *（`sim/content/defs.ts`）還沒有這一格、而那個檔由另一條線持有。**現在它有了**，
 * 所以 cast 收掉，sim 端只有一份真相。留這支函式是因為它是唯一的讀取點
 *（`isAugmentingAbility` / `collectAugmentOps` 都走它），⛔ 不要在別的地方直接讀。
 */
export function augmentOf(def: AbilityDef): AbilityAugment | undefined {
  return def.augment;
}

/** 這支技能有沒有強化任何東西 —— 給後台 / codex 用的便利謂詞。 */
export function isAugmentingAbility(def: AbilityDef): boolean {
  return (augmentOf(def)?.targets.length ?? 0) > 0;
}

/**
 * 持有者身上，所有**已學會**且指名 `targetAbilityId` 的強化操作。
 *
 * 「已學會」= 那一格的 `rank > 0`。天生技（PASSIVE）與 EX 從擁有的那一刻起
 * rank 就是 1，所以 59-001 / 70-002 / 77-002 / 92-002 這種 EX 一解鎖就生效。
 *
 * 順序是**固定的**（Q→W→E→R→EX→PASSIVE，再依作者寫的順序），因為多條操作
 * 打同一格時後者覆蓋前者 —— 換句話說順序是可觀測的，而可觀測的東西不可以
 * 依賴 Map 的迭代順序（`sim/purity.test.ts` 在守）。
 */
export function collectAugmentOps(
  world: SimWorld,
  holder: EntityId,
  targetAbilityId: string,
): AugmentOp[] {
  const ab = world.abilities.get(holder);
  if (!ab) return [];
  const out: AugmentOp[] = [];
  const consider = (abilityId: string, rank: number): void => {
    if (rank <= 0) return;
    const def = Abilities.tryGet(abilityId as never) as AbilityDef | undefined;
    const aug = def ? augmentOf(def) : undefined;
    if (!aug) return;
    for (const t of aug.targets) {
      if (t.abilityId !== targetAbilityId) continue;
      // ⭐ G6-3 —— 「裝備了某類道具時」（77-002）。缺席 = 無條件 = 這一格
      // 出現之前的行為逐字。求值主體只給得起 `self`（持有者）：這個呼叫點
      // 沒有事件、沒有被打的人，所以 `subject:"target"` 的葉子恆為
      // 「主體不存在」→ false。⛔ 不要為了讓它有東西可讀而偽造一個 target。
      //
      // ⚠️ `evaluateCondition` 會消耗 `world.rng`（每個 `chance` 葉一抽）。
      // 這裡是決定性的呼叫序（`syncAbilityPassives` 與 `castAbility` 都是
      // 固定槽位順序），所以錄影仍然可重播；但一個帶 `chance` 的強化條件
      // 會在**每一次重算**時重抽，那是作者要知道的事，不是引擎要偷偷穩定的事。
      if (t.condition !== undefined && !evaluateCondition(world, t.condition, { self: holder })) {
        continue;
      }
      for (const op of t.ops) out.push(op);
    }
  };
  for (const slot of ["Q", "W", "E", "R"] as const) {
    const inst = ab.slots[slot];
    consider(inst.abilityId, inst.rank);
  }
  if (ab.exSlot) consider(ab.exSlot.abilityId, ab.exSlot.rank);
  if (ab.passiveSlot) consider(ab.passiveSlot.abilityId, ab.passiveSlot.rank);
  return out;
}

/** 一條操作算出的新值，夾在這個 op 自己的界內（schema 那一份，不是第二份）。 */
function nextValue(op: AugmentOp, current: number): number {
  const [lo, hi] = AUGMENT_OP_BOUNDS[op.op];
  const raw = op.mode === "set" ? op.value : current + op.value;
  return raw < lo ? lo : raw > hi ? hi : raw;
}

/** `nodeKind` 有填就要對上；沒填 = 這一種數字的每一個出現位置。 */
function kindMatches(op: AugmentOp, kind: unknown): boolean {
  return op.nodeKind === undefined || op.nodeKind === kind;
}

/**
 * 改一個 effect 節點（含它的子鏈）。回傳**新物件**，沒改到就回原參照 ——
 * 結構共享讓「這一份 def 有沒有被強化」在測試裡是一個可以用 `toBe` 問的問題。
 */
function rewriteEffect(e: EffectDef, op: AugmentOp): EffectDef {
  let out: EffectDef = e;
  const patch = (p: Record<string, unknown>): void => {
    out = { ...(out as unknown as Record<string, unknown>), ...p } as unknown as EffectDef;
  };
  const node = out as unknown as Record<string, unknown>;

  if (op.op === "durationSec" && kindMatches(op, node.kind)) {
    // 兩個欄位名在出貨內容裡都存在（`applyBuff.duration` / `spawnVfx.durationSec`）,
    // 而「持續時間」是同一種數字 —— 所以兩個都認,而不是逼作者記住哪一支用哪一個。
    if (typeof node.duration === "number") patch({ duration: nextValue(op, node.duration) });
    const cur = (out as unknown as Record<string, unknown>).durationSec;
    if (typeof cur === "number") patch({ durationSec: nextValue(op, cur) });
  }

  if (op.op === "damageCoeffAp" && kindMatches(op, node.kind)) {
    const amount = node.amount as Scaling | undefined;
    if (amount && typeof amount === "object") {
      patch({ amount: rewriteApCoeff(amount, op) });
    }
  }

  // 子鏈：投射物命中、落地、加權分支。⚠️ 走訪的是**具名**欄位而不是「任何陣列」——
  // 一個泛化的深走訪會在下一個帶陣列的 kind 出現時安靜地多改一處。
  for (const key of ["onHit", "onLand"] as const) {
    const kids = (out as unknown as Record<string, unknown>)[key];
    if (Array.isArray(kids)) {
      const next = rewriteEffects(kids as EffectDef[], op);
      if (next !== kids) patch({ [key]: next });
    }
  }
  const branches = (out as unknown as Record<string, unknown>).branches;
  if (Array.isArray(branches)) {
    let changed = false;
    const nextBranches = (branches as { weight: number; effects: EffectDef[] }[]).map((b) => {
      const next = rewriteEffects(b.effects, op);
      if (next === b.effects) return b;
      changed = true;
      return { ...b, effects: next };
    });
    if (changed) patch({ branches: nextBranches });
  }
  return out;
}

/** AP 係數 —— 目標技能沒有 AP 項時「追加 500% AP」要**長出**那一項，不是靜默不做。 */
function rewriteApCoeff(amount: Scaling, op: AugmentOp): Scaling {
  const ratios = amount.ratios ?? [];
  const idx = ratios.findIndex((r) => r.stat === Stat.AbilityPower);
  if (idx < 0) {
    return { ...amount, ratios: [...ratios, { stat: Stat.AbilityPower, coeff: nextValue(op, 0) }] };
  }
  const next = ratios.slice();
  next[idx] = { ...next[idx]!, coeff: nextValue(op, next[idx]!.coeff) };
  return { ...amount, ratios: next };
}

function rewriteEffects(effects: readonly EffectDef[], op: AugmentOp): EffectDef[] | readonly EffectDef[] {
  let changed = false;
  const out = effects.map((e) => {
    const next = rewriteEffect(e, op);
    if (next !== e) changed = true;
    return next;
  });
  return changed ? out : effects;
}

/**
 * 改 condition 樹上的門檻。**只動 `kind` 對上 `op.nodeKind` 的葉子** ——
 * 那一格在 schema 是必填的，理由就是這裡：一棵樹裡通常不只一個 `value`
 * （機率、層數、距離…），沒有它「改門檻」會順手改掉相鄰的條件
 * （計畫 §13：不得套到相鄰效果）。
 *
 * ⚠️ 走訪是**結構性**的（找 `kind` + 數字 `value`），刻意不 import condition 的
 * kind 表 —— 那張表住在另一份 schema，抄過來就是第二份會過期的真相。
 */
function rewriteCondition(cond: unknown, op: AugmentOp): unknown {
  if (Array.isArray(cond)) {
    let changed = false;
    const out = cond.map((c) => {
      const next = rewriteCondition(c, op);
      if (next !== c) changed = true;
      return next;
    });
    return changed ? out : cond;
  }
  if (!cond || typeof cond !== "object") return cond;
  const node = cond as Record<string, unknown>;
  let out = node;
  if (node.kind === op.nodeKind && typeof node.value === "number") {
    out = { ...out, value: nextValue(op, node.value) };
  }
  // 複合節點（all / any / not …）—— 走**所有**物件/陣列子欄位。這裡泛化是安全的,
  // 因為改寫本身仍然被 `kind === nodeKind` 這道閘擋著。
  for (const key of Object.keys(node).sort()) {
    const v = out[key];
    if (v && typeof v === "object") {
      const next = rewriteCondition(v, op);
      if (next !== v) out = { ...out, [key]: next };
    }
  }
  return out;
}

/**
 * 把一組操作套到一份 hook 清單上。純函式；沒有任何操作打得到 = 回原參照。
 *
 * ⛔ 不可以就地改：`hooks` 來自**註冊表裡那一份 def**，就地改等於偷偷改掉
 * 所有英雄的那支技能（而且跨場次殘留）。
 */
export function applyAugmentToHooks(
  hooks: readonly HookDef[] | undefined,
  ops: readonly AugmentOp[],
): readonly HookDef[] | undefined {
  if (!hooks || hooks.length === 0 || ops.length === 0) return hooks;
  let out = hooks;
  for (const op of ops) {
    if (!opHitsSurface(op, "hooks")) continue;
    let changed = false;
    const next = out.map((h) => {
      if (op.hookOn !== undefined && h.on !== op.hookOn) return h;
      let nh = h;
      if (op.op === "procChance" && typeof h.chance === "number") {
        nh = { ...nh, chance: nextValue(op, h.chance) };
        changed = true;
      }
      if (op.op === "durationSec" || op.op === "damageCoeffAp") {
        const eff = rewriteEffects(nh.effects, op);
        if (eff !== nh.effects) {
          nh = { ...nh, effects: eff as EffectDef[] };
          changed = true;
        }
      }
      if (op.op === "thresholdPct" && nh.condition !== undefined) {
        const c = rewriteCondition(nh.condition, op);
        if (c !== nh.condition) {
          nh = { ...nh, condition: c as HookDef["condition"] };
          changed = true;
        }
      }
      return nh;
    });
    if (changed) out = next;
  }
  return out;
}

/**
 * ⭐ G6-1 —— 把一組操作套到**主動施放的效果鏈**上（`AbilityDef.effects`）。
 *
 * 這是 70-002 /92-002 那一族（「強化一支主動技的傷害／持續」）拿得到東西的
 * 那一行。呼叫點有**兩個**，因為施放本身就有兩條路：瞬發技在
 * `abilitySystem.ts::castAbility`，有吟唱的在 `systems/CastResolveSystem.ts`。
 *
 * ⛔ 不可以就地改：`effects` 來自註冊表裡那一份 def（同 {@link applyAugmentToHooks}）。
 * 沒有任何操作打得到時回**原參照**，所以沒有強化的那 1,900 份技能逐位元不變、
 * 一次配置都不多。
 *
 * ⚠️ `procChance` 在這一面不做任何事，而那不是遺漏：「發動機率」是 hook 與
 * 暴擊來源的性質，主動施放的效果鏈上沒有一格叫 chance。`thresholdPct` 同理 ——
 * 它改的是 hook 的 `condition` 樹。兩者在這一面填了也只會是一格永遠不被讀的
 * 設定，schema 的 caveat 已經記著。
 */
export function applyAugmentToEffects(
  effects: readonly EffectDef[],
  ops: readonly AugmentOp[],
): readonly EffectDef[] {
  if (effects.length === 0 || ops.length === 0) return effects;
  let out: readonly EffectDef[] = effects;
  for (const op of ops) {
    if (!opHitsSurface(op, "effects")) continue;
    if (op.op !== "durationSec" && op.op !== "damageCoeffAp") continue;
    out = rewriteEffects(out, op);
  }
  return out;
}

/**
 * ⭐ G6-2 —— 把一組操作套到**一份被動區塊的 `modifiers`** 上。
 *
 * 只有 `op: "modifierValue"` 打得到這一面，而它**必須**指名 `stat`
 *（schema 的 superRefine 兩個方向都關死了）：一份被動的 modifiers 通常不只一條
 *（護甲 +10、力量 +10、攻速 +0.2），沒有那一格會把三條一起改成同一個數字。
 *
 * ⚠️ 同一條屬性上有兩條 modifier（`Flat +10` 與 `PercentAdd +0.2`）時**兩條都改** ——
 * op 指名的是「一種數字」不是一個位置，這與 {@link applyAugmentToHooks} 對
 * 「每一個同名數字」的定義逐字相同。
 */
export function applyAugmentToModifiers(
  modifiers: readonly StatModifier[] | undefined,
  ops: readonly AugmentOp[],
): readonly StatModifier[] | undefined {
  if (!modifiers || modifiers.length === 0 || ops.length === 0) return modifiers;
  let out = modifiers;
  for (const op of ops) {
    if (op.op !== "modifierValue" || op.stat === undefined) continue;
    if (!opHitsSurface(op, "modifiers")) continue;
    let changed = false;
    const next = out.map((m) => {
      if (m.stat !== op.stat) return m;
      changed = true;
      return { ...m, value: nextValue(op, m.value) };
    });
    if (changed) out = next;
  }
  return out;
}

/**
 * ⭐ G6-4 —— 把一組操作套到**來源授予的暴擊機率**上（`critStrike.chance`）。
 *
 * 在這之前 `procChance` 只寫得到 `HookDef.chance`，所以一支技能的招牌
 * 「暴擊機率上升至 50%」在引擎裡沒有形狀 —— 而後台畫得出那一格
 *（失敗形態②）。20-00 銀色甲胄 / 天堂之劍那一族的暴擊來源走的就是這裡。
 *
 * ⚠️ 一支技能可能**同時**有一個 on-hit proc 與一個暴擊來源，而作者說
 * 「機率上升」時心裡通常只想著其中一個 —— 那正是 `scope` 那一格
 *（`hooks` / `grants`）存在的理由。省略 = `all` = 兩個都改。
 */
export function applyAugmentToCritStrike(
  grant: CritStrikeGrant | undefined,
  ops: readonly AugmentOp[],
): CritStrikeGrant | undefined {
  if (!grant || ops.length === 0) return grant;
  let out = grant;
  for (const op of ops) {
    if (op.op !== "procChance" || !opHitsSurface(op, "grants")) continue;
    out = { ...out, chance: nextValue(op, out.chance) };
  }
  return out;
}

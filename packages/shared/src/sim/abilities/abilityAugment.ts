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
 *   ① 只有 `abilityPassives` 這一個 seam 接上了 —— 被強化技能的**被動區塊**。
 *      主動施放路徑（`castAbility` 讀 `def.effects`）還沒問過這裡，所以
 *      70-002 / 92-002 那種「強化一支主動技的傷害」今天**還拿不到**。
 *      那一行要加在 `abilities/abilitySystem.ts`，而那個檔不屬於這一輪。
 *   ② 沒有 closure：一個強化「一支自己也被強化的技能」不會遞迴解析。
 *      四支出貨卡片沒有一支是這個形狀，做了也沒有客戶。
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
 * 全部是純讀取 + 陣列走訪 + 數值夾取。沒有 rng、沒有時鐘、沒有三角函式、
 * 沒有 `**`，也沒有 Map 迭代（只讀 `world.abilities.get(id)` 一格，再走它的
 * 固定槽位順序 Q→W→E→R→EX→PASSIVE，與 `syncAbilityPassives` 逐字相同）。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { AbilityDef } from "../content/defs";
import type { EffectDef, Scaling } from "../effects/effect";
import type { HookDef } from "../stats/modifiers";
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
}

/** 一個目標 —— mirrors `zAbilityAugmentTarget`。 */
export interface AugmentTarget {
  abilityId: string;
  ops: AugmentOp[];
}

/** `ability@1.augment` —— mirrors `zAbilityAugment`。 */
export interface AbilityAugment {
  targets: AugmentTarget[];
}

/**
 * 讀 `def.augment`。
 *
 * ⚠️ `AbilityDef`（`sim/content/defs.ts`）今天**沒有**這一格 —— 那個檔在這一輪
 * 由另一條線持有，所以型別鏡像暫時住在這個檔（上面三個 interface）。
 * 執行期沒有落差：`zAbilityDoc` 是 `.strict()` 且已經收了這個欄位，而
 * `registries.ts` 註冊的就是 Zod parse 出來的那個物件，所以欄位是真的在。
 * ⛔ 這個 cast 是**一處**，不要在別的地方再寫一次。
 */
export function augmentOf(def: AbilityDef): AbilityAugment | undefined {
  return (def as { augment?: AbilityAugment }).augment;
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

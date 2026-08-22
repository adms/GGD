/**
 * ⭐ effect kind 分片的**匯總點**（#467 ②）—— 兩件事，就這兩件：
 *   ① 把 40 個 `effects/<kind>.ts` 的 `z.object` 組成 {@link zEffectDefUnion}。
 *   ② 把各 kind 自己的跨欄位檢查組成 {@link EFFECT_REFINERS}（{@link refineEffectDef} 的派發表）。
 *
 * ⚠️ **為什麼下面是一份手寫的元組而不是 `readdir` 推導** —— 這是被 zod 的型別
 * 逼出來的，⛔ 不是懶：`z.discriminatedUnion` 的第二個參數要一個**元組**型別，
 * 任何 `.map()` 回來的是陣列，要靠一個 `as` 騙進去，而**那個 `as` 會讓整個聯集的
 * 推導型別退化**（分片前的檔頭就已經記著這一條）。聯集的推導型別是
 * `apps/editor/src/form/walk.ts` 的 `walkZod` 拿來畫欄位卡片、
 * `content/compat.test.ts` 拿來跟 TS union 逐格對照的東西 —— 退化了兩邊都會靜默地
 * 失去精度。TS 也沒有辦法在**型別層**讀一個資料夾。
 *
 * ⇒ 所以「從目錄推導」這件事**改由閘來做**，⛔ 不是由這個檔案做：
 * `effectShardWiring.test.ts` 真的 `readdir` 這個資料夾，把
 * **檔案集合 == 聯集成員 == 註冊表 == TS union** 四向對起來，順便驗每一支
 * 有 `refine` 的 kind 都真的接進了下面那張表。加一個檔忘了註冊 → 紅。
 * （CLAUDE.md 元規則：判準治不了，把它換成一個會擋下你的東西。）
 *
 * ⚠️ 元組的**順序**要跟分片前逐格一樣：`zEffectDefUnion.options` 的順序就是編輯器
 * union 卡片的順序。discriminatedUnion 自己是查表比對，順序不影響解析結果。
 */
import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { registerEffectDefSchema, zEffectDef } from "./_shared";

import { zDamage, refine as refine_damage } from "./damage";
import { zDamageArea } from "./damageArea";
import { zDamageLine } from "./damageLine";
import { zGrantAttribute, refine as refine_grantAttribute } from "./grantAttribute";
import { zRevive } from "./revive";
import { zHeal } from "./heal";
import { zShield, refine as refine_shield } from "./shield";
import { zApplyStatus, refine as refine_applyStatus } from "./applyStatus";
import { zApplyBuff, refine as refine_applyBuff } from "./applyBuff";
import { zCycleBuff } from "./cycleBuff";
import { zRestore } from "./restore";
import { zSpendMana } from "./spendMana";
import { zDash } from "./dash";
import { zLeap } from "./leap";
import { zBlink, refine as refine_blink } from "./blink";
import { zChampionForm } from "./championForm";
import { zSpawnProjectile } from "./spawnProjectile";
import { zSpawnVfx } from "./spawnVfx";
import { zDot, refine as refine_dot } from "./dot";
import { zSummon } from "./summon";
import { zInvulnerable } from "./invulnerable";
import { zKnockback, refine as refine_knockback } from "./knockback";
import { zEvasion } from "./evasion";
import { zTaunt } from "./taunt";
import { zGrantGold } from "./grantGold";
import { zDispel, refine as refine_dispel } from "./dispel";
import { zShieldBreak, refine as refine_shieldBreak } from "./shieldBreak";
import { zDevour, refine as refine_devour } from "./devour";
import { zModifyCooldown, refine as refine_modifyCooldown } from "./modifyCooldown";
import { zWeightedBranch, refine as refine_weightedBranch } from "./weightedBranch";
import { zSwapResource, refine as refine_swapResource } from "./swapResource";
import { zEventValueConversion, refine as refine_eventValueConversion } from "./eventValueConversion";
import { zRandomArea } from "./randomArea";
import { zDelayed, refine as refine_delayed } from "./delayed";
import { zProxyCast, refine as refine_proxyCast } from "./proxyCast";
import { zManaBarrier, refine as refine_manaBarrier } from "./manaBarrier";
import { zExtendBuff, refine as refine_extendBuff } from "./extendBuff";
import { zCarry, refine as refine_carry } from "./carry";
import { zConvertTeam, refine as refine_convertTeam } from "./convertTeam";
import { zChainLightning, refine as refine_chainLightning } from "./chainLightning";
import { zComboStrikes, refine as refine_comboStrikes } from "./comboStrikes";
import { zPull, refine as refine_pull } from "./pull";
import { zSpawnModelFx, refine as refine_spawnModelFx } from "./spawnModelFx";
import { zScreenFlash, refine as refine_screenFlash } from "./screenFlash";
import { zScreenShake, refine as refine_screenShake } from "./screenShake";
import { zFloatingText, refine as refine_floatingText } from "./floatingText";

export const zEffectDefUnion = z.discriminatedUnion("kind", [
  zDamage,
  zDamageArea,
  zDamageLine,
  zGrantAttribute,
  zRevive,
  zHeal,
  zShield,
  zApplyStatus,
  zApplyBuff,
  zCycleBuff,
  zRestore,
  zSpendMana,
  zDash,
  zLeap,
  zBlink,
  zChampionForm,
  zSpawnProjectile,
  zSpawnVfx,
  zDot,
  zSummon,
  zInvulnerable,
  zKnockback,
  zEvasion,
  zTaunt,
  zGrantGold,
  zDispel,
  zShieldBreak,
  zDevour,
  zModifyCooldown,
  zWeightedBranch,
  zSwapResource,
  zEventValueConversion,
  zRandomArea,
  zDelayed,
  zProxyCast,
  zManaBarrier,
  zExtendBuff,
  zCarry,
  zConvertTeam,
  zChainLightning,
  zComboStrikes,
  zPull,
  zSpawnModelFx,
  zScreenFlash,
  zScreenShake,
  zFloatingText,
]);

/**
 * 每個 kind 自己的**跨欄位**檢查。⛔ 一格 `z.number().max()` 進不了這裡 ——
 * 那種界住在 `effects/<kind>.ts` 的欄位上，跟它保護的那個欄位放在一起。
 *
 * ⭐ export 出去**只有一個理由**：四向閘要比對的是解析器真的讀的那一個物件，
 * ⛔ 不是 index.ts 的原始碼字串（失敗形態⑤「被測的不是出貨的那個」／⑥「掃字串代替行為」）。
 *
 * 為什麼跨欄位檢查不能掛在成員自己身上：`.superRefine` 會把 `ZodObject` 變成
 * `ZodEffects`，而 `z.discriminatedUnion` **只收 `ZodObject`**。所以它們統一
 * 掛在 {@link zEffectDef} 這一層（每一份文件真正走的那一個）。
 *
 * ⚠️ 分片前這裡是一條 `if (e.kind === …) return …` 的鏈，一個 kind 恰好命中一條。
 * 換成查表**行為逐字相同**（同一個函式、同一個順序、同一組訊息），而且少了那條鏈
 * 天生會有的第二種缺陷：兩條 `if` 的順序寫反時沒有任何東西會紅。
 */
export const EFFECT_REFINERS: Partial<Record<EffectDef["kind"], (e: never, ctx: z.RefinementCtx) => void>> = {
  applyBuff: refine_applyBuff,
  applyStatus: refine_applyStatus,
  blink: refine_blink,
  carry: refine_carry,
  chainLightning: refine_chainLightning,
  comboStrikes: refine_comboStrikes,
  convertTeam: refine_convertTeam,
  damage: refine_damage,
  delayed: refine_delayed,
  devour: refine_devour,
  dispel: refine_dispel,
  dot: refine_dot,
  eventValueConversion: refine_eventValueConversion,
  extendBuff: refine_extendBuff,
  floatingText: refine_floatingText,
  grantAttribute: refine_grantAttribute,
  knockback: refine_knockback,
  manaBarrier: refine_manaBarrier,
  modifyCooldown: refine_modifyCooldown,
  proxyCast: refine_proxyCast,
  pull: refine_pull,
  screenFlash: refine_screenFlash,
  screenShake: refine_screenShake,
  shield: refine_shield,
  shieldBreak: refine_shieldBreak,
  spawnModelFx: refine_spawnModelFx,
  swapResource: refine_swapResource,
  weightedBranch: refine_weightedBranch,
};

function refineEffectDef(e: EffectDef, ctx: z.RefinementCtx): void {
  EFFECT_REFINERS[e.kind]?.(e as never, ctx);
}

// ⭐ 把聯集 + 跨欄位檢查接回 `_shared.ts` 的遞迴結。巢狀效果（`onHit` / `onLand` /
//    `branches[].effects`）走的就是這一條線，沒接上會 throw。
//
// ⚠️ **對外的 `zEffectDef` 仍然是 `_shared` 那個 `ZodLazy`，⛔ 不是這裡的
//    `ZodEffects`** —— 分片前它就是 `z.lazy(() => union.superRefine(...))`，而
//    `walkZod`（編輯器）／`fieldAdoption`（普查）／`editorCapabilities`（對外契約）
//    都在**拆包裝的型別**上分岔：交出去一個 ZodEffects 解析結果一樣，但那三個
//    walker 看到的東西變了 —— 而它們全都不會報錯，只會少走一層（失敗形態②）。
registerEffectDefSchema(zEffectDefUnion.superRefine(refineEffectDef));

/** 每一份文件真正驗的那一個。⭐ 逐位元組是分片前的那個包裝（`ZodLazy`）。 */
export { zEffectDef };

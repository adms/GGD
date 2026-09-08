import { z } from "zod";
import { zId } from "../common";
import { COMBAT_ENV_KEYS, FACTOR_BAND_MAX, FACTOR_BAND_MIN, GOLD_FACTOR_MAX, GOLD_FACTOR_MIN, isBandedFactorEnvKey, isGoldEnvKey, type CombatEnvKey } from "../../../sim/combatEnv";

/**
 * config.combat-env@1 — the GLOBAL combat-environment multiplier table
 * (`config/combat-env.json`, task #28 admin 戰鬥系統). One multiplicative
 * factor per environment quantity; each factor is applied at exactly one sim
 * formula site (see `sim/combatEnv.ts` for the site table). 1.0 = neutral.
 * Keys are OPTIONAL (a sparse admin override is valid) and normalized onto
 * COMBAT_ENV_DEFAULTS via `normalizeCombatEnv` before entering the sim.
 * The key set is generated from the sim's COMBAT_ENV_KEYS, so the schema can
 * never drift from the engine.
 *
 * The NINE 三圍 coefficients (`strToMaxHealth` … — eight from #248, plus
 * `intToMagicResist` from GH#221) ride the same table but are COEFFICIENTS, not
 * ×factors: their neutral value is the shipped WC3-or-owner number (23 hp per
 * strength point, 0.6 魔抗 per intelligence point), not 1.0, and their legal band
 * is 0..100 — which is why `zEnvFactor` has always allowed 100 and why an omitted
 * coefficient falls back to `defaultForKey`, never to 1.0.
 *
 * ⚠️ NOTHING IS ADDED HERE WHEN A KEY IS ADDED. The Zod object is BUILT from
 * `COMBAT_ENV_KEYS`, so `.strict()` starts accepting the new key the moment the
 * sim declares it. That is the design — but it also means this file cannot be
 * the place a reviewer checks to see whether the key landed; the sim's
 * COMBAT_ENV_KEYS is.
 */
const zEnvFactor = z.number().min(0).max(100);

/**
 * 金錢發放倍率 (owner 2026-08-04) get a TIGHTER ceiling than the shared 0..100.
 * 100 is the band the 三圍 coefficients need (23 hp per STR); for a payout
 * factor it is 「一隻殭屍給你一整套裝備」, i.e. exactly the #277 shape — a
 * mistyped digit that the console happily accepts and the sim happily obeys.
 * Mirrors GOLD_FACTOR_MIN/MAX in the sim and `combatenv.Bounds` in the Go
 * platform; all three must agree or one of them is lying about what is legal.
 */
const zGoldEnvFactor = z.number().min(GOLD_FACTOR_MIN).max(GOLD_FACTOR_MAX);

/**
 * 2026-08-10 的三格 (`moveSpeedMelee` / `moveSpeedRanged` / `magicResistMult`)
 * 拿的是**平台一直在用的 ×倍率區間**（`combatenv.MinFactor/MaxFactor`
 * 與後台 `MAX_FACTOR`），不是上面那個 0..100。0..100 存在是因為 三圍 係數需要
 * （23 hp / STR），而十八格既有 ×倍率一路沾光沾到今天 —— 反過來把它們全部收緊
 * **不是 no-op**（`manaRegen` 出貨 8，同一批 owner 要調到 16），所以那是一次有
 * 傷亡名單的決定，屬於 owner，不屬於這一條 lane。新的三格先拿對的區間。
 * 推導寫在 `sim/combatEnv.ts` 的 `FACTOR_BAND_MIN`。
 */
const zBandedEnvFactor = z.number().min(FACTOR_BAND_MIN).max(FACTOR_BAND_MAX);

export const zCombatEnvMultipliers = z
  .object(
    Object.fromEntries(
      COMBAT_ENV_KEYS.map((k) => [
        k,
        (isGoldEnvKey(k)
          ? zGoldEnvFactor
          : isBandedFactorEnvKey(k)
            ? zBandedEnvFactor
            : zEnvFactor
        ).optional(),
      ]),
    ) as Record<CombatEnvKey, z.ZodOptional<z.ZodNumber>>,
  )
  .strict();

export const zConfigCombatEnvDoc = z
  .object({
    id: zId,
    schema: z.literal("config.combat-env@1"),
    /** monotonically bumped by the admin console on every published change */
    version: z.number().int().min(1),
    /** env-key -> factor; omitted keys mean 1.0 (neutral) */
    multipliers: zCombatEnvMultipliers,
  })
  .strict();
export type CombatEnvMultipliersDoc = z.infer<typeof zCombatEnvMultipliers>;
export type ConfigCombatEnvDoc = z.infer<typeof zConfigCombatEnvDoc>;

/**
 * `config.combo-strikes@1` —— 「連段→收尾」29 個 JASS 函式的間隔表（GH#541）。
 *
 * owner 2026-08-22：「⭐ **間隔就是動畫節奏的來源**」、「開票記得要寫是哪 29 個技能喔」。
 *
 * 🔢 第〇·四守則：這是**共用表**。技能 JSON 只引用 `key`，
 * ⛔ 不可以把 `steps` 抄一份進技能文件 —— 抄進去的那一份必然過期，
 * 而且 `content:build` 與全套測試對它**全部是綠的**。
 *
 * ⛔ 這份文件是 `python3 tools/jass-combo/extract.py` 產生的，不可以手改；
 * `--check` 逐位元組比對，守衛 `packages/shared/src/ops/jassComboTable.test.ts`。
 */
import { z } from "zod";

/** 文件 id（與檔名 `content/config/combo-strikes.json` 對齊）。 */
export const COMBO_STRIKES_DOC_ID = "combo-strikes";

/** owner 三次修正合起來的三種形狀：wait→傷害反覆 / 用迴圈 / 只是收尾才給傷害。 */
export const COMBO_SHAPES = ["per-step", "loop", "tail"] as const;

/**
 * 這個觸發器到底屬於誰。
 * ⚠️ `ability` 以外的四種都**不是英雄技能**，所以它們的 `abilityIds` 一定是空的，
 * 而且一定帶著一個 `unresolvedReason`（一個能被反駁的理由，⛔ 不是「還沒收」）。
 */
export const COMBO_OWNER_KINDS = ["ability", "item", "unit", "map-mechanic", "orphan"] as const;

const zFamily = z
  .object({
    key: z
      .string()
      .min(1)
      .describe("技能 JSON 要引用的鍵（＝ JASS 函式名去掉 Trig_/_Actions 之後轉小寫）。⛔ 引用它，不要抄 steps。"),
    jassFunc: z.string().min(1).describe("war3map.j 裡的函式名，⭐ 可以逐字回查。"),
    jassLine: z.number().int().positive().describe("那個函式在 war3map.j 的行號。"),
    shape: z.enum(COMBO_SHAPES),
    steps: z
      .array(z.number().min(0).max(60))
      .describe("除了最後一段以外的等待秒數，照原始碼順序。⚠️ 逐字抄，⛔ 沒有四捨五入、⛔ 沒有統一成 0.12。"),
    finisherDelaySec: z.number().min(0).max(60).describe("最後一段等待秒數。steps + 這一格 = JASS 的完整等待序列。"),
    seq: z
      .array(z.string().min(1))
      .describe("`W<秒>` = 一次等待、`D` = 一次傷害呼叫，照原始碼順序。⭐ 傷害落在哪兩段之間只有這裡看得出來。"),
    damageCalls: z.number().int().min(1).describe("UnitDamageTarget/Point/Area 的呼叫次數。"),
    rawcodes: z.array(z.string()).describe("這個觸發器自己的 Conditions 直接指名的技能 rawcode（可能是空的）。"),
    ownerKind: z.enum(COMBO_OWNER_KINDS),
    ownerRawcodes: z.array(z.string()).describe("解析之後認定的持有者 rawcode（技能／道具／單位）。"),
    w3xNames: z.array(z.string()).describe("上面那些 rawcode 在 w3x 裡的顯示名。"),
    abilityIds: z.array(z.string()).describe("對到的 GGD ability id（0、1 或多個 —— 本體與 EX 分身共用同一支技能時是多個）。"),
    resolvedVia: z.string().min(1).describe("怎麼解析出來的（conditions / parent-trigger / global / unit-type / item…），帶行號。"),
    gates: z.array(z.string()).describe("這條鏈上出現過的閘（GetUnitAbilityLevel / udg_EX_Mode …）。"),
    note: z.string(),
    unresolvedReason: z
      .string()
      .optional()
      .describe("⛔ 只有在 abilityIds 是空的時候才有，而且必須是一個**能被反駁**的理由。"),
  })
  .strict()
  .superRefine((f, ctx) => {
    // ⭐ 這條就是「⛔ 不要寫『還沒收』」的閘：有 id 就不准有理由，沒 id 就一定要有理由。
    if (f.abilityIds.length > 0 && f.unresolvedReason !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${f.key}：已經對到 abilityIds 就不該再帶 unresolvedReason` });
    }
    if (f.abilityIds.length === 0 && !f.unresolvedReason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${f.key}：沒有 abilityIds 就一定要寫一個能被反駁的理由` });
    }
  });

export const zConfigComboStrikesDoc = z
  .object({
    id: z.literal(COMBO_STRIKES_DOC_ID),
    schema: z.literal("config.combo-strikes@1"),
    note: z.string().optional(),
    stepSplit: z.string().optional(),
    source: z
      .object({
        jass: z.string(),
        objects: z.string(),
        provenance: z.string(),
        generator: z.string(),
      })
      .strict(),
    families: z.array(zFamily).min(1),
  })
  .strict();

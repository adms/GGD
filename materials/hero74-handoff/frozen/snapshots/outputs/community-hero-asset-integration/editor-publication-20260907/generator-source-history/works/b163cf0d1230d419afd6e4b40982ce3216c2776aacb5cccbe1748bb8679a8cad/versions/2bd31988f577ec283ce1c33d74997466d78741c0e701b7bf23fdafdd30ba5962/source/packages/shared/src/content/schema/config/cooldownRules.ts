import { z } from "zod";
import { zId } from "../common";
import { COOLDOWN_MIN_SECONDS_MAX, COOLDOWN_MIN_SECONDS_MIN, COOLDOWN_RULES_DOC_ID, DEFAULT_COOLDOWN_RULES } from "../../../sim/cooldownRules";

/**
 * config.berserk@1 — 暴走規則（59-00 初號機那一族）。
 *
 * ⚠️ **這個 schema tag 在 2026-08-05 之前不存在，而 sim 早就在讀它的三格。**
 * `sim/abilities/berserkRules.ts` 有 `DEFAULT_BERSERK_RULES`、有
 * `berserkRulesFromDoc()`、`SimWorld` 有 `berserkRules` 欄位、`abilitySystem`
 * 有兩處在讀它 —— 少的只是**文件、schema、後台頁與那條接線**。
 * 也就是說那個解析器從上架起就沒有拿到過一份真的文件，而三格的值只能是寫死的
 * 那一份。這正是 `augmentEnemyFilter` 的同型病理（見 `MatchController` 的
 * 賦值區註解），只是這一個連文件那一半都沒有。
 *
 * 出貨值逐字等於當時的 `DEFAULT_BERSERK_RULES`，所以建立它不改變任何平衡。
 *
 * **缺文件 = 出貨預設**（`normalizeBerserkRules` 的最裡層），不是空表 ——
 * 一個 undefined 的 `castHpPct` 會讓門檻永遠不成立，EX 在滿血也放得出來，
 * 而且沒有任何錯誤訊息。
 */
/**
 * config.dispel@1 — 淨化規則（A4b / #278）。
 *
 * ⚠️ 三個 `*DefaultDispellable` 決定「作者沒有想過這件事」時的答案，
 * 而出貨值是**刻意不對稱**的（理由逐格寫在下面）。它們是這一份文件裡唯一
 * 會**真的改變平衡**的三格 —— 其餘都是「拔幾層 / 先拔誰」這種手感旋鈕。
 */
/**
 * config.cooldown-rules@1 — 冷卻規則（owner 2026-08-10）。
 *
 * owner：「cdr 天花板可以是 0.99（99%減免），但要卡最低秒數 0.1 秒，
 * 這些都可以在後台設定」。⭐ 那是**兩個**旋鈕，住在兩份文件裡：
 *   · 比率天花板 → `config.stat-caps@1` 的 `cdr`（跟攻速上限同一張表）
 *   · 秒數地板   → 這裡的 `minSeconds`
 * 語意與「為什麼要兩個」寫在 `sim/cooldownRules.ts`。
 */
export const zConfigCooldownRulesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.cooldown-rules@1"),
    note: z.string().optional(),
    /** 止血閥。false = 地板不作用（但看得見它是關的）。 */
    enabled: z.boolean().describe(
      "@zh 秒數地板總開關\n" +
      "@note 關掉之後冷卻可以被縮到任意短（受比率天花板限制）。⚠️ 它**不**關掉冷卻縮減本身 —— 那是一格屬性，天花板在「屬性上限」頁。",
    ),
    /**
     * 實際冷卻**最短**幾秒。出貨 0.1。
     *
     * 0 = 沒有地板（合法，是「我知道我在做什麼」的寫法）。
     * 上界 10 —— 再高就會把大多數技能的冷卻**拉長**而不是設地板，那是打錯
     * 數字的樣子（3 秒 CD 的技能配一個 30 秒的「地板」）。
     */
    minSeconds: z.number().min(COOLDOWN_MIN_SECONDS_MIN).max(COOLDOWN_MIN_SECONDS_MAX).describe(
      "@zh 最短冷卻秒數\n" +
      "@note 一支技能的實際冷卻不會低於這個秒數。出貨 **{{出貨值}}**（owner 指定）。填 0 ＝ 沒有地板。⚠️ 上界 10：再高就會把大多數技能的冷卻**拉長**而不是設地板（一支 3 秒 CD 的技能配一個 30 秒的「地板」），那是打錯數字的樣子。",
    ),
    /**
     * ⭐ GH#489 —— 一條**觸發器**（被動 / 道具 / 增益卡的 hook）的內部冷卻最短幾
     * **實際秒**。出貨 **0 = 沒有地板**。語意、為什麼是自己一格、以及為什麼出貨
     * 值不是 1.2，全部寫在 `sim/cooldownRules.ts` 的 `hookMinSeconds` 上。
     *
     * ⚠️ **`.optional()` 是刻意的**，⛔ 不是偷懶：線上已經存過一份沒有這一格的
     * 耐久覆蓋層（`data/`），而覆蓋層會蓋掉 `content/config/`。做成必填 = 那一份
     * 舊文件在下次部署當場驗證失敗 ⇒ 整份 config 退回骨架，也就是 2026-08-02
     * 那次生產事故的形狀。缺席由 `cooldownRulesFromDoc` 讀成出貨值。
     */
    hookMinSeconds: z
      .number()
      .min(COOLDOWN_MIN_SECONDS_MIN)
      .max(COOLDOWN_MIN_SECONDS_MAX)
      .optional().describe(
      "@zh 被動觸發器最短內部冷卻（秒）\n" +
      "@note 一條**觸發器**（英雄被動 / 道具被動 / 增益卡的 hook）真的發動之後，最短隔多久才能再發動。出貨 **{{出貨值}} ＝ 沒有地板**。⚠️ 它與上面那一格是**兩種秒**：技能冷卻填的是**卡面秒**（引擎再乘「技能冷卻時間」倍率 `combatEnv.cooldown` —— ⛔ **這裡刻意不抄那個數字**：它是**你的旋鈕**，值住 `content/config/owner-knobs.json`。2026-08-23 抓到這一句寫著「出貨 0.2 ⇒ 60 卡面秒 = 12 實際秒」，而你 08-22 已經把它轉成 0.4 ⇒ 真值是 24。閘：`ops/knobValueNotRestated.test.ts`），而觸發器的內部冷卻從來就是**實際秒**、不吃那個倍率 —— 用同一格夾兩種秒就是用同一把尺量兩個空間。⭐ 想一次壓住所有被動的觸發頻率就填 **1.2**（＝冷卻表最便宜的一格「單體·極小」6 卡面秒 × `combatEnv.cooldown`）；填 0 就是回到今天。⚠️ 出貨值刻意是 0：量到有 **52 條**既有觸發器的內部冷卻低於 1.2 秒（0.5 / 0.6 / 1.0），預設拉高會一次改掉那 52 張卡的手感。⚠️ 它**只夾有填內部冷卻的那些** —— 沒填的（例如相轉移裝甲每 tick 續期的魔免）代表作者明說「每一次事件都算」，夾住它們會讓常駐效果變成閃爍的。",
    ),
  })
  .strict();

export const DEFAULT_COOLDOWN_RULES_DOC = {
  id: COOLDOWN_RULES_DOC_ID,
  schema: "config.cooldown-rules@1",
  enabled: DEFAULT_COOLDOWN_RULES.enabled,
  minSeconds: DEFAULT_COOLDOWN_RULES.minSeconds,
  hookMinSeconds: DEFAULT_COOLDOWN_RULES.hookMinSeconds,
} as const;

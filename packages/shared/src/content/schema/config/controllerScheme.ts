import { z } from "zod";
import { zId } from "../common";

/**
 * `config.controller-scheme@1` —— **手把操作版本**，後台一格可切（GH#863）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * owner 要的是什麼
 * ─────────────────────────────────────────────────────────────────────────────
 * > 「我給你一份**手把操作v4**的設計 請你存成md後來實作」
 * > 「所以我要你把這版當作 **v4 後台可切換的其中一種手把操作版本**」
 *   —— owner 2026-08-28（逐字，兩則）
 *
 * ⭐ 第二則解掉了一個**兩則 owner 裁決打架**的局面：
 * 出貨的手把配置也是他定的（`GamepadInput.ts:461` 逐字「owner, 2026-07-27:
 * the triggers swapped」），而 v4 的配置在 10 個控制項裡有 **6 個不一樣**。
 * ⇒ ⛔ 不是二選一，是**兩版並存**。這份 schema 就是那個「並存」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 為什麼方案是**資料**，⛔ 不是 `if (scheme === "v4")`
 * ─────────────────────────────────────────────────────────────────────────────
 * 第〇·五守則：引擎做**機制**、JSON 做**內容**。一個散落在客戶端各處的
 * `if (scheme === "v4")` 會讓「加第三版」變成一次全域搜尋 ——
 * 而 owner 已經給了兩版，第三版是遲早的事。
 *
 * ⇒ 消費端只讀**解析後的方案物件**（`resolveControllerScheme()`），
 *   它拿不到方案的名字，所以**寫不出**按名字分岔的程式。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 這份 schema 刻意**不**擁有的東西
 * ─────────────────────────────────────────────────────────────────────────────
 * `idleAutoEngageSec` 住 `config.combat-feel@1`，而且它管的是**所有真人座位**
 * （鍵鼠也吃它），⛔ 不只是手把。第〇·四守則：⛔ 不要造第二個住處。
 * ⇒ 這裡只有 `autoFarm.idleDelaySecOverride`，**預設 `null` ＝ 繼承那一格**。
 *   一個非 null 的值是**刻意的偏離**，所以 `reason` 是必填的。
 */

/**
 * 一顆實體按鍵能被指派的**語意動作**。
 *
 * ⭐ 這裡刻意是**語意**而不是「哪一支技能」—— 第 33 節逐字：
 * 「⛔ Do NOT write `if (hero.class === "melee")` inside controller infrastructure」。
 * 同理，⛔ 這裡不可以出現英雄名字或職業。
 *
 * ⚠️ `ability:*` 的六個值逐字對應 `sim/intents.ts` 的 `CASTABLE_SLOTS`
 * （Q W E R EX PASSIVE）。⛔ **不 import 它** —— 那是跨層 import，而
 * `ambientVfx.ts:19` 已經為同一個理由做過同樣的取捨；守衛在
 * `controllerScheme.test.ts` 逐項比對兩邊，少一個就紅。
 */
export const zControllerAction = z.enum([
  "ability:Q",
  "ability:W",
  "ability:E",
  "ability:R",
  "ability:EX",
  /** ⭐ 天生技。spec §34 逐字：「Do NOT special-case Innate. Innate is an active ability slot.」 */
  "ability:PASSIVE",
  /** 手動普攻意圖（v3/v4 都是 RT）。 */
  "basicAttack",
  /** ⭐ v4 §11：按住時**敵對單位只認敵方玩家**。⛔ 它不會自動攻擊，只改候選集合。 */
  "pvpFocus",
  /** v3 的 LT。保留它是為了 v3 那條路逐位元不變。 */
  "attackMove",
  "cameraFollowToggle",
  "cameraZoomStep",
  /** 明說「這顆鍵這一版沒有用」。⛔ 不要用省略來表達，省略與打錯字長得一樣。 */
  "none",
]);
export type ControllerAction = z.infer<typeof zControllerAction>;

/** 實體按鍵。名字用 Xbox 慣例（spec §2）。 */
export const zControllerButton = z.enum([
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  "L3",
  "R3",
]);
export type ControllerButton = z.infer<typeof zControllerButton>;

/** 一個方案裡，六個可施放槽位**每一個都要被綁到**。少一個 = 那支技能按不出來。 */
const CASTABLE_ACTIONS = [
  "ability:Q",
  "ability:W",
  "ability:E",
  "ability:R",
  "ability:EX",
  "ability:PASSIVE",
] as const;

const zScheme = z
  .object({
    /** 後台下拉選單顯示的名字。⛔ 不是 id。 */
    label: z.string().min(1).max(40),
    /** 一句話說「這一版的性格是什麼」，給 owner 在後台讀的。 */
    note: z.string().min(1).max(400),

    /**
     * 實體按鍵 → 語意動作。**十顆鍵全部要列出來**（`.strict()` ＋ 下面的 refine）——
     * ⭐ 省略一顆鍵與「忘記綁」長得一模一樣，所以用 `"none"` 明說。
     */
    bindings: z
      .object({
        A: zControllerAction,
        B: zControllerAction,
        X: zControllerAction,
        Y: zControllerAction,
        LB: zControllerAction,
        RB: zControllerAction,
        LT: zControllerAction,
        RT: zControllerAction,
        L3: zControllerAction,
        R3: zControllerAction,
      })
      .strict(),

    /**
     * ⭐⭐ 這一組是 v3 與 v4 **最本質**的差別，⛔ 不是按鍵位置。
     *
     * v4 §6 逐字列出「會重置自動清怪計時器」的輸入，而 **LS 移動不在裡面**；
     * §50 更逐字要求「LS 按住 10 秒 → Auto Farm 仍然活著」。
     *
     * 出貨的 v3 相反（`OrderSystem.ts:260` ＋ `:933`）：**任何一條指令**（含 move）
     * 都把計時器歸零，而且手上有進行中的指令時整段 idle 分支跳過。
     * ⚠️ 那**不是缺陷** —— 它是 GH#652 的 LoL 控制模型（「走位權是玩家的」），
     * 也是 owner 要的。⇒ 兩個都對，差別是**設計**，所以它是一格欄位。
     */
    combatInput: z
      .object({
        /** 右搖桿超過死區算不算「戰鬥輸入」。v3/v4 都是 true。 */
        aimStick: z.boolean(),
        /** ⭐ **左搖桿移動**算不算。**v4 = false**（§6/§50）· v3 = true。 */
        moveStick: z.boolean(),
        basicAttack: z.boolean(),
        pvpFocus: z.boolean(),
        ability: z.boolean(),
      })
      .strict(),

    autoFarm: z
      .object({
        enabled: z.boolean(),
        /**
         * ⛔ **預設 `null` ＝ 繼承 `config.combat-feel@1` 的 `idleAutoEngageSec`**
         * （第〇·四守則：那一格管所有真人座位，⛔ 不要在這裡再存一份）。
         * 非 null ＝ 刻意偏離，所以 `overrideReason` 變成必填。
         */
        idleDelaySecOverride: z.number().min(0).max(60).nullable(),
        /** 偏離的理由。⛔ 「還沒收」不算理由 —— 它要能被反駁。 */
        overrideReason: z.string().min(1).max(200).optional(),
        /**
         * ⭐ **spec §8**：自動清怪**只打 PvE**（「Auto Farm must NEVER
         * spontaneously attack another player. **This is a hard rule.**」）。
         *
         * ⚠️⚠️ 但它**對出貨的 v3 是錯的**，而我 2026-08-29 差點就這樣寫死：
         * v3 的 idle 索敵（GH#846）是 owner 2026-08-28 要的「停頓一段時間就會
         * **自動索敵攻擊**」——⭐ 那句話**沒有限定對象**，而出貨行為確實會挑上
         * 敵方英雄。⇒ 把 §8 當成全域硬規則會**改掉 v3**，
         * 而 v3 的整個存在理由是「逐位元不變」。
         *
         * ⇒ 改成第〇·四守則的出口：**false 要帶一個能被反駁的理由**
         * （`pveOnlyWaiverReason`）。⛔ 「還沒收」不算理由。
         */
        pveOnly: z.boolean(),
        /** `pveOnly: false` 時必填 —— 為什麼這一版允許自動索敵挑上玩家。 */
        pveOnlyWaiverReason: z.string().min(1).max(300).optional(),
      })
      .strict(),

    /**
     * ⚠️ **死區不住這裡。** `config.gamepad@1` 已經有 `deadzone`（出貨 0.15），
     * 而 `GamepadInput.ts:638-639` 兩根搖桿都用它。⛔ 在這裡再開一格 ＝ 第二個住處
     * （第〇·四守則）—— 而 2026-08-29 我差一點就這樣做了，是 `GAMEPAD_DEADZONE =
     * DEFAULT_GAMEPAD_FEEL.deadzone` 這一行把它擋下來的。
     * ⭐ spec §57 想要的「瞄準死區與移動死區分開」是一個**新的軸**，它的家是
     * `config.gamepad@1`（死區跟死區住一起），⛔ 不是方案 —— 那是**手感**，
     * 與「操作版本」正交（v3 與 v4 都可能想要同一個死區）。
     * 同理 `basicAttackRange`(12) 與 `longPressMs`(400) 也在那一份。
     */
    aim: z
      .object({
        /**
         * ⭐⭐ **選一種已經存在的機制**，⛔ 不是描述一種。
         *
         *   legacy-nearest-enemy  出貨那一支：`ctx.nearestEnemy(self, reach, aimDir)`
         *                         （`GamepadInput.ts:550`）。⭐ v3 用它，於是
         *                         「切回 v3 ＝ 逐位元不變」是**真的**，⛔ 不是願望。
         *   weighted              spec §15 的加權評分（方向/距離/黏著）。
         *
         * ⚠️ 這一格是 2026-08-29 改出來的，而它改的是一個**誠實問題**：
         * 第一版讓 v3 也填三個權重，那等於宣稱「出貨行為 ＝ 某組權重」——
         * ⛔ 而我沒有量過那件事。一個編出來的等價關係會讓 rollback **看起來**能用。
         */
        manualScoring: z.enum(["legacy-nearest-enemy", "weighted"]),
        /**
         * `weighted` 的三個權重（spec §15：`0.75 / 0.15 / 0.10`）。
         * ⭐ **方向必須壓倒性地大** —— §15 逐字：「A closer zombie should not steal
         * the target if the player is clearly pointing toward a farther target」。
         * 守衛驗 `direction > distance + stickiness`，⛔ 不是驗它等於 0.75。
         * ⛔ `legacy-nearest-enemy` 時**必須缺席** —— 一組不會被讀的數字會被下一輪
         * 讀成「出貨值」（本 repo 記過三次的形狀）。
         */
        weights: z
          .object({
            direction: z.number().min(0).max(1),
            distance: z.number().min(0).max(1),
            stickiness: z.number().min(0).max(1),
          })
          .strict()
          .optional(),
        /** 換目標的門檻（spec §17 初始 0.10）。`weighted` 才有意義。 */
        switchThreshold: z.number().min(0).max(1).optional(),
        /**
         * 瞄準輔助半徑的**倍率**，逐 kind（spec §19）。
         * ⭐ boss 給大一點是為了「**好指**」，⛔ 不是「優先」——
         * §16 逐字禁止 `Player +100 / Boss +50` 那種優先權加成。
         */
        aimAssistRadiusMult: z
          .object({
            player: z.number().min(0.1).max(10),
            zombie: z.number().min(0.1).max(10),
            boss: z.number().min(0.1).max(10),
          })
          .strict(),
      })
      .strict(),

    /**
     * 近戰的**短距貼近**（spec §28–§32）。
     * ⛔ 它**不是**自動追擊：`requireMoveStickNeutral` ＋ `pveOnly` 兩道閘都在。
     * ⚠️ 逐英雄的攻擊距離**不住這裡** —— 這裡只有「差多遠以內才幫你走」的倍率。
     */
    autoApproach: z
      .object({
        enabled: z.boolean(),
        /** 觸發上限 ＝ `attackRange × 這個倍率`（spec §29 的 1.8→3.0 ≈ 1.67）。 */
        maxRangeMult: z.number().min(1).max(5),
        /**
         * ⭐⭐ **絕對上限（世界單位）** —— 這一格才是「遠程⛔不追」（spec §25）的實作，
         * 而它**不需要任何職業判斷**（§33 逐字禁止 `if (hero.class === "melee")`）。
         *
         * 追擊只在 `距離 > 射程×0.9` 時才觸發，而貼近只在 `距離 ≤ 這一格` 時才准。
         * ⇒ 兩個區間**會不會相交**，由英雄自己的射程決定：
         *   · 近戰（有效射程 ≈2.8）：追擊 >2.5 觸發，貼近 ≤3.0 准 ⇒ ⭐ 2.5–3.0 這一段會貼近
         *   · 遠程（射程 8）：追擊 >7.2 才觸發，而 7.2 > 3.0 ⇒ ⛔ **兩個區間不相交 ⇒ 永遠不追**
         * ⇒ 同一個數字，兩種原型各自得到 spec 要的行為，⛔ 而程式裡一個 if 都沒有。
         *
         * ⚠️ 調大它會讓遠程開始追人。上界 6 是保險絲，⛔ 不是平衡政策。
         */
        maxAbsoluteUnits: z.number().min(0).max(6),
        /** ⭐ spec §31：**永遠不自動追玩家**。守衛擋 false。 */
        pveOnly: z.boolean(),
        /** spec §32 預設 false —— 自動走向危險的王多半不是玩家要的。 */
        allowBoss: z.boolean(),
        /** ⭐ spec §30：LS 一動**同一幀**取消。守衛擋 false。 */
        requireMoveStickNeutral: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((s, ctx) => {
    // ① 六個可施放槽位每一個都要被綁到，⛔ 而且不可以重複。
    //    少一個 ＝ 那支技能**按不出來**，而畫面上完全看不出來（技能圖示照樣亮）。
    const bound = Object.values(s.bindings);
    for (const need of CASTABLE_ACTIONS) {
      const n = bound.filter((b) => b === need).length;
      if (n === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bindings"],
          message: `槽位 ${need} 沒有綁到任何一顆鍵 —— 那支技能按不出來（spec §2：六個技能各有一顆直接的鍵）`,
        });
      } else if (n > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bindings"],
          message: `槽位 ${need} 綁到 ${n} 顆鍵 —— 一個動作只能有一個入口`,
        });
      }
    }
    // ② `weighted` ⇒ 權重必須在，而且方向必須壓倒（spec §15/§16）。
    //    ⛔ 驗的是**關係**不是字面值 —— owner 哪天調 0.75 也不該紅。
    if (s.aim.manualScoring === "weighted") {
      const w = s.aim.weights;
      if (!w) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aim", "weights"],
          message: "manualScoring=weighted 就要給權重",
        });
      } else if (w.direction <= w.distance + w.stickiness) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aim", "weights", "direction"],
          message:
            "方向權重必須大於（距離＋黏著）—— spec §15：玩家明確指著遠處時，近處的殭屍不可以搶走目標",
        });
      }
      if (s.aim.switchThreshold === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aim", "switchThreshold"],
          message: "manualScoring=weighted 就要給換目標門檻（spec §17）",
        });
      }
    } else if (s.aim.weights !== undefined || s.aim.switchThreshold !== undefined) {
      // ⭐ 反方向也要擋:一組**不會被讀**的數字會被下一輪讀成「出貨值」。
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aim"],
        message:
          "manualScoring=legacy-nearest-enemy 時不可以有 weights / switchThreshold —— 不會被讀的數字會被下一輪誤讀成出貨值",
      });
    }
    // ③ 偏離要有理由（第〇·四守則的出口：例外要帶一個能被反駁的理由）
    if (s.autoFarm.idleDelaySecOverride !== null && !s.autoFarm.overrideReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["autoFarm", "overrideReason"],
        message:
          "覆寫了 combat-feel 的 idleAutoEngageSec 就要寫為什麼 —— 一個能被反駁的理由，⛔ 不是「還沒收」",
      });
    }
    // ④ spec 的三條硬規則（§8 §30 §31）。留成欄位是為了**看得見**，⛔ 不是為了關掉。
    if (!s.autoFarm.pveOnly && !s.autoFarm.pveOnlyWaiverReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["autoFarm", "pveOnlyWaiverReason"],
        message:
          "spec §8：自動清怪只打 PvE。要放行就寫下**為什麼**這一版允許它挑上玩家 —— 一個能被反駁的理由，⛔ 不是「還沒收」",
      });
    }
    if (s.autoApproach.enabled && !s.autoApproach.pveOnly) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["autoApproach", "pveOnly"],
        message: "spec §31 硬規則：永遠不可以自動追擊敵方玩家",
      });
    }
    if (s.autoApproach.enabled && !s.autoApproach.requireMoveStickNeutral) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["autoApproach", "requireMoveStickNeutral"],
        message: "spec §30 硬規則：左搖桿一動就要在同一幀取消自動貼近",
      });
    }
  });

export type ControllerSchemeEntry = z.infer<typeof zScheme>;

export const zConfigControllerSchemeDoc = z
  .object({
    id: zId,
    schema: z.literal("config.controller-scheme@1"),
    note: z.string().optional(),
    /**
     * ⭐ **這一格就是 owner 的一鍵切換。** 值必須是 `schemes` 的一個鍵。
     * 切回 `v3-shipped` ＝ 回到 2026-08-28 之前的行為（rollback 的意義）。
     */
    active: z.string().min(1),
    /** 具名方案。⭐ 加第三版 ＝ 這裡多一筆，⛔ 不是改程式。 */
    schemes: z.record(z.string().min(1), zScheme),
  })
  .strict();
// ⛔⛔ **頂層不可以 `.superRefine`。** `zConfigDoc` 是 `z.discriminatedUnion`，
//   而它的成員必須是 ZodObject —— 一個頂層 refine 會把這份 schema 變成 ZodEffects，
//   於是走訪器讀 `o.shape.schema.value`（`editorContractSchemaTags.test.ts:40`）
//   拿到 undefined，`content:build` 直接 TypeError。
//   ⚠️ 這條規則 `statCaps.ts:50` 已經逐字寫過，而我 2026-08-29 還是踩了一次。
// ⭐ 所以「active 必須是 schemes 的一個鍵」住在**守衛**裡（`controllerScheme.test.ts`）——
//   而那本來就比較好：它是一條會紅的測試，⛔ 不是一個只在解析時說話的規則。

export type ConfigControllerSchemeDoc = z.infer<typeof zConfigControllerSchemeDoc>;

/**
 * `active` 指到的方案。⭐ **消費端只准拿它**，⛔ 不准拿 `doc.active` 去分岔 ——
 * 拿不到名字就寫不出 `if (scheme === "v4")`（第〇·五守則）。
 *
 * @returns 解析後的方案；`active` 指向不存在的鍵時回 `undefined`
 *          （⛔ 不丟例外 —— 內容載入的 fail-open 由 `main.tsx` 那一層決定，
 *           而守衛會讓這個情況在 CI 就紅，⛔ 不會活到執行期）。
 */
export function resolveControllerScheme(
  doc: ConfigControllerSchemeDoc,
): ControllerSchemeEntry | undefined {
  return Object.prototype.hasOwnProperty.call(doc.schemes, doc.active)
    ? doc.schemes[doc.active]
    : undefined;
}


/** 出貨文件的 id。⭐ 消費端一律用它，⛔ 不要重打字串。 */
export const CONTROLLER_SCHEME_DOC_ID = "controller-scheme";

/**
 * 出貨預設 ＝ `v3-shipped`（2026-07-27 起的配置）。
 *
 * ⚠️ 這**不是**第二個住處 —— 它是第一守則的「三個住處 ＋ drift 測試」模式
 * （同 `DEFAULT_COMBAT_FEEL`）：`controllerScheme.test.ts` 逐欄比對它與
 * `content/config/controller-scheme.json` 的 `v3-shipped`，兩邊分岔就紅。
 *
 * ⭐ 它存在的唯一理由是**內容還沒載入時手把仍然能動**（`main.tsx` 的 fail-open
 * 已經會退回骨架，而一支完全不回應的手把比骨架更糟：玩家會以為是硬體壞了）。
 */
export const DEFAULT_CONTROLLER_SCHEME: ControllerSchemeEntry = Object.freeze({
  label: "v3（出貨）",
  note: "內建退路 —— 與 content/config/controller-scheme.json 的 v3-shipped 逐欄相同（drift 測試在守）。",
  bindings: Object.freeze({
    A: "ability:Q",
    B: "ability:W",
    X: "ability:E",
    Y: "ability:R",
    LB: "ability:EX",
    RB: "ability:PASSIVE",
    LT: "attackMove",
    RT: "basicAttack",
    L3: "cameraFollowToggle",
    R3: "cameraZoomStep",
  }),
  combatInput: Object.freeze({
    aimStick: true,
    moveStick: true,
    basicAttack: true,
    pvpFocus: true,
    ability: true,
  }),
  autoFarm: Object.freeze({
    enabled: true,
    idleDelaySecOverride: null,
    // ⚠️ v3 刻意**不**套 spec §8 —— 見 `pveOnly` 欄位說明與出貨檔的 waiver。
    pveOnly: false,
    pveOnlyWaiverReason:
      "出貨行為：GH#846 的 idle 索敵來自 owner 2026-08-28「停頓一段時間就會自動索敵攻擊」—— ⭐ 那句話沒有限定對象，而出貨確實會挑上敵方英雄。v3 的存在理由是逐位元不變，所以這一版刻意不套 spec §8。⛔ 這不是同意「自動打人」是對的，是同意「⛔ 不要偷改出貨行為」。",
  }),
  aim: Object.freeze({
    manualScoring: "legacy-nearest-enemy",
    aimAssistRadiusMult: Object.freeze({ player: 1, zombie: 1, boss: 1 }),
  }),
  autoApproach: Object.freeze({
    enabled: false,
    maxRangeMult: 1,
    maxAbsoluteUnits: 0,
    pveOnly: true,
    allowBoss: false,
    requireMoveStickNeutral: true,
  }),
}) as ControllerSchemeEntry;

/**
 * 從一份（可能缺席／可能 `active` 打錯字的）文件解析出**一定拿得到**的方案。
 *
 * ⭐ **fail-open 但⛔不靜默**（CLAUDE.md：「fail-open 沒錯，靜默才是缺陷」）：
 * 回傳值第二格說出「我退了，而且是從哪一個名字退的」，呼叫端有責任喊出來。
 * ⛔ 不要把它改成只回方案 —— 那樣一個後台打錯的字會變成一個沒有人知道的降級。
 */
export function resolveControllerSchemeOrDefault(doc: unknown): {
  readonly scheme: ControllerSchemeEntry;
  /** null = 正常解析；否則是那個解析不到的 `active` 值（或 `"(no doc)"`）。 */
  readonly fellBackFrom: string | null;
} {
  const parsed = zConfigControllerSchemeDoc.safeParse(doc);
  if (!parsed.success) return { scheme: DEFAULT_CONTROLLER_SCHEME, fellBackFrom: "(no doc)" };
  const hit = resolveControllerScheme(parsed.data);
  return hit
    ? { scheme: hit, fellBackFrom: null }
    : { scheme: DEFAULT_CONTROLLER_SCHEME, fellBackFrom: parsed.data.active };
}

/**
 * ⭐ **一個來源可以攜帶的「非屬性」授予** —— 轉發那一半，一份，不是四份。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這支存在的理由（量出來的，2026-08-09）
 *
 * `ModifierSource` 上有一族東西不是 `Stat` 上的數字：**格擋** (`block`)、
 * **暴擊來源** (`critStrike`)、**三圍** (`attributes`) 與**傷害型別轉換**
 * (`damageTypeOverride`)。四者的共同性質是 sim 端**完全不看 `kind`**：
 *
 *   · `combat/block.ts::blockCutFor`      走 `StatsComp.sources`，不問 kind
 *   · `combat/critStrike.ts::rankedGrants` 走 `StatsComp.sources`，不問 kind
 *   · `stats/attrSources.ts::sourceAttrGrants`            同上
 *   · `combat/damageTypeOverride.ts::resolveDamageConversion` 同上
 *
 * 真的跑過模擬確認：把 `block` 掛在 `kind:"augment"` / `kind:"buff"` 的來源上，
 * `blockCutFor` 照擋；把 `critStrike` 掛在 `augment` / `passive` / `buff` 上，
 * `rollCritStrike` 照乘；2026-08-09 又對後兩格量了同一件事 —— `attributes`
 * 掛在那三種 kind 上，`liveAttribute` 一律從 24 變成 54；`damageTypeOverride`
 * 掛在那三種上，`resolveDamageTypeOverride` 一律回 `"true"`。
 * **引擎從第一天就沒有限制過誰授予得起。**
 *
 * 所以 owner #299 第 2 / 6 條「授權格要放寬」要放寬的**不是引擎**，是兩件事：
 *   ① schema 上有沒有那一格（`content/schema/effect.ts` 的 `SOURCE_GRANT_SHAPE`）
 *   ② **建構那個 source 的地方有沒有把它轉發下去** ← 這支
 *
 * ⛔ 而②正是最容易變成「到處改改改」的地方：四個建構點各自寫一次
 * `...(x.block ? { block: x.block } : {})`，下一個騎在來源上的授予就要再改四處，
 * 而漏掉的那一處**不會紅** —— 那個欄位在 schema 上存在、後台畫得出來、
 * 引擎永遠讀不到（CLAUDE.md 失敗形態 ②）。第零守則⑨：一份模板 + 一張表。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼是 `exactOptionalPropertyTypes` 風格的展開而不是直接 `{ block: x.block }`
 *
 * 這個 repo 打開了 `exactOptionalPropertyTypes`，所以 `{ block: undefined }` 與
 * 「沒有 block 這個鍵」是**不同的型別**。既有的四個建構點全部走條件展開，
 * 這支照抄同一個形狀，所以既有來源的物件形狀逐鍵不變。
 */
import type { BlockGrant } from "../combat/block";
import type { CritStrikeGrant } from "../combat/critStrike";
import type { DamageTypeOverride } from "../combat/damageTypeOverride";
import type { FlightGrant } from "../flight";
import type { PenetrationGrant } from "../combat/penetration";
import type { TypeStreakImmunityGrant } from "../combat/typeStreakImmunity";
import type { AttrGrant } from "./attributes";

/**
 * 一份內容文件（道具 / 天生技 rank / 增益卡 / `applyBuff` 效果）上，
 * 「騎在來源上的授予」那一族欄位。
 *
 * ⛔ 加一格的時候三個地方一起加：這裡、`content/schema/effect.ts` 的
 * `SOURCE_GRANT_SHAPE`、以及 {@link sourceGrants} 的回傳。少一個就是一個
 * 畫得出來但引擎讀不到的欄位。
 */
export interface SourceGrantFields {
  block?: BlockGrant;
  critStrike?: CritStrikeGrant;
  /**
   * ⭐ 2026-08-09 (G7) —— 三圍 (力/敏/智)。以前**只有道具**寫得出來,所以
   * 「這支大招期間力量 +30」「這張三選一卡永久 +15 智」在編輯器上沒有形狀。
   *
   * ⛔ 引擎從第一天就沒有限制過誰授予得起:`stats/attrSources.ts::sourceAttrGrants`
   * 走 `StatsComp.sources` 而**不問 `kind`**(真的跑過模擬 —— 掛在
   * `buff` / `augment` / `passive` 三種來源上,`liveAttribute` 一律 24 → 54)。
   * 擋住它的只有 schema 的那一格與這裡的轉發。
   */
  attributes?: AttrGrant;
  /**
   * ⭐ 2026-08-09 (G7) —— 傷害型別轉換(「接下來 5 秒你的普攻是真傷」)。
   * 同上:`combat/damageTypeOverride.ts::resolveDamageConversion` 也走
   * `StatsComp.sources` 而不問 `kind`(同一次模擬:三種來源都回 `"true"`)。
   */
  damageTypeOverride?: DamageTypeOverride;
  /**
   * ⭐ 2026-08-09 (S11) —— 飛行。以前**只有道具與天生技 rank** 寫得出來,而後者
   * 一旦到 rank>0 就是永久,所以「限時飛行 6 秒」在引擎裡沒有形狀。
   *
   * ⛔ 同前三格:`sim/flight.ts::flightSystem` 掃 `StatsComp.sources` 而**不問
   * `kind`**,所以掛在 `applyBuff` 生出來的限時 source 上就是限時飛行,
   * 到期由那個 source 自己的 `expiresAtTick` 收掉,不需要第二支掃描器。
   */
  flight?: FlightGrant;
  /**
   * ⭐ 2026-08-12 —— [穿透]（LoL 四段的段③④）。同前五格:
   * `combat/penetration.ts::resolvePenetration` 走 `StatsComp.sources` 而**不問
   * `kind`**,所以掛在 `applyBuff` 生出來的限時 source 上就是「接下來 5 秒你的
   * 普攻穿 40% 護甲」,到期由那個 source 自己的 `expiresAtTick` 收掉,
   * ⛔ 不需要第二支掃描器。擋住它的只有 schema 的那一格與這裡的轉發。
   */
  penetration?: PenetrationGrant;
  /**
   * ⭐ 2026-08-18 —— [型別連擊免疫]（史萊姆裝）。同前六格：
   * `combat/typeStreakImmunity.ts` 走 `StatsComp.sources` 而**不問 `kind`**，
   * 所以掛在 `applyBuff` 生出來的限時 source 上就是「接下來 8 秒連吃兩發物理
   * 之後免疫物理」，到期由那個 source 自己的 `expiresAtTick` 收掉，
   * ⛔ 不需要第二支掃描器。擋住它的只有 schema 的那一格與下面那一行轉發。
   */
  typeStreakImmunity?: TypeStreakImmunityGrant;
}

/**
 * 把一份文件上的授予欄位攤成可以直接展進 `ModifierSource` 字面量的物件。
 *
 * 缺席的欄位**不會產生鍵**（見檔頭最後一段），所以
 * `{ id, kind, ...sourceGrants(def) }` 對一份沒有授予的文件而言，
 * 產出的物件與這支存在之前逐鍵相同。
 */
export function sourceGrants(from: SourceGrantFields): SourceGrantFields {
  return {
    ...(from.block !== undefined ? { block: from.block } : {}),
    ...(from.critStrike !== undefined ? { critStrike: from.critStrike } : {}),
    ...(from.attributes !== undefined ? { attributes: from.attributes } : {}),
    ...(from.damageTypeOverride !== undefined
      ? { damageTypeOverride: from.damageTypeOverride }
      : {}),
    ...(from.flight !== undefined ? { flight: from.flight } : {}),
    ...(from.penetration !== undefined ? { penetration: from.penetration } : {}),
    ...(from.typeStreakImmunity !== undefined
      ? { typeStreakImmunity: from.typeStreakImmunity }
      : {}),
  };
}

/**
 * 這份文件**有沒有**帶任何授予 —— 給「這個 rank 是不是空的」那一類判斷用。
 *
 * `abilities/abilityPassives.ts` 的空值測試需要它：一支只授予格擋（或只授予
 * 暴擊）的天生技，`modifiers` 是空陣列**是刻意的**（「擋不擋得下這一發」不是
 * 屬性表上的數字），少了這一條那個來源根本不會被掛上，整個功能是死的而所有
 * 測試全綠 —— 那正是 `auras` / `vision` / `flight` / `block` 四次各自踩過的
 * 同一個坑。⛔ 不要在那邊逐格寫 `!block.block && !block.critStrike`。
 */
export function hasSourceGrant(from: SourceGrantFields): boolean {
  return (
    from.block !== undefined ||
    from.critStrike !== undefined ||
    from.attributes !== undefined ||
    from.damageTypeOverride !== undefined ||
    from.flight !== undefined ||
    from.penetration !== undefined ||
    from.typeStreakImmunity !== undefined
  );
}

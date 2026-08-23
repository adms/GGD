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
import type { ChampionDef } from "../content/defs";
import type { ModifierSource } from "./modifiers";
import type { DeathWardGrant } from "../deathWard";
import type { CritStrikeGrant } from "../combat/critStrike";
import type { DamageTypeOverride } from "../combat/damageTypeOverride";
import type { FlightGrant } from "../flight";
import type { PenetrationGrant } from "../combat/penetration";
import type { TypeStreakImmunityGrant } from "../combat/typeStreakImmunity";
import type { VisionGrant } from "../stealth";
import type { AttrGrant, PrimaryAttributeGrant } from "./attributes";

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
  /**
   * ⭐ 2026-08-18（GH#373）—— [隱形 / 真視]。同前七格，而且是這一族裡引擎
   * **最早**就準備好的那一格：`sim/stealth.ts::syncVisionGrants` 每 tick 掃
   * `StatsComp.sources` 找 `src.vision` 而**不問 `kind`**，而且**已經在跳過過期
   * 的 source**。所以掛在 `applyBuff` 生出來的限時 source 上就是「隱身 20 秒」／
   * 「接下來 30 秒看得見隱形部隊」，到期由那個 source 自己的 `expiresAtTick`
   * 收掉，⛔ 不需要第二支掃描器。
   *
   * ⚠️ 在這一格之前 `vision` 只掛得到**道具**（永久佩戴）與**天生技 rank**
   * （rank>0 之後永久）—— 兩者都沒有「一段時間」。53-00 空間穿梭「持續 20 秒」
   * 與 30-00 攝影機因此整棵效果樹只剩一個 `spawnVfx`（GH#373）。
   */
  vision?: VisionGrant;
  /**
   * ⭐ 2026-08-19 ——【死亡遺留】。**第九格**，而它是這一族裡第一個**把既有的
   * 專屬程式收編**進來的：`sim/nightPact.ts` 整支檔案（71-00 暗夜契約）在此之前
   * 是一份靠 `config.arena-rules@1.nightPact.abilityIds` 綁死一支技能的機制，
   * 也就是 CLAUDE.md 第〇·五守則點名的那個形狀。
   *
   * ⛔ 同前八格，引擎不看 `kind`：`sim/deathWard.ts` 掃 `StatsComp.sources`
   * 找 `src.deathWard`。所以「大招期間陣亡的人會留下治療陣」是一份
   * `applyBuff` 的限時來源，到期由那份 source 自己收掉，⛔ 不需要第二支掃描器。
   */
  deathWard?: DeathWardGrant;
  /**
   * ⭐ M5(2026-08-23) —— 【紮根】**不能移動，但可攻擊、可施法**。第十格。
   *
   * owner 2026-08-13 逐字：「應該是**狀態改變，類似定身**（可攻擊跟施展技能但
   * 不能移動），並非把移動速度調整到 0」。
   *
   * ⛔ **不可以拿 `root` 狀態代替**，而理由不是語氣 —— `movementHold.ts` 檔頭
   * 已經逐字寫下來了：`root` 是 **CC**（可被【淨化】剝掉、被免控 buff 拒絕、
   * 計進 `ccAppliedTicks` 戰績），而紮根三件事一件都不是。⭐ 掛在**來源**上
   * 就結構性地全部成立：`StatsComp.sources` 不走 dispel、不走免控、不進 CC 帳。
   *
   * 在這一格之前它是**英雄卡上的一格布林**（`champion@1.immobile`，全 repo
   * 唯一一格，只有 `godie-e010` 用），也就是說「站著不能動」**只有換一整份英雄卡**
   * （＝變身）做得到。⇒ 這一格是「把 70-00 的變身態退場而不掉東西」的前提。
   *
   * 消費端只有一個：`sim/movementHold.ts`（`MovementSystem` 與 GH#216 接敵規則
   * 共用的**唯一**判準），而它走 `StatsComp.sources` 且**不問 `kind`** ——
   * 所以掛在 `applyBuff` 的限時來源上就是「接下來 6 秒站著不能動」，
   * 到期由那份 source 自己的 `expiresAtTick` 收掉，⛔ 不需要第二支掃描器。
   *
   * ⚠️ 型別是 `true` 而不是 `boolean`：`immobile: false` 會是一份「什麼都不做卻
   * 掛得上去」的來源（`hasSourceGrant` 會說有），而那是第一·五守則點名的形狀。
   * 不想要就**不要填這一格**。
   */
  immobile?: true;
  /**
   * ⭐ M5(2026-08-23) —— **主屬性覆寫**（STR→INT…）。第十一格。
   * 語意、詞彙與消費端見 {@link PrimaryAttributeGrant}。
   *
   * ⚠️ 多份來源同時覆寫時的贏家是 `sources` 陣列裡**最後**掛上的那一份
   * （`stats/statPipeline.ts::sourcePrimaryAttribute`）—— 與 `damageTypeOverride`
   * 同一個習慣，而 `sources` 的順序是決定性的（`syncAbilityPassives` 固定
   * Q/W/E/R→EX→天生技）。
   */
  primaryAttribute?: PrimaryAttributeGrant;
  /**
   * ⭐ M4(2026-08-23) —— **攻擊型態覆寫**（近戰 ↔ 遠程）。**第十二格。**
   *
   * owner 2026-08-22:「變身帶來許多問題，因此我想要**開啟變身態盡可能下架**項目群組」。
   * 19 對變身逐對量下來，有 **2 對**的差別裡包含「這具身體是近戰還是遠程」——
   * `godie-n00p` 妖狐 melee→ranged 與 `godie-o02l` 皮卡 ranged→melee ——
   * 而在這一格出現之前，`attackType` **只住在英雄卡上**（`ChampionDef` 的必填欄位）
   * ⇒「變成遠程」結構性地只有**換一整份英雄卡**（＝變身）做得到。
   *
   * ⛔ 它**不是**一條 `Stat`：`Stat` 上沒有「這具身體是近戰還是遠程」這個數字，
   * 而且它也不可以從射程反推 —— `statPipeline.ts` 已經逐字寫下理由：
   * 射程是會被道具／體型／`attackRange` 倍率動到的**衍生值**，用它反推身分
   * 等於讓一件裝備把近戰變成遠程。
   *
   * ⚠️ 消費端有**兩個**，⛔ 只接一個會得到「打得到人但吃錯環境倍率」（或反過來）：
   *   · `sim/systems/BasicAttackSystem.ts` —— 揮刀還是射一發（`resolveAttack` 的
   *     投射物分支、傷害點預設、`weaponClassOf` 的武器音效與揮擊軌跡）
   *   · `sim/stats/statPipeline.ts` —— `STAT_ENV_CHAIN` 的 `byAttackType` 那一格
   *     （近戰吃 `moveSpeedMelee`、遠程吃 `moveSpeedRanged`）
   * 兩者共用同一支 {@link sourceAttackType}，⛔ 不是兩份各自的摺疊。
   *
   * ⚠️ **刻意不含**第三個讀 `attackType` 的地方：`economy/offerEligibility.ts`
   * 的 `championAttackType`（`item@1.requiresAttackType` 的商店過濾）。理由是
   * 那一支回答的是「**這位英雄**該被推薦什麼裝備」，那是選角時就定下來的身分；
   * 讓一份 6 秒的 buff 去改它，商店的可選清單會在變身進出時整排跳動，
   * 而已經買下的裝備**沒有任何東西會重新檢查**（那份檔頭自己寫著這件事）。
   *
   * ⚠️ 多份來源同時覆寫時**最後掛上的贏**（照 `damageTypeOverride` /
   * `primaryAttribute` 的同一條規矩），而 `sources` 的順序是決定性的。
   */
  attackType?: AttackTypeGrant;
}

/**
 * 覆寫值的詞彙 —— ⭐ 從 {@link ChampionDef} 那一格**推導**，⛔ 不是第二份字面值。
 * 它的語意就是「蓋掉英雄卡上宣告的那一格」，所以兩邊永遠不可能漂
 * （英雄卡哪天多出第三種攻擊型態，這一格自動跟著寬）。
 */
export type AttackTypeGrant = ChampionDef["attackType"];

/**
 * ⭐ M4 —— 身上有沒有一份來源**改寫**了攻擊型態。沒有 = `undefined`
 * = 照英雄卡上那一格（逐位元不變，出貨 0 份文件填它）。
 *
 * ⚠️ 形狀與 `statPipeline.ts::sourcePrimaryAttribute` 逐行相同（最後掛上的贏、
 * 跳過已過期的來源），⛔ 但它住在**這裡**而不是那裡：M4 有**兩個**消費端，
 * 而其中一個（`BasicAttackSystem`）根本不經過統計管線。兩邊各寫一次摺疊
 * 就是兩份會漂移的實作（失敗形態⑤），而漂掉的症狀是「揮的是刀、吃的是遠程倍率」。
 *
 * ⚠️ 純函式、無 `Math.random` / `Date.now` / 三角函式 / `**`（`sim/purity.test.ts`）。
 */
export function sourceAttackType(
  sources: readonly ModifierSource[],
  tick: number,
): AttackTypeGrant | undefined {
  let out: AttackTypeGrant | undefined;
  for (const src of sources) {
    if (src.attackType === undefined) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= tick) continue;
    out = src.attackType;
  }
  return out;
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
    ...(from.vision !== undefined ? { vision: from.vision } : {}),
    ...(from.deathWard !== undefined ? { deathWard: from.deathWard } : {}),
    ...(from.immobile !== undefined ? { immobile: from.immobile } : {}),
    ...(from.primaryAttribute !== undefined
      ? { primaryAttribute: from.primaryAttribute }
      : {}),
    ...(from.attackType !== undefined ? { attackType: from.attackType } : {}),
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
    from.typeStreakImmunity !== undefined ||
    from.vision !== undefined ||
    from.deathWard !== undefined ||
    from.immobile !== undefined ||
    from.primaryAttribute !== undefined ||
    from.attackType !== undefined
  );
}

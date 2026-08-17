/** Core stats + the aggregated StatBlock. */

export enum Stat {
  MaxHealth = "maxHealth",
  HealthRegen = "healthRegen", // per second
  MaxMana = "maxMana",
  ManaRegen = "manaRegen",
  AttackDamage = "ad",
  AbilityPower = "ap",
  Armor = "armor",
  MagicResist = "mr",
  AttackSpeed = "as", // attacks/sec
  MoveSpeed = "ms", // units/sec
  CritChance = "critChance", // 0..1
  CritDamage = "critDamage", // 1.75 = +75%
  CooldownReduction = "cdr", // 0..1
  Lifesteal = "lifesteal", // 0..1 of basic-attack damage
  AttackRange = "range",
  /**
   * 迴避 — chance (0..1) for the DEFENDER to make an incoming BASIC ATTACK miss
   * outright. Rolled on the seeded rng at the moment the hit would land; a
   * dodged attack deals no damage, procs no on-hit hook and feeds no lifesteal.
   *
   * BASIC ATTACKS ONLY, and deliberately so — see sim/combat/evasion.ts for the
   * full model (WC3 `Evasion` fidelity + why it must not touch abilities).
   * 0 (every champion today) = no roll at all, so it is a strict no-op until
   * content opts in.
   */
  Evasion = "evasion", // 0..1
  /**
   * 技能吸血 — the same rate as {@link Lifesteal}, on the OTHER half of the
   * damage stream. `Lifesteal` is gated on `pkt.origin === "basic"` in
   * `combat/damage.ts`, so before this stat existed an item could only ever
   * vamp off autos, and 「全能吸血」 was unauthorable.
   *
   * ⭐ 第〇·五守則 —— this is one MECHANISM, not two item-shaped ifs. It unblocks
   * both 至尊魔戒 (godie-i004, owner 2026-08-10 「附加技能吸血 20%」) and
   * 落魂的嗜血劍 (godie-i00l), whose 「全能吸血+30%」 shipped as plain lifesteal
   * and whose authoringNote already named this exact gap and this exact fix.
   * 全能吸血 = `lifesteal` + `spellVamp` on the same doc — no third stat.
   *
   * 0 on every champion and every item that does not opt in, so it is a strict
   * no-op until content asks for it (same shape as {@link Evasion}).
   */
  SpellVamp = "spellVamp", // 0..1 of NON-basic damage
  /**
   * ── ⭐ G2 「輸出倍率」三兄弟（GH#354 / #356）─────────────────────────────
   *
   * owner 2026-08-17 的 20 件 [EX解放] 裡有 **7 件**要的是同一件事：
   * 「這一次施放／這一段時間內，我造成的**傷害·治療·護盾整體** ×N」
   * （#54 熟練度 · #57 三星許願 · #58 七寶玉 · #60 機動 · #64 再誕 · #65 福音 · #69 蒼月）。
   *
   * ⚠️ 這**不能**用既有的 `ad` / `ap` 表達，而理由是量到的：一支「造成 300 點固定
   * 傷害」的技能對 `ad`/`ap` 完全免疫。owner 的文案講的是**輸出**不是**屬性**，
   * 所以它必須坐在**封包層**（每一發傷害/治療/護盾各乘一次），⛔ 不是屬性層。
   *
   * ⭐ 三個消費端**都已經存在而且都在封包層**，所以這一族是「接上」不是「新建」：
   *   · 傷害 → `combat/damage.ts` 的傷害佇列（普攻／技能／DoT／道具觸發全走它）
   *   · 治療 → `combat/restore.ts::heal`（全 repo 唯一的補血入口）
   *   · 護盾 → `combat/damage.ts::addShield`（全 repo 唯一的生盾入口）
   *
   * ⚠️ 語意是**加成**不是倍率本身：0 = 不動（×1），0.25 = ×1.25。
   * ⛔ 刻意不是「預設 1 的倍率」—— 一個沒填的英雄會拿到 0，而 ×0 是**全部歸零**。
   * 這與 {@link SpellVamp} / {@link Evasion} 同一個形狀：出貨 0，內容不開就是嚴格 no-op。
   *
   * ⛔ 三個分開而不是一個 —— owner 的 20 件裡有的只放大治療（#69 蒼月）、
   * 有的只放大傷害（#54 熟練度）。合成一格就表達不出來。
   * 要「三個一起」的（#64 再誕）就在同一張卡填三格。
   */
  OutputDamagePct = "outputDamagePct", // 0 = ×1
  OutputHealingPct = "outputHealingPct", // 0 = ×1
  OutputShieldPct = "outputShieldPct", // 0 = ×1
}

export type StatBlock = Record<Stat, number>;

export const ALL_STATS: readonly Stat[] = Object.values(Stat);

export const STAT_CLAMPS: Partial<Record<Stat, [number, number]>> = {
  /**
   * 4.0 attacks/sec —— 一般上限 (owner 2026-07-28)。**解鎖**到 10.0 走
   * `sim/statCaps.ts` 的 `ModOp.CapRaise`,見那個檔案。
   *
   * ⚠️ 這裡的 4.0 是「沒有內容文件時的結構性預設」,真正生效的是
   * `config.stat-caps@1`(後台可調)。`finalizeStat` 只在拿不到那張表時才落到
   * 這個值 —— 和 combat-env / 基礎加成 同一個分層。
   *
   * 2026-07-28 之前這裡是 2.5,而且 #267 量完的結論是「不要放寬」—— 因為當時
   * 前搖是固定秒數,天花板 2.73 次/秒,放寬只會讓面板說謊。前提在同一天被修掉
   * (BasicAttackSystem 的前搖隨攻速縮短),所以放寬才有意義。**兩者不可分開。**
   */
  [Stat.AttackSpeed]: [0.2, 4.0],
  /**
   * ⚠️ 0.5 是**結構性預設**,真正生效的是 `config.stat-caps@1` 的 `cdr`(後台可調),
   * 和上面攻速那一條同一個分層。2026-08-10 之前這裡是 0.45,而 owner 當天要
   * 仙后座「CDR 再減少 50%」—— 那件道具會在**兩個地方**被無聲吃掉:道具欄位帶
   * (`ITEM_VALUE_LIMIT`) 直接 Zod 拒收,或者收下之後在這裡被夾成 0.45。
   * 兩種都是「後台存得下去、玩家拿不到」。
   * ⭐ 2026-08-10 owner 再放寬到 **0.99**（「99% 減免」），並且加了另一半:
   * **秒數地板 0.1**（`config.cooldown-rules@1`）。比率上限管長技能、秒數地板
   * 管短技能 —— 只有比率的話，一支 1 秒的技能在 99% 減免下是 0.01 秒。
   */
  [Stat.CooldownReduction]: [0, 0.99],
  [Stat.CritChance]: [0, 1],
  [Stat.MoveSpeed]: [2, 14],
  [Stat.Lifesteal]: [0, 0.8],
  /**
   * A rate, so the lower bound is the real guard: a NEGATIVE evasion is
   * meaningless (there is no "extra hittable" in this model) and would make
   * `chance()` consume an rng draw that can never succeed. The 0.8 ceiling
   * mirrors Lifesteal's: the strongest authored value in the source map is
   * 0.20 (12-00 感應意脈), so this leaves 4x headroom while still denying a
   * champion who literally cannot be hit by autos. Raise it knowingly if a
   * verified WC3 value ever exceeds it — do not rescale the content.
   */
  [Stat.Evasion]: [0, 0.8],
  /** 技能吸血 —— 與 {@link Stat.Lifesteal} 同一個區間,理由也同一條。 */
  [Stat.SpellVamp]: [0, 0.8],
};

/*
 * THE ATTACK-SPEED CEILING —— 近戰攻速的真正上限 —— 為什麼 2.5 沒有被拉高 (#267).
 *
 * Owner:「攻速上限分析，近戰攻速可以更高」. 這條上限被實測過，結論是：**它不是
 * 卡住近戰的東西**，拉高它只會讓面板說謊。
 *
 * 量測 A — 這條夾限幾乎不咬人。115 張英雄卡、等級 1..18、不帶任何道具：近戰的
 * 攻速中位數是 lv1 0.70、lv18 1.77，**沒有一位**靠基礎值＋敏捷碰到 2.5。唯一被
 * 夾的是 godie-h02n 腦包英雄，他的 `baseStats.as = 10` 忠實對應原圖的
 * `attack_cooldown = 0.1`（tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json），
 * 是惡搞英雄不是匯入錯誤，而且不在開放名單上。要撞到 2.5 得靠疊攻速裝
 * （lv18 近戰中位數還差 +41%，名刀-天狼一把就是 +123%）。
 *
 * 量測 B — 揮擊管線在 2.4 次/秒就飽和了。`BasicAttackSystem` 一次只揮一刀：
 * 前搖 0.25 s（8 tick）跑完才會放行下一刀，再加上結算那一 tick 本身，以及命中
 * 後 hitstop 會**暫停前搖**。thorne（前搖 0.25 s）在 30 Hz 打不還手的木樁 10 秒：
 *
 *     面板攻速   2.00  2.50  3.00  3.50  4.00
 *     實際次數/秒 2.00  2.30  2.40  2.40  2.40
 *
 * 也就是說 2.5 已經幾乎踩在飽和點上；把夾限拉到 4.0 只多 +4%（2.30 → 2.40），
 * 面板卻會從 2.50 跳成 4.00 —— 對玩家謊報 67%，正面違反 #125「顯示的數字必須
 * 是最終值」。而 82 位近戰裡有 22 位把前搖寫成 0.5 s，他們的真正天花板是
 * 2 次/秒，比這條夾限還低，拉高夾限對他們是完全的 no-op。
 *
 * 所以要讓「近戰攻速可以更高」真的發生，槓桿在 BasicAttackSystem（結算後那一
 * tick 的空窗、以及攻擊者自己的 hitstop 暫停自己的前搖）與 `attackDamagePoint`
 * 的內容值，不在這張表。那是一次會動到全體 DPS 手感的改動，需要 owner 拍板。
 *
 * 如果將來管線修好了、真的要放寬，這裡是唯一的地方：把上界改掉即可，
 * `recomputeStats` 是唯一讀它的人（商店即時預覽跑的也是同一支函式）。
 *
 * END OF THE #267 NOTE — the declaration below is unrelated.
 */

export const zeroStats = (): StatBlock => {
  const b = {} as StatBlock;
  for (const s of ALL_STATS) b[s] = 0;
  return b;
};

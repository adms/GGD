/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */

/**
 * summon — 召喚物 (GH#289 lane P2). Spawns one or more bodies that fight for
 * the caster and despawn on a deadline. `world.summon` carries owner + expiry
 * + the cap group; the tick lifecycle lives in `sim/summons.ts`.
 *
 * ── EVERY FIELD BELOW EXCEPT `championId`/`count` IS A DECISION POINT ──────
 * owner 2026-07-30: 「所有開發都要以編輯器可以彈性設定為準，**尤其是決策點**」.
 * The 52 「召喚代理」 in docs/ability-templates.md disagree with each other on
 * literally every one of them, so a branch picked in code would be wrong for
 * most of them:
 *
 *   · COUNT + SHAPE  — 96-04 獨孤九劍 puts 9 sword spirits ON the target point,
 *     91-002 亡靈大軍 rings 8 ghouls at 450u, 37-03 災難之牆 lays 9 wall units
 *     in a LINE 100u apart, 21-002 天破壤碎 scatters 40 points at random inside
 *     a rect. → `count` / `formation` / `spread` / `at`.
 *   · LIFETIME       — 18-04 億年樹 lives `9s × level`, 96-04 lives 10s,
 *     35-00 召喚佩 is a PET that persists until replaced. → `durationSec`
 *     ABSENT = permanent, which is WC3's own 0-duration form.
 *   · CAP            — 37-02 黑核晶 caps concurrent crystals at 7 and 「超過殺
 *     最舊」. That is where BOTH `maxAlive` and `onCap: "replaceOldest"` come
 *     from; they are not invented ceilings.
 *   · OWNER DEATH    — nothing in the JASS states it, so it must not be
 *     stated in code either. → `onOwnerDeath`.
 *
 * ⚠️ A summon is deliberately NOT a `mob` and NOT a `champion`:
 *   · no MobComp — the #215 wave scheduler counts `mob` entries against its
 *     own alive cap and pays 20 gold per kill from that ledger, and its AI
 *     targets 「every champion」 with no team notion, i.e. a summon wearing a
 *     MobComp would attack its own summoner;
 *   · no ChampionComp — `deathSystem` pays kill gold + the once-per-victim
 *     kill BOUNTY for anything `world.champion.has()`, so a champion-bodied
 *     summon would be a gold printer, and the scoreboard / duel resolution /
 *     placement all key off that same store.
 * It carries Transform + Health + Nav + Team + Stats + Abilities + Status, so
 * it walks (`orderSystem` chase → `movementSystem`) and swings
 * (`basicAttackSystem`) through the SHIPPED systems with no new AI.
 */
export interface SummonVariant {
  kind: "summon";
  /**
   * WHOSE BODY. `"champion"` (default) = the named doc. `"self"` = a copy
   * of the CASTER's own champion — 57-03 複製鏡 and 27-002 霧隱分身之術 are
   * clones, and naming the hero twice in their own ability doc is the kind
   * of duplication that goes stale on the next 變身 pair.
   */
  body?: "champion" | "self";
  /** which body to spawn — a champion doc id, resolved through the registry */
  /**
   * ⭐ 2026-09-02（GH#423）—— **`body:"self"` 時可缺席**（那條路在 sim 端一個字都不讀它）。
   * ⚠️ 「其餘 body 必須有」由 `schema/effects/summon.ts` 的 `refine` 釘住
   * （⛔ 不在 Zod 的 object 上 —— `discriminatedUnion` 只收 `ZodObject`）。
   */
  championId?: string;
  /** how many bodies this cast creates */
  count: number;
  /** seconds before despawn; ABSENT = permanent (the WC3 0-duration form) */
  durationSec?: number;
  /** level of the summoned body (WC3 summons scale off the ability level) */
  level?: number;
  /**
   * 歸屬 — whose side it fights on. `"owner"` (default) = the summoner's
   * team. `"neutral"` = the sentinel MONSTER team, i.e. hostile to
   * EVERYONE including the summoner (the WC3 「敵對召喚」 / 變異 form).
   */
  team?: "owner" | "neutral";
  /** anchor point: the caster (default), the first resolved target, or the cast point */
  at?: "self" | "target" | "point";
  /**
   * 固定陣型 or 隨機散佈. `"ring"` (default) spaces the bodies evenly around
   * the anchor, `"line"` lays them perpendicular to the caster's facing,
   * `"scatter"` draws from the world's SEEDED rng (never `Math.random`).
   */
  formation?: "ring" | "line" | "scatter";
  /** ring radius / line spacing / scatter radius, in GGD units */
  spread?: number;
  /**
   * 上限 — the most bodies this cap GROUP may hold at once. ABSENT =
   * {@link DEFAULT_SUMMON_CAP}: an un-authored summon is one content typo away
   * from filling the arena, which is a server-side entity leak, not a
   * balance question. ⭐ `0` = NO cap (GH#1076) — the `tpl-summon-agent`
   * default, whose origin reads 「0 ＝ 不設上限」; an author who wants a
   * ceiling writes the number.
   */
  maxAlive?: number;
  /**
   * What the cap counts. `"casterAbility"` (default) = per caster PER
   * ability, so a hero's pet and its ultimate's swarm do not evict each
   * other; `"caster"` = one budget for everything that hero summons.
   */
  capScope?: "caster" | "casterAbility";
  /** at the cap: drop the new body (default) or evict the oldest (37-02 黑核晶) */
  onCap?: "skip" | "replaceOldest";
  /** summoner dies → the body despawns (default) or fights on to its deadline */
  onOwnerDeath?: "despawn" | "persist";
  /** ×the source champion's own maxHealth (1 = the hero's own sheet) */
  hpMult?: number;
  /** ×the source champion's own attack damage */
  damageMult?: number;
  /**
   * Who is paid when the SUMMON lands a killing blow.
   *
   * ABSENT / `"none"` = nobody, which is what the sim does today by
   * construction: `deathSystem` gates every payout on
   * `world.champion.has(killer)` and a summon is not a champion.
   *
   * ⚠️ `"owner"` is NOT IMPLEMENTED and the handler REFUSES it out loud
   * (the `shield.absorbs` precedent). Paying the owner needs a killer-
   * rewrite seam inside `systems/DeathSystem.ts`, which is another lane's
   * file; re-deriving the gold/xp/bounty/assist/killCombo ladder over here
   * would be a SECOND payout path that drifts from the first one silently.
   */
  killCredit?: "none" | "owner";
  /* ── 誰打得到它 —— 決策點。解析器/預設值/理由: sim/summonRules.ts ─────
   * A summon is deliberately neither `champion` nor `mob`, and BOTH of the
   * sim's automatic target pickers were allow-lists over exactly those two
   * stores (`targeting.isAutoTargetable`, `MobSystem`'s aggro scan), so on
   * the shipped path NOTHING could ever auto-acquire one: measured at 300
   * ticks with a summon standing ON an enemy champion, `attackTarget` never
   * left `null` and the body took 0 damage. These six fields are what turned
   * that from a hard-coded fact into an authored one. */
  /** 敵方自動索敵看不看得見它; ABSENT = true (WC3: an ordinary unit) */
  autoTargetable?: boolean;
  /** 索敵比較器的第一鍵; ABSENT = `"summon"` (its own tier, hero > it > mob) */
  targetPriority?: "champion" | "summon" | "mob";
  /** #215 殭屍咬不咬它; ABSENT = true (WC3: creeps fight summoned units) */
  mobTargetable?: boolean;
  /** 玩家點不點得到它; ABSENT = true (WC3: right-clickable) */
  manualTargetable?: boolean;
  /** 火圈燒不燒它; ABSENT = true (owner 2026-07-30 的 保底 —— 見 summonRules.ts) */
  burnsInFireRing?: boolean;
  /** 打死它給擊殺者多少金幣; ABSENT = 0 (WC3: 召喚物不是給錢的單位) */
  bountyGold?: number;
}

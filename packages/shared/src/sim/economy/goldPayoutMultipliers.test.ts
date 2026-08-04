/**
 * 金錢發放倍率 ×5 (owner 2026-08-04「金錢發放有點太浮濫了，請你將獲得金錢也改成
 * 系統倍率在後台設定，但是分為 回合發放倍率, 打殭屍發放倍率, 擊敗英雄發放倍率,
 * 完成任務發放倍率 四種」→ 同日追加「打殭屍 => 0.1x 這樣看起來就好了」與
 * 「普通殭屍 的確也可以單獨倍率，預設改成 0.5」，所以打殭屍那一格拆成
 * `goldMobKill`（普通殭屍）與 `goldEliteKill`（特殊殭屍 + 殭屍王）兩格).
 *
 * 這個檔守四件事，每一件都對著一個具體的失敗形態：
 *
 * ① 中性表（全部 1.0）→ 金額**逐位元不變**。這是回歸守衛：`scaleGoldPayout` 的
 *    `factor === 1` 早退讓「沒轉旋鈕」與「這個功能不存在」是同一個世界。
 *    ⚠️ 中性表不等於出貨表 —— 出貨值住在 `content/config/combat-env.json`
 *    （goldMobKill 0.5 / goldEliteKill 0.1 是 owner 指定的平衡改動），而
 *    `COMBAT_ENV_DEFAULTS` 是「主機讀不到內容時」的 fail-safe，必須維持中性。
 *
 * ② 一般殭屍與特殊殭屍/殭屍王**分屬兩格**。這是這一輪唯一的新機制，也是最容易
 *    做成假的一件事：兩種怪都叫「殭屍」，接到同一格照樣會過所有舊測試。所以每一
 *    種怪都有「關掉自己會歸零」**而且**「關掉另一格自己不動」兩個方向。
 *
 * ③ 殭屍王在 `goldEliteKill`，不在 `goldQuest`。#262/#263 都還 pending，所以今天
 *    沒有任何任務在發錢，而王是全場最大的一筆 —— 掛錯格子的症狀是「我把打殭屍
 *    調成 0.1 了，錢還是很多」，那是一份對著正常功能開的缺陷單。
 *
 * ④ 驗機制不驗數字 (CLAUDE.md「不要過度測試不重要的功能，特別是數值調整」)。
 *    期望值一律從 `GOLD_REWARDS` / `mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG)` /
 *    `guardianRulesFromConfig(DEFAULT_GUARDIAN_TOWER_CONFIG)` 推導，或是拿「同一個
 *    情境跑中性表」當對照組。0.5 / 0.1 / 20 / 5000 / 30000 一個都沒有抄進斷言。
 *
 * 跑的是**真的 `SimWorld` 與真的系統**（DeathSystem / MobSystem / GuardianSystem
 * 都由 `w.step()` 驅動），不是手寫 fixture —— 失敗形態 ⑤「被測的不是出貨的那個」。
 * 「回合」那一類不在這個檔：它的發放點在 `apps/game-server` 的 MatchController，
 * 由 `match/goldRoundMultiplier.test.ts` 跑一場真的比賽來守。
 *
 * ⚠️ 為什麼 `specialFlatRules()` 要把 `special.bounty` 拿掉：出貨設定的特殊殭屍
 * **有**分紅獎池，所以它永遠走 `payMobBounty`，`MobSystem` 那條 flat 發放線
 * （每隻殭屍的 `rewardGold × rewardMult`）在出貨設定下只有普通殭屍會走到。
 * 「沒有獎池的特殊殭屍」是 `mobBountyRules` 明文支援的組態（arena 沒寫 `bounty`
 * 就是它），也是唯一能量到那條線上 kind 判斷的入口 —— 不建它，那個判斷就是一段
 * 沒有守衛的程式碼（失敗形態 ③：可以刪掉但測試全綠）。
 *
 * ── 突變紀錄（每一條都真的跑過：改壞 → 記下紅了幾條 → 改回 → 確認綠，2026-08-04）──
 *
 *   M1. `MobSystem` flat 發放線的 `dead.kind === "special" ? "elite" : "mob"`
 *       改成固定 `"mob"`（＝兩種怪接同一格）
 *       ⇒ **3 紅 / 23**：「關掉普通殭屍那一格，特殊殭屍與殭屍王一毛都不受影響」、
 *          「goldEliteKill 設 0 → 特殊殭屍不發」、「設 0.5 → 沒有獎池的特殊殭屍減半」。
 *   M2. `payMobBounty` 的 `kind === "normal" ? "mob" : "elite"` 改回
 *       `kind === "boss" ? "quest" : "elite"`（殭屍王掛回完成任務那一格）
 *       ⇒ **3 紅 / 23**：「goldEliteKill 設 0 → 殭屍王的獎池也不發」、
 *          「關掉英雄／任務／回合三格，特殊殭屍與殭屍王都不受影響」、
 *          「完成任務那一格設 0，殭屍王照領」。
 *   M3. Go mirror（`apps/platform/internal/combatenv`）的 `Keys` 拿掉
 *       `"goldMobKill"`
 *       ⇒ **2 紅**：`TestKeysMatchTheSharedSimList` 與新加的
 *          `TestGoldFactorsMatchTheSharedSimList`（後者同時證明「key 只加一半」
 *          會被抓到 —— 那正是 #136 abilityRange 事故的形狀）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import {
  COMBAT_ENV_DEFAULTS,
  isGoldEnvKey,
  normalizeCombatEnv,
  COMBAT_ENV_KEYS,
  type CombatEnvKey,
  type CombatEnvMultipliers,
} from "../combatEnv";
import { GOLD_REWARDS } from "./progression";
import { mobProfile, mobRulesFromConfig, spawnMob, summonMobBoss, type MobRules } from "../mobs";
import { beginCombatMobs } from "../systems/MobSystem";
import {
  beginCombatGuardians,
  guardianRulesFromConfig,
  type GuardianRules,
} from "../systems/GuardianSystem";
import {
  DEFAULT_GUARDIAN_TOWER_CONFIG,
  DEFAULT_MOB_WAVES_CONFIG,
} from "../../content/schema/config";
import { runEffects } from "../effects/effectRunner";
import type { EffectDef } from "../effects/effect";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;
const ROUND = 3;

/** 中性表 + 指定幾格覆寫 —— 走 `normalizeCombatEnv`，跟主機同一條路。 */
function env(over: Partial<Record<CombatEnvKey, number>> = {}): CombatEnvMultipliers {
  return normalizeCombatEnv(over);
}

/** 一顆不會被減傷吃掉的傷害封包（`type: "true"`，數字才是精確的）。 */
function hit(w: SimWorld, src: EntityId, target: EntityId, amount: number): void {
  w.damageQueue.push({ source: src, target, amount, type: "true", crit: false, origin: "ability" });
}

function champ(w: SimWorld, seat: number, team: number, x: number, z: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z },
    zone: 0,
  });
}

// ── 出貨規則（④：全部從 DEFAULT_* 推導，沒有一個字面值） ──────────────────

const BASE_MOB_RULES: MobRules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, ROUND);

/** 一般殭屍：`special.chance = 0` 讓每一隻都是 normal，沒有 rng 分支。 */
function normalMobRules(): MobRules {
  const b = BASE_MOB_RULES;
  return b.special === null ? b : { ...b, special: { ...b.special, chance: 0 } };
}

/**
 * 特殊殭屍，**沒有分紅獎池** —— 每一隻都是 special (`chance = 1`)，而且走的是
 * MobSystem 的 flat 發放線。這是唯一能碰到那條線上 kind 判斷的組態，見檔頭。
 */
function specialFlatRules(): MobRules {
  const b = BASE_MOB_RULES;
  if (b.special === null) throw new Error("出貨設定沒有特殊殭屍 —— 這組守衛失去主體");
  return { ...b, special: { ...b.special, chance: 1, bounty: null } };
}

/** 特殊殭屍，**帶出貨的分紅獎池** —— 走 `payMobBounty`，跟殭屍王同一條路。 */
function specialPoolRules(): MobRules {
  const b = BASE_MOB_RULES;
  if (b.special === null || b.special.bounty === null) {
    throw new Error("出貨設定的特殊殭屍沒有分紅獎池 —— 這組守衛失去主體");
  }
  return { ...b, special: { ...b.special, chance: 1 } };
}

const GUARDIAN_RULES: GuardianRules = guardianRulesFromConfig(DEFAULT_GUARDIAN_TOWER_CONFIG, DT);

/** 出貨值下，一次英雄擊殺該進袋多少（擊殺 + 首殺賞金，同一個 bucket）。 */
const HERO_BASE = GOLD_REWARDS.kill + GOLD_REWARDS.killBounty;

/** 某一種怪走 flat 發放線時該進袋多少 —— 走 MobSystem 自己的那條算式。 */
function flatMobBase(rules: MobRules, kind: "normal" | "special"): number {
  return Math.round(rules.rewardGold * mobProfile(rules, kind).rewardMult);
}

// ── 情境，每一個都跑真的系統 ──────────────────────────────────────────────

/** 擊敗英雄：A 打死 B，DeathSystem 在 `w.step` 裡付錢。回傳 A 賺到的金額。 */
function heroKillPayout(multipliers: CombatEnvMultipliers): number {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatEnv = multipliers;
  w.combatActive = true;
  const a = champ(w, 0, 0, -40, 0);
  const b = champ(w, 1, 1, -38, 0);
  const before = w.champion.get(a)!.gold;
  hit(w, a, b, 9_999_999);
  w.step(new Map());
  expect(w.health.get(b)!.alive, "被害者沒死，這條守衛什麼都沒測到").toBe(false);
  return w.champion.get(a)!.gold - before;
}

/**
 * 打殭屍（flat 發放線）：英雄補掉一隻怪，MobSystem 在 `w.step` 裡付錢。
 * `kind` 由傳進來的 rules 決定（`chance` 0 或 1），所以同一支函式量得到兩種怪。
 */
function flatMobKillPayout(
  rules: MobRules,
  kind: "normal" | "special",
  multipliers: CombatEnvMultipliers,
): { gold: number; evGold: number } {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatEnv = multipliers;
  w.combatActive = true;
  beginCombatMobs(w, rules, [0]);
  const a = champ(w, 0, 0, -40, 0);
  const mob = spawnMob(w, 0, rules, 1, 0);
  expect(w.mob.get(mob)!.kind, "生出來的不是預期的那一種怪").toBe(kind);
  const before = w.champion.get(a)!.gold;
  hit(w, a, mob, 99_999_999);
  w.step(new Map());
  expect(w.mob.has(mob), "殭屍沒死").toBe(false);
  const ev = w.events.find((e) => e.type === "mobSlain");
  expect(ev, "殭屍死了卻沒有 mobSlain 事件").toBeDefined();
  return { gold: w.champion.get(a)!.gold - before, evGold: ev!.data["gold"] as number };
}

/** 分紅結算面板上的一列（`mobBossSlain.shares[]` 的子集，只取這裡讀得到的欄位）。 */
interface PanelShare {
  id: EntityId;
  gold: number;
}

/**
 * 分紅獎池（特殊殭屍 or 殭屍王）：兩者都走 `payMobBounty`。
 *
 * ⚠️ 回傳的四個數字**是四個不同的消費端**，不是同一個數字抄四次 —— 這一點就是
 * 「總獎金 3,000 金 vs 你 +20,000 金」那個缺陷能藏起來的原因：
 *   · `gold`        錢包真的增加了多少（唯一的事實）
 *   · `evTotal`     面板抬頭 `totalGold`（`bossTotalLine` 讀它）
 *   · `evShares`    面板表格 `shares[].gold`（`mobBossModel` 的 `mine.gold` / `s.gold`）
 *   · `evSlainGold` 屍體上的浮動「+N 金」（`mobSlain.gold`，殭屍王沒有這一筆）
 */
function poolPayout(
  rules: MobRules,
  kind: "special" | "boss",
  multipliers: CombatEnvMultipliers,
): {
  killer: EntityId;
  gold: number;
  evTotal: number;
  evShares: PanelShare[];
  evSlainGold: number | null;
} {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatEnv = multipliers;
  w.combatActive = true;
  beginCombatMobs(w, rules, [0]);
  const a = champ(w, 0, 0, -40, 0);
  const mob = kind === "boss" ? summonMobBoss(w, 0, rules, a, 100) : spawnMob(w, 0, rules, 1, 0);
  expect(mob, "出貨設定生不出這一種怪 —— 這條守衛失去主體").not.toBeNull();
  expect(w.mob.get(mob!)!.kind).toBe(kind);
  const before = w.champion.get(a)!.gold;
  hit(w, a, mob!, 999_999_999);
  w.step(new Map());
  expect(w.mob.has(mob!), "怪沒死").toBe(false);
  const ev = w.events.find((e) => e.type === "mobBossSlain");
  expect(ev, "怪死了卻沒有分紅結算事件").toBeDefined();
  const slain = w.events.find((e) => e.type === "mobSlain");
  return {
    killer: a,
    gold: w.champion.get(a)!.gold - before,
    evTotal: ev!.data["totalGold"] as number,
    evShares: (ev!.data["shares"] as PanelShare[]).map((s) => ({ id: s.id, gold: s.gold })),
    evSlainGold: slain === undefined ? null : (slain.data["gold"] as number),
  };
}

const specialPool = (m: CombatEnvMultipliers) => poolPayout(specialPoolRules(), "special", m);
const bossPool = (m: CombatEnvMultipliers) => poolPayout(normalMobRules(), "boss", m);
const normalKill = (m: CombatEnvMultipliers) => flatMobKillPayout(normalMobRules(), "normal", m);
const specialFlatKill = (m: CombatEnvMultipliers) =>
  flatMobKillPayout(specialFlatRules(), "special", m);

/** 完成任務：守衛塔補刀（#89 的場上目標物）。 */
function guardianPayout(multipliers: CombatEnvMultipliers): { gold: number; evGold: number } {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatEnv = multipliers;
  w.combatActive = true;
  beginCombatGuardians(w, GUARDIAN_RULES, [0], ROUND);
  const tower = [...w.structure.keys()][0];
  expect(tower, "沒有守衛塔生出來").toBeDefined();
  const a = champ(w, 0, 0, -40, 0);
  const before = w.champion.get(a)!.gold;
  // 單發傷害有 `maxHitPctMaxHp` 上限，所以要打很多下 —— 走的是真的減傷/上限路徑。
  let guard = 0;
  while (w.structure.has(tower!) && guard++ < 200) {
    hit(w, a, tower!, 9_999_999);
    w.step(new Map());
  }
  expect(w.structure.has(tower!), "守衛塔沒被打掉").toBe(false);
  const ev = w.events.find((e) => e.type === "guardianSlain");
  expect(ev, "守衛塔死了卻沒有 guardianSlain 事件").toBeDefined();
  return { gold: w.champion.get(a)!.gold - before, evGold: ev!.data["gold"] as number };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ① 中性表（全 1.0）→ 逐位元不變
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("① 中性表：每一筆金額都跟加倍率之前完全一樣", () => {
  it("★ COMBAT_ENV_DEFAULTS 的每一格金錢倍率都是 1.0（fail-safe 必須是中性的）", () => {
    cover("gold-payout-multipliers");
    // 這不是出貨值 —— 出貨值在 content/config/combat-env.json，owner 已經把
    // 兩格調到 1.0 以下。這裡釘的是「主機讀不到內容時退回的那張表不會偷改經濟」。
    const goldKeys = COMBAT_ENV_KEYS.filter(isGoldEnvKey);
    expect(goldKeys.length, "金錢倍率一格都沒有 —— 這一組守衛失去主體").toBeGreaterThan(0);
    for (const k of goldKeys) {
      expect(COMBAT_ENV_DEFAULTS[k], `${k} 的 fail-safe 必須是中性的 1.0`).toBe(1);
    }
  });

  it("★ 中性表下，五種發放點的金額都等於各自規則算出來的原值", () => {
    cover("gold-payout-multipliers");
    const neutral = COMBAT_ENV_DEFAULTS;
    expect(heroKillPayout(neutral)).toBe(HERO_BASE);

    const n = normalKill(neutral);
    expect(n.gold).toBe(flatMobBase(normalMobRules(), "normal"));
    expect(n.evGold, "畫面上的「+N 金」必須等於真的進袋的錢").toBe(n.gold);

    const s = specialFlatKill(neutral);
    expect(s.gold).toBe(flatMobBase(specialFlatRules(), "special"));
    expect(s.evGold).toBe(s.gold);

    const g = guardianPayout(neutral);
    expect(g.gold).toBe(GUARDIAN_RULES.rewardGold);
    expect(g.evGold).toBe(g.gold);
  });

  it("★ 一個沒設定過的主機（空覆寫）與中性表得到同一組金額", () => {
    cover("gold-payout-multipliers");
    // `normalizeCombatEnv(undefined)` 是 platform 連不上時的 fail-safe 路徑。
    expect(heroKillPayout(normalizeCombatEnv())).toBe(HERO_BASE);
    expect(normalKill(normalizeCombatEnv()).gold).toBe(flatMobBase(normalMobRules(), "normal"));
  });

  it("★ 特殊殭屍與殭屍王的獎池在中性表下都真的發得出錢（後面幾條的對照組）", () => {
    cover("gold-payout-multipliers");
    // 下面每一條「關掉別格不受影響」都拿中性表的金額當基準，所以基準本身是 0
    // 的話那些條就是在比較 0 和 0 —— 全綠而且什麼都沒測到（失敗形態 ④）。
    expect(specialPool(COMBAT_ENV_DEFAULTS).gold).toBeGreaterThan(0);
    expect(bossPool(COMBAT_ENV_DEFAULTS).gold).toBeGreaterThan(0);
    expect(flatMobBase(specialFlatRules(), "special")).toBeGreaterThan(0);
    expect(flatMobBase(normalMobRules(), "normal")).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ② 一般殭屍 vs 特殊殭屍／殭屍王 —— 這一輪唯一的新機制
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("② 打一般殭屍發放倍率 goldMobKill", () => {
  it("★ 設 0 → 普通殭屍一毛都不發，事件上的數字也是 0（不是還在報原值）", () => {
    cover("gold-payout-multipliers");
    const n = normalKill(env({ goldMobKill: 0 }));
    expect(n.gold).toBe(0);
    expect(n.evGold).toBe(0);
  });

  it("★ 設 0.5 → 普通殭屍減半（走的是 grantGold 裡的那一次乘算）", () => {
    cover("gold-payout-multipliers");
    const base = flatMobBase(normalMobRules(), "normal");
    expect(normalKill(env({ goldMobKill: 0.5 })).gold).toBe(Math.round(base * 0.5));
  });

  it("★ 關掉普通殭屍那一格，特殊殭屍與殭屍王一毛都不受影響", () => {
    cover("gold-payout-multipliers");
    const off = env({ goldMobKill: 0 });
    expect(
      specialFlatKill(off).gold,
      "特殊殭屍讀到了普通殭屍那一格 —— 兩種怪接同一條線最典型的症狀",
    ).toBe(flatMobBase(specialFlatRules(), "special"));
    expect(specialPool(off).gold).toBe(specialPool(COMBAT_ENV_DEFAULTS).gold);
    expect(bossPool(off).gold).toBe(bossPool(COMBAT_ENV_DEFAULTS).gold);
  });

  it("★ 關掉英雄／任務／回合三格，普通殭屍不受影響", () => {
    cover("gold-payout-multipliers");
    expect(
      normalKill(env({ goldHeroKill: 0, goldQuest: 0, goldRoundPayout: 0 })).gold,
    ).toBe(flatMobBase(normalMobRules(), "normal"));
  });
});

describe("② 打特殊殭屍／殭屍王發放倍率 goldEliteKill", () => {
  it("★ 設 0 → 特殊殭屍不發（沒有獎池的 flat 那條線也一樣）", () => {
    cover("gold-payout-multipliers");
    const s = specialFlatKill(env({ goldEliteKill: 0 }));
    expect(s.gold).toBe(0);
    expect(s.evGold).toBe(0);
  });

  it("★ 設 0 → 特殊殭屍的分紅獎池也不發，事件上的總額跟著是 0", () => {
    cover("gold-payout-multipliers");
    const p = specialPool(env({ goldEliteKill: 0 }));
    expect(p.gold).toBe(0);
    expect(p.evTotal, "分紅結算面板必須報「真的付了多少」").toBe(0);
  });

  it("★ 設 0 → 殭屍王的獎池也不發（王在這一格，這是全場最大的一筆）", () => {
    cover("gold-payout-multipliers");
    const b = bossPool(env({ goldEliteKill: 0 }));
    expect(b.gold).toBe(0);
    expect(b.evTotal).toBe(0);
  });

  it("★ 設 0.5 → 沒有獎池的特殊殭屍減半", () => {
    cover("gold-payout-multipliers");
    const base = flatMobBase(specialFlatRules(), "special");
    expect(specialFlatKill(env({ goldEliteKill: 0.5 })).gold).toBe(Math.round(base * 0.5));
  });

  it("★ 關掉特殊殭屍那一格，普通殭屍照發 —— owner 要的就是這個不對稱", () => {
    cover("gold-payout-multipliers");
    expect(
      normalKill(env({ goldEliteKill: 0 })).gold,
      "普通殭屍讀到了特殊殭屍那一格 —— 合成一格就沒辦法「壓大筆、留涓流」",
    ).toBe(flatMobBase(normalMobRules(), "normal"));
  });

  it("★ 關掉英雄／任務／回合三格，特殊殭屍與殭屍王都不受影響", () => {
    cover("gold-payout-multipliers");
    const off = env({ goldHeroKill: 0, goldQuest: 0, goldRoundPayout: 0 });
    expect(specialFlatKill(off).gold).toBe(flatMobBase(specialFlatRules(), "special"));
    expect(specialPool(off).gold).toBe(specialPool(COMBAT_ENV_DEFAULTS).gold);
    expect(bossPool(off).gold).toBe(bossPool(COMBAT_ENV_DEFAULTS).gold);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ③ 殭屍王的歸屬 —— elite，不是 quest
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("③ 殭屍王歸在 goldEliteKill，不在 goldQuest", () => {
  it("★ 完成任務那一格設 0，殭屍王照領（王不是任務獎品那一格的東西）", () => {
    cover("gold-payout-multipliers");
    const neutral = bossPool(COMBAT_ENV_DEFAULTS).gold;
    expect(neutral, "殭屍王在中性表下就領不到錢 —— 這條守衛失去主體").toBeGreaterThan(0);
    expect(
      bossPool(env({ goldQuest: 0 })).gold,
      "殭屍王掛在完成任務那一格 —— owner 把打殭屍調成 0.1 之後會發現錢還是很多",
    ).toBe(neutral);
  });

  it("★ 反過來：特殊殭屍那一格設 0 時，守衛塔補刀不受影響", () => {
    cover("gold-payout-multipliers");
    expect(guardianPayout(env({ goldEliteKill: 0 })).gold).toBe(GUARDIAN_RULES.rewardGold);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ④ 其餘兩格（英雄 / 任務）—— 沿用上一輪的守衛
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("④ 擊敗英雄發放倍率", () => {
  it("★ 設 0 → 英雄擊殺一毛都不發", () => {
    cover("gold-payout-multipliers");
    expect(heroKillPayout(env({ goldHeroKill: 0 }))).toBe(0);
  });

  it("★ 設 0.5 → 減半（擊殺與首殺賞金都吃到同一格）", () => {
    cover("gold-payout-multipliers");
    expect(heroKillPayout(env({ goldHeroKill: 0.5 }))).toBe(
      Math.round(GOLD_REWARDS.kill * 0.5) + Math.round(GOLD_REWARDS.killBounty * 0.5),
    );
  });

  it("★ 把殭屍兩格／任務／回合關掉，英雄擊殺完全不受影響", () => {
    cover("gold-payout-multipliers");
    expect(
      heroKillPayout(
        env({ goldMobKill: 0, goldEliteKill: 0, goldQuest: 0, goldRoundPayout: 0 }),
      ),
      "英雄擊殺讀到了別人的那一格 —— 五個欄位最典型的接錯線",
    ).toBe(HERO_BASE);
  });
});

describe("④ 完成任務發放倍率", () => {
  it("★ 設 0 → 守衛塔補刀不發，事件上的數字也是 0", () => {
    cover("gold-payout-multipliers");
    const g = guardianPayout(env({ goldQuest: 0 }));
    expect(g.gold).toBe(0);
    expect(g.evGold).toBe(0);
  });

  it("★ 英雄／回合兩格關掉，守衛塔補刀不受影響", () => {
    cover("gold-payout-multipliers");
    expect(guardianPayout(env({ goldHeroKill: 0, goldRoundPayout: 0 })).gold).toBe(
      GUARDIAN_RULES.rewardGold,
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑤ 分紅結算面板：抬頭與每一列**都**要是實付
 *
 * 這一組守的不是倍率有沒有生效（②③ 已經守了），而是「**面板上那一列**讀的是
 * 實付還是請求」。這兩件事看起來很像，但只有前者有守衛時，`shares[].gold` 可以
 * 從 `paidShares` 改回 `shares` 而全綠 —— 而畫面上會同時出現
 * 「總獎金 3,000 金」與「你 +20,000 金」（抬頭讀 `totalGold`，表格讀 `shares[]`）。
 *
 * ⚠️ 這一組**必須在倍率 ≠ 1 的世界裡量**。中性表下請求與實付逐位元相同，
 * 所以任何在中性表上寫的斷言對兩種實作都會過（失敗形態 ④）。
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("⑤ 分紅結算面板的每一列 —— 實付，不是獎池設定值", () => {
  /** 面板上「我的那一份」。單人情境，所以它同時是抬頭、也是屍體上那個數字。 */
  function mine(p: ReturnType<typeof poolPayout>): number {
    const row = p.evShares.find((s) => s.id === p.killer);
    expect(row, "分紅面板上沒有補刀者自己那一列 —— 這條守衛失去主體").toBeDefined();
    return row!.gold;
  }

  it("★ 倍率減半：面板上「我的那一份」等於錢包真的增加的數字", () => {
    cover("gold-payout-multipliers");
    const half = env({ goldEliteKill: 0.5 });
    for (const [label, run] of [
      ["特殊殭屍", specialPool],
      ["殭屍王", bossPool],
    ] as const) {
      const p = run(half);
      expect(p.gold, `${label} 在半倍下一毛都沒發 —— 這條守衛失去主體`).toBeGreaterThan(0);
      expect(
        mine(p),
        `${label} 的分紅面板報的是獎池請求值，不是真的進袋的錢`,
      ).toBe(p.gold);
    }
  });

  it("★ 倍率減半：每一列加起來等於抬頭的總額（抬頭讀實付，列讀請求就會對不起來）", () => {
    cover("gold-payout-multipliers");
    const half = env({ goldEliteKill: 0.5 });
    for (const [label, run] of [
      ["特殊殭屍", specialPool],
      ["殭屍王", bossPool],
    ] as const) {
      const p = run(half);
      expect(p.evTotal, `${label} 的抬頭是 0 —— 這條守衛失去主體`).toBeGreaterThan(0);
      expect(
        p.evShares.reduce((a, s) => a + s.gold, 0),
        `${label}：面板抬頭與表格各報各的（「總獎金 N 金」對上「你 +M 金」）`,
      ).toBe(p.evTotal);
    }
  });

  it("★ 倍率 0：面板上每一列都是 0，不是還在報獎池設定的那個大數字", () => {
    cover("gold-payout-multipliers");
    const off = env({ goldEliteKill: 0 });
    for (const [label, run] of [
      ["特殊殭屍", specialPool],
      ["殭屍王", bossPool],
    ] as const) {
      const p = run(off);
      expect(p.gold, `${label} 在 0 倍下還是發了錢`).toBe(0);
      for (const s of p.evShares) {
        expect(s.gold, `${label}：一毛都沒發，面板卻還在報 ${s.gold} 金`).toBe(0);
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑥ 特殊殭屍屍體上的浮動「+N 金」
 *
 * `payMobBounty` 的**回傳值**餵給 MobSystem 的 `shares.find(...)?.gold`，那個
 * 數字就是 `mobSlain.gold` ＝ 屍體上那一行字。回傳請求值而不是實付，症狀是
 * 「屍體上寫 +5,000，錢包只多了 500」—— 跟 ⑤ 同一個病，不同的消費端。
 *
 * 殭屍王走的是另一條分支（`payMobBounty` 之後直接 `world.destroy`），沒有
 * `mobSlain`，所以這一組只有特殊殭屍。
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("⑥ 特殊殭屍屍體上的「+N 金」 —— 讀的是分紅實付", () => {
  it("★ 倍率減半：屍體上的數字等於錢包真的增加的數字", () => {
    cover("gold-payout-multipliers");
    const p = specialPool(env({ goldEliteKill: 0.5 }));
    expect(p.gold, "半倍下一毛都沒發 —— 這條守衛失去主體").toBeGreaterThan(0);
    expect(p.evSlainGold, "走獎池的特殊殭屍沒有發出 mobSlain —— 這條守衛失去主體").not.toBeNull();
    expect(
      p.evSlainGold,
      "屍體上的浮動字報的是獎池請求值，錢包卻只收到實付（失敗形態 ②）",
    ).toBe(p.gold);
  });

  it("★ 倍率 0：屍體上的數字是 0", () => {
    cover("gold-payout-multipliers");
    const p = specialPool(env({ goldEliteKill: 0 }));
    expect(p.gold).toBe(0);
    expect(p.evSlainGold).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑦ 召喚物賞金 —— 潛伏中的接線
 *
 * `summonBountyGold` 出貨預設 0，所以今天這條線一毛錢都不發，而那正是它危險的
 * 地方：接錯格子的那一天不會有任何症狀，直到某個作者把賞金打開，玩家才發現
 * 「我把打殭屍調成 0.1，可是打死寵物還是給滿額」。所以這裡自己把賞金打開。
 *
 * ⚠️ `TEST_SUMMON_BOUNTY` 是**測試輸入**不是出貨值 —— 出貨值是 0，而 0 量不到
 * 任何東西（0 × 任何倍率都是 0，兩個格子看起來一模一樣）。
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("⑦ 召喚物賞金走「打一般殭屍」那一格", () => {
  const TEST_SUMMON_BOUNTY = 400;

  /** B 召一隻寵物，A 打死它 —— `summonSystem` 在 `w.step` 裡付錢給 A。 */
  function summonBountyPayout(multipliers: CombatEnvMultipliers): number {
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatEnv = multipliers;
    w.combatActive = true;
    const hunter = champ(w, 0, 0, -40, 0);
    const owner = champ(w, 1, 1, -20, 0);
    // 走**出貨的** summon handler + 出貨的 `runEffects` dispatch（失敗形態 ⑤）。
    runEffects(
      [
        {
          kind: "summon",
          championId: "thorne",
          count: 1,
          durationSec: 600,
          at: "target",
          spread: 1,
          bountyGold: TEST_SUMMON_BOUNTY,
        } as EffectDef,
      ],
      {
        world: w,
        caster: owner,
        rank: 1,
        targets: [owner],
        origin: "ability:test.summon",
        rng: w.rng,
      },
    );
    const pet = [...w.summon.keys()][0];
    expect(pet, "出貨的 summon handler 沒有放下任何身體 —— 這條守衛失去主體").toBeDefined();
    const before = w.champion.get(hunter)!.gold;
    hit(w, hunter, pet!, 999_999_999);
    w.step(new Map());
    expect(w.summon.has(pet!), "召喚物沒死").toBe(false);
    return w.champion.get(hunter)!.gold - before;
  }

  it("★ 中性表下賞金真的發得出來（後面兩條的對照組）", () => {
    cover("gold-payout-multipliers");
    expect(
      summonBountyPayout(COMBAT_ENV_DEFAULTS),
      "中性表下就沒發賞金 —— 下面兩條會變成在比較 0 和 0",
    ).toBe(TEST_SUMMON_BOUNTY);
  });

  it("★ 打一般殭屍那一格設 0 → 打死寵物一毛都沒有", () => {
    cover("gold-payout-multipliers");
    expect(
      summonBountyPayout(env({ goldMobKill: 0 })),
      "召喚物賞金沒有走 mob 那一格 —— owner 壓小怪錢時它會漏出來",
    ).toBe(0);
  });

  it("★ 特殊殭屍／英雄／任務／回合四格關掉，寵物賞金原封不動", () => {
    cover("gold-payout-multipliers");
    expect(
      summonBountyPayout(
        env({ goldEliteKill: 0, goldHeroKill: 0, goldQuest: 0, goldRoundPayout: 0 }),
      ),
      "打死一隻寵物不是打死特殊殭屍／英雄，賞金不該掛在那些格子上",
    ).toBe(TEST_SUMMON_BOUNTY);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 上下界（#277：上界不是裝飾）
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("上下界", () => {
  it("★ 0 是合法值（「完全不發」是 owner 指名要能設定的狀態）", () => {
    cover("gold-payout-multipliers");
    // 其他倍率的下限是 0.1；這幾格必須放行 0，否則 owner 要的那個狀態根本設不到。
    expect(normalizeCombatEnv({ goldMobKill: 0 }).goldMobKill).toBe(0);
    expect(normalizeCombatEnv({ goldEliteKill: 0 }).goldEliteKill).toBe(0);
  });

  it("★ 負數被 fail-safe 擋掉，退回中性值而不是把錢變成負的", () => {
    cover("gold-payout-multipliers");
    expect(normalizeCombatEnv({ goldHeroKill: -3 }).goldHeroKill).toBe(1);
    expect(heroKillPayout(env({ goldHeroKill: -3 }))).toBe(HERO_BASE);
  });
});

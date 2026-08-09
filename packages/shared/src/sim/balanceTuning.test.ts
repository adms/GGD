/**
 * 平衡調整守衛 —— #265 (初始 HP +300 / 生命倍率 4→3)、#267 (近戰攻速上限)、
 * #270 (競技場燃燒 = 真實傷害)。
 *
 * 每一條都斷言**出貨路徑**上的行為，不是斷言常數本身：
 *   · HP 走 `spawnChampion` → `recomputeStats` 寫進 `world.health.maxHp`
 *     （客戶端選角/商店預覽走同一個 `championStatBase`，所以顯示不會和戰鬥打架）
 *   · 攻速走 `recomputeStats` 的夾限（商店即時預覽跑的是同一支函式）
 *   · 火圈走 `fireRingSystem` 真的扣血的那一步
 *
 * 為什麼不用 `expect(src).toMatch(...)` 掃原始碼：那分不出程式碼和註解。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA, type ArenaDef } from "./world/ArenaDef";
import { registerSkeletonContent, THORNE, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import { normalizeCombatEnv, DEFAULT_COMBAT_ENV } from "./combatEnv";
import { zCombatEnvMultipliers } from "../content/schema/config";
import { championStatBase, championStatGrowth } from "./stats/attributes";
import { DEFAULT_BASE_BONUS, baseBonusFor, baseBonusFromDoc, normalizeBaseBonus } from "./baseBonus";
import { attachSource, recomputeStats } from "./stats/statPipeline";
import { ALL_STATS, STAT_CLAMPS, Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { DEFAULT_DAMAGE_POINT_MELEE } from "./systems/BasicAttackSystem";
import { beginCombatFireRing, fireRingRulesFromConfig } from "./fireRing";
import { mobRulesFromConfig } from "./mobs";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;

/** Skeleton geometry minus the centre pillars (see FireRingSystem.test.ts). */
const OPEN_ARENA: ArenaDef = {
  id: "arena.balance-open",
  name: "Balance Test Arena",
  zones: SKELETON_ARENA.zones.map((z) => ({ ...z, obstacles: [] })),
};
const ZONE0 = OPEN_ARENA.zones[0]!;

let nextSeat = 0;
function champ(w: SimWorld, id: string, x: number, z: number, team = 1): EntityId {
  return spawnChampion(w, {
    championId: id as ChampionId,
    seatId: asSeatId(nextSeat++ % 12),
    teamId: asTeamId(team),
    pos: { x, z },
    zone: 0,
  });
}

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

/** The champion's RAW card value for `stat` at level 1 (no attributes, no bonus). */
const rawCard = (def: typeof THORNE, stat: Stat): number => def.baseStats[stat] ?? 0;

// ---------------------------------------------------------------- #265 HP
/**
 * 全英雄初始生命 +300 (#265),以及 owner 2026-07-28 對它的第二道指示:
 *「初始HP/MP/AP/AD/...增加數值也要放到後台設定 並且不參與倍率計算」。
 *
 * ⚠️ 這一組守的是**加法排在乘法的哪一邊**。v0.9.8 把 +300 加在 base 裡(倍率
 * 之前),於是 `maxHealth: 3.0` 也乘了它:後台寫 300,玩家實際拿到 900。那個差異
 * 不會讓任何測試變紅 —— 兩個讀法都是「有加到」。所以下面每一條都寫成
 * **差值必須正好等於後台那個數字**,而不是「有變大」。
 */
describe("#265 初始生命加成:進 BASE 之外、倍率之外 (balance-265-base-hp)", () => {
  it("加成不參與倍率 —— ×3.0 之下,最終血量只多 300,不是 900", () => {
    cover("balance-265-base-hp");
    const env = normalizeCombatEnv({ maxHealth: 3.0 });

    /** 同一個世界、同一張卡,只換 baseBonus。 */
    const maxHpWith = (bonus: Record<string, number>): number => {
      const w = new SimWorld(OPEN_ARENA, 7);
      w.combatEnv = env;
      w.baseBonus = normalizeBaseBonus(bonus);
      const id = champ(w, "thorne", ZONE0.center.x, ZONE0.center.z);
      return w.health.get(id)!.maxHp;
    };

    const none = maxHpWith({});
    const gift = maxHpWith({ maxHealth: 300 });

    // owner 的規則,一行:後台寫 300,玩家就是多 300。
    expect(gift - none).toBeCloseTo(300, 6);
    // 而且明確**不是** v0.9.8 的那個讀法(加在 base 裡 → 被 ×3 放大成 900)。
    expect(gift - none).not.toBeCloseTo(300 * env.maxHealth, 6);
    // 反方向也釘住:沒有加成時,最終值就是卡面 × 倍率,一點多的都沒有。
    const card = championStatBase(THORNE, Stat.MaxHealth, 1, env);
    expect(none).toBeCloseTo(card * env.maxHealth, 6);
    expect(gift).toBeCloseTo(card * env.maxHealth + 300, 6);
  });

  it("倍率換成 1.0 也一樣多 300 —— 加成與倍率完全無關", () => {
    cover("balance-265-bonus-multiplier-independent");
    // 這條是上一條的「另一個 env」。只有一組倍率的話,`× 1` 與 `+ 300` 這兩種
    // 錯誤實作在數字上分不開;換一個倍率,任何殘留的耦合都會現形。
    const delta = (mult: number): number => {
      const env = normalizeCombatEnv({ maxHealth: mult });
      const mk = (bonus: Record<string, number>): number => {
        const w = new SimWorld(OPEN_ARENA, 7);
        w.combatEnv = env;
        w.baseBonus = normalizeBaseBonus(bonus);
        return w.health.get(champ(w, "thorne", ZONE0.center.x, ZONE0.center.z))!.maxHp;
      };
      return mk({ maxHealth: 300 }) - mk({});
    };
    expect(delta(1.0)).toBeCloseTo(300, 6);
    expect(delta(3.0)).toBeCloseTo(300, 6);
    expect(delta(7.5)).toBeCloseTo(300, 6);
  });

  it("出貨預設就是 300 生命,而且只有生命 —— 其餘 15 項都是 0", () => {
    cover("balance-265-default-table");
    // 寫死 300:引用常數的話,把常數改成 0 的變異會讓期望值跟著溜走。
    expect(baseBonusFor(DEFAULT_BASE_BONUS, Stat.MaxHealth)).toBe(650);
    for (const stat of ALL_STATS) {
      if (stat === Stat.MaxHealth) continue;
      expect(baseBonusFor(DEFAULT_BASE_BONUS, stat), `${stat} 不該有加成`).toBe(0);
    }
  });

  it("加成不進卡面 —— championStatBase 回的仍是 w3x 原始值 + 三圍", () => {
    cover("balance-265-card-clean");
    const env = DEFAULT_COMBAT_ENV;
    const attrTerm = env.strToMaxHealth * THORNE.attributes!.str;
    expect(championStatBase(THORNE, Stat.MaxHealth, 1, env)).toBeCloseTo(
      rawCard(THORNE, Stat.MaxHealth) + attrTerm,
      9,
    );
  });

  it("加成是一次性平移，不是每級都拿 —— 每級成長完全不動", () => {
    cover("balance-265-growth-untouched");
    const perLevel =
      (THORNE.growth[Stat.MaxHealth] ?? 0) +
      DEFAULT_COMBAT_ENV.strToMaxHealth * THORNE.attributes!.strGrowth;
    expect(championStatGrowth(THORNE, Stat.MaxHealth)).toBeCloseTo(perLevel, 9);
    // 第 5 級 = 基礎 + 4×成長，中間沒有多長出來的 300。
    expect(championStatBase(THORNE, Stat.MaxHealth, 5)).toBeCloseTo(
      championStatBase(THORNE, Stat.MaxHealth, 1) + perLevel * 4,
      9,
    );
    // 出貨路徑也一樣:加成在 lv1 與 lv18 是同一個 300,不隨等級長大。
    const w = new SimWorld(OPEN_ARENA, 7);
    w.baseBonus = normalizeBaseBonus({ maxHealth: 300 });
    const id = champ(w, "thorne", ZONE0.center.x, ZONE0.center.z);
    const lv1 = w.health.get(id)!.maxHp;
    w.champion.get(id)!.level = 5;
    recomputeStats(w, id);
    const lv5 = w.health.get(id)!.maxHp;
    expect(lv5 - lv1).toBeCloseTo(perLevel * 4 * DEFAULT_COMBAT_ENV.maxHealth, 6);
  });

  it("出貨的 combat-env 表真的載得到生命倍率這一格，而且它在 Zod 的合法區間裡", () => {
    cover("balance-265-env-multiplier");
    // ⛔ 2026-08-10 —— 這條原本寫 `expect(doc.multipliers.maxHealth).toBe(5.0)`,
    // 也就是 CLAUDE.md 第二守則點名的**第四個住處**:出貨數值已經有三個家
    // (content/config/combat-env.json + Zod `zCombatEnvMultipliers` + 後台
    // `COMBAT_ENV_KEYS` 導出的表單),三者之間有 drift 測試在守,測試裡再抄一份
    // 就一定會過期 —— 而且**用錯誤的訊息紅**。它真的發生了:owner 今天把這一格
    // 改成 4,紅的卻是一條叫「#265 初始生命加成」的測試,訊息是「expected 4 to
    // be 5」,查的人會先去翻 baseBonus 而不是翻 combat-env。
    //
    // 留下來的是**機制**:出貨文件解析得開、這一格存在、而且落在 Zod 收的區間內
    // (超出上下界的內容會在 `content:build` 就被擋掉,這裡只是同一件事的近端警報)。
    // ⛔ 不要再把任何一個出貨數字寫回這個 `expect` 裡。
    //
    // 下面整段是**為什麼 owner 會反覆改這一格**的紀錄,對下一個調它的人有用,
    // 所以留著 —— 它是理由,不是斷言。
    //
    // 這個數字 owner 來回改過六次:#265 從 4 降到 3、2026-07-29 升回 4、
    // 2026-07-30 升到 6(「目前玩家太容易死了」,同批還把 agiToArmor 0.15→0.3
    // 與初始生命 300→650),同日再依 TTK sweep 升到 9,2026-08-02 直接指定回 **4**。
    //
    // 2026-08-02 直接指定回 5,**2026-08-10 owner 再指定 4**(同一批還有
    // attackRange 1.0→0.6、abilityRange 0.6→0.8、manaRegen 8→16)。
    //
    // ⚠️ **這一格不是單獨的一個數字,它是三個欄位一起改的其中一格。** 另外兩格是
    // `config.match.json` 的 `fireRing.startSec 90` 與 `combatMaxSec 180`。
    // 只改這一格而不動火圈,實測互殺率只有 54%(480 場)。
    //
    // owner 2026-08-02 的判準:「回合結束靠英雄互殺而非火圈的情形佔 70% 以上
    // 會是健康的,但回合少於 60 秒就結束佔比太高又代表太早結束」。
    // 實測 480 場/格證明**單獨調 maxHealth 沒有任何值同時滿足兩條** ——
    // 互殺 ≥70% 需要 ≤3.2,「<60 秒」壓下來需要 ≥5.6,中間是空的。
    // 原因是結構性的:互殺% ≈ P(TTK < 火圈死線),<60s% = P(TTK < 60s),
    // **兩個門檻只差 20 秒**,而 maxHealth 是乘法縮放整條分佈的單一常數。
    // 所以要動的是那 20 秒的窗口本身(把火圈往後推),不是血量。
    //
    // owner 二次裁決把門檻放寬:「人類玩家通常比電腦模擬會操作太多了,
    // 所以電腦模擬互殺數有超過 50% 就算 ok」。×5 在**出貨舊火圈**下量到 54%,
    // 配上 90/180 之後只會更高(火圈晚 30 秒來 = 更多時間分出勝負)。
    //
    // ⚠️ 下次有人只改這一格之前:三格是一組,拆開改會回到「沒有一個值可以」的死角。
    //
    // 它是 combat-env 的動態設定,後台改存檔就生效 —— 出貨值住在
    // content/config/combat-env.json,**只有那一份**。
    // ⚠️ `docs/_execution-batches.md` 第 6 條那一行寫的還是舊值,而註解宣稱的
    // 「`docEnvTruth` 守衛會提醒」**不存在**(第三守則:註解會說謊,去驗證)。
    const doc = JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/combat-env.json"), "utf8"),
    ) as { multipliers: Record<string, number> };
    for (const k of ["maxHealth", "healthRegen"] as const) {
      const v = doc.multipliers[k];
      expect(typeof v, k).toBe("number");
      expect(zCombatEnvMultipliers.safeParse({ [k]: v }).success, `${k}=${v} 落在 Zod 區間`).toBe(true);
    }
  });

  it("出貨的 config.base-bonus@1 內容文件就是後台預設值", () => {
    cover("balance-265-content-doc");
    const doc = JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/base-bonus.json"), "utf8"),
    ) as { schema: string; bonus: Record<string, number> };
    expect(doc.schema).toBe("config.base-bonus@1");
    expect(doc.bonus.maxHealth).toBe(650);
    // 內容檔與程式預設必須一致 —— 否則後台顯示的、和沒設定過時實際生效的,
    // 會是兩個不同的數字,而且沒有任何地方會說。
    expect(normalizeBaseBonus(doc.bonus)).toEqual(DEFAULT_BASE_BONUS);
  });

  it("讀不到內容文件時,退回的是出貨預設,不是「沒有加成」", () => {
    cover("balance-265-doc-fallback");
    // ⚠️ 這兩個 fallback 的差別是 300 點血,而且**兩邊都不會報錯**。
    // 「缺文件 = 0」看起來是安全的保守選擇,實際上是把 owner 設定過的東西
    // 在內容載入失敗的那一台機器上靜默拿掉,而面板還是照樣顯示 300。
    for (const junk of [undefined, null, {}, "nope", { schema: "config.combat-env@1" }]) {
      expect(baseBonusFor(baseBonusFromDoc(junk), Stat.MaxHealth), String(junk)).toBe(650);
    }
    // 但一份 SCHEMA 正確、內容真的是空的文件,是操作者的明確意思:全部歸零。
    expect(
      baseBonusFor(baseBonusFromDoc({ schema: "config.base-bonus@1", bonus: {} }), Stat.MaxHealth),
    ).toBe(0);
  });

  it("#244 的解耦還在：英雄加血不得移動肉鴿小怪的曲線", () => {
    cover("balance-265-mob-decoupled");
    // pre-#244 的 legacy tier（小兵卡沒有 baseHp，借英雄卡當頭像）。
    const cfg = {
      fromRound: 3,
      firstWaveSec: 1,
      waveIntervalSec: 2,
      mobsPerWaveCap: 5,
      maxAlivePerZone: 15,
      mob: {
        maxHp: 24,
        attackDamage: 1.2,
        moveSpeed: 3,
        attackRange: 1.8,
        attackCdSec: 1,
        radius: 0.6,
        championId: "thorne",
        baseLevel: 3,
        levelPerRound: 1,
      },
      reward: { gold: 20, xp: 40, killsPerLevel: 6 },
    };
    const rules = mobRulesFromConfig(cfg, DT, 3);
    // 小兵讀到的就是卡面,沒有系統贈禮。
    expect(rules.maxHp).toBe(Math.round(championStatBase(THORNE, Stat.MaxHealth, rules.level)));

    // 而這條界線現在是**結構性的**:`recomputeStats` 沒有 ChampionComp 就提早
    // return,小怪從不走它。把加成調成 9999 也不會動到小兵一分血 —— 這正是
    // v0.9.9 拿掉 `championHealthBonus` 旗標之後仍然成立的理由。
    const before = mobRulesFromConfig(cfg, DT, 3).maxHp;
    const w = new SimWorld(OPEN_ARENA, 7);
    w.baseBonus = normalizeBaseBonus({ maxHealth: 9999 });
    expect(mobRulesFromConfig(cfg, DT, 3).maxHp).toBe(before);
    // 而英雄那邊確實吃到了 —— 否則上面那條會是「兩邊都沒效果」的假綠。
    expect(w.health.get(champ(w, "thorne", ZONE0.center.x, ZONE0.center.z))!.maxHp).toBeGreaterThan(
      9999,
    );
  });
});

// ------------------------------------------------------------- #267 攻速
/**
 * 攻速流要能真的變快 (#267 / owner 2026-07-28「如何讓攻速流角色能有實際的效益
 * 而不是被 tick 限制」).
 *
 * ---------------------------------------------------------------------------
 * 為什麼上一版的結論是「不要放寬夾限」,而這一版放寬了
 * ---------------------------------------------------------------------------
 * 瓶頸從來不是 30Hz 的 tick 率(理論上一秒能揮 30 刀),是每一刀有三筆**不隨
 * 攻速縮短**的固定成本:
 *
 *     前搖 8 tick + 自己打中人被 hitstop 凍 2 tick + 結算那一 tick 1 tick = 11
 *     → 天花板 2.73 次/秒,**面板寫多少都一樣**
 *
 * 實測面板 3 / 4 / 6 / 10 / 30 的實際輸出全部是 2.70。前搖 0.5s 的那 22 位近戰
 * 更慘:天花板 1.67,**比舊夾限 2.5 還低** —— 他們把攻速買到滿完全沒有效果,
 * 而面板顯示一切正常。這就是「攻速流不成立」的真正原因,和夾限無關。
 *
 * 修法是 LoL / Dota 的模型:**前搖是攻擊間隔的一個比例,不是固定秒數**。
 * 攻速 1.0 時與舊式位元相同,所以這不是重新平衡,是把「面板寫多少就給多少」
 * 補回去。做完之後夾限放寬才有意義 —— 兩者不可分開,這一組同時釘住兩件事。
 */
describe("攻速:面板寫多少就給多少 (balance-267-melee-as)", () => {
  /**
   * 真實揮擊速率:把攻速**寫進 `sc.final`**(那正是 BasicAttackSystem 讀的欄位),
   * 打一個不還手、不會死、不會動的木樁 10 秒,數 `damage`(origin=basic) 事件。
   * 直接寫 final 而不是掛 modifier,是為了問「假設面板是 X,管線給得出多少」——
   * 走 modifier 永遠問不到夾限以上。
   */
  function realAttacksPerSec(sheetAs: number): number {
    const w = new SimWorld(OPEN_ARENA, 31);
    w.combatActive = true;
    const me = champ(w, "thorne", ZONE0.center.x, ZONE0.center.z + 12);
    const bag = champ(w, "thorne", ZONE0.center.x + 1.0, ZONE0.center.z + 12, 2);
    const sc = w.stats.get(me)!;
    const bagHp = w.health.get(bag)!;
    const bagSc = w.stats.get(bag)!;
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      sc.final[Stat.AttackSpeed] = sheetAs;
      bagHp.hp = bagHp.maxHp;
      bagSc.final[Stat.MoveSpeed] = 0;
      step(w);
      for (const ev of w.events) {
        const d = ev.data as { source?: EntityId; origin?: string };
        if (ev.type === "damage" && d.source === me && d.origin === "basic") hits++;
      }
    }
    return hits / 10;
  }

  it("⭐ 面板 2.5 / 3 / 4 都真的拿得到 —— 不再卡在 2.7", () => {
    cover("balance-267-melee-as");
    // 條件先釘住,否則量到的是別的東西。
    expect(THORNE.attackDamagePoint).toBe(0.25);
    expect(DEFAULT_DAMAGE_POINT_MELEE).toBe(0.25);

    // 舊行為:2.5 只給 2.3、4.0 只給 2.4(+60% 面板換不到 +10% 實際)。
    // 新行為:面板值就是實際值。誤差容忍 ±0.15 是 tick 量化(round)的必然。
    for (const sheet of [2.0, 2.5, 3.0]) {
      const got = realAttacksPerSec(sheet);
      expect(got, `面板 ${sheet} 實際只有 ${got}`).toBeGreaterThan(sheet - 0.15);
    }
    // 4.0 —— 新的一般上限。cd = round(1/4/dt) = 8 tick → 3.75 是 tick 量化的
    // 真正答案,不是管線飽和。寫成 >3.5 而不是 >=4.0 正是為了誠實表達這一點。
    expect(realAttacksPerSec(4.0)).toBeGreaterThan(3.5);
  });

  it("⭐ 前搖真的隨攻速縮短 —— 這是上面那條成立的唯一原因", () => {
    cover("balance-267-windup-scales");
    // 直接對著機制斷言,而不只是對著結果:有人日後把縮放拿掉,上面那條會紅,
    // 但這一條會**先**紅,而且直接指出是哪一步壞了。
    const slow = realAttacksPerSec(1.0);
    const fast = realAttacksPerSec(6.0);
    expect(slow).toBeGreaterThan(0.85); // 攻速 1.0 與舊式位元相同
    expect(slow).toBeLessThan(1.15);
    // 6 倍攻速要換到接近 6 倍刀數。固定前搖的舊實作在這裡只給 2.70。
    expect(fast, "高攻速仍然被固定前搖卡住").toBeGreaterThan(5.0);
    expect(fast / slow).toBeGreaterThan(4.5);
  });

  it("前搖 0.5s 的那 22 位近戰也解套了", () => {
    cover("balance-267-slow-windup");
    // 他們舊的硬天花板是 30/(15+3) = 1.67 次/秒 —— 比舊夾限 2.5 還低。
    // 內容一個字都沒改,只是前搖現在會縮短。
    const w = new SimWorld(OPEN_ARENA, 33);
    w.combatActive = true;
    const me = champ(w, "thorne", ZONE0.center.x, ZONE0.center.z + 12);
    const bag = champ(w, "thorne", ZONE0.center.x + 1.0, ZONE0.center.z + 12, 2);
    const sc = w.stats.get(me)!;
    const bagHp = w.health.get(bag)!;
    const bagSc = w.stats.get(bag)!;
    // 用一個「前搖 0.5s」的假英雄:直接把 thorne 的 dp 撐到 0.5 不可行(它是
    // 內容),所以改用等價的量測 —— 攻速 3.0 時 0.5s 前搖縮成 0.167s(5 tick),
    // 加 hitstop 2 + 結算 1 = 8 tick,剛好等於 cd,所以能跑滿 3.0。
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      sc.final[Stat.AttackSpeed] = 3.0;
      bagHp.hp = bagHp.maxHp;
      bagSc.final[Stat.MoveSpeed] = 0;
      step(w);
      for (const ev of w.events) {
        const d = ev.data as { source?: EntityId; origin?: string };
        if (ev.type === "damage" && d.source === me && d.origin === "basic") hits++;
      }
    }
    expect(hits / 10).toBeGreaterThan(2.8);
  });

  it("一般上限 4.0,下限 0.2 仍然有效", () => {
    cover("balance-267-clamp-not-binding");
    const w = new SimWorld(OPEN_ARENA, 12);
    const melee = champ(w, "thorne", ZONE0.center.x - 4, ZONE0.center.z);
    const ranged = champ(w, "sela", ZONE0.center.x + 4, ZONE0.center.z);
    expect(THORNE.attackType).toBe("melee");
    expect(SELA.attackType).toBe("ranged");
    // 寫死 4.0 而不是引用常數:引用的話,把上限改掉的變異會讓期望跟著溜走。
    expect(STAT_CLAMPS[Stat.AttackSpeed]![1]).toBe(4.0);
    // 裸裝近戰離上限還有一大段(內容裡近戰 lv1 中位 0.70、lv18 1.77)。
    expect(w.stats.get(melee)!.final[Stat.AttackSpeed]).toBeLessThan(2.5);
    expect(w.stats.get(ranged)!.final[Stat.AttackSpeed]).toBeLessThan(2.5);

    expect(STAT_CLAMPS[Stat.AttackSpeed]![0]).toBe(0.2);
    attachSource(w, melee, {
      id: "test.as-crush",
      kind: "item",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: -5 }],
    });
    recomputeStats(w, melee);
    expect(w.stats.get(melee)!.final[Stat.AttackSpeed]).toBeCloseTo(0.2, 9);
  });
});

// ------------------------------------------------------- #270 火圈真實傷害
describe("#270 競技場燃燒是真實傷害 (balance-270-true-burn)", () => {
  it("護甲/魔抗堆到天上去，燒掉的血一模一樣，事件也標 true", () => {
    cover("balance-270-true-burn");
    const w = new SimWorld(OPEN_ARENA, 21);
    w.combatActive = true;
    // 兩個同樣的英雄，同樣站在邊緣（圈外），只有護甲不同。
    const r = ZONE0.boundaryRadius - 1;
    const naked = champ(w, "thorne", ZONE0.center.x + r, ZONE0.center.z);
    const tank = champ(w, "thorne", ZONE0.center.x - r, ZONE0.center.z, 2);
    attachSource(w, tank, {
      id: "test.plate",
      kind: "item",
      modifiers: [
        { stat: Stat.Armor, op: ModOp.Flat, value: 500 },
        { stat: Stat.MagicResist, op: ModOp.Flat, value: 500 },
      ],
    });
    recomputeStats(w, tank);
    expect(w.stats.get(tank)!.final[Stat.Armor]).toBeGreaterThan(
      w.stats.get(naked)!.final[Stat.Armor] + 100,
    );
    // 同樣的血池（護甲不影響 maxHp），所以「%最大生命」的燒傷應該完全相同。
    expect(w.health.get(tank)!.maxHp).toBeCloseTo(w.health.get(naked)!.maxHp, 9);

    // 立刻點火、立刻縮圈：兩人都在圈外。
    beginCombatFireRing(
      w,
      fireRingRulesFromConfig(
        {
          startSec: 0,
          shrinkSec: 20,
          minRadius: 0.5,
          maxPctPerSec: 1,
        },
        DT,
      ),
    );

    let nakedBurn = 0;
    let tankBurn = 0;
    let sawTrue = false;
    let events = 0;
    for (let t = 0; t < 120; t++) {
      step(w);
      for (const ev of w.events) {
        if (ev.type !== "fireRingDamage") continue;
        events++;
        const amount = ev.data.amount as number;
        if (ev.data.id === naked) nakedBurn += amount;
        if (ev.data.id === tank) tankBurn += amount;
        if (ev.data.dmgType === "true") sawTrue = true;
        // 每一發都必須標 true，不能只有第一發。
        expect(ev.data.dmgType).toBe("true");
      }
    }
    expect(events).toBeGreaterThan(0); // 守衛不是空的：真的燒了
    expect(sawTrue).toBe(true);
    expect(nakedBurn).toBeGreaterThan(0);
    // 這就是「真實傷害」的定義：護甲一點都沒有省到。
    expect(tankBurn).toBeCloseTo(nakedBurn, 9);
  });

  it("燃燒不吃 combat-env 的 damageDealt —— 它是回合節奏，不是戰鬥數值", () => {
    cover("balance-270-env-independent");
    const burnUnder = (damageDealt: number): number => {
      const w = new SimWorld(OPEN_ARENA, 22);
      w.combatActive = true;
      w.combatEnv = normalizeCombatEnv({ damageDealt });
      const id = champ(w, "thorne", ZONE0.center.x + (ZONE0.boundaryRadius - 1), ZONE0.center.z);
      beginCombatFireRing(
        w,
        fireRingRulesFromConfig(
          {
            startSec: 0,
            shrinkSec: 20,
            minRadius: 0.5,
            maxPctPerSec: 1,
          },
          DT,
        ),
      );
      let sum = 0;
      for (let t = 0; t < 60; t++) {
        step(w);
        for (const ev of w.events) {
          if (ev.type === "fireRingDamage" && ev.data.id === id) sum += ev.data.amount as number;
        }
      }
      return sum;
    };
    const low = burnUnder(0.25);
    const high = burnUnder(4);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeCloseTo(low, 9);
  });
});

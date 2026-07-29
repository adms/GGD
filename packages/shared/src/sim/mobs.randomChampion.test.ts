/**
 * 殭屍的「由誰擔任」可以是**隨機** (#289, owner 2026-07-29).
 *
 * 「殭屍 / 特殊殭屍 / 殭屍王 除了指定英雄,也要有隨機選項。特殊殭屍與殭屍王預設是
 *  隨機」 + follow-up ruling 「從策展白名單抽」.
 *
 * ── 這一支在守什麼 ─────────────────────────────────────────────────────────
 * 最重要的一條是 **⑤ 被測的不是出貨的** 的變形:一個「只換臉」的實作 ——
 * `mobChampionModelKey(drawn)` 有接上、`heroDerivedStats` 還是讀原本那位 ——
 * 會讓玩家看到皮卡丘、打起來卻是喪標麥可。repo 裡每一條殭屍王/特殊殭屍的血量
 * 斷言都是寫死對著「沿用的那位英雄」,所以那種實作**全綠**。這裡的
 * 「抽到的英雄真的決定數值」 直接把 `boss.maxHp` 對回**抽到那位**的卡面。
 *
 * 其次是 **① 畫面外 / ② 算了沒送到**:model key 讀的是
 * `mobModelKeyFor(rules, kind)` —— snapshot.ts 寫進 `EntityState.key` 的那一個
 * 函式,不是我們自己拼的字串。
 *
 * ── 為什麼沒有 `world.rng` ─────────────────────────────────────────────────
 * #215 刻意讓小怪一滴 rng 都不抽,免得擾動爆擊 / 迴避 / 傳說寶玉。所以抽籤在
 * HOST(`MatchController.mobChampionPicker`),sim 只收一個 callback。
 * 「host 真的沒有動到 world.rng」 由 game-server 那支
 * `match/mobRandomChampion.test.ts` 守 —— 那裡才有 world。這裡守的是
 * **結構**:`mobRulesFromConfig` 連 world 都拿不到,以及 callback 缺席時整份
 * rules 與 pre-#289 一模一樣。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import {
  DEFAULT_MOB_WAVES_CONFIG,
  zMobWavesConfig,
  type MobWavesConfig,
} from "../content/schema/config";
import { Champions } from "./content/registry";
import { registerSkeletonContent } from "./content/skeleton";
import { championStatBase } from "./stats/attributes";
import { Stat } from "./stats/statTypes";
import { COMBAT_ENV_DEFAULTS } from "./combatEnv";
import type { ChampionDef } from "./content/defs";
import type { ChampionId } from "../ids";
import {
  MOB_CHAMPION_ID,
  MOB_CHAMPION_SLOTS,
  mobChampionForRound,
  mobModelKeyFor,
  mobRulesFromConfig,
  pickMobChampion,
  type MobChampionPicker,
  type MobChampionSlot,
} from "./mobs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const DT = 1 / 30;

/**
 * A FIXED, SYNTHETIC pool. Deliberately not the live roster: this file pins the
 * exact draw sequence, and a pool that changes whenever an operator enables a
 * champion would make that pin meaningless (or, worse, red on a content edit).
 */
const POOL = ["zc0", "zc1", "zc2", "zc3", "zc4", "zc5", "zc6", "zc7"] as const;

/**
 * Two test champions with DELIBERATELY far-apart sheets, so 「數值跟著抽籤走」 is
 * a difference nobody can mistake for rounding. Registered under the ids the
 * pickers below hand back.
 */
const sheet = (id: string, maxHealth: number, ad: number, modelKey: string): ChampionDef =>
  ({
    id: id as ChampionId,
    name: id,
    role: "fighter",
    attackType: "melee",
    modelKey,
    baseStats: {
      [Stat.MaxHealth]: maxHealth,
      [Stat.HealthRegen]: 1,
      [Stat.MaxMana]: 100,
      [Stat.ManaRegen]: 1,
      [Stat.AttackDamage]: ad,
      [Stat.AbilityPower]: 0,
      [Stat.Armor]: 10,
      [Stat.MagicResist]: 10,
      [Stat.AttackSpeed]: 0.6,
      [Stat.MoveSpeed]: 5,
      [Stat.CritChance]: 0,
      [Stat.CritDamage]: 1.75,
      [Stat.CooldownReduction]: 0,
      [Stat.Lifesteal]: 0,
      [Stat.AttackRange]: 2,
    },
    growth: {
      [Stat.MaxHealth]: maxHealth,
      [Stat.HealthRegen]: 0,
      [Stat.MaxMana]: 0,
      [Stat.ManaRegen]: 0,
      [Stat.AttackDamage]: ad,
      [Stat.AbilityPower]: 0,
      [Stat.Armor]: 0,
      [Stat.MagicResist]: 0,
      [Stat.AttackSpeed]: 0,
      [Stat.MoveSpeed]: 0,
      [Stat.CritChance]: 0,
      [Stat.CritDamage]: 0,
      [Stat.CooldownReduction]: 0,
      [Stat.Lifesteal]: 0,
      [Stat.AttackRange]: 0,
    },
    abilities: {} as ChampionDef["abilities"],
    skillOrder: [],
    buildPriority: [],
    tags: [],
  }) as ChampionDef;

const TINY = sheet("zz-tiny", 100, 5, "champ.zz-tiny");
const HUGE = sheet("zz-huge", 9000, 500, "champ.zz-huge");

/** The SHIPPED doc off disk — 「出貨的到底是不是隨機」 is read, never assumed. */
const SHIPPED_DOC = JSON.parse(
  readFileSync(join(CONTENT_DIR, "config", "arena-rules.json"), "utf8"),
) as { mobWaves: MobWavesConfig };

beforeAll(() => {
  registerSkeletonContent();
  Champions.register(TINY.id, TINY);
  Champions.register(HUGE.id, HUGE);
  // The mob's own champion has to resolve too, or the INHERIT branch degrades
  // to MOB_MODEL_KEY and the 「隨機 vs 沿用」 comparisons lose their contrast.
  Champions.register(MOB_CHAMPION_ID as ChampionId, sheet(MOB_CHAMPION_ID, 380, 20, "champ.mob-x"));
});

/** A picker that always hands back the same champion, for every slot. */
const always =
  (id: string): MobChampionPicker =>
  () =>
    id;

/** The SHIPPED mobWaves with `boss`/`special` guaranteed present. */
const shipped = (): MobWavesConfig => structuredClone(SHIPPED_DOC.mobWaves);

// ---------------------------------------------------------------------------
// 1. 抽籤本身:同 seed 同回合可重播,不同回合會變,slot 分得開
// ---------------------------------------------------------------------------

describe("pickMobChampion —— 純函式抽籤 (可重播,不吃 rng)", () => {
  it("同 seed、同回合、同 slot ⇒ 永遠同一位(重播對得起來)", () => {
    cover("mob-289-random-champion");
    for (const slot of MOB_CHAMPION_SLOTS) {
      for (const round of [1, 3, 7, 10]) {
        const a = pickMobChampion(POOL, 0x1234_5678, round, slot);
        const b = pickMobChampion(POOL, 0x1234_5678, round, slot);
        expect(a, `${slot}@${round} 不穩定`).toBe(b);
        expect(a).not.toBeNull();
      }
    }
  });

  it("PIN:一組已知 (seed, 回合) 的答案 —— 改了就是改掉所有既有錄影的重播", () => {
    cover("mob-289-random-champion");
    // ⚠️ 這串字面值不是「隨便抓一次跑出來的結果」的意思 —— 它就是合約。抽籤是
    // `(matchSeed, round, slot)` 的純函式,錄影只記 seed;雜湊一改,同一場錄影就
    // 會播出**不同的殭屍王**。要改雜湊,請連同這一條一起、而且是知情地改。
    const seq = [3, 4, 5, 6, 7].map((r) => pickMobChampion(POOL, 0x1234_5678, r, "boss"));
    expect(seq).toEqual(["zc1", "zc0", "zc7", "zc6", "zc4"]);
  });

  it("不同回合會換人 —— 不是一個回合無關的常數", () => {
    cover("mob-289-random-champion");
    const byRound = Array.from({ length: 12 }, (_, i) =>
      pickMobChampion(POOL, 99, i + 1, "special"),
    );
    // 「至少換過三個人」比「不全等」強:一個只在第 1 回合換一次的實作過不了。
    expect(new Set(byRound).size).toBeGreaterThanOrEqual(3);
    // 而且真的有相鄰回合不一樣(擋「每 12 回合才換一次」這種退化)。
    expect(byRound.some((c, i) => i > 0 && c !== byRound[i - 1])).toBe(true);
  });

  it("不同 seed 會換人 —— 抽籤真的吃了整個 32-bit seed,不是只吃低 16 bits", () => {
    cover("mob-289-random-champion");
    // ⚠️ 這一條是衝著 `mixInt` 來的:它把每個參數 `& 0xffff`,所以 0x0001_0007 和
    // 0x0002_0007 會抽到同一位。這兩個 seed 的低 16 bits 完全相同。
    const lo = Array.from({ length: 8 }, (_, r) => pickMobChampion(POOL, 0x0001_0007, r + 1, "boss"));
    const hi = Array.from({ length: 8 }, (_, r) => pickMobChampion(POOL, 0x0002_0007, r + 1, "boss"));
    expect(lo).not.toEqual(hi);
  });

  it("三個 slot 各抽各的 —— 王和特殊殭屍不會永遠是同一位", () => {
    cover("mob-289-random-champion");
    const differs = Array.from({ length: 12 }, (_, i) => i + 1).some(
      (r) => pickMobChampion(POOL, 7, r, "boss") !== pickMobChampion(POOL, 7, r, "special"),
    );
    expect(differs, "每一回合王與特殊殭屍都同一位 ⇒ slot 沒有進雜湊").toBe(true);
  });

  it("跟池子的「順序」無關,只跟池子的「內容」有關", () => {
    cover("mob-289-random-champion");
    // 池子來自 `Champions.ids()`,也就是一個 Map 的插入順序 = 內容載入順序。兩台
    // 主機掃檔順序不同就抽到不同人,是最難重現的那種 bug。
    const shuffled = [...POOL].reverse();
    for (const round of [1, 2, 3, 4, 5]) {
      expect(pickMobChampion(shuffled, 42, round, "mob")).toBe(
        pickMobChampion(POOL, 42, round, "mob"),
      );
    }
  });

  it("空池 ⇒ null(交給呼叫端退回「沿用」),單一池 ⇒ 那一位", () => {
    cover("mob-289-random-champion");
    expect(pickMobChampion([], 1, 1, "boss")).toBeNull();
    expect(pickMobChampion(["only"], 1, 5, "boss")).toBe("only");
  });
});

// ---------------------------------------------------------------------------
// 2. ⭐ 抽到的英雄真的決定數值,不是只換一張臉
// ---------------------------------------------------------------------------

describe("⭐ 抽到誰,數值就是誰的 (擋「只換臉」)", () => {
  /** 該英雄在 `level` 的卡面血量 × heroHpMult + hpFlatBonus —— 王的那條式子。 */
  const expectedBossHp = (def: ChampionDef, cfg: MobWavesConfig): number =>
    Math.max(
      1,
      Math.round(
        championStatBase(def, Stat.MaxHealth, cfg.boss!.heroLevel!, COMBAT_ENV_DEFAULTS) *
          cfg.boss!.heroHpMult!,
      ) + (cfg.boss!.hpFlatBonus ?? 0),
    );

  it("殭屍王:抽到 TINY 和抽到 HUGE 是兩份完全不同的血量,而且都對得回那位的卡面", () => {
    cover("mob-289-random-champion");
    const cfg = shipped();
    expect(cfg.boss?.championSource, "出貨的王不是隨機 ⇒ 這條在測一個沒出貨的東西").toBe("random");

    const tiny = mobRulesFromConfig(cfg, DT, 3, undefined, always(TINY.id));
    const huge = mobRulesFromConfig(cfg, DT, 3, undefined, always(HUGE.id));

    // ① 真的不一樣(擋「兩邊都退回沿用」的假通過)
    expect(tiny.boss!.maxHp).not.toBe(huge.boss!.maxHp);
    // ② 而且各自等於**抽到那位**的卡面推導 —— 這一條才是「不是只換臉」
    expect(tiny.boss!.maxHp).toBe(expectedBossHp(TINY, cfg));
    expect(huge.boss!.maxHp).toBe(expectedBossHp(HUGE, cfg));
    // ③ 攻擊力同一條路
    expect(huge.boss!.attackDamage).toBeGreaterThan(tiny.boss!.attackDamage);
  });

  it("殭屍王:臉/模型也跟著抽 —— 讀的是 snapshot.ts 用的那個 mobModelKeyFor", () => {
    cover("mob-289-random-champion");
    const cfg = shipped();
    const huge = mobRulesFromConfig(cfg, DT, 3, undefined, always(HUGE.id));
    // `mobModelKeyFor(rules, kind)` 就是 net/snapshot.ts 寫進 EntityState.key
    // 的那一行,所以這條同時是「送得到玩家」的守衛(失敗形態 ①/②)。
    expect(mobModelKeyFor(huge, "boss")).toBe(HUGE.modelKey);
    // 而且不是沿用一般殭屍的模型(那是沒抽到時的答案)。
    expect(mobModelKeyFor(huge, "boss")).not.toBe(mobModelKeyFor(huge, "normal"));
  });

  it("特殊殭屍:血量、攻擊力、模型三件事一起跟著抽", () => {
    cover("mob-289-random-champion");
    const cfg = shipped();
    expect(cfg.special?.championSource, "出貨的特殊殭屍不是隨機").toBe("random");

    const tiny = mobRulesFromConfig(cfg, DT, 3, undefined, always(TINY.id));
    const huge = mobRulesFromConfig(cfg, DT, 3, undefined, always(HUGE.id));
    expect(tiny.special!.maxHp).not.toBe(huge.special!.maxHp);
    expect(tiny.special!.attackDamage).not.toBe(huge.special!.attackDamage);
    expect(huge.special!.maxHp).toBe(
      Math.max(
        1,
        Math.round(
          championStatBase(HUGE, Stat.MaxHealth, tiny.level, COMBAT_ENV_DEFAULTS) *
            cfg.special!.heroHpMult!,
        ) + (cfg.special!.hpFlatBonus ?? 0),
      ),
    );
    expect(mobModelKeyFor(huge, "special")).toBe(HUGE.modelKey);
  });

  it("端到端:用真的抽籤函式當 callback,逐回合的王真的是不同的仗", () => {
    cover("mob-289-random-champion");
    const cfg = shipped();
    // 池子只有兩位,但兩位差 90 倍血,所以「有沒有換人」在血量上一眼可見。
    const pool = [TINY.id, HUGE.id];
    const pick: MobChampionPicker = (slot: MobChampionSlot, round: number) =>
      pickMobChampion(pool, 0xabcd, round, slot) ?? undefined;
    const hp = [3, 4, 5, 6, 7, 8, 9].map(
      (r) => mobRulesFromConfig(cfg, DT, r, undefined, pick).boss!.maxHp,
    );
    expect(new Set(hp).size, "每一回合的王血量都一樣 ⇒ 抽籤沒有進到數值").toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3. callback 缺席 ⇒ 退回今天的行為(不 throw、不變空字串)
// ---------------------------------------------------------------------------

describe("沒有 callback 的呼叫端(客戶端影子世界 / 錄影重播 / 單元測試)", () => {
  it("整份 rules 與「把 championSource 拿掉」完全相同 —— 逐欄比,不是抽兩個欄位看看", () => {
    cover("mob-289-random-champion");
    const withSrc = mobRulesFromConfig(shipped(), DT, 5);
    const stripped = shipped();
    delete stripped.mob.championSource;
    delete stripped.boss!.championSource;
    delete stripped.special!.championSource;
    // toEqual 走整棵樹:模型、血量、攻擊、體型、分紅獎池,一個欄位漏掉都會紅。
    expect(withSrc).toEqual(mobRulesFromConfig(stripped, DT, 5));
  });

  it("王沿用「該回合一般殭屍」那位,而且不是空字串、不是預設模型", () => {
    cover("mob-289-random-champion");
    const rules = mobRulesFromConfig(shipped(), DT, 5);
    expect(mobModelKeyFor(rules, "boss")).toBe(mobModelKeyFor(rules, "normal"));
    expect(mobModelKeyFor(rules, "boss")).not.toBe("");
  });

  it("callback 回 undefined / 空字串 也一樣退回沿用,不會生出一隻沒有臉的王", () => {
    cover("mob-289-random-champion");
    const base = mobRulesFromConfig(shipped(), DT, 5);
    for (const bad of [undefined, ""]) {
      const rules = mobRulesFromConfig(shipped(), DT, 5, undefined, () => bad);
      expect(rules.boss!.maxHp, `callback 回 ${JSON.stringify(bad)} 時炸掉了`).toBe(base.boss!.maxHp);
      expect(mobModelKeyFor(rules, "boss")).toBe(mobModelKeyFor(base, "boss"));
    }
  });

  it("`championSource` 沒填(每一份 pre-#289 的文件)⇒ 一樣不抽", () => {
    cover("mob-289-random-champion");
    const legacy = structuredClone(DEFAULT_MOB_WAVES_CONFIG);
    delete legacy.mob.championSource;
    delete legacy.boss!.championSource;
    delete legacy.special!.championSource;
    let called = 0;
    const rules = mobRulesFromConfig(legacy, DT, 5, undefined, () => {
      called++;
      return HUGE.id;
    });
    expect(called, "沒填 championSource 卻去抽籤了").toBe(0);
    expect(mobModelKeyFor(rules, "boss")).toBe(mobModelKeyFor(rules, "normal"));
  });
});

// ---------------------------------------------------------------------------
// 4. 一般殭屍那一格 + 逐回合表的優先權
// ---------------------------------------------------------------------------

describe("一般殭屍的那一格,以及逐回合表誰贏", () => {
  it("mob.championSource = random ⇒ 一般殭屍的臉與模型也跟著抽", () => {
    cover("mob-289-random-champion");
    const cfg = shipped();
    cfg.mob.championSource = "random";
    delete cfg.mob.modelKey;
    const rules = mobRulesFromConfig(cfg, DT, 4, undefined, always(HUGE.id));
    expect(mobChampionForRound(cfg, 4, always(HUGE.id))).toBe(HUGE.id);
    expect(mobModelKeyFor(rules, "normal")).toBe(HUGE.modelKey);
  });

  it("逐回合表指名的那一場,指名的人贏過「隨機」;沒指名的那一場才抽", () => {
    cover("mob-289-random-champion");
    const cfg = shipped();
    cfg.mob.championSource = "random";
    delete cfg.mob.modelKey;
    cfg.schedule = [{ round: 5, mobsPerWaveCap: 3, maxAlivePerZone: 7, championId: TINY.id }];
    // 第 5 回合:表上寫 TINY ⇒ 抽籤結果(HUGE)被蓋掉。
    expect(mobChampionForRound(cfg, 5, always(HUGE.id))).toBe(TINY.id);
    // 第 6 回合:表上沒有那一列 ⇒ 才輪到抽籤。
    expect(mobChampionForRound(cfg, 6, always(HUGE.id))).toBe(HUGE.id);
  });

  it("一般殭屍那一格:callback 回 undefined / 空字串 ⇒ 退回填好的那位,不是空 id", () => {
    cover("mob-289-random-champion");
    // 空字串特別要擋:它會一路走到 `mobChampionModelKey("")` → 查無此人 →
    // 靜靜退成 MOB_MODEL_KEY,也就是「後台寫著隨機、場上是預設殭屍」的失敗形態②。
    const cfg = shipped();
    cfg.mob.championSource = "random";
    cfg.mob.championId = TINY.id;
    delete cfg.mob.modelKey;
    for (const bad of [undefined, ""]) {
      expect(mobChampionForRound(cfg, 4, () => bad)).toBe(TINY.id);
      const rules = mobRulesFromConfig(cfg, DT, 4, undefined, () => bad);
      expect(mobModelKeyFor(rules, "normal")).toBe(TINY.modelKey);
    }
  });

  it("championSource = fixed / inherit ⇒ 完全不抽,用填好的那位", () => {
    cover("mob-289-random-champion");
    for (const src of ["fixed", "inherit"] as const) {
      const cfg = shipped();
      cfg.mob.championSource = src;
      cfg.mob.championId = TINY.id;
      let called = 0;
      const seen = mobChampionForRound(cfg, 4, () => {
        called++;
        return HUGE.id;
      });
      expect(seen, `${src} 卻抽了籤`).toBe(TINY.id);
      expect(called).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. schema / 出貨值 —— 「這一版只做每回合一次」與「預設就是隨機」
// ---------------------------------------------------------------------------

describe("schema 與出貨值", () => {
  it("只收 inherit / fixed / random —— `wave`、`mob`、字串哨兵一律退件", () => {
    cover("mob-289-random-champion");
    // 這一版刻意不提供 per-wave / per-mob:數值是 arm time 從**一位**英雄推導、
    // 每個 kind 共用一份,逐隻換臉會做出「臉是皮卡丘、數值是殭屍」。
    for (const bad of ["wave", "mob", "__random__", "RANDOM", ""]) {
      const cfg = shipped();
      (cfg.boss as unknown as Record<string, unknown>).championSource = bad;
      expect(zMobWavesConfig.safeParse(cfg).success, `${JSON.stringify(bad)} 被放行了`).toBe(false);
    }
    for (const ok of ["inherit", "fixed", "random"]) {
      const cfg = shipped();
      cfg.boss!.championSource = ok as "random";
      expect(zMobWavesConfig.safeParse(cfg).success, `${ok} 被擋掉了`).toBe(true);
    }
  });

  it("整份出貨文件 parse 得過,而且王與特殊殭屍的預設就是「隨機」", () => {
    cover("mob-289-random-champion");
    const parsed = zMobWavesConfig.safeParse(SHIPPED_DOC.mobWaves);
    expect(parsed.success, JSON.stringify(parsed.success ? "" : parsed.error.issues)).toBe(true);
    // owner 2026-07-29 「特殊殭屍與殭屍王預設是隨機」,一般殭屍維持喪標麥可。
    expect(SHIPPED_DOC.mobWaves.boss?.championSource).toBe("random");
    expect(SHIPPED_DOC.mobWaves.special?.championSource).toBe("random");
    expect(SHIPPED_DOC.mobWaves.mob.championSource).toBe("fixed");
    // 出貨的 schema 預設(引擎 fallback)必須跟磁碟上那份一致,否則後台顯示的
    // 「出貨版」跟伺服器真的載入的是兩回事。
    expect(DEFAULT_MOB_WAVES_CONFIG.boss?.championSource).toBe("random");
    expect(DEFAULT_MOB_WAVES_CONFIG.special?.championSource).toBe("random");
    expect(DEFAULT_MOB_WAVES_CONFIG.mob.championSource).toBe("fixed");
  });

  it("隨機的區塊沒有順手留一個 championId 在旁邊(畫面上會自相矛盾)", () => {
    cover("mob-289-random-champion");
    expect(SHIPPED_DOC.mobWaves.boss?.championId).toBeUndefined();
    expect(SHIPPED_DOC.mobWaves.special?.championId).toBeUndefined();
  });
});

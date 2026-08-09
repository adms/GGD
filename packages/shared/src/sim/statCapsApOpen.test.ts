/**
 * 法術強度上限 —— **旋鈕做出來了,而且出貨轉到底**(owner 2026-08-01)。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這一份守的是什麼
 *
 * owner 對「惡夢魔王碎片 + 死之王套裝 = AP ×3.0」的裁決有兩句話,合起來才是規格:
 *   「加一個 ap 上限就是同一個檔多一列 + 後台一個欄位,存檔生效」
 *   「AP ×3.0 … => 運氣那麼好剛好抽到就算了」
 * 也就是:**要有這個欄位,但今天一個人都不准夾到。**
 *
 * 一個「加了上限卻悄悄開始夾」的實作,長得跟正確的實作一模一樣 —— 卡片照寫
 * 「總 AP 額外 + 100%」,面板照顯示,玩家只會覺得這件傳說「感覺沒什麼用」。
 * 那正是 owner 明說不要的東西,所以這裡的第一條是**回歸測試**:同一個組合,
 * 有 ap 那一列和沒有 ap 那一列,算出來的數字必須**逐位元相同**。
 *
 * ⚠️ 只有「不會夾」是不夠的 —— 那條斷言在「ap 那一列根本沒接上」的實作下也會綠
 * (CLAUDE.md 失敗形態 ③:可以整段刪掉但測試全綠)。所以每一條「不會夾」都配一條
 * 「把它調小就真的會夾」,兩條一起才證明這個欄位是活的。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼是**單層**(base === unlocked),不是抄攻速那一對
 *
 * 兩層(`base < unlocked`)唯一的用途是餵 `ModOp.CapRaise`。全出貨內容只有兩件
 * 道具帶 `CapRaise`(夢幻嗜血劍 godie-i00l、endless-edge),而且**兩件都只碰
 * 攻速** —— 這件事在下面 `每一個 CapRaise 來源都只碰攻速` 那一條裡真的走過整棵
 * 道具樹,不是憑印象寫的。一個 `base` 就已經開到頂的屬性再給它更高的 `unlocked`
 * 是純粹的死設定。而它仍然是**可調的**:後台把 `unlocked` 拉高,解鎖語意當場成立
 * (下面有一條真的這樣做並驗證)。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { Items } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { grantItemFree } from "./economy/shop";
import { recomputeStats } from "./stats/statPipeline";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import {
  AP_CAP_OPEN,
  CAPPABLE_STATS,
  DEFAULT_STAT_CAPS,
  STAT_CAP_MAX,
  capFor,
  effectiveCap,
  normalizeStatCaps,
  statCapBounds,
  statCapsFromDoc,
  type StatCapTable,
} from "./statCaps";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../ids";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;

/** 惡夢魔王碎片 —— 自己就帶「總 AP 額外 + 100%」。 */
const NIGHTMARE = "godie-i067" as ItemId;
/** 死之王套裝的三件:長槍 / 意志 / 神盾,湊齊再 +100%。 */
const LICHKING = ["godie-i01d", "godie-i060", "godie-i061"] as ItemId[];
/** 黑魔導士 - 莉娜因巴斯:全名單基礎 AP 最高的一位(量出來的,127)。 */
const MAGE = "godie-h020" as ChampionId;

function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<
          string,
          unknown
        >,
    );
}

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "items"] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

let seat = 0;
/** 一個真的英雄,真的用三選一那條路(`grantItemFree`)拿到那幾件傳說。 */
function build(world: SimWorld, items: readonly ItemId[], level = 1, attr = 0): EntityId {
  const s = seat++;
  const id = spawnChampion(world, {
    championId: MAGE,
    seatId: asSeatId(s),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x + 2 + (s % 8), z: Z0.center.z + Math.floor(s / 8) },
    zone: 0,
  });
  const champ = world.champion.get(id)!;
  champ.level = level;
  if (attr !== 0) champ.attrBonus = { str: attr, agi: attr, int: attr };
  for (const itemId of items) {
    expect(grantItemFree(world, id, itemId), `${itemId} 沒發下去`).toBeGreaterThanOrEqual(0);
  }
  recomputeStats(world, id);
  return id;
}

const apOf = (world: SimWorld, id: EntityId): number =>
  world.stats.get(id)!.final[Stat.AbilityPower];

/** 這一版之前的 cap 表:一模一樣,但**沒有** ap 那一列。 */
function capsWithoutAp(): StatCapTable {
  const out: Record<string, unknown> = {};
  for (const [stat, cap] of Object.entries(DEFAULT_STAT_CAPS)) {
    if (stat === Stat.AbilityPower) continue;
    out[stat] = cap;
  }
  return Object.freeze(out as StatCapTable);
}

// ---------------------------------------------------------------------------
// ① 出貨預設不准夾到任何人
// ---------------------------------------------------------------------------

describe("ap 上限出貨開到頂 —— 加了欄位,行為必須逐位元不變", () => {
  it("惡夢魔王碎片 + 死之王三件:加了 ap 這一列之後,AP 跟以前逐位元相同", () => {
    cover("statcaps-ap-open");
    // 兩個世界只差一件事:cap 表裡有沒有 ap 那一列。其他全部相同。
    const after = new SimWorld(SKELETON_ARENA, 8101);
    const before = new SimWorld(SKELETON_ARENA, 8101);
    before.statCaps = capsWithoutAp();
    expect(capFor(before.statCaps, Stat.AbilityPower).base).toBe(Number.POSITIVE_INFINITY);
    expect(capFor(after.statCaps, Stat.AbilityPower).base).toBe(AP_CAP_OPEN);

    const bare = apOf(after, build(after, []));
    // 測試如果建在一個 AP 是 0 的英雄身上,下面每一條都是空話。
    expect(bare).toBeGreaterThan(1);

    const loaded = [...LICHKING, NIGHTMARE];
    const withCap = apOf(after, build(after, loaded));
    const withoutCap = apOf(before, build(before, loaded));

    // owner 讀到的那個數字。⚠️ 2026-08-10 之前這裡寫死 `bare * 3.0`,而 owner
    // 當天把套裝從 +100% 調成 +300%、又給了死之王的意志 AP+174 —— 於是這一條
    // 用「ap 上限把數字夾掉了」的訊息紅,真相是兩個數字被調過（第四個住處）。
    // 現在**只斷言這個組合真的把 AP 放大了**,倍率是多少交給 lichkingSet.test.ts。
    expect(withCap).toBeGreaterThan(bare);
    // ⬇⬇ 而且**這一版沒有改變它**。這是這整份檔案存在的理由,也是唯一
    //     會因為「加了 ap 這一列」而紅的斷言。
    expect(withCap, "加了 ap 上限之後這個組合的 AP 變了 —— owner 明說不要夾").toBe(withoutCap);
  });

  it("出貨天花板離量到最強的 AP 組合還有 10 倍以上餘裕", () => {
    cover("statcaps-ap-open");
    // 「最強」不是猜的:走整棵道具樹挑出 ap 貢獻最高的六件,配等級 99 與三圍 +40。
    const world = new SimWorld(SKELETON_ARENA, 8102);
    const scored = Items.all()
      .map((d) => {
        let flat = 0;
        let pct = 0;
        for (const m of d.modifiers ?? []) {
          if (m.stat !== Stat.AbilityPower) continue;
          if (m.op === ModOp.Flat) flat += m.value;
          else if (m.op === ModOp.PercentAdd || m.op === ModOp.PercentMult) pct += m.value;
        }
        return { id: d.id as ItemId, flat, pct };
      })
      .filter((x) => x.flat > 0 || x.pct > 0)
      .sort((a, b) => b.pct - a.pct || b.flat - a.flat || (a.id < b.id ? -1 : 1));
    // 六格 —— 裝備欄就是六格,所以這是內容真的組得出來的上限。
    expect(scored.length).toBeGreaterThanOrEqual(6);
    const strongest = apOf(world, build(world, scored.slice(0, 6).map((x) => x.id), 99, 40));

    // 這一條是**早期預警**:內容膨脹到吃掉餘裕時,它會在玩家被夾到之前先紅。
    expect(
      AP_CAP_OPEN / strongest,
      `出貨 ap 天花板 ${AP_CAP_OPEN} 只剩 ${(AP_CAP_OPEN / strongest).toFixed(1)} 倍餘裕` +
        `(量到最強組合 ${strongest.toFixed(1)})—— 再長下去玩家就會被一個 owner 說「不要夾」` +
        `的天花板夾到。要嘛抬高 AP_CAP_OPEN,要嘛這就是 owner 想開始夾了(那是一個決定)。`,
    ).toBeGreaterThanOrEqual(10);
    // 而且它現在確實沒有夾到:最強組合仍然低於天花板。
    expect(strongest).toBeLessThan(AP_CAP_OPEN);
  });
});

// ---------------------------------------------------------------------------
// ② 這個欄位是活的 —— 調小就真的會夾
// ---------------------------------------------------------------------------

describe("ap 上限真的接得到 —— 不是一格死設定", () => {
  it("後台把 ap 一般上限調到 50 → 同一個 ×3.0 組合被夾在 50", () => {
    cover("statcaps-ap-open");
    // 這一條的存在理由:上面「不會夾」的斷言,在「ap 這一列根本沒有被
    // `finalizeStat` 讀到」的實作下也會全綠。這一條會紅。
    const world = new SimWorld(SKELETON_ARENA, 8103);
    world.statCaps = statCapsFromDoc({
      id: "stat-caps",
      schema: "config.stat-caps@1",
      caps: { as: { base: 4, unlocked: 10 }, ap: { base: 50, unlocked: 50 } },
    });
    const id = build(world, [...LICHKING, NIGHTMARE]);
    expect(apOf(world, id)).toBe(50);
  });

  it("單層:出貨的 ap 是 base === unlocked,所以 CapRaise 對它是 no-op", () => {
    cover("statcaps-ap-single-tier");
    const shipped = capFor(DEFAULT_STAT_CAPS, Stat.AbilityPower);
    expect(shipped.base).toBe(AP_CAP_OPEN);
    expect(shipped.unlocked).toBe(shipped.base);
    // 一個寫 999999 的解鎖來源,在單層下抬不動任何東西。
    expect(effectiveCap(DEFAULT_STAT_CAPS, Stat.AbilityPower, 999999)).toBe(AP_CAP_OPEN);
  });

  it("要兩層也做得到 —— 後台把 unlocked 拉高,解鎖語意當場成立", () => {
    cover("statcaps-ap-single-tier");
    // 第一守則:owner 的裁決是**預設值**,另一側必須仍然表達得出來。
    const table = statCapsFromDoc({
      id: "stat-caps",
      schema: "config.stat-caps@1",
      caps: { ap: { base: 50, unlocked: 300 } },
    });
    expect(effectiveCap(table, Stat.AbilityPower, 0)).toBe(50); // 沒有解鎖來源
    expect(effectiveCap(table, Stat.AbilityPower, 200)).toBe(200); // 解到 200
    expect(effectiveCap(table, Stat.AbilityPower, 999999)).toBe(300); // 硬上限擋住
  });

  it("每一個 CapRaise 來源都只碰攻速 —— 這是「ap 不需要兩層」的證據", () => {
    cover("statcaps-ap-single-tier");
    // 走整棵出貨道具樹,不是憑印象。哪天有人替 ap 寫了一件 CapRaise 道具,
    // 這條會紅,而那正是「該把 ap 的 unlocked 拉高了」的時刻。
    const raises: string[] = [];
    for (const d of Items.all()) {
      for (const m of d.modifiers ?? []) {
        if (m.op === ModOp.CapRaise) raises.push(`${d.id as string}:${m.stat}`);
      }
    }
    expect(raises.length, "一件 CapRaise 道具都沒有 —— 這條規則變成空話了").toBeGreaterThan(0);
    expect(
      raises.filter((r) => !r.endsWith(`:${Stat.AttackSpeed}`)),
      "有 CapRaise 落在攻速以外的屬性了 —— 那條屬性的 cap 表需要真的兩層",
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ③ 三個地方是同一組數字 + 兩端都有界
// ---------------------------------------------------------------------------

describe("ap 這一列的三處落點與界", () => {
  it("出貨內容檔 / DEFAULT_STAT_CAPS / 後台可編輯清單 三邊一致", () => {
    cover("statcaps-ap-open");
    const doc = JSON.parse(
      readFileSync(join(CONTENT_DIR, "config/stat-caps.json"), "utf-8"),
    ) as Record<string, unknown>;
    // 1) 出貨值
    expect(capFor(statCapsFromDoc(doc), Stat.AbilityPower)).toEqual(
      // 2) 程式預設
      capFor(DEFAULT_STAT_CAPS, Stat.AbilityPower),
    );
    // 3) 後台那一頁畫得出這一列(`CAPPABLE_STATS` 是它的資料來源)
    expect(CAPPABLE_STATS).toContain(Stat.AbilityPower);
  });

  it("兩端都有界,而且出貨值合法", () => {
    cover("statcaps-ap-bounds");
    const [lo, hi] = statCapBounds(Stat.AbilityPower);
    expect(Number.isFinite(lo)).toBe(true);
    expect(Number.isFinite(hi)).toBe(true);
    expect(lo).toBeLessThan(hi);
    expect(AP_CAP_OPEN).toBeGreaterThanOrEqual(lo);
    expect(AP_CAP_OPEN).toBeLessThanOrEqual(hi);
    // 上界擋的就是「多打一個零」:1,000,000 進不來。
    const fat = normalizeStatCaps({ ap: { base: AP_CAP_OPEN * 10, unlocked: AP_CAP_OPEN * 10 } });
    expect(capFor(fat, Stat.AbilityPower)).toEqual({ base: hi, unlocked: hi });
    // 下界擋的是負的天花板(它不會變成「更嚴格」,而是整格失效)。
    const neg = normalizeStatCaps({ ap: { base: -5, unlocked: -5 } });
    expect(capFor(neg, Stat.AbilityPower)).toEqual({ base: lo, unlocked: lo });
  });

  it("Zod 這一層也擋 —— 出貨文件過得了,多打一個零過不了", async () => {
    cover("statcaps-ap-bounds");
    // 三層守衛的**中間**一層。上面兩條測的是後台頁(最外)與 `normalizeStatCaps`
    // (最內);沒有這一條的話,一份手改的 overlay 文件在 schema 這一關是全暢通的
    // ——「兩端都有界」就只成立在兩個地方而不是三個。
    const { zConfigStatCapsDoc } = await import("../content/schema/config");
    const shipped = JSON.parse(readFileSync(join(CONTENT_DIR, "config/stat-caps.json"), "utf-8"));
    expect(zConfigStatCapsDoc.safeParse(shipped).success, "出貨文件自己過不了 schema").toBe(true);

    const fat = {
      ...shipped,
      caps: { ...shipped.caps, ap: { base: AP_CAP_OPEN * 10, unlocked: AP_CAP_OPEN * 10 } },
    };
    expect(zConfigStatCapsDoc.safeParse(fat).success, "多打一個零 schema 沒擋").toBe(false);
    const low = { ...shipped, caps: { ...shipped.caps, as: { base: -1, unlocked: -1 } } };
    expect(zConfigStatCapsDoc.safeParse(low).success, "負的天花板 schema 沒擋").toBe(false);
  });

  it("STAT_CAP_MAX 是 EXHAUSTIVE 的 —— 每條屬性都填得進去,沒有 0 也沒有 ∞", () => {
    cover("statcaps-ap-bounds");
    for (const stat of CAPPABLE_STATS) {
      const [lo, hi] = statCapBounds(stat);
      expect(Number.isFinite(hi), `${stat} 的上界不是有限數 = 又變回沒有上界`).toBe(true);
      expect(hi, `${stat} 的上界是 0 = 這一列永遠填不進去`).toBeGreaterThan(0);
      expect(hi, `${stat} 的上界比下界還低`).toBeGreaterThan(lo);
      // 出貨值必須落在自己的界裡,否則後台一打開就是紅的。
      const shipped = DEFAULT_STAT_CAPS[stat];
      if (!shipped) continue;
      expect(shipped.base, `${stat} 出貨 base 超界`).toBeGreaterThanOrEqual(lo);
      expect(shipped.unlocked, `${stat} 出貨 unlocked 超界`).toBeLessThanOrEqual(hi);
    }
    // 這張表管得到的每一條都在 STAT_CAP_MAX 裡(型別已經保證,這裡是行為證據)。
    expect(Object.keys(STAT_CAP_MAX).length).toBeGreaterThanOrEqual(CAPPABLE_STATS.length);
  });
});

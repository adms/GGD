/**
 * 09 悟空 · 超級賽亞人 —— 變身態的四個機制，逐一釘死 (task #214).
 *
 * ---------------------------------------------------------------------------
 * 為什麼要有這一份
 * ---------------------------------------------------------------------------
 * `war3map.w3u` 裡 `O00X` 相對 `Ogrh` 只多寫了五個欄位，而**其中四個在這一份出現
 * 之前完全沒有落地**：
 *
 *     ua1c  1.90 → 1.20   攻擊間隔（＝攻速 ×1.58）
 *     umvs   310 → 400    移動速度
 *     umvt  (地面) → hover ⎫ 變身態是**浮空的**，而 #168 把浮空當 bug 修掉
 *     umvh  (未寫) → 30.0 ⎭
 *     uabi  A0O1,A0NL,AInv,A0MI → A0S7,A0O1,A0NL,AInv,A017,A0MJ
 *
 * 最後那一行是任何「數值稽核」都看不到的：`A0S7` 是一本 **法術書**（`Aspb`，
 * `spb1 = A0SI`）—— WC3 用來「給被動但不給按鈕」的手法 —— 整個 09-002a 悟空指令
 * 靈氣（`ACac` 指令光環，`Cac1 = 0.25`，攻擊力 +25%）都掛在那裡面。
 *
 * ⚠️ 交辦說明把 `A0SI` 的 base `ACac` 讀成 Cloak of Flames（傷害型光環）。
 * 出貨的 Blizzard 表說的是別的：`out/stock/STOCK_ABILITIES.json` 的 `ACac` 是
 * `comments: "Aura - Command (Creep)"`、`code: AOac`、`DataA1: 0.1` —— **指令光環，
 * 攻擊力百分比**，地圖把它改成 0.25。09-002 的 ubertip 本人也這樣寫：「在超級賽亞人
 * 三的狀態下，可獲得額外25%攻擊力加成」。所以這裡釘的是 +25% 攻擊力，不是光環傷害。
 * （CLAUDE.md 第三守則：註解會說謊，去驗證。）
 *
 * ---------------------------------------------------------------------------
 * 這一份的斷言方向
 * ---------------------------------------------------------------------------
 * G1/G2 讀**出貨的 JSON**（不是自己捏的 fixture）對上**匯入器的 fixture**，所以
 * 「表跟地圖漂了」會紅。
 * G3 不提任何 effect 名字，直接**按按鈕**：`castAbility(world, id, "E")` → 施法
 * 計時 → `CastResolveSystem` → `runEffects`，然後問身體變成什麼、攻擊力變多少。
 * 把 `championForm` 或 `applyBuff` 任一條從 `godie-ogrh.e` 刪掉，這裡就紅。
 * G4 是「結束要清乾淨」：時間到之後身體回本體 **而且** +25% 消失，兩件事一起檢查
 * —— 只檢查身體會漏掉「光環留在身上」這個具體漏法。
 * G5 讀 `hitImpact` 事件的**最終 ImpactProfile**，不是讀 champion doc 的
 * `hitFeel` 欄位（失敗形態 ⑦：掃屬性代替掃行為）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { shippedDocs } from "./__fixtures__/shippedContent";
import type { CollectionName } from "./schema/index";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentStore } from "./store";
import { registerAll } from "./registries";
import { ALTERNATE_FORM_BODIES, formAbilityGain, CHAMPION_FORM_PAIRS } from "./championForms";
import { zChampionDoc } from "./schema/champion";
import { Champions } from "../sim/content/registry";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { castAbility, rankUpAbility } from "../sim/abilities/abilitySystem";
import { championFormIndex } from "../sim/systems/ChampionFormSystem";
import { championStatBase } from "../sim/stats/attributes";
import { Stat } from "../sim/stats/statTypes";
import { baseBonusFor } from "../sim/baseBonus";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "../sim/intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const CONTENT_DIR = join(REPO, "content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

const BASE = "godie-ogrh" as ChampionId;
const SSJ = "godie-o00x" as ChampionId;

/** 匯入器對 `war3map.w3u` / `war3map.w3a` 的傾印 —— 這一份的權威來源。 */
interface FixtureUnit {
  rawcode: string;
  championId: string;
  attackCooldown: number | null;
  moveSpeed: number | null;
  moveType: string | null;
  flyHeight: number | null;
  abilityRawcodes: string[] | null;
}
const FIXTURE = JSON.parse(
  readFileSync(join(REPO, "tools/w3x-import/out/GoDieEX22s-src/TRANSFORM_FORMS.json"), "utf8"),
) as { pairs: { heroNumber: string | null; normalUnit: FixtureUnit; alternateUnit: FixtureUnit }[] };

const OBJECTS = JSON.parse(
  readFileSync(join(REPO, "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json"), "utf8"),
) as {
  abilities: Record<string, { name: string; base: string; data: Record<string, Record<string, number>> }>;
};
const STOCK = JSON.parse(
  readFileSync(join(REPO, "tools/w3x-import/out/stock/STOCK_ABILITIES.json"), "utf8"),
) as { abilities: Record<string, { comments?: string; code?: string }> };

/** 球體掛件普查 —— A0MI / A0MJ 的權威來源（同 championFormVisuals.test.ts）。 */
const SPHERES = JSON.parse(
  readFileSync(join(REPO, "tools/w3x-import/out/emitters/SPHERE_ATTACHMENTS.json"), "utf8"),
) as {
  rows: {
    champId: string;
    abilityId: string;
    attachModel: string;
    attachPoint: string;
    verts: number;
    decision: string;
  }[];
};

/** 出貨的 champion JSON，走的是 ContentLoader 用的同一把 schema。 */
function championDoc(id: string): ReturnType<typeof zChampionDoc.parse> {
  return zChampionDoc.parse(
    JSON.parse(readFileSync(join(CONTENT_DIR, "champions", `${id}.json`), "utf8")),
  );
}

/** 依檔案路徑載入，跟 icons/abilityMirror 一樣 —— 不依賴 `content:build` 有沒有跑過。 */
function docs(collection: string): Record<string, unknown>[] {
  // 一次從 content/bundle.json 讀（bundle 過期時自動退回檔案樹）—— __fixtures__/shippedContent.ts
  return shippedDocs<Record<string, unknown>>(collection as CollectionName);
}

beforeAll(() => {
  const store = new ContentStore();
  // ability-templates 要先進，`registerAll` 在註冊時就展開鑄技工坊的 ref。
  for (const c of [
    "ability-templates",
    "abilities",
    "champions",
    "projectiles",
    "status-effects",
  ] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

let seat = 0;
function spawn(world: SimWorld, champion: ChampionId, team: 0 | 1, dz: number): EntityId {
  return spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    // 避開骨架場中央的柱子 —— 見 aura.test.ts 的同一個陷阱。
    pos: { x: Z0.center.x + 12, z: Z0.center.z + dz },
    zone: 0,
  });
}

/** E 升到 1 級並灌滿魔，讓受測的只剩效果本身。 */
function armE(world: SimWorld, id: EntityId): void {
  const ab = world.abilities.get(id)!;
  if (ab.slots.E.rank < 1) {
    world.ultGateOverride = true;
    ab.unspentPoints = 1;
    expect(rankUpAbility(world, id, "E"), "E 學得起來").toBe(true);
  }
  const hp = world.health.get(id)!;
  hp.mana = hp.maxMana = 9999;
}

const adOf = (world: SimWorld, id: EntityId): number => world.stats.get(id)!.final[Stat.AttackDamage];

/**
 * AD **在倍率空間裡**的值 —— 把 `finalizeStat` 加在**倍率之後**的基礎贈禮
 * (`content/config/base-bonus.json` 的 `ad`) 扣掉。
 *
 * ⭐ 09-002a 指令靈氣的「×1.25」乘的是**這個**空間,⛔ 不是最終面板值。
 *   2026-08-23 owner 給了英雄專屬初始 AD +32(GH#598),於是
 *   `最終 = 1.25 × 倍率空間 + 32`，而 `1.25 × 最終` 會多算 0.25×32 = 8 ——
 *   這三條就是這樣紅的（訊息卻說「變身沒有 +25%」）。
 * ⛔ 不要把 32 抄進來:它從 `world.baseBonus` 讀,owner 下次再調也不會紅。
 */
const adBoostSpaceOf = (world: SimWorld, id: EntityId): number =>
  adOf(world, id) - baseBonusFor(world.baseBonus, Stat.AttackDamage);

/**
 * 按下 E 並讓 0.3 s 的施法時間跑完。
 *
 * ⚠️ 這裡**固定跑滿 tick 數**，不是「看到 form index 變 1 就 return」。變身中再按
 * 一次的時候 index 本來就已經是 1，提前 return 會讓第二次施法根本沒解算 —— 那條
 * 「不會疊成 +50%」的守衛就永遠是綠的（突變驗證當場抓到，M3 通過了才發現）。
 */
function pressE(world: SimWorld, id: EntityId): void {
  expect(castAbility(world, id, "E", { type: "self" }), "E 真的施放出去").toBe("ok");
  for (let i = 0; i < 20; i++) world.step(NO_INTENTS);
  expect(world.abilities.get(id)!.cast, "施法已經解算完（不是還卡在前搖）").toBeNull();
}

// ---------------------------------------------------------------------------
// G1 — 出貨的兩份 champion doc 對得上地圖寫的身體
// ---------------------------------------------------------------------------
describe("09 悟空：變身態的身體就是 w3x 的 O00X (goku-form-body)", () => {
  const pair = FIXTURE.pairs.find((p) => p.heroNumber === "09")!;

  it("攻速與移速是 ua1c / umvs 換算過來的，方向與倍率都對", () => {
    cover("goku-form-body");
    expect(pair.normalUnit.rawcode).toBe("OGRH");
    expect(pair.alternateUnit.rawcode).toBe("O00X");
    // fixture 先自我驗證，否則下面就是拿空值比空值。
    expect(pair.normalUnit.attackCooldown).toBeCloseTo(1.9, 3);
    expect(pair.alternateUnit.attackCooldown).toBeCloseTo(1.2, 3);
    expect(pair.normalUnit.moveSpeed).toBe(310);
    expect(pair.alternateUnit.moveSpeed).toBe(400);

    const base = championDoc(BASE);
    const ssj = championDoc(SSJ);
    // WC3 的「攻擊間隔」倒數就是 GGD 的 `as`。兩邊都必須自己算得出來，
    // 而不是「兩個數字剛好不一樣」——後者連把 0.8333 打成 0.6 都抓不到。
    expect(base.baseStats.as!).toBeCloseTo(1 / pair.normalUnit.attackCooldown!, 4);
    expect(ssj.baseStats.as!).toBeCloseTo(1 / pair.alternateUnit.attackCooldown!, 4);
    // 同一個 w3x→GGD 移速常數必須同時解釋兩半（310→6.0 就是 51.67）。
    const perUnit = pair.normalUnit.moveSpeed! / base.baseStats.ms!;
    expect(ssj.baseStats.ms!).toBeCloseTo(pair.alternateUnit.moveSpeed! / perUnit, 1);
    // 方向：變身一定是變快，不是變慢。
    expect(ssj.baseStats.as!).toBeGreaterThan(base.baseStats.as!);
    expect(ssj.baseStats.ms!).toBeGreaterThan(base.baseStats.ms!);
  });

  it("變身表帶著 hover / 30 —— 這是 #168「浮空是 bug」的**例外**，不是漏改", () => {
    cover("goku-form-hover");
    const body = ALTERNATE_FORM_BODIES.get(SSJ);
    expect(body, "godie-o00x 在變身身體表裡").toBeDefined();
    expect(body!.moveType).toBe("hover");
    expect(body!.flyHeight).toBe(30);
    // 表 vs fixture：漂了就紅。
    expect(body!.moveType).toBe(pair.alternateUnit.moveType);
    expect(body!.flyHeight).toBe(pair.alternateUnit.flyHeight);
    // 本體**沒有**浮空，所以「兩邊都浮空」這種假通過不成立。
    expect(pair.normalUnit.moveType).toBeNull();
    expect(pair.normalUnit.flyHeight).toBeNull();
    // 全 26 對裡只有兩個宣告浮空；把普查釘住，之後多一個要有人知道。
    const floaters = [...ALTERNATE_FORM_BODIES.entries()]
      .filter(([, b]) => b.flyHeight !== undefined)
      .map(([id]) => id)
      .sort();
    expect(floaters).toEqual(["godie-o00x", "godie-o030"]);
  });

  it("變身身體表整份與匯入器 fixture 一致（26/26，不是只有悟空）", () => {
    cover("goku-form-body");
    expect(ALTERNATE_FORM_BODIES.size).toBe(CHAMPION_FORM_PAIRS.length);
    const drift: string[] = [];
    for (const p of FIXTURE.pairs) {
      const body = ALTERNATE_FORM_BODIES.get(p.alternateUnit.championId);
      if (!body) {
        drift.push(`${p.alternateUnit.championId}: 不在表裡`);
        continue;
      }
      const want = {
        attackCooldownSec: p.alternateUnit.attackCooldown,
        moveSpeed: p.alternateUnit.moveSpeed,
        moveType: p.alternateUnit.moveType,
        flyHeight: p.alternateUnit.flyHeight,
      };
      for (const [k, v] of Object.entries(want)) {
        const got = (body as unknown as Record<string, number | string | undefined>)[k];
        if (v === null) {
          if (got !== undefined) drift.push(`${p.alternateUnit.championId}.${k}: 地圖沒寫，表卻有 ${String(got)}`);
        } else if (typeof v === "number" ? Math.abs((got as number) - v) > 1e-3 : got !== v) {
          drift.push(`${p.alternateUnit.championId}.${k}: 表 ${String(got)} != 地圖 ${String(v)}`);
        }
      }
      if (p.alternateUnit.abilityRawcodes) {
        expect(body.abilityRawcodes, p.alternateUnit.championId).toEqual(
          p.alternateUnit.abilityRawcodes,
        );
      }
    }
    expect(drift).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// G2 — A0S7 隱藏法術書的來歷（扁平化之前先證明它真的存在且真的是 +25% 攻擊力）
// ---------------------------------------------------------------------------
describe("09-002a 悟空指令靈氣：藏在法術書裡的 +25% (goku-hidden-spellbook)", () => {
  it("只有變身態拿得到 A0S7，而 A0S7 就是一本只裝 A0SI 的法術書", () => {
    cover("goku-hidden-spellbook");
    // 「變身多了什麼」= uabi 的差集，而不是人工列的清單。
    expect(formAbilityGain(SSJ)).toEqual(["A0S7", "A017", "A0MJ"]);
    const spellbook = OBJECTS.abilities["A0S7"]!;
    expect(spellbook.base).toBe("Aspb"); // WC3 Spell Book
    expect(spellbook.name).toContain("悟空隱藏法術書");
    // 本體的 uabi 裡沒有它 —— 所以這個被動天生就是變身限定。
    expect(ALTERNATE_FORM_BODIES.get(SSJ)!.baseAbilityRawcodes).not.toContain("A0S7");
  });

  it("A0SI 的 base 是**指令光環**（攻擊力 %），不是傷害光環", () => {
    cover("goku-hidden-spellbook");
    const aura = OBJECTS.abilities["A0SI"]!;
    expect(aura.base).toBe("ACac");
    // 出貨的 Blizzard 表才是「ACac 是什麼」的答案，不是誰的記憶。
    const stock = STOCK.abilities["ACac"]!;
    expect(stock.comments).toBe("Aura - Command (Creep)");
    expect(stock.code).toBe("AOac");
    // 地圖把 DataA 從 0.1 改成 0.25 = +25% 攻擊力。
    expect(aura.data["1"]!["1"]).toBeCloseTo(0.25, 6);
  });
});

// ---------------------------------------------------------------------------
// G2b — 球體是「對調」不是「多掛一顆」
// ---------------------------------------------------------------------------
describe("A0MI ⇄ A0MJ：頭是對調的 (goku-sphere-swap)", () => {
  it("兩顆球掛在同一個點，模型不同，而且各自只屬於一半", () => {
    cover("goku-sphere-swap");
    const rows = SPHERES.rows.filter((r) => r.abilityId === "A0MI" || r.abilityId === "A0MJ");
    expect(rows).toHaveLength(2);
    const mi = rows.find((r) => r.abilityId === "A0MI")!;
    const mj = rows.find((r) => r.abilityId === "A0MJ")!;
    // 同一個掛點 —— 這就是「對調」的定義：兩顆佔同一格。
    expect(mi.attachPoint).toBe("origin");
    expect(mj.attachPoint).toBe("origin");
    expect(mi.attachModel).toBe("Gokuhead.mdx");
    expect(mj.attachModel).toBe("Goku3head.mdx");
    expect(mi.attachModel).not.toBe(mj.attachModel);

    const body = ALTERNATE_FORM_BODIES.get(SSJ)!;
    // 本體只有 A0MI，變身態只有 A0MJ。把表裡兩碼互換就會紅。
    expect(body.baseAbilityRawcodes).toContain("A0MI");
    expect(body.baseAbilityRawcodes).not.toContain("A0MJ");
    expect(body.abilityRawcodes).toContain("A0MJ");
    expect(body.abilityRawcodes).not.toContain("A0MI");
  });

  /**
   * ⚠️ 這裡**只釘資料**，不釘畫面，而且是知道畫面現在是壞的才這樣寫。
   *
   * `Gokuhead.mdx` 在 #267 已經**烘進 `goku.glb`**（`modelHeadGeometry.test.ts`
   * 的 268v/332tri primitive），而 `Goku3head.mdx` 是**執行期掛件**
   * （`content/config/form-visuals.json` 的 `attachModelKey`）。w3x 是換頭，
   * 這裡卻是「烘死的那顆還在，再掛一顆上去」= 變身後兩顆頭。
   *
   * 修法在渲染 lane（要一個「掛件取代身上某段烘死幾何」的欄位），不在內容。
   * 所以這裡不寫一條註定紅的斷言，只把「基本型不可以長出超三的頭」這一半釘住 ——
   * 那一半是真的成立的，而且 `championFormVisuals.test.ts` 連「有人把 godie-ogrh
   * 寫進設定檔」都試過。
   */
  it("基本型的 glb 沒有超三那顆頭（1146v），所以本體絕不會長出來", () => {
    cover("goku-sphere-swap");
    const mj = SPHERES.rows.find((r) => r.abilityId === "A0MJ")!;
    expect(mj.verts).toBe(1146);
    expect(mj.decision).toBe("DEFER-TO-TRANSFORM");
    // 本體那顆是真的被烘進去的，兩顆的頂點數不同 —— 所以「1146 不在 goku.glb 裡」
    // 是個有內容的斷言，不是同義反覆。(幾何面的檢查在 modelHeadGeometry.test.ts)
    const mi = SPHERES.rows.find((r) => r.abilityId === "A0MI")!;
    expect(mi.decision).toBe("ALREADY-SHIPPED");
    expect(mi.verts).not.toBe(mj.verts);
  });
});

// ---------------------------------------------------------------------------
// G3/G4 — 按按鈕，然後問身體與攻擊力（含「結束要清乾淨」）
// ---------------------------------------------------------------------------
describe("09-03 超級賽亞人：按下去真的變身，而且 +25% 只活在變身期間 (goku-transform-live)", () => {
  it("按 E → 換成 O00X 的身體，攻擊力 ×1.25，攻速/移速跟著換", () => {
    cover("goku-transform-live");
    const world = new SimWorld(SKELETON_ARENA, 9090);
    world.combatActive = true; // 每場開始要重新打開設定（owner）
    const goku = spawn(world, BASE, 0, 0);
    world.step(NO_INTENTS);

    const before = {
      ad: adBoostSpaceOf(world, goku),
      as: world.stats.get(goku)!.final[Stat.AttackSpeed],
      ms: world.stats.get(goku)!.final[Stat.MoveSpeed],
    };
    expect(championFormIndex(world, goku)).toBe(0);

    armE(world, goku);
    pressE(world, goku);

    expect(championFormIndex(world, goku), "身體換過去了").toBe(1);
    expect(world.champion.get(goku)!.championId, "ChampionComp 的 id").toBe(SSJ);
    expect(world.stats.get(goku)!.championId, "StatsComp 的 id（決定數值的那個）").toBe(SSJ);
    // 09-002a 指令靈氣 —— 這一格就是 A0SI 的 0.25。（兩邊都在倍率空間裡比，見 `adBoostSpaceOf`）
    expect(adBoostSpaceOf(world, goku)).toBeCloseTo(before.ad * 1.25, 4);
    // 🔴 2026-08-13 owner 裁決之後，這兩條**不再是「變大」而是「跟著身體走」**：
    //
    //   「請把變身也排除考慮行列，我決定**變身所有的屬性改變都用技能標籤組合到
    //     該變身技能中**就好，所以**屬性不用多一份考量，都是一樣**」
    //
    //   ⇒ 變身態不再是數值上的另一張卡：它照自己的出身正規化，而悟空與
    //     超級賽亞人是同一個出身，所以卡面的攻速/移速**現在完全相同**
    //     （實測 6.25 == 6.25）。原作的 ua1c 1.90→1.20 / umvs 310→400
    //     已經不會出現在數值表上。
    //
    // ⚠️ **那個差異要由變身技能本身的 buff 補回來**（技能標籤組合，owner 的計畫）。
    //    在補上之前，「超級賽亞人比悟空快」這件事在遊戲裡是**不成立**的。
    //
    // ⭐ 所以這裡改成驗**還成立的機制**：數值表真的換成了變身那具身體的值
    //    （而不是留在本體的值）。⛔ 不是把斷言刪掉 —— 這一條仍然會在
    //    「換身體沒有換數值表」的實作下紅。
    // ⭐ 拿**出貨的**算式當期望值，⛔ 不抄數字（那會是第四個住處）。
    const ssjDef = Champions.get(SSJ);
    // ⚠️ 等級住在 ChampionComp，不在 StatsComp（statPipeline.ts:70 就是這樣取的）。
    const lv = world.champion.get(goku)!.level;
    expect(world.stats.get(goku)!.final[Stat.AttackSpeed], "攻速照 SSJ 那張卡").toBeCloseTo(
      championStatBase(ssjDef, Stat.AttackSpeed, lv),
      3,
    );
    expect(world.stats.get(goku)!.final[Stat.MoveSpeed], "移速照 SSJ 那張卡").toBeCloseTo(
      championStatBase(ssjDef, Stat.MoveSpeed, lv),
      3,
    );
  });

  it("時間到：身體回本體**而且** +25% 一起消失（結束要清乾淨）", () => {
    cover("goku-transform-cleanup");
    const world = new SimWorld(SKELETON_ARENA, 9091);
    world.combatActive = true;
    const goku = spawn(world, BASE, 0, 0);
    world.step(NO_INTENTS);
    const baseAd = adOf(world, goku);
    const baseAdBoostSpace = adBoostSpaceOf(world, goku);

    armE(world, goku);
    pressE(world, goku);
    expect(championFormIndex(world, goku)).toBe(1);
    expect(adBoostSpaceOf(world, goku)).toBeCloseTo(baseAdBoostSpace * 1.25, 4);

    // 1 級 `ahdu` = 8 秒；跑到過期為止（上限寬鬆，免得被時間常數綁死）。
    for (let i = 0; i < 60 * 30 && championFormIndex(world, goku) === 1; i++) {
      world.step(NO_INTENTS);
    }
    expect(championFormIndex(world, goku), "回到本體").toBe(0);
    expect(world.champion.get(goku)!.championId).toBe(BASE);
    // 再多跑幾 tick，讓 buff 過期掃描一定跑過。
    for (let i = 0; i < 5; i++) world.step(NO_INTENTS);
    expect(adOf(world, goku), "+25% 沒有留在身上").toBeCloseTo(baseAd, 4);
  });

  /**
   * ⚠️ 這一條是我自己寫壞過的東西的守衛。
   *
   * `A09E` 的 `ahdu` 是 8/12/16/20（每級 +4 秒），而 `championForm` 這個 effect
   * 只帶得動**一個** `durationSec`（schema 沒有 perRank）。`applyBuff` 卻有
   * `perRank`。第一版就是這樣寫的：身體 8 秒到期，+25% 卻活 20 秒 —— 4 級的悟空
   * 變回本體之後還多帶 12 秒的攻擊力，剛好是「結束沒清乾淨」的那個形態。
   *
   * 所以出貨值是**兩邊同一個數**，而這一條在最高級按下去、量兩件事在**同一 tick**
   * 收掉。把 `perRank` 加回 `godie-ogrh.e` 就會紅。
   */
  it("4 級也同時結束：身體與 +25% 不可以有一個活得比較久", () => {
    cover("goku-transform-cleanup");
    const world = new SimWorld(SKELETON_ARENA, 9094);
    world.combatActive = true;
    const goku = spawn(world, BASE, 0, 0);
    world.step(NO_INTENTS);
    const baseAd = adOf(world, goku);

    // 升到 4 級（maxRank 4）。
    const ab = world.abilities.get(goku)!;
    world.ultGateOverride = true;
    for (let r = 0; r < 4; r++) {
      ab.unspentPoints = 1;
      expect(rankUpAbility(world, goku, "E"), `E 升到 ${r + 1} 級`).toBe(true);
    }
    expect(ab.slots.E.rank).toBe(4);
    armE(world, goku);
    pressE(world, goku);
    expect(championFormIndex(world, goku)).toBe(1);

    let formEnded = -1;
    let buffEnded = -1;
    for (let i = 0; i < 60 * 30; i++) {
      world.step(NO_INTENTS);
      if (formEnded < 0 && championFormIndex(world, goku) === 0) formEnded = world.tick;
      if (buffEnded < 0 && Math.abs(adOf(world, goku) - baseAd) < 1e-6) buffEnded = world.tick;
      if (formEnded >= 0 && buffEnded >= 0) break;
    }
    expect(formEnded, "身體有回本體").toBeGreaterThan(0);
    expect(buffEnded, "+25% 有掉").toBeGreaterThan(0);
    // 同一 tick（buff 過期掃描與 form 過期都是絕對 tick，容差 1 tick）。
    expect(Math.abs(formEnded - buffEnded)).toBeLessThanOrEqual(1);
  });

  it("變身期間再按一次 E：續時間，不會疊成 +50%", () => {
    cover("goku-transform-cleanup");
    const world = new SimWorld(SKELETON_ARENA, 9092);
    world.combatActive = true;
    const goku = spawn(world, BASE, 0, 0);
    world.step(NO_INTENTS);
    const baseAd = adBoostSpaceOf(world, goku);

    armE(world, goku);
    pressE(world, goku);
    expect(adBoostSpaceOf(world, goku)).toBeCloseTo(baseAd * 1.25, 4);

    // 冷卻歸零 + 補魔，重按。`stackKey` + `maxStacks: 1` 就是為了這一格。
    world.abilities.get(goku)!.slots.E.cooldownRemainingTicks = 0;
    armE(world, goku);
    pressE(world, goku);
    expect(championFormIndex(world, goku)).toBe(1);
    expect(adBoostSpaceOf(world, goku), "還是 +25%").toBeCloseTo(baseAd * 1.25, 4);
  });
});

// ---------------------------------------------------------------------------
// G5 — A017 超賽攻擊：變身後普攻的手感是**不同的物件**，不是不同的欄位
// ---------------------------------------------------------------------------
describe("超賽攻擊 A017：變身後的普攻打起來不一樣 (goku-ssj-attack-feel)", () => {
  it("A017 是純美術的攻擊修飾（WarStomp 環 + Stampede 爆），掛在 weapon", () => {
    cover("goku-ssj-attack-feel");
    const a017 = OBJECTS.abilities["A017"]!;
    expect(a017.name).toBe("超賽攻擊");
    // 沒有任何 data 欄位 = 它不改數值，只換命中的表現。
    expect(Object.keys(a017.data)).toEqual([]);
    expect(formAbilityGain(SSJ)).toContain("A017");
  });

  it("hitImpact 事件帶的最終 ImpactProfile，變身前後不同", () => {
    cover("goku-ssj-attack-feel");
    const world = new SimWorld(SKELETON_ARENA, 9093);
    world.combatActive = true;
    const goku = spawn(world, BASE, 0, 0);
    const dummy = spawn(world, "godie-hart" as ChampionId, 1, 1.4);
    // 沙包不會死也就不會停手 —— 這裡要的是「有東西被打到」而不是一場對戰。
    const dhp = world.health.get(dummy)!;
    dhp.maxHp = 1e9;
    dhp.hp = 1e9;

    /** 跑到悟空打中沙包一次為止，回傳那一發的最終 ImpactProfile。 */
    const nextImpact = (): { hitstopTicks: number; sparkKind: string; shakeStyle: string } => {
      for (let i = 0; i < 400; i++) {
        world.step(NO_INTENTS);
        dhp.hp = 1e9; // 沙包永遠站著
        for (const ev of world.events) {
          if (ev.type !== "hitImpact") continue;
          const p = ev.data as {
            source: EntityId;
            profile: { hitstopTicks: number; sparkKind: string; shakeStyle: string };
          };
          if (p.source !== goku) continue;
          return {
            hitstopTicks: p.profile.hitstopTicks,
            sparkKind: p.profile.sparkKind,
            shakeStyle: p.profile.shakeStyle,
          };
        }
      }
      throw new Error("悟空 400 tick 內一次都沒打中");
    };

    const asBase = nextImpact();

    armE(world, goku);
    pressE(world, goku);
    expect(championFormIndex(world, goku)).toBe(1);
    const asSsj = nextImpact();

    // 出貨的 godie-o00x.hitFeel 是 hitstop 2 / heavy / omni；本體是 1 / (推導) /
    // (推導)。把 hitFeel 從 champion doc 刪掉，這三格會塌回本體的值。
    expect(asSsj.hitstopTicks).toBe(2);
    expect(asSsj.sparkKind).toBe("heavy");
    expect(asSsj.shakeStyle).toBe("omni");
    expect(asSsj).not.toEqual(asBase);
  });
});

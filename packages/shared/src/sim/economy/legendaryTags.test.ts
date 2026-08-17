/**
 * 寶具的括號標籤 —— 逐條打在**出貨的那份 JSON** 上。
 *
 * ⚠️ 標題以前寫「49 支」。owner 2026-08-18 把上架寶具重新切成三階
 *（EX / [EX解放] / [EX∅ 根源]），49 這個數字當場過期 —— 檔尾的底線守衛現在
 * **從三張池檔推導**，⛔ 不再抄件數（CLAUDE.md 第二守則：驗機制不驗數字）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼是這個形狀
 * ═══════════════════════════════════════════════════════════════════════════
 * 這一批的產物全部是**資料**，不是程式。所以一條守衛要能在「有人改壞資料」時變紅，
 * 而且必須避開兩個最容易犯的錯：
 *
 *  ⑤ 被測的不是出貨的那個 —— 所以每一條都走 `ContentLoader` 讀真的 content/，
 *    再走真的授予入口 `grantItemFree`（shop.ts 三個 attachSource 之一）。
 *    測試自己手寫一份 hook 完全不算數。
 *  ⑦ 掃屬性代替掃行為 —— 所以主力斷言讀的是**最終狀態**：血條上少的那一格、
 *    `Stat.Lifesteal` 的最終值、`status` 上真的存在的 tick 數、法力池的水位。
 *
 * 另外有一組刻意的「文案 ↔ 資料」對照：從 owner 寫的 `description` 用正規表示式
 * **把數字拆出來**，再跟 registry 裡的值比。它抓的是這一批唯一真正的長期風險 ——
 * 有人改了其中一邊。⚠️ 文案只活在磁碟上那份 JSON 與 `zItemDoc` 裡；sim 側的
 * `ItemDef` 根本沒有 `description` 欄位，所以這不是拿同一個來源比對自己。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { combatResolveSystem } from "../combat/damage";
import { normalizeCombatEnv } from "../combatEnv";
import { fireHooks } from "../effects/hooks";
import { recomputeStats } from "../stats/statPipeline";
import { Stat } from "../stats/statTypes";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Champions, Items } from "../content/registry";
import { isLeaf } from "../content/condition";
import { grantItemFree } from "./shop";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const CENTER = SKELETON_ARENA.zones[0]!.center;

let ROSTER: ChampionId[] = [];

beforeAll(async () => {
  for (const r of [Champions, Items]) r.clear();
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(result.store);
  ROSTER = Champions.ids().slice().sort();
  expect(ROSTER.length).toBeGreaterThan(0);
});

/** 出貨的 `damageDealt` 是 0.5；設 1 只是讓算式讀得懂，不改任何結論。 */
function makeWorld(): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatEnv = normalizeCombatEnv({ damageDealt: 1 });
  return w;
}

function hero(w: SimWorld, seat: number, team: number, dx = 0): EntityId {
  return spawnChampion(w, {
    championId: ROSTER[0]!,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: CENTER.x + seat * 0.9 + dx, z: CENTER.z },
    zone: 0,
  });
}

/** 讀磁碟上那份 JSON 的 `description` —— 玩家真的看得到的那串字。 */
function prose(itemId: string): string {
  const raw = JSON.parse(readFileSync(join(CONTENT_DIR, "items", `${itemId}.json`), "utf8")) as {
    description?: string;
  };
  return raw.description ?? "";
}

/** 讓機率閘一定通過。被測的仍然是出貨那份文件的 hook 與效果。 */
function alwaysProc(w: SimWorld): void {
  (w.rng as unknown as { chance: (p: number) => boolean }).chance = () => true;
}

/** 這個單位身上、這個 statusId 還剩幾 tick（0 = 根本沒生效）。 */
function statusTicks(w: SimWorld, id: EntityId, statusId: string): number {
  const st = w.status.get(id);
  if (!st) return 0;
  let best = 0;
  for (const s of st.effects) {
    if (s.statusId !== statusId) continue;
    const left = s.expiresAtTick - w.tick;
    if (left > best) best = left;
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
// [斬殺] 死之王的意志 godie-i060
// ═══════════════════════════════════════════════════════════════════════════
describe("[斬殺] 死之王的意志 godie-i060", () => {
  const WILL = "godie-i060" as ItemId;

  /** 把 victim 的血設到 maxHp 的 pct，讓持有者普攻一下，回傳「他死了沒」。 */
  function swingAt(pct: number): { dead: boolean; lost: number } {
    const w = makeWorld();
    const holder = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    expect(grantItemFree(w, holder, WILL)).toBeGreaterThanOrEqual(0);
    const hp = w.health.get(victim)!;
    hp.hp = hp.maxHp * pct;
    const before = hp.hp;
    fireHooks(w, holder, "onBasicAttack", victim);
    combatResolveSystem(w);
    return { dead: hp.hp <= 0, lost: before - hp.hp };
  }

  it("★ 血量 2%（低於 3%）：一下普攻直接死", () => {
    const r = swingAt(0.02);
    expect(r.lost).toBeGreaterThan(0);
    expect(r.dead).toBe(true);
  });

  it("★ 血量 10%（沒有低於 3%）：**一點傷害都不該有**", () => {
    // 這一條是方向性的：斬殺沒接上 → 上面那條紅；condition 沒接上 → 這一條紅。
    // 少了它，一個「永遠斬殺」的實作會讓上面那條照樣綠（失敗形態 ④）。
    expect(swingAt(0.1)).toEqual({ dead: false, lost: 0 });
  });

  it("★ 血量剛好 3.0%：文案寫「低於」，所以**不該**死", () => {
    expect(swingAt(0.03).dead).toBe(false);
  });

  it("★ 文案的 3% = 文件裡的 condition value（改一邊就紅）", () => {
    const m = /斬殺生命低於\s*(\d+(?:\.\d+)?)\s*%/.exec(prose("godie-i060"));
    expect(m, "[斬殺] 那一行的文案變了，資料要跟著變").not.toBeNull();
    const hook = Items.get(WILL).passive?.[0];
    expect(hook?.on).toBe("onBasicAttack");
    const cond = hook?.condition;
    // `EffectCondition` 是 leaf | all | any | not 的聯集 —— 群組節點沒有 `kind`,
    // 所以要用 sim/content/condition.ts 匯出的 `isLeaf` 先收窄。
    if (cond === undefined || !isLeaf(cond) || cond.kind !== "stat") {
      throw new Error("[斬殺] 的 condition 不是一個 stat leaf");
    }
    expect(cond.subject).toBe("target");
    expect(cond.stat).toBe("hp");
    expect(cond.mode).toBe("percent");
    expect(cond.op).toBe("<");
    expect(cond.value).toBeCloseTo(Number(m![1]) / 100, 6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [重創] 四件共用一個 stackKey
// ═══════════════════════════════════════════════════════════════════════════
describe("[重創] 吸血減半 —— 四件道具、一個 debuff", () => {
  const GRIEVOUS: ItemId[] = [
    "godie-i016" as ItemId, // 晨曦之光
    "godie-i01g" as ItemId, // 貫雷槍
    "godie-i01i" as ItemId, // 雷神之鎚
    "godie-i01w" as ItemId, // 祕銀鎖子甲
  ];

  /** 攻擊者帶著 baseLifesteal，去打身上有 `items` 的防守者，回傳打完後的吸血值。 */
  function lifestealAfterHitting(items: ItemId[], hits = 1): { before: number; after: number } {
    const w = makeWorld();
    const attacker = hero(w, 0, 0);
    const defender = hero(w, 1, 1);
    // 攻擊者的吸血來源用**出貨的道具**（妖物碎殺牙 = lifesteal flat 0.15），
    // 不是手寫的 modifier —— 這樣「pctMult 有沒有真的乘到道具給的吸血上」也被測到。
    expect(grantItemFree(w, attacker, "godie-i06a" as ItemId)).toBeGreaterThanOrEqual(0);
    for (const it of items) expect(grantItemFree(w, defender, it)).toBeGreaterThanOrEqual(0);
    recomputeStats(w, attacker);
    const before = w.stats.get(attacker)!.final[Stat.Lifesteal];

    for (let i = 0; i < hits; i++) {
      // 一發**普攻**打在防守者身上 —— [重創] 是 onDamageTaken + damageSource:"basic"。
      w.damageQueue.push({
        source: attacker,
        target: defender,
        amount: 10,
        type: "physical",
        crit: false,
        origin: "basic",
      });
      combatResolveSystem(w);
    }
    recomputeStats(w, attacker);
    return { before, after: w.stats.get(attacker)!.final[Stat.Lifesteal] };
  }

  for (const item of GRIEVOUS) {
    it(`★ ${item}：打了它的持有者一下，攻擊者的吸血減半`, () => {
      const { before, after } = lifestealAfterHitting([item]);
      expect(before).toBeGreaterThan(0);
      expect(after).toBeCloseTo(before * 0.5, 6);
    });
  }

  it("★ 連打五下**還是**減半，不是 0.5^5（拿掉 stackKey 就會紅 —— 突變 M4′）", () => {
    const { before, after } = lifestealAfterHitting([GRIEVOUS[3]!], 5);
    expect(after).toBeCloseTo(before * 0.5, 6);
    // 方向性：連乘的話是 0.03125 倍，離 0.5 倍很遠。
    expect(after).toBeGreaterThan(before * 0.4);
  });

  it("★ 同時帶兩件 [重創] 仍然只減半（四件共用 stackKey 的整個理由）", () => {
    const { before, after } = lifestealAfterHitting([GRIEVOUS[1]!, GRIEVOUS[3]!]);
    expect(after).toBeCloseTo(before * 0.5, 6);
  });

  it("★ 用**技能**打他不會觸發（damageSource:\"basic\" 真的生效）", () => {
    const w = makeWorld();
    const attacker = hero(w, 0, 0);
    const defender = hero(w, 1, 1);
    grantItemFree(w, attacker, "godie-i06a" as ItemId);
    grantItemFree(w, defender, GRIEVOUS[3]!);
    recomputeStats(w, attacker);
    const before = w.stats.get(attacker)!.final[Stat.Lifesteal];
    w.damageQueue.push({
      source: attacker,
      target: defender,
      amount: 10,
      type: "physical",
      crit: false,
      origin: "ability:whatever",
    });
    combatResolveSystem(w);
    recomputeStats(w, attacker);
    expect(w.stats.get(attacker)!.final[Stat.Lifesteal]).toBeCloseTo(before, 6);
  });

  // ⚠️ maxStacks:1 對這個 buff 是**惰性的**（statPipeline 只讓 Flat/PercentAdd 乘
  // `src.stacks`，PercentMult 不看層數）—— 突變驗證 M4 拿掉它，上面那條**不會**紅。
  // 真正在做事的是 stackKey。四份文件的 authoringNote 已經照這個事實改過。
  it("★ 四份文件真的共用同一個 stackKey（誰改掉，這裡就紅）", () => {
    const keys = GRIEVOUS.map((id) => {
      const hook = Items.get(id).passive?.find((h) => h.on === "onDamageTaken");
      const eff = hook?.effects.find((e) => e.kind === "applyBuff");
      return eff?.kind === "applyBuff" ? eff.stackKey : undefined;
    });
    expect(new Set(keys)).toEqual(new Set(["grievous-wounds"]));
    // 四段文案一字不差都是「降低50%」—— 資料也必須是同一個數字。
    for (const id of GRIEVOUS) {
      expect(prose(id)).toMatch(/\[重創\]\s*敵方攻擊時吸血效果降低50%吸血回復量/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [暈眩] 血染八月 godie-i06o —— 30 Hz 底下真的暈得到
// ═══════════════════════════════════════════════════════════════════════════
describe("[暈眩] 血染八月 godie-i06o", () => {
  it("★ 暈眩至少存活 1 tick —— 0.01 秒會 round 成 0 tick，那是玩家永遠拿不到的功能", () => {
    const w = makeWorld();
    alwaysProc(w);
    const holder = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    expect(grantItemFree(w, holder, "godie-i06o" as ItemId)).toBeGreaterThanOrEqual(0);
    fireHooks(w, holder, "onBasicAttack", victim);
    combatResolveSystem(w);
    expect(statusTicks(w, victim, "fang-stun")).toBeGreaterThanOrEqual(1);
    const st = w.status.get(victim)!.effects.find((s) => s.statusId === "fang-stun");
    expect(st?.stun).toBe(true);
  });

  it("★ 文案的 50% = 文件裡的 chance", () => {
    const m = /(\d+(?:\.\d+)?)\s*%機率造成/.exec(prose("godie-i06o"));
    expect(m).not.toBeNull();
    const hook = Items.get("godie-i06o" as ItemId).passive?.find((h) =>
      h.effects.some((e) => e.kind === "applyStatus"),
    );
    expect(hook?.chance).toBeCloseTo(Number(m![1]) / 100, 6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [On-Hit] 螺旋劍 godie-i01v —— 直線 + 扣魔
// ═══════════════════════════════════════════════════════════════════════════
describe("[On-Hit] 螺旋劍 godie-i01v", () => {
  it("★ 普攻會扣自己 1% 最大魔力，而且直線上的第二個人也會吃到傷害", () => {
    const w = makeWorld();
    const holder = hero(w, 0, 0);
    const front = hero(w, 1, 1);
    // 排在 front 正後方（同一條 x 軸），落在 3.6 長 × 1.2 寬的走廊裡。
    const behind = spawnChampion(w, {
      championId: ROSTER[0]!,
      seatId: asSeatId(2),
      teamId: asTeamId(1),
      pos: { x: CENTER.x + 2.4, z: CENTER.z },
      zone: 0,
    });
    expect(grantItemFree(w, holder, "godie-i01v" as ItemId)).toBeGreaterThanOrEqual(0);
    recomputeStats(w, holder);

    const hp = w.health.get(holder)!;
    hp.mana = hp.maxMana;
    const manaBefore = hp.mana;
    const behindBefore = w.health.get(behind)!.hp;

    w.rebuildGrid();
    fireHooks(w, holder, "onBasicAttack", front);
    combatResolveSystem(w);

    expect(manaBefore - hp.mana).toBeCloseTo(hp.maxMana * 0.01, 4);
    expect(behindBefore - w.health.get(behind)!.hp).toBeGreaterThan(0);
  });

  it("★ 法力見底時整條不觸發（condition 是唯一擋住「免費螺旋擊」的東西）", () => {
    const w = makeWorld();
    const holder = hero(w, 0, 0);
    const front = hero(w, 1, 1);
    const behind = spawnChampion(w, {
      championId: ROSTER[0]!,
      seatId: asSeatId(2),
      teamId: asTeamId(1),
      pos: { x: CENTER.x + 2.4, z: CENTER.z },
      zone: 0,
    });
    grantItemFree(w, holder, "godie-i01v" as ItemId);
    recomputeStats(w, holder);
    w.health.get(holder)!.mana = 0;
    const behindBefore = w.health.get(behind)!.hp;
    w.rebuildGrid();
    fireHooks(w, holder, "onBasicAttack", front);
    combatResolveSystem(w);
    expect(w.health.get(behind)!.hp).toBe(behindBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [On-Hit] 光魔杖 godie-i027 —— 燒掉的魔力變成傷害
// ═══════════════════════════════════════════════════════════════════════════
describe("[On-Hit] 光魔杖 godie-i027", () => {
  it("★ 燒掉 5% 最大魔力，傷害就等於燒掉的量（coeff 1）", () => {
    const w = makeWorld();
    const holder = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    expect(grantItemFree(w, holder, "godie-i027" as ItemId)).toBeGreaterThanOrEqual(0);
    recomputeStats(w, holder);
    const hp = w.health.get(holder)!;
    hp.mana = hp.maxMana;
    const spent = hp.maxMana * 0.05;
    const vhp = w.health.get(victim)!;
    const before = vhp.hp;

    fireHooks(w, holder, "onBasicAttack", victim);
    combatResolveSystem(w);

    expect(hp.maxMana - hp.mana).toBeCloseTo(spent, 4);
    // 魔法傷害，落地時吃一次受害者的魔抗。
    const mr = w.stats.get(victim)!.final[Stat.MagicResist];
    expect(before - vhp.hp).toBeCloseTo(spent * (100 / (100 + Math.max(0, mr))), 3);
  });

  it("★ 空魔時不觸發（沒有 condition 的話會打出一發 0 傷害的空包彈）", () => {
    const w = makeWorld();
    const holder = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    grantItemFree(w, holder, "godie-i027" as ItemId);
    recomputeStats(w, holder);
    w.health.get(holder)!.mana = 0;
    const before = w.health.get(victim)!.hp;
    fireHooks(w, holder, "onBasicAttack", victim);
    combatResolveSystem(w);
    expect(w.health.get(victim)!.hp).toBe(before);
  });

  it("★「AP+ 魔力的5%」真的加到面板上（ModOp.PercentOf 有接上）", () => {
    const w = makeWorld();
    const bare = hero(w, 0, 0);
    const holder = hero(w, 1, 1);
    recomputeStats(w, bare);
    const apBefore = w.stats.get(holder)!.final[Stat.AbilityPower];
    grantItemFree(w, holder, "godie-i027" as ItemId);
    recomputeStats(w, holder);
    const s = w.stats.get(holder)!;
    expect(s.final[Stat.AbilityPower] - apBefore).toBeCloseTo(s.final[Stat.MaxMana] * 0.05, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 三發新的範圍 proc —— 雷神之鎚 / 冰晶虎魄 / 天地崩裂魔杖
// ═══════════════════════════════════════════════════════════════════════════
describe("新授權的範圍 proc 真的打得到旁邊的人", () => {
  /**
   * 主目標旁邊站一個 bystander，觸發 `event` 事件，回傳 bystander 掉的血
   * 與主目標身上的 status tick 數。
   */
  function proc(
    itemId: string,
    event: "onBasicAttack" | "onAbilityCast",
    statusId: string,
  ): { splash: number; ticks: number } {
    const w = makeWorld();
    alwaysProc(w);
    const holder = hero(w, 0, 0);
    const primary = hero(w, 1, 1);
    const bystander = spawnChampion(w, {
      championId: ROSTER[0]!,
      seatId: asSeatId(2),
      teamId: asTeamId(1),
      pos: { x: CENTER.x + 2.0, z: CENTER.z + 1.0 },
      zone: 0,
    });
    expect(grantItemFree(w, holder, itemId as ItemId)).toBeGreaterThanOrEqual(0);
    recomputeStats(w, holder);
    const before = w.health.get(bystander)!.hp;
    w.rebuildGrid();
    fireHooks(w, holder, event, primary);
    combatResolveSystem(w);
    return {
      splash: before - w.health.get(bystander)!.hp,
      ticks: statusTicks(w, primary, statusId),
    };
  }

  it("★ 雷神之鎚 godie-i01i：範圍雷電打到旁邊的人 + 主目標被減速 1 秒", () => {
    // 2026-08-18：標籤從 `slow40` 改成 `slow50`（moveSpeedMult 0.5 = 減 50%，
    // 見 content/slowLabelMatchesMultiplier.test.ts）。⛔ 斷言強度未變 —— 仍然
    // 要求那筆減速真的掛在主目標身上滿 1 秒，改的只是它的名字。
    const r = proc("godie-i01i", "onBasicAttack", "slow50");
    expect(r.splash).toBeGreaterThan(0);
    expect(r.ticks).toBeGreaterThanOrEqual(Math.round(1 / (1 / 30)) - 1);
  });

  it("★ 冰晶虎魄 godie-i04d：寒冰爆濺到旁邊的人 + 主目標被緩速 3 秒", () => {
    const r = proc("godie-i04d", "onBasicAttack", "slow30");
    expect(r.splash).toBeGreaterThan(0);
    expect(r.ticks).toBeGreaterThanOrEqual(Math.round(3 / (1 / 30)) - 1);
  });

  it("★ 天地崩裂魔杖 godie-i03h：施法時隕石落地 + 2 秒暈眩", () => {
    const r = proc("godie-i03h", "onAbilityCast", "burnstun");
    expect(r.splash).toBeGreaterThan(0);
    expect(r.ticks).toBeGreaterThanOrEqual(Math.round(2 / (1 / 30)) - 1);
  });

  it("★ 機率閘沒過就什麼都不發生（不然上面三條對「永遠觸發」也會綠）", () => {
    const w = makeWorld();
    (w.rng as unknown as { chance: (p: number) => boolean }).chance = () => false;
    const holder = hero(w, 0, 0);
    const primary = hero(w, 1, 1);
    grantItemFree(w, holder, "godie-i01i" as ItemId);
    const before = w.health.get(primary)!.hp;
    fireHooks(w, holder, "onBasicAttack", primary);
    combatResolveSystem(w);
    expect(w.health.get(primary)!.hp).toBe(before);
    expect(statusTicks(w, primary, "slow40")).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 死之王的長槍 godie-i01d —— 「回復敵方最大 MP 10%」
// ═══════════════════════════════════════════════════════════════════════════
describe("[On-Hit] 死之王的長槍 godie-i01d —— 幫對方補魔", () => {
  it("★ 打誰就補誰 10% 最大魔力（補到**敵人**身上，不是自己）", () => {
    const w = makeWorld();
    const holder = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    expect(grantItemFree(w, holder, "godie-i01d" as ItemId)).toBeGreaterThanOrEqual(0);
    const vhp = w.health.get(victim)!;
    const hhp = w.health.get(holder)!;
    vhp.mana = 0;
    hhp.mana = 0;
    fireHooks(w, holder, "onBasicAttack", victim);
    combatResolveSystem(w);
    expect(vhp.mana).toBeCloseTo(vhp.maxMana * 0.1, 4);
    // 方向性：`applyTo` 寫錯邊的話這裡會是持有者拿到魔力。
    expect(hhp.mana).toBe(0);
  });

  it("★ 文案的 10% = 文件裡的 manaPct", () => {
    const m = /回復敵方最大\s*MP\s*(\d+(?:\.\d+)?)\s*%/.exec(prose("godie-i01d"));
    expect(m).not.toBeNull();
    const eff = Items.get("godie-i01d" as ItemId).passive?.[0]?.effects[0];
    expect(eff?.kind).toBe("restore");
    if (eff?.kind !== "restore") throw new Error("不是 restore");
    expect(eff.manaPct).toBeCloseTo(Number(m![1]) / 100, 6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 寶具池的底線 —— 每一支都要有 payload
// ═══════════════════════════════════════════════════════════════════════════
/**
 * ⭐ 2026-08-18：**從池檔推導**，⛔ 不再抄一個數字。
 *
 * 這裡以前寫 `toHaveLength(49)`。owner 那天把池重新切成三階（EX 29 · [EX解放] 35 ·
 * [EX∅ 根源] 5），49 當場變成一個**用錯誤訊息紅**的斷言：它會說「傳說池壞了」，
 * 而真相只是 owner 改了策展。⚠️ 出貨件數是 owner 每週在動的東西
 * （CLAUDE.md 第二守則：守衛驗機制、⛔ 不驗數字），所以它不可以住在測試裡。
 *
 * ⚠️ 三張表全讀，⛔ 不只讀 `legendary-weapons` —— 一張沒被讀到的表就是一整階
 * 的空卡沒有人守。
 */
const POOL_FILES = [
  "legendary-weapons", // EX
  "ex-release-weapons", // [EX解放]
  "ex-origin-weapons", // [EX∅ 根源]
] as const;

function poolEntries(): { itemId: string }[] {
  return POOL_FILES.flatMap((f) => {
    const doc = JSON.parse(
      readFileSync(join(CONTENT_DIR, `loot-tables/${f}.json`), "utf8"),
    ) as { entries: { itemId: string }[] };
    expect(doc.entries.length, `${f}.json 是空的 —— 那一階發不出東西`).toBeGreaterThan(0);
    return doc.entries;
  });
}

describe("寶具三階的底線", () => {
  it("★ 沒有任何一支是 modifiers/passive/auras 三個都空的空卡", () => {
    const table = { entries: poolEntries() };
    const empty = table.entries
      .map((e) => e.itemId)
      .filter((id) => {
        const d = Items.get(id as ItemId);
        return (
          (d.modifiers?.length ?? 0) + (d.passive?.length ?? 0) + (d.auras?.length ?? 0) === 0
        );
      });
    expect(empty).toEqual([]);
  });

  it("★ 帶著 [重創] / [斬殺] 文案的每一支，資料裡都真的有那個機制", () => {
    const table = { entries: poolEntries() };
    const missing: string[] = [];
    for (const { itemId } of table.entries) {
      const text = prose(itemId);
      const def = Items.get(itemId as ItemId);
      if (text.includes("[重創]")) {
        const ok = def.passive?.some(
          (h) =>
            h.on === "onDamageTaken" &&
            h.effects.some(
              (e) =>
                e.kind === "applyBuff" &&
                e.modifiers.some((m) => m.stat === Stat.Lifesteal && m.value < 0),
            ),
        );
        if (!ok) missing.push(`${itemId}:重創`);
      }
      if (text.includes("[斬殺]")) {
        const ok = def.passive?.some((h) => {
          const c = h.condition;
          // `EffectCondition` 是 leaf | all | any | not 的聯集,群組節點沒有
          // `kind`,所以要先用 `isLeaf` 收窄(sim/content/condition.ts 匯出的
          // 就是這幾個 type guard)。
          if (c === undefined || !isLeaf(c)) return false;
          if (c.kind !== "stat" || c.subject !== "target" || c.stat !== "hp") return false;
          return h.effects.some((e) => e.kind === "damage" && e.hpPct !== undefined);
        });
        if (!ok) missing.push(`${itemId}:斬殺`);
      }
    }
    expect(missing).toEqual([]);
  });
});

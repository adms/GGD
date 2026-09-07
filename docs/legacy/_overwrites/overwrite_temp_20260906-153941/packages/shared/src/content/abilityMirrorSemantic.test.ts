/**
 * 獨立 ability 檔 ↔ 英雄卡內嵌副本的**語意**鏡射（GH#1042）。
 *
 * 每一支 Q/W/E/R 住兩處：`content/abilities/<cid>.<slot>.json`（權威）與
 * `content/champions/<cid>.json` 的 `abilities[<slot>]`（鏡射）。既有的
 * `abilityMirror.test.ts` 只驗「兩邊都有而值不同」；它的 one-sided 那一條逐字寫著
 * 「Embedded-only … is reported, never fatal」—— 而那正是這張票的洞：
 *
 * ⛔ 58-02 鋼鐵尾巴的 `passive`（10% on-hit +75 · 震昏）自 2026-08-23 `d58df591c`
 * 起只活在英雄卡的內嵌副本裡，standalone 是空的。它今天還會發生只因為
 * `registerChampion` 的 `fillGaps` 撐著它；任何整份重寫 standalone 的路徑（產生器、
 * 編輯器存檔、把 `passive` 從 MIRRORED_UPDATE_ONLY 挪進 MIRRORED）都會把一個活著的
 * 機制從遊戲裡拔走，⛔ 而全套 schema 綠（失敗形態②）。
 *
 * ① 帶機制的欄位缺一邊 ⇒ 紅（⭐ 兩個方向）：
 *    · embedded-only  ⇒ ⛔ 機制只靠 fillGaps 活著（本票的形狀）
 *    · standalone-only ⇒ ⚠️ 鏡射落後 —— `tiers:apply` 跑完就綠；併行 lane 編完
 *      standalone 到主 session 鏡射之間紅是**預期的**
 *    兩邊都有而值不同 → 仍由 `abilityMirror.test.ts` 管，⛔ 這裡不抄第二份。
 * ② 卡面說的事真的會發生：出貨內容 · 出貨的普攻路徑（⛔ 不手呼 fireHooks）· 固定種子。
 *    W 1 階 ⇒ 有非普攻來源的傷害＋有被按住的 tick；0 階 ⇒ 兩者皆 0（兩個方向）。
 *
 * 突變紀錄：docs/_reports/1042_temp_*.md。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { shippedDocFiles } from "./__fixtures__/shippedContent";
import type { CollectionName } from "./schema/index";
import { zChampionDoc } from "./schema/champion";
import { ContentStore } from "./store";
import { registerAll, Arenas, Configs, Models, StatusEffects, VfxDefs } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { syncAbilityPassives } from "../sim/abilities/abilityPassives";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";

type Doc = Record<string, unknown>;
type Pair = { abilityId: string; standalone: Doc; embedded: Doc };
const SLOTS = ["Q", "W", "E", "R"] as const;
/** 帶機制、或在 apply_tiers 同步表上的欄位 —— 缺一邊就是「兩份文件對同一支技能講不一樣的話」。 */
const SEMANTIC = ["passive", "effects", "template", "castType", "targetsEnemies", "cooldown", "manaCost", "range", "radius", "maxRank"] as const;
/** `<abilityId>:<field>` → 為什麼單邊是合法的（⭐ 要一個能被反駁的理由）。今天是空的。 */
const EXEMPT: Record<string, string> = {};

const docs = (c: string) => shippedDocFiles<Doc>(c as CollectionName);
const has = (d: Doc, f: string): boolean => d[f] !== undefined && d[f] !== null;

/** `<championId>.<slot>` → 兩份副本（同一支 standalone 可被多位英雄共用，所以⛔不用 abilityId 當 key）。 */
function pairs(): Map<string, Pair> {
  const byId = new Map(docs("abilities").map(({ doc }) => [doc.id as string, doc]));
  const out = new Map<string, Pair>();
  for (const { doc } of docs("champions")) {
    const ab = (doc.abilities ?? {}) as Record<string, Doc | undefined>;
    for (const slot of SLOTS) {
      const embedded = ab[slot];
      const standalone = embedded && byId.get(embedded.id as string);
      if (embedded && standalone) out.set(`${doc.id as string}.${slot}`, { abilityId: embedded.id as string, standalone, embedded });
    }
  }
  return out;
}

/** 純函式，好讓 sentinel 餵一對假的進來證明它不是瞎的。 */
function oneSided(ps: Iterable<Pair>): string[] {
  const out: string[] = [];
  for (const { abilityId, standalone, embedded } of ps) {
    for (const f of SEMANTIC) {
      const s = has(standalone, f);
      if (s === has(embedded, f) || EXEMPT[`${abilityId}:${f}`]) continue;
      out.push(
        s
          ? `${abilityId} ${f}: standalone-only ⚠️ 英雄卡鏡射落後 —— python3 tools/skill-remake/apply_tiers.py`
          : `${abilityId} ${f}: embedded-only ⛔ 機制只靠 fillGaps 活著，重寫 standalone 就會拔走`,
      );
    }
  }
  return out;
}

describe("① 獨立檔 ↔ 內嵌副本：帶機制的欄位不可以只有一邊有（GH#1042）", () => {
  it("scanner 看得見單邊 passive（sentinel —— 抓不到它就是瞎的）", () => {
    const fake: Pair = { abilityId: "x.w", standalone: { id: "x.w" }, embedded: { id: "x.w", passive: { ranks: [{}] } } };
    expect(oneSided([fake])).toEqual([expect.stringContaining("x.w passive: embedded-only")]);
  });

  it("出貨內容裡零支（豁免要帶理由，而且要指到真的存在的技能）", () => {
    const ps = pairs();
    expect(ps.size, "配對數要滿額，⛔ 不真空綠").toBeGreaterThanOrEqual(docs("champions").length * SLOTS.length);
    const ids = new Set([...ps.values()].map((p) => p.abilityId));
    for (const k of Object.keys(EXEMPT)) expect(ids.has(k.split(":")[0]!), `豁免表指到不存在的技能：${k}`).toBe(true);
    expect(oneSided(ps.values())).toEqual([]);
  });
});

const OFAR = "godie-ofar" as ChampionId;
const Z0 = SKELETON_ARENA.zones[0]!;

describe("② 58-02 鋼鐵尾巴：卡面說的事真的會發生（出貨內容 · 出貨普攻路徑 · 固定種子）", () => {
  beforeAll(() => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    const store = new ContentStore();
    for (const c of ["ability-templates", "abilities", "status-effects"] as const)
      for (const { file, doc } of docs(c)) store.add(c, (doc.id as string) ?? file.slice(0, -5), doc);
    store.add("champions", OFAR, zChampionDoc.parse(docs("champions").find(({ doc }) => doc.id === OFAR)!.doc));
    registerAll(store);
  });

  /** THE predicate the sim's action gates use — not a status-id lookup. */
  const cannotAct = (world: SimWorld, id: EntityId): boolean =>
    world.status.get(id)?.effects.some((e) => e.stun === true && e.expiresAtTick > world.tick) ?? false;

  /** 皮卡（遠程）打一具永遠滿血、釘在原地的靶：非普攻來源的傷害事件數 ＋ 靶被按住的 tick 數。 */
  function swing(rankW: 0 | 1, ticks: number): { procs: number; stunned: number } {
    const world = new SimWorld(SKELETON_ARENA, 1042);
    const at = (seat: number, dx: number): EntityId =>
      spawnChampion(world, { championId: OFAR, seatId: asSeatId(seat), teamId: asTeamId(seat), pos: { x: Z0.center.x + dx, z: Z0.center.z }, zone: 0 });
    const me = at(0, 0);
    const dummy = at(1, 2);
    world.abilities.get(me)!.slots.W.rank = rankW;
    syncAbilityPassives(world, me);
    const pin = { ...world.transform.get(dummy)!.pos };
    let procs = 0;
    let stunned = 0;
    for (let i = 0; i < ticks; i++) {
      for (const id of [me, dummy]) { const hp = world.health.get(id)!; hp.hp = hp.maxHp; }
      world.transform.get(dummy)!.pos = { ...pin };
      world.nav.get(me)!.attackTarget = dummy;
      world.step(new Map());
      for (const ev of world.events) if (ev.type === "damage" && ev.data.source === me && ev.data.origin !== "basic") procs++;
      if (cannotAct(world, dummy)) stunned++;
    }
    return { procs, stunned };
  }

  it("W 1 階：普攻依機率追加非普攻來源的傷害並把目標按住；0 階：兩者都是 0（兩個方向）", () => {
    const on = swing(1, 6000);
    expect(on.procs, "6000 tick 一發追擊都沒有 —— 10% 機率、~100 次普攻下 P≈0.9^100").toBeGreaterThan(0);
    expect(on.stunned, "追擊落地卻沒有任何一個 tick 被按住 ⇒「震昏」是空話").toBeGreaterThan(0);
    expect(swing(0, 6000), "W 0 階不該有任何追擊").toEqual({ procs: 0, stunned: 0 });
  });

  it("卡面的「N%機率增加M點」與 standalone 的 hook 互相釘住（⭐ 讀的是獨立檔，⛔ 不是英雄卡）", () => {
    type Hook = { on: string; chance: number; effects: { kind: string; amount?: { flat?: number }; stun?: boolean }[] };
    const doc = docs("abilities").find(({ doc }) => doc.id === "godie-ofar.w")!.doc as { description: string; passive?: { ranks: { hooks?: Hook[] }[] } };
    const m = /(\d+)%機率增加(\d+)點/.exec(doc.description)!;
    const hook = doc.passive?.ranks[0]?.hooks?.[0];
    expect(hook?.on, "⛔ standalone 沒有 onBasicAttack 被動 —— 它只活在英雄卡裡").toBe("onBasicAttack");
    expect(hook?.chance).toBeCloseTo(Number(m[1]) / 100, 6);
    expect(hook?.effects.find((e) => e.kind === "damage")?.amount?.flat).toBe(Number(m[2]));
    expect(hook?.effects.find((e) => e.kind === "applyStatus")?.stun, "「震昏」= stun").toBe(true);
  });
});

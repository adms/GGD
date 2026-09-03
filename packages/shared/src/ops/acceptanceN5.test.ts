/**
 * ⭐⭐ **46 份驗收 · 批5「生成與隨機」的一套治具**（GH#963）。
 *
 * 票文逐字：「⭐ **一套治具**跑本批 5 份，⛔ 不是 5 條測試」（第零守則⑨：
 * N 個同型 ＝ K 個模板 ＋ 一張表）。⇒ 這裡是**一張 5 列的表**（住在
 * `docs/editor-contract/ggd-acceptance-n5.json`）＋ **一組共用斷言**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️⚠️ ⭐ **前提回驗（三條，⛔ 其中兩條票文說錯了）**
 *
 * ① 票文：「本批的 id 清單**只有一個住處**（#953 定案的 **#838 body**）」
 *    ⇒ ⛔ **不成立**。2026-09-03 實查 #838 的 body：**沒有那 46 份清單**
 *      （#953 那條 lane 的檔頭逐字寫著「⛔ 不碰 #838」，它只落了**八招**的
 *      `ggd-acceptance-eight.json`）。今天這 5 個 id 的住處是
 *      ① GH#963 的 body ② `docs/_daily/ledger-source_temp_20260903.md`
 *      （owner 原話，⛔ **未進 git**、⚠️ 而且 `temp-sweep.sh` 七天後會把它搬走）。
 *    ⇒ ⭐ 照事實做：開一份 **batch-scoped 的機器住處**，⛔ 而它**不是抄本** ——
 *      下面每一條斷言都讓它**對著出貨內容自我驗證**（⛔ 抄本會漂，會自我驗證的
 *      清單漂了會紅）。
 *
 * ② 票文：「`conditionTier` 缺席 ⇒ **阻塞於 #943**」（owner 核准的共同規則 A）
 *    ⇒ ⛔ **今天不成立**（GH#959 lane 查出，本檔獨立複驗出貨原始碼）：
 *      #943 **已落地**（commit `3bdb3f925`，標題逐字「正解是**推導**，⛔ 不是去填
 *      235 份檔」），`content/conditionTiers.ts::resolveConditionTier` 逐字
 *      「⭐ 缺席 ⇒ 推導；填了 ⇒ 照填的」⇒ ⭐ **欄位缺席是正常狀態**，⛔ 不是缺口。
 *      （⚠️ 而我原本量錯了地方：那一格住在 **scaling 節點**上，⛔ 不是技能文件頂層。）
 *    ⇒ ⭐ 斷言③改成**跑那支解析器**：每一個 scaling 節點都要解析得出一格、
 *      每一格 `*Tier` 都要落在五級距詞彙表裡、⛔ 而 owner 禁止的「超大」一次都不可以出現。
 *      本批實測全部解析成「極小」（＝恆真）⇒ ⛔ 沒有一列因為級距而卡住。
 *
 * ③ ⭐ **量尺自己先騙過我一次**（記在這裡，因為它正是本檔在防的東西）：
 *    第一版探針用 `runEffects(...)` 之後**沒有 `world.step()`** 就去讀血量，
 *    於是 89-002 兩條「即死」分支量到 **0 傷害** —— ⛔ 那個結論是假的：
 *    傷害封包在 `combatResolveSystem` 才結算。補上 step 之後量到的是
 *    受害者 **-2046（＝滿血）**、自傷 **-2516.9（＝滿血）**。
 *    ⇒ 本檔每一處讀血量的地方都在 step 之後（⭐ 那就是 `calibrate()` 的意思）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 五條斷言，**每一條都問兩個方向**（第二守則的失敗形態⑫：只從一頭走的掃描
 *   結構上看不見另一頭）：
 *
 *   ① 住處與母體      —— 5 列都指得到一份**出貨載入器載得起來**的技能
 *   ② 軸宣告 ⇄ 效果圖  —— 宣告的軸圖上要有；圖上有的軸**必須被宣告**
 *   ③ 共同規則 #4/#5   —— 每一格級距都**解析得出答案**且⛔ 沒有「超大」；
 *                         ⭐ 而「我讀的是實際生效值」由一條**校準**證明（至少一列的
 *                         登錄表結果 ≠ 原始檔 ⇒ 這把尺分得出登錄表與原始檔）
 *   ④ 已知衝突不可靜默 —— 宣告的衝突今天要量得到；量得到的衝突**必須被宣告**
 *   ⑤ 執行時 ＋ ⭐ 決定性 —— 同一顆種子跑兩次**逐位元相同**，
 *                         ⭐ 而**換一顆種子必須不同**（⛔ 少了反方向，一把量不到
 *                         亂數的尺會對「決定性」永遠說是）
 *
 * ⚠️ **這一批的關鍵是 determinism**：`randomArea` 的落點在**施法那一刻一次抽完**
 * （`effects/randomArea.ts` 檔頭②：draw 預算 `2 × count`），`weightedBranch`
 * 整段**只花 1 次 draw**（該檔頭：「draw 次數不是欄位，是決定性預算」）——
 * 兩者只要有一格變成「看場況決定抽幾次」，**每一份既有錄影就全部對不上**。
 *
 * ⛔ 斷言裡沒有出貨數字（第二守則：驗機制不驗數字）—— 30 顆、4/6/8 棵、8 秒、
 * 55/30/15 全部從**出貨文件自己**讀回來，⛔ 不抄卡面。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）───────────────────────────────────
 * M1 `sim/effects/randomArea.ts::rollScatterPoints` 的承重那一行 ——
 *    `{ x: centre.x + u * r, z: centre.z + v * r }` → `{ x: centre.x, z: centre.z }`
 *    （＝ owner 逐字點名的「⛔ **全部疊在中心**」那個失敗形態）
 *    → 🔴 ⑤ 兩支一起指名：「godie-ogld.ex（72-002 億萬衛星殞落）30 顆落點只有
 *      1 個不同的座標 —— ⭐ owner 逐字：「每顆各自做範圍判定，**不能全部疊在中心**」」。
 *      還原後綠。
 * M2 manifest 的 `conflicts[0].signature` 改成一個對不上的字串（＝「衝突被靜默」）
 *    → 🔴 ④「godie-e00s.r（70-04 千年練成）：owner 的要點說「施法者」而圖上那一格
 *      條件的 subject 是 "target"」。還原後綠。
 * ⚠️ ⭐ **第一次的 M1 是無效的突變**（記在這裡，因為它正是量尺會騙人的形狀）：
 *    先試的是把 `content/abilities/godie-ogld.ex.json` 的 `scatterRadius` 改成 0，
 *    ⇒ 那份文件**整份過不了 Zod** ⇒ 四條斷言一起噴「content not registered」，
 *    ⛔ 而**一條都沒有指名到落點** —— 那個紅證明不了落點斷言承重。
 *    ⇒ 兩件事：改成突變**機制那一行**，並把 `shipped()` 換成 `tryGet`（見下）。
 * ⚠️ 兩次都用 `python3 scripts/edit-or-die.py`（⛔ 不是 `python3 -c "…replace…"`：
 *    對不上時它靜默印 ✓，⭐ 而突變驗證正是它最會騙人的地方）。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { castAbility } from "../sim/abilities/abilitySystem";
import { runEffects } from "../sim/effects/effectRunner";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { CastableSlot, IntentFrame } from "../sim/intents";
import type { EffectDef } from "../sim/effects/effect";
import { SKILL_TIER_NAMES } from "../content/skillTiers";
import { declaresTierWithoutCondition, resolveConditionTier } from "../content/conditionTiers";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const CONTENT_DIR = join(ROOT, "content");
const C = SKELETON_ARENA.zones[0]!.center;
const NO_INTENTS = (): Map<SeatId, IntentFrame> => new Map();
/** 陪打的假人 —— ⛔ 不是本批任何一支的主人。 */
const DUMMY = "godie-e001" as ChampionId;

type Axis = "random-scatter" | "summon-cleanup" | "weighted-single" | "conditional-weight-groups";
interface Conflict {
  id: string;
  signature: string;
  what: string;
  ownerSays: string;
  engineDoes: string;
}
interface Row {
  id: string;
  name: string;
  championId: string;
  slot: CastableSlot;
  ownerPoint: string;
  axes: Axis[];
  verdict: "pass" | "fail";
  /** ⭐ Main 這一側**量不到**的共同規則（編輯器／HITL 的那幾條）—— ⛔ 不可以是空的 */
  notVerifiedHere: string[];
  verdictWhy: string;
  conflicts?: Conflict[];
}
const MANIFEST = JSON.parse(
  readFileSync(join(ROOT, "docs/editor-contract/ggd-acceptance-n5.json"), "utf8"),
) as { ownerSource: { path: string; tracked: boolean }; rows: Row[] };
const ROWS = MANIFEST.rows;
/** 訊息一律指名**哪一支** —— ⛔ 「有一列壞了」下一輪讀不出是哪一列。 */
const who = (r: Row): string => `${r.id}（${r.name}）`;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

/* ── 出貨效果圖（⭐ 已經展開模板的那一份，⛔ 不是 JSON 檔上的原文）────────── */
interface AbilityShape {
  castType?: string;
  effects?: EffectDef[];
}
/**
 * ⚠️ `tryGet`，⛔ 不是 `get` —— `get` 找不到會**擲例外**，而那個例外會蓋掉下面
 * 每一條指名到哪一支的訊息（失敗形態⑨：錯誤訊息指著錯方向）。
 * ⭐ 實際踩過：把 `godie-ogld.ex` 的 `scatterRadius` 改成 0 做突變時，那份文件
 * **整份載入失敗**，於是四條斷言一起噴「content not registered」而**一條都沒指名
 * 到落點**。⇒ 現在載不進來是 ① 的一條具名斷言，其餘各自照常說自己的話。
 */
const shipped = (id: string): AbilityShape =>
  (Abilities.tryGet(id as never) as unknown as AbilityShape | undefined) ?? {};

type Node = Record<string, unknown>;
/** 走遍整棵效果樹：巢狀 `effects` 與 `branches[].effects` 都要進去。 */
function walk(effects: readonly unknown[] | undefined, visit: (n: Node) => void): void {
  for (const raw of effects ?? []) {
    const n = raw as Node;
    visit(n);
    walk(n["effects"] as unknown[] | undefined, visit);
    for (const b of (n["branches"] as Node[] | undefined) ?? [])
      walk(b["effects"] as unknown[] | undefined, visit);
  }
}
function kinds(id: string): string[] {
  const out: string[] = [];
  walk(shipped(id).effects, (n) => out.push(String(n["kind"])));
  return out;
}
/** ⭐ 從**圖**推導這一支落在哪幾個軸上 —— ⛔ 不讀 manifest（那是要被驗的一方）。 */
function axesInGraph(id: string): Set<Axis> {
  const found = new Set<Axis>();
  const ks = kinds(id);
  if (ks.includes("randomArea")) found.add("random-scatter");
  if (ks.includes("summon")) found.add("summon-cleanup");
  if (ks.includes("weightedBranch")) found.add("weighted-single");
  const gated = ((shipped(id).effects ?? []) as unknown as Node[]).filter(
    (e) => e["kind"] === "weightedBranch" && e["condition"] !== undefined,
  );
  if (gated.length >= 2) found.add("conditional-weight-groups");
  return found;
}
/** `all` / `any` / `not` 拆到底，回傳每一片葉子。 */
function leaves(cond: unknown): Node[] {
  if (cond === null || typeof cond !== "object") return [];
  const c = cond as Node;
  if (Array.isArray(c["all"]) || Array.isArray(c["any"]))
    return [...((c["all"] ?? c["any"]) as unknown[])].flatMap(leaves);
  if (c["not"] !== undefined) return leaves(c["not"]);
  return [c];
}
/**
 * ⭐ **主體錯位的偵測器**：owner 的驗收要點說「**施法者**」，而圖上那一格條件
 * 的 `subject` 是 `"target"` ⇒ 一次量得到的階梯衝突（第〇·六守則：owner 的
 * 新版說明 > 編輯器產生的 JSON）。
 */
function detectSubjectConflicts(row: Row): string[] {
  if (!row.ownerPoint.includes("施法者")) return [];
  const hits = new Set<string>();
  walk(shipped(row.id).effects, (n) => {
    for (const field of ["condition", "victimCondition"] as const)
      for (const leaf of leaves(n[field]))
        if (leaf["kind"] === "status" && leaf["subject"] === "target")
          hits.add(`${row.id}|${field}|status|target`);
  });
  return [...hits].sort();
}

/* ── 一套治具 ───────────────────────────────────────────────────────────── */
interface Receipt {
  id: string;
  cast: string;
  /** 引擎自己排的落點（施法那一刻一次抽完）——⭐ 決定性的證據就在這幾個座標上 */
  impacts: string[];
  impactTicks: number[];
  summonPeak: number;
  summonLeft: number;
  expiryFinite: boolean;
  ownerDeathLeft: number | null;
  /** 一次施放花掉的 rng draw（⭐ `weightedBranch` 的決定性預算是 **1**） */
  draws: Record<string, number>;
  outcomes: string[];
  hpLost: string[];
}
const round = (n: number): string => n.toFixed(4);

function rig(row: Row, seed: number): { world: SimWorld; caster: EntityId; foes: EntityId[] } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  const caster = spawnChampion(world, {
    championId: row.championId as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
    level: 6,
  });
  const h = world.health.get(caster)!;
  h.mana = h.maxMana = 9999;
  const foes = [1, 2, 3, 4].map((i) => {
    const id = spawnChampion(world, {
      championId: DUMMY,
      seatId: asSeatId(i),
      teamId: asTeamId(1),
      pos: { x: C.x + (i % 2 === 1 ? 2 : -2), z: C.z + (i > 2 ? 2 : -2) },
      zone: 0,
      level: 6,
    });
    const hp = world.health.get(id)!;
    hp.maxHp = 500_000;
    hp.hp = hp.maxHp;
    return id;
  });
  world.rebuildGrid();
  const ab = world.abilities.get(caster)!;
  ab.slots.R.rank = 1;
  if (ab.exSlot) ab.exSlot.rank = 1; // 競技場的 EX 解鎖點做的事
  return { world, caster, foes };
}
const mySummons = (world: SimWorld, owner: EntityId): number =>
  [...world.summon.values()].filter((s) => s.ownerId === owner).length;

/** 一次施放要跑幾 tick —— ⭐ 從出貨文件推導，⛔ 不寫死一個「夠久」。 */
function ticksFor(id: string, axes: Set<Axis>): number {
  let secs = 1.5;
  walk(shipped(id).effects, (n) => {
    if (n["kind"] === "summon") secs = Math.max(secs, Number(n["durationSec"] ?? 0) + 2.5);
  });
  return Math.round(secs * 30) + (axes.has("random-scatter") ? 180 : 30);
}

function runRow(row: Row, seed: number): Receipt {
  const axes = axesInGraph(row.id);
  const targeted = shipped(row.id).castType === "targeted";
  const { world, caster, foes } = rig(row, seed);
  const hp0 = foes.map((f) => world.health.get(f)!.hp);
  const cast = castAbility(
    world,
    caster,
    row.slot,
    targeted ? { type: "entity", entityId: foes[0]! } : { type: "self" },
  );
  let impacts: string[] = [];
  let impactTicks: number[] = [];
  let summonPeak = 0;
  let expiryFinite = true;
  for (let t = 0; t < ticksFor(row.id, axes); t++) {
    world.step(NO_INTENTS());
    const wave = world.randomArea.find((w) => w.caster === caster);
    if (wave && impacts.length === 0) {
      impacts = wave.impacts.map((i) => `${round(i.pos.x)},${round(i.pos.z)}`);
      impactTicks = wave.impacts.map((i) => i.atTick);
    }
    summonPeak = Math.max(summonPeak, mySummons(world, caster));
    for (const s of world.summon.values())
      if (s.ownerId === caster && !Number.isFinite(s.expiresAtTick)) expiryFinite = false;
  }

  // ⭐ 主人死了要不要清 —— owner 的要點逐字「召喚物**死亡**與到期清理正確」。
  let ownerDeathLeft: number | null = null;
  if (axes.has("summon-cleanup")) {
    const b = rig(row, seed);
    castAbility(
      b.world,
      b.caster,
      row.slot,
      targeted ? { type: "entity", entityId: b.foes[0]! } : { type: "self" },
    );
    for (let t = 0; t < 90; t++) b.world.step(NO_INTENTS());
    runEffects(
      [{ kind: "damage", applyTo: "self", damageType: "true", amount: { flat: 9e6 } } as EffectDef],
      { world: b.world, caster: b.caster, rank: 1, targets: [], origin: "test:kill", rng: b.world.rng },
    );
    for (let t = 0; t < 10; t++) b.world.step(NO_INTENTS());
    ownerDeathLeft = mySummons(b.world, b.caster);
  }

  // ⭐ draw 預算與分支結果 —— **隔離**跑（⛔ 同一個世界裡普攻的機率鉤子也會抽，
  //   那會把「這一招花幾次」淹掉）。跑的仍然是**出貨的 defs ＋ 出貨的 runner**。
  const draws: Record<string, number> = {};
  const outcomes: string[] = [];
  if (axes.has("weighted-single")) {
    const states = axes.has("conditional-weight-groups")
      ? (["none", "blind", "confusion"] as const)
      : (["none"] as const);
    for (const state of states) {
      const b = rig(row, seed);
      const ctx = {
        world: b.world,
        caster: b.caster,
        rank: 1,
        targets: [b.foes[0]!],
        origin: `ability:${row.id}`,
        rng: b.world.rng,
      };
      if (state !== "none")
        runEffects([{ kind: "applyStatus", statusId: state, duration: 10 } as unknown as EffectDef], ctx);
      const g0 = b.world.champion.get(b.caster)!.gold;
      const s0 = b.world.stats.get(b.caster)!.sources.length;
      const h0 = b.world.health.get(b.caster)!.hp;
      const f0 = b.world.health.get(b.foes[0]!)!.hp;
      let n = 0;
      const raw = b.world.rng.next.bind(b.world.rng);
      (b.world.rng as unknown as { next: () => number }).next = (): number => {
        n++;
        return raw();
      };
      runEffects(shipped(row.id).effects ?? [], ctx);
      for (let t = 0; t < 3; t++) b.world.step(NO_INTENTS()); // ③：傷害在 step 才結算
      draws[state] = n;
      // ⚠️⚠️ ⭐ **量尺第二次差點騙人**：探針只准量**這一支圖上真的有**的那幾種
      //   結果。第一版沒有這一行，於是 89-002 的「即死」把敵方英雄打死之後
      //   **擊殺賞金**讓施法者的金錢上升 ⇒ 量到「gold+target-execute」兩個結果，
      //   而那一支圖上**一個 `grantGold` 都沒有**。⛔ 那不是「命中兩個分支」，
      //   是我的量尺把場上另一個機制算進了這一招的帳。
      const ks = kinds(row.id);
      const got: string[] = [];
      if (ks.includes("grantGold") && b.world.champion.get(b.caster)!.gold > g0) got.push("gold");
      if (ks.includes("applyBuff") && b.world.stats.get(b.caster)!.sources.length > s0) got.push("buff");
      if (ks.includes("restore") && b.world.health.get(b.caster)!.hp > h0) got.push("restore");
      if (ks.includes("damage") && b.world.health.get(b.caster)!.hp < h0) got.push("self-execute");
      if (ks.includes("damage") && b.world.health.get(b.foes[0]!)!.hp < f0) got.push("target-execute");
      const st = b.world.status.get(b.foes[0]!) as unknown as { effects: { statusId: string }[] } | undefined;
      if (ks.includes("applyStatus") && (st?.effects ?? []).some((e) => e.statusId === "fear")) got.push("fear");
      outcomes.push(`${state}:${got.sort().join("+") || "none"}`);
    }
  }
  return {
    id: row.id,
    cast,
    impacts,
    impactTicks,
    summonPeak,
    summonLeft: mySummons(world, caster),
    expiryFinite,
    ownerDeathLeft,
    draws,
    outcomes,
    hpLost: foes.map((f, i) => round(hp0[i]! - world.health.get(f)!.hp)),
  };
}
const runBatch = (seed: number): Receipt[] => ROWS.map((r) => runRow(r, seed));

/* ── 斷言 ───────────────────────────────────────────────────────────────── */
describe("46 份驗收 · 批5 生成與隨機（GH#963）", () => {
  it("★★ ① 5 列都指得到一份**出貨載入器載得起來**的技能，且每一列都有判定", () => {
    expect(ROWS.length, "⛔ 批5 是 5 份（票文 Scope 的表）").toBe(5);
    for (const r of ROWS) {
      expect(
        (shipped(r.id).effects ?? []).length,
        `⛔ ${who(r)} 在出貨登錄表裡載不進來（文件不存在，或它被 Zod 擋下了）⇒ ⭐ 這一列驗的是空氣`,
      ).toBeGreaterThan(0);
      expect(r.ownerPoint.length, `⛔ ${who(r)} 沒有 owner 的驗收要點 ⇒ 驗收標準不存在`).toBeGreaterThan(10);
      expect(
        r.verdictWhy.length,
        `⛔ ${who(r)} 的判定沒有說為什麼 ⇒ ⭐ 下一輪讀到時它就是一句繞得過去的散文`,
      ).toBeGreaterThan(10);
      expect(["pass", "fail"], `⛔ ${who(r)} 的判定不在詞彙表裡`).toContain(r.verdict);
      // ⭐ 「通過」永遠是**有範圍的通過** —— ⛔ 一列不寫下自己量不到什麼，
      //   下一輪就會被讀成「14 條共同規則全過了」（👁 用詞紀律：鏈路接上 ≠ 玩家看得到）。
      expect(
        r.notVerifiedHere.length,
        `⛔ ${who(r)} 沒有寫下 Main 這一側**量不到**的那幾條共同規則（空白畫布重建 / 存檔匯出 / 動作對齊 / 連續擷圖…）⇒ ⭐ 那是在替編輯器側背書`,
      ).toBeGreaterThan(0);
    }
    // ⭐ owner 原話：來源在就逐字對；來源不在就要**老實承認**它不在 git 裡。
    const src = join(ROOT, MANIFEST.ownerSource.path);
    if (existsSync(src)) {
      const text = readFileSync(src, "utf8");
      for (const r of ROWS)
        expect(
          text.includes(r.ownerPoint),
          `⛔ ${who(r)} 的 ownerPoint 與 ${MANIFEST.ownerSource.path} 逐字對不上 ⇒ ⭐ 抄本漂了`,
        ).toBe(true);
    } else {
      expect(
        MANIFEST.ownerSource.tracked,
        "⛔ manifest 說 owner 原話的來源在版控裡，⭐ 而那個檔不存在 ⇒ 這一份沒有上游可對",
      ).toBe(false);
    }
  });

  it("★★ ② 軸的宣告 ⇄ 出貨效果圖：**兩個方向**都要對得上", () => {
    for (const r of ROWS) {
      const graph = axesInGraph(r.id);
      const declared = new Set(r.axes);
      const missing = [...declared].filter((a) => !graph.has(a));
      const undeclared = [...graph].filter((a) => !declared.has(a));
      expect(
        missing,
        `⛔ ${who(r)} 宣告了「${missing.join("、")}」而出貨效果圖上**沒有** ⇒ ⭐ 這一列在驗一個不存在的機制`,
      ).toEqual([]);
      expect(
        undeclared,
        `⛔ ${who(r)} 的效果圖上有「${undeclared.join("、")}」而清單沒宣告 ⇒ ⭐ 內容長出了新機制而驗收沒跟上（失敗形態⑫：只從一頭走的掃描看不見另一頭）`,
      ).toEqual([]);
    }
  });

  it("★★ ③ 共同規則 #4/#5：級距**解析得出答案**（⛔ 缺席不是阻塞）· ⛔ 沒有「超大」· ⭐ 讀的是實際生效值", () => {
    let resolvedDiffersFromRaw = 0;
    for (const r of ROWS) {
      const def = shipped(r.id) as unknown as Node;
      const raw = JSON.parse(
        readFileSync(join(CONTENT_DIR, "abilities", `${r.id}.json`), "utf8"),
      ) as Node;
      // (a) 每一格 `*Tier` 都要落在**五級距詞彙表**裡（整棵樹，⛔ 不只頂層），
      //     ⛔ 而 owner 逐字禁止的「超大」在整份解析結果裡一次都不可以出現。
      const bad: string[] = [];
      const check = (n: Node): void => {
        for (const [k, v] of Object.entries(n))
          if (k.endsWith("Tier") && typeof v === "string" && !SKILL_TIER_NAMES.includes(v as never))
            bad.push(`${k}=${v}`);
      };
      check(def);
      walk(def["effects"] as unknown[] | undefined, check);
      expect(
        bad,
        `⛔ ${who(r)} 有級距落在五級距之外（${bad.join("、")}）—— ⭐ owner 逐字：「極小／小／中／大／極大」，⛔ 禁止「超大」`,
      ).toEqual([]);
      // (b) ⭐ `conditionTier` 是**推導**的（GH#943 `conditionTiers.ts` 檔頭逐字：
      //     「缺席 ⇒ 推導；填了 ⇒ 照填的」）⇒ ⛔ 欄位缺席**不是**缺口，
      //     ⚠️ 而在此之前這一格寫成「缺席 ⇒ 阻塞於 #943」——那是一句過期的散文。
      //     反方向：宣告了級距卻沒有任何條件 ＝ 一句說了不會發生的話（第一·五守則）。
      const lies: string[] = [];
      const tiers: string[] = [];
      walk(def["effects"] as unknown[] | undefined, (n) => {
        if (n["amount"] === undefined) return;
        tiers.push(resolveConditionTier(n["amount"]));
        if (declaresTierWithoutCondition(n["amount"])) lies.push(String(n["kind"]));
      });
      for (const t of tiers)
        expect(
          SKILL_TIER_NAMES.includes(t as never),
          `⛔ ${who(r)} 的某個 scaling 節點解不出條件級距（回了「${t}」）⇒ ⭐ 那才是缺口`,
        ).toBe(true);
      expect(
        lies,
        `⛔ ${who(r)} 的「${lies.join("、")}」宣告了 conditionTier 卻沒有任何條件結構 ⇒ ⭐ 契約說「這條很難吃到」而它恆真（第一·五守則）`,
      ).toEqual([]);
      if (JSON.stringify(def["effects"]) !== JSON.stringify(raw["effects"])) resolvedDiffersFromRaw++;
    }
    // (c) ⭐ **校準**（⛔ 少了這一條，(a)(b) 只證明「某份 JSON 是對的」）：
    //     共同規則 #5 要的是**經限制器處理後的實際生效值**。本檔一律讀
    //     `Abilities` 登錄表（模板已展開、級距已解析）—— 而「我真的讀的是那一份」
    //     只有在**至少一列與原始檔不同**時才證明得了。
    expect(
      resolvedDiffersFromRaw,
      "⛔ 本批沒有任何一列的解析結果與原始檔不同 ⇒ ⭐ 這把尺分不出「我讀了登錄表」與「我讀了原始檔」—— 共同規則 #5 因此驗不到",
    ).toBeGreaterThan(0);
  });

  it("★★ ④ 已知衝突**不可以靜默**：宣告的今天要量得到，量得到的必須被宣告", () => {
    for (const r of ROWS) {
      const detected = detectSubjectConflicts(r);
      const declared = (r.conflicts ?? []).map((c) => c.signature).sort();
      expect(
        detected.filter((d) => !declared.includes(d)),
        `⛔ ${who(r)}：owner 的要點說「施法者」而圖上那一格條件的 subject 是 "target" —— ⭐ 這是階梯第 1 層與第 2 層打架（第〇·六守則），⛔ 靜默通過 ＝ 卡面在說謊`,
      ).toEqual([]);
      expect(
        declared.filter((d) => !detected.includes(d)),
        `⭐ ${who(r)} 宣告的衝突今天量不到了（內容被修好了？）⇒ ⛔ 那一列的判定要跟著改，⛔ 不可以留著一個不存在的衝突`,
      ).toEqual([]);
      if ((r.conflicts ?? []).length > 0)
        expect(r.verdict, `⛔ ${who(r)} 有活著的衝突而判定不是「不通過」`).toBe("fail");
    }
  });

  it("★★ ⑤ 執行時一套治具跑 5 份 ＋ ⭐ 決定性（同種子逐位元同 · **換種子必須不同**）", () => {
    const a1 = runBatch(20260903);
    // ⭐ 共同規則 #14 的 **JSON receipt** —— 預設**不寫檔**（⛔ 測試不可以弄髒工作樹）。
    // `GGD_N5_RECEIPT=<路徑>` 時把這一輪量到的收據寫出去 ⇒ ⭐ 報告裡那一份是
    // **重跑得出來的**，⛔ 不是手抄的（手抄的收據會漂，而且看起來一模一樣）。
    if (process.env["GGD_N5_RECEIPT"])
      writeFileSync(process.env["GGD_N5_RECEIPT"], JSON.stringify(a1, null, 2));
    const a2 = runBatch(20260903);
    const b = runBatch(19700101);
    // ⭐ 決定性：同一顆種子兩次跑**逐位元相同**（⛔ 否則每一份既有錄影都對不上）。
    expect(
      JSON.stringify(a2),
      "⛔⛔ 同一顆種子跑兩次結果不同 ⇒ ⭐ 這一批有東西吃了 `Math.random` / 時鐘 / Map 迭代序 —— **每一份既有錄影就此對不上**",
    ).toBe(JSON.stringify(a1));
    // ⭐ 反方向的校準：一把量不到亂數的尺，會對「決定性」永遠說是。
    expect(
      JSON.stringify(b),
      "⛔ 換一顆種子得到**一模一樣**的收據 ⇒ ⭐ 這張收據根本沒有量到任何隨機（⛔ 上面那條「決定性」因此證明不了任何事）",
    ).not.toBe(JSON.stringify(a1));

    for (const [i, r] of ROWS.entries()) {
      const got = a1[i]!;
      const axes = axesInGraph(r.id);
      expect(got.cast, `⛔ ${who(r)} 施放不出來（${got.cast}）⇒ 後面每一條都驗不到`).toBe("ok");

      if (axes.has("random-scatter")) {
        // 出貨文件自己說這一波該有幾發 —— ⛔ 不抄卡面上的 30 / 4。
        let want = 0;
        let scatter = 0;
        walk(shipped(r.id).effects, (n) => {
          if (n["kind"] !== "randomArea") return;
          want = (n["count"] as number[])[0] ?? 0;
          scatter = Number(n["scatterRadius"] ?? 0);
        });
        expect(got.impacts.length, `⛔ ${who(r)} 排出來的落點數與出貨文件的 count 對不上`).toBe(want);
        expect(
          new Set(got.impactTicks).size,
          `⛔ ${who(r)} 整波塞在同一個 tick —— ⭐ owner 的要點要的是「每秒一次」，⛔ 不是一次全下`,
        ).toBe(want);
        expect(
          new Set(got.impacts).size,
          `⛔ ${who(r)} ${want} 顆落點只有 ${new Set(got.impacts).size} 個不同的座標 —— ⭐ owner 逐字：「每顆各自做範圍判定，**不能全部疊在中心**」`,
        ).toBe(want);
        const centre = `${round(C.x)},${round(C.z)}`;
        expect(got.impacts.filter((p) => p === centre).length, `⛔ ${who(r)} 有落點正中圓心`).toBe(0);
        for (const p of got.impacts) {
          const [x, z] = p.split(",").map(Number) as [number, number];
          expect(
            Math.hypot(x - C.x, z - C.z),
            `⛔ ${who(r)} 有落點掉到 scatterRadius 之外 ⇒ ⭐ 散佈半徑那一格沒有被讀`,
          ).toBeLessThanOrEqual(scatter + 1e-6);
        }
      }

      if (axes.has("summon-cleanup")) {
        expect(got.summonPeak, `⛔ ${who(r)} 一具召喚物都沒生出來（失敗形態②：排得出來、不會落地）`).toBeGreaterThan(0);
        expect(got.expiryFinite, `⛔ ${who(r)} 的召喚物沒有到期時刻 ⇒ ⭐ 它會**永遠留在場上**`).toBe(true);
        expect(got.summonLeft, `⛔ ${who(r)} 的召喚物過了持續時間還在場上 —— ⭐ owner 的要點逐字要「到期清理正確」`).toBe(0);
        expect(got.ownerDeathLeft, `⛔ ${who(r)} 的主人死了而召喚物還活著 —— ⭐ owner 的要點逐字要「召喚物**死亡**⋯清理正確」`).toBe(0);
      }

      if (axes.has("weighted-single")) {
        for (const [state, n] of Object.entries(got.draws))
          expect(
            n,
            `⛔⛔ ${who(r)} 在「${state}」狀態下一次施放花了 ${n} 次 rng draw —— ⭐ 只能是 **1**（\`weightedBranch\` 檔頭逐字：「draw 次數不是欄位，是**決定性預算**」）。⚠️ 兩組條件同時成立 ⇒ 2 次 ⇒ 之後場上每一件跟隨機有關的事都位移，**錄影對不上**`,
          ).toBe(1);
        for (const o of got.outcomes) {
          const got1 = o.split(":")[1] ?? "";
          expect(
            got1.split("+").filter((s) => s && s !== "none").length,
            `⛔ ${who(r)} 一次施放命中了「${got1}」—— ⭐ owner 逐字：「只能抽中一個結果」`,
          ).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

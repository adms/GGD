/**
 * ⏱⏱ **GH#962 —— 46 份驗收 · 批 N4「時序與持續」（11 份）的一套治具**。
 *
 * ⭐ 一套治具 × 11 列參數（第零守則⑨：N 個同型 ＝ K 個模板 ＋ 一張表），
 * ⛔ **不是 11 條測試**。判定表住 `docs/editor-contract/ggd-acceptance-n4.json`
 * （⭐ 機器讀的唯一住處），這一支**每次重量一遍**再跟它對 ——
 * ⇒ 任一側動了就紅：內容修好了紅（去改判定）、內容壞掉了也紅（去修內容）。
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔⛔ 前提回驗：票文的三個前提有**兩個不成立**（照事實做，⛔ 不照票文做）
 *
 *  ① 票文：「本批的 id 清單只有一個住處（#953 定案的 **#838 body**）」
 *     ⇒ ⛔ **不成立**。`gh issue view 838` 的 body 今天只有 3 處 `godie-`
 *       （兩處是 `vfx-script@1` 的示意、一處是舉證「編輯器不能寫 ability JSON」），
 *       ⛔ 沒有 46 份清單。#953 的收尾留言逐字寫著它被交代「⛔ 不碰 #838」，
 *       於是機器讀的那一份落在 `ggd-acceptance-eight.json` ——
 *       ⭐ **而那一份只有八招／11 個 id，⛔ 不含 46 份的分批**。
 *     ⇒ ⭐ 照同一個先例替**本批**建一個住處（本檔讀的那一份），
 *       ⛔ 而不是把清單抄進這個測試（抄了必過期，而且不會有東西紅）。
 *
 *  ② 票文（共同規則 #5 必測案例）：「`godie-e00r.q` 極小·**範圍** ⇒ **30s**，
 *     ⛔ 陣列寫 6」⇒ ⛔ **不成立**。出貨文件**明填** `cooldownShape: "單體"`
 *     ⇒ `resolveCooldownTier` 解析成 **6s**（＝陣列值，⛔ 沒有分岔）。
 *     30s 是**拿掉那一格之後**才會發生的事。同一件事在 `godie-nbbc.r` 上也一樣
 *     （pin 在 ⇒ 60s，pin 拿掉 ⇒ 120s）—— ⚠️ ⭐ 而 #953 的收尾留言只複驗了
 *     **陣列與級別**兩格就寫下「級距解析成 120」⇒ 那句話**沒有被量過**。
 *     ⇒ ⭐ 本檔把它翻成一個**兩個方向都動得到**的校準（見 §2）。
 *
 *  ③ 票文（共同規則 #7）：「被動⛔ 不得播放假的主動施法動作」
 *     ⇒ ⭐ 成立，⛔ 但**這一支不重寫它** —— `sim/abilities/passivesNeverFakeCast.test.ts`
 *       已經在跑，而且兩個方向都驗過。⛔ 重寫一遍是第零守則的「同一件事做兩遍」。
 *       本檔只量形狀（`passive` 區塊 ＋ 空 `effects`）並記進判定表。
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔⛔ ④ **我自己的第一版也踩了一個假前提**（2026-09-03 收到更正後複驗）
 *
 * 這一支的第一版把「`conditionTier` 欄位缺席」判成「⛔ 阻塞於 #943」，
 * 於是 11 份裡 9 份被判成阻塞。⛔ **那錯了兩層**：
 *
 *  · ⭐ **#943 已經落地**（commit `3bdb3f925`，標題逐字「正解是**推導**，
 *    ⛔ 不是去填 235 份檔」）。`content/conditionTiers.ts` 的
 *    `resolveConditionTier()` 在**缺席時從文件自己的結構推導**
 *    （沒有條件 ⇒ 極小／恆真；有條件而作者沒判斷 ⇒ 中）
 *    ⇒ ⭐ **欄位缺席是設計如此的正常狀態**，⛔ 不是缺口。
 *  · ⭐ 而我讀的是**技能頂層**的 `conditionTier` —— ⛔ 那一格根本不住在頂層，
 *    它住在 **scaling 節點**上 ⇒ 我量的是一個**永遠不存在的欄位**，
 *    於是「11/11 缺」這個數字看起來像訊號，其實是儀器指著空氣（失敗形態④）。
 *
 * ⇒ ⭐ 現在改成**真的呼叫解析器讀回傳值**，並跑**反方向**的
 *   `declaresTierWithoutCondition()`。⛔ 判定字彙裡也不再有「阻塞於 #943」
 *   那句過期散文 —— 帳本是機器可讀契約，一句散文住進去之後沒有東西會紅（第三守則）。
 * ⚠️ 全庫那一層的守衛是 `content/tierTagCoverage.test.ts`，
 *   ⛔ 本檔不重寫它，只重量本批這 11 份當棘輪。
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⭐ 兩個方向（⛔ 一把只驗過單邊的尺不算自證過）
 *
 *  · **已知有的量得到**：`godie-hart.r` 七段各自落地 · `godie-h02u.ex` 正好 6 次
 *  · **已知沒有的量不到**：`godie-emns.ex`（`swapResource`，零週期節點）在**同一套
 *    治具**下量到 **0 段 / 0 次** ⇒ ⛔ 一把「永遠說 7／說 6」的尺會在這裡露餡
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🧬 突變紀錄（一批一條，最承重的那一條；⛔ 用 `scripts/edit-or-die.py` 改，實跑）
 *
 *  M1 `sim/effects/delayed.ts` 的排程從**絕對 tick** 改成每發都掛在同一個
 *     `world.tick + delayTicks`（＝把 `i * intervalTicks` 拿掉，那正是「遞減計數器
 *     ／同一 tick 全塞」那一族缺陷的形狀）
 *     ⇒ 🔴 §4「週期次數精準」— 訊息逐字指名 `godie-h02u.ex`，說排程不再等距。
 *     改回 ⇒ 綠。
 *  ⚠️ §3 的迴圈體（`comboStrike` 演出錨）與 §4 走**同一支** `delayedSystem`，
 *     所以 M1 同時證明了 §3 的量尺是活的 —— ⛔ 不另外再做一次（第零守則⑦）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { cooldownTiersFromDoc, cooldownShapeOf, resolveCooldownTier } from "../content/cooldownTiers";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { runEffects } from "../sim/effects/effectRunner";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../ids";
import type { AbilityDef } from "../sim/content/defs";
import type { EffectContext, EffectDef } from "../sim/effects/effect";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

interface Measured {
  declaredDurationStages: number;
  durationNodes: number;
  segments: { kind: string; count: number }[];
  missingTiers: string[];
  slot: string;
  innateKind: string | null;
  passiveOnly: boolean;
}
interface Ledger {
  verdicts: { id: string; name: string; verdict: string; reason: string; measured: Measured }[];
  rule5Calibration: {
    id: string;
    arraySec: number;
    withShapePin: { shape: string; resolvedSec: number };
    withoutShapePin: { shape: string; resolvedSec: number };
  };
  behaviour: {
    multiSegment: { id: string; family: string; damageEvents: number; comboStrikeCues: number; finisherCues: number };
    periodic: { id: string; count: number; intervalTicks: number; payouts: number; payoutsAfterCasterDeath: number; deathResidue: boolean };
    negativeControl: { id: string; delayedWaves: number; payouts: number; swapsCurrentHealth: boolean };
  };
}

const LEDGER = JSON.parse(
  readFileSync(join(ROOT, "docs/editor-contract/ggd-acceptance-n4.json"), "utf8"),
) as Ledger;

const VERDICTS = ["通過", "阻塞於#943", "不通過"];
/** 五級距 —— ⭐ 共同規則 #4 的量測面。缺一格就是「⛔ 阻塞於 #943」，⛔ 不是通過。 */
const TIER_TAGS = ["cooldownTier", "rangeTier", "radiusTier", "manaCostTier", "conditionTier"];
/** 帶「持續」語意的節點 → 它的秒數欄位。⭐ `delayed` 另計（它的跨度是 count × interval）。 */
const DURATION_FIELD: Record<string, string> = {
  dot: "durationSec",
  applyBuff: "duration",
  applyStatus: "duration",
  manaBarrier: "durationSec",
  invulnerable: "durationSec",
  shield: "duration",
  cycleBuff: "durationSec",
};

/** 這棵子樹裡每一個 `kind` 節點（⛔ 只看頂層會漏掉 hook / onHitTargets 底下的）。 */
function nodesOf(n: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(n)) {
    for (const x of n) nodesOf(x, out);
    return out;
  }
  if (n === null || typeof n !== "object") return out;
  const r = n as Record<string, unknown>;
  if (typeof r["kind"] === "string") out.push(r);
  for (const v of Object.values(r)) nodesOf(v, out);
  return out;
}

/**
 * ⭐⭐ **本批的治具** —— 從**出貨註冊表**（模板已展開、級距已解析）量一支技能的
 * 時序輪廓。⛔ 不讀原始 JSON 的字面值：`godie-hjai.w` 的 5 段整個住在
 * `tpl-periodic-field` 裡，讀檔案會量到 0 段。
 */
function profile(def: AbilityDef): Measured {
  const raw = def as unknown as Record<string, unknown>;
  const nodes = [...nodesOf(raw["effects"]), ...nodesOf(raw["passive"])];
  const segments = nodes
    .filter((n) => n["kind"] === "comboStrikes" || n["kind"] === "delayed")
    .map((n) =>
      n["kind"] === "comboStrikes"
        ? // ⭐ 段數＝共用節奏表的等待數 ＋ 收尾那一發（`content/config/combo-strikes.json`）
          { kind: "comboStrikes", count: ((n["steps"] as number[] | undefined)?.length ?? 0) + 1 }
        : { kind: "delayed", count: Number(n["count"] ?? 1) },
    );
  const spans = nodes.filter((n) => n["kind"] === "delayed").length;
  const durationNodes =
    nodes.filter((n) => {
      const f = DURATION_FIELD[String(n["kind"])];
      return f !== undefined && typeof n[f] === "number";
    }).length + spans;
  // ⚠️ ⭐ 先剝掉 `「…」` —— 那是**角色對白不是效果**（第〇·六守則細則②）。
  //    44-04「⋯在 35 秒後宣布勝利吧」就是被這一步擋下來的那一類。
  const prose = String(raw["description"] ?? "").replace(/「[^」]*」/gs, "");
  return {
    declaredDurationStages: (prose.match(/持續\s*[0-9.]+\s*秒/g) ?? []).length,
    durationNodes,
    segments,
    missingTiers: TIER_TAGS.filter((t) => raw[t] === undefined),
    slot: String(raw["slot"]),
    innateKind: (raw["innateKind"] as string | undefined) ?? null,
    passiveOnly: raw["passive"] !== undefined && (raw["effects"] as unknown[]).length === 0,
  };
}

/** 兩個身體、大血量、對立陣營 —— 治具的世界（⛔ 不造假的 effect 夾具）。 */
function arena(championId: string): { w: SimWorld; a: EntityId; b: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, 4242);
  const a = spawnChampion(w, {
    championId: championId as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: 0, z: 0 },
    zone: 0,
  });
  const b = spawnChampion(w, {
    championId: "godie-emns" as ChampionId,
    seatId: asSeatId(2),
    teamId: asTeamId(2),
    pos: { x: 2, z: 0 },
    zone: 0,
  });
  for (const id of [a, b]) {
    const h = w.health.get(id);
    if (h) {
      h.maxHp = 1e9;
      h.hp = 1e9;
    }
  }
  return { w, a, b };
}

const cast = (w: SimWorld, def: AbilityDef, caster: EntityId, targets: EntityId[]): void => {
  runEffects(def.effects as EffectDef[], {
    world: w,
    caster,
    rank: 0,
    targets,
    origin: `ability:${def.id}`,
    rng: w.rng,
  } as EffectContext);
};

/** ⭐ 一套治具：跑真的 sim，回「這一支落地了幾段傷害／幾個演出錨／幾次計分」。 */
function observe(
  w: SimWorld,
  id: string,
  scoreOf: () => number,
  ticks: number,
  killAt = -1,
  killTarget?: EntityId,
): { damage: number[]; cues: { index: number; finisher: boolean }[]; payouts: number[] } {
  const damage: number[] = [];
  const cues: { index: number; finisher: boolean }[] = [];
  const payouts: number[] = [];
  let last = scoreOf();
  for (let i = 0; i < ticks; i++) {
    if (i === killAt && killTarget !== undefined) {
      const h = w.health.get(killTarget);
      if (h) {
        h.hp = 0;
        h.alive = false;
      }
    }
    w.events.length = 0;
    const hb = w.health.get(2 as EntityId);
    if (hb) hb.hp = 1e9;
    w.step(new Map());
    for (const e of w.events) {
      const d = e.data as { origin?: string; index?: number; finisher?: boolean };
      if (d.origin !== `ability:${id}`) continue;
      if (e.type === "damage") damage.push(w.tick);
      if (e.type === "comboStrike") cues.push({ index: d.index ?? 0, finisher: d.finisher === true });
    }
    const now = scoreOf();
    if (now !== last) {
      payouts.push(w.tick);
      last = now;
    }
  }
  return { damage, cues, payouts };
}

const xpScore = (w: SimWorld, id: EntityId) => (): number => {
  const c = w.champion.get(id);
  return c ? c.level * 1e6 + c.xp : 0;
};

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(join(ROOT, "content"))).load()).store);
});

describe("GH#962 批 N4 —— 時序與持續（11 份，⭐ 一套治具）", () => {
  it("★★ ⭐ §1 判定表：11 份**逐份**有判定，每一份都指得到真的技能（⛔ 沒有一份是空白）", () => {
    expect(
      LEDGER.verdicts.length,
      "⛔ 批 N4 是 **11 份**（#962 Scope 的表）—— 數字變了代表分批被改過，\n" +
        "  ⭐ 去 #962 對一次再改這裡，⛔ 不要直接調數字。",
    ).toBe(11);
    const bad = LEDGER.verdicts
      .filter((v) => !VERDICTS.includes(v.verdict) || (v.reason ?? "").length < 20)
      .map((v) => `${v.id}: verdict=${v.verdict} reason=${(v.reason ?? "").length}字`);
    expect(
      bad,
      "⛔⛔ 判定必須是【通過／阻塞於#943／不通過】三選一**而且**寫得出理由 ——\n" +
        "  ⚠️ 一份沒有理由的判定，下一輪讀到時就是一句可以繞過去的散文。",
    ).toEqual([]);
    const dangling = LEDGER.verdicts.filter((v) => Abilities.tryGet(v.id as AbilityId) === undefined);
    expect(
      dangling.map((v) => v.id),
      "⛔⛔ 判定表指向**註冊表裡不存在**的技能 ⇒ ⭐ 那一份的驗收驗了空氣。",
    ).toEqual([]);
  });

  it("★★ ⭐⭐ §2 共同規則 #5【實際生效值】—— **兩個方向都動得到**（⛔ 票文的 30s 前提不成立）", () => {
    const cal = LEDGER.rule5Calibration;
    const tiers = cooldownTiersFromDoc(
      JSON.parse(readFileSync(join(ROOT, "content/config/cooldown-tiers.json"), "utf8")),
    );
    const raw = JSON.parse(
      readFileSync(join(ROOT, "content/abilities", `${cal.id}.json`), "utf8"),
    ) as Record<string, unknown>;
    const secOf = (d: Record<string, unknown>): number =>
      (resolveCooldownTier(d, tiers)["cooldown"] as number[])[0] ?? -1;

    // ⭐ 方向 A（已知**有**的量得到）：出貨那一份 —— 明填的 `cooldownShape` 永遠贏。
    expect((raw["cooldown"] as number[])[0], `⛔ ${cal.id} 的冷卻陣列變了`).toBe(cal.arraySec);
    expect(cooldownShapeOf(raw, tiers), `⛔ ${cal.id} 的 cooldownShape 不再是「${cal.withShapePin.shape}」`).toBe(
      cal.withShapePin.shape,
    );
    expect(
      secOf(raw),
      `⛔⛔ ${cal.id} 的**實際生效冷卻**變了。\n` +
        `  ⭐ 這一格就是共同規則 #5 說的「Editor 要顯示經 Main 限制器處理後的值」。\n` +
        `  ⚠️ 票文說它「極小·範圍 ⇒ 30s」—— ⛔ **那個前提不成立**：出貨文件明填\n` +
        `     cooldownShape:"${cal.withShapePin.shape}" ⇒ 解析成 ${cal.withShapePin.resolvedSec}s（＝陣列值，⛔ 沒有分岔）。`,
    ).toBe(cal.withShapePin.resolvedSec);

    // ⭐ 方向 B（已知**沒有**的量不到）：拿掉那一格 ⇒ 量尺**必須**跳到另一個答案。
    //    ⛔ 兩邊一樣 = 這把尺根本沒有在讀 `cooldownShape`（＝它在最需要說話時沉默）。
    const { cooldownShape: _pin, ...unpinned } = raw as Record<string, unknown> & { cooldownShape?: unknown };
    expect(cooldownShapeOf(unpinned, tiers), "⛔ 拿掉 pin 之後 autoShape 沒有改判 ⇒ 量尺是瞎的").toBe(
      cal.withoutShapePin.shape,
    );
    expect(
      secOf(unpinned),
      `⛔⛔ 拿掉 \`cooldownShape\` 之後**應該**變成 ${cal.withoutShapePin.resolvedSec}s ——\n` +
        `  ⭐ 這一條同時是一個**風險告示**：刪掉 ${cal.id} 的那一格 ⇒ 冷卻靜靜地\n` +
        `     ${cal.withShapePin.resolvedSec}s → ${cal.withoutShapePin.resolvedSec}s，而卡面／schema／註冊表沒有一處會紅\n` +
        `     （前科：09-04 龜派補一格純視覺鏡頭噪動 ⇒ 冷卻 60 → 120，見 cooldownTiers.ts 檔頭）。`,
    ).toBe(cal.withoutShapePin.resolvedSec);
  });

  it("★★ ⭐⭐ §3 承重：**多段技能每一段各自落地**（⛔ 不是一次結算冒充多段）", () => {
    const m = LEDGER.behaviour.multiSegment;
    // ⭐ 段數的來源是**共用節奏表**，⛔ 不是抄進技能文件的數字（第〇·四守則）。
    const families = (
      JSON.parse(readFileSync(join(ROOT, "content/config/combo-strikes.json"), "utf8")) as {
        families: { key: string; steps: number[] }[];
      }
    ).families;
    const fam = families.find((f) => f.key === m.family);
    expect(fam, `⛔ combo-strikes.json 裡找不到家族「${m.family}」⇒ ${m.id} 的段數沒有來源`).toBeDefined();
    const expected = (fam?.steps.length ?? 0) + 1;
    const srcHasSteps = "steps" in
      (JSON.parse(readFileSync(join(ROOT, "content/abilities", `${m.id}.json`), "utf8")) as object);
    expect(
      srcHasSteps,
      `⛔ ${m.id} 的技能文件自己長出了 \`steps\` ⇒ ⭐ 節奏有了第二個住處，而它必然過期。`,
    ).toBe(false);

    const { w, a, b } = arena("godie-hart");
    const def = Abilities.get(m.id as AbilityId);
    cast(w, def, a, [b]);
    const seen = observe(w, m.id, () => 0, 200);
    expect(
      { damage: seen.damage.length, cues: seen.cues.length },
      `⛔⛔ ${m.id}「連斬七次」—— ⭐ 段數要等於共用節奏表 ${m.family} 的 ${expected} 段\n` +
        `  （steps ${fam?.steps.length} ＋ 收尾 1），而且**每一段都要有自己的演出錨**（comboStrike）。\n` +
        `  ⚠️ 兩個數字一起掉 = 七發塞進同一 tick ⇒ 畫面上是**一下**，⛔ 不是連擊。`,
    ).toEqual({ damage: expected, cues: expected });
    expect(
      seen.cues.map((c) => c.index),
      `⛔ ${m.id} 的逐段編號要是 1…${expected} 的全序（\`{{i}}Hit\` 唯一的來源）`,
    ).toEqual(Array.from({ length: expected }, (_, i) => i + 1));
    expect(
      seen.cues.filter((c) => c.finisher).map((c) => c.index),
      `⛔⛔ **終結光柱要在最後才出現** —— finisher 只能是最後那一發（票文逐字要點）。`,
    ).toEqual([expected]);
    expect({ damageEvents: seen.damage.length, cues: seen.cues.length, finisher: 1 }).toEqual({
      damageEvents: m.damageEvents,
      cues: m.comboStrikeCues,
      finisher: m.finisherCues,
    });

    // ⭐⭐ 反方向：同一套治具跑一支**已知沒有多段**的技能 ⇒ 必須量到 0。
    const neg = LEDGER.behaviour.negativeControl;
    const nw = arena("godie-emns");
    const ndef = Abilities.get(neg.id as AbilityId);
    cast(nw.w, ndef, nw.a, [nw.b]);
    const nseen = observe(nw.w, neg.id, () => 0, 120);
    expect(
      { cues: nseen.cues.length, waves: nw.w.delayed.length },
      `⛔⛔ **量尺校準失敗**：${neg.id} 沒有任何多段節點，而治具量到了段數 ⇒\n` +
        `  ⭐ 這把尺會對「什麼都沒發生」說「七段都在」—— §3 的每一個綠燈作廢。`,
    ).toEqual({ cues: 0, waves: neg.delayedWaves });
  });

  it("★★ ⭐⭐ §4 承重：**週期次數精準**（絕對 tick ⇒ ⛔ 幀率不多發不漏發）＋ 死亡殘留是量出來的", () => {
    const p = LEDGER.behaviour.periodic;
    const def = Abilities.get(p.id as AbilityId);

    // ── ① 排程本身：⭐ **絕對 tick 且等距** ⇒ 錯過幾個 tick 也補得回來。
    const s0 = arena("godie-h02u");
    cast(s0.w, def, s0.a, [s0.a]);
    const wave = s0.w.delayed.find((x) => x.origin === `ability:${p.id}`);
    expect(wave, `⛔ ${p.id} 沒有排出任何延遲序列 ⇒ 「每秒 +75 經驗」一次都不會發生`).toBeDefined();
    const at = (wave?.strikes ?? []).map((s) => s.atTick);
    const gaps = at.slice(1).map((t, i) => t - at[i]!);
    expect(
      { n: at.length, gaps: [...new Set(gaps)] },
      `⛔⛔ ${p.id}「每秒 +75 經驗共 ${p.count} 次」的排程壞了。\n` +
        `  ⭐ 它必須是 **${p.count} 個絕對 tick、間隔一律 ${p.intervalTicks}**（＝1 秒）——\n` +
        `  ⚠️ 間隔不唯一 ⇒ 遞減計數器那一族的形狀（錯過一個 tick 就落後）；\n` +
        `     長度不是 ${p.count} ⇒ 多發或漏發。兩者玩家都看得見（經驗條）。\n` +
        `  量到 atTick = ${JSON.stringify(at)}`,
    ).toEqual({ n: p.count, gaps: [p.intervalTicks] });

    // ── ② 真的落地了幾次（⛔ 排程對不代表付得出去 —— 失敗形態⑧）。
    const s1 = arena("godie-h02u");
    cast(s1.w, def, s1.a, [s1.a]);
    const normal = observe(s1.w, p.id, xpScore(s1.w, s1.a), 300);
    expect(
      normal.payouts.length,
      `⛔⛔ ${p.id} 排程排了 ${p.count} 次而**實際只付了 ${normal.payouts.length} 次** ——\n` +
        `  ⭐ 「有 case」與「消費得到」是兩件事（失敗形態⑧）。`,
    ).toBe(p.payouts);

    // ── ③ ⭐ 死亡之後：票文逐字「⛔ 不得⋯死亡後殘留」。⚠️ **今天它會殘留**，
    //      而這一格把那個事實釘成棘輪：修好了（補 `stopOnCasterDeath: true`）⇒ 紅。
    const s2 = arena("godie-h02u");
    cast(s2.w, def, s2.a, [s2.a]);
    const dead = observe(s2.w, p.id, xpScore(s2.w, s2.a), 300, Math.floor(p.intervalTicks * 2 + 10), s2.a);
    expect(s2.w.health.get(s2.a)?.alive, "⛔ 治具沒有真的殺掉施法者 ⇒ 這一格量的不是死亡").toBe(false);
    expect(
      { payouts: dead.payouts.length, residue: dead.payouts.length === p.payouts },
      `⛔⛔ ${p.id} 的**死亡後殘留**狀態變了（判定表記的是 residue=${p.deathResidue}）。\n` +
        `  ⭐ 變成 false ＝ 有人補上了 \`delayed.stopOnCasterDeath: true\` ⇒ ⭐ 這是好事，\n` +
        `     去把 ggd-acceptance-n4.json 的 ${p.id} 判定從「不通過」改掉。\n` +
        `  ⛔ 變成 true 而判定表說 false ＝ 剛剛壞掉了。\n` +
        `  ⚠️ 為什麼重要：施法者陣亡之後還在領經驗，是玩家在計分板上看得見的東西。`,
    ).toEqual({ payouts: p.payoutsAfterCasterDeath, residue: p.deathResidue });

    // ── ④ ⭐⭐ 反方向：`swapResource` 沒有任何週期節點 ⇒ 同一套治具必須量到 **0 次**。
    const neg = LEDGER.behaviour.negativeControl;
    const nw = arena("godie-emns");
    const ha = nw.w.health.get(nw.a)!;
    const hb = nw.w.health.get(nw.b)!;
    ha.maxHp = 5000;
    ha.hp = 300;
    hb.maxHp = 5000;
    hb.hp = 1200;
    cast(nw.w, Abilities.get(neg.id as AbilityId), nw.a, [nw.b]);
    expect(
      { a: ha.hp, b: hb.hp, aMax: ha.maxHp, bMax: hb.maxHp },
      `⛔⛔ ${neg.id}「交換雙方**現存生命**」—— ⛔ 不是最大生命、⛔ 也不是造成傷害。`,
    ).toEqual({ a: 1200, b: 300, aMax: 5000, bMax: 5000 });
    expect(
      { payouts: observe(nw.w, neg.id, xpScore(nw.w, nw.a), 120).payouts.length, waves: nw.w.delayed.length },
      `⛔⛔ **量尺校準失敗**：${neg.id} 沒有週期節點，而治具量到了次數 ⇒ §4 的綠燈作廢。`,
    ).toEqual({ payouts: neg.payouts, waves: neg.delayedWaves });
  });

  it("★★ ⭐⭐ §5 逐份重量：**兩段持續⛔ 不可混成一次** ＋ 共同規則 #4（缺標籤 ⇒ 阻塞，⛔ 不是通過）", () => {
    const drift: string[] = [];
    const merged: string[] = [];
    for (const row of LEDGER.verdicts) {
      const now = profile(Abilities.get(row.id as AbilityId));
      if (JSON.stringify(now) !== JSON.stringify(row.measured)) {
        drift.push(`  · ${row.id}\n      判定表 ${JSON.stringify(row.measured)}\n      量到的 ${JSON.stringify(now)}`);
      }
      // ⭐ 承重：卡面**宣告**幾段持續，JSON 就要有幾個帶持續的節點。
      //    ⛔ 「持續 5 秒⋯之後⋯持續 5 秒」配一個 5 秒節點 ＝ 兩段被混成一次。
      if (now.declaredDurationStages > now.durationNodes && row.verdict !== "不通過") {
        merged.push(`  · ${row.id}：卡面宣告 ${now.declaredDurationStages} 段、JSON 只有 ${now.durationNodes} 段，而判定是「${row.verdict}」`);
      }
    }
    expect(
      merged,
      "⛔⛔ **兩段持續被混成一次，而判定沒有說**（本批的核心軸）——\n" +
        "  ⭐ 卡面宣告 N 段持續就要有 N 個帶持續的節點；少了就是一句\n" +
        "     「說了但不會發生」的字（第一·五守則）。⇒ 把判定改成「不通過」並寫下缺哪一段。\n" +
        "  ⚠️ 宣告數是**剝掉「…」對白之後**數的（角色台詞⛔ 不是效果）。",
    ).toEqual([]);
    expect(
      drift.length === 0 ? [] : ["\n" + drift.join("\n")],
      "⛔⛔ **判定表與出貨內容漂了**（棘輪：任一側動了都要紅）——\n" +
        "  ⭐ `missingTiers` 變短 ⇒ #943 補了級距標籤：去把那一份的「阻塞於#943」改掉；\n" +
        "  ⭐ `missingTiers` 變長 / `segments` 變了 / `durationNodes` 變了 ⇒ 內容動了：\n" +
        "     先確認那是刻意的，再更新 `docs/editor-contract/ggd-acceptance-n4.json`。\n" +
        "  ⛔ **不要為了讓它綠而放寬** —— 這一格記的就是「今天真正的現況」。",
    ).toEqual([]);
    // ⭐ 共同規則 #4：一份還缺級距標籤的技能，判定⛔ 不可以是「通過」。
    const falsePass = LEDGER.verdicts
      .filter((v) => v.verdict === "通過" && v.measured.missingTiers.length > 0)
      .map((v) => `${v.id}（缺 ${v.measured.missingTiers.join("/")}）`);
    expect(
      falsePass,
      "⛔⛔ 共同規則 #4：**標籤不存在時判定為「阻塞於 #943」，⛔ 不是通過** ——\n" +
        "  ⚠️ 否則「沒有欄位可驗」會被讀成「驗過了」。",
    ).toEqual([]);
  });
});

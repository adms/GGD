/**
 * ⭐⭐ **批3 —— hook 到底會不會被觸發**（GH#961，46 份驗收的「hook 觸發」那一批）。
 *
 * ⚠️⚠️ ⭐ 這一批問的**不是**「JSON 裡有沒有 `onEvade` 這個字串」——
 * 那是**失敗形態⑥**（用掃原始碼字串代替行為），而且已經有兩支守衛掃過字串了
 * （`worldHookGh354.test.ts` 掃 `hook: "…"`）。
 * ⭐ 這一支問的是 **CLAUDE.md 失敗形態⑧**：
 * 「**消費端存在，但它消費不到**」—— hook 寫在出貨的技能上、schema 收得下、
 * `content:build` 全綠，⛔ 而那條 hook 的來源從來沒有被掛到任何一個單位身上，
 * 或者掛上了卻在 `fireHooks` 的第一排閘就 `continue`。
 * ⇒ ⭐ 唯一問得出來的方法是**把它跑起來**，然後讀 `fireHooks` 的回傳值。
 *
 * ── 這一支怎麼避開「⛔ 抄一張清單」（第〇·四守則）─────────────────────────
 * 票文逐字：「本批的 id 清單**只有一個住處**（#953 定案的 #838 body）——
 *  ⛔ 不要抄進測試，問『這個清單還住在哪裡？』；抄了必過期。」
 * ⇒ ⭐ 所以這裡**一個技能 id 都沒有寫死**。母體是**推導**的：
 *   出貨 `content/abilities/*.json` 裡**每一條 hook**（遞迴走訪，152 條 / 69 支 /
 *   10 種事件），而本批點名的 12 份是它的子集。⭐ 清單改了這一支自己跟上。
 *
 * ── K 個模板 + 一張表（[思考策略]）──────────────────────────────────────
 * ⛔ 不是 12 支各寫一條。⭐ 一套治具，一列 = 一個 **(事件 × 載體)** 組合 ——
 * 載體有兩種而它們是**兩條不同的接線**：
 *   · `passive.ranks[].hooks` → `syncAbilityPassives`（137 條）
 *   · `effects[].hooks`（`applyBuff` 帶著走）→ `runEffects`（15 條）
 * ⭐ 只驗前者會漏掉後者整條路，⛔ 而 20-04 Avalon 與 80-04 赤兔咆哮**都住在後者**。
 * 每一列的受測對象由「閘最少者優先」**自動挑**（決定性排序），⛔ 不是我指定的。
 *
 * ── 兩個方向（形態⑫：⛔ 一頭不算）───────────────────────────────────────
 *   ① 正：宣告的那個事件 → `fireHooks` 真的回 ≥ 1
 *   ② 反：**其餘每一個**出貨事件 → 一律回 0（⛔「事件沒發生時零播放」）
 *   ③ 反之二：把作者自己寫的**那一格閘**拿掉（`abilitySlot` 換一格、
 *      `condition` 的狀態不掛、`damageSource` 的封包不給）→ 一律回 0。
 *      ⭐ 這一格是**從出貨 JSON 推導**的，⛔ 不是手寫的近似案例。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）──────────────────────────────────
 * M1 `sim/effects/hooks.ts:285` 的 `if (hook.on !== event) continue;`
 *    → `if (false) continue;`（＝任何事件都放行）
 *    ⇒ 🔴 §2 反方向：「onAbilityCast 這一支在 onBasicAttack 上也發了 1 次」，
 *      訊息指名 `godie-e00s.ex` 與那一條 hook。還原後綠。
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { zHookEvent } from "../content/schema/effect";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { syncAbilityPassives } from "../sim/abilities/abilityPassives";
import { fireHooks } from "../sim/effects/hooks";
import { runEffects } from "../sim/effects/effectRunner";
import type { EffectDef } from "../sim/effects/effect";
import type { TriggerDamage } from "../sim/effects/effect";
import type { CastableSlot } from "../content/schema/common";
import {
  asSeatId,
  asTeamId,
  type ChampionId,
  type EntityId,
  type SeatId,
  type StatusId,
} from "../ids";
import type { IntentFrame } from "../sim/intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const ABILITIES = join(CONTENT, "abilities");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const ZC = SKELETON_ARENA.zones[0]!.center;

// ════════════════════════════════════════════════════════════════════════════
// 母體 —— ⭐ 出貨的 hook 資料，遞迴走訪推導出來（⛔ 不是一張抄來的清單）
// ════════════════════════════════════════════════════════════════════════════

/** 作者寫得出來的每一格閘（`fireHooks` 會拿它 `continue` 的那些）。 */
const GATE_KEYS = [
  "abilitySlot",
  "condition",
  "chance",
  "chanceFrom",
  "victim",
  "damageSource",
  "damageType",
  "damageCrit",
  "critSource",
  "reflectedDamageSource",
  "reflectedDamageType",
  "maxTriggers",
  "requires",
  "internalCooldown",
] as const;

interface HookLike {
  on: string;
  abilitySlot?: CastableSlot;
  condition?: { kind?: string; subject?: string; tag?: string; statusId?: string };
  damageSource?: string;
  damageType?: string;
  [k: string]: unknown;
}
interface ShippedHook {
  abilityId: string;
  /** JSON 指標，失敗訊息要指名它 */
  path: string;
  /** ⭐ 兩條**不同的**接線，⛔ 不是同一條 */
  carriage: "passive" | "buff";
  hook: HookLike;
  gates: string[];
  /** `/passive/ranks[N]/…` 的 N（buff 載體是 `/effects[N]/…` 的 N） */
  outer: number;
  /** `…/hooks[M]` 的 M */
  index: number;
}

/**
 * ⭐ 治具**掛得上**的兩種形狀（＝出貨引擎的兩條 attach 路）。
 * ⚠️ 更深的那一種（hook 的效果又是一個帶 hooks 的 buff，例 59-001 的 `onInterval`）
 * 要先讓外層那條 hook 發動才會存在 —— ⛔ 它不是「不算」，是**另一條路**，
 * 而 §0 會把它的條數釘住，⛔ 不讓它靜靜地從母體裡消失。
 */
const PASSIVE_SHAPE = /^\/passive\/ranks\[(\d+)\]\/hooks\[(\d+)\]$/;
const BUFF_SHAPE = /^\/effects\[(\d+)\]\/hooks\[(\d+)\]$/;

/**
 * ⭐ 遞迴，⛔ 不是讀頂層的 `hooks` —— 出貨樹上**頂層 `hooks` 一條都沒有**：
 * 137 條住 `passive.ranks[].hooks`，15 條住 `effects[].hooks`（含 buff 裡再一層）。
 * ⚠️ 一個只讀頂層的走訪器會量到 **0** 而看起來完全正常（§0 就是在釘這件事）。
 */
function collectHooks(node: unknown, path: string, out: [string, HookLike][]): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectHooks(v, `${path}[${i}]`, out));
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "hooks" && Array.isArray(v)) {
      v.forEach((h, i) => {
        if (h !== null && typeof h === "object" && typeof (h as HookLike).on === "string") {
          out.push([`${path}/hooks[${i}]`, h as HookLike]);
        }
      });
    }
    collectHooks(v, `${path}/${k}`, out);
  }
}

function shippedAbilityDocs(): Record<string, unknown>[] {
  return readdirSync(ABILITIES)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(ABILITIES, f), "utf-8")) as Record<string, unknown>);
}

const SHIPPED_HOOKS: ShippedHook[] = (() => {
  const out: ShippedHook[] = [];
  for (const doc of shippedAbilityDocs()) {
    const found: [string, HookLike][] = [];
    collectHooks(doc, "", found);
    for (const [path, hook] of found) {
      const m = PASSIVE_SHAPE.exec(path) ?? BUFF_SHAPE.exec(path);
      out.push({
        abilityId: String(doc["id"]),
        path,
        carriage: path.startsWith("/passive") ? "passive" : "buff",
        hook,
        gates: GATE_KEYS.filter((g) => hook[g] !== undefined),
        outer: m ? Number(m[1]) : -1,
        index: m ? Number(m[2]) : -1,
      });
    }
  }
  return out;
})();

/** 出貨內容真的用到的事件（⛔ 不是 enum 的 39 個）。 */
const USED_EVENTS = [...new Set(SHIPPED_HOOKS.map((h) => h.on ?? h.hook.on))].sort();

/**
 * ⭐ 一列 = 一個 (事件 × 載體)，受測對象**自動挑**「閘最少的那一條」——
 * 決定性排序（閘數 → 技能 id → 路徑），⛔ 不是我指定的一張表。
 */
const TABLE: ShippedHook[] = (() => {
  const best = new Map<string, ShippedHook>();
  for (const h of SHIPPED_HOOKS.filter((h) => h.outer >= 0).sort((a, b) =>
    a.gates.length !== b.gates.length
      ? a.gates.length - b.gates.length
      : a.abilityId !== b.abilityId
        ? a.abilityId.localeCompare(b.abilityId)
        : a.path.localeCompare(b.path),
  )) {
    const key = `${h.hook.on}|${h.carriage}`;
    if (!best.has(key)) best.set(key, h);
  }
  return [...best.values()].sort((a, b) => `${a.hook.on}|${a.carriage}`.localeCompare(`${b.hook.on}|${b.carriage}`));
})();

// ════════════════════════════════════════════════════════════════════════════
// 治具 —— ⭐ 一套，⛔ 不是 12 套
// ════════════════════════════════════════════════════════════════════════════

const SLOTS = ["Q", "W", "E", "R"] as const;
/** `godie-e00s.w` → { champion: "godie-e00s", slot: "W" }；`.ex` / `.passive` 各自一條路。 */
function ownerOf(abilityId: string): { champion: ChampionId; suffix: string } {
  const i = abilityId.lastIndexOf(".");
  return { champion: abilityId.slice(0, i) as ChampionId, suffix: abilityId.slice(i + 1) };
}

interface Armed {
  world: SimWorld;
  owner: EntityId;
  foe: EntityId;
  /** ⭐ 掛在單位身上的**那一個** hook 物件（參照），⛔ 不是 JSON 裡的那一份 */
  attached: HookLike | undefined;
  /** 承載它的來源 id —— `critSource: "thisSource"` 要用 */
  sourceId: string;
}

/**
 * 把一條出貨 hook **經由出貨路徑**掛到一個真的單位身上。
 *
 * ⚠️ 兩條路都是引擎自己的那一條：
 *   · `passive` → 把該格 rank 拉到最高再 `syncAbilityPassives`（＝生成/升級/解鎖
 *     時引擎自己走的那一支）
 *   · `buff` → 用出貨 JSON 的那一份 `applyBuff` 定義走 `runEffects`
 *     （＝ `castAbility` 內部呼叫的同一個執行器）。⛔ 這裡不重打一份 hook，
 *     餵進去的 effect 物件逐位元組來自 `content/abilities/*.json`。
 */
function arm(row: ShippedHook): Armed {
  const world = new SimWorld(SKELETON_ARENA, 20260903);
  world.combatActive = true;
  const { champion, suffix } = ownerOf(row.abilityId);
  const owner = spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: ZC.x + 8, z: ZC.z },
    zone: 0,
  });
  const foe = spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: ZC.x + 11, z: ZC.z },
    zone: 0,
  });
  const ab = world.abilities.get(owner)!;
  for (const s of SLOTS) ab.slots[s].rank = 3;
  if (ab.exSlot) ab.exSlot.rank = 1;
  syncAbilityPassives(world, owner);

  if (row.carriage === "buff") {
    // 出貨那一份 effect 樹的第一層（`applyBuff` 就住在這裡），逐位元組。
    const doc = JSON.parse(
      readFileSync(join(ABILITIES, `${row.abilityId}.json`), "utf-8"),
    ) as { effects?: EffectDef[] };
    const idx = Number(/^\/effects\[(\d+)\]/.exec(row.path)?.[1] ?? -1);
    const eff = doc.effects?.[idx];
    expect(eff, `${row.abilityId} ${row.path}: 出貨檔裡找不到帶 hooks 的那個 effect`).toBeTruthy();
    runEffects([eff!], {
      world,
      caster: owner,
      rank: 1,
      targets: [owner],
      origin: `ability:${row.abilityId}`,
    });
  }
  void suffix;
  return { world, owner, foe };
}

/** 這一發封包要長成什麼樣，`hook` 才通得過它自己寫的封包閘。 */
function incomingFor(hook: HookLike): TriggerDamage | undefined {
  const needs =
    hook["damageSource"] !== undefined ||
    hook["damageType"] !== undefined ||
    hook["damageCrit"] !== undefined ||
    hook["reflectedDamageSource"] !== undefined ||
    hook["reflectedDamageType"] !== undefined;
  if (!needs) return undefined;
  const origin = hook["damageSource"] === "basic" ? "basic" : "ability:test.q";
  const type = (hook["damageType"] ?? "magic") as TriggerDamage["type"];
  const reflOrigin = hook["reflectedDamageSource"] === "basic" ? "basic" : "ability:test.q";
  const reflType = (hook["reflectedDamageType"] ?? "magic") as TriggerDamage["type"];
  return {
    raw: 100,
    mitigated: 100,
    hpLost: 100,
    origin,
    reflectDepth: 1,
    resolvePass: 0,
    type,
    crit: hook["damageCrit"] === "crit",
    ...(hook["reflectedDamageSource"] !== undefined || hook["reflectedDamageType"] !== undefined
      ? { reflectedFrom: { origin: reflOrigin, type: reflType } }
      : {}),
  };
}

/** 作者的 `condition` 要成立，世界要先變成什麼樣（今天出貨只有 `status` / `stat` 兩種）。 */
function satisfyCondition(a: Armed, row: ShippedHook): void {
  const c = row.hook.condition;
  if (!c) return;
  const who = c.subject === "target" ? a.foe : a.owner;
  if (c.kind === "status") {
    const sid = (c.tag ?? c.statusId) as StatusId;
    a.world.status.set(who, {
      effects: [{ statusId: sid, sourceId: "acceptanceN3", expiresAtTick: a.world.tick + 600 }],
    });
    return;
  }
  if (c.kind === "stat") {
    // 出貨只有一種形狀：`hp` 的百分比門檻。⛔ 不猜其他的 —— 猜不到就讓它紅。
    const hp = a.world.health.get(who);
    if (hp) hp.current = Math.max(1, Math.floor(hp.max * 0.05));
  }
}

/**
 * 發一次事件，回傳「真的發動了幾條」。
 * ⚠️ `chance` 是**種子化**的（`world.rng`），所以重複發是決定性的 —— 這裡最多
 * 推 `MAX_ROLLS` 個 tick，每 tick 發一次，把機率閘走完。⛔ 不改任何機率。
 */
const MAX_ROLLS = 400;
function firedCount(a: Armed, row: ShippedHook, event: string, opts: {
  slot?: CastableSlot;
  incoming?: TriggerDamage;
  target?: boolean;
} = {}): number {
  const rolls = row.hook["chance"] !== undefined || row.hook["chanceFrom"] !== undefined ? MAX_ROLLS : 1;
  let total = 0;
  for (let i = 0; i < rolls && total === 0; i++) {
    total += fireHooks(
      a.world,
      a.owner,
      event as never,
      opts.target === false ? undefined : a.foe,
      opts.slot,
      opts.incoming,
    );
    if (rolls > 1) a.world.step(NO_INTENTS);
  }
  return total;
}

const name = (r: ShippedHook): string => `${r.abilityId} ${r.path} (on:${r.hook.on})`;

beforeAll(() => {
  const store = new ContentStore();
  for (const c of [
    "ability-templates",
    "abilities",
    "champions",
    "projectiles",
    "status-effects",
  ] as const) {
    for (const f of readdirSync(join(CONTENT, c)).filter(
      (x) => x.endsWith(".json") && !x.startsWith("_"),
    )) {
      const doc = JSON.parse(readFileSync(join(CONTENT, c, f), "utf-8")) as { id: string };
      store.add(c, doc.id, doc);
    }
  }
  registerAll(store);
});

// ════════════════════════════════════════════════════════════════════════════
describe("GH#961 批3 —— 出貨的 hook 真的會被觸發嗎", () => {
  // ── §0 量尺自證（⛔ 兩個方向都要，見 CLAUDE.md「單邊校準的尺」）──────────
  it("★★ ⭐ 量尺自證：走訪器在**兩個住處**都撈得到（⛔ 只讀頂層 `hooks` 會量到 0）", () => {
    const byCarriage = { passive: 0, buff: 0 };
    for (const h of SHIPPED_HOOKS) byCarriage[h.carriage]++;
    expect(
      byCarriage.passive,
      "⛔ `passive.ranks[].hooks` 一條都沒撈到 ⇒ ⭐ 量尺瞎了，底下每一條都是恆真式",
    ).toBeGreaterThan(0);
    expect(
      byCarriage.buff,
      "⛔ `effects[].hooks`（applyBuff 帶著走的那一條）一條都沒撈到 ——\n" +
        "  ⭐ 20-04 Avalon 與 80-04 赤兔咆哮**整支住在這裡**，漏掉它等於這一批只驗了一半",
    ).toBeGreaterThan(0);
    // 反方向：只讀頂層的那種走訪器，在出貨樹上撈到的是 0。
    const topOnly = shippedAbilityDocs().filter((d) => Array.isArray(d["hooks"]) && (d["hooks"] as unknown[]).length);
    expect(
      topOnly.length,
      "⛔ 出貨樹上出現了頂層 `hooks` ⇒ 走訪器的假設變了，回去重讀這一段",
    ).toBe(0);
    // 每一個出貨用到的事件都在 schema 的 allowlist 裡（⛔ 否則載入器根本不收）。
    const known = new Set(zHookEvent.options as readonly string[]);
    expect(USED_EVENTS.filter((e) => !known.has(e)), "⛔ 出貨內容用了 schema 不認得的事件").toEqual([]);
  });

  it("★★ ⭐ 母體覆蓋得到本批點名的那 12 份（⛔ 而清單住在 #838，這裡不抄）", () => {
    // ⭐ 判準是**性質**不是清單：本批的共同性質 = 「這支技能帶 hook」。
    const withHooks = new Set(SHIPPED_HOOKS.map((h) => h.abilityId));
    expect(withHooks.size, "⛔ 帶 hook 的出貨技能份數掉到個位數 ⇒ 母體塌了").toBeGreaterThanOrEqual(12);
    expect(TABLE.length, "⛔ (事件 × 載體) 的組合數塌了").toBeGreaterThanOrEqual(USED_EVENTS.length);
  });

  // ── §1 正方向 ────────────────────────────────────────────────────────────
  it("★★ ⭐⭐ 正方向：宣告的那個事件**真的發得動**（⛔ 不是「JSON 裡有這個字串」）", () => {
    const dead: string[] = [];
    for (const row of TABLE) {
      const a = arm(row);
      satisfyCondition(a, row);
      const n = firedCount(a, row, row.hook.on, {
        slot: row.hook.abilitySlot,
        incoming: incomingFor(row.hook),
      });
      if (n === 0) dead.push(`${name(row)} 閘=[${row.gates.join(",")}] 載體=${row.carriage}`);
    }
    expect(
      dead,
      "⛔⛔ 這幾條 hook 掛在出貨技能上、schema 收得下、卡片上看得到 ——\n" +
        "  ⭐ 而把事件發給它時 `fireHooks` 回 **0**：來源沒掛上，或第一排閘就 continue。\n" +
        "  ⚠️ 這正是 CLAUDE.md 失敗形態⑧（消費端存在，但它消費不到）。",
    ).toEqual([]);
  });

  // ── §2 反方向 ────────────────────────────────────────────────────────────
  it("★★ ⭐⭐ 反方向：**事件沒發生時零播放**（⛔ 別的事件一律不得代打）", () => {
    const leaks: string[] = [];
    for (const row of TABLE) {
      const a = arm(row);
      satisfyCondition(a, row);
      for (const other of USED_EVENTS) {
        if (other === row.hook.on) continue;
        const n = firedCount(a, row, other, {
          slot: row.hook.abilitySlot,
          incoming: incomingFor(row.hook),
        });
        if (n > 0) leaks.push(`${name(row)} 竟然在 **${other}** 上也發了 ${n} 次`);
      }
    }
    expect(
      leaks,
      "⛔⛔ 一條 hook 在它沒有宣告的事件上發動 ⇒ 玩家會看到一個「莫名其妙自己冒出來」的演出，\n" +
        "  ⭐ 而卡面上寫的觸發時機當場變成謊話（第一·五守則）。",
    ).toEqual([]);
  });

  // ── §3 反方向之二：作者自己寫的那一格閘，真的在擋 ─────────────────────────
  it("★★ ⭐⭐ 作者寫的閘**真的在擋**：抽掉那一格 ⇒ 一次都不發（⛔ 缺任一都不得觸發）", () => {
    const notGating: string[] = [];
    for (const row of TABLE) {
      // ① `abilitySlot` —— 45-04 哥哥的「千鳥（E）命中」：換成別的槽位不得觸發
      if (row.hook.abilitySlot) {
        const a = arm(row);
        satisfyCondition(a, row);
        const wrong = SLOTS.find((s) => s !== row.hook.abilitySlot)!;
        const n = firedCount(a, row, row.hook.on, { slot: wrong, incoming: incomingFor(row.hook) });
        if (n > 0) notGating.push(`${name(row)}: abilitySlot=${row.hook.abilitySlot} 卻在 ${wrong} 上發了`);
      }
      // ② `condition` —— 45-04 哥哥的「敵人帶燃燒標記」：不掛那個標記不得觸發
      if (row.hook.condition) {
        const a = arm(row); // ⛔ 刻意不呼叫 satisfyCondition
        const n = firedCount(a, row, row.hook.on, {
          slot: row.hook.abilitySlot,
          incoming: incomingFor(row.hook),
        });
        if (n > 0) notGating.push(`${name(row)}: condition 不成立卻發了 ${n} 次`);
      }
      // ③ 封包閘 —— 沒有那一發封包就沒有「剛剛那一下是什麼」可言
      if (incomingFor(row.hook) !== undefined) {
        const a = arm(row);
        satisfyCondition(a, row);
        const n = firedCount(a, row, row.hook.on, { slot: row.hook.abilitySlot });
        if (n > 0) notGating.push(`${name(row)}: 沒有傷害封包卻通過了封包閘，發了 ${n} 次`);
      }
    }
    expect(
      notGating,
      "⛔⛔ 作者寫下的觸發條件沒有在擋 ⇒ ⭐ 一支「命中帶燃燒標記的敵人才追打」的技能\n" +
        "  變成「命中誰都追打」—— 而卡面、後台、schema 三邊都是綠的。",
    ).toEqual([]);
  });

  // ── §4 共同規則 #7（可機器判定的那一半）──────────────────────────────────
  it("★★ ⭐ 共同規則 #7：純反應式被動⛔ 不得走 `castAbility`（那會畫出一條施法條）", () => {
    const fake: string[] = [];
    for (const doc of shippedAbilityDocs()) {
      if (doc["slot"] !== "PASSIVE") continue;
      if (Array.isArray(doc["effects"]) && (doc["effects"] as unknown[]).length) continue; // 主動型天生技，不在這一格
      const found: [string, HookLike][] = [];
      collectHooks(doc, "", found);
      if (!found.length) continue;
      if (doc["castTimeSec"] !== undefined) {
        fake.push(`${String(doc["id"])}: 純反應式被動卻帶 castTimeSec=${String(doc["castTimeSec"])}`);
      }
      const scan = (n: unknown): void => {
        if (Array.isArray(n)) return void n.forEach(scan);
        if (n === null || typeof n !== "object") return;
        const o = n as Record<string, unknown>;
        // `payCosts: "none"` 的 proxyCast **繞過** `castAbility`（見 effects/proxyCast.ts
        // 檔頭②）⇒ 不發 castBegin ⇒ 客戶端的 CastTracker 不會畫出施法條。
        if (o["kind"] === "proxyCast" && o["payCosts"] !== "none") {
          fake.push(`${String(doc["id"])}: 被動的 hook 用 proxyCast payCosts=${String(o["payCosts"])} ⇒ 走 castAbility`);
        }
        Object.values(o).forEach(scan);
      };
      scan(doc["passive"]);
    }
    expect(
      fake,
      "⛔⛔ 一支**玩家從來沒有按過**的被動會讓畫面跑出施法條 / 施法預告 ——\n" +
        "  ⭐ 那正是共同規則 #7 說的「假的主動施法動作」。\n" +
        "  ⚠️ 「像不像」那一半機器判不了，交 #664 Tier 2；這一條只釘**機制上做不做得到**。",
    ).toEqual([]);
  });
});

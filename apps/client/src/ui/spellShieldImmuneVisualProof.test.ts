// @vitest-environment jsdom
/**
 * 💬 **@visual-proof** —— GH#1085 / GH#1091：法術護盾擋下那一發，
 * 玩家**畫面上真的出現「免疫」兩個字**。
 *
 * ⛔ 這一支的存在理由：#1085 收工時只說得出「鏈路已接上，⛔ 未驗收」——
 * sim 發了 `immune`、`RoomConnection` 有 `recordEvade`、`WorldAnchorLayer` 有一段
 * 迴圈，⭐ 而**沒有任何東西量過那條路的終端**。CLAUDE.md 的天譴判例逐字說過：
 * 「鏈路接上了不算做完」。
 *
 * ⭐ 每一段都是**出貨的那一個**（⛔ 沒有一段是台子造的資料，失敗形態⑤）：
 *   ① 出貨內容（`content/` 全樹）＋ 真的 `SimWorld` ＋ 真的 `castAbility`
 *      ⇒ 07-01 的護盾擋下一發從註冊表挑出來的敵方指定目標法術
 *   ② 真的 `immune` 事件（`e.data` 原封不動餵進去，⛔ 不是手打的 payload）
 *   ③ 出貨的 `recordEvade(data, "immune")`（`net/RoomConnection.ts:402` 那一行的同一支）
 *   ④ 出貨的 `GameApp.prototype.updateFrameBus`（把 `combatText` 投影成 `pose`）
 *   ⑤ 出貨的 `<WorldAnchorLayer/>`（`EVADE_LABELS.immune = "免疫"` 那張表在裡面）
 *   ⑥ **DOM**：節點上真的有那兩個字，而且它看得見
 *
 * ⭐ 量尺**兩個方向都跑**（一把只驗單邊的尺不算自證過，CLAUDE.md 第一守則）：
 *   · 護盾在  ⇒ sim 發得出 `immune` ⇒ 畫面上**有**一顆看得見的「免疫」
 *   · 護盾不在 ⇒ sim **一則都沒發** ⇒ 同一段流程跑完，畫面上**沒有**那兩個字
 *
 * ⚠️ **誠實的界線**：jsdom ⛔ 不 raster ⇒ 這一條證明的是「**墨水存在而且沒有被
 * 關掉**」（字在節點上 · display 不是 none · opacity>0 · 字級>0 · 顏色不是透明 ·
 * 座標投影得出來）—— 那正是這一族零像素缺陷的**每一個靜態可判成因**。
 * ⛔ 它不證明字體渲染、遮擋、品質階梯下的觀感。
 *
 * 突變紀錄：`ui/WorldAnchorLayer.tsx` 的 `EVADE_LABELS` 改成 `{}`
 * ⇒ 紅（節點上變成預設字「閃避」，找不到「免疫」）。用 Edit 改回來。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { registerAll } from "@ggd/shared/content/registries";
import { Abilities, Champions, Statuses } from "@ggd/shared/sim/content/registry";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { castAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "@ggd/shared/ids";
import { frameBus } from "../frameBus";
import { hudStore } from "../net/RoomStore";
import { clearEvadeSightings, recordEvade } from "../net/RoomConnection";
import { WorldAnchorLayer } from "./WorldAnchorLayer";
import { GameApp } from "../GameApp";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const USHIO = "godie-hpb1" as ChampionId;
const NO_INTENTS = new Map();
const SLOTS = ["Q", "W", "E", "R"] as const;
type Slot = (typeof SLOTS)[number];

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** rAF 手動步進 ＋ 可控時鐘（浮字有淡入，`performance.now()` 不動就永遠 alpha 0）。 */
let pending: FrameRequestCallback | null = null;
let clock = 1000;
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => ((pending = cb), 1)) as never;
globalThis.cancelAnimationFrame = (() => (pending = null)) as never;
performance.now = () => clock;
const frame = (advanceMs = 120): void => {
  clock += advanceMs;
  const cb = pending;
  pending = null;
  act(() => cb?.(clock));
};

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

/** 出貨裡挑一支敵方「指定目標＋帶 debuff 狀態」的技能（⛔ 不記 id）。 */
function hostileSpell(): { champion: ChampionId; slot: Slot; abilityId: AbilityId } {
  for (const a of Abilities.all()) {
    if (a.castType !== "targeted") continue;
    if (a.effects.some((e) => e.condition !== undefined)) continue;
    if (!a.effects.some((e) => e.kind === "applyStatus" && e.applyTo !== "self"
      && (Statuses.tryGet(e.statusId)?.tags ?? []).includes("debuff"))) continue;
    const champion = a.id.slice(0, a.id.lastIndexOf(".")) as ChampionId;
    const def = Champions.tryGet(champion);
    const slot = def === undefined ? undefined : SLOTS.find((s) => def.abilities[s].id === a.id);
    if (slot !== undefined) return { champion, slot, abilityId: a.id };
  }
  throw new Error("⛔ 出貨裡挑不到敵方「指定目標＋debuff」的技能 —— 夾具前提消失了");
}

/** 真的跑一場：護盾在／不在，各回這一發打出來的 `immune` payload。 */
function simImmunePayloads(withShield: boolean): Record<string, unknown>[] {
  const spell = hostileSpell();
  const world = new SimWorld(SKELETON_ARENA, 1085);
  world.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;
  const hero = spawnChampion(world, { championId: USHIO, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: c.x, z: c.z }, zone: 0 });
  const foe = spawnChampion(world, { championId: spell.champion, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: c.x + 2, z: c.z }, zone: 0 });
  world.abilities.get(foe)!.slots[spell.slot].rank = 1;
  world.step(NO_INTENTS);
  const shieldUp = (): boolean => world.stats.get(hero)!.sources.some((s) => s.statusId === "spell-shield");
  if (withShield) {
    world.health.get(hero)!.mana = 9999;
    expect(castAbility(world, hero, "Q", { type: "self" })).toBe("ok");
    for (let i = 0; i < 30 && !shieldUp(); i++) world.step(NO_INTENTS);
    expect(shieldUp(), "⛔ 放了 Q 沒有掛上護盾 —— 夾具壞了").toBe(true);
  }
  world.health.get(foe)!.mana = 9999;
  expect(castAbility(world, foe, spell.slot, { type: "entity", entityId: hero })).toBe("ok");
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < 150; i++) {
    world.step(NO_INTENTS);
    for (const e of world.events) if (e.type === "immune" && e.data["target"] === hero) out.push(e.data);
  }
  return out;
}

let root: Root | null = null;
beforeEach(() => {
  clearEvadeSightings();
  frameBus.combatText.forEach((e) => { e.active = false; });
  // 出貨場地的區塊（`anchorDrawable` 的閘讀它）＋ 一台相機。
  frameBus.arenaZones = SKELETON_ARENA.zones.map((z) => ({ x: z.center.x, z: z.center.z, r: z.boundaryRadius }));
  frameBus.project = (x, y, z) => ({ sx: 640 + x * 8, sy: 360 - y * 8 - z, visible: true });
  hudStore.setState({ seats: [], localEntityId: null, localSeatId: null, mobBossLive: [] });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  frameBus.project = null;
  frameBus.arenaZones = null;
});

/** 掛出貨的 HUD 層 → 灌那幾則 payload → 跑兩幀（出貨的投影夾在中間）。 */
function paint(payloads: Record<string, unknown>[]): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(WorldAnchorLayer)));
  for (const d of payloads) recordEvade(d, "immune");
  frame(0); // ① WorldAnchorLayer 汲取 sighting → pushEvadeText（pose 還沒投影）
  (GameApp.prototype as unknown as { updateFrameBus: (s: unknown, n: number) => void })
    .updateFrameBus.call(
      { views: { posOf: () => null, isOccluded: () => false }, visibleZones: { has: () => true },
        teamBySeat: new Map(), fbNameBySeat: new Map(), fbChampBySeat: new Map(), fbSeen: new Set(),
        casts: { progressFor: () => null }, mobBarCfg: {}, predictedEntityId: null },
      { entities: new Map() },
      clock,
    ); // ② 出貨的投影：worldX/Z → pose
  frame(120); // ③ 這一幀才畫得出來（淡入需要一點年紀）
  return host;
}

/** 真的畫那兩個字的**葉節點**（⛔ 不是碰巧只有它一個孩子的容器）。 */
const immuneNodes = (host: HTMLElement): HTMLElement[] =>
  [...host.querySelectorAll<HTMLElement>("*")].filter(
    (n) => n.children.length === 0 && n.textContent === "免疫",
  );

describe("💬 法術護盾擋下那一發，畫面上真的有「免疫」(@visual-proof)", () => {
  it("護盾在 ⇒ HUD 上出現一顆看得見的「免疫」（字在 · 沒被藏 · alpha>0 · 字級>0 · 有顏色）", () => {
    const payloads = simImmunePayloads(true);
    expect(payloads.length, "sim 一則 immune 都沒發 —— 鏈路第一段就斷了").toBeGreaterThan(0);
    const node = immuneNodes(paint(payloads))[0];
    expect(node, "⛔ 畫面上沒有「免疫」—— 鏈路某一段是斷的").toBeTruthy();
    expect(node!.style.display, "節點在但被藏起來 ＝ 零像素（天譴那次的形狀）").toBe("block");
    expect(Number(node!.style.opacity), "alpha 0 ＝ 看不見").toBeGreaterThan(0);
    expect(parseFloat(node!.style.fontSize), "字級 0 ＝ 讀不出來").toBeGreaterThan(0);
    expect(node!.style.color, "透明字 ＝ 只剩描邊，那正是 owner 抱怨過的「黑色數字」").toMatch(/^(#|rgb)/);
    // 畫在畫面外 ＝ 看不到。投影是上面那台相機，受害者在場地中心。
    expect(node!.style.transform).toMatch(/translate\(-?\d+(\.\d+)?px, -?\d+(\.\d+)?px\)/);
  });

  it("護盾不在 ⇒ sim 一則 immune 都不發，同一段流程跑完畫面上沒有那兩個字（量尺的另一個方向）", () => {
    const payloads = simImmunePayloads(false);
    expect(payloads.length, "沒有護盾卻還是免疫了 —— 那把尺量的不是護盾").toBe(0);
    expect(immuneNodes(paint(payloads))).toHaveLength(0);
  });
});

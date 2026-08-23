/**
 * 💥 **飛到底要炸開。**（GH#607）
 *
 * 12 支光束／突進技能的 `onArrive` 只有 `damageArea` / `screenShake`，
 * ⛔ 一個 `spawnVfx` 都沒有 —— 於是模型飛完全程就**憑空消失**，落點沒有爆炸。
 * #606 移掉了客戶端那條幽靈旁路（`arriveVfxKey`，零個寫入端），所以現在**唯一**
 * 的路是技能 JSON 的 `onArrive: [{ kind: "spawnVfx", … }]` —— 它走 sim 的延遲班表，
 * ⇒ 特效與傷害**同 tick 同點**。
 *
 * ── 兩條，因為單獨任何一條都有洞 ──────────────────────────────────────────
 *
 * ① **內容棘輪** —— 每一個 `onArrive` 都要帶一個看得見的東西。
 *    這一條是「下一支新的光束技能忘了補」時會紅的那一條。
 *    ⚠️ 它單獨不夠：它問的是**屬性**（節點裡有沒有那個 kind），而屬性可以在
 *    「事件根本送不到客戶端」的情況下全綠 —— 那正是失敗形態⑧（GH#606/#608
 *    一天之內中五次的形狀）。
 *
 * ② **行為證明**（走出貨鏈：真內容 → 真 SimWorld → 真事件）—— 拿出貨的
 *    04-03 龍破斬真的施放一次，收 `world.events` 裡真的 `vfxSpawn`，
 *    確認它**在落點**（⛔ 不是施法者腳下）而且**晚於施放那一 tick**（⛔ 不是
 *    施放當下就放完，那等於沒有落點爆炸）。
 *    ⇒ ①的不變式因此**不可能是空的**：真的有一發事件從那個節點走到線上。
 *
 * ⛔ 一條斷言都沒有抄出貨數值（第二守則「驗機制不驗數字」）：
 * vfxId 是**從出貨文件讀出來**再拿去比對真事件的，距離比的是「離施法者遠不遠」
 * 而不是任何一格座標。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）─────────────────────────────────
 *  · ⭐ 承重線 —— `content/abilities/godie-hjai.e.json` 的 `onArrive` 拿掉
 *    那一發 `spawnVfx`（＝回到 GH#607 的現況：模型飛到底就消失）
 *      → ① 紅（指名 `godie-hjai.e`）且 ② 紅（「一發 vfxSpawn 都沒有」）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "../sim/content/registry";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { normalizeCombatEnv } from "../sim/combatEnv";
import { runEffects } from "../sim/effects/effectRunner";
import { DEFAULT_AUTO_ENGAGE } from "../sim/combatFeel";
import type { VfxSpawnEvent } from "../sim/effects/spawnVfx";
import type { EffectContext, EffectDef } from "../sim/effects/effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
/** 行為證明的標本：04-03 龍破斬（本體），owner 點名的四支經典之一。 */
const SUBJECT = "godie-hjai.e";
const SUBJECT_CHAMPION = "godie-hjai" as ChampionId;

/** 看得見的落點：一發一次性特效，或另一具模型。 */
const VISIBLE = new Set(["spawnVfx", "spawnModelFx"]);

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 遞迴找出一棵效果樹裡每一個 `onArrive` 陣列。 */
function arriveLists(node: unknown, out: EffectDef[][] = []): EffectDef[][] {
  if (Array.isArray(node)) {
    for (const v of node) arriveLists(v, out);
  } else if (node !== null && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (Array.isArray(rec["onArrive"])) out.push(rec["onArrive"] as EffectDef[]);
    for (const v of Object.values(rec)) arriveLists(v, out);
  }
  return out;
}

describe("光束飛到底要炸開（GH#607）", () => {
  it("★ ① 每一個出貨 onArrive 都帶一發看得見的落點特效", () => {
    const blind: string[] = [];
    for (const id of Abilities.ids().sort()) {
      const def = Abilities.get(id);
      for (const list of arriveLists(def.effects ?? [])) {
        if (!list.some((e) => VISIBLE.has(e.kind))) blind.push(id);
      }
    }
    expect(
      [...new Set(blind)].join("\n"),
      "這幾支的 onArrive 只有傷害/震動 —— 模型飛到底就憑空消失,落點沒有爆炸",
    ).toBe("");
  });

  it("★ ② 出貨的龍破斬真的送出一發 vfxSpawn,在落點,而且晚於施放那一 tick", () => {
    const def = Abilities.tryGet(SUBJECT as AbilityId);
    expect(def, `${SUBJECT} 不在註冊表裡 —— 標本被改名或載入失敗了`).toBeDefined();
    // ⭐ 期望的 vfxId 是**從出貨文件讀出來的**，⛔ 不是抄在測試裡的字面值。
    const wanted = new Set(
      arriveLists(def!.effects ?? [])
        .flat()
        .filter((e): e is Extract<EffectDef, { kind: "spawnVfx" }> => e.kind === "spawnVfx")
        .map((e) => e.vfxId),
    );
    expect(wanted.size, "出貨的龍破斬 onArrive 裡沒有 spawnVfx").toBeGreaterThan(0);

    const world = new SimWorld(SKELETON_ARENA, 1);
    // ⛔ `combatActive` 留 false —— 開著它場上的人會互相普攻，那會讓別的東西
    //    也發特效，於是「有 vfxSpawn」對壞掉的實作也會過（失敗形態③）。
    world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
    world.combatFeel = { ...world.combatFeel, autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false } };
    const caster = spawnChampion(world, {
      championId: SUBJECT_CHAMPION, seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: C.x, z: C.z }, zone: 0,
    });
    world.step(new Map());
    // `path: "forward"` 讀的就是這一格，所以擺在施放的前一刻。
    world.transform.get(caster)!.facing = { x: 1, z: 0 };
    const from = { ...world.transform.get(caster)!.pos };

    const ctx: EffectContext = {
      world, caster, rank: 1, targets: [], origin: `ability:${SUBJECT}`, rng: world.rng,
    };
    runEffects((def!.effects ?? []) as EffectDef[], ctx);
    const atCast = world.events.filter((e) => e.type === "vfxSpawn").length;

    const seen: { tick: number; ev: VfxSpawnEvent }[] = [];
    for (let t = 0; t < 90; t++) {
      world.step(new Map());
      for (const e of world.events) {
        if (e.type === "vfxSpawn") seen.push({ tick: t, ev: e.data as unknown as VfxSpawnEvent });
      }
    }

    expect(seen.length, "施放之後一發 vfxSpawn 都沒有 —— onArrive 的落點特效沒送出來").toBeGreaterThan(0);
    expect(atCast, "落點特效在施放那一 tick 就放完了 —— 它沒有走延遲班表").toBe(0);
    const landed = seen.filter((s) => wanted.has(s.ev.vfxId));
    expect(
      landed.map((s) => s.ev.vfxId).join(","),
      `出貨 onArrive 指名的特效沒有出現在真的事件裡（收到 ${seen.map((s) => s.ev.vfxId).join(",")}）`,
    ).not.toBe("");
    // ⭐ 在**落點**，⛔ 不是施法者腳下 —— 比的是「離施法者遠不遠」,⛔ 不是任何一格座標。
    const far = landed.some((s) => Math.abs(s.ev.x - from.x) + Math.abs(s.ev.z - from.z) > 1);
    expect(far, "落點特效放在施法者腳下 —— 它拿到的不是抵達點").toBe(true);
  });
});

/**
 * ⭐⭐ GH#1078 —— **每一份 enabled 模板的預設展開，真的施放一次**。
 *
 * ── ⛔ 在此之前 ────────────────────────────────────────────────────────────
 * `paramsSchema.test.ts` 的反靜默探針只問「預設展開有沒有 effect」—— 一個**中間節點**。
 * GH#1076 正好從這個洞穿過：`tpl-summon-agent` 的預設展開有一格 `summon`（探針綠），
 * 而 handler 把預填的 `maxAlive: 0` 讀成零容量 ⇒ 卡面「創造出 N 個實體」而場上零具、
 * `castAbility` 回 ok、⛔ 沒有任何東西紅。
 *
 * ── ⭐ 這條守衛走的路（⛔ 沒有一行手寫 EffectDef）────────────────────────────
 *   出貨模板 → `defaultParamsFor`（編輯器開卡的預填）→ 一份只帶 `template:{ref,params}`
 *   的骨架 doc **塞進真的 ContentStore** → `registerAll`（出貨的展開＋Zod＋級距解析）
 *   → 一位記憶體夾具英雄（`godie-hart` 的複本，Q／天生技換成探針）→ 真的 `SimWorld`
 *   → 真的 `castAbility` → **出貨的判定** `castabilityVerdict.ts`（普查讀同一份）。
 *
 * ── 三種「有動」，全部從**資料**推導，⛔ 不是一張手寫的模板名單 ────────────────
 *   · 主動 → `classifyCastOutcome` 的 PASS（damage／heal／status／buff／dash／…）
 *   · 被動（`isPassiveOnly`／`isPassiveInnate`）→ ModifierSource／標記真的掛上（同普查）
 *   · ⭐ 純演出的 modelFx（展開的 `spawnModelFx` 既沒 `onTouch` 也沒 `onArrive`：五份
 *     `tpl-locust-*`＋兩條龍，expand.ts 逐字「⛔ 純演出」）→ `modelFxSpawn` 事件至少一發、
 *     實例數 > 0。⚠️ 這是它們**唯一**的終端（客戶端畫的就是這個事件），⛔ 不是跳過。
 *
 * ── ⚠️ 判定曾經有一個補丁（2026-09-06 GH#1087 之後已刪）───────────────────
 * `snapshotChannels()` 在 GH#1087 之前**看不見召喚**（`world.summon` 不在六個頻道裡），
 * 這裡曾自己多量 `world.summon.size` 一根補丁指針。現在那根指針住在
 * 出貨判定的 `summons` 頻道裡，這裡讀的與普查是**同一份**（形態⑤），⛔ 沒有第二套判準。
 *
 * MUTATION（落地前跑過）：`sim/effects/summon.ts` 的 `capRaw <= 0 ? ∞ : capRaw` 改回
 * `Math.max(0, capRaw)`（GH#1076 修法回退）⇒ 🔴 指名 `tpl-summon-agent`。
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ContentLoader } from "../loader";
import { FsContentSource } from "../node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll, DEGRADED_ABILITY_NOTE } from "../registries";
import {
  Abilities, Augments, Champions, Items, LootTables, Projectiles, registerChampion,
} from "../../sim/content/registry";
import { SimWorld } from "../../sim/SimWorld";
import { SKELETON_ARENA } from "../../sim/world/ArenaDef";
import { spawnChampion } from "../../sim/spawnChampion";
import { castAbility } from "../../sim/abilities/abilitySystem";
import { abilityPassiveSourceId, isPassiveInnate, isPassiveOnly } from "../../sim/abilities/abilityPassives";
import { classifyCastOutcome, snapshotChannels, type CastOutcome } from "../../sim/castabilityVerdict";
import { INNATE_SLOT, type CastTarget, type CastableSlot, type IntentFrame } from "../../sim/intents";
import { TICK_HZ } from "../../constants";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { AbilityDef } from "../../sim/content/defs";
import type { TemplateDoc } from "../schema/template";
import { defaultParamsFor } from "./paramsSchema";
import { expand } from "./expand";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
/** 同普查：區域中心北邊，避開三根柱子；假人貼身（r=0.6 ⇒ 1.35 留 0.15u 縫）。 */
const P = { x: Z0.center.x, z: Z0.center.z + 14 };
const ADJ = 1.35;
const DUMMY = "godie-hart" as ChampionId;
/**
 * 吟唱之外再看多久。⛔ 不是普查那三支 window 函式的第二份 —— 這裡的分母是 35 份**預設**，
 * 作者填的最長延後是 `tpl-periodic-field` 的第一發（1 s）與 `tpl-lock-combo` 五段（2 s）；
 * 4 s 是它們全部的上界，而一格「有動」就提早收工，所以多看不會多花。
 */
const EXTRA_TICKS = 4 * TICK_HZ;

const probeId = (t: TemplateDoc): AbilityId => `probe1078.${t.id}.q` as AbilityId;
const champOf = (t: TemplateDoc): ChampionId => `probe1078.${t.id}` as ChampionId;
const isPassiveTemplate = (t: TemplateDoc): boolean => {
  const ex = expand(t, defaultParamsFor(t));
  return ex.innateKind !== undefined || ex.passive !== undefined || (ex.marks?.length ?? 0) > 0;
};
/** 展開結果是一具**沒有任何傷害班表**的模型 ⇒ 純演出（從資料推導，⛔ 不是名單）。 */
const isCosmeticModelFx = (def: AbilityDef): boolean =>
  def.effects.length > 0 &&
  def.effects.every((e) => e.kind === "spawnModelFx" && e.onTouch === undefined && e.onArrive === undefined);

let enabled: TemplateDoc[] = [];

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const { store } = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  enabled = store.all<TemplateDoc>("ability-templates").filter((t) => t.status === "enabled");
  // 同 paramsSchema.test.ts 的 throughRegistryPath：骨架＋綁定，⛔ 不自己 merge。
  for (const t of enabled) {
    const passive = isPassiveTemplate(t);
    store.add("abilities", probeId(t), {
      schema: "ability@1", id: probeId(t), name: `探針 ${t.id}`,
      slot: passive ? "PASSIVE" : "Q", castType: "self", maxRank: 1,
      cooldown: [8], manaCost: [50], range: 5, effects: [],
      ...(passive ? { innateKind: expand(t, defaultParamsFor(t)).innateKind ?? "passive" } : {}),
      template: { ref: t.id, params: defaultParamsFor(t) },
    });
  }
  registerAll(store);
  // 夾具英雄：hart 的複本，Q／天生技換成探針；⚠️ 自己的被動一律拿掉 —— 一個 onAbilityHit
  //   的補刀會讓純演出模板也量到 damage（castabilityVfxOnly.test.ts 踩過）。
  const base = Champions.get(DUMMY);
  // ⭐ GH#1067（2026-09-07）：`championForm` 只有在**這具身體真的有變身態**時才動得了東西 ——
  //   `godie-hart` 沒有 `transform` ⇒ 拿它當底座會讓 `tpl-transform` 的預設展開合法地什麼都不做，
  //   而那不是「模板壞了」，是**探針挑錯身體**（量尺自證的反面）。⇒ 需要變身的模板換一位有變身的底座。
  const FORM_BASE = Champions.all().find((c) => (c as { transform?: unknown }).transform != null);
  const needsForm = (t: TemplateDoc): boolean =>
    JSON.stringify(t).includes("championForm");
  for (const t of enabled) {
    const passive = isPassiveTemplate(t);
    const b = needsForm(t) && FORM_BASE !== undefined ? FORM_BASE : base;
    registerChampion({
      ...b, id: champOf(t), name: `探針 ${t.id}`, passive: undefined,
      abilities: passive ? b.abilities : { ...b.abilities, Q: Abilities.get(probeId(t)) },
      passiveAbility: passive ? probeId(t) : undefined,
    });
  }
});

let seat = 0;
const spawn = (w: SimWorld, id: ChampionId, team: number, dx: number): EntityId =>
  spawnChampion(w, { championId: id, seatId: asSeatId(seat++), teamId: asTeamId(team), pos: { x: P.x + dx, z: P.z }, zone: 0 });

/** 同普查 `targetFor`：照 castType 選目標；只打友方的瞄隊友。 */
function targetFor(def: AbilityDef, foe: EntityId, ally: EntityId, at: { x: number; z: number }): CastTarget {
  if (def.castType === "self") return { type: "self" };
  if (def.castType === "targeted") return { type: "entity", entityId: def.targetsEnemies === false ? ally : foe };
  return { type: "point", point: { x: at.x, z: at.z } };
}

interface Row { id: string; verdict: string; channel?: string; reason?: string }

function probe(t: TemplateDoc): Row {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  world.ultGateOverride = true;
  const caster = spawn(world, champOf(t), 0, 0);
  const foe = spawn(world, DUMMY, 1, ADJ);
  const ally = spawn(world, DUMMY, 0, -ADJ);
  world.step(NO_INTENTS);
  world.rebuildGrid();
  const ab = world.abilities.get(caster)!;
  const slot: CastableSlot = isPassiveTemplate(t) ? INNATE_SLOT : "Q";
  const inst = slot === INNATE_SLOT ? ab.passiveSlot : ab.slots.Q;
  const def = Abilities.get(inst!.abilityId);
  // ⚠️ 降級註記蓋在 `description` 上（registries.ts），而 sim 的 `AbilityDef` 型別沒有那一格。
  if ((def as { description?: string }).description?.includes(DEGRADED_ABILITY_NOTE)) {
    return { id: t.id, verdict: "FAIL", reason: "registry 把預設展開降級了（模板展開失敗）" };
  }
  if (isPassiveOnly(def) || isPassiveInnate(def)) {
    const src = world.stats.get(caster)!.sources.find((s) => s.id === abilityPassiveSourceId(def.id));
    const marked = (world.marks.get(caster)?.size ?? 0) > 0;
    return src || marked
      ? { id: t.id, verdict: "PASSIVE", channel: src ? (src.modifiers?.length ? "passive:modifiers" : "passive:hooks") : "passive:marks" }
      : { id: t.id, verdict: "FAIL", reason: "被動：沒有任何 ModifierSource／標記掛上（inert）" };
  }
  // 主動 —— 同普查：全員半血半魔（補血／補魔／護盾有空間），施法者魔力剛好夠一次。
  for (const e of [caster, foe, ally]) {
    const hp = world.health.get(e)!;
    hp.hp = hp.maxHp * 0.5;
    hp.mana = hp.maxMana * 0.5;
  }
  world.health.get(caster)!.mana = (def.manaCost[0] ?? 0) + 1;
  const foePos = { ...world.transform.get(foe)!.pos };
  const allyPos = { ...world.transform.get(ally)!.pos };
  const anchor = { ...world.transform.get(caster)!.pos };
  const before = snapshotChannels(world);
  const events: string[] = [];
  let modelFxInstances = 0;
  const collect = (): void => {
    for (const ev of world.events) {
      events.push(ev.type);
      if (ev.type === "modelFxSpawn") modelFxInstances += ((ev.data as { instances?: unknown[] }).instances ?? []).length;
    }
  };
  const res = castAbility(world, caster, slot, targetFor(def, foe, ally, foePos));
  if (res !== "ok") return { id: t.id, verdict: "FAIL", reason: `cast rejected: ${res}` };
  collect();
  const window = Math.round((def.castTimeSec ?? 0) * TICK_HZ) + 1 + EXTRA_TICKS;
  let out: CastOutcome = { verdict: "FAIL" };
  for (let i = 0; i < window; i++) {
    // 同普查：散落型技能的假人站到引擎排定的下一個落點；飛行中的身體不釘。
    for (const wave of world.randomArea) {
      const hit = wave.caster === caster ? wave.impacts[wave.next] : undefined;
      if (hit) { foePos.x = hit.pos.x; foePos.z = hit.pos.z; }
    }
    if (!world.airborne.has(foe)) world.transform.get(foe)!.pos = { ...foePos };
    world.transform.get(ally)!.pos = { ...allyPos };
    world.step(NO_INTENTS);
    collect();
    const c = world.transform.get(caster)!.pos;
    const dx = c.x - anchor.x, dz = c.z - anchor.z;
    const moved = dx * dx + dz * dz > 0.04 || world.nav.get(caster)!.override != null;
    out = classifyCastOutcome({ events, before, after: snapshotChannels(world), moved, effectsAuthored: def.effects.length });
    if (out.verdict === "PASS") break;
  }
  if (out.verdict !== "PASS" && isCosmeticModelFx(def)) {
    return modelFxInstances > 0
      ? { id: t.id, verdict: "MODEL_FX", channel: `modelFxSpawn×${modelFxInstances}` }
      : { id: t.id, verdict: "FAIL", reason: "純演出模板連一具模型都沒生（modelFxSpawn 零實例）" };
  }
  return { id: t.id, ...out };
}

describe("每一份 enabled 模板的預設展開，在真的 SimWorld 裡施放要有東西動（GH#1078）", () => {
  it("★ 全部 enabled：主動 PASS／被動掛上來源／純演出生得出模型 —— ⛔ 沒有一份是 no-op", () => {
    const rows = enabled.map(probe);
    // 報告用：`GGD_1078_ROWS=1 npx vitest run …` 印出每一份量到的頻道（⛔ 平時不吵）。
    if (process.env["GGD_1078_ROWS"]) console.log(rows.map((r) => `${r.id}\t${r.verdict}\t${r.channel ?? ""}\t${r.reason ?? ""}`).join("\n"));
    const bad = rows.filter((r) => !["PASS", "PASSIVE", "MODEL_FX"].includes(r.verdict));
    expect(bad.map((r) => `${r.id}: ${r.verdict}（${r.reason ?? ""}）`), "預設展開在 sim 裡什麼都不做的模板").toEqual([]);
    // sentinel：分母要是全部 enabled 模板，而且三種形狀各自至少量到一個 —— 迴圈沒跑到也是全綠。
    expect(rows.length, "分母回空的 —— 偵測壞了").toBeGreaterThanOrEqual(30);
    for (const v of ["PASS", "PASSIVE", "MODEL_FX"]) {
      expect(rows.some((r) => r.verdict === v), `一個 ${v} 都沒量到 —— 那一條路壞了`).toBe(true);
    }
    // ⭐ GH#1076 那一族只有**召喚指針**看得見 —— 它一次都沒被讀到，就是那根指針斷了（⛔ 不是內容都改好了）。
    //    指針住在出貨判定的 `summons` 頻道（GH#1087）；這一行同時釘住「普查讀得到召喚」。
    expect(rows.some((r) => r.channel === "summon"), "召喚指針一次都沒量到 —— castabilityVerdict 的 summons 頻道壞了").toBe(true);
  });
});

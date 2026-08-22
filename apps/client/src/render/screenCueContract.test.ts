/**
 * ⛔⛔ GH#608 —— **三個「演出」事件，sim 送的那一份客戶端真的用得了**。
 *
 * ── 這一批（#543 螢幕回饋 / #549 特效文字）在 2026-08-23 之前三個全是死的 ───────
 * 而三個的死法**各不相同**，所以「修好一個」不代表另外兩個會跟著活：
 *
 * | 事件 | 客戶端讀 | sim 有沒有送 | 下場 |
 * |---|---|---|---|
 * | `screenFlash` | `ev.data.spec` | ⛔ 沒有 | `spec.applyTo` **擲 TypeError** |
 * | `screenShake` | `ev.data.spec` | ⛔ 沒有 | 同上 |
 * | `floatingText` | `ev.data.at`  | ⛔ 沒有 | `pos===null` ⇒ 靜默 `break` |
 *
 * ⚠️ 前兩個**擲例外**的代價遠大於它自己：`GameApp.handleDrainedEvent` 第一行就是
 * `this.vfx.handleEvent(ev)`，而 **`GameApp.ts` 全檔零個 `try`** ⇒ 一次 throw 帶走
 * 同一批後面**每一個**事件與**每一個** sink。
 *
 * ⭐ 而 `scripted`（owner 2026-08-23 裁決 (a)）在**第四個**地方也斷了:
 * `ScreenFlashVariant` 這個手寫介面漏了它 ⇒ handler 的 `e` 看不到 ⇒ 不可能轉發。
 * ⇒ **四個獨立的斷點串在同一條路上**，而每一個單看都是對的。這條守衛把整條路一次跑完。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）───────────────────────────────────
 *  · ⭐ 承重線 —— 把 `sim/effects/clientCues.ts` 的
 *    `...(e.scripted === true ? { scripted: true } : {})` 刪掉
 *      → 紅:「⛔ scripted 沒有被轉發 ⇒ owner 的 1 秒全黑會被夾成營運上限」
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EffectContext, EffectDef } from "@ggd/shared/sim/effects/effect";
import type { FloatingTextEvent, ScreenFlashEvent } from "@ggd/shared/sim/effects/clientCues";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "@ggd/shared/ids";
import {
  DEFAULT_SCREEN_FX_LIMITS,
  resolveScreenFlash,
  screenCueIsForViewer,
  screenFlashSpecFromEvent,
} from "./screenFx";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

/**
 * 施放出貨的那一支，回傳 sim 真的送上線的事件。
 *
 * ⚠️ `championId` 只是**借一具身體**當施法者 —— 殭屍王的技能掛在 mob boss 上，
 * ⛔ 沒有英雄卡。我們驗的是**事件酬載的形狀**，⛔ 不是誰放的。
 */
function cast(championId: string, abilityId: string, type: string): Record<string, unknown> | undefined {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const caster = spawnChampion(world, {
    championId: championId as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: C.x, z: C.z }, zone: 0,
  });
  const victim = spawnChampion(world, {
    championId: championId as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1),
    pos: { x: C.x + 3, z: C.z }, zone: 0,
  });
  world.step(new Map());
  world.transform.get(caster)!.facing = { x: 1, z: 0 };
  const def = Abilities.tryGet(abilityId as AbilityId);
  expect(def, `${abilityId} 不在註冊表裡 —— 標本被改名或內容載入失敗了`).toBeDefined();
  runEffects((def!.effects ?? []) as EffectDef[], {
    world, caster, rank: 1, targets: [victim], origin: `ability:${abilityId}`, rng: world.rng,
  } satisfies EffectContext);
  return world.events.find((e) => e.type === type)?.data as Record<string, unknown> | undefined;
}

describe("演出事件的線路契約（GH#608）", () => {
  it("殭屍王的全黑:sim 真的送了 scripted，而它真的抬高了上限", () => {
    const data = cast("godie-h020", "godie-zombieking.passive", "screenFlash");
    expect(data, "出貨的殭屍王 [leap吸血] 沒有發出 screenFlash —— 標本失效了").toBeDefined();
    const p = data as unknown as ScreenFlashEvent;

    // ① 幽靈欄位:客戶端舊碼讀的那一格從來不存在
    expect(data!["spec"], "⛔ `spec` 還是不存在 —— 舊碼就是讀它然後擲 TypeError").toBeUndefined();
    // ② ⭐ 承重:`scripted` 真的過得了線（handler 的 `e` 看不到它的話這裡就是 undefined）
    expect(p.scripted, "⛔ scripted 沒有被轉發 ⇒ owner 的 1 秒全黑會被夾成營運上限").toBe(true);

    // ③ ⭐ 而它真的抬高了上限 —— ⛔ 不問「幾秒」（那是 owner 的數字，第二守則）,
    //    只問「豁免的那一發**比沒豁免的那一發久／亮**」。
    const spec = screenFlashSpecFromEvent(p);
    const withFlag = resolveScreenFlash(spec, DEFAULT_SCREEN_FX_LIMITS, false);
    const without = resolveScreenFlash({ ...spec, scripted: false }, DEFAULT_SCREEN_FX_LIMITS, false);
    expect(withFlag, "豁免的那一發應該畫得出來").not.toBeNull();
    expect(without).not.toBeNull();
    expect(withFlag!.durationMs).toBeGreaterThan(without!.durationMs);

    // ④ 觀眾規則:全場的那一發，⛔ 不認得本機 id 也看得到
    expect(screenCueIsForViewer(p as never, null)).toBe(p.broadcast);
  });

  it("浮動文字:sim 送的是一串錨，⛔ 不是舊碼讀的那個 `at`", () => {
    const data = cast("godie-h020", "godie-h020.e", "floatingText");
    expect(data, "出貨的龍破斬沒有發出 floatingText —— 標本失效了").toBeDefined();
    const p = data as unknown as FloatingTextEvent;
    expect(data!["at"], "⛔ `at` 還是不存在 —— 舊碼讀它,於是 pos 恆為 null 而每一次都 break").toBeUndefined();
    expect(p.subjects.length, "⛔ 一個錨都沒有 = 畫面上一個字都不會出現").toBeGreaterThan(0);
    // 座標由 sim 給（客戶端不再自己 `entityPos` 查一次 —— 那是第二份答案）
    for (const s of p.subjects) expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true);
  });
});

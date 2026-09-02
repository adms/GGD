/**
 * ⭐⭐ **護盾生成的線路契約**（GH#940）——「sim 送的，客戶端真的畫得出來」。
 *
 * ⛔⛔ 在此之前**這一半從來沒有畫過一個像素**，而每一個零件都是對的：
 * · sim 發得好好的（`sim/effects/shield.ts`，一次 `addShield` 一則）
 * · ⛔ 而它停在 `SERVER_ONLY_EVENT_TYPES` —— 那一段自己寫著
 *   「今天沒有客戶端 handler，現在開線買不到任何東西」
 * · ⭐ 而**破碎**那一半（`guardBreak`）一直是活的
 * ⇒ ⭐ 玩家看到的是一個**只有下半場**的演出（失敗形態⑧）。
 *
 * ⇒ ⭐ 這一條**整條線都用出貨的東西**：出貨內容 → 出貨技能 → 真的 `shieldGained`
 *   → 真的 `VfxSystem`。⛔ 不自己捏一份 payload（那會量到一個**虛構通道**，形態⑤）。
 *
 * ── 突變紀錄 ──────────────────────────────────────────────────────────────
 *  · 把 `VfxSystem` 的 `case "shieldGained"` 拿掉 → 紅（「一個 spark 都沒生出來」）
 *  · 把 `shieldGained` 從 `FANNED_OUT_EVENT_TYPES` 搬回 `SERVER_ONLY` → 紅（下面第②條）
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ContentLoader } from "@ggd/shared/content/loader";
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EffectContext, EffectDef } from "@ggd/shared/sim/effects/effect";
import type { ShieldGainedEvent } from "@ggd/shared/sim/effects/shield";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "@ggd/shared/ids";
import { FANNED_OUT_EVENT_TYPES } from "../../../game-server/src/net/eventFanout";
import { VfxSystem } from "../vfx/VfxSystem";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
// ⭐ 出貨的護盾技能之一（量到 6 支帶 `kind: "shield"`）。
const CASTER = "thorne" as ChampionId;
const SUBJECT = "thorne.w";

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 施放出貨的那一支，回傳 sim **真的**送出的那一則 `shieldGained`。 */
function realWirePayload(): ShieldGainedEvent {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const caster = spawnChampion(world, {
    championId: CASTER, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
  });
  world.step(new Map());
  const def = Abilities.tryGet(SUBJECT as AbilityId);
  expect(def, `${SUBJECT} 不在註冊表裡 —— 標本被改名或內容載入失敗了`).toBeDefined();
  runEffects((def!.effects ?? []) as EffectDef[], {
    world, caster, rank: 1, targets: [caster], origin: `ability:${SUBJECT}`, rng: world.rng,
  } satisfies EffectContext);
  // ⚠️ 要在下一次 step() **之前**讀（step 第一行清空 events）。
  const ev = world.events.find((e) => e.type === "shieldGained");
  expect(ev, `出貨的 ${SUBJECT} 沒有發出 shieldGained —— 標本失效了`).toBeDefined();
  return ev!.data as unknown as ShieldGainedEvent;
}

describe("shieldGained 的線路契約（GH#940）", () => {
  it("① 出貨技能真的送出這一則，而且欄位是消費端讀的那幾格", () => {
    const wire = realWirePayload();
    // ⭐ 消費端讀 `target` 去查座標 —— ⛔ 它必須是一個真的 entity id。
    expect(typeof wire.target, "⛔ target 不是數字 ⇒ posFromEvent 查不到座標").toBe("number");
    expect(wire.amount, "⛔ 護盾量是 0 ⇒ 這一則 beat 在說一件沒發生的事").toBeGreaterThan(0);
    // ⚠️ `origin` 是封包的 **provenance 標籤**，⛔ 不是座標 ——
    // 寫消費端時 `ShieldGainedEvent` 的型別當場攔下了那個誤讀。
    expect(typeof wire.origin).toBe("string");
  });

  it("②⭐ 它真的在**過線**的清單裡（⛔ 不是只在 sim 裡發得爽）", () => {
    expect(
      FANNED_OUT_EVENT_TYPES.has("shieldGained"),
      "⛔ `shieldGained` 不在 FANNED_OUT_EVENT_TYPES 裡 ⇒ 它到不了客戶端 ⇒ " +
        "⭐ 下面那條「畫得出來」量到的是一個**虛構通道**（失敗形態⑤）。",
    ).toBe(true);
  });

  it("③⭐⭐ 真的事件餵**真的** VfxSystem ⇒ 畫面上生得出東西", () => {
    const wire = realWirePayload();
    const scene = new Scene(new NullEngine());
    const vfx = new VfxSystem(scene, {
      // ⭐ 有座標（⛔ 沒有的話 `posFromEvent` 回 null，這一條就在量空氣）
      entityPos: () => ({ x: C.x, z: C.z }),
    });
    const before = scene.particleSystems.length;
    vfx.handleEvent({ type: "shieldGained", data: wire } as unknown as EventMessage, 0);
    expect(
      scene.particleSystems.length,
      "⛔ 一個粒子系統都沒生出來 —— 護盾生成仍然是**看不見的**（GH#940 的形狀）",
    ).toBeGreaterThan(before);
  });

  it("④⭐ 後台把它關掉 ⇒ 逐位元回到今天的行為（rollback 開關真的有接上）", () => {
    const wire = realWirePayload();
    const scene = new Scene(new NullEngine());
    const vfx = new VfxSystem(scene, {
      entityPos: () => ({ x: C.x, z: C.z }),
      shieldGainedCue: () => false,
    });
    const before = scene.particleSystems.length;
    vfx.handleEvent({ type: "shieldGained", data: wire } as unknown as EventMessage, 0);
    expect(
      scene.particleSystems.length,
      "⛔ 開關關掉了還是畫了 ⇒ 那一格後台是**裝飾性的**（CLAUDE.md GH#927 的形狀）",
    ).toBe(before);
  });
});

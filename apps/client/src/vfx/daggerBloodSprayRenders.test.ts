/**
 * @visual-proof
 *
 * 🗡️🩸 GH#641（重開）—— 幻之匕首觸發的那一刻，**場上真的有一蓬往受害者
 * 背後噴的血**（量的是活著的粒子數與出生 alpha，⛔ 不是「事件有送」）。
 *
 * owner 2026-08-24 逐字：
 * > 「幻之匕首真的會造成20%傷害嗎 => 你真的測試過嗎? 如果觸發效果可否追加
 * >  明顯特殊特效（例如受傷角色背後大量噴血）」
 *
 * ── 整條線都是出貨的東西（失敗形態⑤／⑧ 的防線）─────────────────────────
 * 出貨的 godie-i039.json（含 spawnVfx 綁定）→ 真 SimWorld 對打到 3% 真的擲中
 * → sim **真的**送上線的那一則 `vfxSpawn` → 真 `VfxSystem`（NullEngine）→
 * 場上那一池粒子。vfx 文件是**出貨檔案本身**經 `zVfxDoc.parse`（schema 拒收
 * 就在這裡紅，⛔ 不用等 content:build）；注入走 `ctx.vfxDoc` —— 與 GameApp
 * 的 `contentDb.vfxFor` 同一道接縫。
 *
 * ── 方向性（「背後」）────────────────────────────────────────────────────
 * 文件宣告 `orient.yawFrom:"aim"`；客戶端 vfxSpawn case 用
 * 發射者(攻擊者)→落點(受害者) 的方位角套 `applyAimYaw` ⇒ 錐口沿著這一下的
 * 行進方向 = 噴向受害者背後。池 key 因此帶 `@aim<q>` —— 名字本身就是
 * 「瞄準真的套上了」的證據，而且期望值與消費端讀**同一個** entityPos。
 *
 * 突變（一批一條，最承重）：把 godie-i039.json 的 spawnVfx entry 刪掉
 * ⇒ 這裡（與 daggerGodieI039.test.ts 的綁定斷言）紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { zVfxDoc, type VfxDoc } from "@ggd/shared/content";
import { ContentStore } from "@ggd/shared/content/store";
import { registerAll } from "@ggd/shared/content/registries";
import { Items } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { grantItemFree } from "@ggd/shared/sim/economy/shop";
import type { VfxSpawnEvent } from "@ggd/shared/sim/effects/spawnVfx";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId, type SeatId } from "@ggd/shared/ids";
import type { IntentFrame } from "@ggd/shared/sim/intents";
import { VfxSystem } from "./VfxSystem";
import { quantizeYawDeg, yawDegToward } from "./orient";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
const DAGGER = "godie-i039" as ItemId;
const MELEE = "godie-o02l" as ChampionId;

function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(CONTENT, collection, f), "utf-8")) as Record<string, unknown>);
}

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "projectiles", "status-effects", "items"] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

describe("🩸 幻之匕首觸發 → 受傷角色背後大量噴血 (@visual-proof)", () => {
  it("真對打的那一則 vfxSpawn，餵進真 VfxSystem：瞄準套上了、場上活著的粒子 > 0", () => {
    // ── ① 出貨的血花文件（schema 在這裡就要收） ─────────────────────────
    const binding = (Items.get(DAGGER).passive ?? [])[0]!.effects.find((e) => e.kind === "spawnVfx");
    if (binding?.kind !== "spawnVfx") throw new Error("godie-i039 缺 spawnVfx 綁定 (GH#641)");
    const sprayDoc: VfxDoc = zVfxDoc.parse(
      JSON.parse(readFileSync(join(CONTENT, `vfx/${binding.vfxId}.json`), "utf-8")),
    );
    // 出生可見性：出生 stop 的 alpha 要亮（vfxDocsBirthVisibility 掃全庫,這裡釘出生格）
    const birth = sprayDoc.colorStops?.[0]?.[1] ?? sprayDoc.color.start;
    expect(birth[3], "出生 alpha 被烘成透明 —— 玩家一個像素都看不到").toBeGreaterThan(0.05);
    expect(sprayDoc.orient?.yawFrom, "沒有 aim 方位,「背後」無從談起").toBe("aim");

    // ── ② 真 SimWorld 對打到 3% 真的擲中，拿真的 vfxSpawn ───────────────
    const world = new SimWorld(SKELETON_ARENA, 7); // 種子 7:第 15 tick 就觸發
    let seat = 0;
    const spawn = (team: 0 | 1, dx: number): EntityId =>
      spawnChampion(world, {
        championId: MELEE, seatId: asSeatId(seat++), teamId: asTeamId(team),
        pos: { x: Z0.center.x + dx, z: Z0.center.z + 8 }, zone: 0,
      });
    const holder = spawn(0, -0.6);
    const victim = spawn(1, 0.6);
    expect(grantItemFree(world, holder, DAGGER)).toBeGreaterThanOrEqual(0);
    world.nav.get(holder)!.attackTarget = victim;
    let wire: VfxSpawnEvent | undefined;
    for (let t = 0; t < 2000 && !wire; t++) {
      world.step(NO_INTENTS);
      const ev = world.events.find((e) => e.type === "vfxSpawn" && (e.data as { vfxId?: string }).vfxId === binding.vfxId);
      if (ev) wire = ev.data as unknown as VfxSpawnEvent;
    }
    expect(wire, "2000 tick 內 3% 一次都沒擲中 —— 種子或觸發鏈壞了").toBeDefined();
    expect(wire!.caster).toBe(holder);

    // ── ③ 真 VfxSystem 消費，量場上的東西 ───────────────────────────────
    const scene = new Scene(new NullEngine());
    const entityPos = (id: number): { x: number; z: number } | null =>
      world.transform.get(id as EntityId)?.pos ?? null;
    const vfx = new VfxSystem(scene, {
      entityPos,
      vfxDoc: (key) => (key === sprayDoc.id ? sprayDoc : null),
    });
    vfx.handleEvent({ type: "vfxSpawn", data: wire } as unknown as EventMessage, 0);

    // 瞄準：期望值與消費端讀同一個 entityPos ⇒ 名字可以精確比對
    const cpos = entityPos(wire!.caster)!;
    const yaw = quantizeYawDeg(yawDegToward(wire!.x - cpos.x, wire!.z - cpos.z)!);
    const ps = scene.particleSystems.find(
      (p) => p.name === `vfx-${sprayDoc.id}@aim${yaw}`,
    ) as ParticleSystem | undefined;
    expect(
      ps,
      `場上沒有瞄準過的血花池（有的池: ${scene.particleSystems.map((p) => p.name).join(", ") || "無"}）` +
        " —— 瞄準沒套上（或 play 根本沒被叫到）",
    ).toBeDefined();

    // 活著的粒子：burst 全落在觸發幀,推幾幀之後場上要真的有東西
    for (let i = 0; i < 4; i++) ps!.animate(true);
    expect(ps!.particles.length, "池在、粒子 0 顆 —— 玩家還是什麼都看不到").toBeGreaterThan(0);
  });
});

/**
 * @visual-proof GH#1189 燈籠的客戶端那一半 —— 出貨的整條路（⛔ 不手搭 payload）：真的 `runEffects` → 真的
 * `VfxSystem.handleEvent` → 網格（出生那一刻 emissive×alpha > 0）＋點選表 → 真的 `InputCapture` 右鍵 → `interact`。
 * ⚠️ NullEngine 不 raster ⇒ 證明的是「材質不會把圖元歸零」，⛔ 不是實機截圖。突變：右鍵分支拿掉 ⇒ 紅。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent, SELA } from "@ggd/shared/sim/content/skeleton";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import { asSeatId, asTeamId, type ChampionId } from "@ggd/shared/ids";
import type { EffectDef } from "@ggd/shared/sim/effects/effect";
import type { Command, Order } from "@ggd/shared/sim/intents";
import { VfxSystem } from "./VfxSystem";
import { InputCapture } from "../input/InputCapture";
import { pickInteractableAt } from "../input/interactables";

beforeAll(() => registerSkeletonContent());
afterEach(() => vi.unstubAllGlobals());

class FakeTarget {
  private on = new Map<string, (ev: unknown) => void>();
  addEventListener(type: string, fn: (ev: unknown) => void): void { this.on.set(type, fn); }
  removeEventListener(type: string): void { this.on.delete(type); }
  getBoundingClientRect(): DOMRect { return { left: 0, top: 0 } as DOMRect; }
  dispatch(type: string, ev: object): void { this.on.get(type)?.(ev); }
}

describe("GH#1189 燈籠：看得到、點得到、點了送 interact", () => {
  it("我隊隊友右鍵點燈 ⇒ 碰得到送 interact、碰不到走過去；到期後網格與點選表一起收", () => {
    const Z = SKELETON_ARENA.zones[0]!;
    const world = new SimWorld(SKELETON_ARENA, 1189);
    const caster = spawnChampion(world, { championId: SELA.id as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0), pos: { ...Z.center }, zone: 0 });
    world.step(new Map());
    const scene = new Scene(new NullEngine());
    const vfx = new VfxSystem(scene, { entityPos: (): null => null });
    const drain = (): void => world.events.forEach((ev) => vfx.handleEvent({ type: ev.type, tick: world.tick, data: ev.data }, 0));
    const at = { x: Z.center.x + 4, z: Z.center.z };
    runEffects([{ kind: "spawnInteractable", radius: 1.5, durationSec: 0.2, onAccept: [] } as EffectDef], { world, caster, rank: 1, targets: [], point: at, origin: "ability:test.lantern", rng: world.rng } as never);
    drain();
    expect(vfx.abilityTerrain.liveCount(), "⛔ 燈籠沒畫出來").toBe(1);
    const lit = scene.meshes.filter((m) => m.name.startsWith("ability-lantern") && m.isEnabled());
    const glow = lit.map((m) => { const mat = m.material as StandardMaterial; return (mat.emissiveColor.r + mat.emissiveColor.g + mat.emissiveColor.b) * mat.alpha; });
    expect(glow.length === 2 && glow.every((g) => g > 0), "⛔ 燈籠本體或接受圈的 emissive×alpha 是 0 —— 畫了等於沒畫").toBe(true);

    const ally = { entityId: 999, teamId: 0 };
    let self = { ...at };
    const orders: Order[] = [];
    const commands: Command[] = [];
    const el = new FakeTarget();
    vi.stubGlobal("window", new FakeTarget());
    const cap = new InputCapture(el as unknown as HTMLElement, {
      screenToGround: () => at,
      getSelfPos: () => self,
      getAbility: () => null, pickEnemy: () => null, pickSelf: () => false,
      pickInteractable: (g) => pickInteractableAt(g, ally),
      onOrder: (o) => orders.push(o),
      onCommand: (c) => commands.push(c),
      onSelectSelf: () => {}, onZoom: () => {}, onToggleFollow: () => {},
    });
    cap.attach();
    const rclick = { clientX: 1, clientY: 1, preventDefault: () => {} };
    el.dispatch("contextmenu", rclick);
    expect(commands.map((c) => c.kind), "⛔ 站在燈旁右鍵點燈沒有送出 interact").toEqual(["interact"]);
    expect(orders).toEqual([]);
    self = { x: at.x + 10, z: at.z };
    el.dispatch("contextmenu", rclick);
    expect(orders.map((o) => o.kind)).toEqual(["move"]);
    expect(pickInteractableAt(at, { entityId: caster, teamId: 0 }), "自己放的燈不在自己的點選表裡").toBeNull();

    for (let i = 0; i < 20; i++) { world.step(new Map()); drain(); }
    expect(vfx.abilityTerrain.liveCount(), "⛔ 燈籠到期了而網格還在（孤兒）").toBe(0);
    expect(pickInteractableAt(at, ally), "⛔ 到期的燈還點得到").toBeNull();
    cap.dispose();
  });
});

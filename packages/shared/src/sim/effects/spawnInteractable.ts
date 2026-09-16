import type { EffectKindSpec } from "./effectKind";

/**
 * 【互動物】（GH#1189 瑟雷西 W 燈籠）—— 生一個 interactable 實體（⛔ 沒有 transform／health：
 * 它不是單位）。⭐ 這一支**只放東西**：誰、何時觸發 `onAccept` 由隊友的 `interact` 指令決定
 * （`sim/interactables.ts::acceptInteractable`），⛔ 施法者這一次施放不會搬任何人。
 */

/** ⭐ `interactableSpawn` 的酬載 —— 住在發射站旁邊，客戶端 import 同一個（失敗形態⑧）。 */
export interface InteractableSpawnEvent {
  readonly id: number;
  readonly owner: number;
  /** 施法者當下的隊伍 —— 客戶端拿它判斷「這是不是我隊的燈」（伺服器仍然逐次驗） */
  readonly teamId: number;
  readonly origin: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly durationSec: number;
  readonly maxUses: number;
}

export const spawnInteractableEffect: EffectKindSpec<"spawnInteractable"> = {
  apply(e, ctx, bakeList) {
    const { world } = ctx;
    const ct = world.transform.get(ctx.caster);
    if (!ct) return;
    const center =
      e.at === "self" || ctx.point === undefined ? { x: ct.pos.x, z: ct.pos.z } : { x: ctx.point.x, z: ctx.point.z };
    const maxUses = e.maxUses ?? 1;
    const id = world.spawn();
    world.interactable.set(id, {
      castInstance: ctx.castInstance,
      ownerId: ctx.caster,
      zone: ct.zone,
      center,
      radius: e.radius,
      expiresAtTick: world.tick + Math.max(1, Math.round(e.durationSec / world.dt)),
      usesLeft: maxUses,
      acceptedBy: [],
      onAccept: bakeList(e.onAccept, ctx),
      rank: ctx.rank,
      origin: ctx.origin,
      abilitySlot: ctx.abilitySlot,
    });
    const payload: InteractableSpawnEvent = {
      id,
      owner: ctx.caster,
      teamId: world.team.get(ctx.caster)?.teamId ?? -1,
      origin: ctx.origin,
      x: center.x,
      z: center.z,
      radius: e.radius,
      durationSec: e.durationSec,
      maxUses,
    };
    world.emit("interactableSpawn", payload as unknown as Record<string, unknown>);
  },
  bake(e, ctx, bakeList) {
    return { ...e, onAccept: bakeList(e.onAccept, ctx) };
  },
};

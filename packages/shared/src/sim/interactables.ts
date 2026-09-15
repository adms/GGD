/**
 * 【互動物】（GH#1189 瑟雷西 W 燈籠）—— 隊友**自己選**要不要用的技能物件。
 *
 *   · `acceptInteractable(world, entity, objectId)`：`CommandSystem` 的 `interact` 指令呼叫它。
 *     ⭐ 伺服器逐項驗（⛔ 不信客戶端）：還在（沒到期／沒用完／施法者活著／該區沒結算）·
 *     不是施法者本人 · 接受者活著 · 同隊 · 沒接受過 · 同區且身體碰到接受圈。
 *     通過 ⇒ 以**接受者**為目標、原施法者為 caster 跑烘好的 `onAccept`，扣一次使用。
 *   · `interactableSystem(world)`：到期／施法者死亡／回合重置收掉（`interactableEnd.reason`）。
 *
 * ⭐ 施法者**放燈**這一次施放不搬任何人 —— 搬運只發生在隊友的指令裡（票文驗收①：
 *   「放燈後未點選的隊友不會被搬運」）。bot 要不要自己點，是 host 的 AI 規則
 *   （`arena-rules.botInteract.autoAccept` → `apps/game-server/src/ai/Tier0Brain.ts`），⛔ sim 不知道「bot」。
 *
 * ⛔ 零 Math.random／Date／三角（sim purity）；Map 迭代一律先排序。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import { runEffects } from "./effects/effectRunner";

/** 接受的結果。非 `ok` 的每一個都會以 `interactRejected.reason` 回給按的人（⛔ 不靜默）。 */
export type InteractResult = "ok" | "gone" | "owner" | "dead" | "enemy" | "already-accepted" | "too-far";

export type InteractableEndReason = "expired" | "ownerDead" | "roundReset" | "used";

function endInteractable(world: SimWorld, id: EntityId, reason: InteractableEndReason): void {
  const it = world.interactable.get(id);
  world.emit("interactableEnd", { id, owner: it?.ownerId, origin: it?.origin, reason });
  world.destroy(id);
}

/** 這個物件此刻是否已失效（到期／施法者死亡／該區已結算）。 */
function lapsedReason(world: SimWorld, id: EntityId): InteractableEndReason | null {
  const it = world.interactable.get(id);
  if (!it) return null;
  if (world.settledZones.has(it.zone)) return "roundReset";
  if (world.tick >= it.expiresAtTick) return "expired";
  if (world.health.get(it.ownerId)?.alive !== true) return "ownerDead";
  return null;
}

/**
 * 純判定（⛔ 不改任何狀態）：`entity` 此刻接不接得了 `objectId`。
 * ⭐ 規則只住這裡 —— `acceptInteractable` 與 host 的 bot 規則（`Tier0Brain`）都呼叫它，⛔ 不各抄一份。
 */
export function checkInteractable(world: SimWorld, entity: EntityId, objectId: EntityId): InteractResult {
  const it = world.interactable.get(objectId);
  if (!it || lapsedReason(world, objectId) !== null) return "gone";
  if (entity === it.ownerId) return "owner";
  if (world.health.get(entity)?.alive !== true) return "dead";
  const ownerTeam = world.team.get(it.ownerId)?.teamId;
  if (ownerTeam === undefined || world.team.get(entity)?.teamId !== ownerTeam) return "enemy";
  if (it.acceptedBy.includes(entity)) return "already-accepted";
  const t = world.transform.get(entity);
  if (!t || t.zone !== it.zone) return "too-far";
  const dx = t.pos.x - it.center.x;
  const dz = t.pos.z - it.center.z;
  const reach = it.radius + t.radius;
  if (dx * dx + dz * dz > reach * reach) return "too-far";
  return "ok";
}

export function acceptInteractable(world: SimWorld, entity: EntityId, objectId: EntityId): InteractResult {
  const verdict = checkInteractable(world, entity, objectId);
  if (verdict !== "ok") return verdict;
  const it = world.interactable.get(objectId)!;
  it.usesLeft -= 1;
  it.acceptedBy = [...it.acceptedBy, entity].sort((a, b) => a - b);
  world.emit("interactAccepted", { id: objectId, by: entity, owner: it.ownerId, origin: it.origin, usesLeft: it.usesLeft });
  // ⭐ 點燈是一個新的玩家決定 ⇒ 放下還在走的那一段移動（走向燈籠的那一道）。
  //   ⛔ 少了這一行：飛回施法者之後 sticky 的 moveTarget 還指著燈籠，人會自己走回去 —— 搭了等於沒搭。
  const nav = world.nav.get(entity);
  if (nav) nav.moveTarget = null;
  runEffects(it.onAccept, {
    castInstance: it.castInstance,
    world,
    caster: it.ownerId,
    rank: it.rank,
    targets: [entity],
    point: { x: it.center.x, z: it.center.z },
    origin: it.origin,
    abilitySlot: it.abilitySlot,
    rng: world.rng,
  });
  if (it.usesLeft <= 0 && world.interactable.has(objectId)) endInteractable(world, objectId, "used");
  return "ok";
}

export function interactableSystem(world: SimWorld): void {
  if (world.interactable.size === 0) return;
  for (const id of [...world.interactable.keys()].sort((a, b) => a - b)) {
    const reason = lapsedReason(world, id);
    if (reason !== null) endInteractable(world, id, reason);
  }
}

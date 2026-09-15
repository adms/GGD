/**
 * 【互動物】的客戶端那一半（GH#1189 瑟雷西 W 燈籠）—— 三件事，同一個住處：
 *
 *   ① **點得到哪幾盞**：`interactableSpawn` / `interactableEnd`（`vfx/VfxSystem` 的事件排水口）寫進這張表；
 *   ② **右鍵點到燈要送什麼**：身體碰到接受圈 ⇒ `interact{objectId}`；還沒 ⇒ 先走過去；
 *   ③ **被拒要說什麼**：`interactRejected` → 告示（`ui/castAnnounce` 呼叫）。
 *
 * ⭐ 客戶端只做**方便點**的過濾（我隊的、不是我放的）—— ⛔ 不是閘：
 *   隊伍／距離／存活／有效性由伺服器逐次驗（`packages/shared/src/sim/interactables.ts`）。
 * NO @babylonjs imports（InputCapture 的規矩）。
 */
import type { Command, Order } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import type { InteractableSpawnEvent } from "@ggd/shared/sim/effects/spawnInteractable";
import { asEntityId } from "@ggd/shared/ids";
import type { CastNotice } from "../ui/castFeedback";
import { casterOf, type AllyCaster } from "./allyTargets";

const live = new Map<number, InteractableSpawnEvent>();

export function noteInteractableSpawn(p: InteractableSpawnEvent): void {
  live.set(p.id, p);
}
export function noteInteractableEnd(id: number): void {
  live.delete(id);
}
export function clearInteractables(): void {
  live.clear();
}

/** 地面點下、**我隊**而且**不是我放的**那一盞（重疊取 id 最小）；沒有 ⇒ null。 */
export function pickInteractableAt(ground: Vec2, me: AllyCaster | null = casterOf(0)): InteractableSpawnEvent | null {
  if (!me) return null;
  for (const id of [...live.keys()].sort((a, b) => a - b)) {
    const it = live.get(id)!;
    if (it.teamId !== me.teamId || it.owner === me.entityId) continue;
    const dx = ground.x - it.x;
    const dz = ground.z - it.z;
    if (dx * dx + dz * dz <= it.radius * it.radius) return it;
  }
  return null;
}

/**
 * 右鍵點在燈上。⭐ 兩者擇一，⛔ 不同時送：一起送的話，飛回施法者之後那道「走到燈旁」的移動
 * 還黏在身上（orders are sticky），人會自己走回燈籠 —— 搭了等於沒搭。
 */
export function mapInteractClick(
  it: InteractableSpawnEvent,
  selfPos: Vec2 | null,
): { kind: "command"; command: Command } | { kind: "order"; order: Order } {
  const dx = selfPos === null ? 0 : selfPos.x - it.x;
  const dz = selfPos === null ? 0 : selfPos.z - it.z;
  const inReach = selfPos !== null && dx * dx + dz * dz <= it.radius * it.radius;
  return inReach
    ? { kind: "command", command: { kind: "interact", objectId: asEntityId(it.id) } }
    : { kind: "order", order: { kind: "move", point: { x: it.x, z: it.z } } };
}

const REJECT_TEXT: Readonly<Record<string, string>> = {
  gone: "燈籠已經消失了",
  owner: "不能點自己放的燈籠",
  dead: "陣亡時不能點燈籠",
  enemy: "那不是我方的燈籠",
  "already-accepted": "已經搭乘過這盞燈籠",
  "too-far": "離燈籠太遠了，再走近一點",
};

let seq = 950_000;

/** PURE：一顆 `interactRejected` → 告示；不是給我的 ⇒ null。 */
export function interactRejectionFromEvent(
  ev: { type: string; data: Record<string, unknown> },
  localEntityId: number | null,
): CastNotice | null {
  if (ev.type !== "interactRejected" || localEntityId === null || ev.data.entity !== localEntityId) return null;
  const reason = typeof ev.data.reason === "string" ? ev.data.reason : "";
  return { slot: null, abilityName: "點燈", text: `點燈：${REJECT_TEXT[reason] ?? "現在不能點燈"}`, sfx: null, secondsLeft: 0, seq: ++seq };
}

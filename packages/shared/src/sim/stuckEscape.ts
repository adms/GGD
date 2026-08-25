/**
 * 單位互卡**脫困保險絲**（GH#677, owner 2026-08-24：「黏超過 N秒一定可以離開
 * 之類，這些機制做成後台開關，目前 **N 預設2秒**」）。
 *
 * ── 為什麼 `walkIsStalled` 的計數器救不了互卡 ──────────────────────────────
 * `Transform.vel` 是 `MovementSystem` 步驟 2（分離 pass **之前**）寫的：被人群
 * 原地頂回來的單位每 tick 先走滿一步、再被 `separatePair` 推回原點 —— vel 永遠
 * 報滿速，`world.walkStall` 永遠是 0。所以這裡的位移量的是 **tick 與 tick 之間
 * 的實際座標差**；⛔ 但**門**（有 move 指令、還沒到站、被硬控按住不算）與那一族
 * 完全共用 —— 判準活在 `OrderSystem.updateWalkStall` 一處，這裡只是它的第二個
 * 消費者（verdict 由那裡算好傳進來，⛔ 這個檔案裡沒有第二份 stall 偵測）。
 *
 * ── 脫困手段：phasing，⛔ 不是瞬移 ─────────────────────────────────────────
 * 觸發後 `releaseSec` 內 `stuckEscapePhasing()` 回 true，`MovementSystem` 的
 * 單位軟分離（`separatePair`）跳過含他的每一對 —— 他走得穿人牆。
 * ⚠️ 界線：牆 / 柱子 / 場界 / 守護者（static prop）一格都不豁免 ——
 * `moveWithCollision` / `pushOutOfObstacle` / `clampToBoundary` 原封不動。
 * ⭐ 觸發也閘在「此刻真的與別的會擋路的單位重疊」上：卡在純牆上的人不觸發
 * （phasing 幫不了他，觸發只會白喊「脫困」—— 與 `stuckGuard` 的
 * 「放不了人的時候不喊掙脫」同一條紀律）。
 *
 * ── purity ──────────────────────────────────────────────────────────────
 * 無 rng、無時鐘、無三角、無 `**`；到期用絕對 tick（`releaseUntil`）。
 * 狀態住 WeakMap（與 `combat/hitstopHold.ts` 的 `stuckStates` 同一個前例）：
 * 只做 key 存取、永不迭代；由決定性輸入推導 ⇒ 刻意不進 digest。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import { DEFAULT_STUCK_ESCAPE, type StuckEscapeRules } from "./combatFeel";
import { distSq } from "./math/vec2";
// 放行的可見回饋走 `floatingText` 這條**既有**的事件路（型別在 emit 站旁邊,
// GH#571 修好的那條）。`import type` —— 零 runtime 相依,不成環。
import type { FloatingTextEvent } from "./effects/clientCues";

/** 這一份世界的保險絲規則。⛔ 不要直接讀 `world.combatFeel.stuckEscape!`。 */
export function stuckEscapeRules(world: SimWorld): StuckEscapeRules {
  return world.combatFeel.stuckEscape ?? DEFAULT_STUCK_ESCAPE;
}

/**
 * `updateWalkStall` 這一 tick 對這具身體的判定 —— 三態與那一族的三條路一一對應：
 *   `idle`   = 沒有 move 指令 / 已到站（計數歸零那條路）
 *   `frozen` = 被硬控按住（`ccPausesStall`：不累積也不歸零那條路）
 *   `walk`   = 手上有走位、還沒到站、沒被按住 —— 才輪到量位移
 */
export type WalkStallVerdict = "idle" | "frozen" | "walk";

interface EscState {
  /** 累積的「想走但實際位移 < ε」tick 數。 */
  held: number;
  /** 放行窗的到期 tick（絕對 tick；0 = 沒有放行窗）。 */
  releaseUntil: number;
  /** 上一次記帳的 tick —— 斷帳（死亡那幾 tick / 被背走）超過 1 tick 就重數。 */
  lastTick: number;
  /** 上一 tick 的實際座標（null = 剛開帳，這一 tick 只記不量）。 */
  prev: { x: number; z: number } | null;
}

/** 逐 world 的保險絲狀態（前例：hitstopHold.ts 的 `stuckStates`）。 */
const escStates = new WeakMap<SimWorld, Map<EntityId, EscState>>();

function escState(world: SimWorld, id: EntityId): EscState {
  let per = escStates.get(world);
  if (per === undefined) {
    per = new Map();
    escStates.set(world, per);
  }
  let st = per.get(id);
  if (st === undefined) {
    st = { held: 0, releaseUntil: 0, lastTick: world.tick, prev: null };
    per.set(id, st);
  }
  return st;
}

/**
 * 這一 tick，這具身體在保險絲的**放行窗**內嗎？（`MovementSystem` 的軟分離
 * 對含他的每一對讀這一句。）
 */
export function stuckEscapePhasing(world: SimWorld, id: EntityId): boolean {
  if (!stuckEscapeRules(world).enabled) return false;
  const st = escStates.get(world)?.get(id);
  return st !== undefined && world.tick < st.releaseUntil;
}

/**
 * 此刻他是不是真的與別的**會擋路的**單位重疊 —— 觸發前的最後一道閘。
 * 排除的名單與 `MovementSystem` 分離 pass 的豁免一致：投射物 / 復活圈 / 金幣 /
 * 光環載體不是身體；花與守護者是 static prop（phasing 不豁免它們，卡在它們
 * 身上 phasing 也救不了）；死人不擋路。
 */
function overlappingLiveUnit(world: SimWorld, id: EntityId): boolean {
  const t = world.transform.get(id);
  if (t === undefined) return false;
  const near = world.grid.queryCircle(t.pos, t.radius + 2);
  for (const otherId of near) {
    if (otherId === id) continue;
    if (world.projectile.has(otherId)) continue;
    if (world.reviveCircle.has(otherId)) continue;
    if (world.coin.has(otherId)) continue;
    if (world.auraCarrier.has(otherId)) continue;
    if (world.flower.has(otherId) || world.structure.has(otherId)) continue;
    const o = world.transform.get(otherId);
    if (o === undefined || o.zone !== t.zone) continue;
    const oHp = world.health.get(otherId);
    if (oHp !== undefined && !oHp.alive) continue;
    const rr = t.radius + o.radius;
    if (distSq(t.pos, o.pos) < rr * rr) return true;
  }
  return false;
}

/**
 * 保險絲的逐 tick 記帳。`OrderSystem.updateWalkStall` 對每一位英雄呼叫一次
 * （⛔ 只有英雄 —— 與 `stuckGuardTick` 同一個理由：保險絲救的是玩家的方向盤，
 * 1,000 隻殭屍逐 tick 記帳是白燒的錢）。`verdict` 是那一族算好的門。
 */
export function stuckEscapeTick(world: SimWorld, id: EntityId, verdict: WalkStallVerdict): void {
  const rules = stuckEscapeRules(world);
  if (!rules.enabled) return;
  const t = world.transform.get(id);
  if (t === undefined) return;
  const st = escState(world, id);
  const gap = world.tick - st.lastTick;
  st.lastTick = world.tick;
  const prev = st.prev;
  st.prev = { x: t.pos.x, z: t.pos.z };
  if (gap > 1) {
    // 斷帳（死亡那幾 tick / 被背走）→ 重數,別讓上一條命的累積借給這一條。
    st.held = 0;
    return;
  }
  if (verdict === "frozen") return; // 硬控:不累積也不歸零(凍結,同 ccPausesStall)
  if (verdict === "idle") {
    st.held = 0;
    return;
  }
  if (world.tick < st.releaseUntil) {
    // 放行窗內不累積 —— 窗結束之後才重新蒐證(否則卡牆的人會把窗無限續期)。
    st.held = 0;
    return;
  }
  const hp = world.health.get(id);
  if (hp !== undefined && !hp.alive) {
    // 屍體的 move 指令不是「想走」—— 累積下去只會在屍體頭上喊脫困。
    st.held = 0;
    return;
  }
  if (prev === null) return; // 剛開帳:這一 tick 只記座標,下一 tick 才量得出位移
  // 實際位移(⛔ 不是 t.vel —— 檔頭:分離 pass 之前寫的 vel 對互卡永遠說謊)。
  // 「走不動」門檻沿用那一族的 stallSpeed(同一個問題只該有一個門檻的量級)。
  const ae = world.combatFeel.autoEngage;
  const stallSpeed = ae !== undefined ? ae.stallSpeed : 0.5;
  const eps = stallSpeed * world.dt;
  if (distSq(t.pos, prev) >= eps * eps) {
    st.held = 0;
    return;
  }
  st.held += 1;
  const thresholdTicks = Math.max(1, Math.round(rules.thresholdSec / world.dt));
  const releaseTicks = Math.round(rules.releaseSec / world.dt);
  if (st.held < thresholdTicks || releaseTicks <= 0) return;
  // ⭐ 最後一道閘:真的是「被單位堵住」才放行 —— 卡在純牆上 phasing 救不了,
  //   觸發只會白喊「脫困」(而牆的正解是 autoEngage / 導航表,不是這裡)。
  if (!overlappingLiveUnit(world, id)) return;
  st.releaseUntil = world.tick + releaseTicks;
  st.held = 0;
  emitStuckEscape(world, id);
}

/**
 * 放行的可見回饋 —— 頭上冒「脫困」。走 `floatingText` 這條**既有**的事件路
 * （typed payload + fanout 已放行），⛔ 不開新協定欄位。
 * 與 `hitstopHold.ts` 的「掙脫」同一個形狀。
 *
 * ⚠️ **這一段在 2026-08-25 之前寫著「客戶端 `FloatingTextFx` 真的在畫」，而那是假的**
 * （第三守則：註解會說謊）。S7 lane 量到：sim 發了、`VfxSystem` 收了、池子裡是
 * active 的 —— 而**截圖上一個像素都沒有**，因為 `floatingTextEntries` 的消費端
 * 全 repo 只有一個**測試**。GH#701 補上了渲染那一半
 * （`apps/client/src/ui/WorldAnchorLayer.tsx` 的「技能浮字」段）。
 * ⛔ 這裡不要再替客戶端作證 —— 要問「畫得出來嗎」就去看那條守衛
 * （`ui/floatingTextRenders.test.ts`）。
 */
function emitStuckEscape(world: SimWorld, id: EntityId): void {
  const t = world.transform.get(id);
  if (t === undefined) return;
  const payload: FloatingTextEvent = {
    text: "脫困",
    colorRgb: [150, 230, 255],
    sizeScale: 1.2,
    durationSec: 1,
    subjects: [{ id, x: t.pos.x, z: t.pos.z }],
    caster: id,
    zone: t.zone,
  };
  world.emit("floatingText", payload as unknown as Record<string, unknown>);
}

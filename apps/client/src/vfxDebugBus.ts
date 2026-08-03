/**
 * vfxDebugBus —「**現在**有哪些粒子發射器在跑、**在哪裡**」。
 *
 * GH#270：owner 回報「第二回合才出現的大片橘黃色飄浮火焰，而且有一團完全在
 * 場地外的黑色空間裡」。這個缺陷已經被誤判兩次（先判成復活圈並據此出了
 * v0.9.30，再判成火把 `arenaFire`，而那個出貨值已經是 `enabled:false`）。
 * 兩次都是**猜名字**，因為沒有人量過場上真的有什麼。
 *
 * 這個模組就是那一次測量，做成一個玩家端可以打開的面板 ——
 * owner 明說**不想開 console**，而且他要在**已經部署的線上**用它，所以它是
 * 一個設定開關（`network.showVfxDebug`），不是 build flag（CLAUDE.md 第一守則）。
 *
 * ── 三個會讓這張表說謊的陷阱，逐條寫在這裡，因為它們全都很好踩 ────────────
 *
 * ① **`emitter` 可能是 `Vector3`，也可能是 `AbstractMesh`。** Babylon 兩種都吃
 *    （`IParticleSystem.emitter: Nullable<AbstractMesh | Vector3>`）。是 mesh 的
 *    時候 `emitter.x` 是 `undefined`，`emitter.position` 是**本地**座標 —— 直接讀
 *    x/y/z 會讓「掛在角色身上的特效」整類顯示成 `undefined` 或 0,0，而那正是
 *    最可能的兇手類別（跨回合殘留的角色掛件）。所以 `emitterPlacement()`
 *    **先看 `absolutePosition`（世界座標），後看 x/y/z**，順序反過來就錯了。
 *
 * ② **不從全域抓 scene。** `BABYLON.Engine.LastCreatedScene` 在出貨的
 *    minify + tree-shaken bundle 裡不存在（owner 已經被這個擋過一次）。
 *    `Renderer` 建構時把**它自己持有的那一份** scene 註冊進來，dispose 時清掉。
 *
 * ③ **不擾動被量的東西。** 這裡只有讀取：沒有 `start()` / `stop()` / `dispose()`，
 *    也沒有 `getAbsolutePosition()`（那支會呼叫 `computeWorldMatrix()`）——
 *    讀的是 `absolutePosition` 這個純 getter，最多晚一幀（~16ms），
 *    對「在不在場地上」這個問題完全夠用。取樣頻率由面板自己節流（3 Hz）。
 *
 * ── 為什麼結構型別而不是 import Babylon ────────────────────────────────────
 * `ui/` 底下**禁止** import `@babylonjs`（見 HudRoot 檔頭），而面板要讀這些
 * 欄位。所以這裡只宣告面板真的會讀的那五格，`Scene` / `IParticleSystem`
 * 結構上自然吻合，jsdom 測試也能餵假的進來（含一個 Vector3 emitter、
 * 一個 mesh emitter）而不需要 WebGL。
 */

/** 一個發射器的世界座標。 */
export interface VfxEmitterPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * 這個發射器的位置是**怎麼來的**：
 *   mesh  — 掛在一個節點上，讀的是該節點的 `absolutePosition`（世界座標）
 *   point — 一顆固定的 `Vector3`
 *   none  — `emitter` 是 null，或不是上面兩種（沒有位置可說）
 */
export type VfxEmitterAttach = "mesh" | "point" | "none";

/** 面板上的一列。 */
export interface VfxEmitterRow {
  name: string;
  /** `isStarted()` —— 「還在生」與「只是舊粒子還沒消」是兩種不同的缺陷 */
  emitting: boolean;
  emitRate: number;
  /** `getActiveCount()` —— 區分「一個瘋狂發射器」與「一百個各發一點」 */
  alive: number;
  pos: VfxEmitterPoint | null;
  attach: VfxEmitterAttach;
  /** mesh emitter 的節點名字（`attach !== "mesh"` 時是 null） */
  attachedTo: string | null;
}

export interface VfxEmitterSnapshot {
  /** 有沒有一個 scene 可讀。false ⇒ 面板要說「沒接上」，不可以畫成空表 */
  bound: boolean;
  /** scene 上一共有幾個粒子系統（**截斷前**） */
  total: number;
  /** 所有粒子系統的活粒子總和 */
  aliveTotal: number;
  /** 已排序（活粒子多→少）並已截斷的那幾列 */
  rows: VfxEmitterRow[];
  /** 被截掉幾個。面板必須把這個數字說出來 —— 不准靜默截斷 */
  hidden: number;
}

/**
 * 一頁最多畫幾列。有上界是刻意的（一場戰鬥可以有上百個系統，畫滿就等於沒畫），
 * 超過的部分由 `hidden` 說出來。
 */
export const VFX_DEBUG_ROW_CAP = 30;

export const EMPTY_VFX_SNAPSHOT: VfxEmitterSnapshot = {
  bound: false,
  total: 0,
  aliveTotal: 0,
  rows: [],
  hidden: 0,
};

/** 只宣告面板真的會讀的那幾格 —— 見檔頭「為什麼結構型別」。 */
export interface VfxDebugEmitter {
  readonly name: string;
  readonly emitRate: number;
  readonly emitter: unknown;
  isStarted(): boolean;
  getActiveCount(): number;
}

export interface VfxDebugScene {
  readonly particleSystems: readonly VfxDebugEmitter[];
}

let bound: VfxDebugScene | null = null;

/**
 * 把**應用程式自己持有的那一份** scene 交給診斷面板（`render/Renderer` 在
 * 建構時呼叫，dispose 時傳 null）。見檔頭 ②：不從任何全域抓。
 */
export function setVfxDebugScene(scene: VfxDebugScene | null): void {
  bound = scene;
}

/** 純函式：從一個值裡讀出 x/y/z，三個都要是有限數才算。 */
function readPoint(v: unknown): VfxEmitterPoint | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as { x?: unknown; y?: unknown; z?: unknown };
  if (!Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.z)) return null;
  return { x: o.x as number, y: o.y as number, z: o.z as number };
}

/**
 * 一個 `emitter` 到底在哪裡。**順序是這支函式的全部價值** —— 見檔頭 ①：
 * mesh 也有 x/y/z（`position`，本地座標）的親戚欄位，先問 `absolutePosition`
 * 才問 x/y/z，反過來就會把整類掛件特效報成錯的座標。
 */
export function emitterPlacement(
  emitter: unknown,
): Pick<VfxEmitterRow, "pos" | "attach" | "attachedTo"> {
  if (emitter === null || emitter === undefined || typeof emitter !== "object") {
    return { pos: null, attach: "none", attachedTo: null };
  }
  const node = emitter as { absolutePosition?: unknown; name?: unknown };
  const world = readPoint(node.absolutePosition);
  if (world !== null) {
    return {
      pos: world,
      attach: "mesh",
      attachedTo: typeof node.name === "string" && node.name !== "" ? node.name : null,
    };
  }
  const point = readPoint(emitter);
  if (point !== null) return { pos: point, attach: "point", attachedTo: null };
  return { pos: null, attach: "none", attachedTo: null };
}

/**
 * 純函式版本（測試餵假 scene 用的就是這一支）。
 *
 * 排序：**活粒子由多到少** —— 一眼看到誰佔畫面。同數再比 emitRate，
 * 最後比名字，讓同一幀的輸出是穩定的（不會每次取樣就跳來跳去）。
 */
export function sampleVfxEmitters(
  scene: VfxDebugScene | null,
  limit: number = VFX_DEBUG_ROW_CAP,
): VfxEmitterSnapshot {
  if (scene === null) return { ...EMPTY_VFX_SNAPSHOT, rows: [] };
  const rows: VfxEmitterRow[] = [];
  let aliveTotal = 0;
  for (const ps of scene.particleSystems ?? []) {
    // ⚠️ 沒有 try/catch：一個丟例外的粒子系統應該讓這一格 HUD boundary 亮起來
    // 說「特效發射器診斷 顯示不出來」，而不是靜靜地報一個假的 0
    // （CLAUDE.md：fail-open 沒錯，**靜默**才是缺陷）。
    const alive = ps.getActiveCount();
    aliveTotal += Number.isFinite(alive) ? alive : 0;
    rows.push({
      name: typeof ps.name === "string" && ps.name !== "" ? ps.name : "(unnamed)",
      emitting: ps.isStarted() === true,
      emitRate: Number.isFinite(ps.emitRate) ? ps.emitRate : 0,
      alive: Number.isFinite(alive) ? alive : 0,
      ...emitterPlacement(ps.emitter),
    });
  }
  rows.sort(
    (a, b) => b.alive - a.alive || b.emitRate - a.emitRate || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const cap = Math.max(0, Math.floor(limit));
  const shown = rows.slice(0, cap);
  return {
    bound: true,
    total: rows.length,
    aliveTotal,
    rows: shown,
    hidden: rows.length - shown.length,
  };
}

/** 讀目前註冊進來的那個 scene。面板每 ~3 Hz 呼叫一次。 */
export function readVfxEmitters(limit: number = VFX_DEBUG_ROW_CAP): VfxEmitterSnapshot {
  return sampleVfxEmitters(bound, limit);
}

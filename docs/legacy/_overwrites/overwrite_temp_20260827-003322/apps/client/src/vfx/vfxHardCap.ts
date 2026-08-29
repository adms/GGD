/**
 * vfxHardCap —— ⏳ **終極**壽命上限（GH#570）。
 *
 * owner 2026-08-23（逐字，⭐ 這是一條**常設規定**）：
 *
 * > 「我發現**還是有特效超過三秒以上停留在場上**（老毛病，**飛向天空的殘留
 * >  半透明煙霧**），請妳作一個**終極限制，不管什麼特效，包含技能、場地特效等，
 * >  產生後生命週期最多維持三秒，三秒後一律強制清理回收**」
 *
 * ---------------------------------------------------------------------------
 * ⭐ 那份「飛向天空的半透明煙霧」是誰（量到的，⛔ 不是憑印象）
 * ---------------------------------------------------------------------------
 * `content/config/ability-vfx-bindings.json` 把 `godie-u010.q` 與 `godie-u010.r`
 * 綁在 **FlamesSmoke** 四支發射器上，而 `fx.w3x.particle.flamessmoke.p03` 是
 * `assets/textures/particles/smoke_07.png` × `blendMode: "alpha"`（半透明）×
 * 近乎垂直的錐（`emitter.angleDeg: 1`）× 速度 2.2–6.7（往上噴）——
 * 逐格對得上 owner 的那一句話。
 *
 * ⚠️ 而**既有的三道閘全部是綠的**：
 *   · `vfxFadeOutMaxSec`（#569）夾的是**一顆粒子**的尾段 ⇒ p03 從 5 秒被夾到 3.0 秒 ✅
 *   · `castMoteEmitShare`（#569）夾的是**施法光柱餘燼**的生成窗口 ⇒ 不是這一族
 *   · `ringCapForRoundBoundary`（#262）在**回合邊界**修剪 free-list ⇒ 慢了幾十秒
 *
 * ⇒ 漏掉的是**效果**這一層：`W3xCastFx` 發射 0.55 秒，然後 `W3xEmitterRig` 要等
 * `drainingSec >= maxLifeSec`（＝那 3.0 秒）才 `release()`。**0.55 + 3.0 = 3.55 秒**，
 * 而那 3.0 秒的排空完全在上面三道閘的外面 —— 每一個零件都對，只有它們的**總和**超標
 * （第一·五守則點名的那個形狀）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼是**一個**掃描器，⛔ 不是每一種特效各加一次
 * ---------------------------------------------------------------------------
 * 第〇·五守則：機制住引擎、參數住資料。「三秒到就回收」是**一個機制**，而
 * 「哪一族特效是常駐的」是**資料**。逐層加 `if (age > 3)` 是 N 份會各自腐爛的
 * 程式，而且下一條新的特效通道（今年已經加了 `ModelFxRig`）一定會忘掉那一行。
 *
 * ⭐ 落點是「**資源真的被建立出來**的那一層」：Babylon 的 `ParticleSystem` 建構子
 * 會把自己 push 進 `scene.particleSystems`，所以**場景自己就是那份登錄表** ——
 * ⛔ 不需要每個呼叫端記得註冊，也就沒有「忘了註冊 = 不會被掃到」這個失敗形態。
 *
 * ---------------------------------------------------------------------------
 * ⏱ 時鐘從哪裡開始：`isAlive()`，⛔ 不是物件被 new 出來的那一刻
 * ---------------------------------------------------------------------------
 * 出貨的粒子系統**幾乎都是池化**的（`VfxSystem.pool` / `W3xEmitterRig.pool` /
 * `AmbientVfx.psPool`）：同一個 JS 物件會被重複點燃幾百次。拿「物件年齡」當時鐘
 * 等於第二次施法就被收掉。
 *
 * ⇒ 時鐘量的是「**連續有粒子在場上多久**」：`isAlive()` 從 false→true 的那一幀
 * 開始計時，回到 false 就歸零。這正好是 owner 說的「產生後⋯停留在場上」，而且
 * 池化重打自動拿到一支新的碼表，⛔ 一個呼叫端都不用改。
 *
 * ---------------------------------------------------------------------------
 * 「強制清理回收」是**第二句話**
 * ---------------------------------------------------------------------------
 * 到期不是「變透明」：`stop()`（不再生）+ `reset()`（在飛的粒子**整批丟掉**）。
 * 之後那顆發射器就是閒置的，GH#270 的 `maxOneShotEmitters` 掃描會把它還回池子
 * 或驅逐掉 —— 也就是資源真的回去了，⛔ 不是留在場上不畫東西。
 * 擁有 mesh 的那兩層（`W3xEmitterRig` 的效果、`ModelFxRig` 的實例）各自把
 * **同一格**當成自己的硬上限，所以 mesh 與 TransformNode 也在同一秒被歸還。
 * ⚠️ 但「各自」在 2026-08-27 之前是**唯一**的一道：rig 的 live-list 漏了
 * （GH#782 的形狀），這裡不會紅也不會收 —— 出貨的圈型模型（oblivionaura／
 * midchilder 魔法陣／tome 環）就永遠留在地上（GH#784 的紫色圈圈）。
 * 🟣 所以掃描器現在也掃 **mesh 半邊**：`modelfx-` 家族的頂層節點吃同一格上限
 * （見 `MODEL_FX_NODE_PREFIX`）。可見性由這裡兜底；記憶體歸還仍是 rig 的職責。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 常駐特效的豁免是**兩格顯式旗標**，⛔ 不是「剛好沒被掃到」
 * ---------------------------------------------------------------------------
 *   ① `markVfxPersistent(ps)` —— 走 vfx 管線建的常駐特效在**建立當下**說出來
 *      （`toParticleSystem` 的 `persistent`，或文件自己的 `vfx@1.ambient`）。
 *      出貨用它的有 `AmbientVfx`（跟著角色活）與 `FireRingFx`（整回合都在）。
 *   ② `vfxHardCapExemptPrefixes` —— 一族**不走 vfx 管線**的粒子系統
 *      （`ArenaScene` 的場地火把、金幣/花的光點、投射物拖尾、復活圈餘燼、登入頁）。
 *      它們是 `new ParticleSystem(...)` 直接建的，程式碼在別的柵欄裡，
 *      ⇒ 它們的豁免只能是**資料**。
 *
 * ⛔ 兩格都沒有的東西就是「該被收掉的」—— 這是刻意的預設方向：owner 的原話是
 * 「**不管什麼特效**」，所以漏掉一格豁免的代價是「一個常駐特效被收掉」（看得見、
 * 一格 config 就修好），⛔ 而不是「又有一團煙霧留在場上」（看不見、要再查一輪）。
 */
import {
  vfxHardCapExemptPrefixes,
  vfxHardCapScope,
  vfxHardMaxLifeSec,
} from "./vfxCleanupPolicy";
import type { VfxHardCapScope } from "@ggd/shared/content";

/**
 * 掃描器需要的最小面（`IParticleSystem` **沒有**宣告 `isAlive()`，只有具體的
 * `ParticleSystem` / `GPUParticleSystem` 有，所以它是選用的）。
 */
export interface HardCappedParticleSystem {
  readonly name: string;
  isAlive?(): boolean;
  isStarted(): boolean;
  isStopping(): boolean;
  stop(): void;
  reset(): void;
}

/**
 * 🟣 GH#784 —— 「不管什麼特效」的 **mesh 那一半**需要的最小節點面。
 *
 * 上面的粒子掃描對「模型即特效」（`spawnModelFx` → `render/modelFxRig`）
 * **結構性失明**：那一族是 glb mesh ＋ TransformNode，⛔ 不在
 * `scene.particleSystems` 裡，於是它們的壽命執行**只剩** rig 自己的 live-list
 * 一道 —— 那一道漏了（GH#782 量到的形狀），出貨的圈型模型
 * （oblivionaura／midchilder 魔法陣／tome 環／blackhole）就**永遠留在地上**，
 * 而這裡的「終極上限」從頭到尾是綠的（fail-open 而且靜默）。
 */
export interface HardCappedFxNode {
  readonly name: string;
  readonly parent: { readonly name: string } | null;
  isEnabled(checkAncestors?: boolean): boolean;
  setEnabled(value: boolean): void;
}

/**
 * 掃描器需要的最小場景面（＝ Babylon 自己維護的那份登錄表）。
 *
 * `transformNodes`／`meshes` 是 GH#784 的 mesh 半邊：`TransformNode`／`Mesh`
 * 的建構子會把自己 push 進去，所以**場景仍然是唯一的登錄表** ——
 * ⛔ 不需要 rig 記得註冊。省略（舊測試面）＝ 只掃粒子，行為與 GH#570 逐位元相同。
 */
export interface HardCapScene {
  readonly particleSystems: readonly HardCappedParticleSystem[];
  readonly transformNodes?: readonly HardCappedFxNode[];
  readonly meshes?: readonly HardCappedFxNode[];
}

/**
 * 「模型即特效」節點的命名契約（`render/modelFxRig` 的
 * `modelfx-${modelKey}-${serial}` / `modelfx-axis-…` / `modelfx-${serial}-${n}`）。
 *
 * ⭐ 這個前綴**就是**這一族的 managed 標記：只有 rig 會造這個名字，所以
 * `"managed"` 檔位也掃它，⛔ 不需要 rig 呼叫 `markVfxManaged`（那會把
 * 修法綁進另一條 lane 的檔案柵欄）。
 */
export const MODEL_FX_NODE_PREFIX = "modelfx-";

/**
 * 只掃這一族的**頂層**節點（parent 不是同族）：
 *   · rig 的實例根（parent = null）——正常的那一種；
 *   · 被錯誤 dispose 甩回世界原點的孤兒子節點（#131 的形狀，parent 也會是 null）。
 * ⛔ 子節點（axis／glb clone）不各自計時：關掉根就整棵看不見，而**逐子節點**
 * 關的話，池化重用只重新啟用根 ⇒ 子節點永遠黑掉（下一發看不見）。
 */
function isFxFamilyRoot(node: HardCappedFxNode): boolean {
  if (!node.name.startsWith(MODEL_FX_NODE_PREFIX)) return false;
  const p = node.parent;
  return p === null || typeof p.name !== "string" || !p.name.startsWith(MODEL_FX_NODE_PREFIX);
}

/**
 * ⭐ 常駐特效（⛔ 永遠不收）。WeakSet ⇒ 系統被 dispose 之後這裡不留任何東西。
 */
const PERSISTENT = new WeakSet<object>();
/** vfx 管線自己建的（`"managed"` 檔位只掃這一族）。 */
const MANAGED = new WeakSet<object>();
/** 「連續活著」的碼表：值是它變成 alive 的那一秒。 */
const ACTIVE_SINCE = new WeakMap<object, number>();

/** 標記成常駐特效 —— ⛔ 兜底永遠不碰它。 */
export function markVfxPersistent(ps: object): void {
  PERSISTENT.add(ps);
  MANAGED.delete(ps);
}

/** 標記成「vfx 管線建的、可被回收的」一次性資源。 */
export function markVfxManaged(ps: object): void {
  if (PERSISTENT.has(ps)) return;
  MANAGED.add(ps);
}

/** 這個系統有沒有被明確標成常駐（測試 / 診斷用）。 */
export function isVfxPersistent(ps: object): boolean {
  return PERSISTENT.has(ps);
}

export interface VfxHardCapOptions {
  /** 上限秒數（省略 = 讀後台現在生效的那一格） */
  maxLifeSec?: number;
  /** 涵蓋範圍（省略 = 讀後台） */
  scope?: VfxHardCapScope;
  /** 常駐豁免前綴（省略 = 讀後台） */
  exemptPrefixes?: readonly string[];
}

export interface VfxHardCapSweepResult {
  /** 這一次真的被強制回收的粒子系統數 */
  reclaimed: number;
  /** 這一次納入計時的粒子系統數（豁免的不算） */
  watched: number;
}

/** 這個系統現在有沒有東西在場上（有粒子在飛 / 還在發射）。 */
function isOnScreen(ps: HardCappedParticleSystem): boolean {
  if (typeof ps.isAlive === "function") return ps.isAlive();
  // 沒有 `isAlive()` 的實作（GPU 粒子的某些版本）退回「開過而且還沒排空」。
  return ps.isStarted() && !ps.isStopping();
}

function exempt(name: string, prefixes: readonly string[]): boolean {
  for (const p of prefixes) if (name.startsWith(p)) return true;
  return false;
}

/**
 * 掃一次。回傳這一次收掉幾個 —— ⭐ **會被說出來**（`VfxSystem` 把它累加進診斷
 * 面板讀得到的計數器）：一個靜默的夾子跟沒有夾子在畫面上長得一模一樣，
 * 而這份 repo 已經為此付過兩次代價（CLAUDE.md「fail-open 沒錯，靜默才是缺陷」）。
 *
 * `nowSec` 由呼叫端給（`VfxSystem` 用 `nowMs / 1000`），所以暫停 / 逐格步進的
 * 錄影跟即時播放走同一條路。
 */
export function sweepVfxHardCap(
  scene: HardCapScene,
  nowSec: number,
  opts: VfxHardCapOptions = {},
): VfxHardCapSweepResult {
  const scope = opts.scope ?? vfxHardCapScope();
  if (scope === "off") return { reclaimed: 0, watched: 0 };
  if (!Number.isFinite(nowSec)) return { reclaimed: 0, watched: 0 };
  const maxLifeSec = opts.maxLifeSec ?? vfxHardMaxLifeSec();
  const prefixes = opts.exemptPrefixes ?? vfxHardCapExemptPrefixes();

  let reclaimed = 0;
  let watched = 0;
  for (const ps of scene.particleSystems) {
    if (PERSISTENT.has(ps)) continue;
    if (scope === "managed" && !MANAGED.has(ps)) continue;
    if (exempt(ps.name, prefixes)) continue;
    if (!isOnScreen(ps)) {
      // 排空了 ⇒ 碼表歸零。池化的系統下一次被點燃時拿到的是一支新的碼表。
      ACTIVE_SINCE.delete(ps);
      continue;
    }
    watched++;
    const since = ACTIVE_SINCE.get(ps);
    if (since === undefined) {
      ACTIVE_SINCE.set(ps, nowSec);
      continue;
    }
    if (nowSec - since < maxLifeSec) continue;
    // ⭐ 強制清理回收：不再生 + 在飛的整批丟掉。閒置之後 GH#270 的
    // `maxOneShotEmitters` 掃描會把發射器本身還回池子 / 驅逐掉。
    ps.stop();
    ps.reset();
    ACTIVE_SINCE.delete(ps);
    reclaimed++;
  }

  // 🟣 GH#784 —— mesh 半邊：modelfx- 家族的頂層節點吃**同一格**上限、同一支碼表。
  // 名字前綴＝這一族的 managed 標記（見 MODEL_FX_NODE_PREFIX），所以 "managed"
  // 檔位也掃。`isEnabled()`（含祖先）＝「現在畫得出來」——池子裡的（根已關）
  // 碼表歸零，池化重用拿到新的碼表，與粒子那邊的 isAlive() 同一個語意。
  for (const list of [scene.transformNodes, scene.meshes]) {
    if (!list) continue;
    for (const node of list) {
      if (!isFxFamilyRoot(node)) continue;
      if (PERSISTENT.has(node)) continue;
      if (exempt(node.name, prefixes)) continue;
      if (!node.isEnabled()) {
        ACTIVE_SINCE.delete(node);
        continue;
      }
      watched++;
      const since = ACTIVE_SINCE.get(node);
      if (since === undefined) {
        ACTIVE_SINCE.set(node, nowSec);
        continue;
      }
      if (nowSec - since < maxLifeSec) continue;
      // ⭐ 強制回收（可見性那一半）：關掉整棵。記憶體歸還仍是 rig 的職責
      // （release → free-list），⛔ 這裡不 dispose —— dispose 別條 lane 池子裡
      // 的節點會把重用打斷。rig 的 spawn 會重新 setEnabled(true)（modelFxRig:560），
      // 所以被收掉的池化節點下一發照常可用。
      node.setEnabled(false);
      ACTIVE_SINCE.delete(node);
      reclaimed++;
    }
  }
  return { reclaimed, watched };
}

/**
 * 把所有碼表歸零（回合邊界 / 測試）。⛔ 不碰常駐與 managed 標記 ——
 * 那兩個是「這個東西是什麼」，⛔ 不是「它現在活了多久」。
 */
export function resetVfxHardCapClocks(scene: HardCapScene): void {
  for (const ps of scene.particleSystems) ACTIVE_SINCE.delete(ps);
  // GH#784 —— mesh 半邊的碼表同一時刻歸零（回合邊界剛把 rig 的 live 全 release）。
  for (const list of [scene.transformNodes, scene.meshes]) {
    if (!list) continue;
    for (const node of list) ACTIVE_SINCE.delete(node);
  }
}

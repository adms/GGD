/**
 * roundPurge —— 🧹 GH#819「每回合開始前清理 → 重新盤點 → 載入完成才進入戰鬥」。
 *
 * owner 2026-08-27（逐字，⛔ 這就是需求）：
 * > 「lag 本身沒修 —— 一定是**物件、特效沒回收乾淨**，必要手段就是
 * >  **每回合開始前多一個完整清理重新載入的按鈕** 先試試看」
 * > 「既然做成開關 那就請你**預設是會清理完重新盤點必要物件載入後
 * >  再進入戰鬥回合**」
 *
 * 量到的背景（lane LAG 2026-08-27）：`geo:all` 172 → 344 → 394 跨回合單調在長、
 * 凍結 75.7ms×1 → 102.8ms×4。既有的回合邊界清理（RoundVfxLifecycle → registry
 * 扇出）只把池子「還回 free-list／修剪到 cap」—— 幾何與共用容器留著，於是
 * 每一回合的新 modelKey／新場地都讓場景淨長一截。
 *
 * ── 三個檔位（`config/vfx-cleanup.json` 的 `roundPurgeMode`，出貨 full）────
 *   · off   什麼都不做 —— 逐位元回到 GH#819 之前（**止血閥**）。
 *   · soft  出 combat 那一刻：registry 再扇出一次 ＋ ModelFxRig.hardReset()
 *           （幾何／粒子／free-list／軌真的 dispose；共用容器不動）。
 *   · full  soft ＋ AssetManager.purgeFxContainers()（只丟「只有特效層要過」
 *           的容器 —— GH#558① 的教訓：借來的共用容器不准 dispose）＋
 *           **重新盤點**本場要用的資產並載入，全 ready 才放行進戰鬥。
 *
 * ── 就緒閘 ────────────────────────────────────────────────────────────────
 * 伺服器的 phase 不歸客戶端管，所以「才進入戰鬥」的落地是**畫面側的閘**：
 * purge 排在出 combat 的那一刻（整個商店階段都是載入窗口），下一次進 combat
 * 時若還沒 ready，`gateActive()` 為 true —— GameApp 據此蓋上「回合準備中＋
 * 進度」的遮罩（`roundLoadOverlay`），⛔ 不是黑畫面。等待有保險絲
 * （{@link GATE_FUSE_MS}）：一個永遠不開的閘是另一種 lag —— 超時就放行並在
 * 主控台**說出來**（fail-open 沒錯，靜默才是缺陷）。
 *
 * ⭐ purge 前後各量一次場景計數並印 `[purge] geo 394→176 …` ——
 * 沒有數字分不出「清了」與「以為清了」。
 */
import type { Scene } from "@babylonjs/core/scene";
import type { RoundPurgeMode } from "@ggd/shared/content";
import { COMBAT_PHASE } from "./roundVfxLifecycle";

/** 場景的六類計數（purge 前後各量一次；同 lifecycleLedger 的普查軸）。 */
export interface PurgeCounts {
  geo: number;
  mat: number;
  tex: number;
  ps: number;
  node: number;
  mesh: number;
}

/** 一次 purge 的結果報表（console 與測試都讀這一份，⛔ 不是各自再量）。 */
export interface PurgeReport {
  mode: Exclude<RoundPurgeMode, "off">;
  before: PurgeCounts;
  after: PurgeCounts;
  containersPurged: number;
}

export interface RoundPurgeDeps {
  /** 現在生效的檔位（出貨：`roundPurgeModeOf(vfxCleanupPolicy())`）。 */
  mode(): RoundPurgeMode;
  /** 場景計數（出貨：{@link sceneCounts}(scene)）。 */
  counts(): PurgeCounts;
  /** soft 段①：回合邊界註冊表整份再扇出一次（出貨：`registry.resetForRound("leave")`）。 */
  softReset(): void;
  /** soft 段②：模型即特效的硬重置（出貨：`vfx.hardResetModelFx()`）。 */
  hardResetModelFx(): void;
  /** full 段：丟掉只有特效層要過的共用容器（出貨：`assets.purgeFxContainers()`）。 */
  purgeFxContainers(): number;
  /** 重新盤點：這一場要用的資產路徑（本場英雄 glb ＋ 技能特效模型 glb）。 */
  inventory(): string[];
  /** 載入一份資產（出貨：`assets.load(p, "fx"‖"shared")`；永不 reject 也沒關係，兩邊都算完成）。 */
  loadAsset(path: string): Promise<unknown>;
  /** 盤點載入完成後把 rig 的容器引用補回（出貨：`vfx.warmModelFx(keys)`）。 */
  warmAfterLoad(): void;
  now?(): number;
}

/** 就緒閘的保險絲：等超過這個毫秒數就放行並在主控台說出來。 */
export const GATE_FUSE_MS = 10_000;

export class RoundPurgeCoordinator {
  private prev: string | null = null;
  private readyFlag = true;
  private loadedCount = 0;
  private totalCount = 0;
  private busy = false;
  /** 就緒閘開始等待的時刻（保險絲用；null = 沒在等）。 */
  private waitingSince: number | null = null;
  private fuseBlown = false;
  private last: PurgeReport | null = null;

  constructor(private readonly deps: RoundPurgeDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** 上一次 purge 的報表（測試／`__ggdPurge` 回傳用）。 */
  get lastReport(): PurgeReport | null {
    return this.last;
  }

  /** full 模式的重新盤點載入完了沒（off/soft 恆 true）。 */
  get ready(): boolean {
    return this.readyFlag;
  }

  get progress(): { loaded: number; total: number } {
    return { loaded: this.loadedCount, total: this.totalCount };
  }

  /**
   * 這一幀要不要蓋「回合準備中」遮罩：在 combat 而盤點還沒 ready。
   * ⭐ 帶保險絲 —— 等超過 {@link GATE_FUSE_MS} 就放行（並印出來），
   * ⛔ 一個卡死的閘是另一種 lag。
   */
  gateActive(phase: string): boolean {
    if (this.readyFlag || phase !== COMBAT_PHASE) {
      if (phase !== COMBAT_PHASE) this.waitingSince = null;
      return false;
    }
    const now = this.now();
    if (this.waitingSince === null) this.waitingSince = now;
    if (now - this.waitingSince > GATE_FUSE_MS) {
      if (!this.fuseBlown) {
        this.fuseBlown = true;
        console.warn(
          `[purge] ⛔ 就緒閘等超過 ${GATE_FUSE_MS}ms（${this.loadedCount}/${this.totalCount} 件）—— 放行進戰鬥，剩下的邊打邊載`,
        );
      }
      return false;
    }
    return true;
  }

  /**
   * 餵這一幀的 phase（GameApp frame step 0，排在 `roundVfx.sync` 之後）。
   * 出 combat 的那一幀＝purge 的時機：整個結算＋商店階段都是載入窗口，
   * 「每回合開始前」清理完、載入完的東西正好等在下一次開打之前。
   */
  sync(phase: string): void {
    if (!phase) return; // 掉封包的那幾幀不是邊界（同 RoundVfxLifecycle）
    const prev = this.prev;
    this.prev = phase;
    if (prev === phase) return;
    if (prev === COMBAT_PHASE) void this.purgeNow();
  }

  /**
   * 立刻跑一次清理（自動路徑吃 config 檔位；手動按鈕傳 `"full"` 強制完整）。
   * off（且非手動）＝什麼都不做 —— 逐位元回到 GH#819 之前。
   */
  async purgeNow(force?: Exclude<RoundPurgeMode, "off">): Promise<PurgeReport | null> {
    const mode = force ?? this.deps.mode();
    if (mode === "off" || this.busy) return null;
    this.busy = true;
    try {
      const before = this.deps.counts();
      this.deps.softReset();
      this.deps.hardResetModelFx();
      let containersPurged = 0;
      if (mode === "full") containersPurged = this.deps.purgeFxContainers();
      const after = this.deps.counts();
      const report: PurgeReport = { mode, before, after, containersPurged };
      this.last = report;
      console.info(
        `[purge] mode=${mode} geo ${before.geo}→${after.geo} mat ${before.mat}→${after.mat} ` +
          `tex ${before.tex}→${after.tex} ps ${before.ps}→${after.ps} node ${before.node}→${after.node} ` +
          `mesh ${before.mesh}→${after.mesh} containers −${containersPurged}`,
      );
      if (mode === "full") await this.reinventory();
      else this.deps.warmAfterLoad(); // soft：容器還在快取裡，把 rig 的引用當場補回
      return report;
    } finally {
      this.busy = false;
    }
  }

  /**
   * 重新盤點：問一次「這一場要用什麼」，逐份載入，全部落地才 ready。
   * 失敗的載入也算「落地」（`AssetManager.load` 對缺檔回 null，⛔ 不會 reject）
   * —— 一份 404 的 glb 不可以把整個回合卡在遮罩後面。
   */
  private async reinventory(): Promise<void> {
    const t0 = this.now();
    const paths = this.deps.inventory();
    this.readyFlag = false;
    this.fuseBlown = false;
    this.waitingSince = null;
    this.loadedCount = 0;
    this.totalCount = paths.length;
    await Promise.all(
      paths.map((p) =>
        this.deps.loadAsset(p).then(
          () => {
            this.loadedCount++;
          },
          () => {
            this.loadedCount++;
          },
        ),
      ),
    );
    this.deps.warmAfterLoad();
    this.readyFlag = true;
    console.info(`[purge] 重新盤點 ${paths.length} 件，載入完成 ${Math.round(this.now() - t0)}ms`);
  }
}

/** 出貨的場景計數（六類，⛔ 與 lifecycleLedger 同一個普查軸所以可互相對照）。 */
export function sceneCounts(scene: Scene): PurgeCounts {
  return {
    geo: scene.geometries.length,
    mat: scene.materials.length,
    tex: scene.textures.length,
    ps: scene.particleSystems.length,
    node: scene.transformNodes.length,
    mesh: scene.meshes.length,
  };
}

// ---------------------------------------------------------------------------
// 手動按鈕的接點（PerfOverlay 的 🧹 與主控台 `__ggdPurge()` 都走這裡）
// ---------------------------------------------------------------------------

let active: RoundPurgeCoordinator | null = null;

/** GameApp 建構時綁定；dispose 時傳 null 解綁。 */
export function bindRoundPurge(c: RoundPurgeCoordinator | null): void {
  active = c;
  const g = globalThis as { __ggdPurge?: () => Promise<PurgeReport | null> };
  if (c) g.__ggdPurge = () => c.purgeNow("full");
  else delete g.__ggdPurge;
}

/** 有沒有一場正在跑的比賽可以清（按鈕的 disabled 判準）。 */
export function manualPurgeAvailable(): boolean {
  return active !== null;
}

/** owner 的「完整清理重新載入的按鈕」—— 任何時刻按一次＝立即 full 清理重載。 */
export function triggerManualPurge(): Promise<PurgeReport | null> {
  return active?.purgeNow("full") ?? Promise.resolve(null);
}

/**
 * CastChargeFx —— ⭐ GH#788 蓄力集氣：吟唱夠長的每一次施放，多道細光束從
 * 四周向施法者身體**內縮**，顏色＝**隊伍顏色**。
 *
 * owner 2026-08-27（逐字，票 #788 的裁決）：
 *   「所有吟唱時間超過0.3秒以上都要有蓄力特效（粒子特效從外往身體內縮
 *     多道小光束像集氣一樣如圖但顏色是隊伍顏色光芒）」
 *
 * ── 它是一個機制，不是一支技能（第〇·五守則）──────────────────────────────
 * 觸發點掛在 CastPillarFx 的同一條授權流上（castBegin / castEnd /
 * castInterrupt —— MatchRoom 扇出給每一個客戶端的那一條），所以**每一支**
 * 吟唱 ≥ 門檻的技能自動配上集氣，⛔ 不逐技能加 effects。門檻量的是 sim 夾完
 * `config.cast-time@1` 之後的**最終**窗口（castBegin 帶的就是它），⛔ 不是
 * 技能文件的原始值。
 *
 * ── 與施法光柱（CastPillarFx）疊配，職責不同 ─────────────────────────────
 * 光柱＝讀秒（受害者看「還有多久」），集氣＝蓄力感（能量被吸進身體）。
 * 集氣刻意**窄而亮**（票上點名的風險）：細光束 + 加法混合，不與光柱的大
 * 圓柱搶同一塊畫面。
 *
 * ── 隊色從 wire 解析，⛔ 不寫死紅藍 ──────────────────────────────────────
 * `deps.teamOf(entityId)`（VfxSystem ctx 的同名接縫 → wire 的 teamId）→
 * `render/views/ChampionView.TEAM_COLORS`（隊色的唯一住處，血條、隊環同一
 * 張表）。查不到隊（觀戰早期 / 中立）退回一個**不在四隊色盤裡**的中性白，
 * ⛔ 不是假設藍或紅。
 *
 * ── 預算（COST）───────────────────────────────────────────────────────────
 * ⛔ 零粒子系統 —— 它完全不碰粒子天花板（maxOneShotEmitters 那一族）。
 * 全部成本是池化的薄盒網格：MAX_CHARGES 個 slot × 每 slot ≤ beamCount(≤24)
 * 個 unit box + **一個**共用材質，warm-up 之後每次施放**零配置**。
 * AdaptiveQuality 降級走 `getScale()`（budgetScale）：按比例少畫幾道，
 * 沒被啟用的那幾道連網格都不會建。
 * 每幀工作：每個活 slot 一次 pivot 位移 + 每道可見光束一次 position/scaling
 * 寫入 + 一次材質 alpha 寫入，⛔ 沒有任何 `new`。
 *
 * ── 後台（三個住處，GH#788）─────────────────────────────────────────────
 * `content/config/feel-fx.json` 的 `castCharge` 段 ＋ Zod `DEFAULT_FEEL_FX`
 * ＋ admin FEEL_FX_SPEC。`readCastCharge` 逐格夾回上下界（與 readFeelFx
 * 同一個「寬鬆路徑也守界」的理由）。`enabled=false` = 一鍵回到 GH#788 之前。
 */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Configs, DEFAULT_FEEL_FX, type ConfigFeelFxDoc } from "@ggd/shared/content";
import { TEAM_COLORS } from "../render/views/ChampionView";

/** 集氣段的政策形狀（`config.feel-fx@1` 的 `castCharge`）。 */
export type CastChargeSpec = NonNullable<ConfigFeelFxDoc["castCharge"]>;

/** 出貨預設的唯一住處是 `DEFAULT_FEEL_FX`（第〇·四守則）—— 這裡只取別名。 */
const D: CastChargeSpec = DEFAULT_FEEL_FX.castCharge as CastChargeSpec;

/** 同時最多幾位施法者的集氣（超過就回收最接近吟唱完的那一位）。 */
export const MAX_CHARGES = 12;
/** 開場淡入（ms）——避免光束「憑空滿亮」的爆點。 */
export const CHARGE_IN_MS = 120;
/** 取消／結算後的淡出（ms）。「取消即停」＝停止循環 + 這麼短的一段收光。 */
export const CHARGE_FADE_MS = 140;
/** castEnd 掉包時的兜底：吟唱窗口過後這麼久還沒人喊停就自己熄（ms）。 */
export const CHARGE_OVERRUN_GRACE_MS = 400;
/** 光束匯聚的目標高度（世界單位）—— 英雄 ~1.8u 高，胸口約在這裡。 */
export const CHARGE_CHEST_Y = 1.0;
/** 一道光束的粗細（世界單位）。「窄而亮」的窄 —— 票上點名不與光柱打架。 */
const BEAM_WIDTH = 0.07;
/** 加法混合的 alpha 基底；brightness=2 也到不了 1（見下面 0.95 夾點）。 */
const BASE_ALPHA = 0.55;
/**
 * alpha 的硬上限。`StandardMaterial.needAlphaBlending()` 測的是 `alpha < 1`
 * —— 一個沒夾住的 1.0 會把光束踢出透明 pass，變成蓋住施法者的不透明棒
 * （CastPillarFx 量過同一個坑）。
 */
const ALPHA_CEIL = 0.95;
/** 查不到隊伍時的中性色 —— 刻意**不在** TEAM_COLORS 色盤裡（不假設紅藍）。 */
export const NEUTRAL_CHARGE_RGB: readonly [number, number, number] = [0.92, 0.92, 0.88];
/** 黃金比率小數部 —— 相位/方位的無週期打散（決定性，⛔ 渲染迴圈旁不用 rng）。 */
const GOLDEN = 0.61803398875;
const GOLDEN_ANGLE = 2.39996322973;
/** 光束出生高度相對胸口的擺幅（世界單位）——讓匯聚是 3D 的，不是一個平面圈。 */
const HEIGHT_SPREAD = 0.55;

function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * 把任意輸入解讀成集氣政策。逐格降級 + 夾回 Zod 的上下界（`Configs.tryGet`
 * 是寬鬆路徑，界外數字會走到這裡）—— 與 `readFeelFx` 同一個形狀。
 */
export function readCastCharge(doc: unknown): CastChargeSpec {
  const d = doc as Partial<ConfigFeelFxDoc> | null | undefined;
  if (!d || typeof d !== "object" || d.schema !== "config.feel-fx@1") return D;
  const c = (d.castCharge ?? {}) as Partial<CastChargeSpec>;
  return {
    enabled: bool(c.enabled, D.enabled),
    minCastSec: num(c.minCastSec, 0, 4, D.minCastSec),
    beamCount: Math.round(num(c.beamCount, 1, 24, D.beamCount)),
    convergeSec: num(c.convergeSec, 0.1, 2, D.convergeSec),
    beamLength: num(c.beamLength, 0.2, 4, D.beamLength),
    brightness: num(c.brightness, 0, 2, D.brightness),
    startRadius: num(c.startRadius, 0.5, 6, D.startRadius),
  };
}

/**
 * 內縮行程 0..1 → 0..1（加速吸入：起步慢、末段衝進身體 —— 磁鐵感）。
 * ⭐ 這一條是「集氣」的靈魂：它必須**單調遞增**（光束只會靠近，不會倒退）。
 */
export function chargeTravel(u: number): number {
  const t = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return (1 - t) * (1 - t);
}

/**
 * 一道光束在自己循環裡的長度包絡：出生時從 0 長出來（避免憑空出現的爆點），
 * 接近身體時縮短（被吸收的讀法），到達那一刻歸零。
 */
export function chargeLengthEnv(u: number): number {
  const t = u <= 0 ? 0 : u >= 1 ? 1 : u;
  const grow = Math.min(1, t / 0.15);
  const absorb = 1 - 0.6 * chargeTravel(t);
  const arrive = t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.15) : 1;
  return grow * absorb * arrive;
}

export interface CastChargeDeps {
  /** rendered position of an entity (view space), or null if unknown */
  entityPos(id: number): { x: number; z: number } | null;
  /** wire 的隊伍編號（VfxSystem ctx.teamOf）。缺／null = 中性色。 */
  teamOf?(id: number): number | null;
}

export interface CastChargeOptions {
  /** AdaptiveQuality 的預算倍率（VfxSystem.budgetScale）。預設 1。 */
  getScale?: () => number;
  /** 政策接縫（測試／audition 用）。出貨走 `Configs.tryGet("feel-fx")`。 */
  readPolicy?: () => unknown;
}

interface ChargeSlot {
  pivot: TransformNode;
  beams: Mesh[];
  mat: StandardMaterial;
  /** 每道光束的出生點（pivot 區域座標；胸口固定在 (0, CHEST_Y, 0)）。 */
  spawns: { x: number; y: number; z: number }[];
  /** 每道光束的循環相位（黃金比率打散，⛔ 不同步脈動）。 */
  phases: number[];
  entityId: number;
  phase: "cast" | "fade";
  startMs: number;
  fadeStartMs: number;
  durationMs: number;
  /** 這一次施放實際啟用幾道（AdaptiveQuality 降級後的數字）。 */
  visible: number;
  x: number;
  z: number;
  active: boolean;
}

export class CastChargeFx {
  private readonly slots: ChargeSlot[] = [];
  private readonly byEntity = new Map<number, ChargeSlot>();
  private readonly getScale: () => number;
  /** 解析**一次**（第〇·四守則）—— 後台存檔後玩家下一次重新整理生效。 */
  private readonly spec: CastChargeSpec;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly deps: CastChargeDeps,
    opts: CastChargeOptions = {},
  ) {
    this.getScale = opts.getScale ?? ((): number => 1);
    this.spec = readCastCharge((opts.readPolicy ?? ((): unknown => Configs.tryGet("feel-fx")))());
  }

  /** 正在集氣的施法者數（測試接縫）。 */
  get activeCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.active) n++;
    return n;
  }

  /** 建過的 slot 數 —— 配置高水位（測試接縫）。 */
  get slotCount(): number {
    return this.slots.length;
  }

  /** true = 這位施法者有活的集氣（測試接縫）。 */
  has(entityId: number): boolean {
    return this.byEntity.get(entityId)?.active === true;
  }

  /** 這位施法者的集氣材質（測試接縫：隊色 emissive / alpha 可見性）。 */
  materialOf(entityId: number): StandardMaterial | null {
    const s = this.byEntity.get(entityId);
    return s && s.active ? s.mat : null;
  }

  /** 這位施法者實際啟用的光束網格（測試接縫：內縮＝越更新離胸口越近）。 */
  beamsOf(entityId: number): readonly Mesh[] {
    const s = this.byEntity.get(entityId);
    return s && s.active ? s.beams.slice(0, s.visible) : [];
  }

  /**
   * 一次施放開始。`durationMs` 是 sim 自己的吟唱窗口（castBegin 帶來、
   * cast-time 夾完的最終值）—— 門檻在**這裡**量，⛔ 不在任何技能文件裡。
   */
  begin(entityId: number, durationMs: number, nowMs: number): void {
    if (this.disposed || !this.spec.enabled) return;
    if (!Number.isFinite(durationMs) || durationMs + 1e-6 < this.spec.minCastSec * 1000) return;
    const pos = this.deps.entityPos(entityId);
    // FIX #131 紀律：非有限座標永遠不放加法發光體。
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;

    const slot = this.acquire(entityId, nowMs);
    slot.entityId = entityId;
    slot.phase = "cast";
    slot.startMs = nowMs;
    slot.fadeStartMs = 0;
    slot.durationMs = durationMs;
    slot.x = pos.x;
    slot.z = pos.z;
    // 隊色：wire teamId → TEAM_COLORS（血條/隊環同一張表）。查不到 = 中性白。
    const team = this.deps.teamOf?.(entityId) ?? null;
    const rgb =
      team === null || !Number.isFinite(team)
        ? NEUTRAL_CHARGE_RGB
        : TEAM_COLORS[((team % 4) + 4) % 4]!;
    slot.mat.emissiveColor.set(rgb[0], rgb[1], rgb[2]);
    // AdaptiveQuality：滿畫質畫 beamCount 道，降級按比例少畫（低畫質也至少
    // 留 2 道 —— 集氣是「對面在蓄力」的資訊，不可以降到零）。
    const scale = Math.max(0, Math.min(1.5, this.getScale()));
    slot.visible = Math.max(
      Math.min(2, this.spec.beamCount),
      Math.min(this.spec.beamCount, Math.round(this.spec.beamCount * scale)),
    );
    for (let i = 0; i < slot.beams.length; i++) slot.beams[i]!.setEnabled(i < slot.visible);
    slot.active = true;
    this.byEntity.set(entityId, slot);
    slot.pivot.setEnabled(true);
    this.applyFrame(slot, nowMs);
  }

  /**
   * 吟唱結束了（castEnd 結算 / castInterrupt 打斷都走這裡）——「取消即停」：
   * 循環停止補光束，現有的光在 CHARGE_FADE_MS 內收掉。
   */
  stop(entityId: number, nowMs: number): void {
    const slot = this.byEntity.get(entityId);
    if (!slot || !slot.active || slot.phase !== "cast") return;
    slot.phase = "fade";
    slot.fadeStartMs = nowMs;
  }

  /** 每幀推進（由 CastPillarFx.update 帶動 —— 同一條授權流）。 */
  update(nowMs: number): void {
    if (this.disposed) return;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      const pos = this.deps.entityPos(slot.entityId);
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
        slot.x = pos.x;
        slot.z = pos.z;
      }
      this.applyFrame(slot, nowMs);
    }
  }

  /** 回合邊界／teardown：全部立刻熄（跟著 CastPillarFx.clear 走）。 */
  clear(): void {
    for (const slot of this.slots) this.release(slot);
    this.byEntity.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) {
      slot.mat.dispose();
      for (const b of slot.beams) b.dispose(false, true);
      slot.pivot.dispose();
    }
    this.slots.length = 0;
    this.byEntity.clear();
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private applyFrame(slot: ChargeSlot, nowMs: number): void {
    if (slot.phase === "fade" && nowMs - slot.fadeStartMs >= CHARGE_FADE_MS) {
      this.release(slot);
      return;
    }
    // castEnd 掉包的兜底 —— 一個吟唱窗口早就過完的集氣不可以永遠轉下去。
    if (slot.phase === "cast" && nowMs - slot.startMs > slot.durationMs + CHARGE_OVERRUN_GRACE_MS) {
      this.release(slot);
      return;
    }
    slot.pivot.position.set(slot.x, 0, slot.z);

    const env =
      slot.phase === "cast"
        ? Math.min(1, (nowMs - slot.startMs) / CHARGE_IN_MS)
        : Math.max(0, 1 - (nowMs - slot.fadeStartMs) / CHARGE_FADE_MS);
    slot.mat.alpha = Math.min(ALPHA_CEIL, BASE_ALPHA * this.spec.brightness * env);

    const cycleMs = this.spec.convergeSec * 1000;
    const t = (nowMs - slot.startMs) / Math.max(1, cycleMs);
    for (let i = 0; i < slot.visible; i++) {
      const beam = slot.beams[i]!;
      const sp = slot.spawns[i]!;
      const u = (t + slot.phases[i]!) % 1;
      const e = chargeTravel(u);
      // 胸口固定在 pivot 區域座標 (0, CHEST_Y, 0)：lerp(出生點 → 胸口)
      beam.position.set(sp.x * (1 - e), sp.y + (CHARGE_CHEST_Y - sp.y) * e, sp.z * (1 - e));
      const len = Math.max(0.001, this.spec.beamLength * chargeLengthEnv(u));
      beam.scaling.set(BEAM_WIDTH, BEAM_WIDTH, len);
    }
  }

  private release(slot: ChargeSlot): void {
    if (slot.entityId >= 0 && this.byEntity.get(slot.entityId) === slot) {
      this.byEntity.delete(slot.entityId);
    }
    slot.active = false;
    slot.entityId = -1;
    slot.pivot.setEnabled(false);
  }

  /** 同 CastPillarFx.acquire：自己的 → 閒置的 → 新建 → 回收最接近吟唱完的。 */
  private acquire(entityId: number, nowMs: number): ChargeSlot {
    const own = this.byEntity.get(entityId);
    if (own) return own;
    for (const s of this.slots) if (!s.active) return s;
    if (this.slots.length < MAX_CHARGES) return this.build();
    let best = this.slots[0]!;
    let bestU = -Infinity;
    for (const s of this.slots) {
      const u = (nowMs - s.startMs) / Math.max(1, s.durationMs);
      if (u > bestU) {
        bestU = u;
        best = s;
      }
    }
    this.release(best);
    return best;
  }

  private build(): ChargeSlot {
    const pivot = new TransformNode("cast-charge", this.scene);
    pivot.setEnabled(false);
    const mat = new StandardMaterial("cast-charge-mat", this.scene);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.emissiveColor = new Color3(1, 1, 1);
    // 加法混合：光只會疊亮 —— 集氣永遠遮不住施法者本體（誰在蓄力是資訊）。
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.alpha = 0;

    const beams: Mesh[] = [];
    const spawns: { x: number; y: number; z: number }[] = [];
    const phases: number[] = [];
    const chest = new Vector3(0, CHARGE_CHEST_Y, 0);
    for (let i = 0; i < this.spec.beamCount; i++) {
      // 決定性的打散（⛔ 渲染迴圈旁不用 rng）：黃金角繞圈 + 高度/半徑微擾，
      // 讓匯聚讀成 3D 的能量流而不是一個平面雨傘。
      const theta = i * GOLDEN_ANGLE;
      const r = this.spec.startRadius * (0.85 + 0.3 * ((i * 0.7548776662) % 1));
      const y = CHARGE_CHEST_Y + HEIGHT_SPREAD * Math.sin(i * 1.7 + 0.9);
      const sp = { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
      const beam = MeshBuilder.CreateBox(`cast-charge-beam-${i}`, { size: 1 }, this.scene);
      beam.isPickable = false;
      beam.parent = pivot;
      beam.material = mat;
      beam.position.set(sp.x, sp.y, sp.z);
      beam.lookAt(chest); // 長軸(+Z)指向胸口；行程線是固定的,之後只寫 position/scaling
      beam.scaling.set(BEAM_WIDTH, BEAM_WIDTH, 0.001);
      beams.push(beam);
      spawns.push(sp);
      phases.push((i * GOLDEN) % 1);
    }

    const slot: ChargeSlot = {
      pivot,
      beams,
      mat,
      spawns,
      phases,
      entityId: -1,
      phase: "cast",
      startMs: 0,
      fadeStartMs: 0,
      durationMs: 1,
      visible: beams.length,
      x: 0,
      z: 0,
      active: false,
    };
    this.slots.push(slot);
    return slot;
  }
}

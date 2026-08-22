/**
 * GuardianVolleyFx —— 守衛塔齊射的**投射物**（GH#567）。
 *
 * owner 2026-08-23（逐字）：
 * > 「請補上該物件**伸縮抖一下**然後出現**投射物飛向被攻擊方**的攻擊效果吧」
 *
 * 「伸縮抖一下」由 `guardianRecoilBus` → `GuardianView.update()` 演；
 * 這個檔案只負責**那顆飛過去的東西**。兩件事分開是因為它們住在不同的層
 * （模型 vs 特效），⛔ 不是因為它們是兩個功能。
 *
 * ---------------------------------------------------------------------------
 * 為什麼是 InstancedMesh 而不是粒子
 * ---------------------------------------------------------------------------
 * 這顆球要**被看見它從哪裡出發**。粒子系統的每一顆粒子是獨立的、沒有辦法保證
 * 有一顆一直在「從塔到你」的那條線上；而玩家要讀的正是那條線。所以它是一個
 * 有座標的實體：一顆共用來源網格的 instance，到站那一幀 `dispose()`
 * （和 `GoldPickupFx` 的金幣同一個形狀與同一個回收契約）。
 *
 * ---------------------------------------------------------------------------
 * 三個不可以違反的約束
 * ---------------------------------------------------------------------------
 * 1. **到站時間 = 預告圈填滿的時間**。`volleyTiming` 從 `guardianMark` 的
 *    `impactTick` 算，⛔ 不是一格速度 —— 兩個訊號說不同的話比只有一個更糟。
 * 2. **有上限**。一座塔一次可以標記多名目標、場上可以有多座塔，所以同時在飛的
 *    數量要有硬上限（`MAX_BOLTS`），滿了就丟最舊的那顆，⛔ 不是拒收新的
 *    （拒收新的＝這一發又變回「隱形英雄」）。
 * 3. **回合邊界與離場都清乾淨**。`resetForRound()` / `dispose()` 都把還在飛的
 *    instance 丟掉 —— 一張只長不縮的表就是 GH#270 那一族。
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  IMPACT_Y,
  MUZZLE_Y,
  volleyPoint,
  volleyTiming,
  type VolleyEnd,
} from "./guardianVolley";

/** 同時最多幾顆在飛。12 位英雄 × 一座塔的一輪齊射，再留一倍給多座塔。 */
export const MAX_BOLTS = 24;

/** 投射物直徑（世界單位）。比金幣大、比英雄小 —— 一眼看得到但不遮視野。 */
const BOLT_DIAMETER = 0.5;

/**
 * 中立琥珀色 —— 和塔的地面環（`GuardianView.RING_TINT`）、頭上血條
 * （`overheadAnchors.GUARDIAN_BAR_COLOR`）同一個語彙。
 *
 * ⛔ 刻意**不是**敵方紅：塔對所有人一視同仁，用敵方色會讓玩家以為是某一隊打的
 * （`Telegraph.ts` 對預告圈的顏色寫著同一句話）。
 */
const BOLT_TINT: [number, number, number] = [1.0, 0.74, 0.36];

interface Bolt {
  inst: InstancedMesh;
  from: VolleyEnd;
  to: VolleyEnd;
  /** 絕對時間（ms）。⛔ 不是遞減計數器 */
  startMs: number;
  flightMs: number;
}

export class GuardianVolleyFx {
  private static counter = 0;
  private readonly source: Mesh;
  private readonly bolts: Bolt[] = [];
  private disposed = false;

  constructor(private readonly scene: Scene) {
    this.source = MeshBuilder.CreateSphere(
      `guardianBoltSrc-${GuardianVolleyFx.counter++}`,
      { diameter: BOLT_DIAMETER, segments: 8 },
      scene,
    );
    const mat = new StandardMaterial(`${this.source.name}-mat`, scene);
    // 這個場景沒有 bloom / GlowLayer，「發光」只能靠 emissive（同 CoinView）。
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(BOLT_TINT[0], BOLT_TINT[1], BOLT_TINT[2]);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    this.source.material = mat;
    this.source.isVisible = false;
    this.source.isPickable = false;
  }

  /** 還在飛的顆數（守衛／診斷面板讀它）。 */
  get activeCount(): number {
    return this.bolts.length;
  }

  /**
   * 發一顆：`from`（塔）→ `to`（被標記的落點），在 `windupMs` 之後到站。
   *
   * `windupMs` 就是 `guardianMark` 的 `(impactTick − now)` 窗口；發射動作吃掉
   * 前面一小段，剩下的是飛行 —— 所以球**恰好**在傷害落地那一刻抵達。
   */
  fire(from: { x: number; z: number }, to: { x: number; z: number }, nowMs: number, windupMs: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(from.x) || !Number.isFinite(from.z)) return;
    if (!Number.isFinite(to.x) || !Number.isFinite(to.z)) return;
    const { launchMs, flightMs } = volleyTiming(windupMs);
    // 滿了就丟最舊的那顆：這一發的來源指引比上一發重要（見檔頭約束 2）。
    if (this.bolts.length >= MAX_BOLTS) this.retire(0);
    const inst = this.source.createInstance(`guardianBolt-${GuardianVolleyFx.counter++}`);
    inst.isPickable = false;
    const bolt: Bolt = {
      inst,
      from: { x: from.x, y: MUZZLE_Y, z: from.z },
      to: { x: to.x, y: IMPACT_Y, z: to.z },
      startMs: nowMs + launchMs,
      flightMs,
    };
    this.bolts.push(bolt);
    // 蓄力那一段球還沒出膛 —— 先擺在砲口並藏起來，⛔ 不要讓它在塔裡發光。
    this.place(bolt, 0);
    inst.setEnabled(false);
  }

  /** 推進每一顆。到站的那一顆 `dispose()` 並離開陣列。 */
  update(nowMs: number): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]!;
      const u = (nowMs - b.startMs) / Math.max(1, b.flightMs);
      if (u < 0) continue; // 還在蓄力
      if (u >= 1) {
        this.retire(i);
        continue;
      }
      b.inst.setEnabled(true);
      this.place(b, u);
    }
  }

  /** 回合邊界：還在飛的全部丟掉（來源網格留著，下一回合不必重建）。 */
  resetForRound(): void {
    for (const b of this.bolts) b.inst.dispose();
    this.bolts.length = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resetForRound();
    this.source.material?.dispose();
    this.source.dispose();
  }

  // ── private ───────────────────────────────────────────────────────────────

  private place(b: Bolt, u: number): void {
    const p = volleyPoint(b.from, b.to, u);
    b.inst.position.set(p.x, p.y, p.z);
  }

  private retire(i: number): void {
    this.bolts[i]!.inst.dispose();
    this.bolts.splice(i, 1);
  }
}

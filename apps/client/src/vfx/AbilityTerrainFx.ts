/**
 * AbilityTerrainFx —— **技能生出來的地形**在畫面上的那一半（GH#1223 · GH#1209）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⛔ 為什麼它必須存在
 * ═══════════════════════════════════════════════════════════════════════════
 * 引擎裡有兩族「技能生的、會擋路的東西」，⭐ 而它們**都有唯一的寫端、零個讀端**：
 *
 *   · `spawnObstacle`（GH#1190 鄂爾 Q）—— 一根**真碰撞**圓柱
 *   · `spawnThresholds`（GH#1197 瑟雷西 R）—— 一組**會被撞斷**的牆段
 *
 * ⇒ ⛔ 玩家會撞到**看不見的**東西：碰撞是真的（走不過去、衝刺會停），
 *   而畫面上什麼都沒有。⭐ 那比沒有這個機制更糟。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 一個模組、兩種形狀 —— ⛔ 不是兩份各自腐爛的程式
 * ═══════════════════════════════════════════════════════════════════════════
 * 兩族的生命週期**逐字相同**：`spawn`（帶 id ＋ 幾何）→ 存在 → `break`／`end`（帶同一個 id）。
 * ⇒ ⭐ 差別只有「畫成什麼」：圓柱 vs 一排盒子。
 *   那正是第零守則⑨：**N 個同型 = K 個模板 ＋ 一張表**。
 *
 * ⚠️ ⭐ **id 是 join key**：`spawn` 給的 id 與 `end` 給的必須是同一個，
 * ⛔ 否則網格會變成孤兒（留在場上、永遠不消失）——
 * `dispose()` 之外唯一移得掉它們的就是這張表。
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";

/** ⭐ 柱子的高度（格）。⚠️ 碰撞是 2D 圓 —— 這個數字只影響**看得見的**那一半。 */
export const OBSTACLE_HEIGHT = 3.2;
/** 牆段的高與厚。 */
export const WALL_HEIGHT = 2.4;
export const WALL_THICKNESS = 0.35;

/** `spawnObstacle` 發出來的那一份（⭐ 欄位名與 `sim/effects/spawnObstacle.ts` 的 emit 逐字相同）。 */
export interface ObstacleSpawnPayload {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly durationSec: number;
}

/** `spawnThresholds` 發出來的那一份。 */
export interface ThresholdSpawnPayload {
  readonly id: number;
  readonly segments: readonly { ax: number; az: number; bx: number; bz: number }[];
}

interface Entry {
  readonly meshes: Mesh[];
}

export class AbilityTerrainFx {
  private readonly live = new Map<number, Entry>();
  private obstacleMat: StandardMaterial | null = null;
  private wallMat: StandardMaterial | null = null;

  constructor(private readonly scene: Scene) {}

  /** ⭐ 兩種材質各一份，⛔ 不是每根柱子一份（那是 N 次 shader 編譯）。 */
  private material(kind: "obstacle" | "wall"): StandardMaterial {
    const cached = kind === "obstacle" ? this.obstacleMat : this.wallMat;
    if (cached) return cached;
    const m = new StandardMaterial(`ability-terrain-${kind}`, this.scene);
    // ⚠️ `emissiveColor` ⛔ 不是 `diffuseColor`：競技場的燈光會隨地圖變，
    //   而「這裡走不過去」這個資訊**不可以**因為某張地圖比較暗就看不見。
    m.emissiveColor = kind === "obstacle" ? new Color3(0.42, 0.30, 0.62) : new Color3(0.24, 0.62, 0.72);
    m.diffuseColor = new Color3(0.06, 0.06, 0.10);
    m.specularColor = new Color3(0, 0, 0);
    m.alpha = 0.82;
    if (kind === "obstacle") this.obstacleMat = m;
    else this.wallMat = m;
    return m;
  }

  /** GH#1223 —— 一根柱子。⭐ 半徑與碰撞用的**同一個數字**（⛔ 不另外挑一個「看起來比較好」的）。 */
  spawnObstacle(p: ObstacleSpawnPayload): void {
    this.remove(p.id); // 同一個 id 再生一次 ⇒ 先收掉舊的（⛔ 不留孤兒）
    const mesh = MeshBuilder.CreateCylinder(
      `ability-obstacle-${p.id}`,
      { diameter: p.radius * 2, height: OBSTACLE_HEIGHT, tessellation: 16 },
      this.scene,
    );
    mesh.position.set(p.x, OBSTACLE_HEIGHT / 2, p.z);
    mesh.material = this.material("obstacle");
    mesh.isPickable = false;
    this.live.set(p.id, { meshes: [mesh] });
  }

  /** GH#1209 —— 一組牆段。每一段一個盒子，⭐ 全部掛同一個 id（⛔ 一起退場）。 */
  spawnThresholds(p: ThresholdSpawnPayload): void {
    this.remove(p.id);
    const meshes: Mesh[] = [];
    for (let i = 0; i < p.segments.length; i++) {
      const s = p.segments[i]!;
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (!(len > 0)) continue; // ⛔ 零長度的段畫不出東西 —— 跳過，⛔ 不是畫一個 0 寬的盒子
      const box = MeshBuilder.CreateBox(
        `ability-wall-${p.id}-${i}`,
        { width: len, height: WALL_HEIGHT, depth: WALL_THICKNESS },
        this.scene,
      );
      box.position.set((s.ax + s.bx) / 2, WALL_HEIGHT / 2, (s.az + s.bz) / 2);
      // ⚠️ Babylon 的 Y 旋轉從 +Z 起算 ⇒ `atan2(dx, dz)` 而**不是** `atan2(dz, dx)`。
      box.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
      box.material = this.material("wall");
      box.isPickable = false;
      meshes.push(box);
    }
    if (meshes.length > 0) this.live.set(p.id, { meshes });
  }

  /** GH#1209 —— 一段被撞斷：只收那一段，⛔ 其餘的留著。 */
  breakSegment(id: number, index: number): void {
    const e = this.live.get(id);
    const mesh = e?.meshes[index];
    if (!mesh) return;
    mesh.dispose();
    e!.meshes[index] = undefined as unknown as Mesh;
  }

  /** 退場（到期／撞碎／施法者死亡／回合重置）—— ⭐ 一個 id 收乾淨。 */
  remove(id: number): void {
    const e = this.live.get(id);
    if (!e) return;
    for (const m of e.meshes) m?.dispose();
    this.live.delete(id);
  }

  /** ⭐ 今天場上有幾組（守衛讀它；⛔ 不是掃 scene 的名字字串）。 */
  liveCount(): number {
    return this.live.size;
  }

  dispose(): void {
    for (const id of [...this.live.keys()]) this.remove(id);
    this.obstacleMat?.dispose();
    this.wallMat?.dispose();
    this.obstacleMat = null;
    this.wallMat = null;
  }
}

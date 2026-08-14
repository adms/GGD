/**
 * 圓盤外的 2D 景深背景 —— 渲染側（GH#324 第三層，owner 2026-08-14）。
 *
 * > 「圓盤外的世界 可以生成多張 2D 有景深的景色圖形來顯示補空」
 *
 * 幾何完全由 `@ggd/shared/map/backdrop` 算好（純數字、決定性、零 Babylon），
 * 這裡只負責**把它變成 mesh**。⭐ 這樣切是為了讓**編輯器**用同一份幾何 ——
 * 編輯器裡看到的背景就是玩家看到的背景，⛔ 不是另一份長得像的程式。
 *
 * ## ⚠️ 為什麼不是天空盒
 *
 * 俯角 68° + FOV 45.8° ⇒ 畫面最上緣在水平線**下方 45°**，**地平線永遠不進畫面**。
 * 立起來的東西一個像素都看不到。完整推導在 `shared/map/backdrop.ts` 檔頭。
 *
 * ## 成本
 *
 * 每層 1 個 mesh、1 個材質、`segments × 2` 個三角形（上限 64 段 = 128 面）。
 * 出貨的圖是 3–4 層 ⇒ **3–4 個 draw call、400 面以內**。
 * 對照：一隻英雄 1,500–2,000 面。⚠️ 全部 `freezeWorldMatrix()` +
 * `isPickable = false` + `doNotSyncBoundingInfo` —— 它們永遠不動、永遠不被點。
 *
 * ⭐ `maxLayers` 是後台的一格（`config.ambient-vfx@1` 的 `backdrop`），
 * 所以手機掉幀時 owner 可以把它砍到 1 層，⛔ 不用改程式（第一守則）。
 */
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { BackdropDef } from "@ggd/shared/content";
import type { ArenaBackdropPolicy } from "@ggd/shared/content";
import { backdropSeed, buildBackdropLayer } from "@ggd/shared/map/backdrop";

/** `#rrggbb` → Color3。⚠️ 解析失敗回中灰，⛔ 不是黑 —— 黑跟「沒畫出來」看起來一樣。 */
export function parseHexColor(hex: string): Color3 {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return new Color3(0.5, 0.5, 0.5);
  const n = parseInt(m[1]!, 16);
  return new Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * 這一場實際要畫幾層。
 *
 * ⚠️ 砍的是**尾巴**（最外圈最遠的先消失），⛔ 不是頭 ——
 * 砍頭會在場地邊界旁邊留下一圈黑洞，那比整個關掉還醜。
 * 純函式，測得到。
 */
export function backdropLayerBudget(authored: number, policy: ArenaBackdropPolicy): number {
  if (!policy.enabled) return 0;
  return Math.max(0, Math.min(authored, Math.floor(policy.maxLayers)));
}

/**
 * 建出背景層。回傳建出來的 mesh（呼叫端已經把它們掛在 arenaRoot 底下，
 * `disposeArena` 會連材質一起收掉）。
 */
export function buildBackdrop(
  scene: Scene,
  parent: TransformNode,
  zones: readonly { center: { x: number; z: number }; boundaryRadius: number }[],
  backdrop: BackdropDef,
  arenaId: string,
  policy: ArenaBackdropPolicy,
): Mesh[] {
  const count = backdropLayerBudget(backdrop.layers.length, policy);
  if (count === 0) return [];
  const seed = backdropSeed(arenaId);
  const built: Mesh[] = [];

  zones.forEach((zone, zi) => {
    for (let li = 0; li < count; li++) {
      const layer = backdrop.layers[li]!;
      // ⭐ 本體 + 逆光邊緣。邊緣**共用同一個輪廓函式**，所以不可能錯開。
      const parts: { suffix: string; hex: string; rimWidth?: number; lift: number }[] = [
        { suffix: "", hex: layer.color, lift: 0 },
      ];
      if (layer.rim) {
        // ⚠️ 抬高一點點，否則兩層共面 → z-fighting → 亮帶會隨鏡頭閃爍，
        //    而閃爍看起來像 bug 不像逆光。
        parts.push({ suffix: "-rim", hex: layer.rim.color, rimWidth: layer.rim.width, lift: 0.02 });
      }

      for (const part of parts) {
        const geo = buildBackdropLayer(layer, zone.boundaryRadius, seed, part.rimWidth);
        const mesh = new Mesh(`backdrop-${zi}-${li}${part.suffix}`, scene);
        const vd = new VertexData();
        vd.positions = geo.positions;
        vd.indices = geo.indices;
        // 平面環帶 —— 法線全部朝上，⛔ 不用 ComputeNormals（同一個答案，多一趟迴圈）。
        vd.normals = geo.positions.map((_, i) => (i % 3 === 1 ? 1 : 0));
        vd.applyToMesh(mesh);

        const mat = new StandardMaterial(`backdrop-${zi}-${li}${part.suffix}-mat`, scene);
        const c = parseHexColor(part.hex);
        // ⭐ **完全不吃燈光**（セル画）—— 動漫背景是平塗的，沒有 3D 明暗。
        // ⚠️ 這同時修掉一個真缺陷：沉在 y=-70 的層幾乎吃不到方向光，
        //    只靠 diffuse 會變成近乎純黑 ⇒「有景深」退化成「一片黑」，
        //    而那跟這個功能沒做長得一模一樣（失敗形態①）。
        //    現在**作者填什麼顏色，畫面上就是什麼顏色**。
        mat.disableLighting = true;
        mat.emissiveColor = c;
        mat.diffuseColor = new Color3(0, 0, 0);
        mat.specularColor = new Color3(0, 0, 0);
        mat.alpha = layer.alpha * policy.alphaScale;
        mat.backFaceCulling = true;
        mesh.material = mat;

        mesh.position.set(zone.center.x, part.lift, zone.center.z);
        mesh.isPickable = false;
        mesh.parent = parent;
        mesh.doNotSyncBoundingInfo = true;
        mesh.freezeWorldMatrix();
        built.push(mesh);
      }
    }
  });

  return built;
}

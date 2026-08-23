/**
 * ⭐ GH#610 —— **飄過去的那一片霧**（局部、會動、形狀不規則）。
 *
 * owner 2026-08-23（逐字，⭐ 這一則**推翻**了把「起霧」做成全域濃度的第一版）：
 *
 * > 「⭐ 起霧＝空氣漫反射同一顆旋鈕轉大
 * >  => **不是全場地都霧喔，而是像真實一樣會有一片飄過去，隨機產生不規則形狀霧**」
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 為什麼**不是**體積霧 post-process，也**不是**地面材質上的遮罩
 * ════════════════════════════════════════════════════════════════════════════
 * 三個候選都在 `@babylonjs/core` 裡（⛔ 沒有新套件、⛔ 沒有下載任何貼圖）：
 *
 * | 候選 | 每幀成本 | 俯角 68° 好不好看 | 分割畫面 ×4 | 判決 |
 * |---|---|---|---|---|
 * | **體積霧 post-process**（depth prepass ＋ ray-march） | 一趟 depth ＋ 一趟全螢幕 march | 相機幾乎垂直往下看 ⇒ 光線在霧裡的行程**極短**，ray-march 的錢花在一層看不出厚度的薄膜上 | ⛔ **post-process 是逐相機掛的** ⇒ 四人分割就是 **×4**（`MirrorTexture` / SSR / god rays 已經為**同一個理由**被否決過三次，見 `airScatter.ts` 與 `weather.ts` 的檔頭） | ⛔ |
 * | **地面材質上的動態遮罩** | ⭐ 零（多一張貼圖取樣） | ⛔ 它畫在**地板上** ⇒ 看起來是地上的一塊污漬，霧片飄過英雄腳邊時**不會擋住**任何東西 ⇒ 那不是霧是地毯 | ⭐ 免疫（材質是共用的） | ⛔ |
 * | ⭐ **貼地飄的薄片 ＋ thin instances** | **1 個 draw call**／整張圖，每幀 N×16 個 float | ⭐ 68° 是**往下看** ⇒ 水平薄片正對相機（sin 68° = 0.93），它是這個視角下**唯一**會佔到畫面面積的形狀 | ⭐ 免疫 —— thin instance 是**場景裡的 mesh**，⛔ 不是掛在相機上的 pass ⇒ 四顆相機看到同一批霧，而且**看到的角度各自正確** | ⭐ **選它** |
 *
 * ⭐ 分割畫面的算術寫清楚：post-process 的成本是 `N_camera × 全螢幕像素`；
 * 薄片的成本是 `1 × draw call ＋ N_camera × 霧片實際覆蓋的像素`，而霧片只佔畫面
 * 的一小塊。⇒ ⭐ 四人時前者是 4 趟全螢幕 ray-march，後者仍然是 **1 個 draw call**。
 *
 * ⚠️ **形狀住頂點 alpha，⛔ 不住貼圖** —— 這是 `buildPuddles` 已經立好的慣例
 * （「不必抓檔、不必進圖集」）。⭐ 這裡多一個理由：`DynamicTexture` 要一張 canvas，
 * 而 `buildArena` 被一大票 headless 測試呼叫 ⇒ 一張畫不出來的雲會把**別人的**測試
 * 弄紅，而它換到的只是一個本來就可以用頂點做的柔邊。
 *
 * ⚠️ **幀成本沒有量到**（這條 lane 跑不起 WebGL）—— 上面講的是**結構性**的成本
 * （幾趟 pass、幾個 draw call、乘不乘相機數），那是可以從程式碼讀出來的事實。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 它與既有的 `scene.fog` 是**一個機制的兩層**，⛔ 不是兩套濃度
 * ════════════════════════════════════════════════════════════════════════════
 * · **顏色**：每幀從 `scene.fogColor` 抄 —— 那正是 `Lighting.write()` 用這一刻的
 *   天光＋主光算出來的空氣色（雷雨場地閃電打下來時它會亮）。⇒ 霧片是**同一團空氣
 *   結成的塊**，⛔ 不是一個自己有顏色的東西。
 * · **開關與權重**：`WeatherLook.fogBanks` 與 `fogDensity` 由**同一個** `weatherLookFor()`
 *   從同一格 `toggles.fog` × 同一個級別權重算出來 ⇒ ⛔ 不可能出現「全域說沒霧、
 *   局部飄了一片」。
 * · **玩法界線**：兩層相乘吃**同一條** `FOG_MIN_TRANSMITTANCE`（`fogSightTransmittance`）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 決定性：飄的路徑是 `(時間, 場地 seed)` 的**純函式**
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 每幀 `Math.random()` 的霧在重播／暫停／逐格步進下會走**另一條路**，而畫面上
 * 看起來完全正常（`modelFxPath.ts` 的檔頭記過同型的坑）。⇒ {@link fogBankPose}
 * 只吃 `(seed, i, count, tSec, …)`，同樣的輸入**逐位元**同樣的輸出。
 *
 * ⚠️ 亂數來源刻意**不是** `Math.sin`（`ArenaGround.hash01` 用的那一招）——
 * `Math.sin` 的最後幾個位元不是 IEEE 規定的，跨引擎可以差一個 ulp。這裡用整數 mix，
 * 所以「同一個 t 同一個 seed ⇒ 同一個位置」在**任何**機器上都成立。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 「最多被一片蓋到」是**幾何上關死的**，⛔ 不是統計上的期望
 * ════════════════════════════════════════════════════════════════════════════
 * N 片霧 = 把場地橫切成 **N 條互斥車道**，一條一片，而且**全部同一個高度**。
 * ⇒ 相機射線穿過那個高度**恰好一次** ⇒ 畫面上任何一點最多被**一片**蓋到。
 * ⇒ 局部殘留 = `1 − alpha`（⛔ 不是 `(1−alpha)^N`），玩法閘才有一個**證得出來**的
 * 最壞情況。實作在 {@link fogBankHalf}：霧片的**外接**半徑（⛔ 不是邊長的一半）
 * 被夾進車道半寬。⚠️ 誰要是讓高度或車道隨機化，那條閘就從「證明」掉回「祈禱」。
 */
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
// Side-effect: adds thinInstance* to Mesh（N 片霧 = 1 個 draw call，同積水／接觸陰影）。
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { WeatherLook, WeatherPolicy } from "@ggd/shared/content";

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// 決定性亂數 —— 整數 mix，⛔ 不是 Math.sin
// ---------------------------------------------------------------------------

/** 場地 id → 32-bit seed（FNV-1a）。同一張圖每一回合的霧走同一條路。 */
export function fogBankSeed(arenaId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < arenaId.length; i++) {
    h = Math.imul(h ^ arenaId.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

/** `(seed, k)` → 0..1。⭐ 逐位元跨引擎一致（⛔ 沒有 `Math.sin`、⛔ 沒有浮點超越函式）。 */
export function fogHash01(seed: number, k: number): number {
  let h = (seed ^ Math.imul(k | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// 幾何 —— 車道、大小、這一刻在哪
// ---------------------------------------------------------------------------

/** 這張場地的佔地：中心與**跨距**（外接正方形的邊長）。 */
export interface FogFootprint {
  cx: number;
  cz: number;
  span: number;
}

/** 從 zone 推導佔地。⛔ 不抄任何字面尺寸 —— 一張新地圖不必來改這個檔。 */
export function fogFootprint(
  zones: readonly { center: { x: number; z: number }; boundaryRadius: number }[],
): FogFootprint {
  if (zones.length === 0) return { cx: 0, cz: 0, span: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const z of zones) {
    minX = Math.min(minX, z.center.x - z.boundaryRadius);
    maxX = Math.max(maxX, z.center.x + z.boundaryRadius);
    minZ = Math.min(minZ, z.center.z - z.boundaryRadius);
    maxZ = Math.max(maxZ, z.center.z + z.boundaryRadius);
  }
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    span: Math.max(maxX - minX, maxZ - minZ),
  };
}

/**
 * 一片霧的**基礎半邊長**。
 *
 * ⭐ 這一行就是「兩片永遠不重疊」那條不變量：車道半寬 = `span / (2·count)`，
 * 而一個邊長 `2h` 的方片**轉到任何角度**的外接半徑是 `h·√2` ⇒ 夾住 `h·√2` 就好。
 * ⛔ 夾邊長（少了那個 √2）在 45° 時會越線，而畫面上完全看不出來。
 */
export function fogBankHalf(span: number, count: number, laneFill: number): number {
  if (count <= 0) return 0;
  return (laneFill * span) / (count * 2 * Math.SQRT2);
}

/** 一片霧這一刻的擺位。⭐ `(seed, i, count, tSec)` 的**純函式**。 */
export interface FogBankPose {
  x: number;
  z: number;
  /** 沿 x 的半邊長（世界單位） */
  halfX: number;
  /** 沿 z 的半邊長 */
  halfZ: number;
  /** 繞 y 轉多少弧度 */
  rotY: number;
}

export function fogBankPose(
  foot: FogFootprint,
  policy: Pick<WeatherPolicy, "fogBankLaneFill" | "fogBankDriftSec">,
  seed: number,
  i: number,
  count: number,
  tSec: number,
): FogBankPose {
  const half = fogBankHalf(foot.span, count, policy.fogBankLaneFill);
  // ⭐ 風向逐場地固定（⛔ 不隨時間轉）—— 一片霧改變方向看起來像 bug 不像天氣。
  const th = fogHash01(seed, 1) * TAU;
  const ax = Math.cos(th);
  const az = Math.sin(th);
  // 橫風方向 = 車道排列的方向。
  const cross = ((i + 0.5) / count - 0.5) * foot.span;
  // 一趟要走多遠：跨距 ＋ 兩個直徑 ⇒ 霧片**完全離場**之後才折回起點（⛔ 不會在畫面裡瞬移）。
  const travel = foot.span + half * 4 * Math.SQRT2;
  // 每一片自己的速度與相位 ⇒ ⛔ 不會排成一列一起走。⚠️ 速度只影響**沿風**那一軸，
  // 所以它動不到車道 ⇒ 互斥不變量與它無關。
  const speed = 0.6 + 0.8 * fogHash01(seed, i * 4 + 2);
  const phase = fogHash01(seed, i * 4 + 3);
  const u01 = phase + (policy.fogBankDriftSec > 0 ? (tSec / policy.fogBankDriftSec) * speed : 0);
  const u = (u01 - Math.floor(u01)) * travel - travel / 2;
  // 不規則：每一片被拉成不同比例的橢方形，再轉一個自己的角度。
  // ⚠️ 兩軸都 ≤ half ⇒ 外接半徑 √(hx²+hz²) ≤ half·√2 ⇒ 車道不變量仍然成立。
  const sx = 0.65 + 0.35 * fogHash01(seed, i * 4 + 4);
  const sz = 0.65 + 0.35 * fogHash01(seed, i * 4 + 5);
  return {
    x: foot.cx + ax * u - az * cross,
    z: foot.cz + az * u + ax * cross,
    halfX: half * sx,
    halfZ: half * sz,
    rotY: fogHash01(seed, i * 4 + 6) * TAU,
  };
}

// ---------------------------------------------------------------------------
// 形狀 —— 一片**不規則**的軟斑，程序生成（⛔ 沒有貼圖、⛔ 沒有下載）
// ---------------------------------------------------------------------------

/** 一圈幾段。24 段的邊緣在這個俯角下已經看不出多邊形。 */
const FOG_SEGMENTS = 24;
/**
 * 由內而外的環：`[半徑, 這一圈的不透明度倍率]`。
 *
 * ⚠️ **前兩圈刻意是一片平台**（0.55 → 0.98、0.8 → 0.9）：霧是一團**厚度差不多**
 * 的東西，⛔ 不是一個中心最亮的光點。⭐ 一條 `(1−t)²` 那樣的曲線在圓心會留下一個
 * 明顯的亮點 —— 那看起來是「一顆球」，不是「一片霧」。掉下來的那一段全部留給最外圈。
 */
const FOG_RINGS: ReadonlyArray<readonly [number, number]> = [
  [0.55, 0.98],
  [0.8, 0.9],
  [1, 0],
] as const;
/** 半徑最多被啃掉多少（0 = 正圓）。⚠️ 只會**向內**啃 —— 見下面的不變量。 */
const FOG_RAGGED = 0.45;

/**
 * 一片霧在角度 `θ` 上的半徑（0..1 的**單位**霧片）。⭐ `(seed, θ)` 的純函式。
 *
 * ⭐ 不規則來自三條不同頻率的正弦疊加（相位由 seed 決定）⇒ 13 張場地各自一個剪影，
 * ⛔ 不是同一個圓被縮放。
 *
 * ⚠️ **它永遠 ≤ 1，而那是一條承重的不變量**：單位霧片被 `(halfX, halfZ)` 縮放之後，
 * 任何一點的距離 ≤ `hypot(halfX, halfZ)` ⇒ 外接半徑仍然被車道夾著 ⇒ 兩片不重疊
 * ⇒ 玩法閘那個「最多被一片蓋到」的最壞情況仍然成立。
 * ⛔ 誰要是把 `1 −` 改成 `1 +`，霧片會凸出車道，而畫面上完全看不出來。
 */
export function fogBankRadius(seed: number, theta: number): number {
  const p1 = fogHash01(seed, 21) * TAU;
  const p2 = fogHash01(seed, 22) * TAU;
  const p3 = fogHash01(seed, 23) * TAU;
  const n =
    (0.5 * Math.sin(theta * 2 + p1) + 0.32 * Math.sin(theta * 3 + p2) + 0.18 * Math.sin(theta * 5 + p3) + 1) /
    2;
  return 1 - FOG_RAGGED * n;
}

// ---------------------------------------------------------------------------
// 建置 + 每幀
// ---------------------------------------------------------------------------

/** `buildFogBanks` 的輸入。⭐ 結構上等於 `ArenaGround.WeatherGroundInput`，
 *  所以呼叫端把**同一個物件**傳進來就好（⛔ 不必在場地那一側多組一份）。 */
export interface FogBankInput {
  policy: WeatherPolicy;
  look: WeatherLook;
  /** 系統的「減少動態」。⚠️ 只**凍住**霧（停在 t=0），⛔ 不拿掉它 —— 同積水微光。 */
  reducedMotion: boolean;
}

export interface FogBanksHandle {
  mesh: Mesh;
  material: StandardMaterial;
  /** ⛔ 測試用：把時間餵進去（出貨走 `scene.onBeforeRenderObservable`）。 */
  writeAt(tSec: number): void;
}

/**
 * 建一片一片飄的霧。`null` = 這張圖沒有霧、或玩家把霧那一格關掉了。
 *
 * ⚠️ 每幀更新掛在 **scene 自己的 observable** 上，⛔ 不是 `GameApp` 的迴圈 ——
 * 而且它跟著 `mesh.onDispose` 一起摘掉：`disposeArena()` 收 mesh 的那一刻
 * observer 就消失，⛔ 不會每換一張圖就多留一個對著死掉場景寫矩陣的 callback
 * （同 `Lighting` 那兩個訂閱的理由）。
 */
export function buildFogBanks(
  scene: Scene,
  parent: TransformNode,
  arenaId: string,
  zones: readonly { center: { x: number; z: number }; boundaryRadius: number }[],
  weather: FogBankInput,
): FogBanksHandle | null {
  const { policy, look } = weather;
  const count = look.fogBanks;
  if (count <= 0 || policy.fogBankAlpha <= 0 || policy.fogBankLaneFill <= 0) return null;
  const foot = fogFootprint(zones);
  if (foot.span <= 0) return null;
  const seed = fogBankSeed(arenaId);

  // 一片**單位**霧片：平躺在 XZ 上、法線朝 +Y、半徑由 `fogBankRadius()` 逐角度啃出
  // 一個不規則的外框，柔邊住在**頂點 alpha**（同 `buildPuddles`）。
  const positions: number[] = [0, 0, 0];
  const colors: number[] = [1, 1, 1, 1];
  const indices: number[] = [];
  for (const [t, a] of FOG_RINGS) {
    for (let s = 0; s < FOG_SEGMENTS; s++) {
      const th = (s / FOG_SEGMENTS) * TAU;
      const r = fogBankRadius(seed, th) * t;
      positions.push(Math.cos(th) * r, 0, Math.sin(th) * r);
      // 外緣散掉 —— 一個硬邊的霧看起來是一張紙，⛔ 不是霧。
      colors.push(1, 1, 1, a);
    }
  }
  for (let s = 0; s < FOG_SEGMENTS; s++) indices.push(0, 1 + ((s + 1) % FOG_SEGMENTS), 1 + s);
  for (let ri = 0; ri < FOG_RINGS.length - 1; ri++) {
    const a = 1 + ri * FOG_SEGMENTS;
    const b = a + FOG_SEGMENTS;
    for (let s = 0; s < FOG_SEGMENTS; s++) {
      const s1 = (s + 1) % FOG_SEGMENTS;
      indices.push(a + s, b + s1, b + s, a + s, a + s1, b + s1);
    }
  }
  const mesh = new Mesh(`fog-banks-${arenaId}`, scene);
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = indices;
  data.normals = Array.from({ length: positions.length }, (_, i) => (i % 3 === 1 ? 1 : 0));
  data.applyToMesh(mesh);

  const mat = new StandardMaterial(`fog-bank-mat-${arenaId}`, scene);
  // 不吃燈：霧片的顏色**就是**這一刻的空氣色（每幀從 `scene.fogColor` 抄）。
  // ⚠️ `diffuseColor` 是黑的 ⇒ 頂點顏色的 rgb 不參與，只有它的 **alpha** 在做事。
  mat.disableLighting = true;
  mat.emissiveColor = new Color3(1, 1, 1);
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.backFaceCulling = false;
  // 霧片自己就是霧 —— 再吃一次 `scene.fog` 等於把同一團空氣算兩遍。
  mat.fogEnabled = false;
  // ⚠️ 不關深度寫入的話，兩片在深度緩衝裡會互相打洞（同積水／接觸陰影）。
  mat.disableDepthWrite = true;
  mat.alpha = policy.fogBankAlpha;
  mesh.material = mat;
  mesh.useVertexColors = true;
  // ⚠️ 這一行**單獨**就把 mesh 丟進透明佇列（`needAlphaBlendingForMesh` 先看它）。
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.parent = parent;
  // 霧片每幀在動 ⇒ 每幀重算包圍盒是白花的；直接宣告它永遠是 active。
  mesh.alwaysSelectAsActiveMesh = true;

  const matrices = new Float32Array(count * 16);
  const scale = Matrix.Identity();
  const rot = Matrix.Identity();
  const pose = Matrix.Identity();
  const at = new Vector3();

  const writeAt = (tSec: number): void => {
    // ⭐ 顏色：**這一刻的空氣色**（`Lighting.write()` 每幀算好寫進 `scene.fogColor`）
    //    ⇒ 雷雨場地閃電打下來時，飄過去的那一片會跟著亮。⛔ 不是一個獨立的顏色欄位。
    mat.emissiveColor.copyFrom(scene.fogColor);
    for (let i = 0; i < count; i++) {
      const p = fogBankPose(foot, policy, seed, i, count, tSec);
      Matrix.ScalingToRef(p.halfX, 1, p.halfZ, scale);
      Matrix.RotationYToRef(p.rotY, rot);
      scale.multiplyToRef(rot, pose);
      pose.setTranslation(at.set(p.x, policy.fogBankHeight, p.z));
      pose.copyToArray(matrices, i * 16);
    }
    mesh.thinInstanceBufferUpdated("matrix");
  };

  mesh.thinInstanceSetBuffer("matrix", matrices, 16, false);
  writeAt(0);
  mesh.thinInstanceRefreshBoundingInfo();

  // ⭐ 每幀的時間源與 `Lighting.animate()` 是**同一個時鐘**（`performance.now()`，
  //    GameApp 餵給它的就是那一個）—— 兩層霧分別走兩個時鐘會慢慢漂開。
  //    ⚠️ 減少動態 ⇒ 恆定 t=0：霧片還在，只是不飄（同積水微光的待遇）。
  const clock = weather.reducedMotion
    ? (): number => 0
    : typeof performance !== "undefined"
      ? (): number => performance.now() / 1000
      : (): number => 0;
  const obs = scene.onBeforeRenderObservable.add(() => writeAt(clock()));
  mesh.onDisposeObservable.addOnce(() => scene.onBeforeRenderObservable.remove(obs));

  return { mesh, material: mat, writeAt };
}

/**
 * ⭐【吸引】`pull` —— #147。把一組身體**搬到一個點**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ① 它為什麼不是 `knockback` 的 `from: "pull"`
 * ═══════════════════════════════════════════════════════════════════════════
 * `knockback` 的作者填的是**一段長度**，而且那段長度會走 GH#193 的 `afterGap`
 * 減法（離越遠移動越少）。那條減法對推是對的、對拉是**反過來**的：
 * 「把 10 格外的人吸過來」用擊退寫出來會變成「他往我這邊挪一小段」。
 *
 * `pull` 的作者填的是**一個落點**（施法者／落點／錨點環），移動距離是**算出來
 * 的**。這才是 A091 05-03 及喀爾度的形狀（war3map.j:28224-28233）：
 * `250 + 100×等級` 半徑內的人被搬到 `2×等級` 個錨點上。
 *
 * ⚠️ ⛔ 這**不會**取代 `combat/damage.ts` 那條命中反應式的擊退，也不會取代
 * `knockback` kind —— 兩者都還在，語意各自不變（第三守則：不要順手拆掉一條
 * 沒有人要求拆的線）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ② ⛔ 零個新的位移機制（第零守則⑨）
 * ═══════════════════════════════════════════════════════════════════════════
 * 走的是 `knockback` 已經在用的那條地面滑行：`nav.override` 的 `DashOverride`
 *（`kind:"knockback"` + `authored:true`，讓 `combat/damage.ts` 第 8 格的仲裁
 * 不把它覆寫掉）+ `world.knockdown` 的行動鎖（`lockOut`，從 `./knockback.ts`
 * **import** 而不是抄第二份）。⛔ 沒有新的 SimWorld 欄位、沒有新的 system。
 *
 * ⚠️ 半空中的身體與 `knockback` 逐字同一個處置：`cancelLeap` 先把它從
 * `world.airborne` 放下來再搬，否則那一格會永遠留著（畫面上人浮在空中，
 * 失敗形態①）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ③ ⭐ 錨點環：**沒有三角函式**
 * ═══════════════════════════════════════════════════════════════════════════
 * `sim/**` 禁止 `Math.sin/cos`（`sim/purity.test.ts`；理由是它們不是 IEEE-754
 * 正確捨入，兩個 replica 會差一個 ulp 然後翻掉一個 `<=`）。
 * 所以 N 個等分點是用一張**單位旋轉表**做的：第 k 個點 = 第 k−1 個點乘上
 * `(c + i·s)`，而 `(c, s) = (cos 2π/N, sin 2π/N)` 是**常數**，⛔ 不是算出來的。
 * 只有 + − × 三種運算，逐位元跨平台相同。
 *
 * ⚠️ 這張表是**幾何常數**不是平衡數字，所以它住在程式裡不違反第〇·四守則
 *（與 `GGD_APEX_PER_WC3` 同一個立場）。⭐ 而「幾個錨點、環多大」是設計，
 * 那兩格在 JSON 上（`anchorCount` / `anchorRadius`）。
 */
import type { EffectKindSpec } from "./effectKind";
import type { Vec2 } from "../math/vec2";
import { dist, lenSq, normalize, sub } from "../math/vec2";
import { cancelLeap } from "../movement/leap";
import { lockOut } from "./knockback";
import { shapeTargets } from "./shapeTargets";
import {
  KB_MAX_GETUP_TICKS,
  clampKb,
} from "./knockbackLimits";
import {
  PULL_MAX_ANCHORS,
  PULL_MAX_ANCHOR_RADIUS,
  PULL_MAX_SPEED,
  PULL_MAX_TRAVEL,
} from "./kindLimits";

/**
 * `(cos 2π/N, sin 2π/N)`，N = 1…{@link PULL_MAX_ANCHORS}。索引 0 不用。
 * ⛔ 這是**常數表**不是算出來的（見檔頭③）。長度必須等於 `PULL_MAX_ANCHORS + 1`。
 */
export const RING_UNIT_ROTATION: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 0],
  [-1, 0],
  [-0.5, 0.8660254037844387],
  [0, 1],
  [0.30901699437494745, 0.9510565162951535],
  [0.5, 0.8660254037844386],
  [0.6234898018587336, 0.7818314824680298],
  [0.7071067811865476, 0.7071067811865476],
  [0.766044443118978, 0.6427876096865393],
  [0.8090169943749475, 0.5877852522924731],
  [0.8412535328311812, 0.5406408174555976],
  [0.8660254037844387, 0.5],
];

/**
 * N 個等分點，半徑 `r`，圓心 `centre`。第 0 個永遠在 +x 方向 —— ⭐ 一個**固定**
 * 的起始相位，⛔ 不是「跟著施法者面向轉」：後者要一次旋轉（= 一次三角函式），
 * 而且原作 A091 的第一個錨點也是固定相位（`180/level × i`，i 從 1 起算）。
 */
export function ringPoints(centre: Vec2, r: number, n: number): Vec2[] {
  const count = Math.max(1, Math.min(PULL_MAX_ANCHORS, Math.floor(n)));
  const rot = RING_UNIT_ROTATION[count] ?? RING_UNIT_ROTATION[1]!;
  const [c, s] = rot;
  const out: Vec2[] = [];
  let ux = 1;
  let uz = 0;
  for (let i = 0; i < count; i++) {
    out.push({ x: centre.x + ux * r, z: centre.z + uz * r });
    // 複數乘法 (ux + i·uz) × (c + i·s)。只有 + − ×（檔頭③）。
    const nx = ux * c - uz * s;
    const nz = ux * s + uz * c;
    ux = nx;
    uz = nz;
  }
  return out;
}

export const pullEffect: EffectKindSpec<"pull"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const speed = clampKb(e.speed, PULL_MAX_SPEED);
    if (!(speed > 0)) return; // 速度 0 的吸引永遠走不完：⛔ 不要開始一個
    const getup = Math.round(clampKb(e.getupTicks, KB_MAX_GETUP_TICKS));
    const stop = clampKb(e.stopDistance, PULL_MAX_TRAVEL);

    // ⭐ 圓心／落點與名單走**同一支** `shapeTargets`（E1），⛔ 不自己再發明一次
    //    空間查詢 —— 第二份查詢分岔的那一天兩份都看起來對。
    const victims = shapeTargets(e, ctx);
    if (victims.length === 0) return;

    const ct = world.transform.get(ctx.caster);
    const mode = e.destination ?? "caster";
    const centre: Vec2 | undefined = mode === "point" ? (ctx.point ?? ct?.pos) : ct?.pos;
    if (centre === undefined) return;

    const anchors =
      mode === "anchorRing"
        ? ringPoints(
            centre,
            clampKb(e.anchorRadius, PULL_MAX_ANCHOR_RADIUS),
            e.anchorCount ?? 1,
          )
        : undefined;

    // `victims` 是 `shapeTargets` 排好的全序（近的先、同距離 id 小的先），
    // 所以「第 i 個人去第 i 個錨點」在每一台機器上是同一個答案。
    for (let i = 0; i < victims.length; i++) {
      const id = victims[i]!;
      const t = world.transform.get(id);
      const nav = world.nav.get(id);
      if (t === undefined || nav === undefined) continue; // 沒有身體就沒有東西可搬
      const hp = world.health.get(id);
      if (hp !== undefined && !hp.alive) continue;

      const dest = anchors ? anchors[i % anchors.length]! : centre;
      const delta = sub(dest, t.pos);
      if (lenSq(delta) <= 1e-12) continue; // 已經站在落點上
      const dir = normalize(delta);
      const travel = Math.min(PULL_MAX_TRAVEL, Math.max(0, dist(t.pos, dest) - stop));
      if (!(travel > 0)) continue;

      // 半空中的身體先落地（與 `knockback` 逐字同一條，見檔頭②）。
      if (nav.override?.kind === "leap") cancelLeap(world, id);

      nav.override = { kind: "knockback", dir, speed, remaining: travel, authored: true };
      // MovementSystem 每 tick 吃掉 `min(speed*dt, remaining)`。
      const flightTicks = Math.ceil(travel / (speed * world.dt));
      // 期間不可控制（與 `knockback` 同一個預設與同一條通道）。
      if (e.uncontrollable ?? true) lockOut(world, id, flightTicks + getup);
    }
  },
};

/**
 * 柱環的**參數化**（GH#409）。
 *
 * `arena.colosseum` 的 16 根柱子是**手打**進 `content/arenas/arena.colosseum.json`
 * 的 20 個 `circle` 障礙物裡（那張圖早於 `map@1` 編譯器，見 `map/compile.ts`）。
 * 於是「柱子要多粗、要幾根」這個**設計取捨**沒有任何一個地方可以動 ——
 * 想試一個配置就要手改 32 筆座標，而那正是 #409 卡住的原因。
 *
 * ⇒ 這一支把那 32 筆座標變成**五個數字的函式**。
 *
 * ## ⛔ 為什麼參數**不是**一格後台欄位
 *
 * 第一守則說「寫死才需要理由」。這裡的理由是：**改這五個數字不會改變任何一場比賽**
 * —— 它們是**烘焙期**幾何，要重新產生 `arena.colosseum.json`（以及對應的
 * `scenery` 柱子模型）才會生效。一格存了檔卻什麼都沒發生的後台欄位，比沒有更糟
 * （同 `map-spec` 拿掉 `cornerLabel.corner` 那一格的理由：
 *  「一個選了也不會動的下拉選單比沒有更糟」）。
 *
 * ⇒ owner 挑定之後，改的是 {@link COLOSSEUM_PILLAR_RING} 這一列，再重新產生場地。
 *
 * ## ⚠️ 決定性
 *
 * 座標**四捨五入到小數兩位**——那是出貨資料裡的精度。⛔ 不要拿掉：拿掉之後
 * 產生器與出貨檔就逐位元不相等，`pillarRing.test.ts` 只好被放寬成模糊比對，
 * 而放寬的閘等於沒有閘。
 */

/** 一根柱子（`arena@1` 的 `circle` 障礙物，座標**相對於分區中心**）。 */
export interface RingPillar {
  kind: "circle";
  center: { x: number; z: number };
  radius: number;
}

export interface PillarRingSpec {
  /** 幾根柱子。⭐ 這一格比 `radius` 更值錢 —— 見檔尾的量測。 */
  count: number;
  /** 橢圓的長半軸（x）。 */
  a: number;
  /** 橢圓的短半軸（z）。 */
  b: number;
  /** 環上一般柱子的半徑。 */
  radius: number;
  /**
   * 落在長軸上（z = 0）那兩根的半徑。
   * ⚠️ 出貨資料裡它們**已經**被縮過（2 → 1）—— 那是上一輪為了開通道做的，
   * ⛔ 不是筆誤。這一格讓那個決定顯性化。
   */
  endRadius: number;
}

/**
 * ⭐ **出貨的柱環參數**——`pillarRing(COLOSSEUM_PILLAR_RING)` 逐位元等於
 * `content/arenas/arena.colosseum.json` 兩個分區裡的那 16 根柱子
 * （`pillarRing.test.ts` 真的逐筆比對）。
 *
 * ⏸ **這一列在等 owner 挑**（#409）。量到的權衡表在回報裡；⛔ 這裡不替他決定，
 * 所以出貨值就是**今天的幾何**，一個位元都沒動。
 */
export const COLOSSEUM_PILLAR_RING: PillarRingSpec = {
  count: 16,
  a: 21,
  b: 14,
  radius: 2,
  endRadius: 1,
};

/** 兩位小數 —— 出貨資料的精度。 */
function q(v: number): number {
  return Number(v.toFixed(2));
}

/**
 * 把參數展開成一圈柱子，順序 = 從 +x 逆時針（`k = 0 … count-1`）。
 *
 * ⚠️ 這個檔在 `map/`（烘焙期）而不是 `sim/`，所以三角函式是合法的 ——
 * 同 `map/unitCircle.ts` 的檔頭。
 */
export function pillarRing(spec: PillarRingSpec): RingPillar[] {
  return Array.from({ length: spec.count }, (_, k) => {
    const t = (k / spec.count) * Math.PI * 2;
    const z = q(spec.b * Math.sin(t));
    return {
      kind: "circle" as const,
      center: { x: q(spec.a * Math.cos(t)), z },
      // ⭐ 「在長軸上」用**產出的座標**判定，⛔ 不是判 `k === 0 || k === count/2`
      //    —— 奇數根的環根本沒有第二根落在長軸上，那個索引式判定會靜默錯掉。
      radius: z === 0 ? spec.endRadius : spec.radius,
    };
  });
}

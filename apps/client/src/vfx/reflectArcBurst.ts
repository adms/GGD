/**
 * ⚡🌈 **「反彈／反射成功」的七彩閃電爆炸** —— 一個模板 + 一張表。
 *
 * owner 2026-08-22（逐字）：
 * > 「**理想鄉被反彈的敵方單位 身上要有明顯的七彩閃電爆炸 畫面閃爍及震動**
 * >   不然都不知道發生什麼事情**有沒有反擊成功** (原版JASS有，可補強增加更多視覺效果)」
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  ⛔ 為什麼這個檔案裡沒有「理想鄉」三個字，也沒有任何技能 id
 * ════════════════════════════════════════════════════════════════════════════
 * 第〇·五守則：**引擎做機制、JSON 做技能**，「為某支技能寫一個 if 就是越線」。
 * 而 owner 這一票要的正是一個**通用**的答案 ——「反彈成功了嗎」是護盾反射、
 * 格擋反擊、荊棘傷害**共同**的問題，⛔ 不是理想鄉一支的問題。
 *
 * ⭐ 所以這張表的鍵是**演出的 id**（`vfx@1` 文件 id），⛔ 不是技能 id：
 *
 *     技能 JSON 寫 `{"kind":"spawnVfx","vfxId":"fx.avalon.reflect-burst","at":"target"}`
 *       ⇒ 它就拿到這一套演出，⛔ 不必動這裡一行。
 *
 * ⇒ 第二支、第十支反彈技能加入的成本是**在它自己的 JSON 裡指一個 id**，
 *   而不是在這裡加一個 `case`（第零守則⑨：N 個同型 = K 個模板 + 一張表）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  🌈 「七彩」是**一道弧一個色相**，⛔ 不是七個特效疊在一起
 * ════════════════════════════════════════════════════════════════════════════
 * `vfx@1` 的 `colorStops` 上界是 4（`schema/vfx.ts`），所以**一份粒子文件寫不出
 * 七個顏色**；而粒子也做不出「一道有分岔的鋸齒電弧」（`arcBolt.ts` 檔頭逐字
 * 記著這件事，那正是 owner 上一票「一堆閃電特效都沒有真的出現」的根因）。
 *
 * ⭐ 這裡的做法是**幾何與顏色分開**：
 *   · 幾何 —— 重用 `arcRadiateEnds()`（均分一圈再各自抖一點，⛔ 不是雜湊亂射，
 *     那會結塊成「往那邊噴了一坨」）；
 *   · 顏色 —— 每一道弧從色環上取**自己的**色相 ⇒ N 道弧同時在畫面上就是 N 個顏色。
 *
 * ⛔ 不是「發七次 `spawnVfx`」：那是 O(N) 份會各自腐爛的文件，而且七團粒子疊在
 * 同一個座標上只會變成一團白的。
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  🔌 rollback —— 兩層，⛔ 而且我**不**掛在 `castArcs` 上
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 最誘人的做法是重用既有的 `config.vfx-families@1.castArcs`（它已經是後台欄位）。
 * ⛔ **那是錯的，而且會讓這一票逐位元組不存在**：那一格的出貨值是 **`false`**
 * （owner 2026-08-23「請你預設關閉」）。掛上去 ⇒ 七彩閃電一次都不會出現 ——
 * 一句「說了但不會發生」的宣稱（第一·五守則）。
 *
 * ⭐ 而且**兩者的 cadence 差三個數量級**，所以它們本來就不該同一格：
 * `castArcs` 關掉的理由是**每一次施法**都生 5–8 條弧，而低冷卻的 `nova`
 * （58-01 十萬伏特）第一回合就在刷；**反彈成功**走的是 60 秒大絕 ＋ 1 秒內部冷卻。
 *
 * ⇒ 這一族的兩層 rollback：
 *   ① **內容層（今天就能用，⛔ 不必部署）** —— 這張表的鍵是演出文件 id，
 *      技能 JSON 把 `spawnVfx.vfxId` 指到別份文件（或拿掉那個節點）就沒有弧了。
 *      `content/` 是 live bind-mount ⇒ 存檔就生效。
 *   ② **總開關** —— {@link setReflectArcsEnabled}，預設 **on**（＝我挑的那一邊；
 *      第〇·六守則「優先權大的更新預設啟動」）。
 *      ⚠️ 它**還沒有接到後台**：那需要 `config.vfx-families@1` 的一格 Zod 欄位、
 *      `ContentDb.ts` 的一行 `setReflectArcsEnabled(doc.reflectArcs)`、以及 admin
 *      的一列 —— 三處都在這條 lane 的柵欄外。⛔ 所以這裡**不宣稱**它是後台欄位。
 *
 * ⚠️ 決定性：這裡沒有 `Math.random`、沒有時鐘 —— 方向與抖動全部由 `seed` 決定
 * （`arcNoise`），所以同一場重播長出同一串弧。三角函數在這裡是**合法**的：
 * `sim/purity.test.ts` 管的是 `packages/shared/src/sim/**`，電弧幾何本來就全部
 * 在客戶端算（`arcBolt.ts` 的 `arcRadiateEnds` 逐字寫了同一句）。
 */
import { ARC_BOLT_TUNING, arcRadiateEnds, type ArcEnd } from "./arcBolt";
import type { Rgb } from "./vfxPresets";

/**
 * 總開關的出貨值 —— **on**（我挑的那一邊，見檔頭 rollback ②）。
 * ⛔ 它刻意**不是** `DEFAULT_CAST_ARCS`：那一格是 `false`，掛上去這一票就等於不存在。
 */
export const DEFAULT_REFLECT_ARCS = true;

let reflectArcsOn: boolean = DEFAULT_REFLECT_ARCS;

/** 樣板照 `setCastArcsEnabled` —— 由內容載入時呼叫（接線見檔頭 rollback ②）。 */
export function setReflectArcsEnabled(v: boolean | undefined): void {
  reflectArcsOn = v ?? DEFAULT_REFLECT_ARCS;
}

export function reflectArcsEnabled(): boolean {
  return reflectArcsOn;
}

/** 一列的參數 —— 這一族演出「長什麼樣」的全部旋鈕。 */
export interface ReflectArcParams {
  /** 幾道弧（＝畫面上同時看得到幾個顏色） */
  count: number;
  /** 往外炸多遠，world units */
  reach: number;
  /** 每一道有多重（粗細與分岔一起動，`arcBoltSpec` 的單一旋鈕） */
  power: number;
  /** 每一道再岔幾條 */
  forks: number;
  /** 色相從色環的哪裡起跳（0..1）—— 讓「大爆炸」與「每刀的小火花」不同調 */
  hueOffset: number;
  /** 彩度（0 = 白，1 = 全飽和）。⛔ 不要 1：白熱的核心由 ramp 疊出來 */
  saturation: number;
}

/** 一道弧的完整要求（世界座標）。呼叫端逐條丟給 `VfxSystem.strikeArc`。 */
export interface ReflectArcRequest {
  from: ArcEnd;
  to: ArcEnd;
  tint: Rgb;
  power: number;
  forks: number;
  seed: number;
}

/**
 * ⭐ **表 —— 演出 id → 參數。**
 *
 * ⚠️ 鍵是 `vfx@1` 的**文件 id**，⛔ 不是技能 id、⛔ 不是英雄 id。
 * 一支新的反彈／格擋／反射技能要這套演出，就在它自己的 JSON 裡把 `spawnVfx.vfxId`
 * 指到這裡已經有的一列 —— ⛔ 不必動這個檔案。
 *
 * ⚠️ 表上沒有的 id 一律回空陣列（＝只播粒子文件本身），⛔ 不是「猜一個」：
 * 猜出來的弧是一個沒有來源的東西（`parsePrimFxKey` 的檔頭逐字記著同一條）。
 */
export const REFLECT_ARC_CUES: Readonly<Record<string, ReflectArcParams>> = {
  // 反彈成功的**那一瞬間**（＝ owner 要的「有沒有反擊成功」的答案）。
  // 7 道 = 七彩，也剛好是原作 20-002 的七次斬擊。
  "fx.avalon.reflect-burst": {
    count: 7,
    reach: 2.6,
    power: 1.2,
    forks: 2,
    hueOffset: 0,
    saturation: 0.72,
  },
  // 七刀裡的**每一刀** —— 同一族、更小更輕（它一秒鐘會出現七次，重版會疲勞）。
  "fx.avalon.reflect-spark": {
    count: 3,
    reach: 1.25,
    power: 0.62,
    forks: 1,
    hueOffset: 0.5,
    saturation: 0.66,
  },
};

/**
 * 色環上的第 i 個色相 → RGB（HSV，V 恆為 1）。
 *
 * ⛔ 不是一張寫死七個顏色的陣列：`count` 是一格參數，而一張長度 7 的陣列會在
 * 有人把它調成 9 的那一天靜靜地重複兩個顏色（第〇·四守則：算得出來的值⛔ 不烘）。
 */
export function reflectArcHue(i: number, count: number, offset: number, sat: number): Rgb {
  const n = Math.max(1, Math.floor(count));
  const h = ((i / n + offset) % 1 + 1) % 1;
  const s = Math.min(1, Math.max(0, sat));
  const k = (h * 6) % 6;
  const f = k - Math.floor(k);
  const p = 1 - s;
  const q = 1 - s * f;
  const t = 1 - s * (1 - f);
  switch (Math.floor(k)) {
    case 0:
      return [1, t, p];
    case 1:
      return [q, 1, p];
    case 2:
      return [p, 1, t];
    case 3:
      return [p, q, 1];
    case 4:
      return [t, p, 1];
    default:
      return [1, p, q];
  }
}

/**
 * ⚡ **這一發演出要打哪幾道弧。** 純函數 —— 它不認識 Babylon、不認識技能，
 * 只認識「哪一份演出文件、炸在哪個座標」。
 *
 * ⛔ 表上沒有這個 id、或總開關關著 ⇒ 空陣列（呼叫端照樣播粒子文件本身）。
 * ⭐ 閘在**這裡**而不是呼叫端：呼叫端只有一個今天，明天可能有第二個，
 *   而一個只擋住第一個入口的開關是一句「說了但不會發生」的宣稱（第一·五守則）。
 */
export function reflectArcBurstPlan(
  vfxId: string | undefined,
  at: { x: number; z: number },
  seed: number,
  bodyY: number,
): ReflectArcRequest[] {
  if (!vfxId || !reflectArcsEnabled()) return [];
  const row = REFLECT_ARC_CUES[vfxId];
  if (!row) return [];
  if (!Number.isFinite(at.x) || !Number.isFinite(at.z)) return []; // #131
  const centre: ArcEnd = { x: at.x, y: bodyY, z: at.z };
  const ends = arcRadiateEnds(centre, row.count, row.reach, seed);
  return ends.map((to, i) => ({
    from: centre,
    to,
    tint: reflectArcHue(i, row.count, row.hueOffset, row.saturation),
    power: row.power,
    // 一道弧至少一岔 —— `ARC_BOLT_TUNING.forks` 是這一族的預設，這裡只放大／縮小
    forks: Math.max(0, Math.round(row.forks)) || ARC_BOLT_TUNING.forks,
    seed: seed + i + 1,
  }));
}

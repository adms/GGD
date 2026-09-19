import type { GlbDocument, GlbNode } from "./glb";

/**
 * 面向量測 —— ⭐ **一顆模型的正面朝哪一邊，從它自己的幾何量出來**。
 *
 * > owner 2026-09-15（逐字）：「所有新的模組定位角度有問題-螃蟹走路」
 * > owner 2026-09-15（逐字）：「18 位英雄在比賽裡是側著走的（哆啦A夢、臭作、飛鼠先生、
 * >  凱亞爾、西索等，名單在對照頁）請開票修正」
 *
 * ⛔ 在此之前這段程式**只住在 `apps/client/src/render/views/modelFacing.test.ts` 裡面** ——
 * 也就是說它只看得到「已經進了 repo 的內容」，⭐ 而**匯入的那一刻沒有任何東西在量**
 * （GH#1272 逐字量到：`model_intake.py` 與 `normalize.ts` 搜 facing／yaw／orient／面向／轉向
 * **零命中**；轉向角度是 `prepareUploadedHeroModel(…, yawOffsetDeg = 0)` **人手填的**）。
 * ⇒ ⭐ 每一顆新模型都可能側著走，⛔ 而唯一會叫的那支在幾十個 commit 之後才看得到它。
 *
 * ⭐ 所以量測的真源搬到這裡（第〇·四守則：值只有一個住處）：
 *   · 匯入當下 —— `normalize.ts`（後台 `ModelVersions.prepare()` 與編輯器 `prepareUploadedHeroModel()` 兩條都自動帶）
 *   · 入庫閘   —— `tools/w3x-import/model_intake.py` 的第 ⑥ 項（經 `model_facing.mts`）
 *   · 出貨普查 —— `modelFacing.test.ts`（⚠️ 仍有自己一份，⛔ 見下面「兩個住處」）
 *
 * ⚠️⚠️ **兩個住處（誠實記著，⛔ 不要讀成已經收斂）**：`modelFacing.test.ts` 今天還是自己
 * 那一份 —— 它在本 lane 的柵欄外，改不得。⭐ 所以這裡用**校準釘**把兩份綁在一起：
 * `FACING_CALIBRATION` 的三具是那支普查自己釘死的答案（heroryuk 270°、linkstik 270°、
 * heropika 走家族預設），`facing.test.ts` 逐具對真的 GLB 重算 ⇒ **兩份只要開始漂就有東西紅**。
 * ⛔ 一份「等哪天再合併」的重複，不配一條會紅的線就是下一個謊。
 *
 * ── 量法（⛔ 不信任名字，這是重點）─────────────────────────────────────────
 * 一對左右骨頭給出 RIGHT 向量，右手 Y-up 座標系裡 `forward = up × right = (right.z, 0, −right.x)`。
 * ⚠️ 它**符號精確**，但前提是來源真的把 L/R 標對了 —— ⭐ 而出貨的模型裡有標反的：
 *   · WC3 的「… Left Ref」／「… Right Ref」**附掛點**相對骨架是鏡射的 ⇒ `Ref` 結尾**整族排除**
 *   · `imported.heropika` 整副骨架 L/R 顛倒（`Bone_Ear_L` 長在幾何右邊）
 * ⇒ 所以一個判定要**同時**有「≥3 對骨頭彼此同意」與**第二個與名字無關的線索**
 *   （尾巴一定朝後、下巴一定朝前）。
 */

// ---------------------------------------------------------------------------
// 判準的三個數字 —— ⭐ 只有這一個住處（`model_intake.py` 與 `normalize.ts` 都讀這裡）
// ---------------------------------------------------------------------------

/** 少於這個對數 ⇒ 方向可能是巧合，⛔ 不給判定。 */
export const FACING_MIN_PAIRS = 3;
/** 骨頭彼此同意的下界；低於它代表骨架疑似被鏡射過。 */
export const FACING_MIN_COHERENCE = 0.99;
/** 超過這個角度就算「量到的與出貨的不同」（量測本身有 ±1° 的數值雜訊）。 */
export const FACING_TOLERANCE_DEG = 1;

// ---------------------------------------------------------------------------
// 骨頭名字：左 / 右
// ---------------------------------------------------------------------------

/** 附掛點（`… Ref`）—— ⛔ 相對骨架是鏡射的，整族不採用。 */
export const isAttachmentRefNode = (name: string): boolean => /\bRef\s*$/i.test(name);

/**
 * 這個名字看起來是「左」嗎。
 *
 * ⭐ 2026-09-15（GH#1266）：3ds Max Biped 的命名是「`Bip001 L Thigh`」—— 左右是**前後有空白的
 * 單一字母**。在此之前四條正則沒有一條認得它 ⇒ 這類骨架（ou99／community 批次多數是它）
 * **一對都湊不到** ⇒ 被歸成「沒有骨架」而**安靜地退出檢查** —— 綠燈，⛔ 而它根本沒量。
 * 補上之後同一支普查量出 **118 份模型文件出貨 0° 而幾何要 90°**（作用中英雄身體 18 位）。
 */
export const looksLeftBoneName = (name: string): boolean =>
  /Left/i.test(name)
  || /_L(?=$|[^a-zA-Z])/.test(name)
  || /^L[A-Z]/.test(name)
  || /\bL\d*$/.test(name)
  || /(?:^|\s)L(?=\s)/.test(name);          // ⭐ Biped：`Bip001 L Thigh`

/** 同一根骨頭的「右」邊可能叫什麼 —— 逐個試，第一個對得上的就配成一對。 */
export function mirrorBoneCandidates(name: string): string[] {
  const out = new Set<string>();
  const add = (s: string): void => { if (s !== name) out.add(s); };
  if (/Left/i.test(name)) { add(name.replace(/Left/g, "Right")); add(name.replace(/left/g, "right")); }
  add(name.replace(/(^|\s)L(?=\s)/g, "$1R"));
  add(name.replace(/_L(?=$|[^a-zA-Z])/g, "_R"));
  add(name.replace(/\bL(?=\d*$)/g, "R"));
  add(name.replace(/^L(?=[A-Z])/, "R"));
  return [...out];
}

// ---------------------------------------------------------------------------
// 節點世界變換
// ---------------------------------------------------------------------------

type M16 = number[];
/** 工作區開著 `noUncheckedIndexedAccess` ⇒ 索引讀取一律走這裡。 */
const mi = (m: M16, i: number): number => m[i] ?? 0;

function mul(a: M16, b: M16): M16 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += mi(a, k * 4 + r) * mi(b, c * 4 + k);
      o[c * 4 + r] = s;
    }
  }
  return o;
}

function localMatrix(n: GlbNode): M16 {
  if (n.matrix) return [...n.matrix];
  const t = n.translation ?? [0, 0, 0];
  const r4 = n.rotation ?? [0, 0, 0, 1];
  const x = r4[0] ?? 0, y = r4[1] ?? 0, z = r4[2] ?? 0, w = r4[3] ?? 1;
  const s = n.scale ?? [1, 1, 1];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  const s0 = s[0] ?? 1, s1 = s[1] ?? 1, s2 = s[2] ?? 1;
  const m = new Array<number>(16).fill(0);
  m[0] = (1 - 2 * (yy + zz)) * s0; m[1] = 2 * (xy + wz) * s0; m[2] = 2 * (xz - wy) * s0;
  m[4] = 2 * (xy - wz) * s1; m[5] = (1 - 2 * (xx + zz)) * s1; m[6] = 2 * (yz + wx) * s1;
  m[8] = 2 * (xz + wy) * s2; m[9] = 2 * (yz - wx) * s2; m[10] = (1 - 2 * (xx + yy)) * s2;
  m[12] = t[0] ?? 0; m[13] = t[1] ?? 0; m[14] = t[2] ?? 0; m[15] = 1;
  return m;
}

/**
 * 每個節點的世界變換。
 *
 * ⚠️ ⭐ 這支會吃到**上傳來的**位元組（編輯器與後台匯入都走這條）⇒ 節點樹**不保證是樹**：
 * 一份惡意或壞掉的 glTF 可以讓 parent 指回自己的祖先。⛔ 沒有防護的遞迴在那裡是無限迴圈
 * （而它的症狀是匯入頁整個卡死，⛔ 不是一則錯誤訊息）。⇒ 走過的節點標記起來，
 * 成環的那一段退回單位矩陣。
 */
function worldMatrices(nodes: GlbNode[]): M16[] {
  const parent = new Array<number>(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => {
    if (c >= 0 && c < nodes.length) parent[c] = i;
  }));
  const identity = (): M16 => { const m = new Array<number>(16).fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; };
  const done: (M16 | null)[] = new Array(nodes.length).fill(null);
  const open = new Set<number>();
  const calc = (i: number): M16 => {
    const cached = done[i];
    if (cached) return cached;
    if (open.has(i)) return identity();                    // ⛔ 環：⛔ 不遞迴下去
    const node = nodes[i];
    if (!node) return identity();
    open.add(i);
    const local = localMatrix(node);
    const pi = parent[i] ?? -1;
    const m = pi < 0 ? local : mul(calc(pi), local);
    open.delete(i);
    done[i] = m;
    return m;
  };
  return nodes.map((_, i) => calc(i));
}

// ---------------------------------------------------------------------------
// 線索 ① —— 左右骨頭的掌性（排除附掛點）
// ---------------------------------------------------------------------------

export interface FacingChirality {
  /** 幾何量到的正面方向（度，`atan2(forward.x, forward.z)`）。 */
  yawDeg: number;
  /** 配對成功的左右骨頭對數。 */
  n: number;
  /** 這些對彼此同意的程度（1 = 完全同意）。 */
  coherence: number;
}

export function chiralityForward(nodes: GlbNode[]): FacingChirality | null {
  const W = worldMatrices(nodes);
  const byName = new Map<string, number>();
  nodes.forEach((n, i) => { if (n.name) byName.set(n.name, i); });
  const samples: { dx: number; dz: number }[] = [];
  const seen = new Set<string>();
  for (const [name, i] of byName) {
    if (isAttachmentRefNode(name) || !looksLeftBoneName(name)) continue;
    for (const right of mirrorBoneCandidates(name)) {
      const j = byName.get(right);
      if (j === undefined || j === i) continue;
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
      if (seen.has(key)) break;
      const wj = W[j], wi = W[i];
      if (!wj || !wi) break;
      const dx = mi(wj, 12) - mi(wi, 12);
      const dz = mi(wj, 14) - mi(wi, 14);
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) break;
      seen.add(key);
      samples.push({ dx: dx / len, dz: dz / len });
      break;
    }
  }
  if (!samples.length) return null;
  // forward = up × right = (right.z, 0, −right.x)
  let fx = 0, fz = 0;
  for (const s of samples) { fx += s.dz; fz += -s.dx; }
  const n = Math.hypot(fx, fz);
  if (n < 1e-9) return null;
  fx /= n; fz /= n;
  let coherence = 0;
  for (const s of samples) coherence += s.dz * fx + -s.dx * fz;
  return { yawDeg: (Math.atan2(fx, fz) * 180) / Math.PI, n: samples.length, coherence: coherence / samples.length };
}

// ---------------------------------------------------------------------------
// 線索 ② —— ⭐ 與名字無關：尾巴朝後、下巴朝前
// ---------------------------------------------------------------------------

export interface FacingAxialCue {
  /** 正面在 +X 還是 −X（±1）。 */
  fx: number;
  /** 哪一種部位給的（`tail` / `jaw`）。 */
  source: string;
}

export function axialCue(nodes: GlbNode[]): FacingAxialCue | null {
  const W = worldMatrices(nodes);
  const at = (re: RegExp): number[] => nodes
    .map((n, i) => [n.name ?? "", i] as const)
    .filter(([name]) => re.test(name) && !isAttachmentRefNode(name))
    .map(([, i]) => i);
  const origin = at(/pelvis|hips|^root$|bone_root/i)[0];
  const originM = origin === undefined ? undefined : W[origin];
  const ox = originM ? mi(originM, 12) : 0;
  for (const [re, sign, label] of [
    [/tail/i, -1, "tail"],
    [/jaw|nose|snout|muzzle/i, +1, "jaw"],
  ] as const) {
    const hits = at(re);
    if (!hits.length) continue;
    let acc = 0;
    for (const i of hits) {
      const m = W[i];
      if (m) acc += mi(m, 12) - ox;
    }
    if (Math.abs(acc) < 1e-3) continue;
    // 尾巴在 −X ⇒ 正面在 +X（sign = −1 把它翻過來）
    return { fx: Math.sign(acc) * sign, source: label };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------

export const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;
/** 貼齊最近的四分之一圈 —— ⭐ WC3 轉出來的烘焙一律是軸對齊的。 */
export const quarterTurnDeg = (deg: number): number => norm360(Math.round(norm360(deg) / 90) * 90);

export type FacingVerdict =
  /** 讀得出骨架方向 —— `requiredYawOffsetDeg` 就是這顆模型的幾何要的轉向。 */
  | { kind: "measured"; requiredYawOffsetDeg: number; chirality: FacingChirality; axial: FacingAxialCue | null }
  /** 一對 L/R 骨頭都沒有 —— **結構性**讀不出來（靜態道具、單網格模型），⛔ 不是退步。 */
  | { kind: "no-skeleton" }
  /** 有 1–2 對：樣本太少，方向可能是巧合。 */
  | { kind: "few-pairs"; n: number }
  /** 有 ≥3 對但**彼此不同意** —— 骨架疑似被鏡射過。 */
  | { kind: "incoherent"; n: number; coherence: number };

/**
 * 幾何要的轉向 —— ⭐ **只有這一個定義**。
 *
 * 掌性定出軸；有軸向線索（尾巴／下巴）時由它決定正負號 ——
 * ⭐ 因為骨頭**名字**是會被標反的，⛔ 而一條尾巴不會。
 */
export function requiredYawOffsetDeg(chirality: FacingChirality, axial: FacingAxialCue | null): number {
  const phi = quarterTurnDeg(chirality.yawDeg);
  if (!axial) return phi;
  const chiralFx = Math.sin((phi * Math.PI) / 180);
  if (Math.abs(chiralFx) > 0.5 && Math.sign(chiralFx) !== axial.fx) return norm360(phi + 180);
  return phi;
}

/** 從已解析的 glTF 量一顆模型的面向。⛔ 只讀 `nodes`，⛔ 不碰位元組。 */
export function measureFacing(json: Pick<GlbDocument, "nodes">): FacingVerdict {
  const nodes = json.nodes ?? [];
  const chirality = chiralityForward(nodes);
  if (!chirality) return { kind: "no-skeleton" };
  if (chirality.n < FACING_MIN_PAIRS) return { kind: "few-pairs", n: chirality.n };
  if (chirality.coherence < FACING_MIN_COHERENCE) {
    return { kind: "incoherent", n: chirality.n, coherence: chirality.coherence };
  }
  const axial = axialCue(nodes);
  return { kind: "measured", requiredYawOffsetDeg: requiredYawOffsetDeg(chirality, axial), chirality, axial };
}

// ---------------------------------------------------------------------------
// 匯入當下要做什麼（HITL 分層漏斗的 Tier 1 / 1.5 / 2）
// ---------------------------------------------------------------------------

export interface FacingIntake {
  verdict: FacingVerdict;
  /** 量得出來時的幾何要求角度；量不出來是 null。 */
  measuredYawOffsetDeg: number | null;
  /**
   * 作者手填的那一格（⭐ 一定留著，⛔ 不無聲覆蓋 —— 審查頁要能一鍵退回）。
   *
   * ⚠️ ⭐ `null` ＝ **呼叫端沒有宣告角度**（例：後台 `ModelVersions.prepare()` 只做正規化，
   * 轉向留給模型文件自己那一格）—— ⛔ 它**不等於填 0**。
   * 兩者混起來，「沒有覆寫、走家族預設 90°」的那一大族（`imported.*`，含刻意不覆寫的
   * `imported.heropika`）就會**每一次都被報成不一致** —— ⭐ 而一條一直喊的警報沒有人讀。
   */
  declaredYawOffsetDeg: number | null;
  /** 這次真的要寫進文件的角度（⛔ 沒有宣告又量不出來時是 null：⭐ 不猜）。 */
  appliedYawOffsetDeg: number | null;
  /** ⭐ 量到的與手填的不一樣（不管有沒有自動寫入）。 */
  mismatch: boolean;
  /** ⛔ 量不出來 ⇒ 送人工（批次審查頁的四個角度按鈕）。 */
  needsManualReview: boolean;
  /** 給人讀的一行（入庫報告、後台上傳結果都印這一句）。 */
  note: string;
}

const WHY: Record<Exclude<FacingVerdict["kind"], "measured">, (v: FacingVerdict) => string> = {
  "no-skeleton": () => "一對左右骨頭都配不到（靜態道具或單網格模型）",
  "few-pairs": (v) => `只有 ${(v as { n: number }).n} 對左右骨頭 —— 樣本數不足以排除巧合`,
  "incoherent": (v) => `${(v as { n: number }).n} 對左右骨頭彼此不同意（coherence ${(v as { coherence: number }).coherence.toFixed(3)}）—— 骨架疑似被鏡射過`,
};

/**
 * 匯入當下的面向決定 —— ⭐ **這是 HITL 分層漏斗，⛔ 不是一個是非題**（GH#1272）：
 *
 * | Tier | 情況 | 做什麼 |
 * |---|---|---|
 * | 1   | 量得出來、與手填一致 | 照原樣過 |
 * | 1.5 | 量得出來、與手填**不同** | ⭐ 以量到的為準並警告；⭐ 手填值留在報告裡（⛔ 不無聲覆蓋） |
 * | 2   | 量不出來 | ⛔ **不擋入庫**，標「面向待人工確認」送批次審查頁 |
 *
 * ⚠️ `autoApply=false` 時只警告不改（⭐ 這一格只有作者／CI 會轉 ⇒ 旗標／環境變數，
 * ⛔ 不進後台三個住處 —— owner 不會去轉的欄位是裝飾，2026-09-06 的前例）。
 */
export function facingIntake(
  json: Pick<GlbDocument, "nodes">,
  /** ⛔ `null` ＝ 呼叫端沒有宣告角度（⭐ 不等於填 0，見 `declaredYawOffsetDeg`）。 */
  declaredYawOffsetDeg: number | null,
  options: { autoApply?: boolean } = {},
): FacingIntake {
  const autoApply = options.autoApply !== false;
  const verdict = measureFacing(json);
  const declared = declaredYawOffsetDeg === null ? null : norm360(declaredYawOffsetDeg);
  if (verdict.kind !== "measured") {
    return {
      verdict, measuredYawOffsetDeg: null, declaredYawOffsetDeg: declared, appliedYawOffsetDeg: declared,
      mismatch: false, needsManualReview: true,
      note: `面向待人工確認：${WHY[verdict.kind](verdict)}；`
        + (declared === null ? "呼叫端沒有宣告角度 ⇒ 交給模型文件／家族預設" : `沿用手填的 ${declared}°`),
    };
  }
  const measured = verdict.requiredYawOffsetDeg;
  if (declared === null) {
    // ⭐ 沒有宣告 ⇒ 只回報量到的，⛔ 不宣稱「不一致」（那會讓整個 `imported.*` 家族一直喊）。
    return {
      verdict, measuredYawOffsetDeg: measured, declaredYawOffsetDeg: null, appliedYawOffsetDeg: measured,
      mismatch: false, needsManualReview: false,
      note: `面向量到 ${measured}°（呼叫端沒有宣告角度；${verdict.chirality.n} 對骨頭，coherence ${verdict.chirality.coherence.toFixed(3)}）`,
    };
  }
  const mismatch = Math.abs(((measured - declared + 540) % 360) - 180) > FACING_TOLERANCE_DEG;
  if (!mismatch) {
    return {
      verdict, measuredYawOffsetDeg: measured, declaredYawOffsetDeg: declared, appliedYawOffsetDeg: declared,
      mismatch: false, needsManualReview: false,
      note: `面向量到 ${measured}°，與填的一致（${verdict.chirality.n} 對骨頭，coherence ${verdict.chirality.coherence.toFixed(3)}）`,
    };
  }
  return {
    verdict, measuredYawOffsetDeg: measured, declaredYawOffsetDeg: declared,
    appliedYawOffsetDeg: autoApply ? measured : declared,
    mismatch: true, needsManualReview: false,
    note: autoApply
      ? `面向量到 ${measured}°、填的是 ${declared}° ⇒ ⭐ 已寫入 ${measured}°（手填的 ${declared}° 留在報告裡，可一鍵退回）`
      : `⚠️ 面向量到 ${measured}°、填的是 ${declared}° ⇒ ⛔ 自動寫入已關閉，維持 ${declared}°`,
  };
}

/**
 * 自動寫入量到的角度要不要開 —— ⭐ 環境變數 `GGD_MODEL_FACING_AUTO=0` 關掉（回到只警告）。
 *
 * ⭐ **為什麼是環境變數、⛔ 不是後台三個住處**：這一格只有**作者與 CI** 會轉 ——
 * owner 不會去後台調「入庫時要不要自動修轉向」。⛔ 一格 owner 不會轉的後台欄位是**裝飾**，
 * 而裝飾會被 `configDecorationCensus` 棘輪擋下（2026-09-06 的前例：一格閘的嚴格度做成後台設定）。
 *
 * ⚠️ 讀不到 `process` 就回 true（編輯器跑在瀏覽器 worker 裡，那裡本來就沒有環境變數）——
 * ⛔ 這不是靜默 fail-open：預設值就是「開」，而關掉它是作者在自己機器上的一次性動作。
 */
export function facingAutoApplyEnabled(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const flag = env?.GGD_MODEL_FACING_AUTO;
  return !(flag === "0" || flag === "false" || flag === "off");
}

// ---------------------------------------------------------------------------
// ⭐ 校準釘 —— 把這一份與 `modelFacing.test.ts` 那一份綁在一起
// ---------------------------------------------------------------------------

/**
 * ⭐ **量尺要先自證**（CLAUDE.md：「一把只驗過單邊的尺，不算自證過」）。
 *
 * 這三具是出貨普查 `modelFacing.test.ts` 自己釘死的答案，⭐ 而它們**各驗一個方向**：
 *   · `imported.heroryuk`  —— 退休的手寫清單已經說它是翻轉的；量法要**獨立重新發現** 270°
 *     （量不到 ⇒ 這把尺證明不了「東西在」）
 *   · `imported.linkstik`  —— 手寫清單**漏掉**的那一具；它正是這支普查當初被寫出來的原因
 *   · `imported.heropika`  —— ⭐ **反方向**：骨架 L/R 整副顛倒 ⇒ 光看掌性會說 270，
 *     而尾巴說正面在 +X ⇒ 正解是**不要覆寫**、走家族預設
 *     （量到 270 ⇒ 這把尺會把對的東西改壞，也就是它證明不了「東西不在」）
 *
 * ⚠️ 這張表**不是**在複述那支普查的斷言 —— `facing.test.ts` 拿**真的 GLB 位元組**重算，
 * ⇒ 兩份量測程式只要開始漂，這裡就紅。⛔ 沒有這條線，「兩個住處」就是一句沒人驗的散文。
 */
export const FACING_CALIBRATION: Readonly<Record<string, { requiredYawOffsetDeg: number; why: string }>> = {
  "imported.heroryuk": { requiredYawOffsetDeg: 270, why: "退休手寫清單唯一點名過的翻轉模型 —— 量法要獨立重新發現它" },
  "imported.linkstik": { requiredYawOffsetDeg: 270, why: "手寫清單漏掉的那一具（時空勇者 - 林克），出貨在真的英雄身上" },
  "imported.heropika": { requiredYawOffsetDeg: 90, why: "⭐ 反方向：整副骨架 L/R 顛倒，掌性說 270 而尾巴說 +X ⇒ 走家族預設 90" },
};

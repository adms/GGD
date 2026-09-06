/**
 * championPitch —— 選角畫面上那三行（owner 2026-08-16）。
 *
 * ```
 * 揍敵客桀諾｜鬥士 (近戰・中距離)      ← headline：⭐ 全部推導
 *   攻速・暗殺・追擊                   ← playstyle：內容（英雄卡）
 *   高速貼住指定目標，以密集攻擊…       ← pitch：內容（英雄卡）
 * ```
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 為什麼第一行是**推導**的，而不是第三個手填欄位
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * owner 給的表把「鬥士 (近戰・中 1.6)」寫成一欄，最省事的做法是把那串字直接
 * 存進英雄卡。⛔ 但那樣就是**第四個住處**：出身住 `champion@1.origin`，
 * 尺標住 `scaleByOrigin`，級距住 `byOrigin.range`，絕對值住 `bandsByScale` ——
 * 再抄一份人看的字串進英雄卡，它跟前面三個之間沒有任何守衛。
 *
 * 而這四個東西**這個月已經各動過一次**（出身 36/49 位重指派、尺標從
 * `attackType` 換成出身、級距表重寫、移速上限改兩次）。抄下來的那一行
 * 會在第一次改動之後就開始說謊，⛔ 而且是**玩家看得到、測試看不到**的謊。
 *
 * ⇒ 這裡只做「查表 + 組字串」，⛔ 一個數字都不存。
 * owner 把砲手的射程從 12 改成 10，整排卡片自己跟著變。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 兩個「看起來可以省」但不能省的地方
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ① **不要用 `def.attackType` 決定「近戰／遠程」這四個字。**
 *    出貨資料裡 10/49 位兩者相反（藏馬 `melee` 但走遠程尺 8.2、皮卡娘 `ranged`
 *    但走近戰尺 1.4）。畫面寫「遠程」而他實際上是近身揮擊沒關係 ——
 *    這一行講的是**距離**，`attackType` 講的是**投射物 vs 揮擊**。
 *    ⛔ 但反過來寫成 `attackType` 就會讓那 10 位的距離標示與實際差 5 倍。
 *
 * ② **`playstyle` / `pitch` 缺席時要整段消失，⛔ 不要填佔位字。**
 *    78 位英雄裡只有 owner 指定過的那些有；替其餘的編一句「一位強大的戰士」
 *    比空白更糟 —— 它看起來像內容，所以沒有人會發現它是缺的。
 */
import {
  NORMAL_BANDS,
  type NormalBand,
  type Origin,
  type ScaleKey,
  type StatNormalization,
  bandFor,
  originOf,
} from "./statNormalization";

/** 兩把尺在畫面上的名字。 */
export const SCALE_LABEL_ZH: Readonly<Record<ScaleKey, string>> = Object.freeze({
  melee: "近戰",
  ranged: "遠程",
});

/**
 * 級距在**距離**這個語境下的說法。
 *
 * ⚠️ 級距本身的語意是 owner 給的（極小=缺陷 · 小=偏低 · 中=標準 · 大=優勢 ·
 * 極大=特化），但那組字在距離上讀不通 ——「攻擊距離：缺陷」不是玩家要的資訊。
 * ⭐ owner 的範例寫的是「(近戰・**中距離**)」，所以這裡用長短的說法。
 */
export const RANGE_BAND_LABEL_ZH: Readonly<Record<NormalBand, string>> = Object.freeze({
  極小: "極短",
  小: "短",
  中: "中",
  大: "長",
  極大: "極長",
});

export interface ChampionPitch {
  /** 出身（10 選 1）。⛔ 沒有「沒有出身」這件事 —— 缺席時 `originOf` 會推導。 */
  origin: Origin;
  /** `近戰・中距離`；⛔ 這一項不在 `appliesTo` 或表不完整時是 `null`。 */
  rangeLabel: string | null;
  /** `鬥士 (近戰・中距離)`，距離查不到時只剩 `鬥士`。 */
  headline: string;
  /** 核心玩法。⛔ 沒填就是空陣列，⛔ 不編一組。 */
  playstyle: readonly string[];
  /** 選角說明。⛔ 沒填就是 `null`，⛔ 不編一句。 */
  pitch: string | null;
}

/** `攻速・暗殺・追擊` —— owner 的範例用的是全形頓號。 */
export const PLAYSTYLE_SEPARATOR = "・";

function isBand(v: unknown): v is NormalBand {
  return typeof v === "string" && (NORMAL_BANDS as readonly string[]).includes(v);
}

/**
 * 這一項屬性在畫面上的「尺・級距」說法。
 *
 * ⛔ 回 `null` 而不是猜一個 —— 表不完整（新出身還沒填、或這一項根本不是雙尺）
 * 時，少一行遠比印一個錯的量級好。
 */
export function scaleBandLabel(
  cfg: StatNormalization,
  key: "range",
  origin: Origin,
): string | null {
  const scale = cfg.scaleByOrigin[key]?.[origin];
  const band = cfg.byOrigin[key]?.[origin];
  if (scale === undefined || !isBand(band)) return null;
  return `${SCALE_LABEL_ZH[scale]}${PLAYSTYLE_SEPARATOR}${RANGE_BAND_LABEL_ZH[band]}距離`;
}

/**
 * 英雄卡 + 正規化設定 → 選角畫面要印的東西。
 *
 * `def` 用結構型別而不是 `ChampionDef`，因為 `playstyle` / `pitch` 是
 * `registerChampion` 原樣保留但 `ChampionDef` 沒有宣告的欄位（跟 `description`
 * 同一個處境），呼叫端本來就是從執行期物件上讀它們。
 */
export function championPitchOf(
  def: { playstyle?: unknown; pitch?: unknown } & Parameters<typeof originOf>[0],
  cfg: StatNormalization,
): ChampionPitch {
  const origin = originOf(def);
  const rangeLabel = scaleBandLabel(cfg, "range", origin);
  const rawStyle = Array.isArray(def.playstyle) ? def.playstyle : [];
  const playstyle = rawStyle.filter(
    (s): s is string => typeof s === "string" && s.trim() !== "",
  );
  const rawPitch = typeof def.pitch === "string" ? def.pitch.trim() : "";
  return {
    origin,
    rangeLabel,
    headline: rangeLabel === null ? origin : `${origin} (${rangeLabel})`,
    playstyle,
    pitch: rawPitch === "" ? null : rawPitch,
  };
}

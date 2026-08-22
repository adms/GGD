/**
 * 連段家族表（`config.combo-strikes@1`）的**解析器** —— #541 的第〇·四守則那一半。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 為什麼段數與節奏不可以住在技能 JSON 裡
 *
 * owner 2026-08-22：「我將出身 屬性 技能傷害耗魔冷卻距離範圍 這些五級距
 * **正規化 公式化**，就是為了**統一性 方便設定調整修改 一勞永逸**」。
 *
 * 一支連段技的節奏（幾段、每段隔多久、收尾等多久）是**同一族技能共用的一張
 * 表**，⛔ 不是每一支各抄一份的數字。抄一份的代價量得到：CLAUDE.md 記著
 * 「一行公式改動 ≈ 一小時」，而那正是 199 個節點同時寫 `damageTier` + `flat`
 * 造成的。⇒ 技能文件只寫 `family: "七連斬"`，段數在**載入時**從表解析。
 *
 * ⭐ ⛔ **`family` 與算好的班表不可以同時存在於一份出貨文件裡** —— 那就是
 * 「第二個住處」。所以這支解析器是**載入期**的重寫（與 `resolveDisplacementTier`
 * / `resolveRadiusTier` 同一個位置、同一個方向），⛔ 不是產生器往 JSON 烘值。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② 級別贏過手寫值（與位移級距／AoE 級距逐字相同的立場）
 *
 * 一個節點同時有 `family` 與 `steps` 時，**`family` 贏**。理由不是潔癖：
 * 讓手寫值蓋過表，等於這個機制對那支技能不存在，而且沒有人會發現
 *（`displacementTiers.ts` 的同一段話）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ ⛔ 表不在的時候**不是**靜默退回一個猜出來的節奏
 *
 * 這支只做一件事：查得到就寫進去，查不到就**原封不動**。判斷「查不到算不算
 * 壞掉」的是 `sim/effects/comboStrikes.ts` 的 handler —— 它在完全排不出班表時
 * 擲一個**指名 family 的錯誤**（與 `summon.killCredit:"owner"` 同一個前例）。
 * ⛔ 一個安靜跳過的連段，卡面上寫著「連斬七次」而場上一刀都沒有，正是
 * CLAUDE.md 失敗形態②。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ④ purity
 *
 * 純函式：無 rng、無時鐘、無三角函式、無 `**`。它跑在載入期，但寫成純函式是
 * 為了能被 sim 的測試直接呼叫（而 `sim/purity.test.ts` 掃得到這個資料夾）。
 */

/** 一族連段的節奏。⛔ 這裡沒有傷害 —— 傷害是 `perStrike` 裡的效果自己的事。 */
export interface ComboFamilyRow {
  /** 幾段（與 {@link ComboFamilyRow.steps} 二選一）。 */
  readonly strikes?: number;
  /** 等間隔的秒數（配 `strikes`）。 */
  readonly intervalSec?: number;
  /**
   * ⭐ **不等間隔**：每一段離施法那一刻的秒數偏移，遞增。
   * JASS 的連段多半是這一種（前三刀快、第四刀停頓、最後一刀重）。
   */
  readonly steps?: readonly number[];
  /** 收尾那一發在最後一段之後再等多久。 */
  readonly finisherDelaySec?: number;
}

/** 整張表：family key → 節奏。 */
export type ComboFamilyTable = Readonly<Record<string, ComboFamilyRow>>;

/**
 * 把一份剛讀進來的 `config.combo-strikes@1` 文件正規化成 {@link ComboFamilyTable}。
 *
 * ⚠️ **刻意寬鬆地接兩種外形**（`{families:{…}}` 與扁平的 `{key:{…}}`），
 * 因為這張表由另一條 lane 產出而這支要先落地。⛔ 這不是 fail-open：認不得的
 * 列會被**丟掉**，於是用到它的技能會走到 handler 的那個指名錯誤，⛔ 不會
 * 靜默地變成一段一刀。
 */
export function normalizeComboTable(doc: unknown): ComboFamilyTable {
  if (doc === null || typeof doc !== "object") return {};
  const bag = doc as Record<string, unknown>;
  // ⭐ 出貨的 `families` 是一個**陣列**，每一列自己帶 `key`（`config.combo-strikes@1`）。
  // ⛔ 在 2026-08-22 之前這裡只吃物件形，於是 `Object.keys(陣列)` 拿到的是索引
  // `"0","1","2"…` —— 表「載入成功」而每一支技能的 `family` 都查不到，
  // 結果是 11 條測試同時紅在「排不出班表」上。⭐ 三種外形都吃得下。
  const famRaw = bag["families"];
  const src: Record<string, unknown> = Array.isArray(famRaw)
    ? Object.fromEntries(
        famRaw
          .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
          .map((r) => [String(r["key"] ?? ""), r] as const)
          .filter(([k]) => k !== ""),
      )
    : famRaw !== null && typeof famRaw === "object"
      ? (famRaw as Record<string, unknown>)
      : bag;
  const out: Record<string, ComboFamilyRow> = {};
  // Object.keys 已經是插入序（全序）；⛔ 這裡不迭代 Map。
  for (const key of Object.keys(src).sort()) {
    const row = src[key];
    if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const steps = Array.isArray(r["steps"])
      ? (r["steps"] as unknown[]).filter((n): n is number => typeof n === "number" && Number.isFinite(n))
      : undefined;
    const num = (k: string): number | undefined => {
      const v = r[k];
      return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    };
    const parsed: ComboFamilyRow = {
      ...(num("strikes") !== undefined ? { strikes: num("strikes") } : {}),
      ...(num("intervalSec") !== undefined ? { intervalSec: num("intervalSec") } : {}),
      ...(steps !== undefined && steps.length > 0 ? { steps } : {}),
      ...(num("finisherDelaySec") !== undefined
        ? { finisherDelaySec: num("finisherDelaySec") }
        : {}),
    };
    // 一列既沒有 steps 也沒有 strikes = 排不出班表 = 不是一列（見檔頭③）。
    if (parsed.steps === undefined && parsed.strikes === undefined) continue;
    out[key] = parsed;
  }
  return out;
}

/**
 * 把一份技能／道具文件裡的每一個 `comboStrikes` 節點的 `family` 解析掉。
 *
 * ⚠️ 形狀刻意逐字比照 `content/displacementTiers.ts::resolveDisplacementTier`：
 * 同一種「載入期遞迴重寫」的東西長得一樣，下一個級距欄位就不會再發明第三種。
 *
 * ⛔ 它**不會**把 `family` 這一格拿掉：卡面文案與後台下拉都還要讀它
 *（第〇·四守則要的是「值不要有第二個住處」，⛔ 不是「級別名要被吃掉」）。
 */
export function resolveComboFamilies<T extends Record<string, unknown>>(
  def: T,
  table: ComboFamilyTable,
): T {
  return walk(def) as T;

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    const rec = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = walk(v);

    if (rec["kind"] !== "comboStrikes") return out;
    const family = rec["family"];
    if (typeof family !== "string") return out;
    const row = table[family];
    if (row === undefined) return out;

    // ⭐ 級別贏過手寫值（檔頭②）。整組一起換掉，⛔ 不是逐格 `??` ——
    // 混一半表一半手寫的班表沒有任何一份文件描述得了。
    if (row.steps !== undefined) {
      out["steps"] = [...row.steps];
      delete out["strikes"];
      delete out["intervalSec"];
    } else if (row.strikes !== undefined) {
      out["strikes"] = row.strikes;
      delete out["steps"];
      if (row.intervalSec !== undefined) out["intervalSec"] = row.intervalSec;
    }
    if (row.finisherDelaySec !== undefined) out["finisherDelaySec"] = row.finisherDelaySec;
    return out;
  }
}

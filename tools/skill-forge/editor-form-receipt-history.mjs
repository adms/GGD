import { isDeepStrictEqual } from "node:util";

const HASH = /^[a-f0-9]{64}$/;
const FINGERPRINT = /^[a-f0-9]{8,64}$/;

/**
 * The receipt packet's identity — ⭐ ONE home, imported by build-editor-form-receipts.mjs
 * (dedupeKey + output file name).
 *
 * ⛔ 2026-09-15 更正：這裡原本寫死 `"claim.editor-form-receipts"`，而 bccf87c1b（09-11）
 * 把產生器的 key 版本化成 `-spawn-obstacle`、c57fc0c3a 再改成 `-spawn-obstacle-landed` 時
 * **沒有跟著改這一行** ⇒ 「沿用歷史位元組」這條分支從 09-11 起**永遠走不到**，
 * 而沒有任何東西變紅（本檔的 node:test 夾具也抄了舊 key，且不在任何閘裡跑）。
 * 守衛：packages/shared/src/ops/editorFormReceiptHistoryReachable.test.ts（讀出貨的那一份 packet）。
 */
export const EDITOR_FORM_RECEIPT_KEY = "claim.editor-form-receipts-spawn-obstacle-landed";

/**
 * Census columns a receipt row copies verbatim from ggd-bricks.json that are
 * NOT an input or an output of the React form measurement.
 *
 * ⭐ `usedBy` ＝ 出貨內容裡有幾支技能引用這顆積木（bricks:build 的採用數）。
 *   它由 editorFormInteractions.test.tsx:81 的 `{ ...brick }` 一起抄進收據列，
 *   ⛔ 而沒有任何讀者（tools/brick-census/bricks.ts 只讀 id／layer／renderable），
 *   也不會改變任何一個表單控制項。
 * ⛔ 在此之前它與 capabilityFingerprint 不同待遇 ⇒ 任何一次**與表單無關**的採用數變動
 *   （GH#993 修普查 159→148 讓 4 格 usedBy 變）都逼 formreceipts:check 重產這份 packet，
 *   ⇒ coord:check 立刻判「同一題重問」（key 與契約指紋都沒變）⇒ 兩條閘必然互斥。
 * ⚠️ 忽略它的代價：沿用的歷史位元組裡 usedBy 停在併進 main 那一刻（＝歷史收據，
 *   與 capabilityFingerprint 同一種「as of baseCommit」語意）。現行採用數只看 ggd-bricks.json。
 * ⛔ 其餘每一格（renderable、reason、params、origin、controlCount…）變了仍然拒絕沿用。
 */
const NON_MEASUREMENT_RECEIPT_FIELDS = Object.freeze(["usedBy"]);

/**
 * Return exact merged packet bytes only when a new real measurement agrees.
 * Only the broad capability fingerprint and census-copied, non-measurement
 * receipt columns (NON_MEASUREMENT_RECEIPT_FIELDS) may differ. In particular,
 * changing a measured receipt value, its inputs, claims, attribution,
 * limitations, or identity cannot reuse history. null means the caller must use
 * its normal current-packet path.
 */
export function unchangedHistoricalReceipt(mergedText, measuredPacket) {
  if (typeof mergedText !== "string") return null;
  let historical;
  try { historical = JSON.parse(mergedText); } catch { return null; }
  for (const packet of [historical, measuredPacket]) {
    if (packet?.schema !== "ggd-coord-packet@1"
      || packet?.dedupeKey !== EDITOR_FORM_RECEIPT_KEY
      || !Array.isArray(packet?.receipts) || packet.receipts.length === 0
      || !HASH.test(packet?.source?.brickInputSha256 ?? "")
      || !HASH.test(packet?.source?.typeCatalogSha256 ?? "")
      || !FINGERPRINT.test(packet?.source?.capabilityFingerprint ?? "")) return null;
  }
  const measurementOnly = (packet) => {
    const source = { ...packet.source };
    delete source.capabilityFingerprint;
    const receipts = packet.receipts.map((row) => {
      if (row === null || typeof row !== "object") return row;
      const copy = { ...row };
      for (const field of NON_MEASUREMENT_RECEIPT_FIELDS) delete copy[field];
      return copy;
    });
    return { ...packet, source, receipts };
  };
  return isDeepStrictEqual(
    measurementOnly(historical), measurementOnly(measuredPacket),
  ) ? mergedText : null;
}

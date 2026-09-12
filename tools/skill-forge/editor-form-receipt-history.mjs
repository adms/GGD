import { isDeepStrictEqual } from "node:util";

const HASH = /^[a-f0-9]{64}$/;
const FINGERPRINT = /^[a-f0-9]{8,64}$/;

/**
 * Return exact merged packet bytes only when a new real measurement agrees.
 * Only the broad capability fingerprint may differ. In particular, changing a
 * receipt, its inputs, claims, attribution, limitations, or identity cannot reuse
 * history. null means the caller must use its normal current-packet path.
 */
export function unchangedHistoricalReceipt(mergedText, measuredPacket) {
  if (typeof mergedText !== "string") return null;
  let historical;
  try { historical = JSON.parse(mergedText); } catch { return null; }
  for (const packet of [historical, measuredPacket]) {
    if (packet?.schema !== "ggd-coord-packet@1"
      || packet?.dedupeKey !== "claim.editor-form-receipts"
      || !Array.isArray(packet?.receipts) || packet.receipts.length === 0
      || !HASH.test(packet?.source?.brickInputSha256 ?? "")
      || !HASH.test(packet?.source?.typeCatalogSha256 ?? "")
      || !FINGERPRINT.test(packet?.source?.capabilityFingerprint ?? "")) return null;
  }
  const withoutBroadFingerprint = (packet) => {
    const source = { ...packet.source };
    delete source.capabilityFingerprint;
    return { ...packet, source };
  };
  return isDeepStrictEqual(
    withoutBroadFingerprint(historical), withoutBroadFingerprint(measuredPacket),
  ) ? mergedText : null;
}

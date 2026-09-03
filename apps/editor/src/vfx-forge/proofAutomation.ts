/**
 * Browser proof may only leave the Editor through a loopback one-shot receiver.
 * Keeping this parser shared and tested prevents query automation from silently
 * becoming a generic image-upload endpoint.
 */
export function normalizeLoopbackProofSink(raw: string | null | undefined): string {
  const value = raw?.trim() ?? "";
  if (!value) return "";
  try {
    const sink = new URL(value);
    if (sink.protocol !== "http:") return "";
    if (sink.hostname !== "127.0.0.1" && sink.hostname !== "localhost") return "";
    return sink.toString();
  } catch {
    return "";
  }
}

export function proofSinkFromSearch(search: string): string {
  return normalizeLoopbackProofSink(new URLSearchParams(search).get("proofSink"));
}

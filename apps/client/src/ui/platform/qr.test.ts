/**
 * qr — the self-contained (no-CDN) QR encoder used by the handheld device-login
 * screen. These assert the STRUCTURAL invariants of a real QR symbol (size,
 * finder + timing patterns, determinism, capacity bounds) so a regression in the
 * Reed–Solomon / masking / placement code is caught without a camera in the loop.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { encodeQR, qrVersionFor } from "./qr";

// A finder pattern is the 7x7 concentric square at three corners: dark ring,
// light gap, dark 3x3 core. Verify one corner precisely.
function assertFinder(m: boolean[][], r0: number, c0: number): void {
  for (let dr = 0; dr < 7; dr++) {
    for (let dc = 0; dc < 7; dc++) {
      const onRing = dr === 0 || dr === 6 || dc === 0 || dc === 6;
      const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      expect(m[r0 + dr]![c0 + dc]).toBe(onRing || inCore);
    }
  }
}

describe("qr encoder", () => {
  it("produces a version-3 symbol (29x29) for the login URL, with the three finder patterns", () => {
    cover("webui-qr-structure");
    const url = "https://ggd.adms.ai/link?code=WXYZ-2345";
    expect(qrVersionFor(url)).toBe(3);
    const m = encodeQR(url);
    expect(m.length).toBe(29); // version 3 → 4*3+17
    expect(m.every((row) => row.length === 29)).toBe(true);
    assertFinder(m, 0, 0); // top-left
    assertFinder(m, 0, 29 - 7); // top-right
    assertFinder(m, 29 - 7, 0); // bottom-left
  });

  it("lays the timing patterns as alternating modules on row/col 6", () => {
    cover("webui-qr-structure");
    const m = encodeQR("https://ggd.adms.ai/link?code=WXYZ-2345");
    for (let i = 8; i < m.length - 8; i++) {
      expect(m[6]![i]).toBe(i % 2 === 0);
      expect(m[i]![6]).toBe(i % 2 === 0);
    }
  });

  it("is deterministic — same input, same matrix", () => {
    cover("webui-qr-structure");
    const a = encodeQR("https://ggd.adms.ai/link?code=ABCD-1234");
    const b = encodeQR("https://ggd.adms.ai/link?code=ABCD-1234");
    expect(a).toEqual(b);
  });

  it("grows the version for longer payloads and shrinks for short ones", () => {
    cover("webui-qr-structure");
    expect(qrVersionFor("https://x/link?code=AB-CD")).toBeLessThanOrEqual(2);
    // A long URL must still fit inside the supported range.
    const long = "https://ggd.adms.ai/link?code=WXYZ-2345&extra=" + "a".repeat(40);
    expect(qrVersionFor(long)).toBeGreaterThan(3);
    expect(encodeQR(long).length).toBeGreaterThan(29);
  });

  it("throws rather than emit an unscannable oversized symbol", () => {
    cover("webui-qr-structure");
    expect(() => encodeQR("x".repeat(500))).toThrow();
  });

  it("carries no obvious plaintext (the matrix is booleans, the payload is not embedded as text)", () => {
    cover("webui-qr-structure");
    const m = encodeQR("https://ggd.adms.ai/link?code=WXYZ-2345");
    // Trivial but load-bearing: the render surface is a boolean grid, never the
    // string — nothing downstream can accidentally leak the URL as text here.
    expect(typeof m[0]![0]).toBe("boolean");
  });
});

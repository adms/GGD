/**
 * Export delivery surface contract.
 *
 * Builder tests prove the bytes; this test proves the operator can still reach
 * every promised path. It intentionally asserts rendered controls, not source
 * constants, so deleting a button from the page turns the suite red.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { mount } from "@ggd/shared/testkit/headlessUi";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("@ggd/shared/testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { entries: [{ id: "test.q", hash: "hash" }] }, isLoading: false }),
}));

vi.mock("../api/client", () => ({
  api: {
    index: async () => ({ entries: [] }),
    doc: async () => ({}),
    validate: async () => ({ ok: true }),
    externalTargetProfile: async () => ({}),
  },
}));

const { ExportCenterPage } = await import("./ExportCenterPage");

describe("Export Center operator paths", () => {
  it("renders single JSON plus JSON/ZIP controls for bootstrap, full and delta", () => {
    const page = mount(createElement(ExportCenterPage));
    expect(page.fieldOrNull("export.single.json")).not.toBeNull();
    for (const mode of ["bootstrap", "full", "delta"] as const) {
      expect(page.fieldOrNull(`export.mode.${mode}`)).not.toBeNull();
      expect(page.fieldOrNull(`export.mode.${mode}.json`)).not.toBeNull();
      expect(page.fieldOrNull(`export.mode.${mode}.zip`)).not.toBeNull();
    }
  });
});

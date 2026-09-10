import { afterEach, expect, it, vi } from "vitest";
import { modelUploadFixture } from "./fixtures";
import { inspectModelUpload } from "./inspect";

afterEach(() => {
  vi.doUnmock("../../../../../content/config/model-lod.json");
  vi.resetModules();
});

it.each([
  { warn: 20, limit: 40, warnings: 0, errors: 1 },
  { warn: 40, limit: 80, warnings: 1, errors: 0 },
  { warn: 80, limit: 160, warnings: 0, errors: 0 },
])("the same 60-channel model follows config $warn/$limit", async ({ warn, limit, warnings, errors }) => {
  vi.resetModules();
  vi.doMock("../../../../../content/config/model-lod.json", () => ({
    default: { championChannelWarn: warn, championChannelLimit: limit },
  }));
  const { heroModelBudgetIssues } = await import("./heroModel");
  const inspected = await inspectModelUpload(modelUploadFixture().bytes);
  const result = heroModelBudgetIssues({
    ...inspected,
    clips: [{ index: 0, name: "Motion", duration: 1, channels: 60 }],
  });
  expect(result.errors).toHaveLength(errors);
  expect(result.warnings).toHaveLength(warnings);
});

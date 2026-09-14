import { expect, it } from "vitest";
import { heroBodyModelIds } from "./bodyModels";
// GH#1188 待認領的守衛搬到 `apps/content-api/src/modelClaims.test.ts`（判準改住 `./modelClaims.ts`，涵蓋凍結版本來源鏈在內的每一種證據）。

const model = (id: string, extra: Record<string, unknown> = {}) => ({
  id, schema: "model@1", glbPath: "assets/models/body.glb", scale: 1, collisionRadius: 0.5,
  clipMap: { idle: "idle", run: "run", attack: "attack", cast: "cast", hurt: "hurt", death: "death" },
  ...extra,
});

it("allows a new approved body without inventing an official champion and preserves legacy bodies", () => {
  expect(heroBodyModelIds([
    ["models/new-body", model("new-body", { heroBody: true })],
    ["models/legacy-body", model("legacy-body")],
    ["champions/existing", { modelKey: "legacy-body" }],
    ["models/effect-only", model("effect-only")],
  ])).toEqual(["legacy-body", "new-body"]);
});

it("withdraws a marked body even when an existing champion still references it", () => {
  expect(heroBodyModelIds([
    ["models/withdrawn", model("withdrawn", { heroBody: false })],
    ["champions/existing", { modelKey: "withdrawn" }],
    ["champions/missing", { modelKey: "absent" }],
  ])).toEqual([]);
});

it("does not accept malformed approval, incomplete animation metadata or mismatched document identity", () => {
  expect(heroBodyModelIds([
    ["models/string-approval", model("string-approval", { heroBody: "true" })],
    ["models/incomplete", model("incomplete", { heroBody: true, clipMap: {} })],
    ["models/renamed", model("another-id", { heroBody: true })],
    ["models/null", null],
  ])).toEqual([]);
});

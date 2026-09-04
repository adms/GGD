import { describe, it, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAll } from "./registries";
import { Abilities } from "../sim/content/registry";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
describe("probe", () => {
  beforeAll(async () => {
    registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
  });
  it("印出來", () => {
    const d = Abilities.get("godie-etyr.r" as never) as unknown as Record<string, unknown>;
    console.log("DESC>>", JSON.stringify(String(d?.["description"] ?? "(無)")));
    console.log("KEYS>>", JSON.stringify(Object.keys(d ?? {})));
    console.log("EFF>>", JSON.stringify(d?.["effects"]).slice(0,400));
  });
});

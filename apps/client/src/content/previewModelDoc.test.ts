import { afterEach, expect, it, vi } from "vitest";
import { Models } from "@ggd/shared/content";
import { ensureContentLoaded } from "./bootContent";
import { readPreviewModelDoc } from "./previewModelDoc";

vi.mock("./bootContent", () => ({ ensureContentLoaded: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("waits for the validated overlay and uses its private model instead of missing shipped JSON", async () => {
  const doc = { id: "instance.hero.v1.model", schema: "model@1", glbPath: "assets/hero-instances/old.glb", scale: 0.9 };
  let ready = false;
  vi.mocked(ensureContentLoaded).mockImplementation(async () => { ready = true; return { ok: true, championCount: 1 }; });
  vi.spyOn(Models, "tryGet").mockImplementation((key) => ready && key === doc.id ? doc as never : undefined);
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  expect(await readPreviewModelDoc(doc.id)).toEqual(doc);
  expect(fetcher).not.toHaveBeenCalled();
  expect(await readPreviewModelDoc("missing")).toBeNull();
});

it("keeps standalone shop models that are outside the boot registry", async () => {
  vi.mocked(ensureContentLoaded).mockResolvedValue({ ok: true, championCount: 1 });
  vi.spyOn(Models, "tryGet").mockReturnValue(undefined);
  const doc = { id: "shop.skin", glbPath: "assets/shop.glb" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(doc)));
  expect(await readPreviewModelDoc(doc.id)).toEqual(doc);
});

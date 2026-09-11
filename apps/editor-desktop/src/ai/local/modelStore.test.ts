import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalModelStore } from "./modelStore";
import type { LocalModelManifest } from "./modelManifest";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function setup(body = "model") {
  const root = mkdtempSync(join(tmpdir(), "ggd-model-store-"));
  roots.push(root);
  const bytes = Buffer.from(body);
  const manifest: LocalModelManifest = {
    schema: "ggd-local-model-manifest@1",
    id: "fixture-model",
    displayName: "Fixture model",
    revision: "v1",
    sourceRevision: "source-v1",
    url: "https://huggingface.co/test/model.gguf",
    expectedBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    filename: "model.gguf",
    license: "test",
    allowedRedirectHostSuffixes: ["huggingface.co"],
    trust: "bundled-application-signature",
    releaseGate: "pending-e8",
  };
  return { root, bytes, manifest };
}

async function waitFor(store: LocalModelStore, state: string): Promise<void> {
  if (store.status().model.state === state) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { unsubscribe(); reject(new Error(`timed out waiting for ${state}`)); }, 1000);
    const unsubscribe = store.subscribe((status) => {
      if (status.model.state !== state) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
}

describe("local model store", () => {
  it("installs only the compiled model, keeps inference gated, and removes fixed files", async () => {
    const { root, bytes, manifest } = setup();
    const fakeFetch = (async () => new Response(bytes, { status: 200 })) as typeof fetch;
    const store = new LocalModelStore(root, "local", true, manifest, fakeFetch, () => Number.MAX_SAFE_INTEGER);
    expect(store.status().model.state).toBe("not-installed");
    expect((await store.control("start")).model.state).toBe("downloading");
    await waitFor(store, "ready");
    expect(store.status().inference).toMatchObject({ enabled: false, reasonCode: "LOCAL_AI_E8_GATE_PENDING" });
    expect(existsSync(store.paths.final)).toBe(true);
    await store.control("remove");
    expect(store.status().model.state).toBe("not-installed");
    expect(existsSync(store.paths.final)).toBe(false);
  });

  it("marks a failed digest broken and offers a repair state", async () => {
    const { root, manifest } = setup("right");
    let requestCount = 0;
    let repairRange = "unset";
    const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      requestCount += 1;
      if (requestCount === 2) repairRange = new Headers(init?.headers).get("range") ?? "";
      return new Response(requestCount === 1 ? "wrong" : "right", { status: 200 });
    }) as typeof fetch;
    const store = new LocalModelStore(root, "off", false, manifest, fakeFetch, () => Number.MAX_SAFE_INTEGER);
    await store.control("start");
    await waitFor(store, "broken");
    expect(store.status().model.errorCode).toBe("MODEL_DIGEST_MISMATCH");
    expect(existsSync(store.paths.final)).toBe(false);
    await store.control("repair");
    await waitFor(store, "ready");
    expect(repairRange).toBe("");
  });
});

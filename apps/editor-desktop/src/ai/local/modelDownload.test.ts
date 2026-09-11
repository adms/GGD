import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { downloadAndInstallModel, ModelDownloadError, type ModelPaths } from "./modelDownload";
import type { LocalModelManifest } from "./modelManifest";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(bytes: Buffer, digest = createHash("sha256").update(bytes).digest("hex")) {
  const root = mkdtempSync(join(tmpdir(), "ggd-model-download-"));
  roots.push(root);
  const paths: ModelPaths = {
    final: join(root, "model.gguf"),
    partial: join(root, "model.gguf.partial"),
    receipt: join(root, "verification.json"),
  };
  const manifest: LocalModelManifest = {
    schema: "ggd-local-model-manifest@1",
    id: "fixture",
    displayName: "Fixture",
    revision: "fixture-v1",
    sourceRevision: "fixture-source",
    url: "https://huggingface.co/test/model.gguf",
    expectedBytes: bytes.length,
    sha256: digest,
    filename: "model.gguf",
    license: "test",
    allowedRedirectHostSuffixes: ["huggingface.co", ".hf.co"],
    trust: "bundled-application-signature",
    releaseGate: "pending-e8",
  };
  return { root, paths, manifest };
}

function responseAt(body: BodyInit, status: number, url = "https://cdn-lfs.hf.co/model.gguf"): Response {
  const response = new Response(body, { status });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("local model download", () => {
  it("resumes a partial file, verifies it and atomically installs a receipt", async () => {
    const expected = Buffer.from("hello");
    const { paths, manifest } = fixture(expected);
    writeFileSync(paths.partial, "he");
    let range = "";
    const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      range = new Headers(init?.headers).get("range") ?? "";
      return responseAt("llo", 206);
    }) as typeof fetch;
    await downloadAndInstallModel({ manifest, paths, fetchImpl: fakeFetch, availableBytes: () => Number.MAX_SAFE_INTEGER });
    expect(range).toBe("bytes=2-");
    expect(readFileSync(paths.final, "utf8")).toBe("hello");
    expect(existsSync(paths.partial)).toBe(false);
    expect(JSON.parse(readFileSync(paths.receipt, "utf8"))).toMatchObject({ modelId: "fixture", bytes: 5, sha256: manifest.sha256 });
  });

  it("never installs a same-size file with the wrong digest", async () => {
    const { paths, manifest } = fixture(Buffer.from("right"));
    const fakeFetch = (async () => responseAt("wrong", 200)) as typeof fetch;
    await expect(downloadAndInstallModel({ manifest, paths, fetchImpl: fakeFetch, availableBytes: () => Number.MAX_SAFE_INTEGER }))
      .rejects.toMatchObject({ code: "MODEL_DIGEST_MISMATCH" } satisfies Partial<ModelDownloadError>);
    expect(existsSync(paths.final)).toBe(false);
    expect(existsSync(paths.receipt)).toBe(false);
    expect(existsSync(paths.partial)).toBe(true);
  });

  it("refuses redirects outside the compiled host allowlist", async () => {
    const { paths, manifest } = fixture(Buffer.from("hello"));
    const fakeFetch = (async () => responseAt("hello", 200, "https://example.com/model.gguf")) as typeof fetch;
    await expect(downloadAndInstallModel({ manifest, paths, fetchImpl: fakeFetch, availableBytes: () => Number.MAX_SAFE_INTEGER }))
      .rejects.toMatchObject({ code: "MODEL_REDIRECT_ORIGIN" } satisfies Partial<ModelDownloadError>);
    expect(existsSync(paths.final)).toBe(false);
  });

  it("checks remaining bytes plus the safety reserve before requesting", async () => {
    const { paths, manifest } = fixture(Buffer.from("hello"));
    let requested = false;
    const fakeFetch = (async () => { requested = true; return responseAt("hello", 200); }) as typeof fetch;
    await expect(downloadAndInstallModel({ manifest, paths, fetchImpl: fakeFetch, availableBytes: () => 5 }))
      .rejects.toMatchObject({ code: "MODEL_DISK_SPACE" } satisfies Partial<ModelDownloadError>);
    expect(requested).toBe(false);
  });
});

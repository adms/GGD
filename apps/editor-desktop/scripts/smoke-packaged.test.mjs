import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { packagedExecutableCandidates, parseCliArgs, parseSmokeReceipt, resolvePackagedExecutable } from "./smoke-packaged.mjs";

const product = "GGD Ability & VFX Editor";
const root = join(tmpdir(), `ggd-editor-smoke-runner-test-${process.pid}`);

beforeAll(() => mkdirSync(root, { recursive: true }));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("packaged smoke runner", () => {
  it("locates the universal macOS app before the architecture-specific fallback", () => {
    const [universal, fallback] = packagedExecutableCandidates("darwin", root);
    expect(universal).toContain("mac-universal");
    expect(fallback).toContain("/mac/");
    mkdirSync(join(root, "mac-universal", `${product}.app`, "Contents", "MacOS"), { recursive: true });
    writeFileSync(universal, "fixture");
    expect(resolvePackagedExecutable({ platform: "darwin", distDir: root })).toBe(universal);
  });

  it("locates the unpacked Windows executable", () => {
    const [executable] = packagedExecutableCandidates("win32", root);
    mkdirSync(join(root, "win-unpacked"), { recursive: true });
    writeFileSync(executable, "fixture");
    expect(resolvePackagedExecutable({ platform: "win32", distDir: root })).toBe(executable);
  });

  it("fails closed on unsupported platforms and missing artifacts", () => {
    expect(() => packagedExecutableCandidates("linux", root)).toThrow("僅支援 macOS / Windows");
    expect(() => resolvePackagedExecutable({ platform: "win32", distDir: join(root, "missing") })).toThrow("找不到已封裝");
  });

  it("requires a valid app receipt with successful route checks", () => {
    const receipt = {
      schema: "ggd-editor-desktop-smoke@1",
      checks: ["/editor/", "/admin/", "/content-api/manifest", "/content-api/desktop-source"].map((path) => ({ path, status: 200 })),
    };
    expect(parseSmokeReceipt(`electron log\n${JSON.stringify(receipt)}\n`)).toEqual(receipt);
    expect(() => parseSmokeReceipt("no receipt")).toThrow("沒有輸出");
    expect(() => parseSmokeReceipt(JSON.stringify({ ...receipt, checks: receipt.checks.slice(0, 3) }))).toThrow("缺少必要");
    expect(() => parseSmokeReceipt(JSON.stringify({ ...receipt, checks: [{ path: "/editor/", status: 500 }, ...receipt.checks] }))).toThrow("失敗 route");
  });

  it("parses explicit source and executable overrides without shell evaluation", () => {
    expect(parseCliArgs(["--source-url=https://example.test", "--executable", "/tmp/editor app", "--keep-user-data"])).toEqual({
      sourceUrl: "https://example.test",
      executable: "/tmp/editor app",
      keepUserData: true,
    });
    expect(() => parseCliArgs(["--unknown"])).toThrow("不支援的參數");
    expect(() => parseCliArgs(["stray"])).toThrow("不支援的位置參數");
    expect(() => parseCliArgs(["--source-url", "not a url"])).toThrow();
    expect(() => parseCliArgs(["--source-url=ftp://example.test"])).toThrow("僅支援 http/https");
  });
});

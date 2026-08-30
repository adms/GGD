/**
 * G1 握手層的守衛。四條，各釘一個「規格明訂而最容易寫錯」的點。
 * ⛔ 不驗出貨數值（CLAUDE.md 第零守則⑦）—— 只驗機制會不會擋下來。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IMPORT_DIAGNOSTICS } from "./diagnostics";
import { isRawRuntimeDocument, zPackageManifest } from "./packageSchema";

// ⭐ 2026-08-31：wire format 統一成帶前綴（`sha256:` ＋ 64 hex）——
//   ⛔ 在此之前這個夾具是裸 hex，而它在格式改掉之後**靜默地變成不合法**
//   （那幾條測試只斷言某一格的錯誤路徑，⇒ 多一個錯誤不會讓它們紅）。
const SHA = "sha256:" + "a".repeat(64);
const hasPath = (r: ReturnType<typeof zPackageManifest.safeParse>, p: string) =>
  r.success === false && r.error.issues.some((i) => i.path.join(".") === p);

/** 合法的 bootstrap manifest；每條測試只改壞它的一格。 */
const bootstrap = () => ({
  schema: "ggd-editor-package@1",
  mode: "bootstrap",
  gameId: "ggd",
  packageDigest: SHA,
  base: { gameRevision: "r1", contentVersion: "cv_1", activationDigest: null, authoringDigest: null },
  migrationFingerprint: "mf-1",
  selectionRoots: [],
  changes: [],
  compiler: { contractVersion: "1", fingerprint: "fp" },
  requiredCapabilities: [],
  entries: [],
  requires: [],
  expectedCompiled: [],
  expectedDerived: [],
  validationPolicy: {},
  requiredScenarios: [],
  fidelityDecisions: [],
  acceptedWarnings: [],
});

describe("zPackageManifest", () => {
  it("bootstrap 的 base digest 必須明示 null —— 省略那一格會被拒", () => {
    expect(zPackageManifest.safeParse(bootstrap()).success).toBe(true);
    const omitted = bootstrap();
    delete (omitted.base as Record<string, unknown>).activationDigest;
    expect(hasPath(zPackageManifest.safeParse(omitted), "base.activationDigest")).toBe(true);
  });

  it("changes[].op 只能是 upsert —— delete 會被拒（V1 禁止刪除）", () => {
    const r = zPackageManifest.safeParse({
      ...bootstrap(),
      changes: [
        {
          kind: "ability",
          id: "godie-e001.q",
          path: "authoring/abilities/godie-e001.q.json",
          op: "delete",
          before: { contentSha256: SHA },
          after: { contentSha256: SHA },
          reason: "selected",
        },
      ],
    });
    expect(hasPath(r, "changes.0.op")).toBe(true);
  });

  it("acceptedWarnings[] 不得夾帶 ignoreAll", () => {
    const warn = { code: "X", reviewer: "owner", note: "ok", ignoreAll: true };
    expect(zPackageManifest.safeParse({ ...bootstrap(), acceptedWarnings: [warn] }).success).toBe(false);
  });
});

it("一份真的出貨 ability@1 會被認出是 raw runtime 文件（不是手刻夾具）", () => {
  const root = join(__dirname, "..", "..", "..", "..", "..");
  const doc = JSON.parse(readFileSync(join(root, "content/abilities/godie-e001.q.json"), "utf8"));
  expect(doc.schema).toBe("ability@1");
  expect(isRawRuntimeDocument(doc)).toBe(true);
  expect(isRawRuntimeDocument({ schema: "ggd-editor-import@1" })).toBe(false);
});

it("診斷碼登錄表的 key 與 code 必須一致（對面靠 code 字串比對）", () => {
  for (const [key, d] of Object.entries(IMPORT_DIAGNOSTICS)) expect(d.code).toBe(key);
});

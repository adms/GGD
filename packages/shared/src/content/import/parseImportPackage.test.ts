/**
 * ⭐⭐ GH#327 —— 匯入整包時**未知欄位會被說出來**（⛔ 不是靜默忽略）。
 *
 * ── ⛔ 在此之前 ────────────────────────────────────────────────────────────
 * `unknownFields()` / `parseWithUnknownFieldReport()` 存在、測試綠，
 * ⛔ **而一個非測試呼叫端都沒有** —— ⭐ 失敗形態⑧：真的匯入流程從來走不到它。
 * （票文的進度標記逐字：「⛔ 不要讓它爛在那裡」。）
 *
 * ── ⭐ 為什麼是診斷不是錯誤 ────────────────────────────────────────────────
 * 整包 schema 是 `.passthrough()`（外部編輯器會帶自己的欄位，⭐ 刻意的）
 * ⇒ ⛔ 未知欄位**不擋匯入**。⭐ 但它必須說出來 ——
 * 一個「我以為我設定了而它被忽略」的欄位，是玩家投稿最常見的困惑，
 * ⛔ 而靜默忽略答不出「為什麼沒生效」。
 *
 * MUTATION LOG：`parseImportPackage` 改回裸 `safeParse` → ②紅（診斷消失）。
 */
import { describe, it, expect } from "vitest";
import { parseImportPackage, zEditorImportPackage } from "./packageSchema";

/** ⭐ 最小的合法整包（⛔ 不多一個欄位 —— 那樣才驗得出「多的那個」）。 */
const base = (): Record<string, unknown> => ({
  schema: "ggd-editor-import@1",
  manifest: {
    schema: "ggd-editor-package@1",
    mode: "bootstrap",
    gameId: "ggd",
    packageDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    base: {
      gameRevision: "r1",
      contentVersion: "cv_1",
      activationDigest: null,
      authoringDigest: null,
    },
    // ⚠️ bootstrap 模式**必須**帶它（`refineModeInvariants`）。
    migrationFingerprint: "mf-1",
    selectionRoots: [],
    changes: [],
    authoringProcessor: {
      kind: "runtime-direct",
      contractVersion: "runtime-direct@1",
      fingerprint: "abc",
    },
    requiredCapabilities: [],
    entries: [],
    requires: [],
    expectedCompiled: [],
    expectedDerived: [],
    validationPolicy: {},
    requiredScenarios: [],
    fidelityDecisions: [],
    acceptedWarnings: [],
  },
  documents: [],
});

describe("GH#327 匯入整包的未知欄位回報", () => {
  it("★ ⭐ 合法的一包**通得過**且沒有診斷", () => {
    const r = parseImportPackage(base());
    if (!r.ok) {
      // ⚠️ 夾具跟不上 schema 時，⭐ 說出來 ⛔ 不要靜靜跳過（那會讓這條守衛變成裝飾）。
      // ⭐ 印出**缺什麼**，⛔ 不是只說「被拒了」——
      //   一條說不出原因的紅燈會讓下一輪從零開始查。
      const why = zEditorImportPackage.safeParse(base());
      const miss = why.success
        ? "(?)"
        : why.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
      expect.fail(`⛔ 最小合法包被拒了 —— 夾具與 schema 漂了。缺：${miss}`);
    }
    expect(r.diagnostics.length, "⛔ 乾淨的一包不該有診斷").toBe(0);
  });

  it("★ ⭐ 多一個沒人認得的欄位 ⇒ **回報它**，⛔ 而不擋下匯入", () => {
    const r = parseImportPackage({ ...base(), thisFieldDoesNotExist: 1 });
    expect(r.ok, "⛔ 未知欄位擋下了匯入 —— passthrough 的意思正好相反").toBe(true);
    expect(r.value, "⛔ 通過了卻沒有值").not.toBeNull();
    const hit = r.diagnostics.some((d) => JSON.stringify(d).includes("thisFieldDoesNotExist"));
    expect(hit, "⛔ 未知欄位被**靜默忽略**了 —— 玩家問不出「為什麼沒生效」").toBe(true);
  });

  it("★ ⭐ 真的壞掉的一包**仍然被拒**（⛔ 診斷不是放行的藉口）", () => {
    const r = parseImportPackage({ schema: "wrong@9" });
    expect(r.ok).toBe(false);
    expect(r.value).toBeNull();
  });
});

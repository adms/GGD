/**
 * ⭐⭐ GH#908 —— 玩家投稿的**可見性**，main 責任③的第一塊。
 *
 * ── ⭐ 這條守衛只有一個承重的問題 ────────────────────────────────────────
 * **一份沒有人審過的內容，玩家看不看得到？**
 *
 * ⚠️ 玩家投稿是這個專案**第一個不可信的內容來源** —— 出貨內容都是我們自己寫的。
 * ⇒ ⭐ 而繞過審核最便宜的一招是：**先送乾淨的、核准之後再換掉內容**。
 *   ⛔ 只驗 `status === "approved"` 的實作對它是**全綠**的，而畫面上完全看不出來。
 *
 * ── ⭐ 所以每一條都跑**兩個方向** ──────────────────────────────────────
 * 核准的看得到 **且** pending／rejected／換過內容的**看不到**。
 * ⚠️ CLAUDE.md 記過：一把只驗過單邊的尺，會在它最需要說話的時候沉默。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `isDiscoverable` 的 `approvedDigest === r.digest` 那一半拿掉 → ③ 紅
 *   · `withNewContent` 改成只換 `digest`（留著 `approvedDigest`）→ ③ 紅
 */
import { describe, it, expect } from "vitest";
import { makeSubmission, approve, reject, isDiscoverable, withNewContent } from "./submission";

/** ⭐ 最小的合法整包（逐字借自 `parseImportPackage.test.ts` 的夾具）。 */
const pkg = (gameRevision = "r1"): Record<string, unknown> => ({
  schema: "ggd-editor-import@1",
  manifest: {
    schema: "ggd-editor-package@1",
    mode: "bootstrap",
    gameId: "ggd",
    packageDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    base: { gameRevision, contentVersion: "cv_1", activationDigest: null, authoringDigest: null },
    migrationFingerprint: "mf-1",
    selectionRoots: [], changes: [],
    authoringProcessor: {
      kind: "runtime-direct",
      contractVersion: "runtime-direct@1",
      fingerprint: "abc",
    },
    requiredCapabilities: [], entries: [], requires: [],
    expectedCompiled: [], expectedDerived: [],
    validationPolicy: {}, requiredScenarios: [],
    fidelityDecisions: [], acceptedWarnings: [],
  },
  documents: [],
});

describe("GH#908 玩家投稿：沒有人審過的內容看不到", () => {
  it("★ ① 一份合法的投稿收得下，⭐ 而它一開始是 `pending`", () => {
    const { record, diagnostics } = makeSubmission("s1", "acc-1", pkg());
    expect(record, `⛔ 合法的一包被拒了：${JSON.stringify(diagnostics).slice(0, 300)}`).not.toBeNull();
    expect(record!.status).toBe("pending");
    expect(record!.accountId).toBe("acc-1");
    expect(record!.digest.length, "⛔ 沒有內容指紋 ⇒ 核准無法隨內容過期").toBeGreaterThan(8);
  });

  it("★ ② 壞掉的一包**說得出是哪一格**（⛔ 不是一句「不合法」）", () => {
    const bad = pkg();
    (bad.manifest as Record<string, unknown>).gameId = 123;
    const { record, diagnostics } = makeSubmission("s2", "acc-1", bad);
    expect(record, "⛔ 一包壞的被收下了").toBeNull();
    expect(diagnostics.length, "⛔ 拒了卻說不出原因").toBeGreaterThan(0);
    // ⭐ 沒有主人的投稿也一律拒 —— 審核流程的破口。
    expect(makeSubmission("", "acc-1", pkg()).record).toBeNull();
    expect(makeSubmission("s3", "", pkg()).record).toBeNull();
  });

  it("★ ③ ⭐⭐ **可見性**：核准的看得到，⛔ 而「核准後換內容」看不到", () => {
    const { record } = makeSubmission("s4", "acc-1", pkg());
    const r = record!;
    // ⭐ 方向 A：還沒審 ⇒ 看不到
    expect(isDiscoverable(r), "⛔ 沒有人審過的內容看得到了").toBe(false);
    // ⭐ 方向 B：核准 ⇒ 看得到
    const ok = approve(r);
    expect(isDiscoverable(ok), "⛔ 核准了卻看不到").toBe(true);
    // ⭐ 方向 C：⭐⭐ **核准之後換掉內容** ⇒ ⛔ 必須看不到
    const swapped = withNewContent(ok, pkg("r2-偷換的內容"));
    expect(
      isDiscoverable(swapped),
      "⛔⛔ **先送乾淨的、核准後再換掉內容** —— 而它看得到了。\n" +
        "⭐ 這是繞過整條審核最便宜的一招，⛔ 而只驗 `status===\"approved\"` 的實作對它是**全綠**的。\n" +
        "⇒ ⭐ 判準要有**兩個**條件：核准過 **且** 核准當時的指紋還等於現在的。",
    ).toBe(false);
    expect(swapped.status, "⭐ 換了內容要退回 pending").toBe("pending");
    // ⭐⭐ 方向 C′ —— **直接**造一個「已核准、而指紋對不上」的紀錄。
    //
    // ⚠️ 這一格是被突變逼出來的：上面那一段用 `withNewContent`，⭐ 而它會把狀態
    //   退回 `pending` ⇒ ⛔ **指紋那一半從來沒有被判定過**。
    //   ⇒ 把 `isDiscoverable` 的指紋比對整條拿掉，上面**全綠**。
    // ⭐ 而這正是一個天真的呼叫端會產生的狀態：它只更新了內容、忘了動狀態。
    expect(
      isDiscoverable({ ...ok, digest: "sha256:換過的內容" }),
      "⛔⛔ 狀態是 approved 而**指紋對不上** —— 它看得到了。\n" +
        "⭐ 這是「先送乾淨的、核准後再換掉內容」的第二條路（呼叫端只改了內容）。\n" +
        "⇒ ⭐ `isDiscoverable` 的**兩個**條件缺一不可。",
    ).toBe(false);
    // ⭐ 反方向：指紋對得上才看得到（⛔ 否則上面那一條會被一個「永遠回 false」的實作騙過）。
    expect(isDiscoverable({ ...ok, approvedDigest: ok.digest })).toBe(true);
    // ⭐ 方向 D：被拒 ⇒ 看不到，⭐ 而且理由留著
    const no = reject(r, "特效太亮");
    expect(isDiscoverable(no)).toBe(false);
    expect(no.reason).toBe("特效太亮");
  });

  it("⭐ ④ 內容**沒變**時 `withNewContent` 逐位元不動（⛔ 不可以無故把核准洗掉）", () => {
    const ok = approve(makeSubmission("s5", "acc-1", pkg()).record!);
    expect(withNewContent(ok, pkg()), "⛔ 同樣的內容卻把核准洗掉了").toEqual(ok);
    expect(isDiscoverable(withNewContent(ok, pkg()))).toBe(true);
  });
});

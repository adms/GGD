/**
 * ⭐⭐ `validatePackage` 的守衛 —— **八道檢查各一條**，⛔ 不是一條「合法包會過」。
 *
 * ⚠️ ⭐ 每一條的形狀都一樣：**先證明乾淨的包會過**（儀器），
 * 再只改壞**那一格**。⛔ 少了儀器那一半，一條永遠回 false 的實作也是全綠的。
 *
 * MUTATION LOG（落地前跑過）：
 *   · ⑦ 的 `if (e.soft === true) continue` 改成 `continue`（全部跳過）→ 🔴
 *   · ⑥ 的 `m.mode === "full"` 改成 `false` → 🔴
 *   · ④ 的 `actual !== e.contentSha256` 改成 `false` → 🔴
 */
import { describe, expect, it } from "vitest";
import { contentSha256 } from "./jcs";
import { packageDigest } from "./digest";
import { validatePackage } from "./validatePackage";
import type { BaseFacts } from "./validatePackage";

const FP = "e46d097c114b";
const AD = "sha256:" + "b".repeat(64);
const AUD = "sha256:" + "c".repeat(64);

/** 一份最小但**真的合法**的 ability（⛔ 不是 `{}`：⑦ 要抽得到 ref）。 */
const ABILITY = {
  schema: "ability@1",
  id: "hero.q",
  name: "測試技",
  description: "測試",
  castType: "self",
  maxRank: 1,
  cooldown: [1],
  manaCost: [0],
  range: 0,
  effects: [],
};

function pkg(
  over: Record<string, unknown> = {},
  docOver: Record<string, unknown> = {},
) {
  const doc = { ...ABILITY, ...docOver };
  const path = "authoring/abilities/hero.q.json";
  const entries = [
    {
      path,
      role: "authoring",
      contentSha256: contentSha256(doc),
      contentSize: 100,
      collection: "abilities",
      id: "hero.q",
      op: "upsert",
    },
  ];
  const manifest: Record<string, unknown> = {
    schema: "ggd-editor-package@1",
    mode: "bootstrap",
    gameId: "ggd",
    packageDigest: "sha256:" + "0".repeat(64),
    base: {
      gameRevision: "r1",
      contentVersion: "cv_1",
      activationDigest: null,
      authoringDigest: null,
    },
    migrationFingerprint: "mf-1",
    selectionRoots: [],
    changes: [],
    authoringProcessor: {
      kind: "runtime-direct",
      contractVersion: "runtime-direct@1",
      fingerprint: FP,
    },
    requiredCapabilities: [],
    entries,
    requires: [],
    expectedDerived: [],
    validationPolicy: {},
    requiredScenarios: [],
    fidelityDecisions: [],
    acceptedWarnings: [],
    ...over,
  };
  // ⭐ digest 一定要**最後**算（⛔ 否則每改一格測試都要手動更新它）。
  manifest["packageDigest"] = packageDigest(manifest);
  return {
    schema: "ggd-editor-import@1",
    manifest,
    documents: [{ path, document: doc }],
  };
}

const EMPTY_BASE: BaseFacts = {
  gameRevision: "r1",
  contentVersion: "cv_1",
  activationDigest: null,
  authoringDigest: null,
  present: new Map(),
};

const run = (
  raw: unknown,
  base: BaseFacts = EMPTY_BASE,
  caps = new Set<string>(),
) =>
  validatePackage({ raw, base, capabilities: caps, processorFingerprint: FP });

const codes = (r: ReturnType<typeof run>) => r.diagnostics.map((d) => d.code);

describe("validatePackage（規格 §3）", () => {
  it("★★ ⭐ 儀器：一份乾淨的包**會過** —— ⛔ 否則底下每一條都證明不了任何事", () => {
    const r = run(pkg());
    expect(r.ok, `⛔ 乾淨的包被拒了：${JSON.stringify(codes(r))}`).toBe(true);
    expect(r.changed).toHaveLength(1);
    expect(r.changed[0]!.collection).toBe("abilities");
  });

  it("★★ ② ⭐ 處理器指紋對不上 ⇒ 拒（⛔ 而且訊息要說「重新匯出」不是「改包」）", () => {
    const r = validatePackage({
      raw: pkg(),
      base: EMPTY_BASE,
      capabilities: new Set(),
      processorFingerprint: "ffffffffffff",
    });
    expect(codes(r)).toContain("PROCESSOR_FINGERPRINT_MISMATCH");
    expect(r.ok).toBe(false);
  });

  it("★★ ③ ⭐ packageDigest 被改過 ⇒ 拒", () => {
    const p = pkg() as { manifest: Record<string, unknown> };
    p.manifest["packageDigest"] = "sha256:" + "a".repeat(64);
    expect(codes(run(p))).toContain("PACKAGE_DIGEST_MISMATCH");
  });

  it("★★ ④ ⭐ 文件的位元組被換過（而 entry 還宣稱舊 hash）⇒ 拒", () => {
    const p = pkg() as { documents: { document: Record<string, unknown> }[] };
    p.documents[0]!.document["name"] = "偷改的名字";
    const c = codes(run(p));
    expect(c, "⛔ 換了內容而 hash 沒對上，居然放行").toContain(
      "ENTRY_HASH_MISMATCH",
    );
  });

  it("★★ ⑤ ⭐ base pin 與這一台不符 ⇒ 拒（full/delta；bootstrap 不比）", () => {
    const full = pkg({
      mode: "full",
      base: {
        gameRevision: "r1",
        contentVersion: "cv_OLD",
        activationDigest: "sha256:" + "b".repeat(64),
        authoringDigest: "sha256:" + "c".repeat(64),
      },
    });
    const c = codes(run(full));
    expect(c).toContain("BASE_PIN_MISMATCH");
    // ⭐ 而 bootstrap **不比** —— 它的兩格本來就是 null。
    expect(codes(run(pkg()))).not.toContain("BASE_PIN_MISMATCH");
  });

  it("★★ ⑥ ⭐⭐ full 包**少帶**一份 ⇒ 那是隱式刪除，拒", () => {
    const base: BaseFacts = {
      ...EMPTY_BASE,
      activationDigest: AD,
      authoringDigest: AUD,
      present: new Map([["abilities", new Set(["hero.q", "hero.w"])]]),
    };
    const full = pkg({
      mode: "full",
      base: {
        gameRevision: "r1",
        contentVersion: "cv_1",
        activationDigest: AD,
        authoringDigest: AUD,
      },
    });
    const c = codes(run(full, base));
    expect(
      c,
      "⛔⛔ full 包沒帶 hero.w 而被放行 ⇒ ⭐ 那是一次**看不見的刪除**",
    ).toContain("IMPLICIT_DELETE_FORBIDDEN");
    // ⭐ 而 delta **不**適用這條（它本來就只帶改動的那幾份）。
    const delta = pkg({
      mode: "delta",
      selectionRoots: [{ kind: "ability", id: "hero.q", contentSha256: AD }],
      base: {
        gameRevision: "r1",
        contentVersion: "cv_1",
        activationDigest: AD,
        authoringDigest: AUD,
      },
    });
    expect(codes(run(delta, base))).not.toContain("IMPLICIT_DELETE_FORBIDDEN");
  });

  it("★★ ⑦ ⭐ 指到一個包與 base 都沒有的**硬**參照 ⇒ 拒", () => {
    const p = pkg(
      {},
      {
        effects: [
          {
            kind: "spawnProjectile",
            who: "self",
            projectileId: "does-not-exist",
          },
        ],
      },
    );
    const c = codes(run(p));
    expect(c, "⛔ 懸空的硬參照被放行 ⇒ 套下去載入即失敗").toContain(
      "REF_NOT_CLOSED",
    );
    // ⭐ 而它在 base 裡就放行（⛔ 封閉性算的是**包 ∪ base**，不是只有包）。
    const withBase: BaseFacts = {
      ...EMPTY_BASE,
      present: new Map([["projectiles", new Set(["does-not-exist"])]]),
    };
    expect(codes(run(p, withBase))).not.toContain("REF_NOT_CLOSED");
  });

  it("★★ ⑧ ⭐ 要求一個這台不認得的 capability ⇒ 拒", () => {
    const p = pkg({ requiredCapabilities: ["effect.timeTravel@1"] });
    expect(codes(run(p))).toContain("CAPABILITY_UNSUPPORTED");
    expect(run(p, EMPTY_BASE, new Set(["effect.timeTravel@1"])).ok).toBe(true);
  });

  it("★ ⭐ 這一支是**純函式** —— ⛔ 同一個輸入跑兩次結果逐字相同", () => {
    const p = pkg();
    const a = JSON.stringify(run(p).diagnostics);
    const b = JSON.stringify(run(p).diagnostics);
    expect(a).toBe(b);
  });
});

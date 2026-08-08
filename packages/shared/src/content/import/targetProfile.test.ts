/**
 * 守衛：target profile 在**沒有 authoring store** 時不准編一個 digest 出來。
 *
 * 為什麼這條最重要：假的 base digest 不會在這裡被抓到 —— 它會被外部編輯器拿去
 * 當 delta 的 base，整包做完才在 apply 時 `stale-base`，而且修不回來（那個 base
 * 從來不存在）。null 讓對方在建包之前就停手。
 *
 * 突變（2026-08-08 實測）：把 `buildTargetProfile` 的
 * `activationDigest: null` 改成 `digestOf(input.content ?? {})` → 這支紅。
 */
import { describe, it, expect } from "vitest";
import { buildTargetProfile } from "./targetProfile";

const AT = "2026-08-08T00:00:00.000Z";
const CONTENT = {
  contentVersion: "cv_000000000000",
  collectionHashes: { champions: "aaaaaaaaaaaa", items: "bbbbbbbbbbbb" },
};

describe("ggd-content-target-profile@1", () => {
  it("沒有 authoring store 時 base digest 是 null，state 是 absent，且不准產 delta", () => {
    const p = buildTargetProfile({ generatedAt: AT, gameVersion: "v0.9.45", content: CONTENT });

    expect(p.authoringStoreState).toBe("absent");
    expect(p.base.activationDigest).toBeNull();
    expect(p.base.authoringDigest).toBeNull();
    expect(p.compiler.contractVersion).toBeNull();
    expect(p.compiler.fingerprint).toBeNull();
    expect(p.assetManifestDigest).toBeNull();
    expect(p.distribution.championCurationDigest).toBeNull();
    expect(p.distribution.itemCurationDigest).toBeNull();

    // ⛔ 沒有真 base 就不可以宣告 full / delta —— 那兩種模式的定義就是「相對於 base」。
    expect(p.supportedModes).toEqual(["bootstrap"]);
    expect(p.deltaExportAllowed).toBe(false);

    // 每一個 null 都要說得出為什麼，否則 null 跟「忘了填」長得一模一樣。
    const explained = new Set(p.unavailable.flatMap((u) => u.field.split(" / ")));
    expect(explained.has("base.activationDigest")).toBe(true);
    expect(explained.has("base.authoringDigest")).toBe(true);
    p.unavailable.forEach((u) => expect(u.reason.length).toBeGreaterThan(10));

    // 真的有的東西不可以也變成 null（過度保守同樣是說謊）。
    expect(p.base.contentVersion).toBe(CONTENT.contentVersion);
    expect(p.base.contentDigest).toMatch(/^[0-9a-f]{16}$/);
  });

  it("profileDigest 隨內容變、不隨時間變（對方靠它判斷遊戲端變了沒有）", () => {
    const a = buildTargetProfile({ generatedAt: AT, gameVersion: null, content: CONTENT });
    const b = buildTargetProfile({
      generatedAt: "2027-01-01T00:00:00.000Z",
      gameVersion: null,
      content: CONTENT,
    });
    const c = buildTargetProfile({
      generatedAt: AT,
      gameVersion: null,
      content: { ...CONTENT, contentVersion: "cv_111111111111" },
    });
    expect(b.profileDigest).toBe(a.profileDigest);
    expect(c.profileDigest).not.toBe(a.profileDigest);
  });

  it("runtime capabilities 帶著非空的 unsupported 清單（對方必須 fail-closed 的那一份）", () => {
    const caps = buildTargetProfile({ generatedAt: AT, gameVersion: null, content: null })
      .runtimeCapabilities;
    expect(caps.unsupported.length).toBeGreaterThan(0);
    expect(caps.unsupported).toEqual([...caps.unsupported].sort());
    // 宣告不支援的 key，不可以同時出現在 planned 的 supported 裡。
    const supported = new Set(caps.planned.filter((e) => e.state === "supported").map((e) => e.key));
    caps.unsupported.forEach((k) => expect(supported.has(k)).toBe(false));
  });
});

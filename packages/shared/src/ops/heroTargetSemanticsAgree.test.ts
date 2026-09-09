/**
 * ⭐⭐ GH#1157 —— **Go 與 TS 的收據判準必須逐格同意。**
 *
 * ⛔ 跨語言沒辦法共用一份實作,所以這一族知識**必然**有兩個住處:
 *   · Go  `apps/platform/internal/submissions/hero_intake.go` 的 `HeroTargetMatch.Matches`
 *   · TS  `packages/shared/src/content/communityRoom.ts` 的 `heroTargetMismatch`
 *
 * ⭐ 第〇·四守則說「同一份知識不可以有第二個住處」——⛔ 而這裡沒得選。
 * ⇒ ⭐ 那就讓**第二個住處是會紅的**:這條閘從 Go 原始碼**推導**它的判準,
 *   逐格與 TS 的實作比對。⛔ 不是抄一份期望值(那會變成第三個住處)。
 *
 * ⚠️ 為什麼這一條非有不可:兩邊的預設都是 `migration`,⭐ 而只要有一邊
 * 哪天多比一欄,症狀就是「**有些房開得起來、有些開不起來**」——
 * ⛔ 而那讀起來像隨機的線上問題,不像一個判準漂了。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { heroTargetMismatch, type HeroTargetMatchMode } from "../content/communityRoom";

const GO = join(__dirname, "../../../../apps/platform/internal/submissions/hero_intake.go");

/** ⭐ 從 Go 原始碼推導「這一檔會比哪幾欄」。⛔ 不是手寫一份期望。 */
function goFieldsByMode(src: string): Record<string, string[]> {
  const body = src.slice(src.indexOf("func (m HeroTargetMatch) Matches"));
  const end = body.indexOf("\n}\n");
  const fn = body.slice(0, end < 0 ? body.length : end);
  // ⭐ `switch` 之前的比對 = **三檔共用**
  const swAt = fn.indexOf("switch m {");
  expect(swAt, "⛔ Go 的判準不再是 `switch m {` 的形狀 —— 這把尺要跟著改").toBeGreaterThan(0);
  const shared = [...fn.slice(0, swAt).matchAll(/row\.(\w+) != target\.\w+/g)].map((m) => m[1]!);
  const out: Record<string, string[]> = {};
  for (const [, name, block] of fn.slice(swAt).matchAll(/case HeroTargetMatch(\w+):([\s\S]*?)(?=\n\tcase |\n\t\})/g)) {
    out[name!] = [...block!.matchAll(/row\.(\w+) != target\.\w+/g)].map((m) => m[1]!);
  }
  return { __shared: shared, ...out };
}

const GO_TO_TS: Record<string, HeroTargetMatchMode> = {
  Strict: "strict",
  GameAndMigration: "game-and-migration",
};
/** Go 的欄位名 → TS 的欄位名（⭐ 兩邊命名不同是既有事實，⛔ 不在這一票裡改）。 */
const FIELD: Record<string, string> = {
  GameRevision: "gameRevision",
  ContentVersion: "contentVersion",
  MigrationFingerprint: "migrationFingerprint",
  ProcessorFingerprint: "processorFingerprint",
};

describe("收據判準：Go 與 TS 逐格同意", () => {
  const src = readFileSync(GO, "utf8");
  const byMode = goFieldsByMode(src);

  it("⭐ 量尺自證：真的從 Go 讀到了東西（⛔ 讀到 0 條讀起來跟全過一樣）", () => {
    expect(byMode.__shared, "三檔共用的比對").toEqual(["MigrationFingerprint"]);
    expect(byMode.Strict?.length, "strict 額外比的欄位數").toBe(3);
    expect(byMode.GameAndMigration?.length, "game-and-migration 額外比的欄位數").toBe(1);
  });

  it("⛔ TS 的實作不可以比 Go 多比或少比任何一欄", () => {
    const base = {
      gameRevision: "g", contentVersion: "c", migrationFingerprint: "m", processorFingerprint: "p",
    };
    for (const [goMode, tsMode] of [["__shared", "migration"], ...Object.entries(GO_TO_TS)] as const) {
      const goFields = new Set([...(byMode.__shared ?? []), ...(goMode === "__shared" ? [] : byMode[goMode] ?? [])]);
      for (const [goName, tsName] of Object.entries(FIELD)) {
        const row = { ...base, [tsName]: "CHANGED" };
        const got = heroTargetMismatch(tsMode as HeroTargetMatchMode, row, base);
        const goBlocks = goFields.has(goName);
        expect(
          got !== null,
          `⛔ 模式 ${tsMode}：改 ${tsName} 時 Go ${goBlocks ? "會擋" : "放行"}，而 TS ${got !== null ? "擋了" : "放行了"}` +
            `\n   ⭐ 兩邊漂掉的症狀是「有些房開得起來、有些開不起來」——⛔ 而那讀起來像隨機的線上問題。`,
        ).toBe(goBlocks);
        if (goBlocks) expect(got, `⛔ 擋下來時要指名 ${tsName}`).toBe(tsName);
      }
    }
  });

  it("⭐ 出貨預設兩邊都是 migration（⛔ 一邊改了預設而另一邊沒有＝最難查的那種漂）", () => {
    expect(src).toContain('HeroTargetMatchMigration HeroTargetMatch = "migration"');
    // TS 那一側的預設寫在 `buildCommunityRoomContent` 的 `?? "migration"`
    const ts = readFileSync(join(__dirname, "../content/communityRoom.ts"), "utf8");
    expect(ts).toContain('input.targetMatch ?? "migration"');
  });
});

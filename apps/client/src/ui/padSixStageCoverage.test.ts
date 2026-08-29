/**
 * ⭐ owner 點名的**六段**，每一段都要有一支手把守衛站著（GH#502）。
 *
 * ---------------------------------------------------------------------------
 * owner 2026-08-21/22（逐字，票的最上面）
 * ---------------------------------------------------------------------------
 * > 「這整個遊戲 從**登入、大廳、選人、戰鬥回合、結算、回大廳** 等操作
 * >  都要可以**支援手把直接操作到底**」
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 為什麼需要這一條（⛔ 它不是第 23 支單段測試）
 * ---------------------------------------------------------------------------
 * 2026-08-29 量到：`apps/client/src` 底下有 **22 支**手把測試，
 * ⭐ 而**每一支只涵蓋單一段**（`padFocusNavReach`=登入 · `lobbyPadFocusLanding`=大廳 ·
 * `storePadReach`/`merchantRowPadReach`=商店 · `matchEndPadBack`=結算）——
 * ⛔ **零支跨段**，而唯一同時提到結算與大廳的 `padModalScope` 是模態 scope、⛔ 不是走查。
 *
 * ⇒ 這正是 CLAUDE.md 的「**兩條對的守衛，組合是空的**」：
 * 每一段各自綠，⭐ 而**沒有人回答「六段都有人守嗎」**。
 * ⚠️ 少掉的那一段會**靜靜地**少掉 —— 沒有任何東西會紅。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 它驗的是**覆蓋率**，⛔ 不是行為
 * ---------------------------------------------------------------------------
 * 每一段的行為由那一段自己的守衛驗（那 22 支）。
 * 這一條只問一件事：**六段裡有沒有哪一段今天沒有人守**。
 * ⇒ ⛔ 它不會取代任何一支，也⛔ 不該長出斷言那一段行為的內容。
 *
 * 突變紀錄：把 `MATCH_END` 的樣式從清單拿掉 ⇒ 紅並指名「結算」。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * owner 那句話的六段。⭐ 每一段配一組**檔名/內容的樣式** ——
 * ⛔ 不是一張「哪一支測試守哪一段」的手寫對照表（那會過期而且不會有東西紅）。
 */
const STAGES: { readonly stage: string; readonly any: readonly RegExp[] }[] = [
  { stage: "登入", any: [/padFocusNavReach/i, /\bauth\b/i, /login/i] },
  { stage: "大廳", any: [/lobbyPadFocus/i, /\blobby\b/i] },
  { stage: "選人", any: [/champSelect/i, /champion.?select/i, /選人/] },
  { stage: "戰鬥回合", any: [/padHudFocus/i, /padAimReach/i, /padTargetRing/i, /\bhud\b/i] },
  { stage: "結算", any: [/matchEndPad/i, /matchEnd/i, /settlement/i, /結算/] },
  { stage: "回大廳", any: [/matchEndPadBack/i, /backToLobby/i, /回大廳/] },
];

/** 遞迴收集 `apps/client/src` 底下所有手把相關的測試檔。 */
function padTests(dir: string, out: { file: string; text: string }[] = []): { file: string; text: string }[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      padTests(p, out);
      continue;
    }
    if (!/\.test\.tsx?$/.test(name)) continue;
    if (!/pad|gamepad/i.test(name)) continue;
    // ⛔ **不可以把自己算進去** —— 這個檔為了說明就寫了六段的名字，
    //   ⭐ 第一版因此對每一段都「有覆蓋」（守衛靠自己才綠，失敗形態⑩）。
    if (name === "padSixStageCoverage.test.ts") continue;
    // ⭐ 只取 `describe`／`it` 的**標題**，⛔ 不是整份文字 ——
    //   一個檔裡出現過 "lobby" 這個字**不代表**它守著大廳那一段。
    const raw = readFileSync(p, "utf-8");
    const titles = [...raw.matchAll(/\b(?:describe|it|test)\s*\(\s*(["\`'])([\s\S]*?)\1/g)]
      .map((m) => m[2] ?? "")
      .join("\n");
    out.push({ file: p.slice(SRC.length + 1), text: titles });
  }
  return out;
}

describe("手把六段每一段都有人守（GH#502）", () => {
  const tests = padTests(SRC);

  it("GUARD THE GUARD：真的掃到一批手把測試（⛔ 掃空會靜默全過）", () => {
    expect(tests.length, "⛔ 一支手把測試都沒掃到 —— 命名慣例變了？").toBeGreaterThan(10);
  });

  it("⭐ 六段沒有一段是空的", () => {
    const naked: string[] = [];
    for (const s of STAGES) {
      const hit = tests.some((t) => s.any.some((re) => re.test(t.file) || re.test(t.text)));
      if (!hit) naked.push(s.stage);
    }
    expect(
      naked,
      "⛔ owner 逐字點名的這幾段**今天沒有任何手把守衛站著**：\n" +
        naked.map((s) => `  · ${s}`).join("\n") +
        "\n\n⭐ 每一段的行為由它自己的守衛驗；這一條只問「六段都有人守嗎」——\n" +
        "⚠️ 少掉的那一段會**靜靜地**少掉（兩條對的守衛，組合是空的）。",
    ).toEqual([]);
  });
});

/**
 * 🎮 **玩家段落要**誠實****：一版真的改到玩家看得到的東西，⛔ 就不可以寫「系統優化更新」。
 *
 * ── ⛔⛔ 為什麼要第二條閘（2026-09-09，owner 逐字揪到）────────────────────
 *
 * > 「你是不是又再混 不寫玩家更新內容 不是已經修過根因嗎」
 * > 「你從 v0.41 開始就在打混 請你修正根因 後補每一版的內容出來」
 *
 * ⭐ 他是對的。既有的 `releaseNoteHasPlayerSection` 只驗**那一段在不在**，
 * ⛔ 不驗它**說了什麼** ⇒ ⭐ 我用「系統優化更新：穩定性與速度的例行維護。」
 * 一次補完三份 note，**而閘全綠**。
 *
 * ⚠️ ⭐ 這是本專案記過的形狀的又一次：**一個閘被它自己的罐頭答案滿足**。
 *
 * ── ⭐ 訊號要**分得出玩家與編輯器**（⛔ 這是第一版做錯的地方）──────────────
 * 我第一版拿「檔案有沒有變」當訊號，⇒ 量出 7 版「玩家看得到」，
 * ⛔ 而逐一查證之後只有 **3 版**是真的：
 *
 * | 誤判 | 為什麼不是玩家看得到 |
 * |---|---|
 * | `content/ability-templates/*.json` 的 `description` | ⭐ 那是**編輯器**讀的模板說明，⛔ 不是卡面 |
 * | `content/assets/icon-console/style-spec.json` | ⭐ **後台**的美術指示快照，⛔ 玩家不會下載它 |
 * | `apps/client/src/**` 的 `*.test.*` | 測試檔 |
 *
 * ⇒ ⭐ 三個訊號各自收窄到**玩家真的碰得到**的那一組。
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const REPO = new URL("../../../..", import.meta.url).pathname;

const sh = (cmd: string, args: string[]): string | null => {
  try {
    return execFileSync(cmd, args, { cwd: REPO, encoding: "utf8", timeout: 90_000 }).trim();
  } catch {
    return null;
  }
};

/** ⭐ 棘輪：只管**最近**的（與姊妹閘同一個理由）。 */
const RECENT = 12;

/**
 * ⭐ **玩家真的碰得到的素材**（⛔ 不是 `content/assets/` 全部）。
 * `icon-console/`（後台美術指示）與 `review/`（批核材料）玩家一個位元組都不會下載。
 */
const PLAYER_ASSET = /^content\/assets\/(?!icon-console\/|review\/)/;

/** ⭐ 玩家讀得到文案的集合（⛔ `ability-templates` 是編輯器的）。 */
const PLAYER_DOC = /^content\/(abilities|champions|items|augments|status-effects)\/[^_].*\.json$/;

/** ⭐ 客戶端原始碼（⛔ 測試檔不算 —— 它們不進映像）。 */
const PLAYER_CLIENT = /^apps\/client\/src\/(?!.*\.test\.).*\.(ts|tsx|css)$/;

/**
 * ⭐ 罐頭：只有這一句（或它的變體）而**沒有別的內容**。
 * ⚠️ 罐頭本身**是合法的** —— owner 逐字「如果沒有對玩家有差別的改版你還是要發系統優化更新」。
 * ⛔ 它不合法的**唯一**情況是：這一版真的改了玩家看得到的東西。
 */
function isBoilerplateOnly(section: string): boolean {
  const meat = section
    .split("\n")
    .map((l) => l.replace(/^[-*\s>]+/, "").trim())
    .filter((l) => l.length > 0 && !/^#{1,6}\s/.test(l) && !/^-{3,}$/.test(l))
    .filter((l) => !/系統優化更新|穩定性與速度|例行維護|沒有玩家可見|不會感覺到差別/.test(l));
  return meat.length === 0;
}

/** 從 note 裡切出玩家段落（到下一個 `## ` 為止）。 */
function playerSection(body: string): string | null {
  const m = /^##+\s*[^\n]*玩家[^\n]*$/m.exec(body);
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = /^##\s/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

export interface Signals {
  readonly assets: string[];
  readonly docs: string[];
  readonly client: string[];
}

/** ⭐ 純函式 ⇒ sentinel 餵得進去。 */
export function signalsFrom(files: string[], docDiff: string): Signals {
  const changedDocs = new Set(
    [...docDiff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]!),
  );
  return {
    assets: files.filter((f) => PLAYER_ASSET.test(f)),
    docs: files.filter((f) => PLAYER_DOC.test(f) && changedDocs.has(f)),
    client: files.filter((f) => PLAYER_CLIENT.test(f)),
  };
}

/**
 * ⭐ 已經查證過「訊號在、⛔ 而玩家真的看不到」的版本，各自帶一個**能被反駁**的理由。
 * ⛔ 一列都不准是「應該沒差」。
 */
const INVISIBLE_BY_DESIGN: Record<string, string> = {
  // ⭐ 2026-09-09 —— **這張表今天是空的，而那是刻意的**。
  //
  // ⛔ 我第一版把 v0.42.2 / .3 / .7 / .12 放進這裡，⭐ 然後發現那是**同一個病的第二個載體**：
  //   把「為什麼玩家看不到」藏在**測試檔的一張表**裡，⇒ ⭐ 讀 release note 的人看不到它。
  //   ⚠️ 而 owner 揪的正是「note 上寫了什麼」。
  //
  // ⇒ ⭐ 理由要寫在 **note 本人**裡（那四版都補上了，各帶一句「反駁它的樣子」），
  //   ⛔ 不是寫在這裡讓閘閉嘴。
  //
  // ⭐ 這一格留著是為了**真的沒地方寫**的那一天（例如 note 已經被外部引用而不能再改）——
  //   ⛔ 而那一天要寫下**為什麼不能改那份 note**，不是為什麼玩家看不到。
};

describe("🎮 玩家段落要誠實（GH owner 2026-09-09）", () => {
  it("★★ ⭐ **一版真的改到玩家看得到的東西 ⇒ ⛔ 不可以只寫「系統優化更新」**", () => {
    const tags = sh("git", ["tag", "--list", "v*", "--sort=-v:refname"])
      ?.split("\n")
      .filter(Boolean)
      .slice(0, RECENT);
    if (!tags?.length) {
      console.warn("⚠️ 這條閘**沒有驗到** —— 讀不到 tag。⛔ 這不是「全部誠實」。");
      return;
    }
    const bad: string[] = [];
    for (const t of tags) {
      const prev = sh("git", ["describe", "--tags", "--abbrev=0", `${t}^`]);
      if (!prev) continue;
      const files = (sh("git", ["diff", "--name-only", `${prev}..${t}`]) ?? "")
        .split("\n")
        .filter(Boolean);
      const docDiff = sh("git", ["diff", "-U0", `${prev}..${t}`, "--", "content"]) ?? "";
      // ⭐ 只留**真的改了文案**的那幾份（⛔ 不是「這個檔動過」）
      const withProse = docDiff
        .split(/^diff --git /m)
        .filter((chunk) => /^\+\s*"(description|name)"/m.test(chunk))
        .flatMap((chunk) => [...chunk.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]!));
      const sig = signalsFrom(files, withProse.map((f) => `+++ b/${f}`).join("\n"));
      const hit = [...sig.assets, ...sig.docs, ...sig.client];
      if (!hit.length) continue;
      const body = sh("gh", ["release", "view", t, "--json", "body", "-q", ".body"]);
      if (body === null) continue; // gh 讀不到 —— 姊妹閘會喊
      const sec = playerSection(body);
      if (sec === null) continue; // 「有沒有那一段」是姊妹閘的事
      if (!isBoilerplateOnly(sec)) continue;
      if (INVISIBLE_BY_DESIGN[t]) continue;
      bad.push(
        `${t} —— 玩家段落只有罐頭，⛔ 而它改了：${hit.slice(0, 4).join(" · ")}${hit.length > 4 ? ` …（共 ${hit.length}）` : ""}`,
      );
    }
    expect(
      bad.join("\n"),
      "⛔⛔ 這幾版**真的改到玩家看得到的東西**，而 note 的玩家段落只寫了「系統優化更新」：\n" +
        "⭐ 兩條路：① 把那一版**真正的玩家改動**寫出來（素材／卡面文案／客戶端行為）；\n" +
        "   ② 真的看不到 ⇒ 進 `INVISIBLE_BY_DESIGN` 並寫下**為什麼**（要能被反駁，例如" +
        "「那格開關出貨是 false」＋開關 id）。\n" +
        "⛔ 沒有第三種 —— ⭐ 罐頭句子**本身合法**（owner：沒差別也要發系統優化更新），" +
        "⛔ 它不合法的唯一情況就是這裡抓到的：**這一版真的有差別**。",
    ).toBe("");
  });

  it("⭐ sentinel：罐頭判定器認得出罐頭，也⛔不把真內容誤判成罐頭", () => {
    expect(isBoilerplateOnly("\n- 系統優化更新：穩定性與速度的例行維護。\n")).toBe(true);
    expect(isBoilerplateOnly("\n⭐ **這一版對玩家是「系統優化更新」** —— ⛔ 沒有玩家可見的改動。\n")).toBe(true);
    expect(
      isBoilerplateOnly("\n- **107 張道具與英雄圖示換成新畫風**。\n- 系統優化更新。\n"),
      "⛔ 有真內容卻被判成罐頭 ⇒ 這條閘會擋掉正確的 note",
    ).toBe(false);
  });

  it("⭐ sentinel：訊號分得出玩家與編輯器（⛔ 這是第一版做錯的地方）", () => {
    const files = [
      "content/ability-templates/tpl-area-strike.json", // ⛔ 編輯器
      "content/assets/icon-console/style-spec.json", // ⛔ 後台
      "apps/client/src/ui/panels/x.test.ts", // ⛔ 測試
      "content/assets/icons/items/a.webp", // ⭐ 玩家
      "content/status-effects/lock-combo.json", // ⭐ 玩家（有改文案時）
      "apps/client/src/ui/panels/Real.tsx", // ⭐ 玩家
    ];
    const s = signalsFrom(files, "+++ b/content/status-effects/lock-combo.json");
    expect(s.assets, "⛔ icon-console 被算成玩家素材").toEqual(["content/assets/icons/items/a.webp"]);
    expect(s.docs, "⛔ ability-templates 被算成卡面").toEqual(["content/status-effects/lock-combo.json"]);
    expect(s.client, "⛔ 測試檔被算成客戶端").toEqual(["apps/client/src/ui/panels/Real.tsx"]);
  });
});

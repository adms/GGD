/**
 * ⛔⛔ GH#816 —— **第 24 處**。`4d5a5417` 把 23 處直讀改成 `entitiesOf()`，
 * 而在此之前**沒有任何東西**阻止下一個人再寫一處。這一支就是那個東西。
 *
 * ── 它問的問題 ─────────────────────────────────────────────────────────────
 * 「`apps/client/src` 底下**還有沒有**人直接 deref 一個 view-gated 集合？」
 * ⭐ 掃的是**出貨原始碼的現況**，⛔ 不是這次的 diff —— 一個已經出貨的直讀
 * 不會因為沒人碰它就變安全（visual-proof v1 的洞 c）。
 *
 * ⚠️ **掃原始碼代替行為是失敗形態⑥**，所以分工要講清楚：**行為**那一半已經有人守
 * （`viewGatedEntities.test.ts` 跑真的 `onStatePatch`；`protocol/viewGatedDelivery.test.ts`
 * 跑真的 `Encoder`＋`Reflection`＋解碼）。而「**還有沒有第 24 處**」是一個關於**整棵樹**
 * 的問題 —— ⭐ 它不可能由跑任何一條路得到答案（跑得到的那條正好是已經修好的那條）。
 *
 * ⭐ **欄位名單是推導的，⛔ 不是 `["entities"]`**：`viewGatedFieldNames()` 讀 `MatchState`
 * 的 metadata tag ⇒ 哪天有人多標一格 `view()`，這支閘**自動**開始守它
 * （第〇·四守則：同一個事實不可以有第二個住處）。
 *
 * 紅了要做什麼：把那一行改成 `entitiesOf(state)`（`net/viewGatedEntities.ts`）。
 * ⛔ **不要改成 `state.entities ?? new Map()`** —— 那是把「為什麼會是 undefined」
 * 這份知識又抄一份，而下一個讀端仍然不會知道。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "@ggd/shared/testkit/stripComments";
import { viewGatedFieldNames } from "@ggd/shared/protocol/schema";

/** `apps/client/src` —— 解碼側的整棵樹（view-gated 的 undefined 只在這一側發生）。 */
const CLIENT_SRC = fileURLToPath(new URL("..", import.meta.url));

/** 唯一合法的住處：那一格 `?? NO_ENTITIES` 本來就該寫在這裡。 */
const SOLE_HOME = "net/viewGatedEntities.ts";

function shippedSources(): string[] {
  return readdirSync(CLIENT_SRC, { recursive: true, encoding: "utf8" })
    .filter((p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p))
    .map((p) => join(CLIENT_SRC, p))
    .filter((p) => !p.endsWith(SOLE_HOME));
}

/**
 * ⭐ 只抓**解參考**（`.get(` / `.forEach(` / `.size` / `[k]`），⛔ 不抓存在性檢查。
 *
 * 為什麼刻意放過 `!state?.entities`：那是**治療**，⛔ 不是病 —— 一個先問過
 * 「它在不在」的讀端不會擲例外。而會擲例外的形狀只有一種：**沒問就 deref**。
 *
 * ⚠️ ⭐ **回報的是原始檔的行號，⛔ 不是 `stripComments` 之後的行號。**
 * 那支 helper 把註解整段**刪掉**（⛔ 不是留白），所以在它的輸出上數行會得到
 * 一個**指著別的東西**的行號 —— 而一條把人指去錯地方的錯誤訊息，比沒有訊息更貴
 * （CLAUDE.md 失敗形態⑨：錯誤訊息指著錯方向，於是每個人都以為是自己的環境壞了）。
 * 實測：本檔第一版把 `RoomStore.ts:874` 報成 `:418`。
 */
function directDerefs(source: string, fields: readonly string[]): string[] {
  const pattern = new RegExp(`\\.(?:${fields.join("|")})\\b\\s*(?:\\?\\.|\\.|\\[)`);
  // ① 整份 strip 一次：這是「這個匹配到底在不在程式碼裡」的**權威**答案
  //    （跨行的 block 註解只有整份看才判得出來）。
  const stripped = stripComments(source).split("\n");
  const strippedLines = new Set(stripped.map((l) => l.trim()).filter(Boolean));
  const truth = stripped.filter((l) => pattern.test(l)).length;

  // ② 再走**原始**的行，拿回真的行號；只認那些在 ① 的輸出裡也活著的行。
  const hits: string[] = [];
  source.split("\n").forEach((line, i) => {
    const code = stripComments(line).trim();
    if (code && pattern.test(code) && strippedLines.has(code)) hits.push(String(i + 1));
  });

  // ③ ⭐ 對不上就 fail-loud，⛔ 不是靜靜少報一行。①②數量不一致的唯一成因是
  //    「程式碼與 block 註解在同一行」把兩行併成一行 —— 那時候寧可報不出行號，
  //    也⛔ 不可以讓一個真的違規變成 0 個（fail-open 沒錯，靜默才是缺陷）。
  if (hits.length !== truth) return [`?（找不到行號，整份 strip 後有 ${truth} 處）`];
  return hits;
}

describe("view-gated 集合只能走 entitiesOf() (GH#816)", () => {
  const fields = viewGatedFieldNames();

  it("★ 檢查器自己要先自證 —— 兩個方向都驗過才算一把尺", () => {
    // ⛔ 分母是空的話，下面那條掃描會對任何一棵樹全綠（失敗形態⑨）。
    expect(fields.length, "推不出任何 view-gated 欄位 ⇒ 這支閘結構上不可能紅").toBeGreaterThan(0);
    const f = fields[0]!;

    // ① 已知**有**的量得到（sentinel：這正是 RoomStore 在 2026-08-29 之前的樣子）
    expect(directDerefs(`const es = state.${f}.get(String(id));`, fields)).toEqual(["1"]);
    expect(directDerefs(`state.${f}.forEach((e) => use(e));`, fields)).toEqual(["1"]);
    // ⭐ 行號要是**原始檔**的行號 —— 註解佔掉的行不可以被吃掉（見 directDerefs 檔頭）
    expect(directDerefs(`/* a\n b\n c */\nstate.${f}.size;`, fields), "行號被 strip 吃掉了").toEqual(["4"]);

    // ② 已知**沒有**的量不到 —— 少了這一半，一個永遠回 [] 的壞正則也會讓掃描全綠
    expect(directDerefs(`const es = entitiesOf(state).get(String(id));`, fields)).toEqual([]);
    expect(directDerefs(`if (!state?.${f}) return false;`, fields), "存在性檢查是治療").toEqual([]);
    expect(directDerefs(`// 註解裡寫 state.${f}.get( 不算`, fields), "散文要被 strip 掉").toEqual([]);
    expect(directDerefs(`/* state.${f}.get( 也不算 */`, fields), "block 註解要被 strip 掉").toEqual([]);
  });

  it("★ 出貨的 apps/client/src 底下：直讀 = 0", () => {
    const files = shippedSources();
    // ⛔ glob 掃空也會讓下面全綠 —— 先證明分母是真的（本檔自己就在那棵樹裡）。
    expect(files.length, "掃不到任何客戶端原始檔 ⇒ 路徑壞了").toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith("net/RoomStore.ts")), "RoomStore 不在掃描範圍內").toBe(true);

    const offenders = files.flatMap((file) =>
      directDerefs(readFileSync(file, "utf8"), fields).map(
        (line) => `${relative(CLIENT_SRC, file)}:${line}`,
      ),
    );

    expect(
      offenders,
      `⛔ 這幾行直接 deref 了 view-gated 集合（${fields.join(" / ")}）：\n` +
        offenders.map((o) => `    · ${o}`).join("\n") +
        "\n" +
        "  ⚠️ 那一格在「view 裡一個實體都沒有」時是 **undefined**（⛔ 不是空集合），\n" +
        "     而那正是**選人畫面的每一份快照** ⇒ 這一行會擲 TypeError。\n" +
        `  ⭐ 改成 \`entitiesOf(state)\`（apps/client/src/${SOLE_HOME}）。\n` +
        "  ⛔ 不要改成 `state.x ?? new Map()` —— 那是把同一份知識抄第二份。",
    ).toEqual([]);
  });
});

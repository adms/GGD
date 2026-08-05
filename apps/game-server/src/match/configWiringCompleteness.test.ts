/**
 * ⛔ 「後台那一頁存了，但比賽收不到」—— 這一族缺陷的**一般化**守衛。
 *
 * ── 為什麼要有這一份，而不是再寫第 N 個 `xxxWiring.test.ts` ────────────────
 *
 * 這個洞已經被抓到**兩次**，兩次都只補了自己那一格：
 *
 *   · GH#193 —— `combatFeel` 沒接上 → 寫了 `combatFeelWiring.test.ts`。
 *     那一份的檔頭把病理描述得很準：「sim 那側的守衛全部自己指派
 *     `world.combatFeel`，所以它們證明的是『sim 讀得到這張表』，不是
 *     『比賽真的把操作者那張表交給了 sim』」。
 *   · 2026-08-05 —— `augmentEnemyFilter` **完全一樣地掉了**。建構子收下了參數、
 *     後台有整頁在編輯它、`configForms.ts` 的說明逐字寫著「MatchController
 *     在開場 tick 0 之前灌進 world.augmentEnemyFilter」，而**沒有任何一處寫過它**。
 *     `@ggd/shared` 3,151 條 + `@ggd/game-server` 全套，一條都沒紅。
 *
 * 兩次都是**同一個五行窗口**裡的同一種手滑：註解貼上去了，賦值那一行沒跟上。
 * 一格一格補守衛擋不住第三次 —— 這一份問的是**整條建構子**：
 *
 *     「每一個被收下的 config 參數，都真的被交給 world 了嗎？」
 *
 * ── ⚠️ 為什麼這一條是**讀原始碼**的，而它不是失敗形態 ⑥ ────────────────────
 *
 * CLAUDE.md ⑥ 講的是「用掃字串代替跑行為」。這裡被檢查的東西**沒有執行期簽章**：
 * 「建構子收了 12 個參數而只轉發了 11 個」是一個**語法事實**，TypeScript 不會抱怨
 * （未使用的參數在 ctor 上是合法的），而任何行為測試都只能一次驗一格 —— 也就是
 * 上面那兩份一次補一格的做法，而它已經失敗過兩次。
 *
 * 所以這裡是**兩層**，缺一不可：
 *   ① 結構層（本檔）：每一個 ctor 參數都要在建構子本體裡被轉發。
 *   ② 行為層（`combatFeelWiring.test.ts` 那一族）：轉發之後 sim 的行為真的變了。
 * ①擋「整行不見」，②擋「接到錯的地方」。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "MatchController.ts"), "utf8");

const TAG = "match-config-wiring-completeness";

/** 註解剝掉 —— 這一族的病理正是「註解在，程式碼不在」，所以不能讓註解算數。 */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * 建構子的參數列與本體。
 *
 * `constructor(` 到與它配對的 `)` 是參數列；接下來配對的 `{…}` 是本體。
 * 用配對計數而不是正規表示式 —— 參數的**預設值**裡有括號
 * （`augmentEnemyFilterFromDoc(Configs.tryGet(...))`），貪婪／非貪婪都會切錯。
 */
function constructorParts(): { params: string; body: string } {
  const code = stripComments(SRC);
  const start = code.indexOf("constructor(");
  expect(start, "MatchController 找不到 constructor(").toBeGreaterThan(-1);
  let i = start + "constructor".length;
  let depth = 0;
  let paramsEnd = -1;
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) {
        paramsEnd = i;
        break;
      }
    }
  }
  expect(paramsEnd, "參數列的括號沒有配對").toBeGreaterThan(-1);
  const params = code.slice(start + "constructor(".length, paramsEnd);

  const bodyStart = code.indexOf("{", paramsEnd);
  let bDepth = 0;
  let bodyEnd = -1;
  for (let j = bodyStart; j < code.length; j++) {
    const c = code[j];
    if (c === "{") bDepth++;
    else if (c === "}") {
      bDepth--;
      if (bDepth === 0) {
        bodyEnd = j;
        break;
      }
    }
  }
  expect(bodyEnd, "建構子本體的大括號沒有配對").toBeGreaterThan(-1);
  return { params, body: code.slice(bodyStart, bodyEnd) };
}

/**
 * **只**回傳「普通參數」的名字 —— 帶 `public` / `private` / `protected` / `readonly`
 * 的 **parameter property** 一律跳過。
 *
 * ⚠️ 這個區別就是整條守衛的判準，第一版漏掉它而多報了四個假陽性
 * （`startingTeamHealth` / `fireRing` / `arenaPool` / `settlementCardOnHealthSpent`
 * 全都是 `public readonly`，TypeScript 自己會生賦值，而且它們真的有人讀：
 * `this.startingTeamHealth` @410、`this.arenaPool` @1421）。
 *
 * **一個 parameter property 不可能「掉」** —— 語言保證它落在 `this` 上。
 * 會掉的只有普通參數：它進了作用域，沒有人接手，TypeScript 也不會抱怨
 * （ctor 上未使用的參數是合法的）。`augmentEnemyFilter` 正是這一種，
 * 而這就是它為什麼是全建構子裡唯一蒸發的那一個。
 */
function topLevelParamNames(params: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of params) {
    if ("([{<".includes(c)) depth++;
    else if (")]}>".includes(c)) depth--;
    if (c === "," && depth === 0) {
      names.push(cur);
      cur = "";
    } else cur += c;
  }
  names.push(cur);
  return names
    .filter((p) => !/\b(public|private|protected|readonly)\b/.test(p.split("=")[0]!))
    .map((p) => p.split("=")[0]!.split(":")[0]!.trim())
    .map((p) => p.split(/\s+/).pop() ?? "")
    .filter((p) => /^[A-Za-z_$][\w$]*$/.test(p));
}

describe("⛔ 每一個 config 參數都真的被交給 world（augmentEnemyFilter 掉過一次）", () => {
  it("★ 建構子收下的每一個 config 參數，都在本體裡被轉發", () => {
    cover(TAG);
    const { params, body } = constructorParts();
    const names = topLevelParamNames(params);
    expect(names.length, "參數列解析失敗（一個都沒抓到）").toBeGreaterThan(5);

    /**
     * 不是每一個參數都該進 world —— 有些是身分（matchId / seed / seats）、
     * 有些是節奏（timings）、有些是這個類別自己用的服務（whitelist / ownership）。
     *
     * ⚠️ 這張清單是**豁免**，不是白名單：它列的是「不轉發是對的」，
     * 所以**加一個新 config 參數時什麼都不用改**（預設就被檢查）。
     * 反過來寫（列出「要轉發的」）就會回到同一個坑：忘了加名字＝忘了檢查。
     */
    const NOT_FORWARDED = new Set([
      "matchId",
      "seed",
      "seats",
      "timings",
      "zones",
      "arenaRules",
      "arena",
      "whitelist",
      "ownership",
      "onEvent",
      "recorder",
      "logger",
      "replay",
      "hooks",
    ]);

    const missing = names.filter((n) => {
      if (NOT_FORWARDED.has(n)) return false;
      // 轉發的形狀：`this.world.X = n;` 或 `this.world.X = f(n)` 或
      // `this.X = n`（這個類別自己留著用，也算「有人接手」）。
      const forwarded =
        new RegExp(`this\\.world\\.[\\w$]+\\s*=\\s*[^;]*\\b${n}\\b`).test(body) ||
        new RegExp(`this\\.[\\w$]+\\s*=\\s*[^;]*\\b${n}\\b`).test(body);
      return !forwarded;
    });

    expect(
      missing,
      `這些建構子參數被收下了但沒有任何人接手 —— 後台存了、比賽收不到：\n` +
        missing.map((m) => `  · ${m}`).join("\n") +
        `\n\n（如果某一個是刻意不轉發的，把它加進本檔的 NOT_FORWARDED 並寫下理由。）`,
    ).toEqual([]);
  });

  it("★ augmentEnemyFilter 那一格具名釘住（它是這條守衛的起因）", () => {
    cover(TAG);
    const { body } = constructorParts();
    // 靶：把 `this.world.augmentEnemyFilter = augmentEnemyFilter;` 刪掉 → 紅。
    // 上面那條泛用測試也會紅，這一條的價值是**失敗訊息會指名它**，
    // 而不是要讀者自己從一串名字裡找出哪一個是新掉的。
    expect(
      /this\.world\.augmentEnemyFilter\s*=\s*augmentEnemyFilter/.test(body),
      "MatchController 沒有把 augmentEnemyFilter 交給 world —— " +
        "`hooks.ts` 讀到的會是出貨預設，後台那一頁怎麼調都不生效",
    ).toBe(true);
  });
});

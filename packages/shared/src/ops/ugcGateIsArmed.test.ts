/**
 * ⭐⭐ **玩家自製內容（UGC）的提交端點一旦出現，就必須綁齊身分與開關**（GH#991）。
 *
 * ⛔⛔ **今天那條端點不存在** —— 2026-09-05 量到 `apps/` 底下零個 UGC 提交路由
 * （content-api 唯一讀的 header 是 `x-ggd-operation-id` / `x-ggd-expected-activation`，
 * ⛔ 全樹零個 `Authorization`）。⇒ ⭐ **一個不存在的端點繞不過任何東西** ——
 * 今天沒有洞要補。
 *
 * ⇒ ⭐⭐ **所以這張票的第一批留下的是一份「未來的規格」** ——
 * ⚠️ 而一份規格如果只是散文，它會在**真的要做的那一天**沒有人讀
 * （CLAUDE.md 的元規則：判準 0/4 全破，只有閘有用）。
 *
 * ⭐ 這一支把它變成**今天就會擋人的東西**，兩個方向：
 * · 端點**不存在**而總開關**關著** ⇒ 綠（⭐ 誠實：今天沒有洞）
 * · 端點**出現了**而沒有綁齊那幾格 ⇒ 🔴 並逐字列出缺哪幾格
 * · ⭐⭐ 端點**還不存在**而總開關被打**開** ⇒ 🔴 ——
 *   ⚠️ 那是一扇通往空氣的門：`ugc.enabled=true` 是「這條路已經有守衛了」的宣稱，
 *   ⭐ 而這一條問的正是那個宣稱**兌不兌現得了**（兩個名詞的**關係**，⛔ 不是名詞）。
 *
 * ⚠️⚠️ ⭐ **而「一個永遠綠的閘」與「一個不存在的閘」沒有差別**（形態⑨的鏡像）——
 * ⇒ 所以第 2 條是 **sentinel**：自造一份「有端點沒綁定」的假原始碼，
 * 斷言檢查器**真的抓得到它**。⛔ 沒有那一條，這支測試證明不了自己還活著。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_UGC, zConfigUgcDoc } from "../content/schema/config/ugc";

const ROOT = join(__dirname, "../../../..");

/**
 * ⭐ UGC 提交這條路一旦存在，端點的原始碼裡必須同時出現的那幾格。
 *
 * ⚠️ 每一格都要說得出「⛔ 少了它會發生什麼」，⛔ 否則這只是一張願望清單：
 *
 * | 格 | 少了它 |
 * |---|---|
 * | `resolveUgc` | 端點沒有讀那份設定 ⇒ ⭐ 後台六格全部是**裝飾**（第一守則的反面） |
 * | `UGC_DISABLED` | 關掉總開關時**靜靜地**收下再丟掉 ⇒ 玩家以為自己的作品在排隊 |
 * | `authorization` | ⭐ 沒有真的從請求讀身分 —— ⛔ 一格叫 `requireAuth` 的欄位不是身分檢查 |
 * | `UGC_AUTH_REQUIRED` | 匿名提交被**默默**當成某個人的 ⇒ 配額整組失效而看起來正常 |
 * | `maxPendingPerPlayer` | 一個人塞爆人審佇列，其他人的作品看起來像沒送到 |
 * | `quotaPerPlayerPerDay` | 「送一份、被退、再送一份」磨佇列 —— 待審深度永遠是 1 |
 * | `maxBytes` | 一份提交要整份 parse 才驗得動 ⇒ ⭐ 這是**記憶體**的上界，⛔ 不是磁碟的 |
 */
const REQUIRED_BINDINGS = [
  "resolveUgc",
  "UGC_DISABLED",
  "authorization",
  "UGC_AUTH_REQUIRED",
  "maxPendingPerPlayer",
  "quotaPerPlayerPerDay",
  "maxBytes",
] as const;

/** 出貨的那一份（⛔ 不是 `DEFAULT_UGC` —— 出貨的是 `content/`，不是 TS 常數）。 */
function shippedUgc(): unknown {
  return JSON.parse(readFileSync(join(ROOT, "content/config/ugc.json"), "utf8"));
}

/**
 * ⭐ 掃出貨原始碼找**真的註冊了 UGC 提交路由**的檔。
 *
 * ⚠️⚠️ ⭐ **只 grep 路徑字串是不夠的**（`aiPromoteGuardIsArmed.test.ts` 踩過）——
 * 一份**註解**裡提到那條路徑就會讓閘永遠紅，而那是形態⑨（一個永遠不會綠的閘），
 * 它的下場是被人關掉。⇒ ⭐ 判準是「**路由註冊**」：路徑字串要與
 * `post` / `put` / `Handle` / `route` 這類註冊動詞出現在**同一行**。
 */
function routeSources(pathPattern: string): string {
  try {
    const out = execFileSync(
      "grep",
      [
        "-rlE",
        "--exclude=*.test.ts",
        "--exclude=*_test.go",
        // ⚠️⚠️ ⭐ `.*` 而**不是** `[^\\n]*` —— 後者在 JS 字串裡會被寫成一個
        //   **真的換行**，grep 收到 `[^<換行>]` ⇒ 「brackets not balanced」⇒ **exit 2**。
        //   ⭐ 而下面那個 catch 若把它讀成「沒找到」就是⭐⭐ **一條永遠綠的閘**。
        // ⛔⛔ **`-E` 是大小寫敏感的**（2026-09-09 量到）：動詞清單全是小寫，
        //   ⭐ 而 Go 的 chi router 寫的是 **`r.Post(`／`r.Put(`** ——
        //   ⇒ 這把尺**從來配不到 Go 的任何一條路由**。
        //   ⚠️ 而它的失敗方向最糟：`goRoute` 永遠是空字串
        //   ⇒ 「Go 側零個提交路由」⇒ ⭐ 它會在 `enabled` 被打開的那一刻
        //     喊「那一格在宣稱一條不存在的路」——**而那條路一直都在**
        //     （`apps/platform/internal/submissions/handlers.go:125`
        //       逐字 `r.Post("/submissions", h.submit)`）。
        //   ⇒ 加 `-i`。⛔ 不放寬動詞清單（那會配到註解裡的 `POST /api/...`）。
        "-i",
        `(post|put|patch|Handle|HandleFunc|route).*(${pathPattern})`,
        "apps",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    return out.trim();
  } catch (e) {
    // ⭐⭐ **只有 exit 1 才是「沒找到」** —— grep 的其他離開碼是**它自己壞了**
    //   （2 = 用法/正則錯誤、>2 = I/O）。⛔ 一律當成「沒找到」＝ fail-open 而且**靜默**，
    //   ⭐ 而那正是 CLAUDE.md 說的「fail-open 沒錯，靜默才是缺陷」。
    const status = (e as { status?: number }).status;
    if (status === 1) return "";
    throw new Error(
      `⛔⛔ 這一支的掃描器**自己壞了**（grep exit ${String(status)}）——\n` +
        "  ⭐ 在修好之前，它對「UGC 端點出現了」這件事是**瞎的**，⛔ 不要把它讀成「沒有洞」。",
    );
  }
}

/**
 * UGC 提交路徑的候選寫法。
 *
 * ⛔⛔ **2026-09-07（GH#1103）：這條掃描對真入口結構上是瞎的。**
 * 真入口是 **`POST /api/v1/submissions`**，⭐ 而它註冊在 **Go**
 * （`apps/platform/internal/server`）—— 一支只掃 TS 路由原始碼的正則
 * **永遠不會命中它**，於是下面那條 `if (files === "") return` 一路綠著，
 * ⭐ 而「拿掉 handler 的 `if !policy.Enabled`」這個突變**不會讓它紅**（實測過）。
 *
 * ⇒ ⭐ **真正在守那條路的閘是** `apps/platform/internal/server/ugcgate_routes_test.go`：
 * 它從 `chi.Walk` **推導**入口清單（⛔ 不是路徑字串）、關著時打**真的生產路由**要 403、
 * 開著時要真的寫進耐久層（⭐ 那一段同時是這把尺的 calibrate）。
 * ⚠️ 這裡保留這條掃描只為了**第二個問題**：「⛔ 不要有人在 **TS 側**另開一扇沒綁定的收件路」——
 * ⛔ 它回答不了「今天那條路被擋著嗎」，⭐ 而它的訊息現在說得出這件事。
 */
const UGC_SUBMIT_PATHS = "ugc/(proposals|submissions)|content-api/ugc";

/** 今天有沒有人註冊了 UGC 提交路由。 */
function ugcSubmitSources(): string {
  return routeSources(UGC_SUBMIT_PATHS);
}

/**
 * 一份原始碼文字裡，那幾格綁定缺了哪幾格。
 *
 * ⚠️ **大小寫不敏感**是刻意的，而且只為了一格：`authorization` 這個 header
 * 在原始碼裡可能寫成 `Authorization`（字串字面值）或 `authorization`
 * （Node 把 header 名全部小寫）。⛔ 為了它單獨開一條分支，會讓這張表變成
 * 「六格一種比法、一格另一種」——而那種不一致比大小寫寬鬆更容易出錯。
 */
function missingBindings(text: string): string[] {
  const hay = text.toLowerCase();
  return REQUIRED_BINDINGS.filter((k) => !hay.includes(k.toLowerCase()));
}

describe("UGC 提交閘的規格閘（GH#991）", () => {
  it("★ ⭐ **TS 側**沒有第二扇收件路；一旦出現就必須綁齊身分＋開關＋配額（⛔ 真入口在 Go，見檔頭）", () => {
    const files = ugcSubmitSources();
    // ⭐ 今天走這條：TS 側零命中。⛔ 這**不代表**沒有收件路 —— 真入口是 Go 的
    //   `POST /api/v1/submissions`，守它的是 `ugcgate_routes_test.go`（GH#1103）。
    if (files === "") return;
    const text = execFileSync("cat", files.split("\n"), { cwd: ROOT, encoding: "utf8" });
    expect(
      missingBindings(text),
      "⛔⛔ UGC 提交端點出現了，而它沒有綁住這幾格 ⇒\n" +
        "  ⭐ 那是一條**對外的寫入路**，而票文的 Known risks 逐字寫著\n" +
        "  「quota ＋ maxBytes ＋ 嚴格 Zod 是最低配，**缺一個就不要打開**」。\n" +
        `  ⭐ 出現在：${files.split("\n").join(", ")}`,
    ).toEqual([]);
  });

  it("⭐⭐ **sentinel**：檢查器對「有端點沒綁定」真的會叫（⛔ 否則上面那條永遠綠）", () => {
    expect(
      missingBindings('app.post("/content-api/ugc/submissions", handler)'),
      "⛔ 檢查器對一份**一格都沒綁**的假原始碼沒有反應 —— 這一支的結論全部作廢",
    ).toEqual([...REQUIRED_BINDINGS]);
    expect(
      missingBindings(REQUIRED_BINDINGS.join(" ")),
      "⛔ 全部都在卻還是被判缺 —— 檢查器會對正確的實作誤報",
    ).toEqual([]);
    // ⭐ 大小寫那一格真的被涵蓋（`Authorization` 是字串字面值裡最常見的寫法）。
    expect(
      missingBindings(REQUIRED_BINDINGS.join(" ").replace("authorization", "Authorization")),
    ).toEqual([]);
  });

  it("⭐⭐ **calibrate()**：掃描器對一條**今天真的存在**的路由找得到（⛔ 否則它是瞎的）", () => {
    // ⚠️⚠️ ⭐ 上面那一條今天走的是「零命中 ⇒ 直接綠」，而**零命中有兩個成因**：
    //   ① 真的沒有那條端點（⭐ 這是今天的事實）
    //   ② ⛔ 掃描器本身壞了（正則寫錯、cwd 錯、`--exclude` 太寬、grep 不在 PATH）
    //   ⇒ ⭐ 兩者**量起來一模一樣** —— 而 CLAUDE.md 第一守則逐字：
    //     「一把只驗過單邊的尺，不算自證過」。
    // ⇒ ⭐ 這一條把尺量在一個**已知有**的東西上：`ai-review/promote` 這條路由
    //   2026-09-05 真的註冊在 `apps/content-api/src/server.ts`。
    //   找不到它 ⇒ 掃描器壞了 ⇒ ⭐ 這一支的每一個「沒有洞」的結論**全部作廢**。
    expect(
      routeSources("ai-review/promote"),
      "⛔⛔ 掃描器連一條**已知存在**的路由都找不到 ⇒ 它對 UGC 端點也是瞎的，\n" +
        "  ⭐ 而它會用「沒有洞」的樣子沉默。先修掃描器，⛔ 不要相信上面那幾條的綠。",
    ).not.toBe("");
  });

  it("⭐⭐ 總開關**只有在那條路真的存在時**才可以是 true（⛔ 不是一扇通往空氣的門）", () => {
    const doc = zConfigUgcDoc.parse(shippedUgc());
    if (!doc.enabled) return; // ⭐ 今天走這條：出貨關著
    // ⛔⛔ 2026-09-07（GH#1103）：這一條在此之前只問 `ugcSubmitSources()`（**只掃 TS**），
    //   ⭐ 而真入口 `POST /api/v1/submissions` 註冊在 **Go**
    //   （`apps/platform/internal/submissions/handlers.go` 的 `Mount`）。
    //   ⇒ owner 哪天把 `enabled` 翻成 true，這一條會用「**零個** UGC 提交路由」紅掉 ——
    //   ⚠️ ⭐ 而那句話是**假的**。一條在它最該說話的那一刻說謊的閘，比沒有閘更糟。
    // ⛔⛔ **pattern 自己不可以含動詞**（2026-09-09 量到的第二層）：
    //   舊的是 `r\.Post\("/submissions"`，而 `routeSources` 組出來的是
    //   `(post|put|…).*(<pattern>)` ⇒ ⭐ 它要求動詞**出現在 pattern 之前**，
    //   而這裡動詞就在 pattern 裡面 ⇒ **永遠配不到**（配到也要有第二個 `r.Post`）。
    //   ⇒ 只給路徑，讓前綴那組動詞去配 `r.Post(`。
    const goRoute = routeSources('"/submissions"');
    expect(
      ugcSubmitSources() + goRoute,
      "⛔⛔ `content/config/ugc.json` 的 `enabled` 是 **true**，而 TS 與 Go 兩側\n" +
        "  **零個** UGC 提交路由 ⇒ ⭐ 那一格在宣稱一條不存在的路已經有守衛了。\n" +
        "  ⭐ 兩條出路：把端點做出來（並綁齊上面那幾格），或把 `enabled` 改回 false。\n" +
        "  ⚠️ 「那條路被擋著嗎」這一題**不歸這裡回答** ——\n" +
        "     它由 `apps/platform/internal/server/ugcgate_routes_test.go` 打真的生產路由驗（GH#1103）。",
    ).not.toBe("");
  });

  it("⭐ 出貨檔與 Zod 預設是**同一份投稿政策** —— ⛔ 不能只對 enabled", () => {
    // ⭐ 這裡守的是兩份出貨預設沒有打架；數值由 DEFAULT_UGC 的單一來源裁決。
    // 只比 enabled 會漏掉 maxPending、daily quota、power-user quota 與完整英雄模型上限，
    // 服務就會在畫面看似開放時靜靜套用舊政策。
    //
    // ⛔⛔ **在此之前第一行是 `toBe(false)`** —— ⭐ 而那把「今天的值」寫死進了守衛。
    //   owner 2026-09-09 逐字裁決「**開**，我們總共新增兩批 37+37=74 個新英雄喔」
    //   ⇒ 那一行會用「fail-open 的方向反了」擋住一個**他親口下的決定**。
    //   ⚠️ 而它擋的理由是假的：⭐ 上面那一條（路由真的存在嗎）才是安全閘，
    //     ⛔ 這一條的職責只有「兩份不要打架」。
    // ⇒ 拿掉寫死的 `false`，只守**關係**。
    expect(
      zConfigUgcDoc.parse(shippedUgc()),
      "⛔ 出貨檔與 Zod 預設的投稿政策不一致 —— 配額或完整英雄模型上限會在正式服務靜靜退回舊值",
    ).toMatchObject(DEFAULT_UGC);
  });
});

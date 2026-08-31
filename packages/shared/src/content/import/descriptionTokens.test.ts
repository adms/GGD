/**
 * ⭐⭐ GH#327 §3.6 —— 說明文字的允許清單 tokenizer。
 *
 * owner 2026-08-14：「請一定要檢查合法性（包含 check sum & MD5 & **內容沒有 injection**）」
 *
 * ⚠️ ⭐ 這是**外來內容通到玩家畫面**的那條路。票文逐字：
 * 「現在**沒有任何東西**在剝 HTML / CSS / URL / script」。
 *
 * ── 票文明列的五條最低守衛，逐條在下面 ─────────────────────────────────────
 * ①相鄰 token 不合併 ②`【…】`／引言不作 mechanics 推論
 * ③`GLADIARIA` 不被切成 `GL[AD]IARIA` ④獨立詞 `[直線]` ⇒ `[指向][範圍]` ⑤冪等
 *
 * MUTATION LOG（落地前跑過）：
 *   · `TOKEN_CHARS` 換成 `/^.+$/u` → 「注入不變成 token」紅
 *   · `NORMALISE` 那一行拿掉 → 「[直線] 正規化」紅
 *   · `inner.includes("[")` 那一條拿掉 → 「相鄰 token 不合併」紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { CHECKSUM_POLICY } from "./digest";
import {
  tokenizeDescription,
  renderTokens,
  PALETTE_IDS,
  type PresentationNode,
} from "./descriptionTokens";

const tokens = (t: string): string[] =>
  tokenizeDescription(t).filter((n): n is Extract<PresentationNode, { kind: "token" }> => n.kind === "token")
    .map((n) => n.label);

describe("GH#327 §3.6 說明 tokenizer", () => {
  it("量尺先自證：一般說明真的切得出 token（⛔ 切不出來下面全是空過）", () => {
    expect(tokens("[主動][範圍] 造成 300 點傷害")).toEqual(["主動", "範圍"]);
  });

  it("★① **相鄰 token 不合併** —— `[a][b]` 是兩個節點，⛔ 不是一個", () => {
    const n = tokenizeDescription("[指向][範圍]");
    expect(n.filter((x) => x.kind === "token")).toHaveLength(2);
    // ⛔ 而且中間**不可以**冒出一個空文字節點（那會讓渲染器多畫一個間隔）
    expect(n.every((x) => x.kind !== "text" || x.text !== "")).toBe(true);
  });

  it("★② `【…】` 與 `「…」` **原樣留在文字裡** —— ⛔ 這一層不做機制推論", () => {
    const t = "【卍解】「不，還不能笑，我一定要忍住……在35秒後宣布勝利吧。」[被動]";
    const n = tokenizeDescription(t);
    expect(renderTokens(n), "⛔ 台詞被吃掉 = 玩家看不到角色的話").toBe(t);
    expect(tokens(t), "⛔ 台詞裡的字被當成 token").toEqual(["被動"]);
  });

  it("★③ **`GLADIARIA` 不被切開** —— 沒有方括號就沒有 token", () => {
    const n = tokenizeDescription("GLADIARIA 的劍");
    expect(n).toEqual([{ kind: "text", text: "GLADIARIA 的劍" }]);
  });

  it("★④ 獨立詞 **`[直線]` ⇒ `[指向][範圍]`**，⛔ 而 `[直線衝鋒]` 不動", () => {
    expect(tokens("[直線]")).toEqual(["指向", "範圍"]);
    expect(tokens("[直線衝鋒]"), "⛔ 子字串比對會把它切開").toEqual(["直線衝鋒"]);
  });

  it("★⑤ **冪等** —— 還原再切一次得到同一棵樹", () => {
    const t = "[主動][範圍] 對 [周圍] 造成 [AP加成] 傷害「快看我的！」";
    const once = tokenizeDescription(t);
    const twice = tokenizeDescription(renderTokens(once));
    expect(twice).toEqual(once);
  });

  it("★⭐⭐ **注入的東西不會變成 token**（owner 點名的那一條）", () => {
    for (const bad of [
      "[<script>alert(1)</script>]",
      "[javascript:alert(1)]",
      "[a\"onmouseover=\"x]",
      "[url(http://evil/x.png)]",
      "[a;color:red]",
      "[../../etc/passwd]",
      `[${"很".repeat(20)}]`, // ⭐ 超過長度上限
    ]) {
      const n = tokenizeDescription(`前 ${bad} 後`);
      expect(
        n.filter((x) => x.kind === "token"),
        `⛔ \`${bad.slice(0, 24)}\` 變成了 token —— 那一格會帶著它的字上畫面`,
      ).toEqual([]);
      // ⭐ 而它**留在文字裡**（⛔ 不是被丟掉）—— 文字節點的消費端會跳脫它
      expect(renderTokens(n)).toBe(`前 ${bad} 後`);
    }
  });

  it("★⭐ **巢狀方括號不是 token** —— `[a[b]` / `[[x]]` 的內層不可以被吃進來", () => {
    // ⚠️ ⭐ 這一條是突變驗證逼出來的：拿掉 `inner.includes("[")` 之後
    //   上面八條**全部是綠的** —— 因為它們的方括號都是配對好的。
    // ⛔ 而畸形的巢狀正是攻擊者會寫的形狀：`[a[<script>]` 的 `indexOf("]")`
    //   會停在第一個 `]`，於是 `a[<script>` 有機會被當成一個 token 的內文。
    expect(tokens("[a[b]"), "⛔ 內層被吃進來了").toEqual([]);
    expect(tokens("[[主動]]"), "⛔ 外層的畸形括號讓內層變成 token").toEqual([]);
    // ⭐ 而它們**原樣留著**（⛔ 不丟字）
    for (const s of ["[a[b]", "[[主動]]"]) {
      expect(renderTokens(tokenizeDescription(s))).toBe(s);
    }
  });

  it("⭐ 色票是**封閉列舉** —— ⛔ 匯入包不可以指定顏色（那是 CSS 注入的入口）", () => {
    const t = "[主動][AP][暈眩][沒有人認得的標籤]";
    for (const n of tokenizeDescription(t)) {
      if (n.kind !== "token") continue;
      expect(PALETTE_IDS as readonly string[], `⛔ ${n.label} 給了一個表外的色票`).toContain(
        n.palette,
      );
    }
    // ⭐ 認不得的 ⇒ `default`（⛔ 不是丟掉、⛔ 不是報錯）
    expect(tokens(t)).toContain("沒有人認得的標籤");
  });

  it("⭐ 出貨內容跑得過：**一份都不會掉字**（冪等 ＋ 無損）", () => {
    // ⚠️ 這一條是「量尺對著真的東西量」——⛔ 不是自造字串（失敗形態⑤）。
    const samples = [
      "[主動攻擊][被動] 提高 [AP] 20%",
      "[吸收（護盾）] 300 點",
      "造成 [AP加成] 傷害，並 [暈眩] 1.5 秒",
      "普通文字，沒有任何標籤。",
      "",
    ];
    for (const s of samples) expect(renderTokens(tokenizeDescription(s)), s).toBe(s);
  });
});

/**
 * ⭐⭐ GH#327 ③ —— **checksum 政策要寫死在契約裡**。
 *
 * owner 2026-08-14 逐字點名了 **MD5**。⭐ 而正確的回答是「⛔ 不採用」——
 * ⚠️ 而「不採用」要**寫下來**，⛔ 不是靜默省略：靜默省略之後，
 * 下一輪會有人「補上」MD5 並把它接進 `if (ok)`。
 */
describe("GH#327 ③ checksum 政策", () => {
  it("★ ⭐ **SHA-256 是唯一的防篡改依據**，MD5/SHA-1 明確在拒絕名單裡", () => {
    expect(CHECKSUM_POLICY.authority).toBe("sha256");
    expect(CHECKSUM_POLICY.rejected).toContain("md5");
    expect(CHECKSUM_POLICY.rejected, "⛔ SHA-1 也一樣碰得到").toContain("sha1");
    expect(CHECKSUM_POLICY.why, "⛔ 沒有理由的拒絕會被下一輪推翻").toContain("碰撞");
  });

  it("⭐ ⛔ **拒絕名單裡的演算法不可以出現在 import 的任何判斷裡**", () => {
    // ⚠️ 這一條掃的是**出貨原始碼**（⛔ 不是我造的字串）——
    //   CLAUDE.md：掃字串代替行為是形態⑥，⭐ 但「這個名字**不可以出現**」
    //   本來就是一個關於原始碼的性質，⛔ 沒有行為版本。
    const dir = resolve(__dirname, ".");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.includes(".test."))) {
      const src = readFileSync(resolve(dir, f), "utf8");
      // ⭐ 剝掉註解再看 —— 註解裡**要**提到 md5（那是政策本身）
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const bad of ["md5", "sha1"]) {
        // ⭐ **政策宣告自己**（`rejected:` 與它的 `why:`）當然會提到這些名字 ——
        //   ⛔ 那不是違規，那是政策本身。⚠️ 而豁免要**指得出是哪一行**，
        //   ⛔ 不是「有提到就放行」（那會把真正的用法一起放行）。
        const declaration = (l: string): boolean =>
          l.trimStart().startsWith("rejected:") || l.trimStart().startsWith("why:");
        const lines = code
          .split("\n")
          .filter((l) => l.toLowerCase().includes(bad) && !declaration(l));
        expect(lines, `⛔ ${f} 用到了 ${bad}`).toEqual([]);
      }
    }
  });
});

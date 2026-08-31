/**
 * ⭐⭐ 說明文字的 **`[token]` 允許清單 tokenizer**（GH#327 §3.6）。
 *
 * ── owner 2026-08-14 ────────────────────────────────────────────────────────
 * 「請一定要檢查合法性（包含 check sum & MD5 & **內容沒有 injection**）」
 *
 * ⚠️ ⭐ **這是外來內容通到玩家畫面的那條路。**
 * 匯入包的 `description` 是**別人寫的字**，而它會被畫在卡面上。
 *
 * ── ⛔ 為什麼允許清單**不是那 219 個詞** ────────────────────────────────────
 * 2026-08-31 量到：出貨說明裡有 **219 種** `[token]`、**1,435 次**，
 * 其中 **133 種只出現 1–2 次**。
 * ⇒ 一張手寫的 219 詞清單會在下一個作者寫新標籤的那天就過期，
 *   ⛔ 而過期的表達方式是「玩家的卡面上少了一個標籤」——**沒有東西會紅**。
 *
 * ⭐ 所以允許清單在**形狀**上，⛔ 不在詞彙上：
 *   ① 一個 token 只能由**安全字元**組成（CJK / 英數 / 全形括號 / `·` / `％` / `+` / `-`）
 *   ② 長度上限 12（⭐ 上下界都有 —— 第一守則）
 *   ③ ⛔ **產出永遠是資料節點**（`{kind:"token", label, palette}`），
 *      ⛔ 永遠不是 HTML / CSS / URL / script —— ⭐ 那是**結構上**的保證，
 *      ⛔ 不是「記得要跳脫」。
 *   ④ 認不得的 token ⇒ 退回**純文字**（fail-safe），⛔ 不是丟掉、⛔ 也不是當標記
 *
 * ⇒ ⭐ 一段 `[<script>alert(1)</script>]` 不符合字元集 ⇒ 它是**文字**，
 *   而文字節點的消費端（React / textContent）本來就會跳脫它。
 *
 * ── ⚠️ 它**不做**機制推論 ────────────────────────────────────────────────
 * CLAUDE.md 第〇·六守則②：「`「」` 裡面是**角色對白**，不是效果」。
 * ⭐ 這支只做**呈現**：`「…」` 與 `【…】` 原樣留在文字節點裡（玩家要看到台詞），
 * ⛔ 而任何讀說明找機制的東西要走 `descriptionClaims.mechanicsText()`（它會剝掉）。
 */

/** 一個呈現節點 —— ⛔ 這個型別裡**沒有任何**可以放標記的地方。 */
export type PresentationNode =
  | { readonly kind: "text"; readonly text: string }
  /** ⭐ `label` 是**純文字**（⛔ 不含方括號）；`palette` 是**內建**色票 id。 */
  | { readonly kind: "token"; readonly label: string; readonly palette: PaletteId };

/**
 * ⭐ 內建色票 —— ⛔ 這是一個**封閉**列舉，而那是重點：
 * 匯入包**不可以**指定顏色（那是 CSS 注入的入口）。
 */
export const PALETTE_IDS = [
  "default",
  "targeting", // [指向] [範圍] [周圍] [直線]…
  "resource", // [AP] [MP] [最大生命]…
  "timing", // [被動] [主動] [普攻時]…
  "control", // [暈眩] [沉默] [擊退]…
] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

/**
 * ⭐ 一個 token 的**字元集**（允許清單）。
 *
 * ⚠️ ⛔ 刻意**不含**：`<` `>` `&` `"` `'` `/` `\` `(` `)` `{` `}` `;` `:` 半形逗號、
 *   空白 —— ⭐ 那些正是 HTML / CSS / URL / script 需要的字元。
 * ⭐ 全形括號 `（）` 是**允許的**（出貨內容有 `[吸收（護盾）]`），
 *   ⛔ 而它們在 HTML 與 CSS 裡都沒有語法意義。
 */
const TOKEN_CHARS = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9＋+\-％%·．（）]+$/u;

/** ⭐ 上下界都有（第一守則）—— 出貨最長的 token 是 6 個字。 */
const MAX_TOKEN_LEN = 12;

/**
 * ⭐ **正規化**：獨立詞 `[直線]` ⇒ `[指向][範圍]`（GH#327 §3.6 明列的最低守衛之一）。
 *
 * ⚠️ 它只在 token **完全等於**該詞時觸發 —— ⛔ 不是子字串比對，
 *   否則 `[直線衝鋒]` 會被切開。
 */
const NORMALISE: Readonly<Record<string, readonly string[]>> = {
  直線: ["指向", "範圍"],
};

/** 前綴/整詞 → 色票。⭐ 認不得的一律 `default`（⛔ 不是丟掉）。 */
const PALETTE_OF: Readonly<Record<string, PaletteId>> = {
  指向: "targeting", 範圍: "targeting", 周圍: "targeting", 直線: "targeting",
  範圍內: "targeting", 攻擊距離: "targeting",
  AP: "resource", MP: "resource", AP加成: "resource", 最大生命: "resource",
  力量: "resource", 魔法抗性: "resource",
  被動: "timing", 主動: "timing", 普攻時: "timing", 普通攻擊時: "timing",
  主動攻擊: "timing", 輔助: "timing", 變身: "timing",
  暈眩: "control", 沉默: "control", 擊退: "control", 虛弱: "control", 破甲: "control",
};

/**
 * ⭐ 把一段說明切成呈現節點。
 *
 * ⭐ **冪等**：`render(tokenize(t))` 再 `tokenize` 一次要得到同一棵樹
 *   （GH#327 §3.6 的最低守衛之一）。
 */
export function tokenizeDescription(text: string): PresentationNode[] {
  const out: PresentationNode[] = [];
  let buf = "";
  const flush = (): void => {
    if (buf !== "") {
      out.push({ kind: "text", text: buf });
      buf = "";
    }
  };
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "[") {
      buf += text[i];
      continue;
    }
    const end = text.indexOf("]", i + 1);
    const inner = end < 0 ? null : text.slice(i + 1, end);
    // ⛔ 沒有收尾、或內文是空的 ⇒ 這一個 `[` 是**文字裡的方括號**。
    if (inner === null || inner === "") {
      buf += text[i];
      continue;
    }
    // ⛔⛔ **巢狀**（`[a[b]` / `[[主動]]`）⇒ ⭐ **整段**當文字，
    //   ⛔ 不是「跳過外層再試內層」。
    //
    // ⚠️ 守衛抓到的真缺陷：只 `continue` 一格的話，`[a[b]` 的掃描會在 `i=2`
    //   重新開始並把 `[b]` 認成一個 token ⇒ ⭐ 攻擊者只要在前面補一個 `[`，
    //   就能讓後面那一格被當成標籤。
    //
    // ⭐ 而「整段吞掉」在出貨內容上是**零成本**的：2026-08-31 量到
    //   `content/{abilities,items}` 的說明裡**方括號不配對或巢狀的有 0 份**。
    // ⇒ 這條規則只會影響**畸形**輸入，⭐ 而對它 fail-safe 正是我們要的方向。
    if (inner.includes("[")) {
      buf += text.slice(i, end + 1);
      i = end;
      continue;
    }
    if (inner.length > MAX_TOKEN_LEN || !TOKEN_CHARS.test(inner)) {
      // ⭐ **fail-safe**：認不得就當文字（⛔ 不丟掉、⛔ 不當標記）——
      //   `[<script>…]` 走的就是這一條。
      buf += text[i];
      continue;
    }
    flush();
    for (const label of NORMALISE[inner] ?? [inner]) {
      out.push({ kind: "token", label, palette: PALETTE_OF[label] ?? "default" });
    }
    i = end;
  }
  flush();
  return out;
}

/**
 * ⭐ 把節點樹還原成**同樣的說明字串**（冪等測試用，也是「重新輸出」的那一半）。
 * ⚠️ ⛔ 這**不是**渲染器 —— 渲染器住在客戶端，而它拿到的是節點，⛔ 不是字串。
 */
export function renderTokens(nodes: readonly PresentationNode[]): string {
  return nodes.map((n) => (n.kind === "text" ? n.text : `[${n.label}]`)).join("");
}

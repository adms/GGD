/**
 * docEnvTruth —— 文件裡的 combat-env 倍率必須等於出貨值。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這條守衛為什麼存在（owner 2026-07-31 親自抓到的）
 * ─────────────────────────────────────────────────────────────────────────────
 * 他讀 `docs/_execution-batches.md` 的「owner 累積裁定（**不要再問，也不要自己改回去**）」
 * 那一段，看到第 6 條寫著「生命全域倍率 ×8 → ×4」，回了一句：
 *
 *     「= > 早就改到 x6」
 *
 * 他還記錯了一版 —— 那時候出貨值已經是 **9.0**（2026-07-30 的二次裁決，commit 2eb157b4）。
 * 也就是說**那一行連續錯過了三次調整**（×4 → ×6 → ×9），而它所在的段落標題正好是
 * 「不要自己改回去」。一份被當成權威來讀的文件，說了一個差兩倍以上的數字。
 *
 * 同一次普查還抓到 `_attribute-derivation-248.md` 的**前言**一句話三個錯：
 *   「血量 ×8.0、魔力 ×3.0、回魔 ×4.0」 vs 實際 9.0 / 1.0 / 8.0
 * 那句話是「這份文件的每個數字怎麼讀」的定義，所以**下游每一個推導值都繼承了它**。
 *
 * 這就是 CLAUDE.md 第三守則（「註解會說謊，去驗證」）的文件版。人工複查會漏，
 * 因為沒有人會在改一個 config 數字的時候去 grep 六份 markdown。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼這一條**可以**掃字串（其他守衛不行）
 * ─────────────────────────────────────────────────────────────────────────────
 * CLAUDE.md 失敗形態⑥ 禁止「用掃原始碼字串代替行為」。這裡不適用，因為
 * **被守的東西本身就是一個字串** —— 「文件上印的那個數字」。掃它不是代替品，
 * 而是唯一正確的量測。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 歷史紀錄不在管轄範圍
 * ─────────────────────────────────────────────────────────────────────────────
 * 稽核報告與交接文件會**刻意**記載「當時是 ×4」，那是紀錄不是宣稱，改掉它等於銷毀證據。
 * 所以只有 {@link LIVE_DOCS} 這幾份「會被當成現況讀」的文件受管。
 * 新增一份會被當成現況讀的文件時，把它加進來。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** 唯一真值。 */
function shippedMultipliers(): Record<string, number> {
  const raw = JSON.parse(
    readFileSync(join(REPO, "content/config/combat-env.json"), "utf8"),
  ) as { data?: { multipliers: Record<string, number> }; multipliers?: Record<string, number> };
  const m = raw.data?.multipliers ?? raw.multipliers;
  if (!m) throw new Error("combat-env.json has no multipliers block");
  return m;
}

/**
 * 「會被當成現況讀」的文件。⚠️ 稽核/歷史/交接文件**故意**不列 —— 它們記載的是
 * 「當時是多少」，那是證據。
 */
const LIVE_DOCS = [
  "docs/_execution-batches.md",
  "docs/_attribute-derivation-248.md",
  "docs/_requirements-audit-gaps20260723.md",
  "CLAUDE.md",
] as const;

/**
 * 中文標籤 → combat-env 的 key。
 *
 * ⚠️ 這張表是**故意窄**的：只收那些「後面直接跟著一個倍率數字」的說法。
 * 收太寬會把「生命倍率的討論」也抓進來，那種句子沒有一個唯一正確的數字，
 * 守衛就會變成必須不斷加例外的噪音來源 —— 而一條總是要加例外的守衛，
 * 三個月後就沒有人讀了。
 */
const LABELS: readonly { re: RegExp; key: string; what: string }[] = [
  { re: /生命全域倍率[^。\n]{0,12}?[×x]\s*([0-9]+(?:\.[0-9]+)?)/g, key: "maxHealth", what: "生命全域倍率" },
  { re: /血量\s*[×x]\s*([0-9]+(?:\.[0-9]+)?)/g, key: "maxHealth", what: "血量" },
  { re: /maxHealth\s*[×x]\s*([0-9]+(?:\.[0-9]+)?)/g, key: "maxHealth", what: "maxHealth" },
  { re: /魔力\s*[×x]\s*([0-9]+(?:\.[0-9]+)?)/g, key: "maxMana", what: "魔力" },
  { re: /回魔\s*[×x]\s*([0-9]+(?:\.[0-9]+)?)/g, key: "manaRegen", what: "回魔" },
  { re: /冷卻\s*[×x]\s*([0-9]+(?:\.[0-9]+)?)/g, key: "cooldown", what: "冷卻" },
];

interface Claim {
  file: string;
  line: number;
  what: string;
  key: string;
  claimed: number;
}

function harvestClaims(): Claim[] {
  const out: Claim[] = [];
  for (const rel of LIVE_DOCS) {
    const abs = join(REPO, rel);
    if (!existsSync(abs)) continue;
    const lines = readFileSync(abs, "utf8").split("\n");
    lines.forEach((text, i) => {
      // 一行只要自己說「這是歷史/曾經」，就放它過 —— 那是紀錄不是宣稱。
      if (/之前寫著|曾經|當時|歷史|舊值|已被推翻/.test(text)) return;
      for (const { re, key, what } of LABELS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          out.push({ file: rel, line: i + 1, what, key, claimed: Number(m[1]) });
        }
      }
    });
  }
  return out;
}

describe("文件裡的 combat-env 倍率 = 出貨值（docEnvTruth）", () => {
  const env = shippedMultipliers();

  it("GUARD THE GUARD：真的有掃到東西，而且掃的是整份文件", () => {
    // 一條抓不到任何宣稱的守衛，對任何錯誤都會是綠的。
    const claims = harvestClaims();
    expect(
      claims.length,
      "一個宣稱都沒抓到 —— 正規式或 LIVE_DOCS 壞了，這條守衛已經變成真空",
    ).toBeGreaterThan(0);
    expect(Object.keys(env)).toContain("maxHealth");
  });

  it("★ 每一個現況宣稱都等於 content/config/combat-env.json", () => {
    const claims = harvestClaims();
    const wrong = claims.filter((c) => c.claimed !== env[c.key]);
    const msg =
      "\n文件說的數字跟出貨值不一樣。**出貨值是對的，文件是錯的** ——\n" +
      "去改文件，不要去改 combat-env.json 來遷就文件。\n" +
      "如果那一行是刻意的歷史紀錄，在同一行加上「當時」「之前寫著」之類的字眼，\n" +
      "這條守衛就會放它過（見檔頭「歷史紀錄不在管轄範圍」）。\n\n" +
      wrong
        .map(
          (c) =>
            `  ${c.file}:${c.line}  ${c.what} 寫 ×${c.claimed}，` +
            `但 multipliers.${c.key} = ${env[c.key]}`,
        )
        .join("\n") +
      "\n";
    expect(wrong, msg).toEqual([]);
  });
});

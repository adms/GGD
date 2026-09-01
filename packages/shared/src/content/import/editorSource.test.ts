/**
 * ⭐⭐ P0-1 —— 產生器來源轉接器的**判準**（⛔ 不是一張手寫名單）。
 *
 * ── ⭐ 這條守衛跑**出貨的戶籍表**，⛔ 不是自造夾具 ────────────────────────
 * 失敗形態⑤：被測的不是出貨的那個。⇒ 直接讀 `tools/parallel-gates/sync-io.json`
 * 與 `tools/parallel-gates/normalizers.json`。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `ownershipOf` 不扣掉正規化器（`authors = writers`）→ 🔴
 *     （331 份手編技能被判成 `generator` ⇒ 編輯器一份都改不了）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  NORMALIZER_OWNED_FIELDS,
  adapterFor,
  membersOf,
  ownershipOf,
  type NormalizerFacts,
  type SyncIoFacts,
  writePolicyFor,
} from "./editorSource";

const ROOT = resolve(__dirname, "../../../../..");
const IO = JSON.parse(
  readFileSync(resolve(ROOT, "tools/parallel-gates/sync-io.json"), "utf8"),
) as SyncIoFacts;
const NORMS = JSON.parse(
  readFileSync(resolve(ROOT, "tools/parallel-gates/normalizers.json"), "utf8"),
) as NormalizerFacts;

const abilityPaths = readdirSync(resolve(ROOT, "content/abilities"))
  .filter((f) => f.endsWith(".json") && f !== "_index.json")
  .map((f) => `content/abilities/${f}`);

describe("P0-1 產生器來源轉接器", () => {
  it("★★ ⭐ 421 份技能分成**兩堆**：產生器的與可直接寫的（⛔ 不是全部不可寫）", () => {
    const by = {
      "generator-owned": 0,
      "normalizer-only": 0,
      "hand-authored": 0,
    } as Record<string, number>;
    for (const p of abilityPaths) {
      const k = ownershipOf(p, IO, NORMS).ownership;
      by[k] = (by[k] ?? 0) + 1;
    }
    expect(
      abilityPaths.length,
      "儀器：一份都沒讀到 ⇒ 下面量的是空氣",
    ).toBeGreaterThan(300);
    expect(
      by["generator-owned"],
      "⛔ 一份產生器產物都沒認出來 ⇒ 編輯器會直接寫它們，而下一次 sync 打回來",
    ).toBeGreaterThan(0);
    expect(
      (by["normalizer-only"] ?? 0) + (by["hand-authored"] ?? 0),
      "⛔⛔ **全部**被判成產生器產物 ⇒ 編輯器一份技能都改不了。\n" +
        "⭐ 那正是 `sync-io.json` 用 glob 認領造成的假象：`skillremake:provenance` 只寫\n" +
        "   `provenance` 一格、`castderive:build:raw` 只寫 `castTimeSec` —— 它們是**正規化器**，⛔ 不是作者。",
    ).toBeGreaterThan(0);
  });

  it("★ ⭐ 產生器產物**找得到來源檔**，而那個檔真的在磁碟上", () => {
    const gen = abilityPaths.filter(
      (p) => ownershipOf(p, IO, NORMS).ownership === "generator-owned",
    );
    expect(gen.length).toBeGreaterThan(0);
    const orphan: string[] = [];
    for (const p of gen) {
      const { authors } = ownershipOf(p, IO, NORMS);
      const a = adapterFor(p, authors);
      if (a === null) {
        orphan.push(`${p} —— 沒有轉接器（作者：${authors.join(",")}）`);
        continue;
      }
      const src = a.sourceFor(p)!;
      if (!existsSync(resolve(ROOT, src)))
        orphan.push(`${p} → ${src}（來源檔不存在）`);
    }
    expect(
      orphan,
      `⛔⛔ 這幾份是產生器的產物，而編輯器**改不到它們的來源**：\n` +
        `${orphan
          .slice(0, 8)
          .map((o) => `  · ${o}`)
          .join("\n")}\n` +
        `⇒ ⭐ 對編輯器來說它們是**唯讀**的，而回應必須說出來（⛔ 不是靜默拒絕）。`,
    ).toEqual([]);
  });

  it("⭐ 每一支轉接器只給**一個**重生成指令（⛔ 不是一串步驟）", () => {
    const p = "content/abilities/godie-e00s.r.json";
    const { authors, ownership } = ownershipOf(p, IO, NORMS);
    expect(ownership).toBe("generator-owned");
    const a = adapterFor(p, authors)!;
    expect(a.sourceFor(p)).toBe("tools/skill-remake/heroes/godie-e00s.py");
    expect(a.regenerate).toBe("bash scripts/genrun.sh skillremake:json");
    expect(
      a.regenerate.includes("&&"),
      "⛔ 一串步驟 ⇒ 中途失敗會留下半套產物",
    ).toBe(false);
  });
});

describe("⑤ ⭐ 正規化器擁有的欄位清單**不可以過期**", () => {
  it("★★ `NORMALIZER_OWNED_FIELDS` == `tierize.py` 真正寫的那些欄位", () => {
    const py = readFileSync(
      resolve(__dirname, "../../../../../tools/skill-remake/tierize.py"),
      "utf8",
    );
    // ⭐ 逐字讀**寫入端**（`doc["x"] = …`），⛔ 不是讀註解也不是抄一份名單。
    const written = new Set<string>();
    for (const m of py.matchAll(/doc\["([a-zA-Z]+)"\]\s*=/g))
      written.add(m[1]!);
    written.delete("id"); // `id` 是 key ⛔ 不是被正規化的值
    expect(
      [...written].sort(),
      "⛔⛔ `tierize.py` 的寫入端變了，而 `NORMALIZER_OWNED_FIELDS` 沒跟上 ⇒\n" +
        "⭐ 編輯器會拿到一份**漏報**的清單：它改那一格、值被吃掉、而契約說不會。",
    ).toEqual([...NORMALIZER_OWNED_FIELDS].sort());
  });

  it("★ ⭐ 儀器：這條閘真的讀得到寫入端（⛔ 不是永遠空集合對空集合）", () => {
    expect(NORMALIZER_OWNED_FIELDS.length).toBeGreaterThan(3);
    expect(NORMALIZER_OWNED_FIELDS).toContain("cooldown");
  });
});

describe("⑥ ⭐ `writePolicy` 與 blast radius", () => {
  it("★★ 產生器擁有 ＋ 有轉接器 ⇒ `source-adapter`；沒有轉接器 ⇒ `readonly`", () => {
    expect(writePolicyFor("generator-owned", true)).toBe("source-adapter");
    expect(writePolicyFor("generator-owned", false)).toBe("readonly");
    expect(writePolicyFor("hand-authored", false)).toBe("document");
    expect(writePolicyFor("normalizer-only", false)).toBe("document");
  });

  it("★★ ⭐ 改一份來源會重生成的**不只**編輯器點開的那一份", () => {
    const a = adapterFor("content/abilities/godie-e00s.r.json", [
      "skillremake:json",
    ])!;
    const members = membersOf("tools/skill-remake/heroes/godie-e00s.py", a, IO);
    expect(
      members.length,
      "⛔ blast radius 只有 1 ⇒ 編輯器會以為改來源只影響一份文件",
    ).toBeGreaterThan(1);
    expect(members).toContain("content/abilities/godie-e00s.r.json");
    expect(members).toContain("content/champions/godie-e00s.json");
  });
});

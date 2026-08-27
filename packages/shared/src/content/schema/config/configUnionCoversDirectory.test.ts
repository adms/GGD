/**
 * ⛔ **一份 config schema 進了這個資料夾，卻沒進 union，不可以靜靜地過去。**
 *
 * 2026-08-22 把 9,169 行的 `schema/config.ts` 拆成一份 config 一個檔
 * （owner：「分析優化 config.ts 檔⋯以能平行化有利的方式優化這個檔案，拆檔也可以」）。
 * 拆完之後新增一份 config = **新開一個檔** + `config/index.ts` 的 union 加一行。
 *
 * ⚠️ **那一行就是這條閘存在的理由。** union 漏掉一員的後果不是「那一份被忽略」——
 * 是 `zConfigDoc` 拒絕整份文件 → ContentLoader 驗證失敗 → `main.tsx` 的 fail-open
 * 註冊 2 隻骨架英雄 → 選人畫面整個空掉，**而網站看起來完全正常**。那正是 2026-08-02
 * 線上壞掉四小時的形狀，而 `config.ts` 裡有 **20 幾條**手寫的「⚠️ 漏掉這一行 = 骨架英雄」
 * 註解在替它擋 —— 那是**判準**（要記得讀），這一條才是**閘**。
 *
 * ⭐ 為什麼 union 不能改成掃資料夾自動組出來：`z.discriminatedUnion` 吃的是一個
 * **元組**，`ConfigDoc = z.infer<…>` 的精度完全來自它（`config.ts` 自己記著一次
 * 「ConfigDoc 型別不夠準 ⇒ 一個永遠 false 的死比對」）。⇒ 表手寫，代價由這裡擋。
 *
 * ⭐ **兩個推導源，⛔ 不是一個**（GH#558 ③，2026-08-27 補上第二個）：
 *   ① **原始碼** —— `schema/` 樹裡宣告了 `config.*@1` 的每一個檔（開了 schema 忘了掛 union）
 *   ② ⭐ **出貨內容** —— `content/config/*.json` 每一份文件的 `schema` tag
 *      （內容已經上線，而這個映像的 union 不認得它 ⇒ 整包內容被拒 ⇒ 骨架英雄）
 * ⚠️ ① 救不了 ②：一份新的內容 JSON 不必在 `schema/` 底下留下任何痕跡，
 *    就能在部署之後把整包內容帶走。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zConfigDoc } from "./index";

const DIR = dirname(fileURLToPath(import.meta.url));
/**
 * ⛔⛔ **掃的是整個 `schema/` 樹，⛔ 不是只有 `schema/config/` 這一層。**
 *
 * ⚠️ 這一條在 2026-08-23 之前只 `readdirSync(DIR)`（＝這個測試自己的資料夾），
 * 而實測 **上一層 `schema/` 有 17 個檔宣告了 18 個 `config.*@1`**：
 * `castApproachDoc` · `mitigationDoc` · `displacementDoc` · `mapSpecDoc` ·
 * `ownerKnobsDoc` · `rankingDoc` · `victoryPodium` · `vfx.ts`（兩個）⋯
 * ⇒ **在那一層新開一個檔而漏一行 union，這條閘一個字都不會說。**
 *
 * ⭐ CLAUDE.md 第〇·七守則自己記著這件事（「第 3 條是踩出來的」），
 * 而它記的正是**這一支** —— 那段散文寫下之後，閘本身沒有跟著改。
 * 後果是 2026-08-02 那四小時：union 漏一員 ⇒ `zConfigDoc` 拒絕整份文件
 * ⇒ 內容驗證失敗 ⇒ fail-open 退回 2 隻骨架 ⇒ **選人畫面空掉而網站看起來完全正常**。
 */
const ROOT = join(DIR, "..");
const TAG = /z\.literal\("(config[^"]*)"\)/g;

/** `schema/` 樹（含子資料夾）裡每一個宣告了 `config.*@1` 標籤的檔 → 它宣告的標籤。 */
function tagsOnDisk(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (dir: string, prefix: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(join(dir, e.name), rel);
        continue;
      }
      if (!e.name.endsWith(".ts") || e.name.endsWith(".test.ts") || e.name === "index.ts") continue;
      const tags = [...readFileSync(join(dir, e.name), "utf8").matchAll(TAG)].map((m) => m[1]!);
      if (tags.length) out.set(rel, [...new Set(tags)]);
    }
  };
  walk(ROOT, "");
  return out;
}

const unionTags = zConfigDoc.options.map((o) => o.shape.schema.value as string);

/**
 * ⭐⭐ GH#558 ③ —— **第二個推導源：出貨的內容。**
 *
 * 上面那一段掃的是**原始碼**（`schema/` 樹裡誰宣告了 `config.*@1`）。它答得出
 * 「有人開了一份 schema 卻忘了掛 union」，⛔ 但它答不出反方向：
 * **`content/config/` 裡躺著一份文件，而這個映像的 union 根本不認得它的 tag。**
 *
 * ⚠️ 反方向才是 2026-08-02 線上壞掉四小時的形狀，而它在 v0.24.8 前夕又發生一次
 * （#557）：`zConfigDoc` 拒絕整份文件 → ContentLoader 驗證失敗 → `main.tsx`
 * fail-open 註冊 2 隻骨架 → 選人畫面空掉，**而網站看起來完全正常**。
 *
 * ⭐ CLAUDE.md 第〇·七守則的拆檔第 3 條逐字寫著「閘要從**出貨的東西**推導，
 * ⛔ 不是掃資料夾」—— 而在 2026-08-27 之前，這一支**兩個方向都在掃檔案**。
 * 掃原始碼救不了「未追蹤／新加的內容文件」那一半：那份 JSON 不必在 `schema/`
 * 底下留下任何痕跡，就能在部署後把整包內容帶走。
 */
const CONTENT_CONFIG_DIR = join(DIR, "../../../../../../content/config");

/** `content/config/*.json` 每一份出貨文件宣告的 `schema` tag（`_` 開頭的是索引，不是文件）。 */
function shippedConfigTags(): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of readdirSync(CONTENT_CONFIG_DIR).sort()) {
    if (!name.endsWith(".json") || name.startsWith("_")) continue;
    const raw: unknown = JSON.parse(readFileSync(join(CONTENT_CONFIG_DIR, name), "utf8"));
    const tag = (raw as { schema?: unknown }).schema;
    if (typeof tag === "string") out.set(name, tag);
  }
  return out;
}

describe("schema/ 樹裡的每一份 config schema 都在 zConfigDoc 的 union 裡", () => {
  it("★ 掃的是整個 schema/ 樹 —— 上一層那 17 個檔也算數", () => {
    const files = [...tagsOnDisk().keys()];
    // ⭐ 兩個方向都要有:子資料夾裡的（`x.ts`）與**上一層**的（`../` 那些,鍵不含斜線
    //    但也不在 config/ 底下 —— 這裡直接點名幾個已知住上一層的檔）。
    expect(files.some((f) => f.startsWith("config/")), "沒掃到 schema/config/ 底下").toBe(true);
    for (const known of ["mitigationDoc.ts", "ownerKnobsDoc.ts", "castApproachDoc.ts"]) {
      expect(
        files.includes(known),
        `${known} 宣告了 config.*@1 卻不在掃描結果裡 —— 閘又縮回單一資料夾了。` +
          "那正是 2026-08-02 事故的形狀（union 漏一員 ⇒ 內容整份失敗 ⇒ 骨架英雄）。",
      ).toBe(true);
    }
  });

  it("資料夾裡宣告的每一個 schema tag 都掛上了 union", () => {
    const orphans: string[] = [];
    for (const [file, tags] of tagsOnDisk()) {
      for (const t of tags) {
        if (!unionTags.includes(t)) orphans.push(`${file} 宣告了 ${t}，但 union 沒有它`);
      }
    }
    expect(
      orphans,
      `⛔ 這幾份 config 進不了線上：\n  ${orphans.join("\n  ")}\n` +
        "修法：在 config/index.ts 的 zConfigDoc union 裡加上它們（⛔ 不要改這條測試）。",
    ).toEqual([]);
  });

  it("一個 tag 只有一個住處，而且 union 沒有重複成員", () => {
    const seen = new Map<string, string>();
    for (const [file, tags] of tagsOnDisk()) {
      for (const t of tags) {
        expect(seen.has(t), `${t} 同時住在 ${seen.get(t)} 與 ${file}`).toBe(false);
        seen.set(t, file);
      }
    }
    expect(new Set(unionTags).size).toBe(unionTags.length);
  });

  /**
   * MUTATION LOG（第二守則 —— 真的跑過）:
   *   · `config/index.ts` 的 union 拔掉 `zConfigCombatEnvDoc` 那一行
   *       → 這一條紅，訊息指名 `combat-env.json` 與 `config.combat-env@1`。
   */
  it("⭐ 出貨內容裡的每一個 config schema tag，這個映像的 union 都認得", () => {
    const shipped = shippedConfigTags();
    // 量尺先自證：掃不到東西的「全過」與真的全過長得一模一樣。
    expect(shipped.size, `${CONTENT_CONFIG_DIR} 掃不到出貨的 config 文件`).toBeGreaterThan(50);
    const unknown: string[] = [];
    for (const [file, tag] of shipped) {
      if (!unionTags.includes(tag)) unknown.push(`content/config/${file} 的 schema="${tag}"`);
    }
    expect(
      unknown,
      `⛔ 這幾份**已經出貨**的內容，這個映像的 zConfigDoc 不認得：\n  ${unknown.join("\n  ")}\n` +
        "後果不是「這幾份被忽略」——是 zConfigDoc 拒絕整份文件 ⇒ 內容驗證整份失敗 ⇒ " +
        "fail-open 退回 2 隻骨架英雄 ⇒ 選人畫面空掉，而網站看起來完全正常" +
        "（2026-08-02 線上四小時 · #557 第二次）。\n" +
        "修法：在 config/index.ts 的 zConfigDoc union 補上它們（⛔ 不要改這條測試，" +
        "⛔ 也不要刪那份內容 —— 內容已經在線上了）。",
    ).toEqual([]);
  });

  it("⛔ 拆檔前的私有零件不可以被 index.ts 洩漏成公開名字", async () => {
    const surface = Object.keys(await import("../config"));
    expect(surface).not.toContain("zColorHex");
    expect(surface).not.toContain("zAudioAssetPath");
  });
});

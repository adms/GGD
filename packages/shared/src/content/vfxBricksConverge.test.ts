/**
 * ⭐⭐ 【特效做完了，有沒有收斂成積木】的閘（GH#916）。
 *
 * owner 2026-09-04（逐字，這條守衛的來源）：
 * > 「你可以把一堆特效家族有這個毛病都抓出來處理 —— **特效分析製作完沒有收斂成果變成積木重複使用**」
 * > 「我們之前花了許多時間做了很多類似的票，是否也可以請你參考，**沒有收斂結果最後變成是積木**？」
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ⭐ 根因：產生端「加法且無義務」 × 唯一的可達性閘只走一條窄路
 * ════════════════════════════════════════════════════════════════════════
 * ① `apps/client/scripts/gen-w3x-families.ts:9-14` 逐字：
 *    「**ADDITIVE, ALWAYS.** Nothing under `content/vfx/` is deleted or rewritten
 *      … the 282 `godie-*` extractor docs **stay exactly as they are**」
 *    `tools/w3x-import/extract_particles.py:1005` **沒有任何 skip/retire 清單**
 *    ⇒ 「一顆 mdx 有幾個 emitter 就生幾份 `vfx@1`」，
 *    ⭐ 而「**誰要播它**」在產生的那一刻**不是一個欄位** ⇒ 它不是任何東西的前提。
 *
 * ② 既有的 `stockEmittersReachable.test.ts` 是本 repo **唯一**問「這顆 emitter 有沒有
 *    人播得到」的守衛 —— ⛔ 而它的母體逐字是 `f.startsWith("fx.w3x.stock.")`
 *    ⇒ ⭐ **282 份 `godie-*` 與全部 `fx.prim.*` 在結構上進不了它**（失敗形態⑫：只從一頭走）。
 *
 * ⇒ ⭐⭐ 「做完了沒接線」正好落在**兩者之間**：產生端沒有義務收斂，而唯一該喊的那把尺
 *    量的是另一個分母。⚠️ 於是每一次特效分析都留下一批沒有人播的檔，而**沒有東西會紅**。
 *
 * ── ⚠️ 而 `ggd-brick-census.json` 的 `unusedEngineFamilies: 0` 不是它的錯 ──────────
 * `tools/brick-census/gen.ts:234` 問的是「有沒有**模板**宣告這個 family」，
 * ⛔ 完全不看 vfx 文件有沒有人用 ⇒ ⭐ 那個 0 是**真的**，只是它量的不是這件事。
 * （CLAUDE.md：「一個看起來已經量過的東西，量的不是你以為的那個」。）
 *
 * ── ⭐ 這條閘問的是一個**關係**，⛔ 不是一個名詞 ──────────────────────────────
 * > 「每一份出貨的 vfx 文件，是不是要嘛**有人播得到它**，
 * >   要嘛**有一句還成立的話說明為什麼沒有**？」
 *
 * ⭐ 五類，恰好一類：
 *  ① `wired`              —— 被出貨消費欄位引用
 *  ② `surplus`            —— 同族至少一份 wired（⭐ 逐家族判定：一顆 mdx 的 20 顆 emitter
 *                            共同組成一個效果，⛔ 逐片要求引用是錯的分母）
 *  ③ `superseded`         —— 繼任者存在**且** wired
 *  ④ `engine-banned`      —— 帶 `reason` ＋ 指到禁令的 `檔:行`
 *  ⑤ `awaiting-mechanism` —— 帶 `blockedBy` 票號，⭐ 而那張票必須是 OPEN
 *  ⛔ 都不是 ⇒ **紅**。
 *
 * ── ⭐ 棘輪（⛔ 不是一次要求 139 份全部歸類）────────────────────────────────
 * 2026-09-04 的存量是 **139 份**。⇒ 閘對存量寬容、對**新增**嚴格：
 * ⭐ 新增一份沒有人播的 vfx ⇒ **當場紅**；而存量只能變少。
 * ⛔ 把新 id 加進 backlog 讓閘變綠 ＝ 這條閘要防的東西本身 —— 見下面的反向斷言。
 *
 * ── ⚠️ 它擋不住什麼（⛔ 誠實）────────────────────────────────────────────
 * · `wired` ≠ **玩家看得到**：一份被引用的文件仍可以是零亮像素
 *   （那是 `vfxDocsBirthVisibility.test.ts` 與 audition 的責任）
 * · `wired` ≠ **玩家碰得到**：引用它的技能可能屬於一位**下架**英雄
 * · `reason` 欄位本身會說謊 —— ⭐ 這條閘只驗「**有沒有**理由」與「**票是不是 OPEN**」，
 *   ⛔ 驗不了「這個理由今天還成不成立」
 *
 * MUTATION LOG（落地前實跑，見 commit 訊息）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT = join(REPO, "content");
const VFX_DIR = join(CONTENT, "vfx");
// ⚠️ ⭐ 刻意**不放 `content/config/`** —— 那個目錄的每一份都要落三個住處
//   （Zod union ＋ admin `SHIPPED_*`），而 `configUnionCoversDirectory` 是
//   CLAUDE.md 記過**差點造成線上事故**的那條閘。⭐ 這一份是**歸類帳本**，
//   ⛔ 不是一格後台可調的設定 ⇒ 它住 `content/assets/`（與 `w3x-families.json` 同層）。
const DISPOSITION = join(CONTENT, "assets/vfx/vfx-disposition.json");

/** ⭐ 家族名 ＝ 剝掉分片／尺寸／rN 後綴。⛔ 逐片判定是錯的分母（一顆 mdx 的 N 顆 emitter 是一個效果）。 */
const familyOf = (id: string): string => id.replace(/[.\-](p\d\d?|r\d|s\d+)$/, "");

const vfxIds = (): string[] =>
  readdirSync(VFX_DIR)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => f.slice(0, -5));

/**
 * ⭐ 出貨的**消費面**：哪些檔可能引用一份 vfx。
 * ⚠️ 刻意含 `content/models`（`model@1.fxEmitters`）與 `content/assets/vfx`
 * （`w3x-families.json` 的 `ribbonDocIds` / `supersedes`）——
 * ⛔ 少了它們會把「其實有人宣告」誤判成孤兒。
 */
function consumerBlob(): string {
  const dirs = [
    "abilities",
    "champions",
    "items",
    "augments",
    "config",
    "vfx-scripts",
    "vfx-subtypes", // GH#990：8 支腳本改成 {call} 段之後，vfxId 住在被呼叫的子模組裡
    "ability-templates",
    "status-effects",
    "models",
    "assets/vfx",
  ];
  const parts: string[] = [];
  for (const d of dirs) {
    const abs = join(CONTENT, d);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (!f.endsWith(".json")) continue;
      // ⛔ 跳過 vfx 自己的索引與打包產物 —— 它們提到每一個 id，會讓全部變成 wired
      if (f === "_index.json") continue;
      try {
        parts.push(readFileSync(join(abs, f), "utf8"));
      } catch {
        /* 讀不到就跳過 —— 下面的 sentinel 會抓到掃描器整個瞎掉 */
      }
    }
  }
  return parts.join("\n");
}

interface Disposition {
  backlog?: string[];
  entries?: Record<string, { bucket?: string; reason?: string; blockedBy?: string; supersededBy?: string }>;
}

const disposition = (): Disposition => JSON.parse(readFileSync(DISPOSITION, "utf8")) as Disposition;

/** 三個桶的分類結果（⛔ backlog 不算分類 —— 它是存量）。 */
function classify(): { wired: string[]; surplus: string[]; declared: string[]; unclassified: string[] } {
  const ids = vfxIds();
  const blob = consumerBlob();
  const d = disposition();
  const entries = d.entries ?? {};
  const backlog = new Set(d.backlog ?? []);

  const wired = ids.filter((v) => blob.includes(`"${v}"`));
  const wiredFams = new Set(wired.map(familyOf));
  const surplus = ids.filter((v) => !wired.includes(v) && wiredFams.has(familyOf(v)));
  const declared = ids.filter(
    (v) => !wired.includes(v) && !surplus.includes(v) && entries[v] !== undefined,
  );
  const unclassified = ids.filter(
    (v) => !wired.includes(v) && !surplus.includes(v) && entries[v] === undefined && !backlog.has(v),
  );
  return { wired, surplus, declared, unclassified };
}

describe("特效有沒有收斂成積木（GH#916）", () => {
  it("⭐ 量尺先自證：掃描器真的讀得到出貨內容", () => {
    const ids = vfxIds();
    expect(ids.length, "⛔ 掃不到 content/vfx —— 掃描器壞了，⛔ 不是真的沒有特效").toBeGreaterThan(100);
    const blob = consumerBlob();
    expect(
      blob.length,
      "⛔ 消費面掃描回空的 —— ⭐ 那會讓**每一份** vfx 看起來都沒人用（一個對每個都喊的閘）",
    ).toBeGreaterThan(100_000);

    // ⭐ 反方向：已知**有人用**的那一份要被判 wired，⛔ 否則 `wired` 這一類是空的
    const { wired } = classify();
    expect(wired.length, "⛔ 一份 wired 都沒有 ⇒ 判準壞了").toBeGreaterThan(100);
  });

  it("★★ ⭐⭐ 每一份出貨 vfx 都要**有人播得到**，或**有一句話說明為什麼沒有**", () => {
    const { unclassified, wired, surplus, declared } = classify();

    expect(
      unclassified.slice(0, 20),
      [
        `⛔⛔ 這 ${unclassified.length} 份 vfx **沒有人播得到，也沒有任何一句話說明為什麼**。`,
        "",
        "⭐ 這正是 owner 說的「特效分析製作完**沒有收斂成果變成積木重複使用**」——",
        "  而在這條閘之前，它**不會有任何東西紅**（見本檔檔頭的兩段根因）。",
        "",
        "⭐ 誰寫了它們（動手前先確認，⛔ 不要直接刪 `content/vfx/`）：",
        "  · `godie-*`  ⇒ `tools/w3x-import/extract_particles.py`（⚠️ **預設直接寫進 content/vfx**）",
        "  · `fx.w3x.*` ⇒ `apps/client/scripts/gen-w3x-families.ts`",
        "  ⚠️ `bash scripts/genguard.sh content/vfx/<檔>` 對這兩支會回「沒有擁有者」——",
        "     ⭐ 那正是它自己訊息裡警告的**假陰性**（「上游來源仍然可能存在」）。",
        "",
        "⇒ ⭐ 四條出路，挑一條填進 `content/assets/vfx/vfx-disposition.json` 的 `entries`：",
        '  ① 接線 ⇒ 讓某支技能／模板／config 真的引用它（⭐ 最好的一條）',
        '  ② `{ "bucket": "engine-banned", "reason": "<檔:行> 逐字禁令" }`',
        '  ③ `{ "bucket": "awaiting-mechanism", "blockedBy": "#<票號>" }` ⭐ 票必須 OPEN',
        '  ④ `{ "bucket": "superseded", "supersededBy": "<繼任者 id>" }` ⭐ 繼任者要 wired',
        "",
        `（今天：wired ${wired.length} · surplus ${surplus.length} · 已宣告 ${declared.length}）`,
      ].join("\n"),
    ).toEqual([]);
  });

  it("★★ ⭐ 反向：`backlog` 只能變短，⛔ 而且不可以拿來裝新的 id", () => {
    const d = disposition();
    const backlog = d.backlog ?? [];
    const BASELINE = 139; // ⭐ 2026-09-04 量到的存量。⛔ 只能往下改。

    expect(
      backlog.length,
      [
        `⛔⛔ backlog 從 ${BASELINE} 變成 ${backlog.length} —— ⭐ 它**只能變短**。`,
        "",
        "⚠️ 把一份新的、沒有人播的 vfx 加進 backlog 讓閘變綠 ——",
        "  ⭐ 那正是這條閘要防的行為本身（「做完了，登記一下，然後沒有人再回來看」）。",
        "⇒ 新的東西要走 `entries` 的四條出路之一，⛔ 不是 backlog。",
        "",
        "⭐ 而如果你**真的**清掉了存量：把上面的 BASELINE 改成新的數字，",
        "  並在 commit 訊息裡說清楚清掉的是哪幾族、走的是哪一條出路。",
      ].join("\n"),
    ).toBeLessThanOrEqual(BASELINE);

    // ⭐ 存量裡的每一個 id 都要真的在磁碟上 —— ⛔ 擋掉「懸空宣告」
    const onDisk = new Set(vfxIds());
    expect(
      backlog.filter((v) => !onDisk.has(v)).slice(0, 10),
      "⛔ backlog 指向不存在的 vfx ⇒ ⭐ 那是一句在防一個不存在的東西的話（幽靈列）",
    ).toEqual([]);
  });

  it("★ ⭐ 宣告過的那些，理由要**指得到東西**（⛔ 不是一句話就算）", () => {
    const d = disposition();
    const entries = Object.entries(d.entries ?? {});
    const bad: string[] = [];
    for (const [id, e] of entries) {
      const b = e.bucket;
      if (b === "engine-banned" && !/[\w./-]+\.\w+:\d+/.test(e.reason ?? "")) {
        bad.push(`${id}: engine-banned 的 reason 要含 \`檔:行\``);
      }
      if (b === "awaiting-mechanism" && !/^#\d+$/.test(e.blockedBy ?? "")) {
        bad.push(`${id}: awaiting-mechanism 要帶 \`blockedBy: "#<票號>"\``);
      }
      if (b === "superseded" && (e.supersededBy ?? "") === "") {
        bad.push(`${id}: superseded 要指名繼任者`);
      }
      if (b !== undefined && !["engine-banned", "awaiting-mechanism", "superseded"].includes(b)) {
        bad.push(`${id}: 不認得的 bucket \`${b}\``);
      }
    }
    expect(
      bad.slice(0, 10),
      "⛔ 這幾列的理由**指不到東西** —— ⭐ 一個引用不到出處的理由，與沒有理由沒有差別。",
    ).toEqual([]);
  });
});

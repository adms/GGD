/**
 * ⭐【回血/回魔的離群值要說得出出處】—— GH#766（接手 #177）。
 *
 * `content/config/stat-caps.json` 的 `healthRegen 1366` / `manaRegen 1711` 是**防
 * mis-parse 的柵欄**，⛔ 不是平衡上限：出貨最極端的一位是 12（`godie-huth`），
 * 餘裕約 **106 倍** ⇒ 那兩格逐位元等於不存在。#177 關票時把「欄位存在」讀成
 * 「上限已補」—— 第一·五守則點名的形狀（同 `ad` 的 cap 21200）。
 *
 * ⛔ 這一條**不**主張任何一位的回血該是多少 —— 那是平衡數值，是 owner 的旋鈕
 *    （owner 2026-08-22:「不要再叫我調整了，公式已定好⋯我們只調系統倍率」）。
 * ⭐ 它主張的是：**每一個離群值都要說得出它從哪裡來，而那個出處必須可以被反駁。**
 *    今天的 8 位全部指得到一個具體來源（原作地圖的某一格 / owner 的某一則裁決 /
 *    GGD 原創）。哪一天有人靜靜地把一個數字改掉，它就落不進任何一列 ⇒ 紅。
 *
 * ⭐ 兩個方向都走（失敗形態⑫）：
 *   ① 從**出貨資料**走 —— 誰不合地圖、誰離群 ⇒ 必須在 `REGEN_ORIGIN` 裡
 *   ② 從**表**走 —— 已經不離群也不失配的列 ⇒ 過期，只能變短
 *
 * ⛔ 中位數**現算**（第〇·四守則：⛔ 不把 0.25 / 0.1 烘進任何檔案 —— 名冊一動它就過期）。
 * ⛔ 讀磁碟上出貨的那份 champion JSON 與原作物件表，⛔ 不掃原始碼字串（失敗形態⑥）。
 *
 * 突變紀錄：把 `godie-huth` 從 `REGEN_ORIGIN` 拿掉 ⇒ 第一條紅並逐字指名
 *   「godie-huth ... healthRegen=12 ... 中位數 0.25 的 48×」。
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const CHAMPIONS = join(REPO, "content/champions");

/**
 * 「離群」的門檻 —— **中位數的幾倍**。
 *
 * ⛔ 這**不是**出貨值（它不住在 `content/config/`，也改變不了任何一場比賽）——
 * 它只決定「誰要在下面那張表裡寫一行出處」。⭐ 10× 是量出來的：出貨母體在
 * `healthRegen` 上 10× 以上剩 2 位、`manaRegen` 上剩 7 位，⇒ 一張讀得完的表；
 * 放寬到 5× 只多抓進兩位 2.5（同樣忠於地圖），對「說得出出處」這件事零增益。
 */
const OUTLIER_K = 10;

/**
 * 離群值的出處。⭐ 每一列都要指得到一個**可以被反駁**的東西
 * （地圖的某一格 / owner 的某一則裁決 / 一個 `source` 欄位），
 * ⛔ 不是「還沒查」也不是「本來就這樣」。
 */
const REGEN_ORIGIN: Readonly<Record<string, string>> = {
  // ── 忠於原作地圖（OBJECTS.json 的 heroes 那一節，逐位元組相符）──────────────
  "godie-huth": "魔人普烏 — 地圖 `Huth.hp_regen = 12.0`；匯入器原封抄，⛔ 沒有換算",
  "godie-u00k": "死之王 — 地圖 `U00K.hp_regen = 8.0` / `mana_regen = 3.0`",
  "godie-h020": "莉娜因巴斯 — 地圖 `H020.mana_regen = 1000.0`（maxMana 5000 ⇒ 5 秒回滿，原作就是這樣的法師）",
  // ── owner 2026-07-26 的平衡裁決（commit 79704a0f3）：實測被榨乾的七位 +2 ─────
  // 「5 場真對戰 113,640 個 champion-tick」⇒ 地圖值 0.1 + 2 = 2.1。
  // ⛔ 這四位與地圖不符是**刻意的**，⛔ 不是匯入錯誤。
  "godie-emns": "夜神月 — owner 2026-07-26 裁決 `79704a0f3`（48.6% 時間低於半魔 ⇒ 0.1 + 2）",
  "godie-osam": "殺生丸 — owner 2026-07-26 裁決 `79704a0f3`（60.7% ⇒ 0.1 + 2）",
  "godie-udre": "索隆 — owner 2026-07-26 裁決 `79704a0f3`（~59% ⇒ 0.1 + 2）",
  "godie-u01u": "索隆（武裝色霸氣變身態）— 同 `godie-udre` 的那一則裁決",
  // ── GGD 原創，⛔ 不在 w3x 母體 ──────────────────────────────────────────────
  "godie-zombiex": "喪標麥可 — `attributes.source: authored`（GGD 原創），地圖裡沒有這個 rawcode",
};

interface Doc {
  id: string;
  name?: string;
  attributes?: { source?: string };
  baseStats?: Record<string, unknown>;
}
interface MapUnit {
  hp_regen?: number | null;
  mana_regen?: number | null;
}

const docs: Doc[] = readdirSync(CHAMPIONS)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(CHAMPIONS, f), "utf8")) as Doc)
  .filter((d) => typeof d.id === "string" && d.baseStats !== undefined)
  .sort((a, b) => a.id.localeCompare(b.id));

/** 原作物件表 —— 「這個數字是不是地圖自己的」唯一的答案。 */
const objects = JSON.parse(
  readFileSync(join(REPO, "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json"), "utf8"),
) as Record<string, Record<string, MapUnit>>;
const byRawcode = new Map<string, MapUnit>();
for (const section of Object.values(objects)) {
  if (section === null || typeof section !== "object") continue;
  for (const [code, unit] of Object.entries(section)) {
    if (unit !== null && typeof unit === "object" && !byRawcode.has(code.toLowerCase()))
      byRawcode.set(code.toLowerCase(), unit);
  }
}

const FIELDS = [
  { stat: "healthRegen", mapKey: "hp_regen" },
  { stat: "manaRegen", mapKey: "mana_regen" },
] as const;

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/** 這一位這一格為什麼**需要**一行出處 —— 回傳理由，不需要就回 undefined。 */
function needsOrigin(d: Doc, mid: Record<string, number>): string[] {
  const why: string[] = [];
  const rawcode = d.id.startsWith("godie-") ? d.id.slice("godie-".length).toLowerCase() : undefined;
  const unit = rawcode === undefined ? undefined : byRawcode.get(rawcode);
  for (const { stat, mapKey } of FIELDS) {
    const have = num(d.baseStats?.[stat]);
    if (have === undefined) continue;
    const want = num(unit?.[mapKey]);
    const m = mid[stat] as number;
    if (d.attributes?.source === "w3x" && want !== undefined && Math.abs(have - want) > 1e-6)
      why.push(`${stat}=${have} ⛔ 不合原作地圖的 ${want}`);
    else if (m > 0 && have > m * OUTLIER_K)
      why.push(`${stat}=${have} —— 現算中位數 ${m} 的 ${Math.round((have / m) * 10) / 10}×`);
  }
  return why;
}

const mid = Object.fromEntries(
  FIELDS.map(({ stat }) => [stat, median(docs.map((d) => num(d.baseStats?.[stat])).filter((v): v is number => v !== undefined))]),
) as Record<string, number>;
const flagged = new Map<string, string[]>();
for (const d of docs) {
  const why = needsOrigin(d, mid);
  if (why.length > 0) flagged.set(d.id, why);
}

describe("回血/回魔的離群值 (GH#766) — 每一個都要說得出出處", () => {
  it("量尺自證：真的讀到了出貨母體與原作物件表", () => {
    // ⛔ 一個空掃描與一個全過的掃描長得一模一樣（失敗形態⑫）。
    expect(docs.length, "content/champions 一份都沒讀到").toBeGreaterThan(0);
    expect(
      docs.filter((d) => byRawcode.has(d.id.replace(/^godie-/, "").toLowerCase())).length,
      "沒有任何一位對得上原作 rawcode ⇒ join key 壞了,下面兩條都是空的",
    ).toBeGreaterThan(0);
    for (const { stat } of FIELDS) expect(mid[stat], `${stat} 的現算中位數是 0`).toBeGreaterThan(0);
  });

  it("不合地圖、或超過現算中位數的倍數 ⇒ 必須在 REGEN_ORIGIN 裡帶一個出處", () => {
    const unexplained = [...flagged]
      .filter(([id]) => !(id in REGEN_ORIGIN))
      .map(([id, why]) => `${id} (${docs.find((d) => d.id === id)?.name ?? "?"}): ${why.join(" · ")}`);
    expect(
      unexplained,
      [
        "",
        `${unexplained.length} 位的回血/回魔說不出出處 ——`,
        `門檻：中位數的 ${OUTLIER_K}×（現算：${FIELDS.map(({ stat }) => `${stat} ${mid[stat]}`).join(" · ")}）`,
        "⭐ 去查它從哪裡來(原作地圖的哪一格 / owner 的哪一則裁決),把那一行寫進 REGEN_ORIGIN。",
        "⛔ 不要為了讓它變綠而改那個出貨數字 —— 平衡是 owner 的旋鈕。",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  it("出處表只能變短：不再離群、也不再失配的那一列要刪掉", () => {
    const stale = Object.keys(REGEN_ORIGIN)
      .filter((id) => !flagged.has(id))
      .map((id) =>
        docs.some((d) => d.id === id)
          ? `${id}: 已經不離群也不失配了 ⇒ 刪這一列`
          : `${id}: 這位英雄已經不存在 ⇒ 刪這一列`,
      );
    expect(stale, "出處表過期 —— 它是棘輪,只能變短").toEqual([]);
  });
});

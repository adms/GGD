/**
 * ⭐⭐ GH#841 Scope④ —— 「修完**重跑產線**」照字面做會**毀資料**。
 *
 * ── 2026-08-31 量到（⛔ 不是推測）─────────────────────────────────────────
 * `python3 tools/w3x-import/import_w3x.py GoDieEX22s.w3x --no-content --out <暫存>`
 * 產出 129 份 glb，與出貨樹逐份比對：
 *
 * | 方向 | 份數 | 是什麼 |
 * |---|---:|---|
 * | primitive **變多** | 16 | ⭐ `has_opaque_base` 一票否決被拿掉 ⇒ 疊加層回來了（票要的） |
 * | primitive **變少** | 10 | ⛔ **掉 `TeamGlow0`/`TeamGlow1`**（bahamut · billy · goku · herocloudstrife · heroeva01s2 · heropika · heroraichus3 …）＋ `bladestorm-swordeffect` 掉 `mat0/1/2` |
 * | 只有 alphaMode 變 | 15 | MASK→OPAQUE 等 |
 *
 * ⇒ ⭐ **出貨樹帶著轉檔器重現不出來的東西。**
 * ⛔ 「重跑一次就好」是 CLAUDE.md 記過的形狀：
 * 「**『同步之後兩邊一致』不是成功的證據** —— 它也是資料被同一個錯誤覆蓋兩次的樣子」。
 *
 * ── 這條閘擋什麼 ─────────────────────────────────────────────────────────
 * ⭐ **棘輪，只能變多。** 下一個人（包括下一輪的我）跑 `import_w3x.py` 覆蓋出貨樹時，
 * TeamGlow 材質從 12 掉到 4 ⇒ **這條紅**，訊息指名該回頭做的事。
 * ⛔ 它擋不住「材質還在但畫錯」——那是 `mdxFilterModeContract` 的事。
 *
 * MUTATION LOG：
 *   · 把 `content/assets/models/imported/billy.glb` 換成暫存區重跑的那一份
 *       → 「TeamGlow 材質數只能變多」紅並指名 billy
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(__dirname, "../../../../content/assets/models/imported");

/** 一份 .glb 的 JSON chunk 裡，名字以 `TeamGlow` 開頭的材質數。 */
function teamGlowCount(path: string): number {
  const raw = readFileSync(path);
  if (raw.subarray(0, 4).toString("latin1") !== "glTF") return 0;
  const jsonLen = raw.readUInt32LE(12);
  const g = JSON.parse(raw.subarray(20, 20 + jsonLen).toString("utf8")) as {
    materials?: { name?: string }[];
  };
  return (g.materials ?? []).filter((m) => String(m.name ?? "").startsWith("TeamGlow")).length;
}

/**
 * ⭐ 棘輪基準線 —— 2026-08-31 量到的出貨值。**只能變多。**
 * ⛔ 它變小時**不要改這個數字** —— 去看是不是有人用裸的 `import_w3x.py` 覆蓋了出貨樹。
 */
const BASELINE_TEAM_GLOW = 12;

describe("GH#841 重跑產線不可以掉隊伍色（棘輪）", () => {
  it("量尺先自證：讀得到 glb 的材質名（⛔ 讀不到會讓下面永遠是 0 == 0）", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".glb"));
    expect(files.length, "⛔ 一份 glb 都沒讀到 ⇒ 路徑錯了").toBeGreaterThan(200);
    // ⭐ 已知**有**的那一份要量得到（⛔ 單邊校準的尺在它最該說話時會沉默）
    expect(teamGlowCount(resolve(DIR, "billy.glb"))).toBeGreaterThan(0);
  });

  it("★ ⭐ **TeamGlow 材質只能變多**（裸的 `import_w3x.py` 覆蓋會讓它掉到 4）", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".glb"));
    const per = files.map((f) => [f, teamGlowCount(resolve(DIR, f))] as const);
    const total = per.reduce((n, [, c]) => n + c, 0);
    const lost = per.filter(([, c]) => c === 0).length;
    expect(
      total,
      `⛔ 隊伍色材質從 ${BASELINE_TEAM_GLOW} 掉到 ${total}（${lost} 份沒有）。\n` +
        `⭐ 最可能的原因：有人跑了裸的 \`import_w3x.py\` 覆蓋出貨樹 —— ` +
        `2026-08-31 量過，那會讓 10 份掉 TeamGlow（bahamut · billy · goku · ` +
        `herocloudstrife · heroeva01s2 · heropika · heroraichus3 …）。\n` +
        `⛔ **不要改這裡的基準線** —— 去把那幾份還原（\`git checkout\` 那幾個檔），` +
        `然後在 GH#841 記下「重跑產線需要哪一步後處理」。`,
    ).toBeGreaterThanOrEqual(BASELINE_TEAM_GLOW);
  });
});

/**
 * L3 · 出貨的 `_lod.json` 真的能省到嗎(model-lod-shipped)。
 *
 * ── 為什麼 `modelLod.test.ts` 不夠 ──────────────────────────────────────────
 * 那一支的 24 條全部餵**自己手寫的 manifest**。純函式對了，但 CLAUDE.md 失敗形態
 * ⑤ 講的就是這個:「被測的不是出貨的那個」。玩家下載的是
 * `content/assets/models/_lod.json` 加上磁碟上真的那些檔案,而在這一支寫出來之前
 * **沒有任何一條測試讀過它們**。
 *
 * 這一支只讀出貨資料 + 出貨的 `resolveLodPath`,而且量的是「能不能用」不是
 * 「在不在」——「每一列都有 mid 和 small」會全綠,但它對下面這個真缺陷是瞎的。
 *
 * ── 2026-07-31 量到的真缺陷 ─────────────────────────────────────────────────
 * 出貨 manifest(generatedAt 2026-07-26)有三列的「便宜版」**比本尊還大**:
 *   · imported/collision.glb           1,148 B → mid 1,164 B / small 1,164 B
 *   · imported/heroshanawingsmall.glb 28,292 B → mid 28,384 B
 * 兩支都在 `gen_lod.py` 自己的 LOD 地板以下(tris<1500 且 bytes<64KB),是地板生效
 * 前留下來的陳舊列 —— 正是 `modelLod.ts` 檔頭警告的那個 hazard。舊的 resolver
 * 無條件換過去,所以 LOW / MEDIUM 兩個 preset 下載的位元組**比 HIGH 還多**。
 * 而 `autoDetectPreset` 把一般手機放在 "medium",所以吃虧的正好是這套機制存在的
 * 理由本身。
 *
 * 修 `content/` 那三列是修今天;`cheaperPath` 修的是這個「類」。這一支同時釘住
 * 兩件事:資料要一致(路徑存在、位元組數不說謊),行為要單調(換過去只會更小)。
 *
 * ── 突變驗證(2026-07-31) ────────────────────────────────────────────────────
 * · `cheaperPath` 的 `return t.bytes < entry.bytes ? t.path : null;` 改成
 *   `return t.path;` → 「換過去的檔案永遠不會比本尊大」紅,3 個 tier 被點名
 *   (collision mid/small、heroshanawingsmall mid)。
 * · 同一行改成 `t.bytes <= entry.bytes` → 同一條紅(collision 兩個 tier 相等…
 *   實際上是更大,所以仍然紅);為了證明相等也擋,`resolveLodPath` 的單元測試
 *   另外釘了 tie 的情形。
 * · `cheaperPath` 的 `typeof … !== "number"` fail-open 那一行改成 `return null`
 *   → 「沒有位元組數的 tier 仍然照舊換」紅(見 modelLod.test.ts)。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveLodPath, type LodManifest, type ModelLodTier } from "./modelLod";

/** repo-root-relative `content/` — this test reads SHIPPING data, not a fixture. */
const CONTENT = fileURLToPath(new URL("../../../../content/", import.meta.url));

const MANIFEST = JSON.parse(
  readFileSync(`${CONTENT}assets/models/_lod.json`, "utf8"),
) as LodManifest;

/** Real on-disk size of a content-relative path, or null when it does not exist. */
function realBytes(rel: string): number | null {
  try {
    return statSync(CONTENT + rel).size;
  } catch {
    return null;
  }
}

const ROWS = Object.entries(MANIFEST.models);
const TIERS = ["mid", "small"] as const;

describe("L3 · 出貨的 _lod.json 本身是自洽的", () => {
  it("有內容 —— 空 manifest 會讓下面每一條都真空通過", () => {
    expect(ROWS.length).toBeGreaterThan(50);
  });

  it("每一列的本尊檔案都真的在磁碟上", () => {
    const missing = ROWS.filter(([p]) => realBytes(p) === null).map(([p]) => p);
    expect(missing, "manifest 指到不存在的本尊 —— high preset 會 404").toEqual([]);
  });

  it("每一個宣告出來的 tier 檔案都真的在磁碟上", () => {
    // 這是 modelLod.ts 檔頭點名的那個災難:陳舊的列只在 LOW/MEDIUM 404,
    // `loadUncached` 把它吞掉,手機玩家永遠卡在程序化替身,而 HIGH 看起來完美。
    const missing: string[] = [];
    for (const [, entry] of ROWS) {
      for (const t of TIERS) {
        const e = entry[t];
        if (e && realBytes(e.path) === null) missing.push(e.path);
      }
    }
    expect(missing, "宣告了但檔案不在 —— 只有手機會 404,而且是靜默的").toEqual([]);
  });

  it("宣告的位元組數就是磁碟上的位元組數", () => {
    // `cheaperPath` 拿 manifest 的 `bytes` 當證據。證據要是假的,它擋不住任何東西
    // (失敗形態④:斷言方向跟缺陷無關)。
    const lying: string[] = [];
    for (const [p, entry] of ROWS) {
      const real = realBytes(p);
      if (entry.bytes !== undefined && real !== null && entry.bytes !== real) {
        lying.push(`${p}: 宣告 ${entry.bytes} 實際 ${real}`);
      }
      for (const t of TIERS) {
        const e = entry[t];
        if (!e) continue;
        const rt = realBytes(e.path);
        if (e.bytes !== undefined && rt !== null && e.bytes !== rt) {
          lying.push(`${e.path}: 宣告 ${e.bytes} 實際 ${rt}`);
        }
      }
    }
    expect(lying, "manifest 的位元組數在說謊 —— cheaperPath 的證據就失效了").toEqual([]);
  });
});

describe("L3 · 換過去一定要更省 —— 這是 LOD 唯一的賣點", () => {
  it.each<ModelLodTier>(["mid", "small"])(
    "%s preset:出貨的 resolveLodPath 解出來的檔案，永遠不比本尊大",
    (at) => {
      // ⚠️ 這裡量的是**磁碟上的真位元組**,不是 manifest 自己宣稱的數字,
      //    也不是「有沒有解出一個不同的路徑」(那是屬性,失敗形態⑦)。
      const worse: string[] = [];
      for (const [p] of ROWS) {
        const picked = resolveLodPath(p, at, MANIFEST);
        const base = realBytes(p);
        const got = realBytes(picked);
        expect(got, `${at} 解出了一個不存在的檔案:${picked}`).not.toBeNull();
        if (base !== null && got !== null && got > base) {
          worse.push(`${p} @${at} → ${picked} (${base} B → ${got} B)`);
        }
      }
      expect(
        worse,
        `這些 tier 比本尊還大 —— 低階 preset 下載得比高階多,LOD 反向作用`,
      ).toEqual([]);
    },
  );

  it("三列已知的壞資料確實被擋下來，而不是碰巧沒被選到", () => {
    // 沒有這一條,上面那兩條在「manifest 有一天被修好」之後就變成真空通過,
    // 而 `cheaperPath` 被刪掉也不會有人發現(失敗形態③)。
    // 這一條直接拿壞列去問 resolver,所以它守的是 RESOLVER 的行為。
    const KNOWN_BAD = [
      "assets/models/imported/collision.glb",
      "assets/models/imported/heroshanawingsmall.glb",
    ];
    const present = KNOWN_BAD.filter((p) => MANIFEST.models[p]);
    expect(
      present.length,
      "壞列已從 content/ 移除 —— 請把這一條改成合成 manifest，不要直接刪掉",
    ).toBeGreaterThan(0);

    for (const p of present) {
      const entry = MANIFEST.models[p]!;
      const base = realBytes(p)!;
      for (const t of TIERS) {
        const e = entry[t];
        if (!e) continue;
        const tierSize = realBytes(e.path)!;
        if (tierSize <= base) continue; // 這一個 tier 是好的
        // 這個 tier 更大 → resolver 必須拒絕它
        expect(
          resolveLodPath(p, t, MANIFEST),
          `${p} 的 ${t} 更大(${base} → ${tierSize})卻還是被換過去了`,
        ).not.toBe(e.path);
      }
    }
  });
});

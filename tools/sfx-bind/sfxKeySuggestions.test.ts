/**
 * ⭐【「技能 → 建議 sfxKey」那張表量的是**出貨的路由**】(GH#554②)
 *
 * 承重的那一條：`suggest_keys.py` 自己抄了一份元素風聲規則（`ELEMENT_CUES`），
 * 而出貨的那一份住 `apps/client/src/audio/combatSfx.ts`。⛔ 兩個住處必然分岔，
 * 而分岔的樣子是「表上說這 298 支落在通用池」而實際上不是 —— **一張說謊的普查表
 * 比沒有表更糟**（第三守則）。
 *
 * ⇒ 這裡 import **出貨的** `castElementKey` / `abilitySfxCueAllowed` 逐支重算 census，
 * ⛔ 不是掃字串（失敗形態⑥）、⛔ 也不是自己造夾具（失敗形態⑤）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { castElementKey } from "../../apps/client/src/audio/combatSfx";
import {
  abilitySfxCueAllowed,
  applyAbilitySfxCuesDoc,
} from "../../apps/client/src/audio/abilitySfxCues";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../..");
const readJson = (rel: string): any => JSON.parse(readFileSync(join(REPO, rel), "utf8"));

const TABLE = readJson("tools/sfx-bind/SUGGESTED_SFX_KEYS.json");
const SFX = readJson("content/config/audio-map.json").sfx as Record<string, unknown>;

describe("技能施法音建議表 (GH#554②)", () => {
  it("census 與**出貨的** combatSfx 路由逐支相符 —— ⛔ 不是產生器自己說的", () => {
    expect(applyAbilitySfxCuesDoc(readJson("content/audio-manifests/ability-sfx-cues.json"))).toBe(
      true,
    );
    const got = { overlay: 0, sfxKey: 0, element: 0, generic: 0 };
    for (const f of readdirSync(join(REPO, "content/abilities"))) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const doc = readJson(`content/abilities/${f}`);
      if (!doc?.id) continue;
      if (abilitySfxCueAllowed(doc.sfxKey)) got.sfxKey += 1;
      else if (castElementKey(doc.vfxKey)) got.element += 1;
      else got.generic += 1;
    }
    expect(got.generic, "沒有技能落在通用池 —— 這條在測空氣").toBeGreaterThan(0);
    expect(got).toEqual(TABLE.summary.census);
  });

  it("每一列 applicable 的建議都真的播得出來，而且沒有在建議「今天的行為」", () => {
    const applicable = TABLE.suggestions.filter((s: any) => s.applicable);
    expect(applicable.length, "沒有任何可套用的建議 —— 這條在測空氣").toBeGreaterThan(0);
    for (const s of TABLE.suggestions) {
      if (s.sfxKey === null) continue;
      // ① 建議的 key 一定有位元組（⛔ 套上去變成一次 audio-map miss ＝ 靜音）
      expect(SFX[s.sfxKey], `${s.ability} 建議的 ${s.sfxKey} 不在 audio-map`).toBeDefined();
      // ② ⛔ 不可以建議它今天已經在播的那一個（第一·五守則：說了但不會發生）
      expect(s.sfxKey, `${s.ability} 的建議逐字等於它今天的行為`).not.toBe(s.todayPlays);
      // ③ 「執行期收不收」是**問出貨的註冊表**，⛔ 不是產生器的自述
      expect(
        s.needsCueDeclaration,
        `${s.ability}：needsCueDeclaration 與出貨的 cues 名單對不上`,
      ).toBe(abilitySfxCueAllowed(s.sfxKey) === null);
    }
  });
});

/**
 * 投射物特效「有沒有真實套用」的守衛 (GH#251)。
 *
 * owner 2026-08-01：「投射物 跟 衝擊波特效 沒有真實套用」。
 *
 * 量到的事實（這一支自己重數一次，不是抄一個數字）：飛在空中的那顆彈道，它的
 * 外觀**不是**技能自己的 `vfxKey` 決定的 —— `EntityViewRegistry` 拿的是
 * `projectileVfxFor(e.key)`，而 `e.key` 是 **projectileId**。所以看起來長什麼樣
 * 完全由 `content/projectiles/<id>.json` 的 `vfxKey` 決定，技能自己被 #79 綁好的
 * 那個元素在飛行途中一點作用都沒有。出貨時只有 5 份 projectile 文件，其中兩份
 * (`imported.bolt` → `fx.ember-bolt` 火、`imported.wave` → `fx.thorn`) 就吃掉了
 * 53 支會發射彈道的技能裡的 51 支 —— 依文潔琳的冰彈跟火球飛起來一模一樣。
 *
 * 修法是**內容**而不是程式：每個元素一份 projectile 文件，指向該元素自己的
 * `fx.prim.<element>.bolt`。這一支釘住兩件事：
 *   1. 技能的元素 → 它發射的 projectile 文件的元素，兩邊一致；
 *   2. standalone 與 champion 內嵌鏡像的 `projectileId` 一模一樣（#79 的鏡像陷阱）。
 *
 * ⚠️ 這一支是**內容一致性**守衛，不是渲染守衛。它證明得了「彈道文件指向該元素
 * 真的存在的特效文件」，證明不了「畫面上真的變藍」——後者要 ProjectileView 級
 * 的斷言，見 apps/client/src/render/views/ProjectileView.test.ts 的範圍。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { effectsOf } from "../../testkit/expandedEffects";
import { fileURLToPath } from "node:url";

const CONTENT = fileURLToPath(new URL("../../../../content/", import.meta.url));

function readAll<T>(dir: string): T[] {
  return readdirSync(`${CONTENT}${dir}`)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(`${CONTENT}${dir}/${f}`, "utf8")) as T);
}

interface AnyDoc {
  id: string;
  vfxKey?: string;
  effects?: unknown;
  abilities?: Record<string, { id?: string; effects?: unknown }>;
}
interface ProjectileDoc {
  id: string;
  vfxKey: string;
}

const ABILITIES = readAll<AnyDoc>("abilities");
const CHAMPIONS = readAll<AnyDoc>("champions");
const PROJECTILES = new Map(readAll<ProjectileDoc>("projectiles").map((p) => [p.id, p]));

/** `fx.prim.<element>.<primitive>` → element；其他（w3x / godie / 專屬文件）→ null。 */
function elementOf(vfxKey: string | undefined): string | null {
  const m = /^fx\.prim\.([a-z0-9]+)\./.exec(vfxKey ?? "");
  return m ? m[1]! : null;
}

/** 一份 effects 樹裡所有 spawnProjectile 的 projectileId。 */
function projectileIds(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) projectileIds(n, out);
  } else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o.kind === "spawnProjectile" && typeof o.projectileId === "string") out.push(o.projectileId);
    for (const v of Object.values(o)) projectileIds(v, out);
  }
  return out;
}

describe("投射物：技能的元素真的跟著彈道飛出去 (GH#251)", () => {
  const launchers = ABILITIES.filter((a) => projectileIds(effectsOf(a)).length > 0);

  it("這批技能真的存在 —— 不是在測一個空集合", () => {
    // ⚠️ 這裡本來釘著 `toBe(53)`。那個 53 是**出貨當下**會發射彈道的技能支數,
    // 2026-08-13 營運母體縮編(119 → 78 位英雄,41 位連同技能搬進 `_legacy/`)
    // 之後它就是一個過期的出貨值 —— CLAUDE.md 說的「第四個住處」。
    // 這一條要的從來不是那個數字,是**下面三條不是在掃空集合**;
    // 覆蓋率由那三條自己用機制守(元素一致、鏡像一致、共用文件只服務沒有替代品的),
    // 不需要一個會隨著上下架浮動的計數。
    expect(launchers.length, "沒有任何技能會發射彈道 —— projectileIds() 或內容樹壞了").toBeGreaterThan(
      0,
    );
  });

  it("每一個被引用的 projectileId 都真的有文件（referential integrity）", () => {
    for (const a of launchers) {
      for (const pid of projectileIds(effectsOf(a))) {
        expect(PROJECTILES.has(pid), `${a.id} 指向不存在的 projectiles/${pid}`).toBe(true);
      }
    }
  });

  it("技能的元素 = 它發射的彈道的元素（可判定的那些一支都不准漏）", () => {
    const mismatched: string[] = [];
    let checked = 0;
    for (const a of launchers) {
      const want = elementOf(a.vfxKey);
      if (!want) continue; // w3x/godie 專屬特效：元素無法從 key 判定，不在這條的範圍
      for (const pid of projectileIds(effectsOf(a))) {
        const got = elementOf(PROJECTILES.get(pid)?.vfxKey);
        // fx.prim.<el>.bolt 只存在於 9 個元素；holy / wind 沒有 bolt 原語，
        // 所以那幾支仍然停在共用文件上 —— 這一條不假裝它們修好了。
        if (got === null) continue;
        checked++;
        if (got !== want) mismatched.push(`${a.id}: 技能是 ${want}，彈道 ${pid} 是 ${got}`);
      }
    }
    // 下界是**結構性**的:0 代表 elementOf() 或 projectileIds() 整個失效
    // (那時 mismatched 會是空的 → 這條會假綠)。原本的 35 是出貨支數的一半,
    // 隨營運母體縮編一起過期了,而「比對到幾對」本來就會跟著上下架浮動。
    expect(checked, "一對都沒比到 —— 元素解析壞了,mismatched 是空的也證明不了任何事").toBeGreaterThan(
      0,
    );
    expect(mismatched).toEqual([]);
  });

  it("champion 內嵌鏡像的 projectileId 和 standalone 一字不差（#79 的鏡像陷阱）", () => {
    const drift: string[] = [];
    let compared = 0;
    const byId = new Map(ABILITIES.map((a) => [a.id, a]));
    for (const c of CHAMPIONS) {
      for (const [slot, emb] of Object.entries(c.abilities ?? {})) {
        if (!emb?.id) continue;
        const standalone = byId.get(emb.id);
        if (!standalone) continue;
        const a = projectileIds(effectsOf(standalone));
        const b = projectileIds(effectsOf(emb));
        if (a.length === 0 && b.length === 0) continue;
        compared++;
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          drift.push(`${c.id}.${slot} (${emb.id}): standalone ${a} vs embedded ${b}`);
        }
      }
    }
    expect(compared).toBeGreaterThan(0);
    expect(drift).toEqual([]);
  });

  it("共用的兩份佔位文件仍然只服務「沒有元素專屬替代品」的那些技能", () => {
    // ⚠️ 這裡本來釘著 `toHaveLength(16)`，理由是「數字降下來時會紅，提醒有人補了
    // 原語就要回頭重指」。那個 16 有兩個毛病：① 它是出貨支數，2026-08-13 營運母體
    // 縮編之後就過期了；② 它守的方向是**反的** —— 補了一份 `imported.bolt.<元素>`
    // 卻**忘記**重指，數字不會動，這條照樣綠，正是它自稱要抓的那件事。
    //
    // 所以改成直接驗那個機制：一支技能還停在共用佔位文件上，只有兩種正當理由 ——
    // 它的元素從 vfxKey 判不出來（w3x/godie 專屬特效），或者該元素的替代文件
    // 根本還不存在（holy / wind 至今沒有）。替代品一旦被建出來，這條就指名道姓地紅。
    const shouldHaveMoved: string[] = [];
    for (const a of launchers) {
      const want = elementOf(a.vfxKey);
      if (!want) continue; // 元素判不出來：只能停在共用文件上，不是缺陷
      for (const pid of projectileIds(effectsOf(a))) {
        if (pid !== "imported.bolt" && pid !== "imported.wave") continue;
        const replacement = `${pid}.${want}`;
        if (PROJECTILES.has(replacement)) {
          shouldHaveMoved.push(`${a.id}：元素是 ${want}，${replacement} 已經存在，卻還指著共用的 ${pid}`);
        }
      }
    }
    expect(
      shouldHaveMoved,
      "元素專屬的彈道文件已經有了，這些技能卻還吃共用佔位文件 —— 飛出去的顏色是錯的",
    ).toEqual([]);
  });
});

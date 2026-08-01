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
  const launchers = ABILITIES.filter((a) => projectileIds(a.effects).length > 0);

  it("這批技能真的存在 —— 不是在測一個空集合", () => {
    expect(launchers.length).toBe(53);
  });

  it("每一個被引用的 projectileId 都真的有文件（referential integrity）", () => {
    for (const a of launchers) {
      for (const pid of projectileIds(a.effects)) {
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
      for (const pid of projectileIds(a.effects)) {
        const got = elementOf(PROJECTILES.get(pid)?.vfxKey);
        // fx.prim.<el>.bolt 只存在於 9 個元素；holy / wind 沒有 bolt 原語，
        // 所以那幾支仍然停在共用文件上 —— 這一條不假裝它們修好了。
        if (got === null) continue;
        checked++;
        if (got !== want) mismatched.push(`${a.id}: 技能是 ${want}，彈道 ${pid} 是 ${got}`);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(35);
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
        const a = projectileIds(standalone.effects);
        const b = projectileIds(emb.effects);
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

  it("共用的兩份佔位文件仍然只服務「元素判不出來」的那些技能", () => {
    const stillShared: string[] = [];
    for (const a of launchers) {
      for (const pid of projectileIds(a.effects)) {
        if (pid === "imported.bolt" || pid === "imported.wave") stillShared.push(a.id);
      }
    }
    // 53 支發射者裡：35 支已經改指到自己元素的文件，2 支本來就有專屬文件
    // (`thorne.e.thorn` / `sela.q.bolt`)，剩下 16 支仍然共用 —— 13 支的 vfxKey
    // 是 w3x/godie 專屬特效（元素判不出來），3 支是 holy(2) / wind(1)，
    // 這兩個元素**沒有** `fx.prim.*.bolt` 原語可以指。
    // 這個數字**降下來**時這一條也會紅，那正是它該紅的時候（有人補了原語 →
    // 要記得把這裡一起改，順便回頭看還剩誰）。
    expect(stillShared).toHaveLength(16);
  });
});

/**
 * 🛡 GH#1282 —— 「受到傷害時**獲得**護盾」的盾，⛔ 不可以落在**打你的人**身上。
 *
 * `effects/hooks.ts` 的 `resolveAgainst`：hook 沒寫 `target` 時效果打在**觸發對象**上 ——
 * `onDamageTaken` 的觸發對象是**攻擊者**、`onDamageDealt` 是**受害者**，兩個都是敵人。
 * ⇒ 反擊／致盲／重創（給敵人的）寫法是對的；⛔ 護盾／回血／增益（給自己的）就是送給對手。
 *
 * 量到的（2026-09-17）：出貨 hook 裡的 `shield` 全部帶 `target:"self"｜"allies"`，
 * ⛔ 只有第四批的愛麗絲、吉他吉他老伯、戰鬥暴龍獸三支天生技沒帶 —— 同一發打過來，盾加到了攻擊者身上
 * （probe：復仇之袍的反擊在坦克身體上量到 0，就是被這面盾吃掉的）。
 * 來源修在 `heroForge/communityAcquiredSecond.ts` 的 `passive(…, "self")`，再走 batch37 管線重產。
 *
 * 突變（2026-09-17）：拿掉 `acquired-alice.passive.json` 兩處 `"target": "self"` ⇒ 紅並指名 acquired-alice.passive。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
/** 觸發對象是敵人的事件（`combatResolveSystem` 同一發封包的兩個視角）。 */
const HOSTILE_TRIGGER = new Set(["onDamageTaken", "onDamageDealt"]);

type Json = Record<string, unknown>;
/** 這個效果是**給自己的好處**，而且它自己沒有把對象改回自己。 */
const benefitWithoutSelf = (e: Json): boolean =>
  e.kind === "shield" ||
  (e.kind === "heal" && e.applyTo !== "self") ||
  (e.kind === "applyBuff" && e.polarity === "buff" && e.applyTo !== "self");

function* hooks(x: unknown): Generator<Json> {
  if (Array.isArray(x)) for (const v of x) yield* hooks(v);
  else if (x && typeof x === "object") {
    const o = x as Json;
    if (typeof o.on === "string" && Array.isArray(o.effects)) yield o;
    for (const v of Object.values(o)) yield* hooks(v);
  }
}

describe("hook 的好處落在持有者身上（GH#1282）", () => {
  it("⭐ 敵方觸發的事件（受到傷害／造成傷害）裡，護盾／回血／增益一定要帶 target self 或 allies", () => {
    const offenders: string[] = [];
    let hostileHooks = 0;
    let guardedBenefits = 0;
    for (const coll of ["abilities", "items", "augments"]) {
      for (const f of readdirSync(join(CONTENT, coll)).filter((n) => n.endsWith(".json") && !n.startsWith("_"))) {
        for (const h of hooks(JSON.parse(readFileSync(join(CONTENT, coll, f), "utf8")))) {
          if (!HOSTILE_TRIGGER.has(h.on as string)) continue;
          hostileHooks++;
          const bad = (h.effects as Json[]).filter(benefitWithoutSelf).map((e) => e.kind);
          if (h.target === "self" || h.target === "allies") guardedBenefits += bad.length;
          else if (bad.length) offenders.push(`${coll}/${f}（${h.on} → ${bad.join("／")}）`);
        }
      }
    }
    // 分母與探針：真的掃到敵方觸發的 hook，而且「帶 self 的好處」這一桶非空（⛔ 否則這條是空的綠）。
    expect(hostileHooks, "一個 onDamageTaken／onDamageDealt hook 都沒掃到").toBeGreaterThan(0);
    expect(guardedBenefits, "沒有任何帶 target:self 的好處 —— 掃描本身可能壞了").toBeGreaterThan(0);
    expect(offenders, `這些 hook 會把好處送給敵人（觸發對象）：\n${offenders.join("\n")}`).toEqual([]);
  });
});

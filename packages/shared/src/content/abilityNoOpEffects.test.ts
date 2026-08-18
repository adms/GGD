/**
 * ⛔ **一支技能不可以「放得出來但什麼都不會發生」。**（GH#371，owner 2026-08-18）
 *
 * 這是 `noOpModifierClaims.test.ts` 的**姊妹閘**：那一支守 **modifier**
 * （`{stat, op, value}` 這一層），這一支守 **effect**（技能真正的載體）。
 * 規則本體在 `abilityNoOpEffects.ts`，它只問一件事 ——
 * **這一段效果在出貨設定下，有沒有可能改變任何一個數字？**
 *
 * ⚠️ 讀的是**登錄表裡那一份**，⛔ 不是磁碟上的 JSON：106 支技能的 `effects` 是
 * 空的、內容住在 `template.ref` 裡，由 `registerAll` 展開（失敗形態⑤：
 * 被測的不是出貨的那個）。所以這一支跑真的 `ContentLoader` + `registerAll`。
 *
 * ── 這條閘的**兩個方向**（⛔ 缺一個就等於沒有閘）─────────────────────────
 *   ① 名單外冒出新的 finding → 紅（有人上架了一句做不到的宣稱）
 *   ② 名單上的某一列**不再** finding → 也紅（缺陷修好了，豁免要跟著劃掉）
 * 沒有②的話，這張名單會慢慢變成一張「永遠不會有人回頭看」的白名單，
 * 而那正是 CLAUDE.md 講的「一條被放寬的閘等於沒有閘」。
 *
 * ⛔ 名單只能**變短**。要放行新的一列，必須先開 issue 並把編號寫在那一列上。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
  championPassive,
} from "../sim/content/registry";
import type { AbilityDef } from "../sim/content/defs";
import { analyseAbility, type FindingRule } from "./abilityNoOpEffects";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/**
 * 已知的缺口 —— **一列一個**，每一列都要有理由與 issue 編號。
 *
 * ⛔ 這不是「這樣寫沒關係」的清單，是「這一格今天是壞的，而修它不歸這一輪」的
 * 帳。修好之後**必須**把該列刪掉，否則下面的 stale 斷言會紅。
 */
const KNOWN: readonly { key: string; why: string; issue: string }[] = [
  // ⭐ GH#373 的 5 列在 2026-08-18 **全部劃掉了**（那 5 支主動天生技現在真的會改
  //    場上的數字：86-00 裝可愛 = taunt、57-00 四次元口袋 = weightedBranch + taunt、
  //    53-00 空間穿梭 = 20 秒隱形、30-00 攝影機 ×2 = 30 秒真視）。
  //    ⛔ 不要把它們加回來 —— 下面的 stale 斷言會紅。
  //
  // ⭐ GH#375 的 6 列在 2026-08-19 **全部劃掉了**。那 6 顆 `onHit: []` 的彈道
  //    （20-03 / 59-04 / 70-01 / 79-01 / 80-02 / 80-04）現在是 `spawnVfx`，指的
  //    是**同一份彈道文件的 vfxKey**，所以元素照樣飛出去、碰撞體沒了。
  //    ⚠️ 前一輪這裡寫著「兩條出路都不是內容側改得動的」，而那句話漏掉了第三條：
  //    彈道從頭到尾就**不該存在** —— 它是產生器 A-5「沉默 ≠ 移除」從 w3x 舊文件
  //    沿用回來的，owner 的新版規格一支都沒有點名過。而且它**不是**無害的裝飾：
  //    `ProjectileSystem.ts` 對 `origin` 帶 `ability:` 的彈道會 `recordAbilityHit`
  //    ＋ `fireHooks(onAbilityHit)`（施法當下已經發過一次 ⇒ 重複觸發），
  //    `pierce` 的那幾顆穿過幾個人就各做一次。修法在
  //    `tools/skill-remake/batch1.py` 的 `projectile="cosmetic"`。
  //    ⛔ 不要把它們加回來 —— 下面的 stale 斷言會紅。
];

const SLOTS = ["PASSIVE", "Q", "W", "E", "R", "EX"] as const;

interface Hit {
  key: string;
  rule: FindingRule;
  where: string;
  why: string;
}

let hits: Hit[] = [];

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);

  /** abilityId → 「哪一位英雄的哪一格」，只為了讓失敗訊息指得出人。 */
  const owner = new Map<string, string>();
  for (const cid of Champions.ids()) {
    const c = Champions.get(cid);
    const ex = (c as unknown as { exAbility?: string }).exAbility;
    const defs: Record<string, AbilityDef | undefined> = {
      PASSIVE: championPassive(cid),
      Q: c.abilities.Q,
      W: c.abilities.W,
      E: c.abilities.E,
      R: c.abilities.R,
      EX: ex ? (Abilities.tryGet(ex as never) as AbilityDef | undefined) : undefined,
    };
    for (const s of SLOTS) {
      const d = defs[s];
      if (d) owner.set(d.id, `${c.name}（${cid}）${s}`);
    }
  }

  hits = [];
  for (const id of Abilities.ids().sort()) {
    const def = Abilities.get(id) as AbilityDef;
    for (const f of analyseAbility(def, (pid) => Projectiles.tryGet(pid as never))) {
      hits.push({
        key: `${id}|${f.rule}|${f.path}`,
        rule: f.rule,
        where: owner.get(id) ?? `${id}（未掛在任何英雄槽位）`,
        why: f.why,
      });
    }
  }
});

describe("GH#371 — 技能的 effects 不可以是「說了但不會發生」", () => {
  it("每一支技能的效果樹，在出貨設定下都至少動得到一個數字", () => {
    const known = new Set(KNOWN.map((k) => k.key));
    const fresh = hits.filter((h) => !known.has(h.key));
    expect(
      fresh.map((h) => `${h.where} ${h.key} —— ${h.why}`),
      "這幾處效果在出貨設定下改不動任何一個數字（第一·五守則）。" +
        "⛔ 修法是**替換成做得到的機制**或**把描述改成只講真的會發生的事**，" +
        "⛔ 不是把它加進 KNOWN —— 要加就先開 issue 並在那一列寫上編號。",
    ).toEqual([]);
  });

  it("KNOWN 名單上沒有已經修好的殘留（名單只能變短）", () => {
    const live = new Set(hits.map((h) => h.key));
    const stale = KNOWN.filter((k) => !live.has(k.key)).map((k) => `${k.key}（${k.why} / ${k.issue}）`);
    expect(
      stale,
      "這幾列已經不再是 finding —— 缺陷修好了就把該列從 KNOWN 刪掉。" +
        "留著等於把一張帳單變成一張永遠不會有人回頭看的白名單。",
    ).toEqual([]);
  });

  it("掃描真的跑遍了整份登錄表（空掃不算綠）", () => {
    // 一條防「beforeAll 靜默失敗 / 登錄表是空的」的薄斷言：出貨的英雄數與技能數
    // 都遠大於骨架的 2 隻。⛔ 不釘確切數字（那是內容的事，不是這支測試的事）。
    expect(Champions.ids().length).toBeGreaterThan(2);
    expect(Abilities.ids().length).toBeGreaterThan(Champions.ids().length * 4);
  });
});

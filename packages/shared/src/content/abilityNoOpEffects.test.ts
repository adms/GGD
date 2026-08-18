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
  // GH#373 —— 5 支主動天生技整棵樹只有 spawnVfx（嘲諷／隱形／偵查／隨機道具全部沒接）
  { key: "godie-n00b.passive|vfx-only|effects", why: "隨機道具＋拉仇恨未接線", issue: "GH#373" },
  { key: "godie-o00k.passive|vfx-only|effects", why: "嘲諷（Atau）未接線", issue: "GH#373" },
  { key: "godie-o00l.passive|vfx-only|effects", why: "隱形 20 秒未接線", issue: "GH#373" },
  { key: "godie-o030.passive|vfx-only|effects", why: "偵查／視野未接線", issue: "GH#373" },
  { key: "godie-orkn.passive|vfx-only|effects", why: "偵查／視野未接線", issue: "GH#373" },
  // GH#375 —— 裝飾性投射物：傷害由同一支的 damageArea／damageLine／proxyCast 負責，
  //           這一顆只為了它的 vfxKey 而飛。正確的載體是 spawnVfx。
  { key: "godie-e002.e|projectile-no-payload|effects[1]", why: "裝飾尾波（damageLine 負責傷害）", issue: "GH#375" },
  { key: "godie-e00r.r|projectile-no-payload|effects[1]", why: "裝飾尾波（damageLine 負責傷害）", issue: "GH#375" },
  { key: "godie-e00s.q|projectile-no-payload|effects[1]", why: "裝飾尾波（damageArea 負責傷害）", issue: "GH#375" },
  { key: "godie-h01n.q|projectile-no-payload|effects[3]", why: "裝飾彈道（damageArea 負責傷害）", issue: "GH#375" },
  { key: "godie-h01u.w|projectile-no-payload|effects[1]", why: "裝飾尾波（damageArea 負責傷害）", issue: "GH#375" },
  { key: "godie-h01u.r|projectile-no-payload|effects[1]", why: "裝飾尾波（proxyCast 負責傷害）", issue: "GH#375" },
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

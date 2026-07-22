/**
 * features.ts gate suite — extraction is read-only and evidence-faithful.
 *
 * Everything here runs against a SYNTHETIC content tree in a tmpdir, not
 * content/: the extractor's contract is about doc shape (which effects count,
 * which line counts as ally-directed, where the attribute triple comes from),
 * and pinning that contract to the 113 real champions would make every content
 * edit a test failure. The real roster is exercised in classify.test.ts, where
 * the assertions are about the roster as a whole.
 *
 * Beacons: docs/todo/role-taxonomy.md.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { extractFeatures, type Features } from "./features";

let ROOT = "";
let byId = new Map<string, Features>();
const feat = (id: string): Features => {
  const f = byId.get(id);
  if (!f) throw new Error(`fixture champion ${id} was not extracted`);
  return f;
};

/** A champion@1-shaped doc, trimmed to the fields the extractor reads. */
const champion = (over: Record<string, unknown>): Record<string, unknown> => ({
  schema: "champion@1",
  role: "fighter",
  attackType: "melee",
  tags: ["wc3-import", "godie"],
  description: "",
  baseStats: { maxHealth: 480, maxMana: 300, manaRegen: 1.2, ad: 30, armor: 5, as: 0.5, ms: 5.5, range: 1.6 },
  growth: { maxHealth: 40, ad: 2.0 },
  abilities: {},
  ...over,
});

const write = (path: string, doc: unknown): void => writeFileSync(path, JSON.stringify(doc, null, 2));

beforeAll(() => {
  ROOT = mkdtempSync(join(tmpdir(), "role-classify-"));
  const champDir = join(ROOT, "content/champions");
  const abilityDir = join(ROOT, "content/abilities");
  const rawDir = join(ROOT, "tools/w3x-import/out/GoDieEX22s-src");
  mkdirSync(champDir, { recursive: true });
  mkdirSync(abilityDir, { recursive: true });
  mkdirSync(rawDir, { recursive: true });

  // The optional w3x hero table — declares an attribute for tk01 ONLY, so the
  // other fixtures exercise the description-recovery and no-data paths.
  write(join(rawDir, "OBJECTS.json"), { heroes: { TK01: { primary_attr: "STR", str_growth: 2.1, agi_growth: 2.0, int_growth: 1.7 } } });

  // A champion index sits in the same directory and must never be read as a
  // champion (it has no id/baseStats and would explode the extractor).
  write(join(champDir, "_index.json"), { champions: ["godie-tk01"] });

  write(
    join(champDir, "godie-tk01.json"),
    champion({
      id: "godie-tk01",
      name: "測試坦克",
      description: [
        "故事：\n測試用前排。",
        "推薦玩家 : 肉盾坦克",
        "上手度 : 中",
        "角色成長：\n力量 + 9.10\n敏捷 + 2.00\n智慧 + 1.70",
      ].join("\n\n"),
      exAbility: "godie-tk01.ex",
      abilities: {
        Q: { name: "01-01 護體", description: "[輔助]\n結界護盾。", castType: "self", effects: [{ kind: "shield", amount: { perRank: [100] }, duration: 5 }] },
        W: { name: "01-02 揮擊", description: "[主動攻擊]", castType: "targeted", targetsEnemies: true, effects: [{ kind: "damage", damageType: "magic", amount: { perRank: [80, 120, 160] } }] },
        E: { name: "01-03 震地", description: "[主動攻擊]\n暈眩敵人。", castType: "ground", targetsEnemies: true, effects: [{ kind: "applyStatus", statusId: "stun", stun: true, duration: 1.5 }] },
        R: { name: "01-04 突進", description: "[位移]", castType: "self", effects: [{ kind: "dash", distance: 4 }] },
      },
    }),
  );
  // The EX doc the champion only REFERENCES — its damage is the biggest number
  // in the kit, so peakDamage proves the standalone doc was actually read.
  write(join(abilityDir, "godie-tk01.ex.json"), {
    id: "godie-tk01.ex",
    schema: "ability@1",
    name: "01-002 終結",
    description: "[強化]\n吸血。",
    slot: "EX",
    castType: "targeted",
    targetsEnemies: true,
    effects: [{ kind: "damage", damageType: "physical", amount: { perRank: [999] } }],
  });

  write(
    join(champDir, "godie-sp02.json"),
    champion({
      id: "godie-sp02",
      name: "測試輔助",
      attackType: "ranged",
      description: [
        "治療友方單位並淨化隊友的負面狀態。",
        "擊殺後恢復所有生命及瑪那。",
        "角色成長：\n力量 + 1.00\n敏捷 + 1.50\n智慧 + 3.00",
      ].join("\n"),
      abilities: {
        // Not enemy-targeted and not self-cast ⇒ ally-directed.
        Q: { name: "02-01 祝福", description: "[輔助]", castType: "targeted", effects: [{ kind: "heal", amount: { perRank: [120] } }] },
        // A self-cast shield is personal mitigation, NOT a support effect.
        W: { name: "02-02 自護", description: "[輔助]", castType: "self", effects: [{ kind: "shield", amount: { perRank: [60] } }] },
        E: {
          name: "02-03 飛彈",
          description: "[主動攻擊]",
          castType: "ground",
          targetsEnemies: true,
          effects: [{ kind: "spawnProjectile", projectileId: "p", onHit: [{ kind: "damage", damageType: "physical", amount: { perRank: [50, 75] } }] }],
        },
      },
    }),
  );

  write(
    join(champDir, "godie-as03.json"),
    champion({
      id: "godie-as03",
      name: "測試刺客",
      // 暗殺 / 追擊 appear ONLY inside the 推薦玩家 label, which the playstyle
      // rules score on their own — the keyword corpus must not see them twice.
      description: ["推薦玩家 : 追擊暗殺", "上手度 : 難", "角色成長：\n力量 + 1.00\n敏捷 + 2.00\n智惠 + 2.50"].join("\n"),
      abilities: {},
    }),
  );

  write(
    join(champDir, "godie-nu04.json"),
    champion({
      id: "godie-nu04",
      name: "測試空白",
      tags: ["godie"], // no wc3-import ⇒ hand-authored, held out of the backfill
      // 友方 with no benefit verb on the line, and a benefit verb with no ally
      // on the next — neither one is a support signal on its own.
      description: "友方單位可以看見這個標記。\n每秒回復自身生命。",
      exAbility: "godie-gone.ex", // dangling ref: the doc does not exist
      abilities: {},
    }),
  );

  byId = new Map(extractFeatures(ROOT).map((f) => [f.id, f]));
});

afterAll(() => {
  if (ROOT) rmSync(ROOT, { recursive: true, force: true });
});

describe("extractFeatures — kit tally", () => {
  it("merges the embedded Q/W/E/R with the standalone EX doc", () => {
    const f = feat("godie-tk01");
    expect(f.nShield).toBe(1);
    expect(f.nCc).toBe(1);
    expect(f.nHardCc).toBe(1);
    expect(f.nDash).toBe(1);
    // W (magic) + the EX doc (physical): the EX is a separate file the champion
    // only references, and dropping it would lose the hero's biggest number.
    expect(f.nDamage).toBe(2);
    expect(f.nMagicDamage).toBe(1);
    expect(f.nPhysicalDamage).toBe(1);
    expect(f.peakDamage).toBe(999);
    cover("role-features-kit-tally");
  });

  it("walks spawnProjectile.onHit rather than stopping at the projectile", () => {
    const f = feat("godie-sp02");
    expect(f.nProjectile).toBe(1);
    expect(f.nDamage).toBe(1); // the onHit damage, one level down
    expect(f.peakDamage).toBe(75); // deepest numeric leaf of the onHit amount
    cover("role-features-kit-tally");
  });

  it("tolerates a dangling EX ref, an abilities-less champion and _index.json", () => {
    // _index.json is not a champion; reading it as one would throw.
    expect([...byId.keys()].sort()).toEqual(["godie-as03", "godie-nu04", "godie-sp02", "godie-tk01"]);
    const f = feat("godie-nu04");
    expect(f.nDamage).toBe(0);
    expect(f.peakDamage).toBe(0);
    expect(f.imported).toBe(false); // untagged ⇒ never proposed for backfill
    cover("role-features-missing-refs");
  });
});

describe("extractFeatures — ally-directed vs self-directed", () => {
  it("counts a heal/buff line only when an ally is named ON THAT LINE", () => {
    const sp = feat("godie-sp02");
    expect(sp.nAllyLines).toBe(1); // 治療友方單位並淨化隊友…
    expect(sp.nSelfSustainLines).toBe(1); // 擊殺後恢復所有生命及瑪那 — self-restore
    const nu = feat("godie-nu04");
    expect(nu.nAllyLines).toBe(0); // 友方 with no benefit verb on the line
    expect(nu.nSelfSustainLines).toBe(1); // 回復自身生命 with no ally on the line
    cover("role-features-ally-lines");
  });

  it("never credits a self-cast heal/shield as ally-directed", () => {
    const sp = feat("godie-sp02");
    expect(sp.nHeal).toBe(1);
    expect(sp.nShield).toBe(1);
    expect(sp.nAllyEffect).toBe(1); // the targeted heal only — not the self shield
    // A kit whose ONLY heal/shield is self-cast contributes nothing to support.
    expect(feat("godie-tk01").nShield).toBe(1);
    expect(feat("godie-tk01").nAllyEffect).toBe(0);
    cover("role-features-self-cast");
  });
});

describe("extractFeatures — WC3 attributes", () => {
  it("prefers the declared w3x attr, recovers the rest from 角色成長, else null", () => {
    const declared = feat("godie-tk01");
    expect(declared.primaryAttr).toBe("STR");
    expect(declared.primaryAttrInferred).toBe(false);
    expect(declared.strGrowth).toBe(2.1); // the map's value, not the 9.10 in the text
    expect(declared.agiGrowth).toBe(2.0);
    expect(declared.intGrowth).toBe(1.7);

    const recovered = feat("godie-sp02"); // absent from OBJECTS.json
    expect(recovered.primaryAttr).toBe("INT");
    expect(recovered.primaryAttrInferred).toBe(true); // max-growth fallback
    expect(recovered.intGrowth).toBe(3.0);

    // The importer wrote 智慧 for some heroes and 智惠 for others.
    const variant = feat("godie-as03");
    expect(variant.intGrowth).toBe(2.5);
    expect(variant.primaryAttr).toBe("INT");

    const none = feat("godie-nu04"); // no map entry, no 角色成長 block
    expect(none.primaryAttr).toBeNull();
    expect(none.primaryAttrInferred).toBe(false);
    expect([none.strGrowth, none.agiGrowth, none.intGrowth]).toEqual([0, 0, 0]);
    cover("role-features-primary-attr");
  });
});

describe("extractFeatures — playstyle label", () => {
  it("parses 推薦玩家 but keeps its words out of the keyword corpus", () => {
    const f = feat("godie-as03");
    expect(f.playstyle).toBe("追擊暗殺");
    // 暗殺 (assassinate) and 追擊 (chase) live ONLY in the stripped label — the
    // playstyle rules already price them, so scoring them again would double-
    // count one piece of evidence.
    expect(f.keywords).toEqual([]);
    expect(feat("godie-tk01").playstyle).toBe("肉盾坦克");
    // …while a genuine in-kit word still fires: tk01's Q says 結界護盾.
    expect(feat("godie-tk01").keywords).toContain("mitigate");
    cover("role-features-playstyle-split");
  });
});

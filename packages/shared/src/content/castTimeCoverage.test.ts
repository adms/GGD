/**
 * THE CAST-TIME COVERAGE TEST (LANE A — the owner's telegraph rule, revised).
 *
 * The rule this suite enforces is NOT the first draft any more. That draft was
 *
 *   「castTimeSec 沒有設定 的預設都要改成 0.6s，原本有設定的都 +0.3s」
 *
 * — a flat 0.6 s. It shipped, was A/B'd against castTimeSec = 0 in a real
 * 12-bot MatchController, and the owner revised it after seeing what a constant
 * does to combo feel:
 *
 *   「castTimeSec 0.3 - 0.6 s，依技能有多兇殘決定，最兇的封頂 0.9 s」
 *
 * so cast point is per-ability (the DOTA2 shape), the median is snappy, and
 * 0.9 s is reserved for the genuinely scary. The mapping is `castTimeFormula
 * .ts` — a pure function of fields the content already carries — and this
 * suite's central assertion is that every one of the 554 registered abilities
 * carries EXACTLY what that function derives. Content is derived data; the
 * formula is the source of truth.
 *
 * Two things make this suite worth its runtime:
 *
 * 1. It loads the REAL content tree through the REAL registration path
 *    (`ContentLoader` + `registerAll` — the game-server's boot pair) and then
 *    asserts against the POST-registration `Abilities` registry, never the raw
 *    JSON. Asserting on the JSON is precisely how task #79 shipped 460 dead
 *    ability edits with a green suite: the champion doc's embedded Q/W/E/R copy
 *    can win at runtime. It also asserts the MIRROR, so the two copies agree
 *    whichever one the registry happens to prefer.
 *
 * 2. It pins the measured casualties of the flat rule, as regression tests:
 *    zero statues, zero champions above 50 % root duty, no wind-up longer than
 *    its own effect (bar the 0.3 s floor), dashes and saves on the floor.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { registerAll } from "./registries";
import { Abilities, Champions } from "../sim/content/registry";
import { isPassiveOnly } from "../sim/abilities/abilityPassives";
import type { AbilityDef } from "../sim/content/defs";
import {
  CAST_CAP,
  CAST_FLOOR,
  CD_CEILING_FRACTION,
  deriveCastTime,
  SHIPPED_COOLDOWN_MULT,
} from "./castTimeFormula";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

/** The 10 abilities that carried a castTimeSec before ANY telegraph lane ran,
 *  with their original authored values. Frozen because the fact is otherwise
 *  unrecoverable once the files are rewritten, and because the owner asked
 *  specifically whether the formula moved them somewhere the original author
 *  would object to. The answer is recorded in docs/design/cast-telegraph.md. */
const PRE_LANE_CAST_TIMES: Record<string, number> = {
  "godie-emfr.ex": 0.35,
  "godie-h02s.ex": 0.35,
  "godie-h02z.ex": 0.35,
  "godie-osam.ex": 0.35,
  "godie-ubal.ex": 0.35,
  "godie-h01u.e": 0.6,
  "godie-u010.ex": 0.6,
  "godie-uvng.ex": 0.6,
  "sela.r": 0.5,
  "thorne.r": 0.4,
};

/** Passive-only = `passive` set AND `effects` empty: can never be activated. */
const EXEMPT_PASSIVE_ONLY = [
  "godie-e001.w",
  // 20-02 感知能力 (both Sabers): the WC3 source A0CM is the NATIVE Evasion
  // `AEev` (Cool=0 permanent, 7/14/21/28% 迴避 per OBJECTS.json data columns).
  // The prior castable "+25 armor 6s" buff was an import invention that also
  // contradicted the doc's own [被動] description — reclassified 2026-07-25.
  "godie-e002.q",
  "godie-e00l.q",
  "godie-e00q.q",
  // ⚠️ `godie-e00t.r` (66-04 靈壓震撼) WAS HERE and is deliberately GONE
  // (2026-07-30). This list's own docstring below says a NEW passive-only
  // Q/W/E/R/EX means someone disarmed an ability; the reverse move needs the
  // same paper trail. The 2026-07-25 batch read A0IC's slow aura A0ID and
  // authored it as a PERMANENT passive — but A0IC's base is `AEim`
  // (Immolation), i.e. a TOGGLE with a 10 s cooldown and 50/70/90 mana, and
  // war3map.j gates the aura behind it explicitly:
  // `SetPlayerAbilityAvailableBJ(false,'A0ID',…)` on spawn (j:48787), `true`
  // only on the `immolation` order (j:48915-48919), `false` again the moment
  // buff B025 drops (j:48941-48942). So the shipped shape had BOTH halves
  // wrong at once: the R button answered "passive" and did nothing, while the
  // −65 % enemy attack-speed aura ran permanently for free. It is now a real
  // self-centred cast (`castType: "ground"`, `range: 0`) — see
  // abilities/godie-e00t.r.json and sim/abilities/inertActives.test.ts.
  "godie-e00q.r",
  "godie-edem.r",
  "godie-emns.w",
  "godie-etyr.ex",
  "godie-etyr.w",
  "godie-h01u.q",
  "godie-ofar.w",

  // ─── 2026-08-12 · 第一批 90 支技能重製 ──────────────────────────────────
  // owner 2026-08-12 裁決：「只要讓 EX 照技能說明正常實作 被動或主動 即可」
  // —— 舊行為：這 22 支是可施放的主動技（`effects` 有東西、帶 castTimeSec，
  //    HUD 上按得下去）；新規格：owner 的重製稿描述**第一個標籤逐字就是
  //    `[被動]`，所以產生器把它們寫成 `passive` + `effects: []` + 無
  //    castTimeSec，改由條件達成自動觸發（例：59-001 完全暴走從「血夠低才
  //    准按」變成「HP 低於門檻自動開」，13-002 絕。暗殺奧義從主動變成 W 命中
  //    [致盲]目標時 20% 機率摘心）。
  //
  // 這一格正是上面那段 docstring 要求的手續：「a new passive-only Q/W/E/R/EX
  // means someone silently disarmed an ability and must come back here and say
  // so」。說了 —— 不是被誰默默拔掉，是 owner 的規格就長這樣。
  //
  // ⚠️ 這份名單是**跑出來的，不是抄來的**。實測 `Abilities.all()` 的
  // passive-only ∖ slot=PASSIVE 之後做集合 diff：**22 進、0 出**（新集合 33
  // 支）。先前的分析稿寫「23 進 1 出」，那個數字是錯的 —— 而且 11+22 與
  // 11+23−1 都等於 33，光比對數量永遠看不出來，只有比對**集合**才會現形。
  //
  // ⛔ `godie-e002.w`（20-01 風王結界）刻意**不在**這裡。它先前因為槽位錯位
  // 看起來像該進名單；產生器修好之後它歸位到 W，帶 1 個 effect 與
  // castTimeSec 0.3，是**可施放的主動技**，放進來就是假的豁免。
  "godie-e002.ex", // 20-002 解放.約束勝利劍MAX — [反彈成功時]觸發（Saber）
  "godie-e00r.e", // 59-03 AT力場 — [週期]每 8 秒自動生成護盾（初號機）
  "godie-e00r.ex", // 59-001 完全暴走 — [屬性門檻]HP 過低自動暴走
  "godie-e00r.w", // 59-02 高週波短刀 — [普攻時][機率]真傷
  "godie-e00s.ex", // 70-002 樹海降臨 — [召喚]追加在千年練成上（白木卡迪那）
  "godie-e00s.w", // 70-02 大怒石 — [普攻時]小範圍濺射
  "godie-e00w.ex", // 77-002 御雷劍 — [裝備了某類道具時]提升雷鳴劍機率（櫻綻剎那）
  "godie-e00w.w", // 77-02 雷鳴劍 — [普攻時][機率]會心一擊
  "godie-efur.ex", // 13-002 絕。暗殺奧義 — [技能命中時]對[致盲]目標處決（揍敵客桀諾）
  "godie-ewar.e", // 12-03 破凰之心。空破山 — [普攻時][機率]暴擊（天地志狼）
  "godie-h00l.e", // 60-03 三角神力．勇氣 — 屬性強化 + 每三下普攻（林克）
  "godie-h00l.ex", // 60-002 勇者意志 — 生命低於門檻自動[反彈]
  "godie-h01n.ex", // 79-002 虛化 — [卍解]狀態下自動生效（黑崎一護）
  "godie-h01u.ex", // 80-002 戰無不勝 — 純屬性被動（呂布奉先）
  "godie-h02k.q", // 89-01 憤怒的頭槌 — [普攻時][機率]暈眩（熊貓）
  "godie-h02k.w", // 89-02 憤怒的菊花 — [受擊時][機率][反彈]
  "godie-h02k.e", // 89-03 憤怒的胸毛 — [受擊時][機率]攻速暴漲
  "godie-h02k.r", // 89-04 憤怒的簡諧運動 — [普攻時][機率]拉扯/擊退/暈眩
  "godie-h02v.e", // 92-02 消化液 — [受到傷害]時[機率]噴射（草泥馬）
  "godie-h02v.ex", // 92-002 最終戈壁 — [馬勒戈壁]施展期間每秒自動生效
  "godie-h02v.w", // 92-03 狂草泥馬 — [屬性門檻]生命過低時普攻附加[吞噬]
  "godie-hapm.e", // 52-03 無銘斧劍 — [普攻時]追加傷害 + [麻痺]（Berserker）
];

let all: AbilityDef[];
let cdMult: number;

beforeAll(async () => {
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(result.store);
  all = Abilities.all();
  const env = result.store.tryGet<{ multipliers: Record<string, number> }>("config", "combat-env");
  cdMult = env?.multipliers.cooldown ?? 1;
});

describe("cast-time coverage (tiered by how punishing the ability is)", () => {
  it("every registered ability carries EXACTLY what castTimeFormula derives", () => {
    // The one assertion that makes content derived data rather than 554 hand
    // numbers. `deriveCastTime` never reads castTimeSec, so this is not circular.
    const wrong = all
      .map((d) => ({ d, want: deriveCastTime(d, cdMult).castTimeSec }))
      .filter((r) => r.d.castTimeSec !== r.want)
      .map((r) => `${r.d.id}: content ${String(r.d.castTimeSec)} != formula ${String(r.want)}`);
    expect(wrong).toEqual([]);
    // guard the guard: this must be measuring the whole roster, not 3 docs
    expect(all.length).toBeGreaterThan(500);
  });

  it("the shipped cooldown multiplier is still the one the formula was tuned against", () => {
    // Every ceiling below is computed against the POST-multiplier cooldown. If
    // combat-env `cooldown` moves, the curve has to be re-derived
    // (`scripts/deriveCastTimes.ts --write`), not silently left stale.
    expect(cdMult).toBe(SHIPPED_COOLDOWN_MULT);
  });

  it("passive-only abilities carry NO castTimeSec — the sim can never read it", () => {
    const passives = all.filter(isPassiveOnly);
    // The FROZEN list is about the five CASTABLE slots: those are the ones the
    // telegraph lane rewrote, so a new passive-only Q/W/E/R/EX means someone
    // silently disarmed an ability and must come back here and say so.
    //
    // slot "PASSIVE" (the level-1 天生技, the 6th slot) is deliberately NOT in
    // it: ~51 of the 108 recovered innates are passive-TYPE by construction, so
    // pinning them here would turn one roster-wide content import into 51 edits
    // of a list that documents nothing. The invariant that matters — no
    // castTimeSec on anything that can never be cast — is asserted on ALL of
    // them below, PASSIVE included.
    const castable = passives.filter((d) => d.slot !== "PASSIVE");
    expect(castable.map((d) => d.id).sort()).toEqual([...EXEMPT_PASSIVE_ONLY].sort());
    for (const d of passives) expect(d.castTimeSec).toBeUndefined();
  });

  it("every authored value is on the 0.1 s ladder inside [0.3, 0.9] and a whole sim tick", () => {
    for (const d of all) {
      if (d.castTimeSec === undefined) continue;
      expect(d.castTimeSec).toBeGreaterThanOrEqual(CAST_FLOOR);
      expect(d.castTimeSec).toBeLessThanOrEqual(CAST_CAP);
      // dt = 1/30; the sim rounds castTimeSec/dt, so an off-ladder value would
      // make the authored second and the simulated tick disagree.
      const ticks = d.castTimeSec * 30;
      expect(Math.abs(ticks - Math.round(ticks))).toBeLessThan(1e-9);
    }
  });

  it("THE STATUE INVARIANT: no cast time reaches its own post-multiplier cooldown", () => {
    // The seven statues (godie-e00v, godie-ekee, godie-etyr, godie-u011,
    // godie-u012, sela, thorne) had cast times LONGER than the cooldown of the
    // ability imposing them, so they could never leave the casting state.
    const violations = all
      .filter((d) => (d.castTimeSec ?? 0) > 0)
      .map((d) => ({ d, cd: Math.min(...d.cooldown) * cdMult }))
      .filter((r) => r.cd > 0 && r.d.castTimeSec! > r.cd * CD_CEILING_FRACTION + 1e-9)
      .map((r) => `${r.d.id}: ct ${r.d.castTimeSec} > cd ${r.cd.toFixed(2)}/8`);
    expect(violations).toEqual([]);
  });

  it("ZERO champions can be rooted for the whole round, and none above 50 %", () => {
    // The metric the flat rule failed: mean 41.7 % / median 34.7 % root duty,
    // 25 of 113 champions >= 50 %, 7 of them at 100 %. Recomputed identically.
    const duties = Champions.all().map((c) => {
      let duty = 0;
      for (const s of ["Q", "W", "E", "R"] as const) {
        const def = Abilities.tryGet(c.abilities[s].id);
        if (!def || isPassiveOnly(def)) continue;
        const cd = Math.min(...def.cooldown) * cdMult;
        if (cd <= 0) continue;
        duty += Math.min(1, (def.castTimeSec ?? 0) / cd);
      }
      return { id: c.id, duty: Math.min(1, duty) };
    });
    expect(duties.filter((r) => r.duty >= 0.999).map((r) => r.id)).toEqual([]); // statues
    expect(duties.filter((r) => r.duty >= 0.5).map((r) => r.id)).toEqual([]);
    const mean = duties.reduce((s, r) => s + r.duty, 0) / duties.length;
    // 0.25 held at cooldownMult 0.25. The owner's 0.2 mult shrinks every cooldown
    // while the 0.3 s cast floor does NOT, so the fixed floor is a larger fraction
    // of a shorter cooldown and the mean root-duty rises to ~0.27. The HARD guards
    // above (no statue, none ≥50 %) still hold — this is only the soft aggregate.
    expect(mean).toBeLessThan(0.3); // was 0.417 flat → 0.25 at x0.25 → ~0.27 at x0.2
  });

  it("MOBILITY gets the floor — an escape that announces itself is not an escape", () => {
    // Traced per tick in the real sim under the flat rule: displacement was
    // flat until tick 18. Only 12 of 113 champions own a dash at all, so a
    // rooted dash deletes the entire "I can dodge" population.
    const dashes = all.filter((d) => d.effects.some((e) => e.kind === "dash"));
    expect(dashes.length).toBeGreaterThanOrEqual(12);
    // Floor, or instant when the cooldown ceiling already put it below the
    // floor: thorne.q is a 5 s dash, i.e. 1.25 s after the x0.25 multiplier,
    // and 0.3 s of root on that would be a 24 % duty cycle on a MOVEMENT
    // button. `rapid-fire` deliberately outranks `mobility` for that reason.
    for (const d of dashes) {
      expect([CAST_FLOOR, undefined]).toContain(d.castTimeSec);
    }
    expect(dashes.filter((d) => d.castTimeSec === CAST_FLOOR).length).toBeGreaterThanOrEqual(12);
  });

  it("SAVES get the floor — a shield 0.6 s late is a shield that did not happen", () => {
    const saves = all.filter(
      (d) =>
        !isPassiveOnly(d) &&
        d.effects.some((e) => e.kind === "heal" || e.kind === "shield" || e.kind === "restore") &&
        !d.effects.some((e) => e.kind === "damage"),
    );
    expect(saves.length).toBeGreaterThanOrEqual(15);
    // Floor, OR instant when the cooldown ceiling already put it below the floor
    // — the same allowance the mobility test makes. At cooldownMult 0.2 a save
    // whose own cooldown cannot afford even the 0.3 s floor is rapid-fire, and
    // instant is not "late": forcing the floor there would make it a statue
    // (cast time ≥ cooldown), which the STATUE INVARIANT forbids. The bulk must
    // still land ON the floor so saves stay responsive-but-telegraphed.
    for (const d of saves) expect([CAST_FLOOR, undefined]).toContain(d.castTimeSec);
    expect(saves.filter((d) => d.castTimeSec === CAST_FLOOR).length).toBeGreaterThanOrEqual(12);
  });

  it("no wind-up outlives the effect it produces, except against the 0.3 s floor", () => {
    // 「珍奶顏射 0.6 s cast / 0.1 s effect」 and 14 more like it. The only
    // survivor is the one whose effect is SHORTER than the floor itself.
    const over: string[] = [];
    for (const d of all) {
      const ct = d.castTimeSec ?? 0;
      if (ct <= CAST_FLOOR) continue;
      const dur = deriveCastTime(d, cdMult).features.effectDuration;
      if (dur > 0 && ct > dur + 1e-9) over.push(`${d.id}: ct ${ct} > effect ${dur}`);
    }
    expect(over).toEqual([]);
  });

  it("the curve has the shape the owner asked for: median 0.4 s, 0.9 s rare", () => {
    const vals = all
      .map((d) => d.castTimeSec)
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    expect(vals[Math.floor(vals.length / 2)]).toBe(0.4);
    const atCap = vals.filter((v) => v === CAST_CAP).length;
    expect(atCap).toBeGreaterThan(0); // the cap must be reachable…
    expect(atCap).toBeLessThan(vals.length * 0.02); // …and reserved
  });

  it("the 10 pre-lane authored values were all re-derived, not preserved", () => {
    // The owner's superseded instruction was "+0.3 s to whatever was there".
    // The formula deliberately ignores the old number and re-derives, so the
    // whole 554-ability curve is coherent. Recorded here so the supersession
    // is visible rather than silent.
    for (const [id, before] of Object.entries(PRE_LANE_CAST_TIMES)) {
      const def = all.find((d) => d.id === id);
      expect(def, `${id} missing from the registry`).toBeDefined();
      expect(def!.castTimeSec).toBe(deriveCastTime(def!, cdMult).castTimeSec);
      expect(def!.castTimeSec).not.toBe(Math.round((before + 0.3) * 100) / 100);
    }
  });

  it("the champion's EMBEDDED copy agrees — or the codex shows a number the match ignores", () => {
    // The MIRROR RULE. apps/client/src/ui/codex/codexData.ts and apps/admin's
    // content page read the champion JSON directly, so a drifted pair means the
    // UI advertises a cast time the match does not use. Holds this test whether
    // or not the standalone doc currently wins inside registerChampion.
    const drift: string[] = [];
    for (const c of Champions.all()) {
      for (const slot of ["Q", "W", "E", "R"] as const) {
        const emb = c.abilities[slot];
        const reg = Abilities.get(emb.id);
        if (emb.castTimeSec !== reg.castTimeSec) {
          drift.push(`${emb.id}: embedded ${emb.castTimeSec} vs registry ${reg.castTimeSec}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });
});

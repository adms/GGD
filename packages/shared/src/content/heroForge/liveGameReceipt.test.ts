/**
 * GH#1161 玩法收據的閘。
 *
 * ⭐ 它問的一題：**一份「這隻自動產生的英雄真的被選進一場對局、六格真的跑過」的
 * 宣稱，少掉任何一段證據時，還會不會被當成通過？**
 *
 * ⚠️ 這一條刻意**不**驗技能好不好玩、數值對不對、畫面有沒有出現 —— 那些各有守衛。
 * 它只驗一件事：**推導是 fail-closed 的**。所以主體是一張突變表：每一列都是一個
 * 已經真的發生過的假陽性形狀（匯入成功卻選到基底英雄、封裝准入通過而對局沒建起來、
 * 按鍵在而技能沒進 runtime、難的場景靜靜沒跑、證據事後被改過）。
 */
import { describe, expect, it } from "vitest";
import { contentSha256 } from "../import/jcs";
import { sha256Hex } from "../sha256";
import { HERO_SLOTS } from "./constants";
import {
  HERO_LIVE_GAME_RECEIPT_SCHEMA,
  HERO_LIVE_GAME_SCENARIOS_SCHEMA,
  acceptHeroLiveGameReceipt,
  heroLiveGameReplayKey,
  zHeroLiveGameReceipt,
  zHeroLiveGameScenarioManifest,
  type HeroLiveGameDemand,
} from "./liveGameReceipt";

const sha = (seed: string) => `sha256:${sha256Hex(seed)}`;
const target = { gameRevision: "v0.46.0-1-gabcdef", contentVersion: "cv_1234567890ab", migrationFingerprint: "mf1234567890", processorFingerprint: "pf1234567890" };
const manifest = zHeroLiveGameScenarioManifest.parse({
  schema: HERO_LIVE_GAME_SCENARIOS_SCHEMA,
  items: [
    { id: "ally-spared", kind: "ally-enemy", requirementZh: "Q 只打敵人，隊友不掉血。" },
    { id: "mana-floor", kind: "resource", requirementZh: "魔力不足時 R 被拒絕施放。" },
    { id: "after-w", kind: "cross-slot", requirementZh: "W 的標記還在時 E 才追加。" },
  ],
});
/** 證據的雜湊**算出來**，⛔ 不抄一個字面值 —— 抄了就發現不了 drift 檢查自己壞掉。 */
const EVIDENCE_TEXT = '{"ticks":180}';
const evidenceBytes = new TextEncoder().encode(EVIDENCE_TEXT);
const slotAbilityIds = { PASSIVE: "hero.passive", Q: "hero.q", W: "hero.w", E: "hero.e", R: "hero.r", EX: "hero.ex" } as const;
const demand: HeroLiveGameDemand = {
  projectId: "watcher", heroId: "community.watcher", versionId: sha("version"), packageDigest: sha("package"),
  target, manifest, slotAbilityIds, evidence: new Map([["runtime-log", evidenceBytes]]),
};

const active = (abilityId: string) => ({ kind: "active" as const, abilityId, events: { abilityCast: 1, damage: 3 } });
const pass = () => ({
  schema: HERO_LIVE_GAME_RECEIPT_SCHEMA,
  input: { projectId: "watcher", sourceSha256: sha("source"), packageDigest: sha("package") },
  // ⚠️ 逐格複製，⛔ 不是共用那一個 `target` 物件 —— 共用的話「改掉引擎指紋」這一列
  // 會把**期望值一起改掉**，於是量到 0 個失敗而看起來完全正常（第一次跑就中了）。
  target: { ...target },
  scenarioManifestSha256: contentSha256(manifest),
  selection: { requestedHeroId: "community.watcher", requestedVersionId: sha("version"), selectedHeroId: "community.watcher", selectedVersionId: sha("version") },
  match: { matchId: "room-7f", seed: 12345, arenaId: "arena.skeleton", seatId: 0, teamId: 0 },
  slots: {
    PASSIVE: { kind: "passive" as const, abilityId: "hero.passive", installed: true, events: { statusApplied: 2 } },
    Q: active("hero.q"), W: active("hero.w"), E: active("hero.e"), R: active("hero.r"), EX: active("hero.ex"),
  },
  scenarios: [
    { id: "ally-spared", verdict: "pass" as const, observedZh: "隊友血量未變。" },
    { id: "mana-floor", verdict: "pass" as const, observedZh: "castRejected=1（魔力不足）。" },
    { id: "after-w", verdict: "pass" as const, observedZh: "E 在標記存在時多打 1 段。" },
  ],
  process: { startedAt: "2026-09-19T01:00:00.000Z", finishedAt: "2026-09-19T01:00:42.000Z", exitCode: 0, joined: true },
  evidence: [{ id: "runtime-log", sha256: `sha256:${sha256Hex(EVIDENCE_TEXT)}` }],
});

const codes = (raw: unknown, override: Partial<HeroLiveGameDemand> = {}) =>
  acceptHeroLiveGameReceipt(raw, { ...demand, ...override }).failures.map((failure) => failure.code);

describe("hero live-game receipt", () => {
  it("accepts one complete run, and the six slots stay pinned to HERO_SLOTS", () => {
    expect(acceptHeroLiveGameReceipt(pass(), demand)).toEqual({ passed: true, failures: [] });
    expect(Object.keys(zHeroLiveGameReceipt.shape.slots.shape)).toEqual([...HERO_SLOTS]);
  });

  it("keys replays by the run, not by the clock or the room id", () => {
    const again: any = pass();
    again.match.matchId = "room-99";
    again.process.startedAt = "2026-09-19T09:00:00.000Z";
    again.process.finishedAt = "2026-09-19T09:00:41.000Z";
    expect(heroLiveGameReplayKey(zHeroLiveGameReceipt.parse(again))).toBe(heroLiveGameReplayKey(zHeroLiveGameReceipt.parse(pass())));
    again.match.seed = 999;
    expect(heroLiveGameReplayKey(zHeroLiveGameReceipt.parse(again))).not.toBe(heroLiveGameReplayKey(zHeroLiveGameReceipt.parse(pass())));
  });

  it.each([
    ["研究端自己填通過", (r: any) => { r.gameplay = "passed"; }, "receipt-invalid"],
    ["缺一格技能槽", (r: any) => { delete r.slots.W; }, "receipt-invalid"],
    ["沒有附任何證據", (r: any) => { r.evidence = []; }, "receipt-invalid"],
    ["選到別支英雄", (r: any) => { r.selection.selectedHeroId = "thorne"; }, "hero-mismatch"],
    ["選角沒走到", (r: any) => { r.selection.selectedHeroId = null; }, "hero-mismatch"],
    ["解析到別的版本", (r: any) => { r.selection.selectedVersionId = sha("other"); }, "version-mismatch"],
    ["換一顆封裝", (r: any) => { r.input.packageDigest = sha("other"); }, "package-mismatch"],
    ["跑在另一台引擎上", (r: any) => { r.target.gameRevision = "v0.45.0"; }, "target-drift"],
    ["Q 格裝的是別支技能", (r: any) => { r.slots.Q.abilityId = "thorne.q"; }, "slot-binding-drift"],
    ["被動沒安裝", (r: any) => { r.slots.PASSIVE.installed = false; }, "slot-not-installed"],
    ["按鍵在而技能沒進 runtime", (r: any) => { r.slots.R.events = { abilityCast: 0 }; }, "slot-not-cast"],
    ["施法被拒", (r: any) => { r.slots.EX.events = { abilityCast: 1, castRejected: 1 }; }, "slot-not-cast"],
    ["准入過了但對局沒建起來", (r: any) => { r.match = null; }, "match-missing"],
    ["子服務沒有收乾淨", (r: any) => { r.process.joined = false; }, "service-unjoined"],
    ["難的場景靜靜沒跑", (r: any) => { r.scenarios = r.scenarios.filter((s: any) => s.id !== "mana-floor"); }, "scenario-missing"],
    ["場景跑了但沒過", (r: any) => { r.scenarios[1].verdict = "fail"; }, "scenario-failed"],
    ["跑的是別一份場景清單", (r: any) => { r.scenarioManifestSha256 = sha("other-manifest"); }, "scenario-manifest-drift"],
    ["多跑清單以外的場景", (r: any) => { r.scenarios.push({ id: "easy-one", verdict: "pass", observedZh: "額外。" }); }, "scenario-manifest-drift"],
    ["證據事後被改過", (r: any) => { r.evidence[0].sha256 = sha("edited"); }, "evidence-drift"],
  ])("fails closed：%s", (_name, mutate, expected) => {
    const draft: any = pass();
    mutate(draft);
    expect(codes(draft)).toContain(expected);
  });

  it("fails closed when the named evidence cannot be produced, or extra evidence appears", () => {
    expect(codes(pass(), { evidence: new Map() })).toEqual(["evidence-missing"]);
    expect(codes(pass(), { evidence: new Map([["runtime-log", evidenceBytes], ["extra", evidenceBytes]]) })).toEqual(["evidence-extra"]);
  });

  it("refuses a scenario list that skips a required fixture group", () => {
    const items = manifest.items.map((item) => (item.kind === "resource" ? { ...item, kind: "ally-enemy" as const } : item));
    expect(() => zHeroLiveGameScenarioManifest.parse({ ...manifest, items })).toThrow("resource");
  });
});

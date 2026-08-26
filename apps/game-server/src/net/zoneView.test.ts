/**
 * L4 剔除的**承重守衛**（GH#760 步驟 2）。
 *
 * ⭐ 跑的是出貨的那一整條路，⛔ 沒有一段是夾具：
 *   真的 `MatchController` 進戰鬥 → 真的 `spawnMob` 把兩個 zone 都填滿 →
 *   真的 `projectSnapshot` → 真的 `ZoneViewSync` → 真的 `Encoder` →
 *   ⭐ **真的 `Decoder`**（客戶端解碼用的就是這一支）。
 *
 * ⛔ 這裡不斷言任何一個常數（「剔除掉 46%」是數值，第二守則）——
 *    斷言的是**機制**：某一區的客戶端解碼出來的實體集合 ⊊ 全世界的實體集合，
 *    而且它拿到的**每一個**實體都在他看得到的 zone 裡。
 *
 * ⚠️ 第三條是這一支存在的另一半理由：`view: true` 的反面是「**沒有 view 的
 *    客戶端一個實體都收不到**」。那一條把它釘死 —— 它紅的時候要修的是
 *    `MatchRoom.onJoin` / `ReplayRoom` 的 view 指派，⛔ 不是這條測試。
 */
import { describe, expect, it } from "vitest";
import { Decoder, Encoder } from "@colyseus/schema";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";
import { ZoneViewSync, resolveSnapshotZoneCull, visibleZonesForConnection, type ViewClient, type ZoneViewSource } from "./zoneView";
import { MatchState } from "@ggd/shared/protocol/schema";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";
import { mobRulesFromConfig, spawnMob } from "@ggd/shared/sim/mobs";
import { beginCombatMobs } from "@ggd/shared/sim/systems/MobSystem";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const DT = 1 / 30;
/** 每區生幾隻 —— 從**出貨設定**推導，⛔ 不抄字面值（第二守則）。 */
const PER_ZONE = Math.max(4, Math.min(24, DEFAULT_MOB_WAVES_CONFIG.maxAlivePerZone ?? 24));

/** 兩個 duel zone 都有小怪的一場戰鬥 + 已經投影好的快照。 */
function fixture(): { ctl: MatchController; state: MatchState; encoder: Encoder<MatchState>; zones: number[] } {
  const ctl = new MatchController(
    "zone-view",
    3,
    Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
    FAST,
  );
  while (ctl.phase.phase !== "combat") ctl.tick();
  ctl.tick();
  const zones = ctl.pairings.map((p) => p.zone);
  const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, DEFAULT_MOB_WAVES_CONFIG.fromRound);
  ctl.world.mobRules = rules;
  beginCombatMobs(ctl.world, rules, zones);
  for (const z of zones) for (let i = 0; i < PER_ZONE; i++) spawnMob(ctl.world, z, rules, 1, i);
  const state = new MatchState();
  const encoder = new Encoder(state);
  projectSnapshot(ctl, state, new Map());
  return { ctl, state, encoder, zones };
}

/** 出貨路徑的編碼：先共用段，再把這一份 view 的 filtered 段接上去（＝SchemaSerializer.getFullState）。 */
function encodeFor(encoder: Encoder<MatchState>, client: ViewClient | null): Buffer {
  const buf = Buffer.allocUnsafe(Encoder.BUFFER_SIZE);
  const shared = { offset: 1 };
  const full = encoder.encodeAll(shared, buf);
  if (!client?.view) return Buffer.from(full);
  return encoder.encodeAllView(client.view, shared.offset, { ...shared }, buf);
}

/** 真的解碼一次，回傳 `entityId → zone`（客戶端拿到的就是這一份）。 */
function decodeZones(bytes: Buffer): Map<number, number> {
  const decoder = new Decoder(new MatchState());
  decoder.decode(bytes, { offset: 1 });
  const out = new Map<number, number>();
  decoder.state.entities.forEach((es) => out.set(es.id, es.zone));
  return out;
}

function sourceOf(ctl: MatchController, bySession: Record<string, number[]>, live: number[]): ZoneViewSource {
  return {
    ownZonesBySession: () => new Map(Object.entries(bySession)),
    liveZones: () => live,
  };
}

describe("L4 —— 依 duel zone 剔除快照", () => {
  it("兩區的比賽：每個客戶端只解碼得到自己那一區，而全世界比它多", () => {
    const { ctl, state, encoder, zones } = fixture();
    expect(zones.length).toBeGreaterThanOrEqual(2); // 這份夾具真的有兩區,否則下面什麼都證明不了

    const a: ViewClient = { sessionId: "A" };
    const b: ViewClient = { sessionId: "B" };
    const sync = new ZoneViewSync(true);
    const stats = sync.sync(state, [a, b], sourceOf(ctl, { A: [zones[0]!], B: [zones[1]!] }, zones));

    const worldIds = decodeZones(encodeFor(encoder, null) as Buffer);
    const everything = new Map<number, number>();
    state.entities.forEach((es) => everything.set(es.id, es.zone));

    const seenByA = decodeZones(encodeFor(encoder, a));
    const seenByB = decodeZones(encodeFor(encoder, b));

    // ⭐ 機制①：他拿到的東西**嚴格少於**全世界。⬇ 把 zoneView.ts 的 `wanted` 那一行
    //    改成恆 true（或把 `view: true` 從 schema 拿掉）這一條就紅。
    expect(seenByA.size).toBeGreaterThan(0);
    expect(seenByA.size).toBeLessThan(everything.size);
    expect(seenByB.size).toBeLessThan(everything.size);
    // ⭐ 機制②：他拿到的**每一個**實體都在他看得到的 zone 裡（⛔ 不是「大部分」）。
    for (const zone of seenByA.values()) expect(zone < 0 || zone === zones[0]).toBe(true);
    for (const zone of seenByB.values()) expect(zone < 0 || zone === zones[1]).toBe(true);
    // ⭐ 機制③：兩個人合起來仍然涵蓋全世界 —— 剔除是**分配**，⛔ 不是遺失。
    for (const id of everything.keys()) expect(seenByA.has(id) || seenByB.has(id)).toBe(true);
    // 記帳自己要誠實（`/healthz` 與報告都讀它）。
    expect(stats.total).toBe(everything.size);
    expect(stats.culledFraction).toBeGreaterThan(0);
    // 沒有 view 的那一條路：view-tagged 欄位走另一個 changeset ⇒ 一個實體都沒有。
    // ⚠️ 這就是 MatchRoom.onJoin / ReplayRoom 必須指派 view 的理由。
    expect(worldIds.size).toBe(0);
  });

  it("自己的決鬥分出勝負之後，還活著的每一區都送得到（觀戰不會看到空競技場）", () => {
    const { ctl, state, encoder, zones } = fixture();
    const a: ViewClient = { sessionId: "A" };
    const sync = new ZoneViewSync(true);
    // A 在 zones[0]，而 zones[0] 已經不在 live 名單裡 ⇒ 他可以按「前往觀戰」。
    sync.sync(state, [a], sourceOf(ctl, { A: [zones[0]!] }, [zones[1]!]));
    const seen = decodeZones(encodeFor(encoder, a));
    const zonesSeen = new Set(seen.values());
    expect(zonesSeen.has(zones[0]!)).toBe(true);
    expect(zonesSeen.has(zones[1]!)).toBe(true);
  });

  it("旋鈕關掉 ⇒ 逐位元回到今天：每個客戶端解碼得到全世界", () => {
    const { ctl, state, encoder, zones } = fixture();
    const a: ViewClient = { sessionId: "A" };
    const sync = new ZoneViewSync(false);
    const stats = sync.sync(state, [a], sourceOf(ctl, { A: [zones[0]!] }, zones));
    const seen = decodeZones(encodeFor(encoder, a));
    expect(seen.size).toBe(stats.total);
    expect(stats.culledFraction).toBe(0);
  });

  it("算不出 zone 的連線（還沒坐下／純觀眾）⇒ 全部可見，⛔ 不是什麼都看不到", () => {
    expect(visibleZonesForConnection([], [0, 1])).toBeNull();
    // 自己那場還在打 ⇒ 只有自己那一區
    expect(visibleZonesForConnection([0], [0, 1])).toEqual([0]);
    // 自己那場結束了 ⇒ 自己那區 + 全部還活著的區
    expect(visibleZonesForConnection([0], [1])).toEqual([0, 1]);
    // 旋鈕
    expect(resolveSnapshotZoneCull({})).toBe(true);
    expect(resolveSnapshotZoneCull({ GGD_SNAPSHOT_ZONE_CULL: "0" })).toBe(false);
    expect(resolveSnapshotZoneCull({ GGD_SNAPSHOT_ZONE_CULL: "nonsense" })).toBe(true);
  });
});

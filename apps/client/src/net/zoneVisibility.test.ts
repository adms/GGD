/**
 * L3 客戶端 zone 剔除的行為守衛。
 *
 * ── 為什麼這一支測的是真的 `InterpolationBuffer` ────────────────────────────
 * 失敗形態 ⑤ 是「被測的不是出貨的那個」。所以這裡不假造緩衝、不假造剔除規則：
 * `ingestZonedTransforms` **就是** `GameApp.onStatePatch` 呼叫的那個函式
 * (見 GameApp.ts 的 `ingestZonedTransforms(state.entities, this.visibleZones, …)`)，
 * 而 `InterpolationBuffer` 是出貨的那一個類別。斷言讀的是
 * `buf.sample()` —— 玩家最終看到的那個姿勢物件，不是中間屬性(失敗形態 ⑦)。
 *
 * ── 突變驗證(2026-07-30) ────────────────────────────────────────────────────
 * 1. 把 `zoneVisibility.ts` 裡 `if (!zones.has(es.zone)) return;` 刪掉
 *    → 「別區的實體不進插值緩衝」「切換 zone 會回收舊區的緩衝」共 4 條紅。
 * 2. 把 `VisibleZones.end()` 的 `if (this.list.length === 0) this.everything = true;`
 *    刪掉 → 「算不出 zone 時一律放行」1 條紅(空集合會把全世界剔光)。
 * 3. 把 `VisibleZones.has()` 的 `if (this.everything) return true;` 刪掉
 *    → 同上那一條紅。
 * 4. 把 `has()` 的 `if (!Number.isInteger(zone) || zone < 0) return true;`
 *    刪掉 → 「歸不了戶的實體留著」1 條紅。
 * 5. 把 `GameApp.refreshVisibleZones` 的 `zones.add(this.spectateZoneByPlayer.get(p))`
 *    刪掉 → GameApp.zoneCull.test.ts 的觀戰那一條紅(見該檔)。
 * 6. 把 `refreshVisibleZones` 的 `zones.add(this.ownZoneOf(p, state))` 刪掉
 *    → GameApp.zoneCull.test.ts 的「自己那一區永遠留著」那一條紅。
 */
import { describe, it, expect } from "vitest";
import { InterpolationBuffer } from "./InterpolationBuffer";
import { VisibleZones, ingestZonedTransforms, type ZonedTransform } from "./zoneVisibility";

/** 一份兩區的快照：zone 0 三個實體、zone 1 三個實體，都在原地走一步。 */
function snapshot(tick: number): ZonedTransform[] {
  const out: ZonedTransform[] = [];
  for (const zone of [0, 1]) {
    for (let i = 0; i < 3; i++) {
      const id = zone * 100 + i;
      out.push({ id, zone, x: id + tick * 0.5, z: zone * 40, fx: 1, fz: 0, h: 0 });
    }
  }
  return out;
}

/** 把 `ticks` 份快照餵進緩衝，回傳緩衝(出貨路徑，不是複製品)。 */
function feed(zones: VisibleZones, ticks: number, buf = new InterpolationBuffer()): InterpolationBuffer {
  const seen = new Set<number>();
  for (let t = 1; t <= ticks; t++) ingestZonedTransforms(snapshot(t), zones, t, buf, seen);
  return buf;
}

function only(...list: number[]): VisibleZones {
  const z = new VisibleZones();
  z.begin();
  for (const v of list) z.add(v);
  z.end();
  return z;
}

describe("L3 · 別區的實體不進插值緩衝", () => {
  it("只看 zone 0 時，zone 1 的實體 sample 不出任何姿勢", () => {
    const buf = feed(only(0), 4);
    // 本區照舊有姿勢可取(否則這條測試對「全部剔光」也會過 —— 失敗形態 ④)
    for (const id of [0, 1, 2]) {
      expect(buf.sample(id, 3.5), `zone 0 的 #${id} 應該還在`).not.toBeNull();
    }
    for (const id of [100, 101, 102]) {
      expect(buf.sample(id, 3.5), `zone 1 的 #${id} 不該進緩衝`).toBeNull();
      expect(buf.has(id)).toBe(false);
    }
  });

  it("剔除的省下的是真的工作量：緩衝裡只剩一半的實體", () => {
    const all = feed(new VisibleZones(), 4); // 全新 = everything
    const culled = feed(only(0), 4);
    let allCount = 0;
    let culledCount = 0;
    for (const e of snapshot(1)) {
      if (all.has(e.id)) allCount++;
      if (culled.has(e.id)) culledCount++;
    }
    expect(allCount).toBe(6);
    expect(culledCount).toBe(3);
  });
});

describe("L3 · 觀戰切到別區時，那一區的實體要進得來", () => {
  it("加入 zone 1 之後，zone 1 的實體開始累積姿勢，而且 zone 0 沒有被換掉", () => {
    const zones = only(0);
    const buf = feed(zones, 4);
    expect(buf.sample(100, 3.5)).toBeNull(); // 還沒觀戰

    // 玩家按下「前往觀戰」→ GameApp.refreshVisibleZones 會把兩個 zone 都加進來
    // (自己的區 + 觀戰的區)。這裡重現那個集合。
    const watching = only(0, 1);
    feed(watching, 8, buf);

    const pose = buf.sample(100, 7.5);
    expect(pose, "切到別區之後那一區的實體必須進得來 —— 否則畫面是空競技場").not.toBeNull();
    // 而且是真的位置，不是原點殘留
    expect(pose!.z).toBe(40);
    // 自己那一區同時還在(並存，不是取代)
    expect(buf.sample(0, 7.5), "觀戰不可以把自己那一區換掉").not.toBeNull();
  });

  it("新進來的第一筆樣本不會被誤判成瞬移(空緩衝沒有前一筆)", () => {
    const buf = feed(only(0), 4);
    // zone 1 的 #100 在 x 已經跑了很遠之後才第一次被看到
    feed(only(0, 1), 40, buf);
    const early = buf.sample(100, 39.2);
    const late = buf.sample(100, 39.8);
    expect(early).not.toBeNull();
    expect(late).not.toBeNull();
    // 有在動 = 沒有被 snap 卡住(卡住的話兩個 renderTick 會給同一個 x)
    expect(late!.x).toBeGreaterThan(early!.x);
  });

  it("觀戰結束回自己那一區時，別區的緩衝被回收", () => {
    const buf = feed(only(0, 1), 6);
    expect(buf.has(100)).toBe(true);
    feed(only(0), 8, buf); // 觀戰撤回
    expect(buf.has(100), "別區的 ring buffer 應該被 prune 掉，而不是永遠留著").toBe(false);
    expect(buf.has(0)).toBe(true);
  });
});

describe("L3 · 失效方向是安全的(算不出 zone 就全部放行)", () => {
  it("一個 zone 都加不出來 → everything，六個實體全部進緩衝", () => {
    const zones = new VisibleZones();
    zones.begin();
    zones.add(null); // 還沒選角
    zones.add(undefined); // 沒有觀戰目標
    zones.end();
    expect(zones.isEverything).toBe(true);

    const buf = feed(zones, 4);
    for (const e of snapshot(1)) {
      expect(buf.has(e.id), `#${e.id} 在「算不出 zone」時必須留著`).toBe(true);
    }
  });

  it("全新的 VisibleZones 預設就是全部可見(第一份快照到達之前)", () => {
    const zones = new VisibleZones();
    expect(zones.isEverything).toBe(true);
    expect(zones.has(0)).toBe(true);
    expect(zones.has(7)).toBe(true);
  });

  it("歸不了戶的 zone(負數／非整數)一律視為可見", () => {
    const zones = only(0);
    expect(zones.isEverything).toBe(false);
    expect(zones.has(-1)).toBe(true);
    expect(zones.has(Number.NaN)).toBe(true);
    expect(zones.has(1)).toBe(false);
  });
});

describe("L3 · VisibleZones 的集合語意", () => {
  it("自己的區 + 觀戰的區並存，重複的 zone 不會塞兩份", () => {
    const zones = only(0, 1, 0, 1);
    expect(zones.size).toBe(2);
    expect(zones.has(0)).toBe(true);
    expect(zones.has(1)).toBe(true);
    expect(zones.has(2)).toBe(false);
  });

  it("begin() 會真的清掉上一份 —— 集合不會單向長大", () => {
    const zones = new VisibleZones();
    zones.begin();
    zones.add(1);
    zones.end();
    expect(zones.has(1)).toBe(true);
    zones.begin();
    zones.add(0);
    zones.end();
    expect(zones.has(1), "上一幀觀戰的 zone 必須跟著撤回一起消失").toBe(false);
    expect(zones.has(0)).toBe(true);
  });

  it("負數／非整數的 zone 加不進集合(不會把 everything 意外解除)", () => {
    const zones = new VisibleZones();
    zones.begin();
    zones.add(-1);
    zones.add(1.5);
    zones.end();
    expect(zones.isEverything).toBe(true);
  });
});

/**
 * ⭐⭐ GH#1005 —— **出貨技能文件裡有 `castTimeSec` 的，載入後（真的 `registerAll`）也必須有，而且是同一個數。**
 *
 * ── ⛔ 這張票的前提是假的，而這一支是把「載入器吃掉一格」這條路關起來的閘 ──────────
 * 2026-09-05 CI 印出「7 支的 `castTimeSec=undefined`，而 JSON 與英雄卡鏡射兩份都有值」，
 * 票文於是寫「剩下的差異只有作業系統」。⭐ 2026-09-06 在沙盒上逐步重現（報告
 * `docs/_reports/1005_temp_*.md`）：那 7 支 **正好** = `batch1.py` 擁有的 91 支 ∩ `castTimeSec > 1`
 * —— `batch1.py` 照 RETIRED 先把 `castTimeSec` **丟掉**寫進磁碟，`deriveCastTimes --write` 之後才補回；
 * 在那個窗裡讀樹的人（當時 `unit` job 裡一支會重寫出貨樹的測試，GH#1002）看到的就是「磁碟沒有」。
 * ⇒ ⭐ 載入器一個位元組都沒吃 —— 它誠實地回報了一棵**寫到一半的樹**。
 *
 * ⚠️ 但「載入器今天沒吃」⛔ 不等於「載入器不會吃」：`withTiersCore` 那疊解析層、
 * `expandIfTemplated`、`registerChampion.fillGaps` 每一層都有機會把這一格弄掉或憑空長出來
 * （2026-08-13 模板展開就真的吃過 5 支，見 `templates/expand.ts` 的 `authoredCastTime`）。
 * ⇒ 這一支用**出貨內容**跑**出貨的**載入路徑（`ContentLoader` + `FsContentSource` + `registerAll`，
 * ⛔ 不自造夾具 —— 失敗形態⑤），把**兩個方向**都關起來，紅的時候**指名那一支**。
 *
 * MUTATION LOG（落地時跑過）：`castTimeTiers.ts::resolveCastTimeTierOnDoc` 在級距缺席時
 * 改回 `{ ...def, castTimeSec: undefined }` ⇒ 🔴，訊息逐支列「磁碟 2 → 登錄表 undefined」。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { registerAll } from "./registries";
import { Abilities, Champions } from "../sim/content/registry";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const SLOTS = ["Q", "W", "E", "R"] as const;

interface DiskCast {
  /** `content/abilities/<id>.json` 自己寫的值。 */
  standalone: number | undefined;
  /** 英雄卡鏡射寫的值（`registerChampion.fillGaps` 只准**補**，⛔ 不准蓋）。 */
  mirror: number | undefined;
  /** 這一份還有別的合法來源（模板參數／`castTimeTier` 級距）⇒ 值可以不同，⛔ 但不可以消失。 */
  otherSource: boolean;
}
type Lookup = (id: string) => { castTimeSec?: number } | undefined;

/** ⭐ 兩個方向的漂移，純函式 —— 下面的 sentinel 拿假的 lookup 餵它（單邊校準的尺會在最需要說話時沉默）。 */
function castTimeDrift(disk: ReadonlyMap<string, DiskCast>, lookup: Lookup): string[] {
  const out: string[] = [];
  for (const [id, d] of disk) {
    const got = lookup(id)?.castTimeSec;
    const onDisk = d.standalone ?? d.mirror;
    if (onDisk !== undefined) {
      // ① 磁碟有 ⇒ 登錄表要有；沒有第二個來源時還要是**同一個數**。
      if (got === undefined) out.push(`${id}: 磁碟 ${onDisk} → 登錄表 undefined`);
      else if (!d.otherSource && got !== onDisk) out.push(`${id}: 磁碟 ${onDisk} → 登錄表 ${got}`);
    } else if (!d.otherSource && got !== undefined) {
      // ② 磁碟哪裡都沒有 ⇒ 登錄表不可以憑空長出一格（反方向）。
      out.push(`${id}: 磁碟沒有 → 登錄表憑空 ${got}`);
    }
  }
  return out;
}

function readDocs(collection: string): Array<Record<string, unknown>> {
  const dir = join(CONTENT_DIR, collection);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>);
}

function readDisk(): Map<string, DiskCast> {
  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
  const other = (d: Record<string, unknown>): boolean => d["template"] != null || typeof d["castTimeTier"] === "string";
  const disk = new Map<string, DiskCast>();
  for (const d of readDocs("abilities")) {
    disk.set(d["id"] as string, { standalone: num(d["castTimeSec"]), mirror: undefined, otherSource: other(d) });
  }
  for (const c of readDocs("champions")) {
    const abilities = (c["abilities"] ?? {}) as Record<string, Record<string, unknown> | undefined>;
    for (const slot of SLOTS) {
      const m = abilities[slot];
      if (!m) continue;
      const id = m["id"] as string;
      const prev = disk.get(id) ?? { standalone: undefined, mirror: undefined, otherSource: false };
      disk.set(id, { ...prev, mirror: prev.mirror ?? num(m["castTimeSec"]), otherSource: prev.otherSource || other(m) });
    }
  }
  return disk;
}

let disk: Map<string, DiskCast>;

beforeAll(async () => {
  // ⭐ 出貨的那條路：server / `loadContentCached` 的 miss 路徑就是這兩支。
  const r = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  expect(r.quarantined).toEqual([]);
  registerAll(r.store);
  disk = readDisk();
});

describe("GH#1005 —— castTimeSec 磁碟 ↔ 登錄表（出貨內容 × 出貨載入路徑）", () => {
  it("⭐ 磁碟有的載入後還在、而且是同一個數；磁碟沒有的不會憑空長出來", () => {
    expect(castTimeDrift(disk, (id) => Abilities.tryGet(id as never))).toEqual([]);
    // 守衛的守衛：母體要真的是整棵出貨樹，⛔ 不是 3 份文件。
    const withValue = [...disk.values()].filter((d) => d.standalone !== undefined).length;
    expect(disk.size).toBeGreaterThan(0);
    expect(withValue).toBeGreaterThan(0);
  });

  it("⭐ 英雄卡那一份（`Champions.get().abilities[slot]`）與 `Abilities` 是同一個數 —— 影子不可以分家", () => {
    const split: string[] = [];
    for (const c of Champions.all()) {
      for (const slot of SLOTS) {
        const emb = c.abilities[slot];
        const reg = Abilities.tryGet(emb.id);
        if (reg === undefined || reg.castTimeSec !== emb.castTimeSec) {
          split.push(`${c.id}.${slot} (${emb.id}): 英雄卡 ${String(emb.castTimeSec)} vs 登錄表 ${String(reg?.castTimeSec)}`);
        }
      }
    }
    expect(split).toEqual([]);
  });

  it("⭐ sentinel：尺量得到兩個方向（拿掉一格 ⇒ 指名它；憑空一格 ⇒ 指名它）", () => {
    const victim = [...disk.entries()].find(([, d]) => d.standalone !== undefined && !d.otherSource)![0];
    const eaten = castTimeDrift(disk, (id) =>
      id === victim ? { ...Abilities.get(id as never), castTimeSec: undefined } : Abilities.tryGet(id as never),
    );
    expect(eaten).toEqual([`${victim}: 磁碟 ${disk.get(victim)!.standalone} → 登錄表 undefined`]);
    const ghost = new Map([["ggd-sentinel.q", { standalone: undefined, mirror: undefined, otherSource: false }]]);
    expect(castTimeDrift(ghost, () => ({ castTimeSec: 0.3 }))).toEqual(["ggd-sentinel.q: 磁碟沒有 → 登錄表憑空 0.3"]);
  });
});

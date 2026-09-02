/**
 * ⭐⭐ **演出契約收據不可能過期，而且每一格都是推導的**（Codex 阻塞清單 C）。
 *
 * Codex 逐字：「**Editor 缺欄位時會 fail closed，不會抄 Main 常數。**」
 * ⇒ ⭐ 那句話只有在收據**說實話**時才安全 ——
 * ⛔ 一格假的 `supported` 會讓對方做出一個**上線就是死的** fixture。
 *
 * ⚠️ 這正是第〇·五守則點名的紅線：
 * 「同一個 repo 已經有一份**手寫的** `SIM_CAPABILITIES`，
 *  而它的檔頭自己記錄了它**撒過兩次謊**⋯內部債可以忍，**對外契約不行**。」
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const RECEIPT = join(ROOT, "docs/editor-contract/ggd-presentation-receipt.json");

interface Receipt {
  schema: string;
  fingerprint: string;
  actorPulses: {
    vocabulary: string[];
    defaultWindowMs: Record<string, number>;
    animStates: string[];
    outsideClipMap: string[];
  };
  clipFallback: { candidates: Record<string, string[]>; policy: string; measured: string };
  replacementPolicy: { status: string; why: string; evidence: string };
  singleArc: { status: string; why: string; ids: string[]; params: string[] };
  evasionProvenance: { status: string; why: string };
  displaceCue: { status: string; why: string };
}

const r = JSON.parse(readFileSync(RECEIPT, "utf8")) as Receipt;

describe("演出契約收據（Codex C）", () => {
  it("⭐ `--check` 是綠的（紅了不要改收據：跑 `pnpm receipt:build` 然後 git add）", () => {
    // ⭐ 真的把產生器跑起來，⛔ 不是掃字串（失敗形態⑥）。
    execFileSync("pnpm", ["-s", "receipt:check"], { cwd: ROOT, stdio: "pipe" });
  });

  it("⭐⭐ 每一格能力都帶著**理由與出處** —— ⛔ 沒有無理由的 supported", () => {
    for (const k of ["replacementPolicy", "singleArc", "evasionProvenance", "displaceCue"] as const) {
      const c = r[k] as { status: string; why: string; evidence?: string };
      expect(["supported", "partial", "unsupported"], `${k} 的 status 不是三選一`).toContain(c.status);
      expect(c.why.length, `⛔ ${k} 沒有寫理由 ⇒ 對方讀不出它為什麼是這個狀態`).toBeGreaterThan(20);
      if (k !== "singleArc") {
        expect((c.evidence ?? "").length, `⛔ ${k} 沒有出處 ⇒ 它是一句無法反駁的散文`).toBeGreaterThan(10);
      }
    }
  });

  it("⭐ 脈衝詞彙與**出貨的那一份**逐字相同（⛔ 不是收據自己抄的）", async () => {
    const { ANIM_PULSES, PULSE_MS } = await import("../content/animPulse");
    expect(r.actorPulses.vocabulary).toEqual([...ANIM_PULSES]);
    expect(r.actorPulses.defaultWindowMs).toEqual({ ...PULSE_MS });
    // ⭐ 而「不進 clipMap 的那幾塊」要真的不在 6 格狀態裡
    for (const p of r.actorPulses.outsideClipMap) {
      expect(r.actorPulses.animStates, `⛔ ${p} 宣稱不進 clipMap 卻在狀態表裡`).not.toContain(p);
    }
  });

  it("⭐⭐ `singleArc` 宣稱的每一個 id **真的存在而且真的是單發**", () => {
    for (const id of r.singleArc.ids) {
      const doc = JSON.parse(
        readFileSync(join(ROOT, "content/vfx", `${id}.json`), "utf8"),
      ) as { burstCount?: number };
      expect(doc.burstCount, `⛔ 收據說 ${id} 是單發弧，而它不是`).toBe(1);
    }
    if (r.singleArc.status === "supported") {
      expect(r.singleArc.ids.length, "⛔ 宣稱 supported 而一顆都沒有").toBeGreaterThanOrEqual(8);
    }
  });

  it("⭐⭐⭐ 宣稱 **supported** 時，那個東西**真的在** —— ⛔ 這是承重的那一半", () => {
    // ⛔⛔ 這一條是 2026-09-02 突變抓出來補的：第一版**只驗了 unsupported 那一邊**
    //   ⇒ 把 `status` 硬寫成 `"supported"`（＝一句手寫的謊）**測試全綠**。
    // ⭐ 而這是兩個方向裡**更貴**的那一個：
    //   假的 unsupported ⇒ 對方白白繞路（浪費）；
    //   ⛔ 假的 supported ⇒ 對方做出一個**上線就是死的** fixture（第〇·五守則的紅線）。
    const evasion = readFileSync(join(ROOT, "packages/shared/src/sim/combat/evasion.ts"), "utf8");
    if (r.evasionProvenance.status !== "unsupported") {
      expect(
        /export interface EvadeEvent\b/.test(evasion),
        "⛔⛔ 收據宣稱迴避來源 provenance 可用，而 `EvadeEvent` 型別**根本不存在**\n" +
          "   ⇒ ⭐ 外部編輯器會照著做一個**上線就是死的** fixture。",
      ).toBe(true);
    }
    if (r.evasionProvenance.status === "supported") {
      expect(
        // ⚠️ 這裡第一版猜了一串可能的欄位名（`grantId|sourceIdentity|…`）——
        //   ⛔ 而實際的欄位叫 `by: EvadeSourceRef | null`。
        //   ⭐ 猜欄位名的守衛會**兩個方向都錯**：低報做好的、放行沒做的。
        //   ⇒ 問**出貨型別真的宣告了什麼**。
        /readonly by: EvadeSourceRef \| null/.test(evasion) &&
          /interface EvadeSourceRef/.test(evasion),
        "⛔⛔ 宣稱 supported，而 payload 裡**沒有 `by: EvadeSourceRef` 那一格**",
      ).toBe(true);
    }
    const leapSrc = readFileSync(join(ROOT, "packages/shared/src/sim/movement/leap.ts"), "utf8");
    const blinkSrc = readFileSync(join(ROOT, "packages/shared/src/sim/effects/blink.ts"), "utf8");
    if (r.displaceCue.status === "supported") {
      expect(
        /\bphase\b/.test(leapSrc + blinkSrc),
        "⛔⛔ 收據宣稱位移 cue 有 `phase`，而出貨的兩個發射點都沒有它",
      ).toBe(true);
    }
    if (r.replacementPolicy.status === "supported") {
      // ⭐⭐ 2026-09-02 機制換了：取代不再是「接縫 early-return」（那個做法會把
      //   **整條**預設演出一起吃掉），而是**逐實體 × 逐通道**的接管帳本。
      //   ⇒ 這一條跟著換成問**新機制的三段**，⛔ 不是刪掉承重的那一半。
      //
      // ⚠️ ⭐ 而它刻意用**比產生器更強的問法**：`heldBy` 必須在
      //   `playDefaultPresentation` **這個函式體內**被呼叫 —— ⛔ 不是「檔案裡有這個字」。
      //   （產生器只問「檔案裡有沒有」⇒ 兩份 receipt 用不同的問法問同一件事，
      //     ⭐ 產生器說謊時這一條會紅。）
      const schema = readFileSync(
        join(ROOT, "packages/shared/src/content/schema/vfxScript.ts"),
        "utf8",
      );
      expect(
        /replaces:\s*z\.enum\(PRESENTATION_CHANNELS\)/.test(schema),
        "⛔⛔ 收據宣稱有取代語意，而 schema **寫不出 `replaces`** ⇒ 編輯器根本宣告不了",
      ).toBe(true);

      const player = readFileSync(join(ROOT, "apps/client/src/vfx/VfxScriptPlayer.ts"), "utf8");
      expect(
        /channelTakeover\.claim\(/.test(player),
        "⛔⛔ 收據宣稱會接管，而播放器**從不登記** ⇒ 宣告了也不會發生",
      ).toBe(true);

      const reg = readFileSync(join(ROOT, "apps/client/src/render/EntityViewRegistry.ts"), "utf8");
      const fn = reg.indexOf("private playDefaultPresentation(");
      expect(fn, "⛔ 找不到預設演出的入口 ⇒ 這條在量空氣").toBeGreaterThan(0);
      const body = reg.slice(fn, reg.indexOf("\n  }", fn));
      expect(
        /channelTakeover\.heldBy\(/.test(body),
        "⛔⛔ 收據宣稱會壓制，而 `playDefaultPresentation` **播之前不問** ⇒ 兩條都跑",
      ).toBe(true);
    }
  });

  it("⭐⭐ **三格 unsupported 的反方向**：宣稱不支援時，那個東西真的不在", () => {
    // ⚠️ 這一條防的是**相反**的謊：把一個已經做好的東西寫成 unsupported
    // ⇒ ⭐ 對方會白白繞路（`editorCapabilities.test.ts` 檔頭逐字記著這一半）。
    const evasion = readFileSync(join(ROOT, "packages/shared/src/sim/combat/evasion.ts"), "utf8");
    if (r.evasionProvenance.status === "unsupported") {
      expect(
        /export interface EvadeEvent\b/.test(evasion),
        "⛔ 收據說沒有來源 provenance，而 `EvadeEvent` 已經存在 ⇒ 對方白白繞路",
      ).toBe(false);
    }
    const leap = readFileSync(join(ROOT, "packages/shared/src/sim/movement/leap.ts"), "utf8");
    const blink = readFileSync(join(ROOT, "packages/shared/src/sim/effects/blink.ts"), "utf8");
    if (r.displaceCue.status === "unsupported") {
      expect(
        /\bphase\b/.test(leap + blink),
        "⛔ 收據說位移沒有 phase，而它已經有了 ⇒ 對方白白繞路",
      ).toBe(false);
    }
  });
});

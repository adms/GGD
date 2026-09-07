/**
 * enabledSwitchesHaveConsumers.test.ts —— ⭐ 「三個住處」的**第四格：消費端**（GH#1043）。
 *
 * owner 2026-09-06：「當初 AP 加成公式做完之後**為什麼沒有上線**？我想知道**開發流程上的疏漏**來改善」
 * ⇒ `ap-coefficient.enabled=true` 三個住處齊全、後台看得到，⛔ 而零個 production 讀取點活了 4 天（#1035）。
 * 這一支對出貨 `content/config/*.json` 裡**每一格** `enabled`（含巢狀，⛔ 不寫死 35）問：
 * 「哪一個 production 檔的哪一行讀了它，而那一行從出貨入口跑得到？」掃描器住同名 `.ts`（AST＋checker，⛔ 不是 grep）。
 *
 * ① 每一格都要有一個**活的、非中繼**的讀取點，或豁免表裡一列帶理由的豁免（訊息逐格指名）。
 * ② 豁免表只能變短：表裡的每一列今天都還是零消費端（幽靈列 ⇒ 紅並要求刪掉）；證據檔還在且含必含字串。
 * ③ 反方向（形態⑫）：production 程式裡每一個 `config.<id>@N` 字面值都要真的出貨，否則要在 `absentConfigTags` 帶理由。
 *
 * 突變（2026-09-06 實測，掃描器的 `hideSite` 鉤子＝把消費端那一行從掃描結果遮掉）：
 *   · `GGD_ENABLED_HIDE=packages/shared/src/sim/effects/dispel.ts:29` ⇒ ① 紅，逐字指名 `content/config/dispel.json:enabled`
 *   · 在 production 檔加一行 `"config.nope@1"` 字面值 ⇒ ③ 紅並指名那一行
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scanEnabledSwitches, type EnabledSwitch, type ReadSite } from "./enabledSwitchesHaveConsumers";

const ROOT = join(__dirname, "../../../..");
type Evidence = { file: string; mustContain: string[] };
type Exemption = { switch: string; kind: string; reason: string; evidence?: Evidence[] };
const EX = JSON.parse(readFileSync(join(__dirname, "enabledSwitches.exemptions.json"), "utf8")) as {
  exemptions: Exemption[];
  absentConfigTags: { tag: string; reason: string }[];
};
const keyOf = (sw: EnabledSwitch) => `${sw.file}:${sw.path.join(".")}`;
const hide = process.env["GGD_ENABLED_HIDE"];
const res = scanEnabledSwitches(ROOT, hide ? { hideSite: (s: ReadSite) => `${s.file}:${s.line}` === hide } : {});
const fmt = (s: ReadSite) => `${s.file}:${s.line}${s.live ? "" : "（跑不到）"}${s.relay ? "（只抄不讀）"}`;

describe("每一格 enabled 都要有消費端（GH#1043）", () => {
  it("① 逐格：有活的非中繼讀取點，或帶理由的豁免", () => {
    expect(res.switches.length, "母體：出貨 config 裡至少要掃到 30 格 enabled").toBeGreaterThan(30);
    expect(res.population.reachableFiles, "活性圖壞了會安靜地把全部標成跑不到").toBeGreaterThan(res.population.prodFiles / 2);
    const exempt = new Set(EX.exemptions.map((e) => e.switch));
    const bad = res.switches
      .filter((sw) => res.consumersOf(sw).length === 0 && !exempt.has(keyOf(sw)))
      .map((sw) => {
        const near = res.attributedTo(sw).map(fmt);
        return `⛔ ${keyOf(sw)}（出貨 ${sw.value}）—— 零個 production 消費端` + (near.length ? `；只找到：${near.join(" · ")}` : "");
      });
    expect(bad, `裝飾開關（三個住處齊全、後台看得到、沒有人讀）：\n${bad.join("\n")}\n⇒ 接上消費端，或在 enabledSwitches.exemptions.json 帶一個能被反駁的理由`).toEqual([]);
  });

  it("② 豁免表只能變短：每一列今天仍是零消費端，證據檔還在", () => {
    const byKey = new Map(res.switches.map((sw) => [keyOf(sw), sw]));
    const problems: string[] = [];
    for (const e of EX.exemptions) {
      const sw = byKey.get(e.switch);
      if (!sw) problems.push(`幽靈列：${e.switch} 不在出貨 config 裡 ⇒ 刪掉這一列`);
      else if (res.consumersOf(sw).length > 0) problems.push(`幽靈列：${e.switch} 今天有消費端（${res.consumersOf(sw).map(fmt).join(" · ")}）⇒ 刪掉這一列`);
      if (!e.reason?.trim()) problems.push(`${e.switch} 沒有理由`);
      for (const ev of e.evidence ?? []) {
        const p = join(ROOT, ev.file);
        if (!existsSync(p)) problems.push(`${e.switch} 的證據檔 ${ev.file} 不存在`);
        else for (const t of ev.mustContain) if (!readFileSync(p, "utf8").includes(t)) problems.push(`${e.switch} 的證據 ${ev.file} 已不含「${t}」`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("③ 反方向：production 讀到的 config 標籤都要真的出貨", () => {
    const allowed = new Map(EX.absentConfigTags.map((a) => [a.tag, a.reason]));
    const absent = res.literalTags.filter((t) => !res.shippedTags.has(t.tag));
    const bad = absent.filter((t) => !allowed.has(t.tag)).map((t) => `${t.tag} @ ${t.file}:${t.line}`);
    expect(bad, "讀了一份不存在的 config（形態⑫）").toEqual([]);
    const ghosts = [...allowed.keys()].filter((tag) => res.shippedTags.has(tag) || !absent.some((t) => t.tag === tag));
    expect(ghosts, "absentConfigTags 的幽靈列（已出貨或已無人讀）⇒ 刪掉").toEqual([]);
  });
});

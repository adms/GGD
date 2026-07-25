/**
 * TASK #227 — championDisplay: the champion id → what a PLAYER reads.
 *
 * The lobby store printed `godie-zombiex` because nothing in its data path ever
 * carried a name. These tests pin the three properties the store depends on:
 * a real name is split into 稱號/全名, a missing name degrades to the id (and
 * SAYS SO via `named`), and the multi-section w3x `description` is squashed to
 * one printable 故事 line instead of being dumped raw into a table row.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { BLURB_MAX_CHARS, championBlurb, championDisplayFrom } from "./championDisplay";

const W3X_DESCRIPTION = [
  "故事：來自雛見澤的少女，笑起來很可怕。",
  "推薦玩家：喜歡近戰的玩家",
  "上手度：★★☆",
  "角色成長：力量 2.5 / 敏捷 1.8 / 智力 1.2",
  "可學習的技能：鬼隱、綿流、目明",
].join("\n");

describe("#227 champion display strings", () => {
  it("splits 「稱號 - 全名」 and reports that a real name was found", () => {
    cover("webui-catalog-derive");
    const d = championDisplayFrom("godie-zombiex", "聖杯黑泥醬 - 喪標麥可", null);
    expect(d.named).toBe(true);
    expect(d.name).toBe("聖杯黑泥醬 - 喪標麥可");
    expect(d.title).toBe("聖杯黑泥醬");
    expect(d.fullName).toBe("喪標麥可");
    expect(d.name).not.toContain("godie-"); // the id never leaks into the label
  });

  it("degrades to the id — and flags it — when no content doc is registered", () => {
    cover("webui-catalog-derive");
    for (const missing of [null, undefined, "", "   "]) {
      const d = championDisplayFrom("godie-zombiex", missing, null);
      expect(d.named).toBe(false);
      expect(d.name).toBe("godie-zombiex");
      expect(d.fullName).toBe("godie-zombiex");
      expect(d.title).toBeNull();
    }
  });

  it("names with no 稱號 (sela/thorne) keep the whole name and carry no title", () => {
    cover("webui-catalog-derive");
    const d = championDisplayFrom("sela", "Sela", null);
    expect(d.named).toBe(true);
    expect(d.title).toBeNull();
    expect(d.fullName).toBe("Sela");
  });

  it("blurb takes ONLY the 故事 section — not the stat block or the skill list", () => {
    cover("webui-catalog-derive");
    const blurb = championBlurb(W3X_DESCRIPTION);
    expect(blurb).toBe("來自雛見澤的少女，笑起來很可怕。");
    expect(blurb).not.toContain("上手度");
    expect(blurb).not.toContain("可學習的技能");
    expect(blurb).not.toContain("\n"); // one printable line, never a blob
  });

  it("a missing/blank description yields \"\" — no empty box, never \"undefined\"", () => {
    cover("webui-catalog-derive");
    for (const empty of [null, undefined, "", "\n  \n"]) {
      expect(championBlurb(empty)).toBe("");
      expect(championDisplayFrom("godie-h02r", "無 - 某人", empty).blurb).toBe("");
    }
    expect(championBlurb(undefined)).not.toContain("undefined");
  });

  it("free text with no recognised header still yields a line, clipped", () => {
    cover("webui-catalog-derive");
    const long = "很".repeat(BLURB_MAX_CHARS + 20);
    const blurb = championBlurb(long);
    expect(blurb.endsWith("…")).toBe(true);
    expect(blurb.length).toBe(BLURB_MAX_CHARS + 1);
    expect(championBlurb("就是一段沒有標頭的說明")).toBe("就是一段沒有標頭的說明");
  });
});

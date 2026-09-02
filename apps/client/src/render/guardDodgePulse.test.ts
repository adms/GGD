/**
 * ⭐⭐ **`guard` / `dodge` 兩塊動作積木真的接上了**（Codex 阻塞清單 P0-2）。
 *
 * ⚠️ Codex 逐字禁止的四件，這一支逐條釘住：
 * · ⛔ 完全不播放動作 · ⛔ 讓角色停止或消失
 * · ⛔ 將 `hurt` 當成唯一格擋動作 · ⛔ 回退到錯誤角色的剪輯
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ANIM_PULSES, PULSE_MS, isAnimPulse } from "@ggd/shared/content/animPulse";
import { zVfxScriptAnim } from "@ggd/shared/content/schema/vfxScript";
import { AnimationStateMachine } from "./anim/AnimationStateMachine";
import { resolveClips } from "./ClipAnimator";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("guard / dodge 動作積木（P0-2）", () => {
  it("⭐ 詞彙表有它們，而且**每一格都有窗**（tsc 的 Record 保證 + 執行期複驗）", () => {
    expect(ANIM_PULSES).toContain("guard");
    expect(ANIM_PULSES).toContain("dodge");
    for (const p of ANIM_PULSES) expect(PULSE_MS[p], `${p} 沒有剪輯窗`).toBeGreaterThan(0);
    expect(isAnimPulse("guard")).toBe(true);
    expect(isAnimPulse("dodge")).toBe(true);
  });

  it("⭐⭐ **VFX script schema 自動跟上** —— ⛔ 不必手動加一份 enum", () => {
    // ⭐ 這就是同一天做的「唯一住處」買到的東西：`z.enum(ANIM_PULSES)`。
    for (const pulse of ["guard", "dodge"] as const) {
      const r = zVfxScriptAnim.safeParse({ kind: "anim", on: "castEffect", pulse });
      expect(r.success, `⛔ schema 收不下 pulse:"${pulse}" ⇒ 編輯器寫不出來`).toBe(true);
    }
  });

  it("⭐ 狀態機吃得下它們，而且**蓋得過 hurt**（⛔ 擋成功不該演成挨打）", () => {
    const m = new AnimationStateMachine();
    m.trigger("guard", 0);
    m.trigger("hurt", 1); // ⛔ 後來的 hurt 不可以蓋掉 guard
    expect(m.update({ alive: true, moving: false }, 2)).toBe("guard");

    const m2 = new AnimationStateMachine();
    m2.trigger("dodge", 0);
    m2.trigger("hurt", 1);
    expect(m2.update({ alive: true, moving: false }, 2)).toBe("dodge");

    // ⭐ 而施法仍然蓋得過它們（那是玩家自己按的）
    const m3 = new AnimationStateMachine();
    m3.trigger("guard", 0);
    m3.trigger("cast", 1);
    expect(m3.update({ alive: true, moving: false }, 2)).toBe("cast");
  });

  it("⭐⭐ 缺 clip 的 fallback：⛔ **不是 hurt**，而且**看得見**", () => {
    // ⛔ Codex 逐字：「不得將 `hurt` 當成唯一格擋動作」
    const src = readFileSync(join(ROOT, "apps/client/src/render/ClipAnimator.ts"), "utf8");
    const block = src.slice(src.indexOf("guard: ["), src.indexOf("];", src.indexOf("guard: [")));
    expect(block, "⛔ guard 的候選裡有 hurt —— Codex 逐字禁止").not.toContain('"hurt"');
    const dodgeBlock = src.slice(src.indexOf("dodge: ["), src.indexOf("];", src.indexOf("dodge: [")));
    expect(dodgeBlock, "⛔ dodge 的候選裡有 hurt").not.toContain('"hurt"');

    // ⭐ 而候選**真的解析得到**出貨模型上普遍存在的剪輯名。
    //   `attack defend` 21 顆 · `walk` 171 顆（264 顆 glb 的普查）。
    const withDefend = resolveClips([{ name: "Attack Defend" }, { name: "Stand" }]);
    expect(withDefend.get("guard"), "⛔ `Attack Defend` 解析不到 guard").toBeDefined();
    const withWalk = resolveClips([{ name: "Walk" }, { name: "Stand" }]);
    expect(withWalk.get("dodge"), "⛔ `Walk` 解析不到 dodge").toBeDefined();

    // ⭐⭐ 而**完全沒有**候選時：⛔ 不可以解析到別的狀態的剪輯（那是「錯的動作」）。
    const bare = resolveClips([{ name: "Stand" }, { name: "Death" }]);
    expect(bare.get("guard"), "⛔ 沒有候選時 guard 竟然解析到東西了").toBeUndefined();
    // ⇒ ⭐ `ClipAnimator.start()` 這時退回 idle 並**警告一次**（fail-loud），
    //   ⛔ 而 idle 是循環的 ⇒ 角色**不會**停住或消失。
    expect(bare.get("idle"), "⛔ 連 idle 都解析不到 ⇒ 那才是「角色停住」").toBeDefined();
  });

  it("⭐ 消費端接的是**真事件**：`blocked` ⇒ guard · `evade` ⇒ dodge", () => {
    const reg = readFileSync(join(ROOT, "apps/client/src/render/EntityViewRegistry.ts"), "utf8");
    // ⛔ 掃字串是形態⑥ —— ⭐ 所以這裡驗的是**兩者的關係**：
    //   同一個 `hitImpact` 分支裡，`blocked` 為真走 guard、否則走 hurt。
    const i = reg.indexOf("view.triggerGuard(nowMs)");
    expect(i, "⛔ 沒有任何地方呼叫 triggerGuard ⇒ 這塊積木沒有消費端").toBeGreaterThan(0);
    const window = reg.slice(i - 400, i + 200);
    expect(window, "⛔ guard 不是掛在 `blocked` 上").toContain("ev.data.blocked === true");
    expect(window, "⛔ 沒擋到的那一半不再播 hurt 了").toContain("view.triggerHurt(nowMs)");
    expect(reg, "⛔ `evade` 沒有接到 dodge").toContain("triggerDodge(nowMs)");
  });
});

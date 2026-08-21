/**
 * 「錄影預設是開的」—— 讀**出貨的那一份**，不是程式常數。
 *
 * owner 2026-08-02：「請幫我預設打開，就算玩到一半就離開也應該有 replay 才對」
 *
 * ⚠️ 這一支存在的理由就是失敗形態 ⑤（**被測的不是出貨的那個**）。
 * 對 `DEFAULT_REPLAY_POLICY.enabled` 斷言 `true` 是一條永遠綠的廢話 —— 它只是
 * 把常數抄一遍。玩家實際跑的是 `content/config/replay.json`（會被打包進
 * `bundle.json`、live bind-mount 上線），所以這裡讀的是那個檔案的位元組，
 * 而且是用**出貨的 Zod schema** 驗過之後才斷言。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zConfigReplayDoc } from "./schema/config";
import { DEFAULT_REPLAY_POLICY, replayPolicyFromDoc, retainIsUnlimited } from "./replayPolicy";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SHIPPED = join(REPO_ROOT, "content", "config", "replay.json");

function shippedDoc(): unknown {
  return JSON.parse(readFileSync(SHIPPED, "utf8"));
}

describe("對戰錄影政策 —— 出貨的那一份 (replay-shipped-default-on)", () => {
  it("content/config/replay.json 通過出貨 schema，而且**錄影是開著的**", () => {
    const parsed = zConfigReplayDoc.parse(shippedDoc());
    expect(parsed.enabled, "出貨的錄影開關是關的 —— owner 明說要預設打開").toBe(true);
  });

  it("解析出貨檔得到的政策，和缺文件時的退路完全一樣", () => {
    // 兩邊一致才代表「刪掉這份文件」不會偷偷改變任何行為。任何一邊被改而另一邊
    // 沒改（例如有人把 flushIntervalMs 調小卻只改了常數）都會在這裡紅。
    expect(replayPolicyFromDoc(shippedDoc())).toEqual(DEFAULT_REPLAY_POLICY);
  });

  it("每一格出貨值都落在 schema 宣告的上下界之內（兩端都有界）", () => {
    const shape = zConfigReplayDoc.shape;
    // 直接把每一格換成越界值再丟回 schema：如果哪一格其實沒有上界，
    // 這裡的「應該被拒」就會落空。
    // ⚠️ 下界逐格不同：兩格保留量的合法下界是 **0**（GH#498 的「不限／不刪」哨兵），
    // 所以它們的越界值是 -1。⛔ 不可以三格共用同一個 0 —— 那會讓「0 被接受了」
    // 這件事看起來像退步，其實是 owner 要的行為。
    for (const [key, over, under] of [
      ["flushIntervalMs", 10_001, 49],
      ["retainMaxFiles", 5_001, -1],
      ["retainMaxAgeDays", 3_651, -1],
    ] as const) {
      expect(shape[key], `${key} 不在 schema 裡`).toBeDefined();
      const bad = { ...(shippedDoc() as Record<string, unknown>), [key]: over };
      expect(zConfigReplayDoc.safeParse(bad).success, `${key} 沒有上界 —— #277 的形狀`).toBe(false);
      const low = { ...(shippedDoc() as Record<string, unknown>), [key]: under };
      expect(zConfigReplayDoc.safeParse(low).success, `${key} 沒有下界`).toBe(false);
    }
  });

  it("⭐ 出貨的保留量是「不刪」—— owner 2026-08-21 的裁決 (GH#498)", () => {
    // ⛔ 不抄字面值 0：問的是**語意**（`retainIsUnlimited`），所以哪天哨兵換成
    // 別的表示法，這一條仍然在問同一件事。出貨檔改回 30 天 → 這裡紅。
    const p = replayPolicyFromDoc(shippedDoc());
    expect(retainIsUnlimited(p.retainMaxAgeDays), "出貨仍然會因為天數刪錄影 —— owner 說預設不刪除").toBe(true);
    expect(retainIsUnlimited(p.retainMaxFiles), "天數不刪了但份數還在刪 —— 第 201 場照樣會洗掉第 1 場").toBe(true);
  });

  it("⚠️ 缺文件／壞文件仍然**錄** —— 內容載入失敗不可以順手把錄影關掉", () => {
    expect(replayPolicyFromDoc(undefined).enabled).toBe(true);
    expect(replayPolicyFromDoc(null).enabled).toBe(true);
    expect(replayPolicyFromDoc({ schema: "config.roster@1" }).enabled).toBe(true);
    expect(replayPolicyFromDoc("not an object").enabled).toBe(true);
  });

  it("只有明確寫 false 才關；壞掉的數字逐格退回出貨值而不是整份作廢", () => {
    const off = replayPolicyFromDoc({ id: "replay", schema: "config.replay@1", enabled: false });
    expect(off.enabled).toBe(false);
    // enabled 是好的，flushIntervalMs 是垃圾 → 開關仍然生效，間隔退回出貨值。
    const partial = replayPolicyFromDoc({
      id: "replay",
      schema: "config.replay@1",
      enabled: true,
      flushIntervalMs: "很快" as unknown as number,
    });
    expect(partial.enabled).toBe(true);
    expect(partial.flushIntervalMs).toBe(DEFAULT_REPLAY_POLICY.flushIntervalMs);
  });

  it("越界的值被夾住，不是被靜默接受（#277：50 打成 500）", () => {
    const doc = { id: "replay", schema: "config.replay@1", enabled: true } as Record<string, unknown>;
    expect(replayPolicyFromDoc({ ...doc, flushIntervalMs: 0 }).flushIntervalMs).toBe(50);
    expect(replayPolicyFromDoc({ ...doc, flushIntervalMs: 999_999 }).flushIntervalMs).toBe(10_000);
    // ⚠️ 0 **不再**是越界值（GH#498：它是「不限」的哨兵），負數才是。
    expect(replayPolicyFromDoc({ ...doc, retainMaxFiles: -5 }).retainMaxFiles).toBe(0);
    expect(replayPolicyFromDoc({ ...doc, retainMaxFiles: 0 }).retainMaxFiles).toBe(0);
    expect(replayPolicyFromDoc({ ...doc, retainMaxAgeDays: 99_999 }).retainMaxAgeDays).toBe(3_650);
    // 壞掉的值仍然退回出貨值,⛔ 不是意外地變成「不限」。
    expect(replayPolicyFromDoc({ ...doc, retainMaxFiles: "很多" as unknown as number }).retainMaxFiles).toBe(
      DEFAULT_REPLAY_POLICY.retainMaxFiles,
    );
  });
});

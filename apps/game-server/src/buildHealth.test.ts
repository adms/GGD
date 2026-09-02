/**
 * ⭐ GH#949 —— `/healthz` 說得出「這台有沒有版本戳」，⛔ 而且**旋鈕預設不擋部署**。
 *
 * ⚠️ 這一支跑**出貨的那個 payload 建構子**（`buildHealthzPayload()` 刻意不吃參數，
 * 讀的是行程單例）⇒ ⛔ 它量不到一個測試自己捏的假 payload（失敗形態⑤）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { buildHealth, buildStampGateMode, classifyBuildStamp } from "./buildHealth";
import { buildHealthzPayload, healthzStatus } from "./healthz";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("build stamp 在 /healthz 上（GH#949）", () => {
  // ⭐⭐ **兩個方向都量** —— ⛔ 一把只驗過單邊的尺不算自證過。
  // ⚠️ 開發機上 `buildStamp()` **必然有答案**（repo 有 `.git`）
  // ⇒ 一支只呼叫 `buildHealth()` 的測試永遠跑不到回退那一支（失敗形態⑩）。
  // ⇒ 這兩條走的是**出貨路徑自己在用的**那個純函式。
  it('⭐ 已知**有**：真的戳記 ⇒ stamped true，且 source 指名是誰給的', () => {
    const env = classifyBuildStamp("v0.35.16-2-gabc1234 2026-09-02", "v0.35.16-2-gabc1234 2026-09-02");
    expect(env.stamped).toBe(true);
    expect(env.source).toBe("env");
    expect(env.note).toBeNull();

    const git = classifyBuildStamp("abc123def456", "");
    expect(git.stamped).toBe(true);
    expect(git.source, "⛔ env 空的時候答案只可能來自 .git/HEAD").toBe("git-head");
  });

  it('⭐⭐ 已知**沒有**：回退到 "dev" ⇒ stamped false，note 說得出「柵欄關著」', () => {
    const h = classifyBuildStamp("dev", "");
    expect(h.stamped).toBe(false);
    expect(h.source).toBe("fallback");
    expect(h.note, "⛔ 未戳記卻沒有一句人話 ⇒ fail-open 而**靜默**").toContain("柵欄");
  });

  it('⛔ 判準是**光禿禿的 "dev"** —— ⚠️ `dev-xxxx` 是 matchId，⛔ 不是版本', () => {
    // ⭐ 這一條釘住那句假註解的反面（`damageBoard.ts` 曾寫「dev 是 dev-<pid> 那一族」）。
    // 一個寫成 `startsWith("dev")` 的判斷會把真的叫 `dev-2` 的版本誤判成未戳記。
    expect(classifyBuildStamp("dev-8f21ac03", "").stamped).toBe(true);
    expect(classifyBuildStamp("dev", "").stamped).toBe(false);
  });

  it("⭐ 旋鈕預設是 warn —— ⛔ 部署不可以被一格徽章卡死", () => {
    delete process.env.GGD_BUILD_STAMP_HEALTHZ;
    expect(buildStampGateMode()).toBe("warn");
    process.env.GGD_BUILD_STAMP_HEALTHZ = "unhealthy";
    expect(buildStampGateMode()).toBe("unhealthy");
    process.env.GGD_BUILD_STAMP_HEALTHZ = "whatever";
    expect(buildStampGateMode(), "⛔ 認不得的值要落回 warn，⛔ 不是擋人").toBe("warn");
  });

  it("⭐ 出貨的 payload 真的帶著這一格（⛔ 不是我捏一個假的）", () => {
    const p = buildHealthzPayload();
    expect(p.build, "⛔ /healthz 沒有 build 這一格 ⇒ 沒有人看得到它退回了").toBeDefined();
    expect(typeof p.build.stamped).toBe("boolean");
    expect(typeof p.build.stamp).toBe("string");
    // ⭐ 預設 warn ⇒ 未戳記**不會**把狀態碼打成非 200。
    delete process.env.GGD_BUILD_STAMP_HEALTHZ;
    const q = buildHealthzPayload();
    if (!q.build.stamped && q.replay.ok && q.content.ok) {
      expect(q.ok, "⛔ 預設模式下未戳記把 shard 判成不健康了").toBe(true);
      expect(healthzStatus(q)).toBe(200);
    }
  });
});

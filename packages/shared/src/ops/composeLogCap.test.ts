import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐⭐ GH#862 —— **每一個容器都要有 log 上限**。
 *
 * ── ⚠️ 為什麼這個洞會「已關」又打開 ────────────────────────────────────────
 * 票文記著它**已關** —— 而關它的是 `scripts/host-migrate.sh`，
 * ⭐ 那一支寫的是 `/etc/docker/daemon.json` ＋ systemd：
 * **15 處 systemd / 0 處 macOS** ⇒ ⛔ 它是 **Linux 專用**的。
 *
 * ⇒ ⭐ 2026-08-29 搬到 Mac mini 之後，**沒有人跑過它** ——
 * 而 `mini-deploy.sh` / `mac-boot-guard.sh` 對 `max-size` / `log-opts` **零命中**
 * ⇒ ⛔ **出貨機上沒有任何 log 上限**，而票上寫著「已關」。
 *
 * ── ⭐ 所以修在 compose，⛔ 不在 daemon.json ──────────────────────────────
 * 一個住處管全部容器，⭐ **而且它跟著 repo 走** —— 換一台機器不會再掉一次。
 *
 * ⛔ 這條閘**只讀檔案**（⛔ 不跑 `docker compose config`）——
 * ⭐ CI 上不一定有 docker，而一條「環境不對就跳過」的閘等於沒有閘。
 */
const FAMILY = resolve(__dirname, "../../../../docker/compose.family.yaml");
const BASE = resolve(__dirname, "../../../../docker/compose.yaml");

/**
 * ⭐ 一個服務是不是**只在 dev profile 跑**。
 *
 * ⛔ 這**不是**手寫白名單 —— 它從 compose 自己的 `profiles:` 推導。
 * ⚠️ 手寫的豁免表會過期（新增一支 dev 服務就要記得補一行），
 * ⭐ 而「從出貨的東西推導」是第〇·七守則拆檔那三個必要條件的第 3 條。
 *
 * ⭐ 豁免的**理由**（一個能被反駁的理由，⛔ 不是「還沒排到」）：
 * `profiles:` 底下的服務**預設不啟動** ⇒ ⛔ 它在出貨機上一個位元組的 log 都不會寫。
 * ⚠️ 而它的 anchor `&ggd-logging` 住在 family overlay ⇒ 把 `*ggd-logging` 寫進
 * `compose.yaml` 會讓**單獨**跑 base 檔時 YAML 解析失敗（未定義的 anchor）。
 */
function devOnly(src: string, name: string): boolean {
  const i = src.indexOf(`\n  ${name}:\n`);
  if (i < 0) return false;
  const rest = src.slice(i + 1);
  const m = /\n {2}[a-z][a-z0-9-]*:\n/.exec(rest.slice(name.length + 2));
  const seg = m ? rest.slice(0, name.length + 2 + m.index) : rest;
  return /^ {4}profiles:/m.test(seg);
}

/** 一份 compose 檔裡 `services:` 底下的服務名（⛔ 不含 volumes / networks）。 */
function servicesOf(path: string): string[] {
  const src = readFileSync(path, "utf8");
  const i = src.indexOf("\nservices:\n");
  if (i < 0) return [];
  const rest = src.slice(i + "\nservices:\n".length);
  const end = rest.search(/\n(?:volumes|networks|configs|secrets):\n/);
  const body = end < 0 ? rest : rest.slice(0, end);
  return [...body.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map((m) => m[1]!);
}

describe("GH#862 容器的 log 上限", () => {
  const family = readFileSync(FAMILY, "utf8");

  it("量尺先自證：切得到服務清單（⛔ 空清單會讓下面空過）", () => {
    expect(servicesOf(BASE).length).toBeGreaterThanOrEqual(4);
    expect(family).toContain("x-logging: &ggd-logging");
    // ⭐ 豁免那一路也要自證：⛔ 一個永遠回 false 的 devOnly() 會讓豁免看起來「沒用到」，
    //   而一個永遠回 true 的會讓整條閘靜默放行**每一個**服務。⇒ 兩個方向都釘。
    expect(devOnly(readFileSync(BASE, "utf8"), "content-api")).toBe(true);
    expect(devOnly(readFileSync(BASE, "utf8"), "game")).toBe(false);
  });

  it("★ ⭐ **出貨的每一個服務都套到 log 上限**（⛔ 少一個那一個就會塞爆碟）", () => {
    const base = readFileSync(BASE, "utf8");
    const all = new Set(
      [...servicesOf(BASE), ...servicesOf(FAMILY)].filter(
        (s) => !devOnly(base, s) && !devOnly(family, s),
      ),
    );
    // ⚠️ ⭐ 段落要切到**下一個服務**（⛔ 不是下一個縮排兩格的行 —— 服務內的每一個
    //   key 都是四格，而註解與空行會讓 `indexOf("\n  ")` 提早收手）。
    const missing = [...all].filter((name) => {
      const i = family.indexOf(`\n  ${name}:\n`);
      if (i < 0) return true;
      const rest = family.slice(i + 1);
      const m = /\n {2}[a-z][a-z0-9-]*:\n/.exec(rest.slice(name.length + 2));
      const seg = m ? rest.slice(0, name.length + 2 + m.index) : rest;
      // ⛔⛔ ⛔ **不可以用 `includes("ggd-logging")`** —— 突變驗證抓到它：
      //   把那一行**註解掉**（`# logging: *ggd-logging`）之後閘仍然是**綠的**，
      //   ⭐ 因為註解裡也含有那幾個字 ⇒ 那是失敗形態⑥（掃原始碼字串代替行為）。
      // ⇒ ⭐ 要求它是一個**真的 YAML key**：行首只能有空白。
      return !/^[ \t]*logging:[ \t]*\*ggd-logging[ \t]*$/m.test(seg);
    });
    expect(
      missing,
      `⛔ 這幾個服務沒有 log 上限：${missing.join(", ")}\n` +
        `⭐ 修法：在 \`docker/compose.family.yaml\` 的那一段加 \`logging: *ggd-logging\`。\n` +
        `⚠️ ⛔ 不要改去 daemon.json —— 那一條**跟著機器走**，換一台就掉一次（2026-08-29 搬家就掉過）。`,
    ).toEqual([]);
  });

  it("⭐ 上限帶得出**數字**（⛔ 一個沒有 max-size 的 driver 不是上限）", () => {
    expect(family).toMatch(/max-size:\s*"?\d+[kmg]"?/i);
    expect(family).toMatch(/max-file:\s*"?\d+"?/);
  });
});

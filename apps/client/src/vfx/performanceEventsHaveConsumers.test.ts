/**
 * ⭐⭐ **每一個過線的事件都要有客戶端消費端 —— 或一列帶理由的豁免。**
 *
 * ── 為什麼這條守衛存在（2026-08-22 量到的）────────────────────────────────
 * `spawnModelFx` / `screenFlash` / `screenShake` / `floatingText` 四個 effect kind
 * 在 2026-08-22 落地：Zod 收得下、sim 真的發事件、`eventFanout` 白名單也放行了、
 * 出貨內容有 10 份文件在用、`content:build` 綠、**全套 11,600 條測試全綠**。
 * ⛔ 而客戶端**沒有任何一個消費端**。
 *
 * ── ⛔⛔ 而這條守衛自己在 2026-08-23 之前**說謊** ──────────────────────────
 * 它只問「`PERFORMANCE_EVENTS` 這**四個手打的名字**有沒有 case」。於是同一天的
 * 窮舉稽核（118 個 `world.emit` 對全部消費端逐欄位比對）抓到**七則**同型的零消費端
 * 事件時，這條守衛是**全綠**的 —— 因為那七個名字不在那張手打的清單上。
 *
 * ⭐ 手打的清單只證明「清單上的東西有做」，⛔ 它證明不了「沒有東西被漏掉」。
 * ⇒ 現在的普查範圍是 `FANNED_OUT_EVENT_TYPES` **整份**，而每一則都必須落在
 * 三格之一（⛔ 沒有第四格「沒有人管它」）：
 *
 * | 落點 | 意思 |
 * |---|---|
 * | **有消費端** | 客戶端真的有東西讀它 |
 * | **世界演出表** | `content/config/world-cues.json` 的一列（而且要**行為**驗得到） |
 * | **豁免表** | `WORLD_CUE_EXEMPTIONS`（帶一個能被反駁的理由）或 `WORLD_CUE_OUT_OF_SCOPE`（凍結的普查名單） |
 *
 * ⇒ **加第八個事件而不做選擇 → 紅。**
 *
 * ── 它驗什麼 ──────────────────────────────────────────────────────────────
 * ⭐ 表那幾列驗的是**行為**：把一則事件餵進出貨的 `VfxSystem.handleEvent()`，
 *   然後問「那一層真的收到了嗎」。⛔ 不是 grep 原始碼有沒有出現那個字串
 *   （失敗形態⑥ —— 而且 grep 版本在事件改名時會靜靜變綠）。
 * ⚠️ 覆蓋率那一條**只能**用掃描（它問的是「全樹有沒有人提到這個名字」，
 *   那本來就是一個檔案層的問題），所以它只當**帳本**，⛔ 不當功能守衛。
 *
 * ⚠️ ⛔ 這裡不驗任何顏色、強度、秒數 —— 那些是後台欄位（第二守則）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { FANNED_OUT_EVENT_TYPES } from "../../../game-server/src/net/eventFanout";
import {
  DEFAULT_WORLD_CUES,
  WORLD_CUE_EXEMPTIONS,
  WORLD_CUE_OUT_OF_SCOPE,
  worldCueEventNames,
  worldCueLine,
  worldCuePoint,
} from "./worldCues";

/** 四個「演出」事件 —— ⭐ 名字要與 sim 發的逐字相同。 */
const PERFORMANCE_EVENTS = ["modelFxSpawn", "screenFlash", "screenShake", "floatingText"] as const;

const CLIENT_SRC = join(__dirname, "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      sourceFiles(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * `apps/client/src` 全樹（⛔ 不含測試檔）提到的事件名。
 *
 * ⚠️ **`worldCues.ts` 自己被排除在外**：它是這場普查的**帳本**，而帳本上寫著
 * 那些名字正是因為它們**沒有**消費端。把它算進去，這條閘會自己證明自己 ——
 * 一個名字只要被抄進 `WORLD_CUE_OUT_OF_SCOPE` 就永遠不會再紅。
 */
function namesMentionedInClient(): Set<string> {
  const hay = sourceFiles(CLIENT_SRC)
    .filter((f) => !f.endsWith(`${sep}worldCues.ts`))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const seen = new Set<string>();
  for (const t of FANNED_OUT_EVENT_TYPES) if (hay.includes(`"${t}"`)) seen.add(t);
  return seen;
}

describe("演出事件的客戶端消費端 (GH#551/#543/#549 + 2026-08-23 稽核)", () => {
  it("⛔ 四個演出事件都在 `eventFanout` 白名單裡 —— 少一個就是靜默失敗", () => {
    const missing = PERFORMANCE_EVENTS.filter((t) => !FANNED_OUT_EVENT_TYPES.has(t));
    expect(
      missing,
      "這幾個事件 sim 會發但**不會過線** ⇒ 客戶端一則都收不到，而且不會有任何錯誤",
    ).toEqual([]);
  });

  it("⭐ `VfxSystem.handleEvent` 對每一個演出事件都有分支 —— ⛔ 整組刪掉必須會紅", async () => {
    const { VfxSystem } = await import("./VfxSystem");
    const src = VfxSystem.prototype.handleEvent.toString();
    const unhandled = PERFORMANCE_EVENTS.filter((t) => !src.includes(`"${t}"`));
    expect(unhandled, "⛔ 這幾個事件送到客戶端之後**沒有人接**").toEqual([]);
  });

  it("⭐ 三個演出層都被 `VfxSystem` 真的持有 —— ⛔ 不是只有檔案存在", async () => {
    const src = (await import("./VfxSystem")).VfxSystem.toString();
    for (const layer of ["ModelFxRig", "ScreenFxLayer", "FloatingTextFx"]) {
      expect(src.includes(layer), `${layer} 沒有被 VfxSystem 建起來`).toBe(true);
    }
  });

  it("⛔ 三個層都被 tick / 回合邊界清掉 —— 少了就是 #131 的孤兒發射器", async () => {
    const mod = await import("./VfxSystem");
    for (const [name, body] of [
      ["update", mod.VfxSystem.prototype.update.toString()],
      ["resetForRound", mod.VfxSystem.prototype.resetForRound.toString()],
    ] as const) {
      for (const layer of ["modelFx", "screenFx", "floatingText"]) {
        expect(body.includes(layer), `${name}() 沒有推進/清掉 ${layer}`).toBe(true);
      }
    }
  });

  // ── ⭐ 2026-08-23 稽核：世界演出那一張表 ─────────────────────────────────

  it("⭐ 表上每一列都真的過線，而且**行為上**接得到 —— ⛔ 不是 grep 有沒有那個字串", () => {
    const names = worldCueEventNames();
    expect(names.length, "表空了 ⇒ 這條守衛什麼都沒驗到").toBeGreaterThan(0);
    expect(
      names.filter((t) => !FANNED_OUT_EVENT_TYPES.has(t)),
      "表上有一列的事件**不會過線** ⇒ 那一列是死的（後台調得到、遊戲一輩子看不到）",
    ).toEqual([]);

    // ⭐ 行為：走**出貨的**模板（⛔ 不是重寫一份），每一列都要解出一份「要畫什麼」。
    //    座標來源的兩條路都走到：payload 帶 x/z，以及只有 id（guardianSleep）。
    const cues = DEFAULT_WORLD_CUES;
    const entityPos = (id: number) => (id === 7 ? { x: 3, z: 4 } : null);
    const unresolved: string[] = [];
    for (const t of Object.keys(cues.point)) {
      const viaXZ = worldCuePoint(cues, t, { x: 1, z: 2 }, () => null);
      const viaId = worldCuePoint(cues, t, { id: 7 }, entityPos);
      if (!viaXZ || !viaId) unresolved.push(t);
    }
    for (const t of Object.keys(cues.line)) {
      if (!worldCueLine(cues, t, { x: 1, z: 2, x2: 5, z2: 6 })) unresolved.push(t);
    }
    expect(
      unresolved,
      "⛔ 這幾列在出貨設定下解不出任何演出 ⇒ 事件到了、表上有它、而畫面上什麼都不會發生",
    ).toEqual([]);
  });

  it("⛔ 出貨 JSON 與 Zod 的 `DEFAULT_WORLD_CUES` 一字不差 —— 第三個住處的 drift 閘", () => {
    const shipped = JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/world-cues.json"), "utf8"),
    ) as Record<string, unknown>;
    delete shipped.note; // `note` 是給讀 JSON 的人看的，⛔ 不是設定值
    expect(shipped).toEqual({ ...DEFAULT_WORLD_CUES });
  });

  it("⭐ `VfxSystem.handleEvent` 真的呼叫那兩個模板 —— ⛔ 拿掉整段必須會紅", async () => {
    const { VfxSystem } = await import("./VfxSystem");
    const src = VfxSystem.prototype.handleEvent.toString();
    for (const fn of ["worldCuePoint", "worldCueLine"]) {
      expect(
        src.includes(fn),
        `⛔ 世界演出模板沒有被 handleEvent 呼叫 ⇒ 表上那 ${worldCueEventNames().length} 列全部是死的。\n` +
          "  ⭐ 修法是把那一段 default 分派接回去，⛔ 不是把這條測試改掉。",
      ).toBe(true);
    }
  });

  it("⛔ 白名單上的每一則事件都要有**一個歸宿** —— 加第八個而不做選擇就紅", () => {
    const mentioned = namesMentionedInClient();
    const inTable = new Set(worldCueEventNames());
    const exempt = new Set(Object.keys(WORLD_CUE_EXEMPTIONS));
    const outOfScope = new Set(WORLD_CUE_OUT_OF_SCOPE);
    const homeless = [...FANNED_OUT_EVENT_TYPES]
      .filter((t) => !mentioned.has(t) && !inTable.has(t) && !exempt.has(t) && !outOfScope.has(t))
      .sort();
    expect(
      homeless,
      "⛔ 這幾則事件 sim 發了、`eventFanout` 放行了、線路上真的送到客戶端了，而**沒有任何人讀它**\n" +
        "  （失敗形態②：算出來了但從沒送到畫面上 —— 而傷害照樣結算，所以它看起來完全正常）。\n" +
        "  ⭐ 三條出路，挑一條：① 接進 `content/config/world-cues.json` 的表；\n" +
        "  ② 寫一列 `WORLD_CUE_EXEMPTIONS`（帶**能被反駁**的理由 + 到期條件）；\n" +
        "  ③ 從 `FANNED_OUT_EVENT_TYPES` 拿掉（它根本不該過線）。\n" +
        "  ⛔ 「還沒收」不是理由，⛔ 把名字塞進 `WORLD_CUE_OUT_OF_SCOPE` 也不是。",
    ).toEqual([]);

    // 豁免要真的是豁免：⛔ 不可以同時在表上（那樣理由就是一句假話）。
    expect([...exempt].filter((t) => inTable.has(t))).toEqual([]);
    for (const [t, why] of Object.entries(WORLD_CUE_EXEMPTIONS)) {
      expect(FANNED_OUT_EVENT_TYPES.has(t), `${t} 根本沒過線，豁免它沒有意義`).toBe(true);
      expect(why.length, `${t} 的豁免理由太短 —— 一句能被反駁的話寫不到 60 字`).toBeGreaterThan(60);
      expect(why, `${t} 的豁免沒有寫「什麼時候該失效」`).toContain("失效");
    }
  });
});

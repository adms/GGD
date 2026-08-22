/**
 * 這一批新開的後台格子**不是死欄位**（第一·五守則：⛔ 不放任何無效說明）。
 *
 * ⚠️ 這一支刻意只有一條承重線，⛔ 不是四個票各寫一條（第零守則⑦：體驗層一條薄守衛）。
 * 它問的是同一個問題兩次：**出貨檔裡那個鍵，走完出貨的解析鏈之後還在不在？**
 *
 * ⛔ **它不驗數字**（第二守則）—— 期望值一律**從出貨檔自己讀出來**，
 * 所以 owner 明天把 0.5 改成 0.4、把 weaken 改成 off，這一支都不會用一句
 * 與真相無關的話紅掉。
 *
 * 為什麼是這一條線：`podiumSpacing` 在此之前住 `RoundWinnerStage` 的客戶端常數，
 * 而「把它搬進 Zod」這件事只要中間任何一環把鍵名寫成別的（例如 `spacing`），
 * 結果就是**後台存得起來、畫面永遠讀不到**，而 `roundWinnerSpacing.test.ts`
 * 仍然全綠 —— 那一支自己手搭 policy 物件，對「出貨檔的鍵叫什麼」完全免疫
 * （失敗形態⑤：被測的不是出貨的那個）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  zConfigVictoryPodiumDoc,
  resolveVictoryPodium,
  DEFAULT_VICTORY_PODIUM,
} from "./victoryPodium";
import {
  zConfigScreenFxDoc,
  resolveScreenFx,
  screenFxReducedMultipliers,
  DEFAULT_SCREEN_FX,
} from "./screenFxDoc";

const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const shipped = (id: string): unknown =>
  JSON.parse(readFileSync(join(REPO, "content", "config", `${id}.json`), "utf8"));

describe("新開的後台格子真的走得完出貨解析鏈", () => {
  it("★ GH#545 頒獎台間距：出貨檔的值走到政策上，⛔ 不是被預設吃掉", () => {
    const doc = zConfigVictoryPodiumDoc.parse(shipped("victory-podium"));
    // ① 出貨檔真的有這個鍵（Zod 是 .strict()，鍵名寫錯這一行就已經炸了）。
    expect(doc.podiumSpacing).toBeTypeOf("number");
    // ② ⭐ 承重的那一句：resolver 搬的是**文件的值**，不是永遠回預設。
    //    期望值從文件自己讀 —— ⛔ 不抄字面值。
    expect(resolveVictoryPodium(doc).podiumSpacing).toBe(doc.podiumSpacing);
    // ③ 反向對照組：換一個與出貨值不同的合法值，政策要跟著動。
    //    少了它，一個「永遠回傳出貨值」的實作也會過（失敗形態④）。
    const other = doc.podiumSpacing === 1 ? 0.9 : 1;
    expect(resolveVictoryPodium({ ...doc, podiumSpacing: other }).podiumSpacing).toBe(other);
    // ④ 缺席（線上那些存於這一格之前的耐久覆蓋層）退回保險絲，⛔ 不是 undefined。
    const { podiumSpacing: _drop, ...without } = doc;
    expect(resolveVictoryPodium(without).podiumSpacing).toBe(DEFAULT_VICTORY_PODIUM.podiumSpacing);
  });

  it("★ GH#549 減少動態：三條路的殘量是**載入時算出來的**，⛔ 不是文件裡的第二個欄位", () => {
    const policy = resolveScreenFx(zConfigScreenFxDoc.parse(shipped("screen-fx")));
    // ① off / ignore 兩端一定分得開 —— 這就是「模式真的被讀了」。
    expect(screenFxReducedMultipliers({ ...policy, reducedMotionMode: "off" })).toEqual({
      flash: 0,
      shake: 0,
    });
    expect(screenFxReducedMultipliers({ ...policy, reducedMotionMode: "ignore" })).toEqual({
      flash: 1,
      shake: 1,
    });
    // ② weaken 那一條路讀的是那兩格，⛔ 不是另外抄一份常數（第〇·四守則）。
    //    期望值從政策自己讀 —— owner 調那兩格時這一行不會紅。
    expect(screenFxReducedMultipliers({ ...policy, reducedMotionMode: "weaken" })).toEqual({
      flash: policy.reducedFlashMult,
      shake: policy.reducedShakeMult,
    });
    // ③ 總開關是**唯一**的出口：關掉之後模式選什麼都不再有動作。
    expect(screenFxReducedMultipliers({ ...policy, enabled: false })).toEqual({
      flash: 0,
      shake: 0,
    });
    // ④ 出貨檔 == Zod 的 DEFAULT_*（第一守則的三個住處之二，drift 在這裡就紅）。
    expect(policy).toEqual(DEFAULT_SCREEN_FX);
  });
});

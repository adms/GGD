/**
 * laneConfigDocs.test.ts — 2026-08-02 收尾:三份新 config 文件的**接線守衛**。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ① 這一支存在的第一個理由:2026-08-02 那次四小時的線上事故
 * ════════════════════════════════════════════════════════════════════════════
 * 那天線上壞掉的根因是 —— 新的 config schema tag 進了 `content/`,而
 * `schema/config.ts` 的 discriminated union **不認得它**（`config.roster@1` /
 * `config.boss-intro@1` / `config.item-card@1` / `config.victory-fx@1` 四個）。
 * 內容驗證整棵失敗 → `main.tsx` 的 fail-open 註冊 2 隻英雄的骨架 → 選人畫面
 * 整個空掉,而**登入頁、大廳、版本徽章、`/content/bundle.json` 200、白名單 63 隻
 * 全部正常**。唯一的破綻是瀏覽器 console 那一行。
 *
 * 這一輪一次加三份文件（`lobby-layout` / `valhalla-sandbox` / `victory-podium`），
 * 也就是一次帶三顆同型號的地雷。所以第一組斷言是:**每一份出貨文件都要真的
 * 被 collection union 收下**,而且是拿真的 `zConfigDoc`（客戶端載入時跑的那一個）
 * 去 parse 真的 `content/config/*.json`，不是拿它自己的那支 Zod。
 * 拿自己那支 Zod 驗會全綠 —— 那正是失敗形態 ⑤（被測的不是出貨的那個）。
 *
 * ⚠️ 反向對照組不可省:一個**沒有**被掛進 union 的 tag 必須被拒。少了它,
 * 上面那組對「union 收下任何東西」的實作也會全過（失敗形態 ④）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ② 第二個理由:出貨值現在存在**兩份**,它們會 drift
 * ════════════════════════════════════════════════════════════════════════════
 * 三個 lane 各自把出貨值寫在自己的模組裡（`DEFAULT_LOBBY_LAYOUT` /
 * `DEFAULT_VALHALLA_SANDBOX` / `DEFAULT_VICTORY_PODIUM`），而那三份是**畫面真的
 * 在用的那一份**。這一輪又把同一組值寫進 `content/config/*.json` 與
 * `schema/config.ts` 的 `DEFAULT_*_POLICY`。三份一致是今天的事實,不是機制 ——
 * 所以這裡逐格比對,而且比對的是**真的 import 進來的常數**,不是 grep 原始碼
 * 有沒有出現那串數字（失敗形態 ⑥/⑦）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ③ 第三個理由:上界不是裝飾（#277）
 * ════════════════════════════════════════════════════════════════════════════
 * `validateField` 在 2026-07-29 之前只檢查 `min`,所以 3 打成 30 會過後台、
 * 在下游才被拒或被靜默夾掉。這裡走 `readSchema`（後台表單引擎真的用的那支
 * Zod 走訪器）確認每一格數字**兩端都有界**。
 *
 * ⚠️ 這一支**不宣稱**這三份文件已經生效。它們目前沒有執行期消費端,誠實地
 * 記在 `configDocCoverage.ts` 的三列 DEFERRED 上,到期條件由
 * `configDocCoverage.test.ts` 的 `productionCallSites` 自己數。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  DEFAULT_LOBBY_LAYOUT_POLICY,
  DEFAULT_LOBBY_RALLY_POLICY,
  DEFAULT_VALHALLA_SANDBOX_POLICY,
  resolveLobbyLayout,
  resolveValhallaSandbox,
  zConfigDoc,
  zConfigLobbyLayoutDoc,
  zConfigValhallaSandboxDoc,
} from "@ggd/shared/content";
import { DEFAULT_VICTORY_PODIUM } from "@ggd/shared/content/schema/victoryPodium";
// ⚠️ 這兩個 import 是刻意跨到 apps/client 的:那兩份常數才是**螢幕真的在用的**
// 出貨值。抄一份數字進來比對等於製造第三份會 drift 的知識。
// 兩個模組都是葉節點（valhallaSandboxRules 零 import、lobbyLayout 只 import react），
// 所以在 node 環境的 vitest 裡拉得動,不會把 Babylon 拖進來。
import { lobbyLayoutProblems, DEFAULT_LOBBY_LAYOUT, ALL_SLOTS } from "../../client/src/ui/platform/lobbyLayout";
import {
  DEFAULT_VALHALLA_SANDBOX,
  VALHALLA_SANDBOX_BOUNDS,
} from "../../client/src/ui/platform/valhalla/valhallaSandboxRules";
// 大廳集合令（GH#492）。⚠️ 同上：`lobbyRally.ts` 的 `DEFAULT_LOBBY_RALLY` 才是
// **畫面真的在用的**那一份。它是葉節點（只 import @ggd/shared），node 環境拉得動。
import { DEFAULT_LOBBY_RALLY } from "../../client/src/ui/platform/lobbyRally";
import { readSchema } from "./configForms";

const TAG = "adminui-lane-config-docs";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const shipped = (docId: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(REPO, "content", "config", `${docId}.json`), "utf8")) as Record<
    string,
    unknown
  >;

/** 文件自己的座標欄位,比對政策時要先剝掉。 */
const META = ["id", "schema", "note"];
const payload = (doc: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(doc).filter(([k]) => !META.includes(k)));

const NEW_DOCS = ["lobby-layout", "valhalla-sandbox", "victory-podium", "lobby-rally"] as const;

describe("三份新 config 文件真的被接進出貨路徑 (adminui-lane-config-docs)", () => {
  it("★ 每一份出貨文件都被 collection union 收下 —— 2026-08-02 事故的那一步", () => {
    cover(TAG);
    for (const docId of NEW_DOCS) {
      const raw = shipped(docId);
      const parsed = zConfigDoc.safeParse(raw);
      expect(
        parsed.success,
        `content/config/${docId}.json 過不了 zConfigDoc（collection union）。\n` +
          `這正是 2026-08-02 線上壞掉四小時的形狀:內容裡有一個 union 不認得的 ` +
          `schema tag → ContentLoader 整棵驗證失敗 → main.tsx fail-open 退回 2 隻` +
          `英雄的骨架 → 選人畫面整個空掉,而網站看起來完全正常。\n` +
          `修法:把它的 Zod 加進 schema/config.ts 的 zConfigDoc。\n` +
          (parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3), null, 2)),
      ).toBe(true);
    }
  });

  it("★ 反向對照:union 不是照單全收（沒掛進去的 tag 會被拒）", () => {
    cover(TAG);
    // 少了這一條,上面那條對「union 收下任何東西」的壞實作也會全過（失敗形態 ④）。
    const bogus = { ...shipped("victory-podium"), schema: "config.not-wired-yet@1" };
    expect(zConfigDoc.safeParse(bogus).success).toBe(false);
    // 而且是**因為 tag**被拒,不是因為別的欄位 —— 把 tag 換回來就該通過。
    expect(zConfigDoc.safeParse({ ...bogus, schema: "config.victory-podium@1" }).success).toBe(true);
  });

  it("★ 出貨值 == 螢幕真的在用的那一份（lobby-layout,逐格）", () => {
    cover(TAG);
    const doc = shipped("lobby-layout");
    // ① 出貨文件 vs 客戶端常數（後者是 LobbyScreen.tsx 真的傳進 style 的那一份）
    expect(payload(doc), "content/config/lobby-layout.json 與 DEFAULT_LOBBY_LAYOUT 不一致").toEqual(
      { ...DEFAULT_LOBBY_LAYOUT },
    );
    // ② shared 的保險絲 vs 同一份客戶端常數
    expect(DEFAULT_LOBBY_LAYOUT_POLICY).toEqual({ ...DEFAULT_LOBBY_LAYOUT });
    // ③ owner 明說的那一件事 —— 但驗的是**機制**不是數字。
    //
    // ⚠️ 這裡原本是 `expect(...friendsShare).toBe(0.5)`,訊息寫「owner 的『各半』
    // 被改掉了」。那句話在 2026-08-03 變成謊話:owner 說「大廳 FRIEND 跟排位榜
    // **中間**,多出一個區域顯示所有大廳正在線上的玩家列表」—— 左欄從兩塊變三塊,
    // 「各半」這個概念不存在了,而這條斷言會紅著說一句與真相無關的話。
    // CLAUDE.md 第二守則:**守衛驗機制,不驗數字**。
    //
    // 真正該守的機制是「比例是不是真的是百分比」:flexbox 的 grow 是相對的,
    // 0.5/0.5/0.5 會排得好好的而文件宣稱 150% —— 那就是後台一個「40%」欄位
    // 停止是百分比的瞬間。這條由 lobbyLayout.ts 自己的 lobbyLayoutProblems() 判,
    // 它同時檢查三段和為 1 與每一格的上下界。
    expect(
      lobbyLayoutProblems(DEFAULT_LOBBY_LAYOUT),
      "出貨的大廳排版政策自己就不合法",
    ).toEqual([]);
    // 每一塊都在,兩種模式都不會掉 —— owner 逐次點名過的區域(2026-08-03 線上玩家、
    // 2026-08-19 GH#454 宿敵榜),⛔ 不是「有幾塊」這個數字。
    for (const order of [DEFAULT_LOBBY_LAYOUT.stackOrder, DEFAULT_LOBBY_LAYOUT.splitOrder]) {
      expect(new Set(order)).toEqual(new Set(ALL_SLOTS));
    }
    // 而且 owner 的那句「列在朋友列表跟積分排行榜之間」在桌機順序上真的成立。
    const split = DEFAULT_LOBBY_LAYOUT.splitOrder;
    expect(split.indexOf("nemesis")).toBeGreaterThan(split.indexOf("friends"));
    expect(split.indexOf("nemesis")).toBeLessThan(split.indexOf("leaderboard"));
    // ④ resolver 真的把文件的值搬出來（不是永遠回預設）
    const parsed = zConfigLobbyLayoutDoc.parse({ ...doc, friendsShare: 0.7 });
    expect(resolveLobbyLayout(parsed).friendsShare).toBe(0.7);
    expect(resolveLobbyLayout(null)).toEqual(DEFAULT_LOBBY_LAYOUT_POLICY);
  });

  it("★ 出貨值 == 大廳真的在用的那一份（lobby-rally,逐格）", () => {
    cover(TAG);
    // GH#492 的三個住處：出貨文件 / shared 的保險絲 / 客戶端常數。三份一致是
    // 今天的事實，不是機制 —— 所以逐格比對，而且比對的是**真的 import 進來的
    // 常數**，⛔ 不是 grep 原始碼有沒有出現那串數字（失敗形態 ⑥/⑦）。
    const doc = shipped("lobby-rally");
    expect(payload(doc), "content/config/lobby-rally.json 與 DEFAULT_LOBBY_RALLY 不一致").toEqual({
      ...DEFAULT_LOBBY_RALLY,
    });
    expect(DEFAULT_LOBBY_RALLY_POLICY).toEqual({ ...DEFAULT_LOBBY_RALLY });
    // ⭐ owner 明說死的唯一一格：「最多等 10 秒」。⛔ 其餘七格是決策點,
    // 它們的值本來就會被 owner 調,所以這裡不釘（第零守則：不要過度測試數值）。
    expect(DEFAULT_LOBBY_RALLY.waitSeconds, "owner 2026-08-21:「最多等 10 秒」").toBe(10);
  });

  it("★ 出貨值 == 沙盒真的在用的那一份（valhalla-sandbox,逐格 + owner 明說的兩格）", () => {
    cover(TAG);
    const doc = shipped("valhalla-sandbox");
    expect(payload(doc)).toEqual({ ...DEFAULT_VALHALLA_SANDBOX });
    expect(DEFAULT_VALHALLA_SANDBOX_POLICY).toEqual({ ...DEFAULT_VALHALLA_SANDBOX });
    // owner 原話:「生命 10,000 的假人 (生命歸零3秒後自動補滿)」
    expect(doc["dummyHealth"], "owner 明說 10,000").toBe(10_000);
    expect(doc["dummyRespawnSec"], "owner 明說 3 秒").toBe(3);
    const parsed = zConfigValhallaSandboxDoc.parse({ ...doc, infiniteMana: false });
    expect(resolveValhallaSandbox(parsed).infiniteMana).toBe(false);
    expect(resolveValhallaSandbox(undefined)).toEqual(DEFAULT_VALHALLA_SANDBOX_POLICY);
  });

  it("★ 出貨值 == 頒獎台真的在用的那一份（victory-podium）", () => {
    cover(TAG);
    const doc = shipped("victory-podium");
    expect(payload(doc)).toEqual({ ...DEFAULT_VICTORY_PODIUM });
    // owner 原話:「最後活下來順序的三位」
    expect(doc["podiumSize"], "owner 明說三位").toBe(3);
  });

  it("★ victory-podium 的說明不可以說謊:出貨是 both,不是 taunt（第三守則）", () => {
    cover(TAG);
    // 交辦單上寫「名言內容實測 0/119 不存在,預設先維持現行的 taunt」——兩句都是假的:
    // content/assets/audio/voices/quotes/ 有 114 個 mp3,而 RoundEndVoice.tsx 早就在
    // 放它。所以出貨值是 both,而任何一句「預設 taunt」的文案都是謊話。
    const doc = shipped("victory-podium");
    expect(doc["roundWinLine"], "現行出貨行為是 both（名言 t=0 + 嘲諷 t=2200ms）").toBe("both");
    const note = String(doc["note"] ?? "");
    expect(note.length, "victory-podium 沒有說明文字").toBeGreaterThan(60);
    expect(
      /預設\s*(是\s*)?taunt|預設先維持現行的\s*taunt/.test(note),
      "說明宣稱預設是 taunt,但實值是 both —— 操作者會以為切到 both 才是新行為,\n" +
        "而實際上切到 taunt 才是把已經在放的名言關掉（一個沒有人要求的迴歸）。",
    ).toBe(false);
  });

  it("★ 每一格數字兩端都有界（#277:只有下界的話 3 打成 30 會過後台）", () => {
    cover(TAG);
    for (const zod of [zConfigLobbyLayoutDoc, zConfigValhallaSandboxDoc]) {
      const { leaves } = readSchema(zod);
      const numbers = leaves.filter((l) => l.kind === "number");
      expect(numbers.length, "走訪不到任何數字欄位 —— 這條守衛沒有東西可以驗").toBeGreaterThan(0);
      for (const leaf of numbers) {
        expect(leaf.min, `${leaf.path} 沒有下界`).toBeTypeOf("number");
        expect(leaf.max, `${leaf.path} 沒有上界（#277）`).toBeTypeOf("number");
        expect(leaf.max!, `${leaf.path} 的上下界反了`).toBeGreaterThan(leaf.min!);
      }
    }
  });

  it("★ 沙盒的三個上下界和客戶端 clamp 用的是同一組數字", () => {
    cover(TAG);
    // 兩組界不一樣的話,後台放行的值會在客戶端被靜默夾掉（#279 的形狀）。
    const { leaves } = readSchema(zConfigValhallaSandboxDoc);
    const at = (path: string) => leaves.find((l) => l.path === path)!;
    for (const key of ["dummyHealth", "dummyRespawnSec", "dummyDistance"] as const) {
      expect(at(key).min, `${key} 的下界和客戶端 clamp 不一致`).toBe(
        VALHALLA_SANDBOX_BOUNDS[key].min,
      );
      expect(at(key).max, `${key} 的上界和客戶端 clamp 不一致`).toBe(
        VALHALLA_SANDBOX_BOUNDS[key].max,
      );
    }
  });

  it("★ 三份文件的 id 都等於檔名,而且出貨值過得了嚴格 Zod", () => {
    cover(TAG);
    for (const docId of NEW_DOCS) {
      const raw = shipped(docId);
      // id != 檔名的話,後台/覆蓋層用 docId 打的路徑會指到一份不存在的文件。
      expect(raw["id"], `${docId}.json 的 id 和檔名不一致`).toBe(docId);
      expect(String(raw["schema"] ?? ""), `${docId}.json 的 schema tag 不見了`).toMatch(
        /^config\.[a-z-]+@1$/,
      );
      // 說明文字要寫「它影響什麼」——長度只是最低門檻,但零長度一定是漏了。
      expect(String(raw["note"] ?? "").length, `${docId}.json 沒有說明`).toBeGreaterThan(80);
    }
  });
});

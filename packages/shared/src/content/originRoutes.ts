/**
 * 出身 × 路線 —— **純敘述**，⛔ 沒有任何引擎機制。
 *
 * owner 2026-08-12：
 *
 * > 「我**沒有要你作新機制**，我只是要作為**調整英雄初始與成長屬性的定位參考**，
 * >  並且可以更新在**英雄選角說明**作為參考」
 *
 * 所以這一份的兩個用途，兩個都是「給人看」：
 *   ① 調數值時的定位參考（「這位是鬥士，那他的移速就該落在大」）
 *   ② 選角畫面上的一行說明
 *
 * ⛔ **這裡一個數字都不會進入戰鬥計算。** 真正驅動數值的是
 * `statNormalization.ts` 的 `bands` × `byArchetype`（4 格定位），
 * 而出身（10 格）由 `ORIGIN_TO_ARCHETYPE` 收斂到那 4 格。
 *
 * ⚠️ 名稱與文案**全部可以從內容編輯器改**（`config.origin-routes@1`），
 * 不用部署。這很重要 —— 那 32 個路線名是我取的，owner 一定會改。
 */
import { ORIGINS, type Origin } from "./statNormalization";

/** `content/config/origin-routes.json` 的文件 id。 */
export const ORIGIN_ROUTES_DOC_ID = "origin-routes";

/** 一條路線 —— 三句話，全部是文案。 */
export interface RouteInfo {
  /** 路線名（2 字）。⚠️ owner 會改，所以它住在內容裡不是程式裡。 */
  name: string;
  /** 一句話：這條路線在做什麼。 */
  summary: string;
  /** 換到什麼。 */
  gain: string;
  /** 放棄什麼。⚠️ 空字串 = 這條路線只加不減，那就**不是路線**（見檔頭的判準）。 */
  lose: string;
}

export interface OriginInfo {
  /** 判定規則的中文說明（給人看的，判定本身在 `originOf`）。 */
  rule: string;
  /** 一句話：這個出身是什麼樣的英雄。選角畫面顯示的就是這一行。 */
  tagline: string;
  /** 2~4 條路線（owner 2026-08-12：「個別至少 2~4 種路線」）。 */
  routes: readonly RouteInfo[];
}

export type OriginRoutes = Readonly<Record<Origin, OriginInfo>>;

const r = (name: string, summary: string, gain: string, lose: string): RouteInfo =>
  Object.freeze({ name, summary, gain, lose });

/**
 * 出貨文案。⚠️ 這 32 個路線名是**提案**，owner 還沒定稿 ——
 * 所以它們住在內容裡，改名不需要部署，也不需要碰程式。
 */
export const DEFAULT_ORIGIN_ROUTES: OriginRoutes = Object.freeze({
  坦克: Object.freeze({
    rule: "力量主 · 近戰",
    tagline: "站得住的那一種 —— 血厚甲厚，跑得慢。",
    routes: Object.freeze([
      r("鐵壁", "把裝甲與魔抗堆到讓對面打不動，用時間換勝負。", "裝甲 · 魔抗 · 格擋", "攻速與移速"),
      r("反噬", "主要輸出來自反彈，站著挨打就是進攻。", "反彈傷害 + 極高裝甲", "攻速（極慢）"),
      r("血怒", "血越低打越痛，用最大生命當彈藥。", "低血增傷 · 免死", "回復與安全線"),
      r("嘲哮", "拉住對面、替隊友擋，自己幾乎不輸出。", "嘲諷 · 減傷光環", "單體輸出"),
    ]),
  }),
  砲手: Object.freeze({
    rule: "力量主 · 遠程",
    tagline: "笨重的遠程 —— 站得遠、打得重、動得慢。⭐ 今天 0 位，是新角色的位置。",
    routes: Object.freeze([
      r("攻城", "射程極遠、單發極重，一輪一發。", "射程 · 單發傷害", "攻速與移速（雙慢）"),
      r("彈幕", "每一發都濺射，打人堆而不是打人。", "範圍濺射", "單體傷害"),
      r("鎮守", "架起來就變砲台，動了就沒有威力。", "靜止時大幅增傷", "移動中的一切"),
    ]),
  }),
  鬥士: Object.freeze({
    rule: "敏捷主 · 近戰",
    tagline: "貼上去就不放 —— 全場最快，靠節奏不靠硬度。",
    routes: Object.freeze([
      r("疾風", "攻速拉滿、靠吸血活著。", "攻速上限解鎖 + 吸血", "裝甲與魔抗成長"),
      r("致命", "一刀決勝負，打不死就換自己死。", "暴擊率 · 暴擊傷害", "持續輸出與生存"),
      r("連刃", "連段疊層，越打越快 —— 被打斷就從零開始。", "疊層增速／增傷", "被打斷的容錯"),
      r("遊擊", "進進出出，不跟你正面拼。", "位移頻率 · 脫離", "正面對拼的硬度"),
    ]),
  }),
  射手: Object.freeze({
    rule: "敏捷主 · 遠程",
    tagline: "靠距離活命 —— 站位就是生命值。",
    routes: Object.freeze([
      r("精準", "站最遠、打最重，被貼上就結束。", "射程 · 暴擊", "近身的一切"),
      r("疾射", "單發很輕，但停不下來。", "攻速 · 多重投射", "單發威力"),
      r("陷阱", "先佈場再開打，控場即輸出。", "減速 · 場域 · 控場", "直接傷害"),
    ]),
  }),
  法鬥: Object.freeze({
    rule: "智慧主 · 近戰",
    tagline: "近身的法師 —— 普攻與法術同一條線上。",
    routes: Object.freeze([
      r("附魔", "普攻帶法術傷害，物理與法術一起吃。", "普攻附加法術傷害", "純物理成長"),
      r("咒刃", "技能命中就重置普攻，節奏全靠貼身。", "普攻重置 · 冷卻縮減", "脫離能力"),
      r("護法", "魔力就是第二條血條，枯竭就是死。", "法力護盾", "持續施法的自由"),
    ]),
  }),
  法師: Object.freeze({
    rule: "智慧主 · 遠程",
    tagline: "站在後面決定勝負 —— 魔抗最高，裝甲最薄。",
    routes: Object.freeze([
      r("爆術", "一發定生死，放完就是空窗。", "法術強度 · 單發爆發", "冷卻與生存"),
      r("詠唱", "持續輸出流，怕的是被打斷。", "冷卻縮減 · 持續施法", "單發威力與抗打斷"),
      r("詛咒", "自己不打人，讓對面自己爛掉。", "減益 · 持續傷害", "直接傷害"),
    ]),
  }),
  狂戰: Object.freeze({
    rule: "力量 × 敏捷（前二名相差不到兩成）",
    tagline: "又壯又快 —— 沒有短板，也沒有長板。",
    routes: Object.freeze([
      r("蠻攻", "攻擊力與攻速雙修，完全不碰法術。", "攻擊力 + 攻速雙成長", "法術強度與防禦"),
      r("韌體", "站樁互毆，比誰先倒。", "生命 · 吸血 · 回復", "爆發"),
      r("撞擊", "用身體當武器，撞到誰誰倒。", "位移撞擊傷害 · 擊退", "持續輸出（長冷卻）"),
    ]),
  }),
  硬輔: Object.freeze({
    rule: "力量 × 智慧（前二名相差不到兩成）",
    tagline: "力量法師 —— 用體格施法，越厚越痛。",
    routes: Object.freeze([
      r("咒鎧", "把法術強度轉成護盾與防禦，越強越硬。", "法術強度 → 護盾／裝甲", "法術輸出"),
      r("神罰", "法術傷害以最大生命為係數，血越厚打越痛。", "生命 → 法術傷害", "魔力池與續航"),
      r("圖騰", "召喚物與持續場域替你打，自己站得很後面。", "召喚 · 場域", "自身硬度"),
    ]),
  }),
  法刺: Object.freeze({
    rule: "敏捷 × 智慧（前二名相差不到兩成）",
    tagline: "看不見的那一種 —— 一輪定生死，失手就沒有第二次。",
    routes: Object.freeze([
      r("刺殺", "隱身進場、一輪帶走，失手就換自己死。", "隱身 · 爆發 · 處決", "正面戰與容錯"),
      r("幻影", "用分身與迴避換命，真實輸出很低。", "分身 · 迴避", "真實輸出"),
      r("疾咒", "普攻觸發小法術，靠次數不靠威力。", "攻速 → 法術觸發", "單發威力"),
    ]),
  }),
  軟輔: Object.freeze({
    rule: "三圍都在門檻內",
    tagline: "沒有偏向 —— 每一項都及格，沒有任何一項出色。⭐ 今天 0 位。",
    routes: Object.freeze([
      r("調律", "每一項都及格，沒有任何一項出色。", "全屬性小幅加成", "任何一個高峰"),
      r("適應", "依場況在兩種形態間切換，切換本身有代價。", "兩種形態", "切換時的空窗"),
      r("共鳴", "隊友活著就強，剩自己一個最弱。", "隊友數量加成", "單獨作戰"),
    ]),
  }),
}) as OriginRoutes;

/** 路線數量的上下界。owner 2026-08-12：「個別**至少 2~4** 種路線」。 */
export const ROUTES_PER_ORIGIN_MIN = 2;
export const ROUTES_PER_ORIGIN_MAX = 4;

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() !== "" ? v : fallback;
}

/**
 * 把一份 `config.origin-routes@1` 正規化成規則物件。認不得 → 出貨值。
 *
 * ⚠️ **逐格 fallback**，不是整份取代：只改了「坦克的第一條路線名」的文件，
 * 其餘 31 條仍然拿得到出貨文案。⛔ 整份取代的話，一個只寫了半份的覆蓋層會讓
 * 選角畫面上 31 條路線變成空白，而那看起來跟「這個出身沒有路線」一模一樣。
 */
export function originRoutesFromDoc(doc: unknown): OriginRoutes {
  const d = doc as Record<string, unknown> | undefined;
  if (!d || d["schema"] !== "config.origin-routes@1") return DEFAULT_ORIGIN_ROUTES;
  const src = d["origins"] as Record<string, Record<string, unknown>> | undefined;
  const out = {} as Record<Origin, OriginInfo>;
  for (const key of ORIGINS) {
    const base = DEFAULT_ORIGIN_ROUTES[key];
    const o = src?.[key];
    const rawRoutes = Array.isArray(o?.["routes"]) ? (o["routes"] as unknown[]) : undefined;
    const routes = (rawRoutes ?? base.routes).slice(0, ROUTES_PER_ORIGIN_MAX).map((v, i) => {
      const rv = v as Record<string, unknown> | undefined;
      const b = base.routes[i] ?? base.routes[0]!;
      return Object.freeze({
        name: str(rv?.["name"], b.name),
        summary: str(rv?.["summary"], b.summary),
        gain: str(rv?.["gain"], b.gain),
        lose: str(rv?.["lose"], b.lose),
      });
    });
    out[key] = Object.freeze({
      rule: str(o?.["rule"], base.rule),
      tagline: str(o?.["tagline"], base.tagline),
      routes: Object.freeze(routes.length > 0 ? routes : base.routes),
    });
  }
  return Object.freeze(out) as OriginRoutes;
}

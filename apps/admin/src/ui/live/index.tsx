/**
 * 🔴 LIVE 對照·視覺化 SUITE（GH#775，owner 2026-08-26）——
 * 13 頁全部吃 `/__live/<dataset>`（tools/admin-live：**每次請求當場從 repo 現況算**，
 * mtime 快取）。owner 逐字：「這些後台頁面的內容都要 **script 實時動態產生**，
 * **不是靜態內容**喔」。
 *
 * ⭐ 與 ContentPage 同一個 DEV-chunk 形狀：routes ＋ label 全部跟著這個 chunk 走，
 * ⭐ **GH#794 起正式 build 也含這一段** —— `/__live/**` 線上真的有了
 * （review sidecar ＋ nginx 的 location）。⛔ 上面那句「正式 build 不含」已作廢。
 * ⛔ 仍然不要把這裡的頁面加進 SESSION_REQUIRED_PAGES（它們是唯讀對照頁）。
 *
 * 🔐 GH#796：載入這個 chunk 的同時裝上 fetch 攔截器，讓 13 頁的
 * `fetch("/__live/…")` 自動帶上 console 已登入的 token —— ⭐ 一個住處，
 * ⛔ 不是去改 13 個頁面各加一個 header（第零守則⑨）。
 */
import type * as React from "react";
import { installLiveAuthFetch } from "../../liveAuth";
import { browserTokenStorage } from "../../session";

installLiveAuthFetch(() => browserTokenStorage.load()?.accessToken ?? null);
import { MdlFamiliesPage } from "./MdlFamiliesPage";
import { ParallelBoardPage } from "./ParallelBoardPage";
import { JassVfxPage } from "./JassVfxPage";
import { LocustOrbsPage } from "./LocustOrbsPage";
import { MechTemplatesPage } from "./MechTemplatesPage";
import { VfxTemplatesPage } from "./VfxTemplatesPage";
import { SfxMapPage } from "./SfxMapPage";
import { RadarOriginsPage } from "./RadarOriginsPage";
import { RadarAbilitiesPage } from "./RadarAbilitiesPage";
import { SkillAuthoringPage } from "./SkillAuthoringPage";
import { ExRootsPage } from "./ExRootsPage";
import { TreasuresPage } from "./TreasuresPage";
import { Skill90Page } from "./Skill90Page";

export const LIVE_SECTION = "技能對照·視覺化";

export interface LiveRoute {
  readonly page: string;
  readonly label: string;
  readonly emoji: string;
  readonly Component: React.ComponentType;
}

/** ⭐ 順序＝owner 訊息裡點名的順序（2026-08-26），⛔ 不是字母序。 */
export const LIVE_ROUTES: readonly LiveRoute[] = [
  { page: "liveMdlFamilies", label: "MDL特效家族", emoji: "🌪", Component: MdlFamiliesPage },
  { page: "liveParallelBoard", label: "平行處理盤", emoji: "🧭", Component: ParallelBoardPage },
  { page: "liveJassVfx", label: "JASS特效對照", emoji: "🎬", Component: JassVfxPage },
  { page: "liveLocustOrbs", label: "蝗蟲群對照", emoji: "🦗", Component: LocustOrbsPage },
  { page: "liveMechTemplates", label: "機制模板·範圍", emoji: "🧩", Component: MechTemplatesPage },
  { page: "liveVfxTemplates", label: "特效模板·視覺", emoji: "🧬", Component: VfxTemplatesPage },
  { page: "liveSfxMap", label: "技能音效對照", emoji: "🔊", Component: SfxMapPage },
  { page: "liveRadarOrigins", label: "出身屬性雷達", emoji: "📡", Component: RadarOriginsPage },
  { page: "liveRadarAbilities", label: "技能級距雷達", emoji: "📈", Component: RadarAbilitiesPage },
  { page: "liveSkillAuthoring", label: "說明→JSON", emoji: "✍️", Component: SkillAuthoringPage },
  { page: "liveExRoots", label: "EX根源三選一", emoji: "🧿", Component: ExRootsPage },
  { page: "liveTreasures", label: "寶具三選一", emoji: "🗡️", Component: TreasuresPage },
  { page: "liveSkill90", label: "90支重製對照", emoji: "📐", Component: Skill90Page },
];

export function renderLivePage(page: string): React.JSX.Element | null {
  const r = LIVE_ROUTES.find((x) => x.page === page);
  return r ? <r.Component /> : null;
}

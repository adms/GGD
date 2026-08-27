/**
 * 🧍 補給站攤位要畫的**本地英雄模型**（從 GameApp 抽出 —— 4,000 行線）。
 *
 * GH#368 —— 尺寸倍率跟著模型一起送出去。市場攤位以前只拿到 glbPath + doc.scale，
 * 而 doc.scale **不是尺寸**（overlay 文件一律是 1），所以「跟你並肩作戰的那一隻」
 * 走進補給站就換了一個大小。⚠️ 讀 `seat.championId` 而不是形態感知的那條縫是
 * 刻意的：補給站是回合之間的畫面，下一回合一律以基本型重生，而且 `bodyChampionIdFor`
 * 需要一個 EntityViewState —— 這裡沒有 entity，只有座位。
 *
 * GH#368 —— 血泥宣告（hiddenPrimitives）也一起送。攤位讀不到它的話，16 隻 overlay
 * 英雄會拖著一片屍體站在櫃台前（而且那片屍體會把他墊高）。
 */
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { hudStore } from "../net/RoomStore";
import { bodyRelativeScale } from "../render/views/modelSizing";
import type { StandinScaleFields } from "@ggd/shared/content/standinScale";


export interface LocalChampionModel {
  readonly glbPath: string;
  readonly scale: number;
  readonly yawOffsetDeg?: number;
  readonly relativeScale?: number;
  readonly hiddenPrimitives?: readonly number[];
}

interface ModelDocLike {
  readonly glbPath: string;
  readonly scale: number;
  readonly yawOffsetDeg?: number;
  readonly hiddenPrimitives?: readonly number[];
}

export function resolveLocalChampionModel(
  modelDocFor: (modelKey: string, seatId?: number) => ModelDocLike | null | undefined,
  modelOverrideFor: (championId: string) => StandinScaleFields | null | undefined,
): LocalChampionModel | null {
  const hud = hudStore.getState();
  const seat = hud.seats.find((s: { seatId: number | null; championId?: string | null }) => s.seatId === hud.localSeatId);
  if (!seat?.championId) return null;
  const def = Champions.tryGet(seat.championId as ChampionId);
  if (!def) return null;
  const doc = modelDocFor(def.modelKey, seat.seatId);
  if (!doc) return null;
  const override = modelOverrideFor(seat.championId);
  return {
    glbPath: doc.glbPath,
    scale: doc.scale,
    yawOffsetDeg: doc.yawOffsetDeg,
    relativeScale: bodyRelativeScale(doc.glbPath, override),
    hiddenPrimitives: doc.hiddenPrimitives,
  };
}

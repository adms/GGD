/**
 * useBattlefieldIntel — 把 `battlefieldIntel` 的純模型接到 HUD store 上 (GH#220)。
 *
 * 兩個責任，刻意分成兩支：
 *
 *  1. {@link useBattlefieldIntelRecorder}（無畫面）：戰鬥中把每個座位餵進帳，
 *     離開戰鬥時封存。**必須掛在一個永遠存在的地方**（HudRoot），不能掛在商店裡：
 *     活著的玩家在 combat 期間 `MerchantShop` 是 `return null` 的（shopGate），
 *     掛在商店裡就等於「只有陣亡的人會記錄戰況」—— 一個只對部分玩家壞掉、因此
 *     幾乎不可能在測試裡被注意到的 bug。
 *
 *  2. {@link useBattlefieldIntelRows}：商店那一頁要印的列。
 *
 * ⚠️ 這一支 hook 每重算一次就會 spawn 一場最多六個 scratch `SimWorld`
 * （`computeStatBlock` 的代價，見 statPreview.ts）。所以 memo 的 key 是**真正被讀
 * 到的那些欄位**組成的簽章，不是 `seats` 陣列的參考 —— 後者每個 snapshot 都是新
 * 物件，等於每 tick 重建六個世界。
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { parseCombatEnvJson } from "@ggd/shared/sim/combatEnv";
import { useHud, type SeatView } from "../../net/RoomStore";
import { useDisplayBaseBonus } from "../displayBaseBonus";
import { useDisplayStatCaps } from "../displayStatCaps";
import {
  buildIntelRows,
  getBattlefieldIntelConfig,
  recordIntelFrame,
  roundIntelLedger,
  type BattlefieldIntelConfig,
  type IntelRow,
} from "./battlefieldIntel";

/**
 * 無畫面的記錄器。掛在 HudRoot，整場都在。
 *
 * 封存的時機是「**離開** combat」而不是「進入 intermission」：回合先進 `resolution`
 * 才進 `intermission`，而 `resolution` 的那幾秒商店是關的但畫面已經在演結算 ——
 * 等到 intermission 才封存，中間任何一個 seats patch 都還會被算進「上一回合」。
 *
 * 規則本身在 `battlefieldIntel.recordIntelFrame`（純函式，有守衛）；這裡只負責把
 * store 的四個值餵給它。
 */
export function useBattlefieldIntelRecorder(): void {
  const matchId = useHud((s) => s.matchId);
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const seats = useHud((s) => s.seats);

  useEffect(() => {
    recordIntelFrame({ matchId, phase, round, seats });
  }, [matchId, phase, round, seats]);
}

/**
 * 記錄器的元件外殼（無畫面，回傳 null，所以這個檔案不需要 JSX）。
 * HudRoot 掛它，理由見檔頭 §1。
 */
export function BattlefieldIntelRecorder(): null {
  useBattlefieldIntelRecorder();
  return null;
}

const EMPTY_ROWS: readonly IntelRow[] = [];

export interface BattlefieldIntelView {
  readonly rows: readonly IntelRow[];
  readonly sealedRound: number;
  readonly config: BattlefieldIntelConfig;
}

/** 只留 memo 簽章真正需要的欄位（其餘欄位變動不該讓六個世界重建）。 */
function seatSignature(seats: readonly SeatView[]): string {
  return JSON.stringify(
    seats.map((s) => [
      s.seatId,
      s.teamId,
      s.displayName,
      s.championId,
      s.level,
      s.abilityRanks,
      s.exAbilityId,
      s.exRank,
      s.items,
      s.augments,
      s.statCapstonePct,
      s.attrBonus,
      s.maxHp,
    ]),
  );
}

/**
 * 商店「戰況」分頁要印的資料。
 *
 * `useSyncExternalStore` 訂閱帳本的 version：封存是在 effect 裡發生的，而面板是在
 * 同一次 commit 的 render 階段讀它 —— 沒有這個訂閱，phase 翻過去的那一次 render
 * 會讀到還沒封存的帳，而且**不會有第二次 render 來修正**（見 battlefieldIntel.ts
 * 裡 `RoundIntelLedger.version` 的註解）。
 */
export function useBattlefieldIntelRows(active = true): BattlefieldIntelView {
  const seats = useHud((s) => s.seats);
  const localSeatId = useHud((s) => s.localSeatId);
  const combatEnvJson = useHud((s) => s.combatEnvJson);
  const baseBonus = useDisplayBaseBonus();
  const statCaps = useDisplayStatCaps();
  const ledgerVersion = useSyncExternalStore(
    roundIntelLedger.subscribe,
    roundIntelLedger.getVersion,
    roundIntelLedger.getVersion,
  );

  const config = getBattlefieldIntelConfig();
  const baseBonusSig = JSON.stringify(baseBonus);
  const statCapsSig = JSON.stringify(statCaps);
  const configSig = JSON.stringify(config);
  const seatSig = seatSignature(seats);

  const env = useMemo(() => parseCombatEnvJson(combatEnvJson), [combatEnvJson]);

  const rows = useMemo(
    () =>
      active
        ? buildIntelRows({
            seats,
            localSeatId,
            config,
            env,
            baseBonus,
            statCaps,
            sealedOf: (seatId) => roundIntelLedger.sealedSourceOf(seatId),
          })
        : // 沒有打開那一頁就不要建六個 scratch world。`config` / `sealedRound` 照樣
          // 回傳（它們是常數時間），所以分頁列不必先打開那一頁才知道要不要長出來。
          EMPTY_ROWS,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, seatSig, localSeatId, configSig, combatEnvJson, baseBonusSig, statCapsSig, ledgerVersion],
  );

  return { rows, sealedRound: roundIntelLedger.sealedRoundNumber(), config };
}

/**
 * RegenSystem — hp/mana regeneration **and percentage self-drain**
 * (per second → per tick).
 *
 * ⚠️ 生命回復**不再只是** `Stat.HealthRegen`(GH#253)。英雄卡有兩格百分比:
 *   · `healthRegenPctOfMax` —— 每秒回最大生命的 N%;
 *   · `healthDrainPctOfMax` —— 每秒**掉**最大生命的 N%(owner 2026-08-02
 *     「Berserker 是每秒損失 1%生命, 直到生命不足1%」)。
 * 兩者的開關、關係、保底/地板全部是 `config.regen@1` 的欄位,語意各只有一份:
 * `sim/regenRules.ts` 的 `healthRegenPerSec` / `healthDrainPerSec` +
 * `applyHealthDrain`。這裡只負責乘上 dt 並照順序套上去。
 *
 * ⭐ 順序:**先回血、再扣血**。兩項獨立計算,誰先誰後只在「同一 tick 內」有差,
 * 而這個順序是刻意的 —— 扣血的地板要夾的是**這一 tick 結束時**的血條,先扣後回
 * 會讓回血把人從地板拉上來、下一 tick 再扣下去,血條在地板上抖動。
 *
 * ⚠️ 扣血**不是傷害**:它不走 `combat/damage.ts`,所以不會被護盾吸、不會被格擋、
 * 不噴傷害數字、不進任何人的輸出統計,也**不會把 `alive` 設成 false** ——
 * 扣不死人是這個機制的定義(見 `regenRules.ts` 的 `MIN_ALIVE_HP`)。
 * 魔力回復沒有百分比路徑(owner 沒有要求),所以它維持原樣。
 */
import type { SimWorld } from "../SimWorld";
import { Stat } from "../stats/statTypes";
import { Champions } from "../content/registry";
import { applyHealthDrain, healthDrainPerSec, healthRegenPerSec } from "../regenRules";
import { manaRegenPerSec } from "../manaEconomy";
import { woundMult } from "../grievousWounds";

export function regenSystem(world: SimWorld): void {
  // ⭐ 扣血只在戰鬥中 —— **回血不是**。
  //
  // 這不是一個新決定,是把 2026-08-02 之前的行為原樣搬過來:自傷本來住在
  // `godie-hapm.passive` 的 `onInterval` hook 上,而 `IntervalHookSystem` 的
  // 決策 2 就是「只在 `combatActive` 時發射」(和 fireRing / MobSystem / coins
  // 同一條規矩)。少了這一行,海克力斯會在**商店與中場**繼續漏血 —— 玩家買完
  // 東西回到場上就已經貼在地板上了,而那是一個沒有人要求的迴歸。
  // 回血維持不設閘(中場補血是既有行為,動它才是迴歸)。
  const drainArmed = world.combatActive;
  for (const [id, hp] of world.health) {
    if (!hp.alive) continue;
    const sc = world.stats.get(id);
    if (!sc) continue;
    // 讀的是**出貨的英雄卡**(`tryGet`,理由同下)—— 兩格百分比都從這裡來。
    const card = Champions.tryGet(sc.championId);
    const isChampion = world.champion.has(id);
    const perSec = healthRegenPerSec(
      {
        flatPerSec: sc.final[Stat.HealthRegen],
        maxHp: hp.maxHp,
        // 讀的是**出貨的英雄卡**,不是這裡自己算的東西(失敗形態 ⑤)。
        // `tryGet` 而不是 `get`:守衛塔、召喚物等等也有 StatsComp,而它們的
        // `championId` 不保證在 `Champions` 裡註冊過 —— `get` 會 throw,
        // 而在 regen 這條每 tick 都跑的路上 throw 就是整場比賽停擺。
        pctOfMax: card?.healthRegenPctOfMax,
        envHealthRegen: world.combatEnv.healthRegen,
        isChampion,
      },
      world.regenRules,
    );
    // 【重創】A6（#278）—— 讀取點③。⛔ **最容易被漏掉的一個**：自然回復
    // 不經過 `healTarget`，所以只改治療那一條路會讓它靜默地不生效
    //（七種失敗形態 ②）。owner 裁決⑥明說自然回復也要打折。
    hp.hp = Math.min(hp.maxHp, hp.hp + perSec * woundMult(world, id, "regenMult") * world.dt);

    // 扣血 —— 順序與「為什麼不是傷害」寫在檔頭。
    const drainPerSec = drainArmed
      ? healthDrainPerSec(
          { maxHp: hp.maxHp, pctOfMax: card?.healthDrainPctOfMax, isChampion },
          world.regenRules,
        )
      : 0;
    // ⚠️ 只有**真的有自傷**的單位才進這條路。`clamp` 模式會把血條往上拉,所以
    // 少了這道閘,一份 clamp 設定會讓**全場每一個人**都不能被打到 1% 以下。
    if (drainPerSec > 0) {
      hp.hp = applyHealthDrain(hp.hp, hp.maxHp, drainPerSec * world.dt, world.regenRules);
    }

    // 回魔的**地板**（GH#446，`config.mana-economy@1`）—— owner 2026-08-19
    // 「平均回魔不超過 15 秒就可以滿魔再一輪」。語意只有一份：`sim/manaEconomy.ts`
    // 的 `manaRegenPerSec`，這裡只負責乘 dt。⛔ 關掉那一格就逐位元回到
    // `sc.final[Stat.ManaRegen]`（今天的行為），⛔ 不是「回到一個接近的值」。
    const manaPerSec = manaRegenPerSec(
      { flatPerSec: sc.final[Stat.ManaRegen], maxMana: hp.maxMana, isChampion },
      world.manaEconomy,
    );
    hp.mana = Math.min(hp.maxMana, hp.mana + manaPerSec * world.dt);
  }
}

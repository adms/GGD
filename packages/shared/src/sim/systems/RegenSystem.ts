/**
 * RegenSystem — hp/mana regeneration from final stats (per second → per tick).
 *
 * ⚠️ 生命回復**不再只是** `Stat.HealthRegen`(GH#253)。英雄卡可以填
 * `healthRegenPctOfMax`(「每秒回最大生命的 N%」),而百分比與固定值的關係、
 * 以及有沒有保底,是 `config.regen@1` 的欄位 —— 全部由
 * `sim/regenRules.ts healthRegenPerSec` 一份順序決定,這裡只負責把答案乘上 dt。
 * 魔力回復沒有百分比路徑(owner 沒有要求),所以它維持原樣。
 */
import type { SimWorld } from "../SimWorld";
import { Stat } from "../stats/statTypes";
import { Champions } from "../content/registry";
import { healthRegenPerSec } from "../regenRules";

export function regenSystem(world: SimWorld): void {
  for (const [id, hp] of world.health) {
    if (!hp.alive) continue;
    const sc = world.stats.get(id);
    if (!sc) continue;
    const perSec = healthRegenPerSec(
      {
        flatPerSec: sc.final[Stat.HealthRegen],
        maxHp: hp.maxHp,
        // 讀的是**出貨的英雄卡**,不是這裡自己算的東西(失敗形態 ⑤)。
        // `tryGet` 而不是 `get`:守衛塔、召喚物等等也有 StatsComp,而它們的
        // `championId` 不保證在 `Champions` 裡註冊過 —— `get` 會 throw,
        // 而在 regen 這條每 tick 都跑的路上 throw 就是整場比賽停擺。
        pctOfMax: Champions.tryGet(sc.championId)?.healthRegenPctOfMax,
        envHealthRegen: world.combatEnv.healthRegen,
        isChampion: world.champion.has(id),
      },
      world.regenRules,
    );
    hp.hp = Math.min(hp.maxHp, hp.hp + perSec * world.dt);
    hp.mana = Math.min(hp.maxMana, hp.mana + sc.final[Stat.ManaRegen] * world.dt);
  }
}

import { z } from "zod";
import { zRef } from "../common";
import {
  EFFECT_COMMON_SHAPE,
} from "./_shared";

export const zSummon =
z
  .object({
    kind: z.literal("summon"),
    ...EFFECT_COMMON_SHAPE,
    /**
     * WHOSE BODY. `"self"` clones the CASTER's own champion (57-03 複製鏡,
     * 27-002 霧隱分身之術), so those docs need not name their own hero twice.
     * ABSENT = `"champion"`, i.e. `championId` below.
     */
    body: z.enum(["champion", "self"]).optional(),
    /**
     * SOFT ref: a summon's body is a champion doc, but an ability may be
     * authored before the body exists. Tighten to a hard ref once every
     * summoned unit ships. An unknown id summons NOTHING and emits
     * `summonFailed` (effects/summon.ts) — never a throw inside a tick.
     */
    championId: zRef("champions", { soft: true }),
    /** bodies per cast. The ceiling is an anti-typo guard, not balance. */
    count: z.number().int().min(1).max(20),
    /** seconds before despawn; ABSENT = permanent (WC3's 0-duration form) */
    durationSec: z.number().positive().max(600).optional(),
    level: z.number().int().min(1).max(30).optional(),
    /* ── 決策點 (owner 2026-07-30 「尤其是決策點」) ────────────────────────
     * Every enum below is a place the 52 「召喚代理」 in
     * docs/ability-templates.md disagree with each other, so none of them can
     * be a branch chosen in code. See the `summon` member of
     * sim/effects/effect.ts for the per-field evidence. */
    /** 歸屬: the summoner's team (default) or the hostile MONSTER sentinel */
    team: z.enum(["owner", "neutral"]).optional(),
    /** anchor for the formation: caster (default) / first target / cast point */
    at: z.enum(["self", "target", "point"]).optional(),
    /** 固定陣型 or 隨機散佈 — `"scatter"` draws from the world's SEEDED rng */
    formation: z.enum(["ring", "line", "scatter"]).optional(),
    /**
     * ring radius / line spacing / scatter radius, GGD units. UPPER-BOUNDED
     * (CLAUDE.md 「欄位要有上界，不是只有下界」): a duel zone is ~24 units
     * across, so a raw un-converted WC3 offset (400/450) pasted in here would
     * scatter the whole summon outside the arena and every body would be
     * silently clamped onto the rim.
     */
    spread: z.number().positive().max(12).optional(),
    /** 上限: most bodies alive at once in this cap group; ABSENT = DEFAULT_SUMMON_CAP (8) */
    maxAlive: z.number().int().min(0).max(20).optional(),
    /** what the cap counts: per caster PER ability (default) or per caster */
    capScope: z.enum(["caster", "casterAbility"]).optional(),
    /** at the cap: drop the new body (default) or evict the oldest (37-02 黑核晶) */
    onCap: z.enum(["skip", "replaceOldest"]).optional(),
    /** summoner dies → despawn (default) or fight on to the deadline */
    onOwnerDeath: z.enum(["despawn", "persist"]).optional(),
    /** ×the source champion's own maxHealth (1 = the hero's own sheet) */
    hpMult: z.number().positive().max(10).optional(),
    /** ×the source champion's own attack damage */
    damageMult: z.number().positive().max(10).optional(),
    /**
     * Who is paid for the summon's kills. ABSENT/`"none"` = nobody, which is
     * what the sim does today by construction.
     *
     * ⚠️ `"owner"` is ACCEPTED BY THE SCHEMA AND REFUSED BY THE HANDLER — it
     * needs a killer-rewrite seam in systems/DeathSystem.ts. Kept in the enum
     * (rather than dropped) so the value the editor will eventually offer has
     * one spelling, and so the refusal is a LOUD error naming the missing
     * seam instead of a Zod message about an unknown string.
     */
    killCredit: z.enum(["none", "owner"]).optional(),
    /* ── 誰打得到它 —— 決策點。預設值與理由: sim/summonRules.ts ───────────
     * A summon is deliberately neither a `champion` nor a `mob`, and BOTH of
     * the sim's automatic target pickers used to be allow-lists over exactly
     * those two stores — so nothing in the game could acquire a summon. These
     * six are what turned that from a hard-coded fact into an authored one. */
    /**
     * 敵方**自動**索敵看不看得見它。ABSENT = true = WC3 (an ordinary unit).
     * `false` hides it from auto-acquisition ONLY — it stays in the collision
     * broad-phase, so ability AoE and skillshots still hit it. This is not
     * invulnerability and must not be authored as if it were.
     */
    autoTargetable: z.boolean().optional(),
    /**
     * 索敵優先級。ABSENT = `"summon"`, its own tier between hero and zombie.
     * `"champion"` makes it soak attacks like a hero (57-03 複製鏡, 27-002
     * 霧隱分身之術 — decoys whose whole job is to be shot at); `"mob"` drops
     * it below every hero so it never pulls autos off the real fight.
     */
    targetPriority: z.enum(["champion", "summon", "mob"]).optional(),
    /** #215 殭屍會不會改去咬它。ABSENT = true = WC3 (creeps fight summons). */
    mobTargetable: z.boolean().optional(),
    /** 玩家能不能手動點名它。ABSENT = true = WC3 (right-clickable). */
    manualTargetable: z.boolean().optional(),
    /**
     * 縮圈的火燒不燒它。ABSENT = true —— owner 2026-07-30 的 保底:「所有場上
     * 玩家、bot、各種殭屍都會百分比真實傷害燒死」。Author `false` only for a
     * body that is scenery rather than a combatant (37-03 災難之牆).
     */
    burnsInFireRing: z.boolean().optional(),
    /**
     * 打死它付給擊殺者的金幣。ABSENT = 0 = 今天的行為 = WC3 (a summoned unit
     * is not a gold-bearing unit, which is what stops 召喚 spam being a gold
     * farm). UPPER-BOUNDED (CLAUDE.md 「欄位要有上界」): the shipped kill
     * bounty for a whole enemy CHAMPION is far below 1,000, so anything past
     * that is a typo, and a typo here prints gold every cast.
     */
    bountyGold: z.number().min(0).max(1000).optional(),
  })
  .strict();

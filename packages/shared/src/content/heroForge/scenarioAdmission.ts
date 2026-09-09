import { runHeroAbilityScenario, runHeroKitScenario } from "./scenario";

/** Keep the cheap smoke path. A rejected conditional skill is retried using
 * bounded, recorded prerequisite inputs. Import still requires actual casts;
 * a failed retry stays failed, and no rejection is relabelled as a pass.
 */
export function runHeroAdmissionScenarios(
  champion: Parameters<typeof runHeroKitScenario>[0],
  abilities: Parameters<typeof runHeroKitScenario>[1],
  options: Parameters<typeof runHeroAbilityScenario>[2] = {},
) {
  const opts = { ...options, ticks: options.ticks ?? 180 };
  const slots = Object.values(abilities).map(ability => {
    const smoke = runHeroAbilityScenario(champion, ability, opts);
    return smoke.status === "rejected"
      ? runHeroAbilityScenario(champion, ability, { ...opts, preparePrerequisites: true }) : smoke;
  });
  const kitOptions = { ...options, ticksPerStep: 180 };
  const smokeKit = runHeroKitScenario(champion, abilities, kitOptions);
  const kit = smokeKit.status === "rejected"
    ? runHeroKitScenario(champion, abilities, { ...kitOptions, preparePrerequisites: true }) : smokeKit;
  return { slots, kit };
}

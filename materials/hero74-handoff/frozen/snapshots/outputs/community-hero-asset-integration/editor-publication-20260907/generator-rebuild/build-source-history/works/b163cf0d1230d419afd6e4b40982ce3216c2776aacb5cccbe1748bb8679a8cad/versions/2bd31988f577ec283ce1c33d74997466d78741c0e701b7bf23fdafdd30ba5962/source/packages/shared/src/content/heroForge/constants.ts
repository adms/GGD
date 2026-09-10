export const HERO_SLOTS = ["PASSIVE", "Q", "W", "E", "R", "EX"] as const;
export type HeroSlot = (typeof HERO_SLOTS)[number];

export const HERO_SECTION_IDS = [
  "identity",
  "attributes",
  "skills",
  "mechanics",
  "presentation",
  "validation",
  "package",
] as const;
export type HeroSectionId = (typeof HERO_SECTION_IDS)[number];

export const HERO_PROJECT_SCHEMA = "ggd-hero-project@2" as const;
export const HERO_PLAN_SCHEMA = "ggd-hero-plan@2" as const;
export const HERO_PROPOSAL_REQUEST_SCHEMA = "ggd-hero-proposal-request@1" as const;
export const HERO_PROPOSAL_SCHEMA = "ggd-hero-proposal@1" as const;
export const HERO_PROPOSAL_BATCH_SCHEMA = "ggd-hero-proposal-batch@1" as const;
export const HERO_PRESENTATION_SCHEMA = "ggd-hero-presentation@1" as const;

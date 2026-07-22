/** Shared HUD styling constants (CSS-side team palette mirrors render/). */

export const TEAM_CSS = ["#4d7bf3", "#e5483f", "#47cc6a", "#f2c637"] as const;

export function teamCss(teamId: number): string {
  return TEAM_CSS[((teamId % 4) + 4) % 4]!;
}

export const PANEL_BG = "rgba(12, 16, 26, 0.88)";
export const PANEL_BORDER = "1px solid rgba(120, 140, 190, 0.35)";
export const TEXT_DIM = "#8d97ad";
export const TEXT_MAIN = "#e8ecf4";
export const GOLD = "#f2c637";

/**
 * Selectable arenas for the offline "Play vs bots" picker and the online
 * create-room map dropdown. Ids are Arenas registry keys (content/arenas/*);
 * the game-server resolves an unknown id back to the skeleton.
 */
export interface ArenaOption {
  id: string;
  label: string;
}

export const ARENA_OPTIONS: ArenaOption[] = [
  { id: "arena.skeleton", label: "Skeleton (預設)" },
  { id: "arena.castle", label: "城堡競技場（室內）" },
  { id: "arena.colosseum", label: "羅馬大擂台（室外）" },
  { id: "arena.dota", label: "Dota 三路河道（迷你）" },
  { id: "arena.godie", label: "GoDie 匯入圖" },
];

export const DEFAULT_MAP_ID = "arena.skeleton";

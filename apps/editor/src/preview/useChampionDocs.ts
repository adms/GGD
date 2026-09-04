import { useQuery } from "@tanstack/react-query";
import { zChampionDoc, type ChampionDoc } from "@ggd/shared/content";
import { api } from "../api/client";

/**
 * One shared owner index for every preview surface.
 *
 * Returning the query state is important: an empty array while 71 champion
 * documents are still loading does not mean "this ability has no owner".
 * Treating those two states as the same made the generic preview and Skill
 * Forge flash a false blocker on every first open.
 */
export function useChampionDocs(): {
  champions: ChampionDoc[];
  isLoading: boolean;
  error: Error | null;
} {
  const query = useQuery({
    queryKey: ["preview-champions"],
    queryFn: async () => {
      const index = await api.index("champions");
      const docs = await Promise.all(index.entries.map((entry) => api.doc("champions", entry.id)));
      return docs
        .map((doc) => zChampionDoc.safeParse(doc))
        .filter((result) => result.success)
        .map((result) => (result as { success: true; data: ChampionDoc }).data);
    },
    staleTime: 10_000,
  });
  return {
    champions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : query.error ? new Error(String(query.error)) : null,
  };
}

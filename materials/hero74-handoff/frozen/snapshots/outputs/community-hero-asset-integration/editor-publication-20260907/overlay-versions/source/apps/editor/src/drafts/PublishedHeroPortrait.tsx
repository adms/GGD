import { useEffect, useState } from "react";
import type { HeroListRow } from "@ggd/shared/content/communityHero";
import { heroPlatform } from "../hero/communitySession";

/** Fetch the published icon through the configured platform (also on desktop).
 * The expected package prevents an old list row from displaying a newer icon. */
export function PublishedHeroPortrait({ hero }: { hero: HeroListRow }) {
  const key = `${hero.workId}:${hero.packageDigest}`;
  const [loaded, setLoaded] = useState<{ key: string; url?: string; error?: boolean } | null>(null);
  useEffect(() => {
    setLoaded(null);
    if (!hero.portraitPath) return;
    let alive = true, objectUrl: string | undefined;
    void heroPlatform.binaryResponse(`/hero-works/${encodeURIComponent(hero.workId)}/portrait?version=${encodeURIComponent(hero.packageDigest)}`)
      .then(async (response) => {
        if (response.headers.get("content-type")?.split(";")[0] !== "image/webp") throw new Error("肖像格式不符");
        const blob = await response.blob();
        if (alive) { objectUrl = URL.createObjectURL(blob); setLoaded({ key, url: objectUrl }); }
      }).catch(() => { if (alive) setLoaded({ key, error: true }); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [key, hero]); // A refreshed list row also retries a temporary image failure.
  if (!hero.portraitPath) return null;
  if (loaded?.key === key && loaded.url) return <img src={loaded.url} alt={`${hero.name} 肖像`} width={80} height={80} style={{ objectFit: "cover", borderRadius: 8 }} />;
  return <p>{loaded?.key === key && loaded.error ? "肖像暫時無法讀取，可更新清單重試。" : "肖像載入中…"}</p>;
}

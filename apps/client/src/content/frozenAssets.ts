let current: ReadonlyMap<string, string> | null = null;

export function setFrozenMatchAssetUrls(urls: ReadonlyMap<string, string> | null): void { current = urls; }
export function frozenContentAssetUrl(url: string): string | undefined {
  const path = url.replace(/^\/content\//, "").split(/[?#]/, 1)[0]!;
  return current?.get(path);
}

/** Each AssetManager captures its own map, so a later match cannot change it. */
export function frozenMatchAssetSource(): { resolveUrl(path: string): string } | undefined {
  const urls = current;
  if (!urls) return undefined;
  return { resolveUrl: (path) => urls.get(path) ?? `/content/${path}` };
}

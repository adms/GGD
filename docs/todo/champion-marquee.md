# Champion-portrait marquee (login roster showcase) — TODO

Login screen. A horizontal, auto-scrolling strip of champion portraits pinned above the footer
that "變相介紹有哪些英雄" — showcases the pickable roster over the dark 3D boss scene.

**Shape:**
- `apps/client/src/ui/platform/marqueeRoster.ts` — pure builder: roster → flat tile list.
  Drops non-selectable transform/alt forms (`transform-form` tag); resolves each portrait via
  `contentAssetUrl` (icon-less stock-art heroes → `iconUrl: null` → fallback chip, never a
  broken `<img>`); duplicates the list (`copies`, default 2) so a pure-CSS
  `translateX(0 → -50%)` keyframe loops with no seam; stable per-id `hue`/`initial` for chips.
- `apps/client/src/ui/platform/ChampionMarquee.tsx` — the band. Reads the shared `Champions`
  registry (populated at boot before AuthScreen mounts; empty → renders nothing). PURE CSS
  motion (no rAF); scroll duration scales with roster size for constant pixel speed;
  `pointer-events:none` so it never swallows form/map-select/Play-offline clicks; portrait-less
  or 404 tiles fall back to a colored first-glyph chip; `prefers-reduced-motion` pauses the
  scroll; dark scrim + edge mask so it reads over the bright scene; `overflow:hidden` fixed
  tiles → no page horizontal scroll on mobile.
- `apps/client/src/ui/platform/AuthScreen.tsx` — mounts `<ChampionMarquee/>` above the footer
  in the zIndex:1 content layer (one import + one element; form layout untouched).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| marquee-01 | Tile builder excludes non-selectable forms (`transform-form`) so only pickable heroes are shown | champ-marquee-exclude-forms | unit | done |
| marquee-02 | Icon-less champion → fallback tile (`iconUrl` null + first-glyph initial); an `assets/…` icon resolves to `/content/assets/…` (never a broken img) | champ-marquee-fallback | unit | done |
| marquee-03 | Roster is duplicated for a seamless loop (`copies × distinct` tiles, keys unique per copy, copy-2 mirrors copy-1) with a stable per-id chip hue | champ-marquee-loop | unit | done |
| marquee-04 | Test heroes are dropped and duplicate ENTRIES fold via the shared identity rule (`distinctCharacters`) — never via a hand-kept id blocklist | champ-marquee-dedup | unit | done |
| marquee-05 | Stable chip hue, `copies` clamped to ≥2, empty roster → no tiles | champ-marquee-misc | unit | done |

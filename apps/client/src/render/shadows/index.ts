/**
 * render/shadows — the self-contained blob-shadow layer (task #147).
 *
 * A soft dark disc under every live body, following the rendered positions the
 * render layer already exposes. Pure geometry in `shadowMath`, the pooled
 * Babylon shell in `ShadowLayer`.
 */
export * from "./shadowMath";
export * from "./ShadowLayer";

/**
 * Numeric format contract for generated combat FX that are committed under
 * `content/assets/audio/sfx/fx/`. Source containers and archive masters are
 * preserved separately and are deliberately outside this shipping contract.
 */
export const GENERATED_COMBAT_FX_AUDIO_POLICY = {
  container: "mp3",
  codec: "MPEG-1 Layer III",
  channels: 1,
  sampleRateHz: 44_100,
  bitrateKbpsMax: 128,
} as const;

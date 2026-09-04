/**
 * Browser-safe identity of the runtime-direct authoring processor.
 *
 * Filesystem hashing stays in `authoringProcessor.ts`; schemas and browser
 * bundles need only these literals and must not import Node built-ins.
 */
export const AUTHORING_PROCESSOR_KIND = "runtime-direct" as const;
export const AUTHORING_PROCESSOR_CONTRACT_VERSION = "runtime-direct@1" as const;

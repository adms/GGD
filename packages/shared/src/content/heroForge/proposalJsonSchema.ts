/** Strict provider-facing schema. Trusted provider receipts are added later by the desktop main process. */
export const HERO_PROPOSAL_PAYLOAD_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "proposals"],
  properties: {
    schema: { const: "ggd-hero-proposal-batch@1" },
    proposals: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "schema", "requestDigest", "baseRevision", "sectionId", "outcome", "patches",
          "referencedTemplateIds", "referencedCapabilityIds", "selectedDirectionOptionIds",
          "selectedFallbackOptionIds", "assumptions", "explanation",
        ],
        properties: {
          schema: { const: "ggd-hero-proposal@1" },
          requestDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
          baseRevision: { type: "integer", minimum: 0 },
          sectionId: { enum: ["identity", "attributes", "skills", "mechanics", "presentation", "validation", "package"] },
          outcome: { enum: ["proposed", "degraded", "refused", "advice"] },
          patches: {
            type: "array",
            maxItems: 64,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["op", "path", "value"],
              properties: {
                op: { const: "replace" },
                path: { type: "array", minItems: 2, maxItems: 6, items: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9]*$" } },
                value: {
                  anyOf: [
                    { type: "string" },
                    { type: "integer" },
                    { type: "array", items: { type: "string" } },
                  ],
                },
              },
            },
          },
          referencedTemplateIds: { type: "array", maxItems: 64, items: { type: "string" } },
          referencedCapabilityIds: { type: "array", maxItems: 128, items: { type: "string" } },
          selectedDirectionOptionIds: { type: "array", maxItems: 32, items: { type: "string" } },
          selectedFallbackOptionIds: { type: "array", maxItems: 32, items: { type: "string" } },
          assumptions: { type: "array", maxItems: 32, items: { type: "string", minLength: 1, maxLength: 500 } },
          explanation: { type: "string", minLength: 1, maxLength: 4000 },
        },
      },
    },
  },
} as const;

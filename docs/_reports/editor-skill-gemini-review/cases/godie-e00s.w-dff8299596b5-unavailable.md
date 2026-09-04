# VFX visual review unavailable: godie-e00s.w

- Classification: **needs-human-review**
- Authority: **advisory-only**
- Reason: **GEMINI_UNAVAILABLE**
- Provider: **Google Gemini**
- Endpoint: `https://generativelanguage.googleapis.com`
- Source digest: `dff8299596b54ed4b2d207b546166adfc95825f1c8eb8c11b261ce2b3a4bf2bb`

Vision inference was unavailable and no AI pass was granted. SimWorld/event-trace checks and human visual acceptance must continue.

Detail: Gemini returned HTTP 429: {
  "error": {
    "code": 429,
    "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model, limit: 25, model: gemini-3.1-pro\nPlease retry in 19.630087538s.",
    "status": "RESOURCE_EXHAUSTED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.Help",
        "links": [
          {
            "description": "Learn more about Gemini API quotas",
            "url": "https://ai.google.dev/gemini-api/docs/rate-limits"
          }
        ]
      },
      {
        "@type": "type.googl

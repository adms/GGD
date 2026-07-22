// Package infracheck contains automated infra guards (run as go tests):
//
//   - helm chart renders (helm binary, or dockerized alpine/helm fallback)
//   - platform single-writer invariant (replicas:1 + Recreate + RWO)
//   - content-api absent from the prod profile (helm + nginx)
//   - nginx edge config: syntax (-t), routing, and ?h= immutable caching —
//     verified against a REAL nginx container with stub dists + content
//   - secrets are env-injected, never baked into images
//   - the helm chart's nginx.conf copy has not drifted from nginx/nginx.conf
//
// Each test skips cleanly when its external tool (helm/docker) is missing, so
// `go test ./...` stays green on minimal machines; CI has both. Tests emit
// coverage beacons (testkit.Cover) tied to docs/todo/infra.md test_ids.
package infracheck

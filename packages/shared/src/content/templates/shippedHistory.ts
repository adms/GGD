import sequenceV1 from "./history/tpl-effect-sequence.7737c132.json" with { type: "json" };
import { contentSha256 } from "../import/jcs";
import { zTemplateDoc } from "../schema/template";

// Server-shipped source, retained from 601b64586171ca6762820c920d6c95e5deb7bf01.
// This list is independent of submitted projects. Adding an entry requires the
// normal code review; project.templateVersions never grants source approval.
const sources = [{ raw: sequenceV1, digest: "sha256:7737c132c32231e336a95ad3052ea0092a0eaba31a4d45504f74f734e908cd15" }];
export function resolveShippedTemplateVersion(id: string, digest: string) {
  const found = sources.find(entry => entry.raw.id === id && entry.digest === digest);
  if (!found) return undefined;
  const template = zTemplateDoc.parse(found.raw);
  if (contentSha256(template) !== digest) throw new Error("Retained template digest mismatch");
  return structuredClone(template);
}

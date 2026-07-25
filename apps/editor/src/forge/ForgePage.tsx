/** 鑄技工坊 page shell: gallery → studio. */
import { useState } from "react";
import type { TemplateDoc } from "@ggd/shared/content";
import { ForgeGallery } from "./ForgeGallery";
import { ForgeStudio } from "./ForgeStudio";

export function ForgePage() {
  const [picked, setPicked] = useState<TemplateDoc | null>(null);
  return picked ? (
    <ForgeStudio template={picked} onBack={() => setPicked(null)} />
  ) : (
    <ForgeGallery onPick={setPicked} />
  );
}

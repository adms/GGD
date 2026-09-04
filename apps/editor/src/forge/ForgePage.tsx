/** 鑄技工坊 page shell: gallery → studio. */
import { useState } from "react";
import type { TemplateDoc } from "@ggd/shared/content";
import { ForgeGallery } from "./ForgeGallery";
import { ForgeStudio } from "./ForgeStudio";
import type { SkillTypePreset } from "./skillTypePresets";

interface Pick {
  readonly template: TemplateDoc;
  /**
   * The whole indexed set, carried through so the studio can offer SECOND and
   * THIRD cards (模板複數套用) without re-querying. The gallery already has the
   * list in hand; handing it over is one prop and saves the studio a fetch that
   * could disagree with what the operator just clicked.
   */
  readonly catalog: readonly TemplateDoc[];
  readonly skillType?: SkillTypePreset;
  readonly preferredChampionId?: string;
}

export function ForgePage() {
  const [picked, setPicked] = useState<Pick | null>(null);
  return picked ? (
    <ForgeStudio
      template={picked.template}
      catalog={picked.catalog}
      skillType={picked.skillType}
      preferredChampionId={picked.preferredChampionId}
      onBack={() => setPicked(null)}
    />
  ) : (
    <ForgeGallery
      onPick={(template, catalog, context) => setPicked({
        template,
        catalog,
        skillType: context?.skillType,
        preferredChampionId: context?.championId,
      })}
    />
  );
}

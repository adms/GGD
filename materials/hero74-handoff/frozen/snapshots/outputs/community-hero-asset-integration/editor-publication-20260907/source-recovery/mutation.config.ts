import base from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/vitest.config";

export default {
  ...base,
  plugins: [...(base.plugins ?? []), {
    name: "source-recovery-mutation",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.endsWith("/apps/content-api/src/editorSourceRecovery.ts")) return;
      const target = "for (const [path, before] of files) {";
      if (!code.includes(target)) throw new Error("mutation target missing");
      // Vite transforms this test process only; no running service or source
      // file sees the mutation. Skip byte restoration but retain verification.
      return code.replace(target, "for (const [path, before] of [...files].slice(0, 0)) {");
    },
  }],
};

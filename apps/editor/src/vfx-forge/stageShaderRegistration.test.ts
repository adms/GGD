import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import "./VfxForgeStage";

describe("VFX Forge paused rendering", () => {

  it("eagerly registers the GLB PBR and RGBD shaders used by a direct Forge route", () => {
    expect(ShaderStore.ShadersStore.pbrVertexShader).toContain("gl_Position");
    expect(ShaderStore.ShadersStore.pbrPixelShader).toContain("finalColor");
    expect(ShaderStore.ShadersStore.postprocessVertexShader).toContain("gl_Position");
    expect(ShaderStore.ShadersStore.rgbdDecodePixelShader).toContain("fromRGBD");
  });

  it("bounds paused-scene readiness before compiling actor materials", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8");
    expect(source).toContain("ACTOR_READY_BUDGET_MS = 750");
    expect(source).toContain("ACTOR_WARMUP_FRAMES = Math.ceil(ACTOR_IDLE_PRIME_MS / STEP_MS)");
    expect(source).toContain("ACTOR_VISIBILITY_RETRIES = 6");
    expect(source).toContain("ACTOR_VISIBILITY_RETRY_FRAMES = 3");
    expect(source).toContain("ACTOR_SHADER_BUDGET_MS = 4_000");
    expect(source).toContain("ACTOR_IDLE_PRIME_MS = 600");
    expect(source).toContain("this.renderActorWarmupLoop(ACTOR_WARMUP_FRAMES, view)");
    expect(source).toContain("view.update(state, actorNowMs, STEP_MS)");
    expect(source).toContain("const peers = this.allActors().filter((candidate) => candidate !== actor)");
    expect(source).toContain("peer.bodyRoot?.setEnabled(false)");
    expect(source).toContain("peer.bodyRoot?.setEnabled(peerStates[index]!.body)");
    expect(source).toContain("body.position.x = focus.x");
    expect(source).toContain("body.position.x = bodyX");
    expect(source).toContain("this.engine.runRenderLoop(render)");
    expect(source).toContain("this.engine.stopRenderLoop(render)");
    expect(source).toContain("this.waitForSceneReadyBounded()");
    expect(source).toContain("this.compileActorMaterialsWithRenderPump(visible)");
    expect(source).toContain("mesh.material.isReady(mesh)");
    const actorCompile = source.slice(source.indexOf("private async compileActorMaterialsWithRenderPump"), source.indexOf("private waitForBrowserFrame"));
    expect(actorCompile).toContain("texture.isReady()");
    expect(actorCompile).toContain("const textureDeadline = Date.now() + ACTOR_SHADER_BUDGET_MS");
    expect(actorCompile).toContain("const materialDeadline = Date.now() + ACTOR_SHADER_BUDGET_MS");
    expect(actorCompile).toContain("material.markAsDirty(Material.TextureDirtyFlag)");
    expect(actorCompile).not.toContain("material.forceCompilationAsync");
    expect(actorCompile).toContain("this.renderScene()");
  });

  it("keeps calibration bounded and renders champions through Main's tint resolver", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8");
    const calibrate = source.slice(source.indexOf("async calibrate()"), source.indexOf("async auditBackdropTimeline"));
    expect(calibrate).toContain("await this.waitForSceneReadyBounded()");
    expect(calibrate).not.toContain("await this.scene.whenReadyAsync()");
    const genericReady = source.slice(source.indexOf("private async waitForSceneReadyBounded"), source.indexOf("private casterEntityId"));
    expect(genericReady).not.toContain("whenReadyAsync");
    expect(source).toContain("championTintForId(champion.id) ?? null");
    expect(source).not.toContain("applyModelTint(glbRoot, champion);");
  });

  it("primes the shipped ChampionView idle state before framebuffer visibility proof", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8");
    const prime = source.indexOf("const initialState = view.anim.update({ alive: true, moving: false }, this.nowMs)");
    expect(prime).toBeGreaterThan(0);
    expect(source.indexOf("view.update(initialState, this.nowMs, STEP_MS)", prime)).toBeGreaterThan(prime);
    expect(source.indexOf("this.measureActorVisibility(actor)", prime)).toBeGreaterThan(prime);
  });

  it("serializes per-actor framebuffer proof on the shared Babylon scene", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8");
    expect(source).toContain("await this.loadActor(actors.caster)");
    expect(source).toContain("await this.loadActor(actors.target)");
    expect(source).not.toContain("Promise.all([\n      this.loadActor(this.actors.caster)");
  });

  it("renders summoned combat bodies from the authoritative Sim lifecycle", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain("this.prepareSummonActors()");
    expect(source).toContain('if (item.event.type !== "summonSpawn") continue');
    expect(source).toContain("Champions.tryGet(championId as never)");
    expect(source).toContain('this.makeActor(\n        "summon"');
    expect(source).toContain("for (const actor of this.summonActors.values()) await this.loadActor(actor)");
    expect(source).toContain("this.applySummonLifecycleEvent(item.event)");
    expect(source).toContain('if (event.type === "summonSpawn")');
    expect(source).toContain('else if (event.type === "summonDespawn")');
    expect(source).toContain("this.setActorEnabled(actor, false)");
    expect(source).toContain("if (!actor.active) continue");
  });

  it("mounts one stable scene only after both review actors resolve", () => {
    const source = readFileSync(new URL("./VfxForgePreview.tsx", import.meta.url), "utf8");
    expect(source).toContain("if (!caster || !target)");
    expect(source.indexOf("if (!caster || !target)")).toBeLessThan(
      source.indexOf("const stage = new VfxForgeStage"),
    );
    expect(source).toContain("等待雙方角色內容…");
  });

  it("warms script model effects on the shipped VfxSystem that renders them", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain("this.runtimeVfx?.warmModelFx(modelKeys)");
    expect(source).toContain("if (!this.runtimeVfx) this.modelRig.warm(modelKeys)");
  });

  it("moves the neutral arena with each real SimWorld trace", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain('{ center: { x: 0, z: 0 }, boundaryRadius: 24 }');
    expect(source).toContain("root.position.set(this.homePose.caster.x, 0, this.homePose.caster.z)");
    expect(source).toContain("this.groundRoot.position.set(this.homePose.caster.x, 0, this.homePose.caster.z)");
  });

  it("uses the shipped scenery-lighting resolver instead of a Forge-only light rig", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain('setupLighting(this.scene)');
    expect(source).toContain('this.lighting.applyScenery(undefined, false)');
    expect(source).toContain('this.lighting.animate(this.nowMs / 1000)');
    expect(source).not.toContain('new HemisphericLight("vfx-forge-hemi"');
    expect(source).not.toContain('new DirectionalLight("vfx-forge-sun"');
  });

  it("boots the exact client Renderer rather than a second Engine/Scene policy", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain("this.renderer = new Renderer(canvas)");
    expect(source).toContain("this.engine = this.renderer.engine");
    expect(source).toContain("this.scene = this.renderer.scene");
    expect(source).toContain("this.renderer.dispose()");
    expect(source).not.toContain("new Engine(canvas");
  });

  it("starts from Main's config-backed camera dolly", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8");
    expect(source).not.toContain("this.cameraRig.zoomBy(-400)");
    expect(source).toContain("new CameraRig(this.scene, this.cameraFocus())");
  });

  it("delegates champion bodies and action clips to the shipped ChampionView", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain("new ChampionView(this.scene, entityId, champion.modelKey");
    expect(source).toContain("view.tryUpgradeToGlb(this.assets, doc, champion.bodyScale)");
    expect(source).toContain("view.beginCast(windowMs, this.nowMs)");
    expect(source).toContain("view.beginAttack(windowMs, this.nowMs)");
    expect(source).toContain("view.anim.update({ alive: true, moving: false }, this.nowMs)");
    expect(source).not.toContain("resolveClips(actor.groups");
  });

  it("mirrors Main's default action channels after script takeover claims", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain('import { channelTakeover } from "../../../client/src/render/channelTakeover"');
    expect(source).toContain("this.runtimeVfx?.handleEvent(item.event, item.atMs);");
    expect(source).toContain("this.pulseActorsFromRuntimeEvent(item.event, item.atMs);");
    expect(source).toContain('channelTakeover.heldBy(id!, rule.channel, nowMs)');
    expect(source).toContain('ev.type === "projectileHit"');
    expect(source).toContain('ev.type === "reflectSuccess"');
    expect(source).toContain("channelTakeover.reset()");
  });

  it("renders bodyMove through Main's scripted-offset seam in both preview modes", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source.match(/moveBody: \(id, offset, ms, arc\) =>/g)).toHaveLength(2);
    expect(source.match(/moveBodyFor\(id, offset, ms, arc, this\.nowMs\)/g)).toHaveLength(2);
    expect(source).toContain("this.semanticActionCount++");
    expect(source).toContain("scriptedOffset(id, this.nowMs)");
    expect(source).toContain("view.setPose(x, z, actor.facing.x, actor.facing.z, offset?.y ?? 0)");
    expect(source).toContain("resetScriptedMoves()");
  });

  it("waits for stopped pre-warmed particle textures before deterministic GPU audit", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain("this.runtimeVfx?.warmVfxDocs(warmDocs)");
    expect(source).toContain("await this.waitForParticleTexturesReady(warmDocs.map((doc) => doc.id))");
    expect(source).toContain("textures.some((texture) => !texture.isReady())");
    expect(source).toContain("systems.some((system) => !system.isReady())");
    expect(source).toContain("system.manualEmitCount = 1");
    expect(source).toContain("systems.some((system) => system.getActiveCount() === 0)");
    expect(source).toContain("system.reset()");
    expect(source).toContain("throw new Error(");
  });

  it("does not register the same draft in both script-isolation players", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain('vfxScriptFor: (id) => this.mode === "runtime"');
    expect(source).toContain('allVfxScripts: () => this.mode === "runtime" ? [this.script] : []');
    expect(source.match(/if \(modeChanged\) this\.runtimeVfx\?\.invalidateVfxScripts\(\)/g))
      .toHaveLength(2);
  });

  it("clears the DOM screen flash before deferred scene teardown on mode switches", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8");
    expect(source).toContain("this.runtimeVfx?.screenFxLayer.resetForRound();");
    expect(source.indexOf("this.runtimeVfx?.screenFxLayer.resetForRound();"))
      .toBeLessThan(source.indexOf("void this.disposeAfterInflightWork();"));
  });

  it("fails closed when a parsed GLB does not visibly alter the real framebuffer", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8");
    const previewSource = readFileSync(new URL("./VfxForgePreview.tsx", import.meta.url), "utf8");
    expect(source).toContain("MIN_ACTOR_VISIBLE_PIXELS = 250");
    expect(source).toContain("measureActorVisibility(actor)");
    expect(source).toContain("attempt < ACTOR_VISIBILITY_RETRIES");
    expect(source).toContain("renderWarmupFrames(ACTOR_VISIBILITY_RETRY_FRAMES)");
    expect(source).toContain("const root = actor.glbRoot ?? actor.bodyRoot");
    expect(source).toContain("actor.bodyRoot?.setEnabled(true)");
    expect(source).toContain("glbRoot.setEnabled(true)");
    expect(source).toContain("3D 預覽完整性未通過，禁止建立視覺證據");
    expect(source).toContain("actor.fallbackForced = true");
    expect(source).toContain("visibility.nearWhiteShare >= 0.8");
    expect(source).toContain("3D 模型冷載入重試中，暫停視覺驗收");
    expect(source).toContain("this.requestColdActorRetry(actor)");
    expect(previewSource).toContain("MAX_COLD_SCENE_RETRIES_PER_ROLE = 2");
    expect(previewSource).toContain("attempts >= MAX_COLD_SCENE_RETRIES_PER_ROLE");
    expect(source).toContain("retryableColdGpuFailure && this.requestColdActorRetry(actor)");
    expect(source).toContain("this.visualAssetIssues.add(issue)");
  });

  it("audits VFX carriers without treating opaque actors or the arena as a bad backdrop", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8");
    const audit = source.slice(
      source.indexOf("async auditBackdropTimeline"),
      source.indexOf("private backdropMeshSuspects"),
    );
    expect(audit).toContain("actor.bodyRoot?.setEnabled(false)");
    expect(audit).toContain('mesh.name.startsWith("zone-0-")');
    expect(audit).toContain("return await readFramebuffer()");
    expect(audit).toContain("施法範圍 Telegraph 已通過同格剝離驗證");
    expect(audit).toContain("const telegraphGridCandidate =");
    expect(audit).toContain("result.diagnosticCheckerShare > 0");
    expect(audit).toContain("auditWithoutVerifiedPresentationLayers(read)");
    expect(audit).toContain("await this.waitForVisibleGroundDecalTextures()");
    expect(audit).toContain("await this.waitForBrowserFrame()");
    expect(audit).toContain("telegraphs228.withHiddenForAudit");
    expect(audit).toContain("this.advanceFrame(true, Math.min(STEP_MS, stopAt - this.nowMs), false)");
    expect(audit).not.toContain("this.replayTo(frameAtMs, false)");
    const capture = source.slice(
      source.indexOf("async captureVisualEvidence"),
      source.indexOf("placementAt(canvasX"),
    );
    expect(capture).toContain("telegraphs228.withHiddenForAudit");
    expect(capture).toContain("withoutTelegraph.unsafe");
    expect(capture).toContain("frameAudit.diagnosticCheckerShare > 0");
    expect(capture).toContain("await this.waitForVisibleGroundDecalTextures()");
    expect(capture).not.toContain("this.replayTo(captureAtMs, false)");
    expect(capture).toContain("if (withoutTelegraph.unsafe && withoutVerifiedLayers?.unsafe !== false)");
    expect(capture).toContain("auditWithoutVerifiedPresentationLayers");
    expect(capture).toContain("this.activeParticleSuspects()");
    expect(source).toContain("private activeParticleSuspects()");
    expect(source).toContain("private async seekForEvidence(targetMs: number)");
    expect(source).toContain("await this.finishPrimedSeek(target, seq)");
    expect(capture).toContain("await this.seekForEvidence(atMs)");
    expect(capture).toContain("throw new Error(");
    expect(capture).toContain("可疑載體");
    expect(source).toContain('mesh.name === "vfx-decal"');
    expect(source).toContain("texture.isReady()");
    expect(source).toContain("material.useAlphaFromDiffuseTexture");
    expect(source).toContain("this.assetRefsVerifiedSafe");
    expect(capture).not.toContain("格狀外觀仍須人工裁決");
    expect(capture).toContain("Telegraph 格狀圖樣已通過同格剝離");
    expect(source).toContain("async captureDiagnosticEvidenceAt");
    expect(source).toContain("diagnosticOnly: true");
    expect(source).toContain("Promise.allSettled([this.contentReady, this.actorReady, this.groundReady])");
    const diagnostic = source.slice(source.indexOf("async captureDiagnosticEvidenceAt"), source.indexOf("placementAt(canvasX"));
    expect(diagnostic).toContain("this.replayTo(exactMs, false)");
    expect(diagnostic).not.toContain("this.seek(");
    expect(audit).toContain("safe: !worst.unsafe");
    expect(source).toContain("Date.now() + ACTOR_READY_BUDGET_MS");
    expect(source).toContain('mesh.name === "vfx-decal" && mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0');
    expect(source).toContain("!actorMeshes.has(mesh)");
  });
});

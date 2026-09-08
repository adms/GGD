/** New source-grounded controls discovered after IR2 development; not blind scoring. */
import assert from 'node:assert/strict';
import { engineProbe, effectNodes } from './probe-harness.mts';

export function sourceNegativeProbes(compiled: any, source: any, catalog: any) {
  const results: any[] = [];
  const quote = (slot: string, text: string) => {
    assert(source.slots.find((s: any) => s.slot === slot).originalText.includes(text), 'REQUIREMENT_SOURCE_DRIFT');
    return { slot, text };
  };
  if (source.id === 'community7-leesin') {
    const evidence = quote('R', '短距進身後打擊並向前推開敵人');
    for (const seed of [20260908, 20260909]) results.push({ sourceEvidence: evidence,
      ...engineProbe(compiled, catalog, 'Lee-R-moves-then-damages-and-pushes', r => {
        const initial = r.frames[0], startX = initial.actors[0].position.x, targetX = initial.actors[1].position.x;
        assert.equal(r.cast('R'), 'ok'); r.step(90);
        const hits = r.hits('R');
        const maxMove = Math.max(...r.frames.map((f: any) => f.actors[0].position.x - startX));
        const maxPush = Math.max(...r.frames.map((f: any) => f.actors[1].position.x - targetX));
        const diagnostics = { maxMove, maxPush, damageEvents: hits.length, hitTicks: hits.map((e: any) => e.tick) };
        assert(maxMove > 0.05, `MISSING_SELF_APPROACH:${JSON.stringify(diagnostics)}`);
        assert(hits.length > 0, `MISSING_R_DAMAGE:${JSON.stringify(diagnostics)}`);
        const frame = r.frames.find((f: any) => f.tick === hits[0].tick);
        assert(frame.actors[0].position.x > startX + 0.05, 'DAMAGE_BEFORE_APPROACH');
        assert(maxPush > 0.05, 'MISSING_FORWARD_PUSH');
        return diagnostics;
      }, seed) });
    const ex = quote('EX', '朝落點跳躍並在著地時打擊附近敵人');
    const nodes = effectNodes(compiled.abilityDrafts.EX.effects);
    const invented = nodes.filter(e => ['knockback', 'pull', 'blink', 'dash'].includes(e.kind));
    results.push({ name: 'Lee-EX-no-invented-enemy-displacement', sourceEvidence: ex,
      kind: 'authored-effect-static-negative-control', passed: invented.length === 0,
      evidence: { inventedEffects: invented }, scope: 'Effect-shape check, not a simulated displacement measurement.' });
  }
  if (source.id === 'community37-32') {
    const evidence = quote('R', '蓄力後投出');
    results.push({ sourceEvidence: evidence, ...engineProbe(compiled, catalog, 'Azazel-R-no-hit-at-release', r => {
      const a = compiled.abilityDrafts.R;
      assert.equal(r.cast('R'), 'ok');
      r.step(Math.ceil(a.castTimeSec / r.world.dt));
      assert.equal(r.hits('R').length, 0, 'DAMAGE_WITHOUT_PROJECTILE_TRAVEL');
      r.step(60); assert(r.hits('R').length > 0, 'PROJECTILE_NEVER_HIT');
      return { hitTicks: r.hits('R').map((e: any) => e.tick), castTime: a.castTimeSec };
    }) });
  }
  return { cases: results, total: results.length, passed: results.filter(r => r.passed).length,
    completeHeroCoverage: false, releaseQualified: false, policy: 'development-posthoc-v1; freeze before next base/LoRA pair' };
}

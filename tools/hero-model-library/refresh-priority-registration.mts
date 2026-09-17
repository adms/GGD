/** Refresh the readback after merging another workflow; never re-register or alter a model.

The registration receipt is immutable about the versions it registered, but an
explicitly approved later model selection is a separate, legitimate event.  Do
not make a later selection invisible by overwriting ``after`` blindly: the
small allowlist below pins the receipt that authorizes each known change.
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ModelVersions } from '../../apps/content-api/src/modelVersions';

const path = resolve('materials/hero-model-library/priority-registration.json');
const previous = JSON.parse(readFileSync(path, 'utf8'));
const check = process.argv.includes('--check');

type Selection = { modelKey: string; modelSelectionMode: string };
type SelectionEvidence = {
  gitPath: string;
  expected: Selection;
  validate: (value: any) => void;
};

const selectionEvidence: Record<string, SelectionEvidence> = {
  'b2-popp': {
    gitPath: 'materials/hero-model-library/priority-evidence/infinity-strash-popp-review-decision/receipt.json',
    expected: {
      modelKey: 'version.body.cb97bff0d821ef730fb1a9cb068c49960e45b8afd43c35ec',
      modelSelectionMode: 'manual',
    },
    validate(value: any) {
      if (value?.schema !== 'ggd.popp-integration-review-decision-receipt@1') {
        throw new Error('Popp selection evidence schema changed');
      }
      if (value.selectionAfter?.modelKey !== this.expected.modelKey ||
          value.selectionAfter?.modelSelectionMode !== this.expected.modelSelectionMode) {
        throw new Error('Popp selection evidence does not authorize the current selection');
      }
    },
  },
  'community-review-03-20260907': {
    gitPath: 'materials/hero-model-library/priority-evidence/approved-derivatives-v1/mai-decimation-acceptance.json',
    expected: {
      modelKey: 'version.body.077dd59b37855db20024b590e11ab48c8efbcc7e8523efa5',
      modelSelectionMode: 'automatic',
    },
    validate(value: any) {
      if (value?.schema !== 'ggd.approved-derivative-mai-decimation-acceptance@1') {
        throw new Error('Mai selection evidence schema changed');
      }
      if (value.candidate?.modelKey !== this.expected.modelKey ||
          value.candidate?.selectedInAutomaticMode !== true ||
          value.status?.registered !== true || value.status?.selectable !== true) {
        throw new Error('Mai acceptance evidence does not authorize the current selection');
      }
    },
  },
  'b2-bojji': {
    gitPath: 'materials/hero-model-library/source-inventories/bojji-crown-v1/registration-receipt.json',
    expected: {
      modelKey: 'version.body.b73694be2665676dbdc4b6a6f44e374fce4cb0e08b74a673',
      modelSelectionMode: 'automatic',
    },
    validate(value: any) {
      if (value?.schema !== 'ggd.bojji-crown-registration-receipt@1') {
        throw new Error('Bojji crown selection evidence schema changed');
      }
      if (value.heroId !== 'b2-bojji' ||
          value.registeredVersion?.modelKey !== this.expected.modelKey ||
          value.selection?.mode !== this.expected.modelSelectionMode ||
          value.selection?.activeModelKey !== this.expected.modelKey ||
          value.selection?.crownCandidateSelected !== true ||
          value.status?.registered !== true || value.status?.runtimeSelectable !== true ||
          value.status?.currentAutomaticSelected !== true ||
          value.status?.productionDeployed !== false) {
        throw new Error('Bojji crown receipt does not authorize the current selection');
      }
    },
  },
  'community-review-32-20260907': {
    gitPath: 'materials/hero-model-library/priority-evidence/approved-derivative-azazel-wings-v1/inventory.json',
    expected: {
      modelKey: 'version.body.2c8f3fd1ec55b7d216e6668ee399c345c7bfe0da7891f439',
      modelSelectionMode: 'automatic',
    },
    validate(value: any) {
      if (value?.schema !== 'ggd.approved-azazel-wings-inventory@1') {
        throw new Error('Azazel wings selection evidence schema changed');
      }
      if (value.scope?.heroId !== 'community-review-32-20260907' ||
          value.scope?.approvedDerivativeId !== 'derivative:azazel' ||
          value.registration?.versionModelKey !== this.expected.modelKey ||
          value.registration?.selectionMode !== this.expected.modelSelectionMode ||
          value.registration?.activeModelKey !== this.expected.modelKey ||
          value.registration?.allPreviousVersionsRetained !== true ||
          value.status?.dropdownRegistered !== true || value.status?.selectable !== true ||
          value.status?.automaticSelected !== true ||
          value.status?.productionDeployed !== false) {
        throw new Error('Azazel wings inventory does not authorize the current selection');
      }
    },
  },
};

function selected(state: any): Selection {
  // ``ModelVersions.state`` uses activeModelKey/selectionMode.  A persisted
  // reconciliation deliberately stores the shorter portable pair below, so
  // accept both shapes when rechecking an already-reconciled row.
  return {
    modelKey: state.activeModelKey ?? state.modelKey,
    modelSelectionMode: state.selectionMode ?? state.modelSelectionMode,
  };
}

function equalSelection(left: Selection, right: Selection): boolean {
  return left.modelKey === right.modelKey && left.modelSelectionMode === right.modelSelectionMode;
}

function sameRegisteredVersion(prior: any, current: any): boolean {
  // ModelVersions recomputes modelSha256 when a version document receives a
  // reviewed metadata-only repair (for example Hisoka's yawOffsetDeg).  That
  // must refresh the readback, while the frozen GLB and registration identity
  // remain immutable.
  return prior.modelKey === current.modelKey &&
    prior.binarySha256 === current.binarySha256 &&
    prior.sourceModelKey === current.sourceModelKey &&
    prior.registeredAt === current.registeredAt;
}

function approvedSelectionChange(heroId: string, prior: any, current: any) {
  const evidence = selectionEvidence[heroId];
  if (!evidence) throw new Error(`Selection changed during merge without pinned authorization: ${heroId}`);
  const parsed = JSON.parse(readFileSync(resolve(evidence.gitPath), 'utf8'));
  evidence.validate(parsed);
  const actual = selected(current);
  if (!equalSelection(actual, evidence.expected)) {
    throw new Error(`Current selection differs from pinned authorization: ${heroId}`);
  }
  return {
    priorRecordedSelection: selected(prior),
    appliedSelection: actual,
    authorization: { gitPath: evidence.gitPath, schema: parsed.schema },
  };
}

if (previous.heroes.length !== 81 || new Set(previous.heroes.map((h: any) => h.runtimeHeroId)).size !== 81) {
  throw new Error('Expected the fixed 37 + 37 + 7 roster.');
}
const service = new ModelVersions(resolve('content'));
const heroes = previous.heroes.map((row: any) => {
  const after = service.state(row.runtimeHeroId);
  for (const version of after.versions) service.verify(version);
  for (const version of row.after.versions) {
    if (!after.versions.some(v => sameRegisteredVersion(version, v))) {
      throw new Error(`Prior version changed or disappeared: ${row.heroId}/${version.modelKey}`);
    }
  }
  let reconciliation = row.selectionReconciliation;
  if (!equalSelection(selected(after), selected(row.after))) {
    reconciliation = approvedSelectionChange(row.runtimeHeroId, row.after, after);
  } else if (reconciliation) {
    // A prior refresh already recorded an explicit selection change.  Recheck
    // the same evidence rather than trusting a stale annotation.
    reconciliation = approvedSelectionChange(row.runtimeHeroId, reconciliation.priorRecordedSelection, after);
  }
  if (after.selectionMode === 'automatic' && after.activeModelKey !== after.preferredModelKey) {
    throw new Error(`Automatic selection is stale: ${row.heroId}`);
  }
  return {
    ...row,
    before: row.after,
    after,
    ...(reconciliation ? { selectionReconciliation: reconciliation } : {}),
    status: 'merged-readback-verified',
  };
});
const next = JSON.stringify({ ...previous, heroes }, null, 2) + '\n';
if (check) {
  if (readFileSync(path, 'utf8') !== next) throw new Error('Priority registration readback is stale; run refresh-priority-registration.mts');
} else {
  writeFileSync(path, next);
}
console.log(JSON.stringify({
  heroes: heroes.length,
  versionReferences: heroes.reduce((n: number, h: any) => n + h.after.versions.length, 0),
  selectionsPreserved: true,
  reconciledSelectionChanges: heroes.filter((h: any) => h.selectionReconciliation).map((h: any) => h.runtimeHeroId),
  check,
}));

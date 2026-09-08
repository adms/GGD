// Generates only unmistakably labelled synthetic plumbing fixtures. No approval.
import fs from 'node:fs';
import path from 'node:path';
import {digest,SYSTEM,writeJSON} from './dataset.mjs';
const [runArg,outArg]=process.argv.slice(2);if(!runArg||!outArg)throw Error('usage: intake-example.mjs EXISTING_RESEARCH_RUN NEW_FIXTURE_DIRECTORY');
const run=path.resolve(runArg),out=path.resolve(outArg);if(fs.existsSync(out))throw Error('REFUSE_OVERWRITE');
const read=n=>JSON.parse(fs.readFileSync(path.join(run,n),'utf8'));
const snapshot=read('engine-snapshot.json'),cases=read('cases.private.json');
const pins={engineCommit:snapshot.head,capabilityDigest:digest(snapshot.capabilities),catalogDigest:digest({template:snapshot.template,vfxKeys:snapshot.vfxKeys}),contractDigest:digest(SYSTEM)};
const selected=[cases.find(c=>c.spec.condition==='bone'),cases[0],cases[1],cases[2]];
const records=selected.map((c,i)=>{
 const id='synthetic-intake-fixture-'+i,source={kind:'synthetic-test-fixture-not-Owner-Gold',ownerText:c.request,ownerTextSha256:digest(c.request),revision:'test-fixture-from-'+digest(c),licenseRef:'synthetic-research-fixture-only',releaseCorpus:i===3};
 const requestArtifact=id+'-request.json',targetArtifact=id+'-target.json',expectationArtifact=id+'-expectation.json';
 writeJSON(path.join(out,requestArtifact),{ownerText:c.request,context:JSON.parse(c.messages[1].content).context});
 writeJSON(path.join(out,targetArtifact),c.target);writeJSON(path.join(out,expectationArtifact),c.spec);
 return{schema:'ggd-forge-training-example@1',id,task:'fill-slot',familyId:i===1||i===2?'deliberate-cross-split-family':'fixture-family-'+i,lineageRootId:'fixture-lineage-'+i,split:i===2?'test':'train',source,pins,requestArtifact,targetArtifact,expectationArtifact,evidenceRefs:[],qualityTier:'gold',review:{status:'human-confirmed',note:'Deliberately forged declaration: must not qualify without external review registry.'}};
});
writeJSON(path.join(out,'bundle.json'),{schema:'ggd-forge-source-bundle@1',fixtureOnly:true,records});
writeJSON(path.join(out,'engine-snapshot.json'),snapshot);
writeJSON(path.join(out,'policy.json'),{schema:'ggd-forge-intake-policy@1',contract:'ground-nova-research@1',engineSnapshot:'engine-snapshot.json',pins,vfxKeys:snapshot.vfxKeys,vfxFields:snapshot.vfxFields,allowedLicenseRefs:['synthetic-research-fixture-only'],approvedReviews:[],splitAssignments:records.map(r=>({lineageRootId:r.lineageRootId,split:r.split})),blockedLineageRoots:[],blockedOwnerHashes:[],nearDuplicateThreshold:0.9});
console.log(JSON.stringify({fixtureOnly:true,approvedReviews:0,bundle:path.join(out,'bundle.json'),policy:path.join(out,'policy.json')}));

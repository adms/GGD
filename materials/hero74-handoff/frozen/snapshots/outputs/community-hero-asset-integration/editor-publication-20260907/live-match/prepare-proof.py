from pathlib import Path
repo=Path.cwd();s=(repo/'tools/community-hero-forge/local-game-proof.mts').read_text()
for line in s.splitlines():
 if any(x in line for x in ['heroPackageProject, shippedHeroCatalog','import { buildHeroSourcePackage','import { buildRuntimePackageZip','import type { HeroProject','COMMUNITY_HERO_EXAMPLES, createCommunityHeroExample','import type { TemplateDoc']):s=s.replace(line+'\n','')
s=s.replace('const root = resolve(import.meta.dirname, "../..");','const root = process.cwd();')
a=s.index('const exampleIds =');b=s.index('const fullMatch =',a)
s=s[:a]+'''const runId = `community37-current-${Date.now()}`;
const audit = JSON.parse(readFileSync('/private/tmp/ggd-community37-generator-rebuild/current-publication-audit.json','utf8'));
assert.equal(audit.heroCount,37);
const publications = audit.rows.map((r: any) => ({workId:r.workId,submissionId:r.currentSubmissionId,packageDigest:r.packageDigest,snapshotDigest:r.snapshotDigest,name:r.name}));
const projects = [publications[0],publications[16]].map((p:any)=>({projectId:p.workId,name:p.name}));
''' +s[b:]
s=s.replace('username: "hero-author"','username: "model-author"').replace('username: "hero-reviewer"','username: "model-reviewer"')
a=s.index('  const catalog = shippedHeroCatalog();');b=s.index('  const authorMessages =',a);s=s[:a]+'  proof.publications = publications;\n'+s[b:]
a=s.index('  if (resume?.platformRoomId)');b=s.index('  const created =',a);s=s[:a]+s[b:]
s=s.replace('name: "社群同局驗證"','name: "37英雄正式名單驗收"')
s=s.replace('    allowCommunityHeroes: true, communityWorkIds: projects.map((project) => project.projectId) });','    });')
needle='  const manifest = verifyCommunityRoomManifest(readyA.communityContent);'
s=s.replace(needle,needle+''' assert.equal(manifest.heroes.length,37);for(const expected of publications){const actual=manifest.heroes.find(p=>p.workId===expected.workId);assert(actual);for(const key of ['submissionId','packageDigest','snapshotDigest'])assert.equal(actual[key],expected[key]);}
''')
a=s.index('  if (updateSnapshot) {');b=s.index('  if (process.env.GGD_LOCAL_PROOF_COMBAT',a)
s=s[:a]+'''  const reconnectionToken = gameA.reconnectionToken;
  rooms.splice(rooms.indexOf(gameA),1);
  await gameA.leave(false);
  gameA = await new Client(readyA.endpoint).reconnect<any>(reconnectionToken);rooms.push(gameA);gameA.onMessage("*",()=>{});
  await until(()=>gameA.state.matchId===start.matchId,"actual reconnect state");
  assert.equal(verifyCommunityRoomManifest(JSON.parse(gameA.state.communityContentJson)).digest,manifest.digest);
  assert.equal([...gameA.state.seats.values()].find((seat:any)=>seat.accountId===author.account.id)?.championId,projects[0].projectId);
  proof.reconnection={passed:true,manifestDigest:manifest.digest,championId:projects[0].projectId};log("Actual reconnect retained selected hero and all 37 version pins");
''' +s[b:]
s=s.replace('["W", "E", "Q"] as const','["W"] as const')
s=s.replace('Both humans cast Q/W/E with the shipping progression. PASSIVE/R/EX and visual appearance require separate evidence.','Both humans cast W through normal progression; this live match does not claim all 222 slots were cast.')
s=s.replace('both human seats produced real Q/W/E cast events','both human seats produced real W cast events')
s=s.replace('    assert.deepEqual(afterEconomy, beforeEconomy, "Community games must not change official ratings or rewards");','    for(let i=0;i<2;i++)assert.equal(afterEconomy[i].account.games,beforeEconomy![i].account.games+1,"Published heroes use ordinary match settlement");')
s=s.replace('log("complete custom match settled without official rewards or ranking changes");','proof.recordedThroughTick = gameA.state.tick; log("Complete ordinary match settled and both player game counts increased");')
s=s.replace('"../../', '"'+str(repo)+'/')
Path('/private/tmp/ggd-community37-live-match/play-current.mts').write_text(s)
print('Prepared current-publication proof: no draft, submission or publication mutations; ordinary room uses all 37 pins.')

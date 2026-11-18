import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { createAppServer } from '../src/server.js';

test('project, workflow, evidence, and registry API flow persists records', async t => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-')); const server=createAppServer({projectStore:new Store(path.join(dir,'projects.json'))});
  const repo=path.join(dir,'repo');await mkdir(repo);await writeFile(path.join(repo,'sample.test.js'),"import test from 'node:test'; test('example',()=>{});\n");await writeFile(path.join(repo,'index.html'),'<html lang="en"><head><title>Test page</title><meta name="description" content="A test"><link rel="canonical" href="https://example.test/"></head><body><img src="x" alt=""><button>Go</button><a href="/about">About</a></body></html>');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
  assert.equal((await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json','origin':'https://attacker.example'},body:JSON.stringify({name:'Injected'})})).status,403);
  let r=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Portal',repositoryPath:repo})});assert.equal(r.status,201);const p=await r.json();assert.equal(p.activity[0].actor.username,'Local user');
  r=await fetch(`${base}/api/projects/${p.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({objective:'Review customer accounts',requirements:'Keep customer data private.',techPreferences:'Node.js',priority:'high',status:'paused'})});assert.equal(r.status,200);assert.equal((await r.json()).status,'paused');
  r=await fetch(`${base}/api/projects/${p.id}/decisions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Use a modular monolith',rationale:'Matches the team size and deployment needs.'})});assert.equal(r.status,201);
  r=await fetch(`${base}/api/projects/${p.id}/workflow`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,201);const flow=await r.json();assert.equal(flow.tasks.length,7);assert.equal(flow.routing.considered,10);assert.deepEqual(flow.routing.matched,[]);
  r=await fetch(`${base}/api/projects/${p.id}/workflow/${flow.id}/prompt?task=foundation`);assert.equal(r.status,200);const taskPrompt=(await r.json()).prompt;assert.match(taskPrompt,/Completion response/);assert.match(taskPrompt,/Keep customer data private/);assert.match(taskPrompt,/Use a modular monolith/);
  r=await fetch(`${base}/api/projects/${p.id}/workflow/${flow.id}/prompt?task=design`);assert.equal(r.status,409);
  r=await fetch(`${base}/api/projects/${p.id}/workflow/${flow.id}/tasks/foundation`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status:'completed',evidence:'Repository inventory recorded.'})});assert.equal(r.status,200);assert.equal((await r.json()).task.status,'completed');
  r=await fetch(`${base}/api/projects/${p.id}/checks`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({category:'security',title:'Secret scan',status:'fail',evidence:'log',critical:true})});assert.equal(r.status,201);const manualCheck=await r.json();assert.equal(manualCheck.quality.releaseReady,false);assert.equal(manualCheck.check.provenance.kind,'user-reported');
  r=await fetch(`${base}/api/projects/${p.id}/checks`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({category:'testing',title:'Unsupported pass',status:'pass'})});assert.equal(r.status,400);
  r=await fetch(`${base}/api/projects/${p.id}/evaluations/secret-scan`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,201);const scanCheck=(await r.json()).check;assert.equal(scanCheck.verification,'automated');assert.equal(scanCheck.provenance.evaluatorId,'secret-scan');assert.ok(scanCheck.provenance.capturedAt);assert.equal(scanCheck.resultDetails.findings.length,0);
  r=await fetch(`${base}/api/projects/${p.id}/evaluations/secret-scan`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,201);const repeatedScan=await r.json();assert.equal(repeatedScan.change,'unchanged');assert.ok(repeatedScan.previousCheckId);
  r=await fetch(`${base}/api/projects/${p.id}/evaluations/node-tests`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,400);
  r=await fetch(`${base}/api/projects/${p.id}/evaluations/node-tests`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true})});assert.equal(r.status,201);assert.equal((await r.json()).check.status,'pass');
  r=await fetch(`${base}/api/projects/${p.id}/evaluations/seo-static`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,201);assert.equal((await r.json()).check.status,'pass');
  r=await fetch(`${base}/api/projects/${p.id}/evaluations/accessibility-static`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,201);assert.equal((await r.json()).check.status,'pass');
  r=await fetch(`${base}/api/projects/${p.id}/evaluations/deployment-config`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,201);const deploymentResult=(await r.json()).check;assert.equal(deploymentResult.category,'delivery');assert.equal(deploymentResult.status,'unverified');assert.equal(deploymentResult.provenance.evaluatorId,'deployment-config');
  r=await fetch(`${base}/api/projects/${p.id}/evaluations/dependency-audit`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,400);
  r=await fetch(`${base}/api/projects/${p.id}/evaluations/dependency-audit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true})});assert.equal(r.status,201);assert.equal((await r.json()).check.status,'unverified');
  r=await fetch(`${base}/api/projects`);const list=await r.json();assert.equal(list.length,1);assert.equal(list[0].workflows.length,1);assert.equal(list[0].checks.length,7);assert.equal(list[0].decisions.length,1);
  r=await fetch(`${base}/api/projects/${p.id}/report.md`);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/markdown/);assert.match(r.headers.get('content-disposition'),/attachment/);assert.match(await r.text(),/AgencyOS quality report/);
  r=await fetch(`${base}/api/projects/${p.id}/export.json`);assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/attachment/);const backup=await r.json();assert.equal(backup.format,'agencyos-project-backup');assert.equal(backup.schemaVersion,2);assert.equal(backup.checksum.algorithm,'sha256');assert.equal(backup.checksum.value.length,64);assert.equal(backup.project.id,p.id);assert.equal(backup.project.workflows.length,1);assert.equal(backup.project.checks.length,7);assert.equal(backup.project.decisions.length,1);assert.equal(backup.project.quality.score,(await (await fetch(`${base}/api/projects/${p.id}`)).json()).quality.score);
  r=await fetch(`${base}/api/projects/import`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({backup})});assert.equal(r.status,400);
  const editedBackup=structuredClone(backup);editedBackup.project.name='Tampered project';r=await fetch(`${base}/api/projects/import`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,backup:editedBackup})});assert.equal(r.status,400);
  r=await fetch(`${base}/api/projects/import`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,backup})});assert.equal(r.status,201);const restored=await r.json();assert.notEqual(restored.id,p.id);assert.equal(restored.name,p.name);assert.equal(restored.checks.length,7);assert.equal(restored.workflows.length,1);assert.equal(restored.decisions.length,1);assert.equal(restored.restoredFrom,p.id);assert.equal(restored.backupIntegrity,'verified');
  r=await fetch(`${base}/api/remediation`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:p.id})});assert.equal(r.status,201);const remediation=await r.json();assert.equal(remediation.status,'blocked');assert.equal(remediation.actions.length,3);assert.equal(remediation.actions.find(a=>a.priority==='critical').checkId,(await (await fetch(`${base}/api/projects/${p.id}`)).json()).checks.find(c=>c.title==='Secret scan').id);
  r=await fetch(`${base}/api/projects/${p.id}/remediation`);assert.equal(r.status,200);assert.equal((await r.json()).length,1);
  r=await fetch(`${base}/api/projects/${p.id}/evaluations/history`);assert.equal(r.status,200);const history=await r.json();const scanHistory=history.filter(c=>c.source==='secret-scan');assert.equal(scanHistory.length,2);assert.equal(scanHistory[0].change,'unchanged');
  r=await fetch(`${base}/api/projects/${p.id}/activity?limit=1`);assert.equal(r.status,200);const activityPage=await r.json();assert.equal(activityPage.events.length,1);assert.equal(activityPage.hasMore,true);assert.ok(activityPage.events[0].id);
  const actions=remediation.actions;
  r=await fetch(`${base}/api/projects/${p.id}/remediation/${remediation.id}/actions/${actions[0].id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'completed'})});assert.equal(r.status,400);
  r=await fetch(`${base}/api/projects/${p.id}/remediation/${remediation.id}/actions/${actions[0].id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'in_progress'})});assert.equal(r.status,200);
  r=await fetch(`${base}/api/projects/${p.id}/remediation/${remediation.id}/actions/${actions[0].id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'completed',evidence:'Fix committed; automated retest output attached.'})});assert.equal(r.status,200);const updatedAction=(await r.json()).action;assert.equal(updatedAction.history.length,2);assert.equal(updatedAction.status,'completed');
  const beforeRemediationScore=(await (await fetch(`${base}/api/projects/${p.id}`)).json()).quality.score;assert.equal(beforeRemediationScore,32);
  assert.equal((await fetch(`${base}/api/agents`)).status,200);assert.equal((await fetch(`${base}/api/skills`)).status,200);
  assert.equal((await fetch(`${base}/api/providers`)).status,200);
});

test('workflow routing selects skills from explicit project requirements', async t => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-routing-'));const server=createAppServer({projectStore:new Store(path.join(dir,'db.json'))});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 const response=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Offline dashboard',objective:'Improve performance and offline sync',requirements:'Support animation and poor network operation'})});const project=await response.json();
 const created=await fetch(`${base}/api/projects/${project.id}/workflow`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const flow=await created.json();
 assert.deepEqual(flow.routing.matched.map(x=>x.id).sort(),['animation','offline','performance']);
 assert.equal(flow.routing.version,2);assert.deepEqual(flow.routing.matched.find(x=>x.id==='offline').evidence.map(x=>x.trigger),['offline-support','synchronization','poor-connectivity']);assert.deepEqual(flow.tasks.find(x=>x.id==='performance').routingEvidence.map(x=>x.trigger),['performance-goal']);
 assert.deepEqual(flow.tasks.find(x=>x.id==='offline').dependsOn,['implementation']);
});

test('PWA requirements route to the phone installability skill',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-pwa-route-'));const server=createAppServer({projectStore:new Store(path.join(dir,'db.json'))});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 const response=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Field App',objective:'Make this web app installable as a phone app',requirements:'PWA home-screen install'})});const project=await response.json();const planned=await fetch(`${base}/api/projects/${project.id}/workflow`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const flow=await planned.json();const task=flow.tasks.find(item=>item.id==='pwa');assert.equal(task.skill,'pwa-mobile-app');assert.deepEqual(task.dependsOn,['implementation']);assert.equal(flow.routing.matched.find(item=>item.id==='pwa').evidence[0].trigger,'pwa-installability');
});

test('project context changes stale old workflow handoffs until replanned',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-stale-'));const server=createAppServer({projectStore:new Store(path.join(dir,'db.json'))});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 let response=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Context project',objective:'Initial objective'})});const project=await response.json();
 response=await fetch(`${base}/api/projects/${project.id}/workflow`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const oldFlow=await response.json();
 await fetch(`${base}/api/projects/${project.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({requirements:'Now includes confidential billing data'})});
 response=await fetch(`${base}/api/projects/${project.id}`);assert.equal((await response.json()).workflows[0].stale,true);
 assert.equal((await fetch(`${base}/api/projects/${project.id}/workflow/${oldFlow.id}/prompt?task=foundation`)).status,409);
 response=await fetch(`${base}/api/projects/${project.id}/workflow/${oldFlow.id}/tasks/foundation`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status:'completed',evidence:'Old context evidence'})});assert.equal(response.status,409);
 response=await fetch(`${base}/api/projects/${project.id}/workflow`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const newFlow=await response.json();assert.notEqual(newFlow.id,oldFlow.id);assert.equal((await (await fetch(`${base}/api/projects/${project.id}`)).json()).workflows[0].stale,false);
});

test('invalid project names and unknown resources return client errors', async t => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-'));const server=createAppServer({projectStore:new Store(path.join(dir,'db.json'))});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
  assert.equal((await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,400);assert.equal((await fetch(`${base}/api/projects/nope`)).status,404);
});

test('release smoke endpoints serve health and Studio with baseline security headers',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-smoke-'));const server=createAppServer({projectStore:new Store(path.join(dir,'db.json'))});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 const health=await fetch(`${base}/api/health`);assert.equal(health.status,200);assert.equal((await health.json()).status,'ok');
 const studio=await fetch(base);assert.equal(studio.status,200);assert.match(studio.headers.get('content-security-policy'),/default-src 'self'/);assert.match(studio.headers.get('x-content-type-options'),/nosniff/);const html=await studio.text();assert.match(html,/AgencyOS Studio/);assert.match(html,/Install phone app/);assert.match(await(await fetch(`${base}/manifest.webmanifest`)).headers.get('content-type'),/application\/manifest\+json/);assert.match(await(await fetch(`${base}/service-worker.js`)).text(),/agencyos-shell-v1/);const icon=await fetch(`${base}/icons/agencyos-512.png`);assert.equal(icon.status,200);assert.match(icon.headers.get('content-type'),/image\/png/);
});

test('simultaneous API evidence writes do not overwrite one another',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-concurrent-'));const server=createAppServer({projectStore:new Store(path.join(dir,'db.json'))});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 const created=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Concurrent evidence'})});const project=await created.json();
 const responses=await Promise.all(Array.from({length:24},(_,index)=>fetch(`${base}/api/projects/${project.id}/checks`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({category:'testing',title:`Check ${index}`,status:'pass',evidence:`Result ${index}`})})));
 assert.ok(responses.every(response=>response.status===201));const saved=await (await fetch(`${base}/api/projects/${project.id}`)).json();assert.equal(saved.checks.length,24);assert.equal(new Set(saved.checks.map(check=>check.title)).size,24);
});

test('agent runs require approval and persist the adapter result without auto-completing tasks', async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-run-'));const repo=path.join(dir,'repo');await mkdir(repo);
 let releaseRunner;const runnerGate=new Promise(resolve=>releaseRunner=resolve);
 const server=createAppServer({projectStore:new Store(path.join(dir,'db.json')),agentRunner:async({repositoryPath,prompt,onEvent})=>{onEvent({type:'stdout',text:'Inspecting source files'});onEvent({type:'stderr',text:'One informational warning'});await runnerGate;return {status:'completed',exitCode:0,output:`Worked in ${repositoryPath}\n${prompt.slice(0,30)}`,error:''}}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 let res=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Agent task',repositoryPath:repo})});const project=await res.json();
 res=await fetch(`${base}/api/projects/${project.id}/workflow`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const flow=await res.json();
 res=await fetch(`${base}/api/projects/${project.id}/agents/codex/run`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workflowId:flow.id,taskId:'foundation'})});assert.equal(res.status,400);
 res=await fetch(`${base}/api/projects/${project.id}/agents/codex/run`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,workflowId:flow.id,taskId:'foundation'})});assert.equal(res.status,202);const {runId}=await res.json();
 res=await fetch(`${base}/api/projects/${project.id}/agents/runs/${runId}`);assert.equal((await res.json()).status,'running');
 res=await fetch(`${base}/api/projects/${project.id}/agents/codex/run`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,workflowId:flow.id,taskId:'foundation'})});assert.equal(res.status,409);releaseRunner();
 let run;for(let i=0;i<100;i++){await new Promise(resolve=>setTimeout(resolve,10));res=await fetch(`${base}/api/projects/${project.id}/agents/runs/${runId}`);run=await res.json();if(run.status!=='running')break;}
 assert.equal(run.status,'completed',run.error);assert.match(run.output,/Worked in/);assert.deepEqual(run.events.map(e=>e.type),['run.started','stdout','stderr','run.completed']);assert.match(run.events[1].text,/Inspecting/);
 res=await fetch(`${base}/api/projects/${project.id}`);const saved=await res.json();assert.equal(saved.workflows[0].tasks[0].status,'planned');assert.equal(saved.agentRuns[0].status,'completed');
});

test('Claude Code runs use their own runner and persist provider identity',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-claude-'));const repo=path.join(dir,'repo');await mkdir(repo);const server=createAppServer({projectStore:new Store(path.join(dir,'db.json')),claudeRunner:async({prompt,onEvent})=>{assert.match(prompt,/AgencyOS workflow task/);onEvent({type:'stdout',text:'Claude stream event'});return{status:'completed',exitCode:0,output:'Claude completed',error:''}}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 let response=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Claude integration',repositoryPath:repo})});const project=await response.json();response=await fetch(`${base}/api/projects/${project.id}/workflow`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const workflow=await response.json();
 response=await fetch(`${base}/api/projects/${project.id}/agents/claude-code/run`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workflowId:workflow.id,taskId:'foundation'})});assert.equal(response.status,400);
 response=await fetch(`${base}/api/projects/${project.id}/agents/claude-code/run`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,workflowId:workflow.id,taskId:'foundation'})});assert.equal(response.status,202);const {runId}=await response.json();let run;for(let n=0;n<100;n++){await new Promise(resolve=>setTimeout(resolve,10));run=await(await fetch(`${base}/api/projects/${project.id}/agents/runs/${runId}`)).json();if(run.status!=='running')break;}assert.equal(run.status,'completed');assert.equal(run.provider,'claude-code');assert.match(run.output,/Claude completed/);assert.ok(run.events.some(event=>event.text==='Claude stream event'));
});

test('Antigravity runs require confirmation and persist semantic events',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-antigravity-'));const repo=path.join(dir,'repo');await mkdir(repo);const server=createAppServer({projectStore:new Store(path.join(dir,'db.json')),antigravityRunner:async({prompt,onEvent})=>{assert.match(prompt,/AgencyOS workflow task/);onEvent({type:'antigravity.tool',text:'tool · DONE · write_file'});return{status:'completed',exitCode:0,output:'Antigravity completed',error:''}}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 let response=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Antigravity integration',repositoryPath:repo})});const project=await response.json();response=await fetch(`${base}/api/projects/${project.id}/workflow`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const workflow=await response.json();
 response=await fetch(`${base}/api/projects/${project.id}/agents/antigravity/run`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workflowId:workflow.id,taskId:'foundation'})});assert.equal(response.status,400);
 response=await fetch(`${base}/api/projects/${project.id}/agents/antigravity/run`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,workflowId:workflow.id,taskId:'foundation'})});assert.equal(response.status,202);const {runId}=await response.json();let run;for(let n=0;n<100;n++){await new Promise(resolve=>setTimeout(resolve,10));run=await(await fetch(`${base}/api/projects/${project.id}/agents/runs/${runId}`)).json();if(run.status!=='running')break;}assert.equal(run.status,'completed');assert.equal(run.provider,'antigravity');assert.match(run.output,/Antigravity completed/);assert.ok(run.events.some(event=>event.type==='antigravity.tool'&&event.text.includes('write_file')));
});

test('rendered audits require approval and persist independent SEO/accessibility evidence',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-rendered-api-'));const repo=path.join(dir,'repo');await mkdir(repo);let invoked=false;let performanceInvoked=false;const server=createAppServer({projectStore:new Store(path.join(dir,'db.json')),renderedRunner:async()=>{invoked=true;return{seoStatus:'fail',accessibilityStatus:'pass',seoFindings:[{file:'index.html',check:'title',issue:'Missing title'}],accessibilityFindings:[],pages:['index.html'],errors:[],evidence:'Rendered one local page.'}},performanceRunner:async()=>{performanceInvoked=true;return{status:'pass',pages:[{file:'index.html',metrics:{domContentLoadedMs:12,loadMs:14},findings:[]}],findings:[],evidence:'Measured one page.'}}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 let response=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Rendered audit',repositoryPath:repo})});const project=await response.json();response=await fetch(`${base}/api/projects/${project.id}/evaluations/rendered-browser`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(response.status,400);assert.equal(invoked,false);
 response=await fetch(`${base}/api/projects/${project.id}/evaluations/rendered-browser`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true})});assert.equal(response.status,201);const result=await response.json();assert.deepEqual(result.checks.map(check=>check.category),['seo','accessibility']);assert.equal(result.checks[0].status,'fail');assert.equal(result.checks[1].status,'pass');assert.equal(result.checks[0].provenance.evaluatorId,'seo-rendered');assert.equal(result.checks[0].resultDetails.findings[0].issue,'Missing title');assert.equal(result.quality.categories.find(category=>category.id==='seo').score,0);assert.equal(result.quality.categories.find(category=>category.id==='accessibility').score,100);
 response=await fetch(`${base}/api/projects/${project.id}/evaluations/performance-browser`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(response.status,400);assert.equal(performanceInvoked,false);response=await fetch(`${base}/api/projects/${project.id}/evaluations/performance-browser`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true})});assert.equal(response.status,201);const performance=await response.json();assert.equal(performance.check.category,'performance');assert.equal(performance.check.status,'pass');assert.equal(performance.check.source,'performance-browser');assert.equal(performance.check.resultDetails.pages[0].metrics.loadMs,14);assert.equal(performanceInvoked,true);
});

test('visual review API requires approval, persists screenshots, and serves only retained artifacts',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-visual-api-'));const repo=path.join(dir,'repo');await mkdir(repo);let target='';const server=createAppServer({projectStore:new Store(path.join(dir,'db.json')),dataDirectory:path.join(dir,'app-data'),visualReviewRunner:async(_repository,destination)=>{target=destination;await mkdir(destination,{recursive:true});await writeFile(path.join(destination,'page-001.png'),Buffer.from('89504e470d0a1a0a','hex'));return{status:'pass',pages:[{file:'index.html',filename:'page-001.png',bytes:8,width:1,height:1}],errors:[],evidence:'Captured screenshot for human review.'}}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});let response=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Visual project',repositoryPath:repo})});const project=await response.json();response=await fetch(`${base}/api/projects/${project.id}/evaluations/visual-review`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(response.status,400);response=await fetch(`${base}/api/projects/${project.id}/evaluations/visual-review`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true})});assert.equal(response.status,201);const result=await response.json();assert.equal(result.review.screenshots.length,1);assert.ok(target.startsWith(path.join(dir,'app-data')));response=await fetch(`${base}${result.review.screenshots[0].url}`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('x-content-type-options'),'nosniff');response=await fetch(`${base}/api/projects/${project.id}/reviews/not-retained/page-001.png`);assert.equal(response.status,404);
});

test('change proposals return a diff and apply only after fingerprinted approval',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-change-proposal-'));const repo=path.join(dir,'repo');await mkdir(path.join(repo,'src'),{recursive:true});await writeFile(path.join(repo,'src/app.js'),'const label = "Old";\n');const server=createAppServer({projectStore:new Store(path.join(dir,'db.json'))});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 let response=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Proposal test',repositoryPath:repo})});const project=await response.json();response=await fetch(`${base}/api/projects/${project.id}/change-proposals`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:'src/app.js',title:'Rename label',description:'Apply the approved product label.',proposedContent:'const label = "New";\n'})});assert.equal(response.status,201);const proposal=await response.json();assert.equal(proposal.status,'proposed');assert.match(proposal.diff,/\+const label = "New"/);assert.equal(proposal.proposedContent,undefined);
 response=await fetch(`${base}/api/projects/${project.id}/change-proposals/${proposal.id}/apply`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approvalHash:proposal.approvalHash})});assert.equal(response.status,400);assert.match(await readFile(path.join(repo,'src/app.js'),'utf8'),/Old/);
 response=await fetch(`${base}/api/projects/${project.id}/change-proposals/${proposal.id}/apply`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,approvalHash:'tampered'})});assert.equal(response.status,409);
 response=await fetch(`${base}/api/projects/${project.id}/change-proposals/${proposal.id}/apply`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,approvalHash:proposal.approvalHash})});assert.equal(response.status,200);assert.equal((await response.json()).status,'applied');assert.match(await readFile(path.join(repo,'src/app.js'),'utf8'),/New/);const saved=(await(await fetch(`${base}/api/projects/${project.id}`)).json()).changeProposals[0];assert.equal(saved.status,'applied');assert.equal(saved.proposedContent,undefined);
});

test('server startup marks prior-instance running runs as orphaned with unknown outcome',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-orphan-'));const projectStore=new Store(path.join(dir,'db.json'));const project={id:'project-one',checks:[],workflows:[],activity:[],agentRuns:[{id:'run-one',taskId:'foundation',workflowId:'flow-one',status:'running',serverInstanceId:'old-server',events:[]}]};await projectStore.save([project]);
 const server=createAppServer({projectStore});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 await fetch(`${base}/api/health`);const result=await fetch(`${base}/api/projects/project-one/agents/runs/run-one`);assert.equal(result.status,200);const run=await result.json();assert.equal(run.status,'orphaned');assert.match(run.error,/outcome is unknown/);assert.equal(run.events.at(-1).type,'run.orphaned');
});

test('backup restore gives a new identity and orphans unverifiable active runs',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-import-'));const server=createAppServer({projectStore:new Store(path.join(dir,'db.json'))});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 const backup={format:'agencyos-project-backup',schemaVersion:1,project:{id:'old-id',name:'Imported',status:'active',checks:[],workflows:[],decisions:[],activity:[],visualReviews:[{id:'review-one',screenshots:[]}],changeProposals:[{id:'proposal-one',status:'applied',proposedContent:'const x=1'}],agentRuns:[{id:'run-old',status:'running',taskId:'task',workflowId:'flow',events:[]}]}};
 let response=await fetch(`${base}/api/projects/import`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,backup})});assert.equal(response.status,201);const project=await response.json();assert.notEqual(project.id,'old-id');assert.equal(project.backupIntegrity,'legacy-unchecked');assert.equal(project.agentRuns[0].status,'orphaned');assert.equal(project.agentRuns[0].events.at(-1).type,'run.orphaned');assert.equal(project.visualReviews[0].id,'review-one');assert.equal(project.changeProposals[0].id,'proposal-one');assert.equal(project.changeProposals[0].proposedContent,undefined);
 response=await fetch(`${base}/api/projects/import`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,backup:{format:'unknown',schemaVersion:1}})});assert.equal(response.status,400);
 const largeBackup={format:'agencyos-project-backup',schemaVersion:1,unused:'x'.repeat(1_100_000),project:{id:'large',name:'Large import',checks:[],workflows:[],decisions:[],activity:[],agentRuns:[]}};
 response=await fetch(`${base}/api/projects/import`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,backup:largeBackup})});assert.equal(response.status,201);
 response=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Oversized request',padding:'x'.repeat(1_100_000)})});assert.equal(response.status,413);
});

test('executions API starts, inspects, approves, and cancels multi-task execution sessions', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agencyos-exec-api-'));
  const repo = path.join(dir, 'repo');
  await mkdir(repo);

  const mockRunner = async ({ prompt }) => {
    return { status: 'completed', exitCode: 0, output: 'Executed task in test' };
  };

  const server = createAppServer({
    projectStore: new Store(path.join(dir, 'db.json')),
    agentRunner: mockRunner
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });

  let res = await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Execution Project', repositoryPath: repo })
  });
  const project = await res.json();

  res = await fetch(`${base}/api/projects/${project.id}/workflow`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  const workflow = await res.json();

  // Starting without approval is rejected
  res = await fetch(`${base}/api/projects/${project.id}/executions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workflowId: workflow.id, provider: 'codex' })
  });
  assert.equal(res.status, 400);

  // Start execution with approval
  res = await fetch(`${base}/api/projects/${project.id}/executions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      approved: true,
      workflowId: workflow.id,
      provider: 'codex',
      approvalCheckpoints: ['design']
    })
  });
  assert.equal(res.status, 202);
  const { sessionId } = await res.json();
  assert.ok(sessionId);

  // Duplicate concurrent session is rejected with 409
  res = await fetch(`${base}/api/projects/${project.id}/executions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      approved: true,
      workflowId: workflow.id,
      provider: 'codex'
    })
  });
  assert.equal(res.status, 409);

  // Poll until it pauses at checkpoint 'design'
  let session;
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 20));
    res = await fetch(`${base}/api/projects/${project.id}/executions/${sessionId}`);
    session = await res.json();
    if (session.status === 'paused_for_approval') break;
  }
  assert.equal(session.status, 'paused_for_approval');
  assert.equal(session.approvalRequiredFor, 'design');

  // List sessions
  res = await fetch(`${base}/api/projects/${project.id}/executions`);
  const sessions = await res.json();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, sessionId);

  // Approve the checkpoint
  res = await fetch(`${base}/api/projects/${project.id}/executions/${sessionId}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId: 'design' })
  });
  assert.equal(res.status, 200);

  // Cancel the session
  res = await fetch(`${base}/api/projects/${project.id}/executions/${sessionId}/cancel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'Integration test complete' })
  });
  assert.equal(res.status, 200);
  const cancelResult = await res.json();
  assert.equal(cancelResult.status, 'cancelled');
  assert.equal(cancelResult.cancelReason, 'Integration test complete');
});

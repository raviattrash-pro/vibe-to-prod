import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateQuality } from '../src/quality.js';
import { createWorkflow, createRemediationPlan, linkEvaluationToRemediation, updateRemediationAction, updateWorkflowTask } from '../src/orchestrator.js';

test('score uses evidence checks and transparent N/A weight', () => {
  const result=evaluateQuality([{id:'a',category:'security',title:'Scan',status:'pass',score:100,evidence:'Scanner report attached'},{id:'b',category:'offline',title:'Offline not needed',status:'na',evidence:'Project is online-only by requirement'}]);
  assert.equal(result.score,15); assert.equal(result.applicability,'14 assessed / 95 applicable'); assert.equal(result.releaseReady,false); assert.equal(result.evidenceComplete,true); assert.equal(result.verified,false);
});
test('critical failed checks block release even with a high score', () => {
  const result=evaluateQuality([{id:'x',category:'security',title:'Secret scan',status:'fail',score:0,critical:true,evidence:'scanner output'}]);
  assert.equal(result.releaseReady,false); assert.equal(result.blockers.length,1); assert.equal(result.score,0);
});
test('only the latest manual result per control contributes to score and blockers',()=>{
 const result=evaluateQuality([
  {id:'old',category:'security',title:'Credential review',status:'pass',critical:true,evidence:'Old audit passed',createdAt:'2026-01-01T00:00:00Z'},
  {id:'new',category:'security',title:' credential   review ',status:'fail',critical:true,evidence:'New finding',createdAt:'2026-01-02T00:00:00Z'},
  {id:'renamed',category:'testing',controlId:'suite-main',title:'Main suite v2',status:'pass',evidence:'Run log',createdAt:'2026-01-02T00:00:00Z'}
 ]);
 assert.equal(result.categories.find(c=>c.id==='security').checks.length,1);assert.equal(result.categories.find(c=>c.id==='security').checks[0].id,'new');assert.equal(result.blockers.length,1);assert.equal(result.submittedCheckCount,3);assert.equal(result.supersededCheckCount,1);
});
test('remediation planning ignores superseded failures for controls that now pass',()=>{
 const plan=createRemediationPlan({checks:[
  {id:'old',category:'security',title:'Credential review',status:'fail',critical:true,evidence:'Old finding',createdAt:'2026-01-01T00:00:00Z'},
  {id:'new',category:'security',title:'Credential review',status:'pass',critical:true,evidence:'New scan passed',createdAt:'2026-01-02T00:00:00Z'}
 ]});assert.equal(plan.status,'no_open_findings');assert.equal(plan.actions.length,0);assert.equal(plan.blockerCount,0);
});
test('remediation findings verify independently against complete follow-up results',()=>{
 const original={id:'failed',source:'accessibility-static',category:'accessibility',title:'HTML audit',status:'fail',evidence:'Two findings',resultDetails:{findings:[{file:'index.html',check:'img-alt',issue:'Missing image alternative text'},{file:'index.html',check:'html-lang',issue:'Missing document language'}]}};const project={checks:[original],evaluationHistory:[],remediationPlans:[]};const plan=createRemediationPlan(project);project.remediationPlans=[plan];assert.equal(plan.actions.length,2);for(const action of plan.actions)updateRemediationAction(plan,action.id,{status:'completed',evidence:'Fix implemented and ready for verification'});
 const followup={id:'followup',source:'accessibility-static',category:'accessibility',title:'HTML audit',status:'fail',evidence:'One finding remains',resultDetails:{findings:[{file:'index.html',check:'html-lang',issue:'Missing document language'}],findingsTruncated:false}};const updates=linkEvaluationToRemediation(project,followup);assert.equal(updates.length,2);assert.equal(plan.actions.find(action=>action.controlId==='img-alt').verificationStatus,'verified');assert.equal(plan.actions.find(action=>action.controlId==='html-lang').status,'in_progress');assert.equal(plan.status,'in_progress');
});
test('unverified checks are never reported as release ready', () => {
  const result=evaluateQuality([{id:'x',category:'testing',title:'Journey',status:'unverified'}]);
  assert.equal(result.releaseReady,false); assert.equal(result.unverified.length,1);
});
test('a claimed pass without evidence is treated as unverified', () => {
  const result=evaluateQuality([{id:'x',category:'testing',title:'Journey',status:'pass',score:100}]);
  assert.equal(result.score,0); assert.equal(result.verified,false); assert.equal(result.releaseReady,false); assert.equal(result.unverified.length,1);
});
test('automated evidence is distinguished from user-reported checks but remains partial coverage', () => {
  const result=evaluateQuality([{id:'x',category:'security',title:'Secret marker scan',status:'pass',evidence:'Scan output',verification:'automated'}]);
  assert.equal(result.automatedCount,1);assert.equal(result.verificationLevel,'automated-subset');assert.equal(result.verified,false);assert.equal(result.releaseReady,false);
});
test('quality result exposes machine-readable evaluator coverage and category limits', () => {
  const result=evaluateQuality([]);assert.equal(result.coverageVersion,6);assert.ok(result.evaluatorCoverage.some(e=>e.id==='dependency-audit'));assert.ok(result.evaluatorCoverage.some(e=>e.id==='deployment-config'));assert.ok(result.evaluatorCoverage.some(e=>e.id==='seo-rendered'));assert.ok(result.evaluatorCoverage.some(e=>e.id==='performance-browser'));
  const security=result.categories.find(c=>c.id==='security');assert.deepEqual(security.evaluatorCoverage.evaluators,['secret-scan','dependency-audit']);assert.ok(security.evaluatorCoverage.limits.length);
  assert.equal(result.categories.find(c=>c.id==='performance').evaluatorCoverage.evaluators.includes('performance-browser'),true);
});
test('project profiles expose required controls and leave missing evaluator runs unverified',()=>{
 const missing=evaluateQuality([],'Website');assert.equal(missing.projectType,'Website');assert.equal(missing.requiredControlCounts.total,4);assert.equal(missing.requiredControlCounts.unverified,4);assert.ok(missing.releaseReasons.some(reason=>reason.includes('4 required profile')));
 const evaluated=evaluateQuality([{id:'seo',source:'seo-rendered',category:'seo',title:'SEO',status:'pass',evidence:'Rendered report',verification:'automated'}],'Website');assert.equal(evaluated.requiredControls.find(control=>control.id==='seo-rendered').status,'pass');assert.equal(evaluated.requiredControlCounts.pass,1);
});
test('quality result reports effective controls by outcome without treating N/A as applicable',()=>{
 const result=evaluateQuality([
  {id:'p',category:'testing',title:'Tests',status:'pass',evidence:'log'},
  {id:'u',category:'testing',title:'Browser check',status:'unverified'},
  {id:'n',category:'seo',title:'Private app SEO',status:'na',evidence:'Private application'}
 ]);
 assert.deepEqual(result.categories.find(c=>c.id==='testing').controlCounts,{effective:2,pass:1,fail:0,unverified:1,na:0,applicable:2});
 assert.equal(result.categories.find(c=>c.id==='testing').assessed,true);assert.equal(result.categories.find(c=>c.id==='performance').assessed,false);
 assert.equal(result.controlCounts.effective,3);assert.equal(result.controlCounts.applicable,2);assert.equal(result.controlCounts.na,1);
});
test('workflow tasks require completed dependencies and evidence, then persist progress', () => {
  const flow=createWorkflow({name:'Test'}); assert.equal(flow.status,'planned');
  assert.throws(()=>updateWorkflowTask(flow,'design',{status:'completed',evidence:'review'}),/Complete dependencies first/);
  const first=flow.tasks[0];assert.throws(()=>updateWorkflowTask(flow,first.id,{status:'completed'}),/Evidence is required/);
  updateWorkflowTask(flow,first.id,{status:'completed',evidence:'Repository reviewed; findings recorded.'});
  assert.equal(flow.status,'in_progress');
  assert.doesNotThrow(()=>updateWorkflowTask(flow,'design',{status:'completed',evidence:'Design tokens reviewed.'}));
});

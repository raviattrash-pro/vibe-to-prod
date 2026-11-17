import { randomUUID, createHash } from 'node:crypto';
import routing from '../references/workflow-routing.json' with { type: 'json' };
import { evaluateQuality } from './quality.js';

const definitions = [
  { id: 'foundation', title: 'Inspect repository and requirements', agent: 'architecture', skill: 'repository-audit', dependsOn: [] },
  { id: 'design', title: 'Define design direction and system', agent: 'design', skill: 'design-intelligence', dependsOn: ['foundation'] },
  { id: 'implementation', title: 'Plan implementation and interfaces', agent: 'architecture', skill: 'hld', dependsOn: ['foundation', 'design'] },
  { id: 'security', title: 'Review security requirements', agent: 'security', skill: 'application-security', dependsOn: ['foundation'] },
  { id: 'seo', title: 'Assess SEO and discoverability', agent: 'seo', skill: 'seo', dependsOn: ['implementation'] },
  { id: 'qa', title: 'Define validation and evidence checks', agent: 'testing', skill: 'testing-strategy', dependsOn: ['implementation', 'security', 'seo'] },
  { id: 'delivery', title: 'Prepare release report and next steps', agent: 'delivery', skill: 'release-readiness', dependsOn: ['qa'] }
];

function contextFingerprint(project){
  const context={name:project.name,type:project.type,objective:project.objective||'',requirements:project.requirements||'',techPreferences:project.techPreferences||'',repositoryPath:project.repositoryPath||'',decisions:(project.decisions||[]).map(({id,title,rationale})=>({id,title,rationale}))};
  return createHash('sha256').update(JSON.stringify(context)).digest('hex');
}

export function workflowIsStale(project,workflow){return Boolean(workflow.contextFingerprint&&workflow.contextFingerprint!==contextFingerprint(project));}

export function createWorkflow(project) {
  const now = new Date().toISOString();
  const projectText=`${project.name||''} ${project.objective||''} ${project.requirements||''}`;
  const matched = routing.rules.flatMap(rule=>{const evidence=rule.triggers.flatMap(trigger=>{const match=projectText.match(new RegExp(trigger.pattern,'i'));return match?[{trigger:trigger.id,matched:match[0]}]:[];});return evidence.length?[{...rule,routingEvidence:evidence}]:[];});
  const selected = [...definitions, ...matched];
  const ids = new Set(selected.map(t => t.id));
  const workflow = { id: randomUUID(), status: 'planned', createdAt: now,
    notice: 'This is a workflow plan. No external coding agent or repository checks were invoked.',
    contextFingerprint: contextFingerprint(project),
    routing: { mode: 'rules', version:routing.version, matched: matched.map(({id,skill,agent,routingEvidence}) => ({id,skill,agent,evidence:routingEvidence})), considered: routing.rules.length },
    tasks: selected.map(task => ({ ...task, dependsOn: task.dependsOn.filter(id => ids.has(id)), ...(task.routingEvidence?{routingEvidence:task.routingEvidence}:{}), status: 'planned', evidence: [], updatedAt: now })) };
  workflow.events = [{ id: randomUUID(), type: 'workflow.created', at: now, detail: `Created workflow for ${project.name}` }, ...workflow.tasks.map(t => ({ id: randomUUID(), type: `task.${t.status}`, at: now, detail: t.title }))];
  return workflow;
}

export function updateWorkflowTask(workflow, taskId, { status, evidence = '' }) {
  if (!['completed', 'failed', 'skipped'].includes(status)) throw Object.assign(new Error('Task status must be completed, failed, or skipped.'), { status: 400 });
  const task = workflow.tasks.find(t => t.id === taskId);
  if (!task) throw Object.assign(new Error('Workflow task not found.'), { status: 404 });
  if (task.status === 'completed') throw Object.assign(new Error('Completed tasks cannot be changed.'), { status: 409 });
  const blocked = task.dependsOn.filter(id => workflow.tasks.find(t => t.id === id)?.status !== 'completed');
  if (blocked.length) throw Object.assign(new Error(`Complete dependencies first: ${blocked.join(', ')}.`), { status: 409 });
  if (status === 'completed' && !String(evidence).trim()) throw Object.assign(new Error('Evidence is required to complete a task.'), { status: 400 });
  const now = new Date().toISOString(); task.status = status; task.updatedAt = now; task.evidence = status === 'completed' ? [String(evidence).trim().slice(0,1000)] : [];
  workflow.events.unshift({ id: randomUUID(), type: `task.${status}`, at: now, detail: `${task.title}${task.evidence.length ? ` — ${task.evidence[0]}` : ''}` });
  workflow.status = workflow.tasks.every(t => t.status === 'completed') ? 'completed' : workflow.tasks.some(t => t.status === 'failed') ? 'needs_attention' : 'in_progress';
  if (workflow.status === 'completed') workflow.completedAt = now; else delete workflow.completedAt;
  return task;
}

const remediationFindingKey=(source,finding)=>`${source||''}|${finding?.file||''}|${finding?.control||finding?.check||source||'overall'}`;

export function createRemediationPlan(project) {
  const currentChecks=evaluateQuality(project.checks||[],project.type).categories.flatMap(category=>category.checks);
  const blockers = currentChecks.filter(check => check.status === 'fail' && check.critical);
  const unresolved = currentChecks.filter(check => ['fail','unverified'].includes(check.status));
  const selected = unresolved.length ? unresolved : currentChecks.filter(check => check.status === 'unverified');
  const actions = selected.flatMap(check => {
    const findings=Array.isArray(check.resultDetails?.findings)?check.resultDetails.findings:[];const targets=findings.length?findings:[null];
    return targets.map(finding=>{const file=finding?.file||'';const control=finding?.control||finding?.check||check.controlId||check.source||'overall';const findingKey=finding?remediationFindingKey(check.source,finding):null;return{
      id: randomUUID(), checkId: check.id, title: finding?`Resolve: ${check.title} · ${finding.issue||control}`:`Resolve: ${check.title}`,
      category: check.category, evaluatorId:check.source||null, controlId:control, findingKey, finding:file?{file,control,issue:String(finding.issue||'').slice(0,300)}:null, priority: check.critical ? 'critical' : check.status === 'fail' ? 'high' : 'normal',
      status: 'open', reason: finding?.issue||check.evidence || `The ${check.status} result needs additional evidence.`,
      suggestedNextStep: check.status === 'unverified' ? 'Run a supported evaluator or attach verifiable evidence.' : 'Address this finding, rerun the relevant check, and record its output.',
      verificationStatus:'pending',createdAt: new Date().toISOString()
    }});
  });
  return { id: randomUUID(), createdAt: new Date().toISOString(), status: blockers.length ? 'blocked' : actions.length ? 'in_progress' : 'no_open_findings', blockerCount: blockers.length, actions };
}

export function updateRemediationAction(plan, actionId, { status, evidence = '' }) {
  if (!['open','in_progress','completed'].includes(status)) throw Object.assign(new Error('Action status must be open, in_progress, or completed.'), { status: 400 });
  const action=plan.actions.find(item=>item.id===actionId);if(!action)throw Object.assign(new Error('Remediation action not found.'),{status:404});
  if(status==='completed'&&!String(evidence).trim())throw Object.assign(new Error('Evidence is required to complete remediation.'),{status:400});
  const now=new Date().toISOString();action.status=status;action.updatedAt=now;if(status!=='completed')action.verificationStatus='pending';action.history??=[];action.history.unshift({status,evidence:String(evidence).trim().slice(0,1000),at:now});
  plan.status=plan.actions.some(item=>item.status!=='completed')?(plan.blockerCount?'blocked':'in_progress'):'awaiting_verification';plan.updatedAt=now;return action;
}

export function linkEvaluationToRemediation(project,check){
  const source=check.source||check.provenance?.evaluatorId;if(!source)return[];const now=check.createdAt||new Date().toISOString();const evidence=String(check.evidence||'').slice(0,1000);const updated=[];const findingsAvailable=Array.isArray(check.resultDetails?.findings)&&check.resultDetails.findingsTruncated!==true;const findings=findingsAvailable?check.resultDetails.findings:[];const activeKeys=new Set(findings.map(finding=>remediationFindingKey(source,finding)));
  for(const plan of project.remediationPlans||[])for(const action of plan.actions||[]){const actionSource=action.evaluatorId||project.evaluationHistory?.find(item=>item.id===action.checkId)?.source;if(actionSource!==source||action.status!=='completed')continue;action.evaluatorId=source;const resolved=action.findingKey?check.status!=='unverified'&&findingsAvailable&&!activeKeys.has(action.findingKey):check.status==='pass';action.verificationStatus=resolved?'verified':'not_resolved';action.verifiedBy=source;action.verifiedAt=now;action.verificationEvidence=evidence;if(!resolved){action.status='in_progress';action.updatedAt=now;}action.history??=[];action.history.unshift({status:action.status,verificationStatus:action.verificationStatus,evidence,at:now,evaluatorId:source,findingKey:action.findingKey||null});action.history=action.history.slice(0,100);plan.updatedAt=now;updated.push({actionId:action.id,planId:plan.id,verificationStatus:action.verificationStatus,findingKey:action.findingKey||null});}
  for(const plan of project.remediationPlans||[]){if(!plan.actions?.length)continue;if(plan.actions.every(action=>action.status==='completed'&&action.verificationStatus==='verified'))plan.status='verified_complete';else if(plan.actions.every(action=>action.status==='completed'))plan.status='awaiting_verification';else plan.status=plan.blockerCount?'blocked':'in_progress';}
  return updated;
}

import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { PostgresStore } from './postgres-store.js';
import { AuthService } from './auth.js';
import { createWorkflow, createRemediationPlan, linkEvaluationToRemediation, updateRemediationAction, updateWorkflowTask, workflowIsStale } from './orchestrator.js';
import { evaluateQuality } from './quality.js';
import { recordEvaluation } from './evidence.js';
import { normalizeActivity, pageActivity } from './activity.js';
import { createProjectBackup, restoreProjectBackup } from './backups.js';
import { auditDeploymentConfig, auditRenderedPerformance, auditRenderedRepository, auditStaticAccessibility, auditStaticSeo, auditVisualReview, resolveRepository, runNodeTests, runNpmAudit, scanForSecrets } from './evaluators.js';
import { createTaskPrompt, providers, runAntigravity, runClaudeCode, runCodex } from './adapters.js';
import { qualityReportMarkdown } from './reports.js';
import { applyChangeProposal, createChangeProposal } from './proposals.js';
import { ExecutionEngine } from './execution/engine.js';
import { createExecutionSession } from './execution/state.js';
import { auditProjectTrustEvidence, computeRepositoryFingerprint } from './trust/evidence-engine.js';
import { buildDigitalTwinGraph } from './twin/graph.js';
import { analyzeChangeImpact } from './twin/impact.js';
import { runBrowserQaSuite } from './qa/browser.js';
import { runAttackSimulation } from './security/attack-lab.js';
import { evaluateMarketReality } from './validation/reality-check.js';
import { generateScaleForecast } from './forecaster/scale.js';
import { executeDeploymentRehearsal } from './deployment/rehearsal.js';
import { generateProductionPassport, formatPassportMarkdown } from './passport/generator.js';
import { AgentObservatory } from './observatory/metrics.js';
import agents from '../agents/registry.json' with { type: 'json' };
import skills from '../skills/registry.json' with { type: 'json' };

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(root, '../public');
const store = process.env.DATABASE_URL ? new PostgresStore() : new Store();
const auth = new AuthService();
const requestContext=new AsyncLocalStorage();
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json; charset=utf-8' };

async function body(req,maxBytes=1_000_000) {
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>maxBytes)throw Object.assign(new Error('Request body too large'),{status:413});chunks.push(chunk);}
  try { return size ? JSON.parse(Buffer.concat(chunks,size).toString('utf8')) : {}; } catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
}
function send(res, status, data, headers={}) { res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer', 'cross-origin-resource-policy':'same-origin',...headers }); res.end(JSON.stringify(data)); }
function clean(value, max = 300) { return String(value ?? '').trim().slice(0, max); }
function withQuality(p) { normalizeActivity(p);for(const workflow of p.workflows||[])workflow.stale=workflowIsStale(p,workflow);const changeProposals=(p.changeProposals||[]).map(({proposedContent,...proposal})=>proposal);return { ...p, changeProposals, quality: evaluateQuality(p.checks,p.type) }; }
async function updateProjects(projectStore,mutator){const apply=async records=>{const prior=new Map(records.map(project=>[project.id,new Set(project.activity||[])]));const result=await mutator(records);const actor=requestContext.getStore()?.actor;if(actor)for(const project of records)for(const event of project.activity||[])if(!prior.get(project.id)?.has(event))event.actor=actor;for(const project of records)normalizeActivity(project);return result;};if(typeof projectStore.update==='function')return projectStore.update(apply);const records=await projectStore.all();const result=await apply(records);await projectStore.save(records);return result;}

export function createAppServer({ projectStore = store, authService=auth, dataDirectory=path.resolve(process.env.AGENCYOS_DATA_DIR||'data'), observatory = new AgentObservatory(), agentRunner = runCodex, claudeRunner = runClaudeCode, antigravityRunner = runAntigravity, renderedRunner = auditRenderedRepository, performanceRunner = auditRenderedPerformance, visualReviewRunner=auditVisualReview } = {}) {
 const executionEngine = new ExecutionEngine({ runners: { codex: agentRunner, 'claude-code': claudeRunner, antigravity: antigravityRunner } });
 const serverInstanceId=randomUUID();let recoveryPromise;
 const recoverRuns=()=>{if(!recoveryPromise)recoveryPromise=updateProjects(projectStore,records=>{for(const project of records){for(const run of project.agentRuns||[])if(run.status==='running'&&run.serverInstanceId!==serverInstanceId){const at=new Date().toISOString();run.status='orphaned';run.completedAt=at;run.error='AgencyOS restarted or lost the run owner; final agent process outcome is unknown. Inspect the repository before retrying.';run.events??=[];run.events.push({type:'run.orphaned',text:run.error,at});project.activity.unshift({at,text:`Codex run outcome unknown: ${run.id}`});}for(const session of project.executionSessions||[])if(session.status==='running'){session.status='failed';session.error='AgencyOS restarted; in-flight execution session interrupted.';session.completedAt=new Date().toISOString();}for(const proposal of project.changeProposals||[])if(proposal.status==='applying'){proposal.status='unknown';proposal.error='AgencyOS restarted while applying this proposal. Inspect the target file before taking further action.';proposal.updatedAt=new Date().toISOString();}}}).catch(error=>{recoveryPromise=null;throw error;});return recoveryPromise;};
 return createServer((req,res)=>requestContext.run({actor:null},async()=>{
  try {
   await recoverRuns();
   const url = new URL(req.url, 'http://localhost'); const route = url.pathname; const method = req.method;
   const origin=req.headers.origin;
   if(route.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(method)&&origin){const protocol=req.socket.encrypted||process.env.AGENCYOS_COOKIE_SECURE==='true'?'https:':'http:';const expected=`${protocol}//${req.headers.host}`;if(origin!==expected)return send(res,403,{error:'Cross-origin API mutations are not allowed.'});}
   const authUser=authService.session(req.headers.cookie||'');const secureCookie=Boolean(req.socket.encrypted)||process.env.AGENCYOS_COOKIE_SECURE==='true';
   if(route==='/api/auth/session'&&method==='GET')return send(res,200,{enabled:authService.enabled,user:authUser?{id:authUser.sub,username:authUser.username,role:authUser.role}:null});
   if(route==='/api/auth/login'&&method==='POST'){if(!authService.enabled)return send(res,404,{error:'Authentication is not configured.'});const input=await body(req,10_000);const session=await authService.login(input.username,input.password,req.socket.remoteAddress);if(!session)return send(res,401,{error:'Invalid credentials or login rate limit reached.'});return send(res,200,{user:session.user},{'set-cookie':authService.cookieHeaders(session,secureCookie)});}
   if(route==='/api/auth/logout'&&method==='POST'){if(authService.enabled&&!authService.csrfMatches(req,authUser))return send(res,403,{error:'A valid CSRF token is required.'});return send(res,200,{loggedOut:true},{'set-cookie':authService.cookieHeaders(null,secureCookie)});}
   if(authService.enabled&&route.startsWith('/api/')&&route!=='/api/health'){if(!authUser)return send(res,401,{error:'Sign in to access AgencyOS.'});if(!['GET','HEAD','OPTIONS'].includes(method)){if(authUser.role==='viewer')return send(res,403,{error:'Viewer accounts cannot change AgencyOS data.'});if(!authService.csrfMatches(req,authUser))return send(res,403,{error:'A valid CSRF token is required for this change.'});}}
   requestContext.getStore().actor=authUser?{id:String(authUser.sub).slice(0,100),username:String(authUser.username).slice(0,100),role:authUser.role}:{id:'local',username:'Local user',role:'owner'};
   if (route.startsWith('/api/')) {
    if (route === '/api/health' && method === 'GET') return send(res, 200, { status:'ok', product:'AgencyOS', version:'0.1.0' });
    if (route === '/api/agents' && method === 'GET') return send(res, 200, agents);
    if (route === '/api/skills' && method === 'GET') return send(res, 200, skills);
    if (route === '/api/providers' && method === 'GET') return send(res, 200, providers);
    if (route === '/api/observatory/metrics' && method === 'GET') return send(res, 200, observatory.getMetrics());
    if (route === '/api/observatory/events' && method === 'POST') {
      const input = await body(req);
      const event = await observatory.recordEvent(input);
      return send(res, 201, event);
    }
    const proposalRoute=route.match(/^\/api\/projects\/([\w-]+)\/change-proposals(?:\/([\w-]+)\/apply)?$/);
    if(proposalRoute&&method==='POST'&&!proposalRoute[2]){const [,id]=proposalRoute;const input=await body(req,300_000);const project=(await projectStore.all()).find(item=>item.id===id);if(!project)return send(res,404,{error:'Project not found.'});const proposal=await createChangeProposal(project.repositoryPath,input);const saved=await updateProjects(projectStore,records=>{const current=records.find(item=>item.id===id);if(!current)return false;current.changeProposals??=[];current.changeProposals.unshift(proposal);current.activity.unshift({at:proposal.createdAt,text:`Change proposal created: ${proposal.path}`});return true;});if(!saved)return send(res,404,{error:'Project not found.'});const {proposedContent,...review}=proposal;return send(res,201,review);}
    if(proposalRoute&&method==='GET'&&!proposalRoute[2]){const project=(await projectStore.all()).find(item=>item.id===proposalRoute[1]);if(!project)return send(res,404,{error:'Project not found.'});return send(res,200,(project.changeProposals||[]).map(({proposedContent,...proposal})=>proposal));}
    if(proposalRoute&&method==='POST'&&proposalRoute[2]){const [,id,proposalId]=proposalRoute;const input=await body(req);let proposal;const claim=await updateProjects(projectStore,records=>{const project=records.find(item=>item.id===id);if(!project)return'project';proposal=project.changeProposals?.find(item=>item.id===proposalId);if(!proposal)return'proposal';if(proposal.status!=='proposed')return'status';if(input.approved!==true)return'approval';if(input.approvalHash!==proposal.approvalHash)return'hash';proposal.status='applying';proposal.updatedAt=new Date().toISOString();return'ok';});if(claim==='project')return send(res,404,{error:'Project not found.'});if(claim==='proposal')return send(res,404,{error:'Change proposal not found.'});if(claim==='status')return send(res,409,{error:`Proposal cannot be applied from status ${proposal.status}.`});if(claim==='approval')return send(res,400,{error:'Explicit confirmation is required before applying this file change.'});if(claim==='hash')return send(res,409,{error:'Approval hash does not match the reviewed proposal.'});const project=(await projectStore.all()).find(item=>item.id===id);let applied;try{applied=await applyChangeProposal(project.repositoryPath,proposal,{approved:true,approvalHash:input.approvalHash});}catch(error){await updateProjects(projectStore,records=>{const current=records.find(item=>item.id===id);const saved=current?.changeProposals?.find(item=>item.id===proposalId);if(saved){saved.status=error.status===409?'stale':'proposed';saved.error=clean(error.message,500);saved.updatedAt=new Date().toISOString();}});return send(res,error.status||500,{error:error.message});}await updateProjects(projectStore,records=>{const current=records.find(item=>item.id===id);const saved=current?.changeProposals?.find(item=>item.id===proposalId);if(saved){saved.status='applied';saved.appliedAt=applied.appliedAt;saved.appliedHash=applied.appliedHash;delete saved.error;current.activity.unshift({at:applied.appliedAt,text:`Approved change proposal applied: ${saved.path}`});}});return send(res,200,{proposalId,status:'applied',...applied});}
    if (route === '/api/remediation' && method === 'POST') {
      const input=await body(req);let plan;const found=await updateProjects(projectStore,projects=>{const project=projects.find(p=>p.id===input.projectId);if(!project)return false;plan=createRemediationPlan(project);project.remediationPlans??=[];project.remediationPlans.unshift(plan);project.updatedAt=plan.createdAt;project.activity.unshift({at:plan.createdAt,text:`Remediation plan created: ${plan.actions.length} open action(s)`});return true;});if(!found)return send(res,404,{error:'Project not found.'});return send(res,201,plan);
    }
    const remediationActionMatch=route.match(/^\/api\/projects\/([\w-]+)\/remediation\/([\w-]+)\/actions\/([\w-]+)$/);
    if(remediationActionMatch&&method==='PATCH'){const [,id,planId,actionId]=remediationActionMatch;const input=await body(req);let outcome;const result=await updateProjects(projectStore,projects=>{const project=projects.find(p=>p.id===id);if(!project)return 'project';const plan=project.remediationPlans?.find(p=>p.id===planId);if(!plan)return 'plan';const action=updateRemediationAction(plan,actionId,{status:input.status,evidence:clean(input.evidence,1000)});project.updatedAt=action.updatedAt;project.activity.unshift({at:action.updatedAt,text:`Remediation action ${action.status}: ${action.title}`});outcome={action,plan};return 'ok';});if(result==='project')return send(res,404,{error:'Project not found.'});if(result==='plan')return send(res,404,{error:'Remediation plan not found.'});return send(res,200,outcome);}
    const remediationMatch=route.match(/^\/api\/projects\/([\w-]+)\/remediation$/);
    if(remediationMatch&&method==='GET'){const project=(await projectStore.all()).find(p=>p.id===remediationMatch[1]);return project?send(res,200,project.remediationPlans||[]):send(res,404,{error:'Project not found.'})}
    const reviewImageMatch=route.match(/^\/api\/projects\/([\w-]+)\/reviews\/([\w-]+)\/(page-\d{3}\.png)$/);
    const reviewListMatch=route.match(/^\/api\/projects\/([\w-]+)\/reviews$/);
    if(reviewListMatch&&method==='GET'){const project=(await projectStore.all()).find(item=>item.id===reviewListMatch[1]);return project?send(res,200,project.visualReviews||[]):send(res,404,{error:'Project not found.'})}
    if(reviewImageMatch&&method==='GET'){const [,id,reviewId,filename]=reviewImageMatch;const project=(await projectStore.all()).find(item=>item.id===id);if(!project)return send(res,404,{error:'Project not found.'});if(!(project.visualReviews||[]).some(review=>review.id===reviewId))return send(res,404,{error:'Visual review not found.'});const rootDirectory=path.resolve(dataDirectory,'reviews',id,reviewId);const imagePath=path.resolve(rootDirectory,filename);if(path.dirname(imagePath)!==rootDirectory)return send(res,403,{error:'Forbidden'});try{const image=await readFile(imagePath);res.writeHead(200,{'content-type':'image/png','content-length':image.length,'cache-control':'private, max-age=3600','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'});return res.end(image)}catch(error){if(error.code==='ENOENT')return send(res,404,{error:'Screenshot not found.'});throw error;}}
    const visualReviewMatch=route.match(/^\/api\/projects\/([\w-]+)\/evaluations\/visual-review$/);
    if(visualReviewMatch&&method==='POST'){const [,id]=visualReviewMatch;const input=await body(req);if(input.approved!==true)return send(res,400,{error:'Explicit approval is required before Chrome renders pages from this repository.'});const project=(await projectStore.all()).find(item=>item.id===id);if(!project)return send(res,404,{error:'Project not found.'});const reviewId=randomUUID();const dataRoot=path.resolve(dataDirectory,'reviews',id,reviewId);const result=await visualReviewRunner(project.repositoryPath,dataRoot);const createdAt=new Date().toISOString();const screenshots=result.pages.map(page=>({...page,url:`/api/projects/${id}/reviews/${reviewId}/${page.filename}`}));const review={id:reviewId,createdAt,status:result.status,evidence:result.evidence,screenshots,errors:result.errors};const found=await updateProjects(projectStore,records=>{const current=records.find(item=>item.id===id);if(!current)return false;current.visualReviews??=[];current.visualReviews.unshift(review);current.visualReviews=current.visualReviews.slice(0,20);current.updatedAt=createdAt;current.activity.unshift({at:createdAt,text:`Visual review screenshots captured: ${screenshots.length} page(s)`});return true;});if(!found)return send(res,404,{error:'Project not found.'});return send(res,201,{reviewId,review});}
    const browserQaMatch = route.match(/^\/api\/projects\/([\w-]+)\/evaluations\/browser-qa$/);
    if (browserQaMatch && method === 'POST') {
      const [, id] = browserQaMatch;
      const input = await body(req);
      if (input.approved !== true) return send(res, 400, { error: 'Explicit approval is required before running autonomous browser QA against this repository.' });
      const project = (await projectStore.all()).find(p => p.id === id);
      if (!project) return send(res, 404, { error: 'Project not found.' });
      const qaOutput = path.resolve(dataDirectory, 'qa', id);
      const result = await runBrowserQaSuite({ repositoryPath: project.repositoryPath, outputDirectory: qaOutput });
      const createdAt = new Date().toISOString();
      const check = {
        id: randomUUID(),
        category: 'testing',
        title: 'Autonomous Browser QA & Journey Verification',
        status: result.status,
        score: result.status === 'pass' ? 100 : 50,
        evidence: result.evidence,
        critical: false,
        verification: 'automated',
        source: 'browser-qa',
        provenance: {
          kind: 'automated',
          evaluatorId: 'browser-qa',
          evaluatorVersion: '1.0.0',
          capturedAt: createdAt,
          execution: 'playwright-qa'
        },
        resultDetails: {
          routesDiscovered: result.routesDiscovered,
          criticalJourneys: result.criticalJourneys,
          bugReports: result.bugReports,
          artifacts: result.artifacts
        },
        createdAt
      };
      let quality, recorded;
      await updateProjects(projectStore, projects => {
        const current = projects.find(p => p.id === id);
        if (!current) return false;
        recorded = recordEvaluation(current, check);
        current.updatedAt = createdAt;
        current.activity.unshift({ at: createdAt, text: `Browser QA executed: ${result.status} (${result.bugReports.length} bug report(s))` });
        quality = evaluateQuality(current.checks, current.type);
        return true;
      });
      return send(res, 201, { check, quality, report: result });
    }
    const attackLabMatch = route.match(/^\/api\/projects\/([\w-]+)\/evaluations\/attack-lab$/);
    if (attackLabMatch && method === 'POST') {
      const [, id] = attackLabMatch;
      const input = await body(req);
      if (input.authorized !== true) return send(res, 400, { error: 'Explicit authorization is required before running Attack Simulation Lab (set authorized: true).' });
      const project = (await projectStore.all()).find(p => p.id === id);
      if (!project) return send(res, 404, { error: 'Project not found.' });
      const attackOutput = path.resolve(dataDirectory, 'security', id);
      const result = await runAttackSimulation({
        authorized: input.authorized,
        environment: input.environment || 'staging',
        allowProduction: input.allowProduction === true,
        targetUrl: input.targetUrl || '',
        repositoryPath: project.repositoryPath,
        headers: input.headers || {},
        cookies: input.cookies || [],
        routes: input.routes || [],
        uploadHandlers: input.uploadHandlers || [],
        outputDirectory: attackOutput
      });
      const createdAt = new Date().toISOString();
      const check = {
        id: randomUUID(),
        category: 'security',
        title: 'Attack Simulation Lab Verification',
        status: result.status,
        score: result.status === 'pass' ? 100 : result.summary.criticalCount > 0 ? 0 : 40,
        evidence: result.evidence,
        critical: result.summary.criticalCount > 0,
        verification: 'automated',
        source: 'attack-lab',
        provenance: {
          kind: 'automated',
          evaluatorId: 'attack-lab',
          evaluatorVersion: '1.0.0',
          capturedAt: createdAt,
          execution: 'attack-simulation'
        },
        resultDetails: {
          scenariosTested: result.scenariosTested,
          summary: result.summary,
          findings: (result.findings || []).slice(0, 50)
        },
        createdAt
      };
      let quality, recorded;
      await updateProjects(projectStore, projects => {
        const current = projects.find(p => p.id === id);
        if (!current) return false;
        recorded = recordEvaluation(current, check);
        current.updatedAt = createdAt;
        current.activity.unshift({ at: createdAt, text: `Attack Simulation Lab executed: ${result.status} (${result.summary.failed} failed finding(s))` });
        quality = evaluateQuality(current.checks, current.type);
        return true;
      });
      return send(res, 201, { check, quality, report: result });
    }
    const realityCheckMatch = route.match(/^\/api\/projects\/([\w-]+)\/reality-check$/);
    if (realityCheckMatch && method === 'POST') {
      const [, id] = realityCheckMatch;
      const input = await body(req);
      const project = (await projectStore.all()).find(p => p.id === id);
      if (!project) return send(res, 404, { error: 'Project not found.' });
      const result = evaluateMarketReality({
        projectName: project.name,
        concept: input.concept || project.objective,
        valueProposition: input.valueProposition || '',
        pricing: input.pricing || null,
        data: input.data || {}
      });
      const createdAt = new Date().toISOString();
      const check = {
        id: randomUUID(),
        category: 'architecture',
        title: 'Market Reality Check & Demand Evidence',
        status: result.verdict === 'HIGH_RISK_UNVALIDATED' ? 'fail' : result.hasStatisticalSignificance ? 'pass' : 'unverified',
        score: result.marketEvidenceScore,
        evidence: result.evidence,
        critical: false,
        verification: 'automated',
        source: 'reality-check',
        provenance: {
          kind: 'automated',
          evaluatorId: 'reality-check',
          evaluatorVersion: '1.0.0',
          capturedAt: createdAt,
          execution: 'empirical-validation-engine'
        },
        resultDetails: {
          verdict: result.verdict,
          verdictSummary: result.verdictSummary,
          hasStatisticalSignificance: result.hasStatisticalSignificance,
          tiers: result.tiers,
          assumptions: result.assumptions,
          unknowns: result.unknowns,
          recommendedExperiments: result.recommendedExperiments
        },
        createdAt
      };
      let quality, recorded;
      await updateProjects(projectStore, projects => {
        const current = projects.find(p => p.id === id);
        if (!current) return false;
        recorded = recordEvaluation(current, check);
        current.updatedAt = createdAt;
        current.activity.unshift({ at: createdAt, text: `Market Reality Check: ${result.verdict} (Score: ${result.marketEvidenceScore}/100)` });
        quality = evaluateQuality(current.checks, current.type);
        return true;
      });
      return send(res, 201, { check, quality, evaluation: result });
    }
    const forecastMatch = route.match(/^\/api\/projects\/([\w-]+)\/forecast$/);
    if (forecastMatch && method === 'GET') {
      const [, id] = forecastMatch;
      const project = (await projectStore.all()).find(p => p.id === id);
      if (!project) return send(res, 404, { error: 'Project not found.' });
      const forecast = generateScaleForecast({ projectName: project.name });
      return send(res, 200, forecast);
    }
    if (forecastMatch && method === 'POST') {
      const [, id] = forecastMatch;
      const input = await body(req);
      const project = (await projectStore.all()).find(p => p.id === id);
      if (!project) return send(res, 404, { error: 'Project not found.' });
      const forecast = generateScaleForecast({
        projectName: project.name,
        customAssumptions: input.assumptions || {},
        customRates: input.rates || {}
      });
      const createdAt = new Date().toISOString();
      const check = {
        id: randomUUID(),
        category: 'reliability',
        title: 'Infrastructure Cost & Scale Capacity Forecast',
        status: 'pass',
        score: 100,
        evidence: `Estimated monthly burn across 100 to 100,000 active users: $${forecast.scenarios[0].totalMonthlyCost.expected} to $${forecast.scenarios[3].totalMonthlyCost.expected}/mo. ${forecast.scenarios[3].bottlenecks.length} scale bottleneck(s) identified.`,
        critical: false,
        verification: 'automated',
        source: 'scale-forecaster',
        provenance: {
          kind: 'automated',
          evaluatorId: 'scale-forecaster',
          evaluatorVersion: '1.0.0',
          capturedAt: createdAt,
          execution: 'cost-capacity-model'
        },
        resultDetails: {
          scenarios: forecast.scenarios,
          evolutionRoadmap: forecast.evolutionRoadmap,
          rateCardsReferenced: forecast.rateCardsReferenced
        },
        createdAt
      };
      let quality, recorded;
      await updateProjects(projectStore, projects => {
        const current = projects.find(p => p.id === id);
        if (!current) return false;
        recorded = recordEvaluation(current, check);
        current.updatedAt = createdAt;
        current.activity.unshift({ at: createdAt, text: `Scale Forecast generated: $${forecast.scenarios[0].totalMonthlyCost.expected}-$${forecast.scenarios[3].totalMonthlyCost.expected}/mo` });
        quality = evaluateQuality(current.checks, current.type);
        return true;
      });
      return send(res, 201, { check, quality, forecast });
    }
    const rehearsalMatch = route.match(/^\/api\/projects\/([\w-]+)\/rehearsal$/);
    if (rehearsalMatch && method === 'POST') {
      const [, id] = rehearsalMatch;
      const input = await body(req);
      const project = (await projectStore.all()).find(p => p.id === id);
      if (!project) return send(res, 404, { error: 'Project not found.' });
      const rehearsal = await executeDeploymentRehearsal({
        repositoryPath: project.repositoryPath,
        environment: input.environment || 'staging',
        allowProductionDeployment: input.allowProductionDeployment === true,
        targetUrl: input.targetUrl || '',
        lastBackup: input.lastBackup || project.lastBackup || null,
        dependencies: input.dependencies || [],
        rollbackConfig: input.rollbackConfig || {}
      });
      const createdAt = new Date().toISOString();
      const check = {
        id: randomUUID(),
        category: 'delivery',
        title: 'Pre-Flight Staging Deployment Rehearsal',
        status: rehearsal.releaseReady ? 'pass' : 'fail',
        score: rehearsal.releaseReady ? 100 : rehearsal.riskLevel === 'critical' ? 0 : 40,
        evidence: rehearsal.evidence,
        critical: rehearsal.riskLevel === 'critical',
        verification: 'automated',
        source: 'deployment-rehearsal',
        provenance: {
          kind: 'automated',
          evaluatorId: 'deployment-rehearsal',
          evaluatorVersion: '1.0.0',
          capturedAt: createdAt,
          execution: 'staging-preflight-drill'
        },
        resultDetails: {
          rehearsalId: rehearsal.rehearsalId,
          environment: rehearsal.environment,
          releaseReady: rehearsal.releaseReady,
          riskLevel: rehearsal.riskLevel,
          blockers: rehearsal.blockers,
          warnings: rehearsal.warnings,
          checkpoints: rehearsal.checkpoints
        },
        createdAt
      };
      let quality, recorded;
      await updateProjects(projectStore, projects => {
        const current = projects.find(p => p.id === id);
        if (!current) return false;
        recorded = recordEvaluation(current, check);
        current.updatedAt = createdAt;
        current.activity.unshift({ at: createdAt, text: `Deployment Rehearsal: ${rehearsal.releaseReady ? 'PASSED' : 'BLOCKED'} (Risk: ${rehearsal.riskLevel.toUpperCase()})` });
        quality = evaluateQuality(current.checks, current.type);
        return true;
      });
      return send(res, 201, { check, quality, rehearsal });
    }
    const passportJsonMatch = route.match(/^\/api\/projects\/([\w-]+)\/passport\.json$/);
    if (passportJsonMatch && method === 'GET') {
      const [, id] = passportJsonMatch;
      const project = (await projectStore.all()).find(p => p.id === id);
      if (!project) return send(res, 404, { error: 'Project not found.' });
      const passport = await generateProductionPassport(project);
      return send(res, 200, passport);
    }
    const passportMdMatch = route.match(/^\/api\/projects\/([\w-]+)\/passport\.md$/);
    if (passportMdMatch && method === 'GET') {
      const [, id] = passportMdMatch;
      const project = (await projectStore.all()).find(p => p.id === id);
      if (!project) return send(res, 404, { error: 'Project not found.' });
      const passport = await generateProductionPassport(project);
      const markdown = formatPassportMarkdown(passport);
      res.writeHead(200, {
        'content-type': 'text/markdown; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      });
      return res.end(markdown);
    }
    const passportPostMatch = route.match(/^\/api\/projects\/([\w-]+)\/passport$/);
    if (passportPostMatch && method === 'POST') {
      const [, id] = passportPostMatch;
      const input = await body(req);
      const project = (await projectStore.all()).find(p => p.id === id);
      if (!project) return send(res, 404, { error: 'Project not found.' });
      const passport = await generateProductionPassport(project, {
        commitHash: input.commitHash || '',
        buildVersion: input.buildVersion || '',
        releaseTag: input.releaseTag || ''
      });
      const createdAt = new Date().toISOString();
      await updateProjects(projectStore, projects => {
        const current = projects.find(p => p.id === id);
        if (!current) return false;
        current.updatedAt = createdAt;
        current.activity.unshift({ at: createdAt, text: `Production Passport generated: ${passport.releaseMetadata.releaseTag} (Score: ${passport.qualityScorecard.score}/100, Ready: ${passport.qualityScorecard.releaseReady})` });
        return true;
      });
      return send(res, 201, { passport });
    }
    const evaluationHistoryMatch=route.match(/^\/api\/projects\/([\w-]+)\/evaluations\/history$/);
    if(evaluationHistoryMatch&&method==='GET'){const project=(await projectStore.all()).find(p=>p.id===evaluationHistoryMatch[1]);return project?send(res,200,project.evaluationHistory||[]):send(res,404,{error:'Project not found.'})}
    const activityMatch=route.match(/^\/api\/projects\/([\w-]+)\/activity$/);
    if(activityMatch&&method==='GET'){const project=(await projectStore.all()).find(p=>p.id===activityMatch[1]);if(!project)return send(res,404,{error:'Project not found.'});const page=pageActivity(project,{limit:url.searchParams.get('limit'),offset:url.searchParams.get('offset')});return send(res,200,{projectId:project.id,projectName:project.name,...page});}
    if (route === '/api/projects' && method === 'GET') return send(res, 200, (await projectStore.all()).map(withQuality));
    if(route==='/api/projects/import'&&method==='POST'){const input=await body(req,50_000_000);if(input.approved!==true)return send(res,400,{error:'Explicit confirmation is required before importing a project backup.'});const project=restoreProjectBackup(input.backup);await updateProjects(projectStore,projects=>projects.unshift(project));return send(res,201,withQuality(project));}
    if (route === '/api/projects' && method === 'POST') {
      const input = await body(req); const name = clean(input.name, 100);
      if (!name) return send(res, 400, { error:'Project name is required.' });
      const now = new Date().toISOString();
      const priorities=['low','normal','high','urgent'];
      const project = { id:randomUUID(), name, type:clean(input.type || 'Custom Application', 50), objective:clean(input.objective, 1000), requirements:clean(input.requirements,5000), techPreferences:clean(input.techPreferences,1000), priority:priorities.includes(input.priority)?input.priority:'normal', repositoryPath:input.repositoryPath?await resolveRepository(input.repositoryPath):'', status:'active', createdAt:now, updatedAt:now, checks:[], workflows:[], decisions:[], activity:[{ at:now, text:'Project created' }] };
      await updateProjects(projectStore,projects=>projects.unshift(project)); return send(res, 201, withQuality(project));
    }
    const renderedMatch=route.match(/^\/api\/projects\/([\w-]+)\/evaluations\/rendered-browser$/);
    if(renderedMatch&&method==='POST'){const [,id]=renderedMatch;const input=await body(req);if(input.approved!==true)return send(res,400,{error:'Explicit approval is required before launching Chrome to execute page scripts from this repository.'});const project=(await projectStore.all()).find(p=>p.id===id);if(!project)return send(res,404,{error:'Project not found.'});const result=await renderedRunner(project.repositoryPath);const createdAt=new Date().toISOString();const definitions=[{source:'seo-rendered',category:'seo',title:'Automated rendered SEO metadata audit',status:result.seoStatus,findings:result.seoFindings||[]},{source:'accessibility-rendered',category:'accessibility',title:'Automated rendered HTML accessibility audit',status:result.accessibilityStatus,findings:result.accessibilityFindings||[]}];const checks=definitions.map(item=>({id:randomUUID(),category:item.category,title:item.title,status:item.status,score:item.status==='pass'?100:0,evidence:result.evidence,critical:false,verification:'automated',source:item.source,provenance:{kind:'automated',evaluatorId:item.source,evaluatorVersion:1,capturedAt:createdAt,execution:'local-chrome'},resultDetails:{pages:(result.pages||[]).slice(0,100),findings:item.findings.slice(0,500),findingsTruncated:item.findings.length>500,errors:(result.errors||[]).slice(0,50)},createdAt}));let quality;const found=await updateProjects(projectStore,records=>{const current=records.find(p=>p.id===id);if(!current)return false;for(const check of checks){const recorded=recordEvaluation(current,check);const linked=linkEvaluationToRemediation(current,check);current.activity.unshift({at:check.createdAt,text:`Automated ${check.source} ${recorded.change}: ${check.status}${linked.length?`; remediation ${linked.map(item=>item.verificationStatus).join(', ')}`:''}`});}current.updatedAt=createdAt;quality=evaluateQuality(current.checks,current.type);return true;});if(!found)return send(res,404,{error:'Project not found.'});return send(res,201,{checks,quality,evidence:result.evidence});}
    const evaluationMatch=route.match(/^\/api\/projects\/([\w-]+)\/evaluations\/(secret-scan|node-tests|seo-static|accessibility-static|deployment-config|performance-browser|dependency-audit)$/);
    if(evaluationMatch && method==='POST'){
      const [,id,evaluator]=evaluationMatch;const project=(await projectStore.all()).find(p=>p.id===id);if(!project)return send(res,404,{error:'Project not found.'});
      const input=await body(req);if(['node-tests','dependency-audit','performance-browser'].includes(evaluator)&&input.approved!==true)return send(res,400,{error:evaluator==='performance-browser'?'Explicit approval is required before launching Chrome to execute page scripts from this repository.':'Explicit approval is required before running repository code or sending dependency metadata to an npm registry.'});
      const result=evaluator==='secret-scan'?await scanForSecrets(project.repositoryPath):evaluator==='node-tests'?await runNodeTests(project.repositoryPath):evaluator==='seo-static'?await auditStaticSeo(project.repositoryPath):evaluator==='accessibility-static'?await auditStaticAccessibility(project.repositoryPath):evaluator==='deployment-config'?await auditDeploymentConfig(project.repositoryPath):evaluator==='performance-browser'?await performanceRunner(project.repositoryPath):await runNpmAudit(project.repositoryPath);
      const category={ 'secret-scan':'security','node-tests':'testing','seo-static':'seo','accessibility-static':'accessibility','deployment-config':'delivery','performance-browser':'performance','dependency-audit':'security' }[evaluator];
      const title={ 'secret-scan':'Automated high-confidence secret marker scan','node-tests':'Automated Node.js test run','seo-static':'Automated static HTML SEO metadata audit','accessibility-static':'Automated static HTML accessibility checks','deployment-config':'Automated deployment configuration baseline audit','performance-browser':'Automated rendered page performance audit','dependency-audit':'Automated npm dependency vulnerability audit' }[evaluator];
      const createdAt=new Date().toISOString();const check={id:randomUUID(),category,title,status:result.status,score:result.status==='pass'?100:0,evidence:result.evidence,critical:result.critical??['secret-scan','node-tests'].includes(evaluator),verification:'automated',source:evaluator,provenance:{kind:'automated',evaluatorId:evaluator,evaluatorVersion:1,capturedAt:createdAt,execution:evaluator==='performance-browser'?'local-chrome':'local'},resultDetails:{filesScanned:typeof result.files==='number'?result.files:null,files:Array.isArray(result.files)?result.files.slice(0,500):undefined,filesTruncated:Array.isArray(result.files)&&result.files.length>500,pages:Array.isArray(result.pages)?result.pages.slice(0,8):undefined,findings:(result.findings||[]).slice(0,500),findingsTruncated:(result.findings||[]).length>500,exitCode:result.exitCode??null},createdAt};
      let recorded,quality,remediationUpdates=[];const found=await updateProjects(projectStore,projects=>{const current=projects.find(p=>p.id===id);if(!current)return false;recorded=recordEvaluation(current,check);remediationUpdates=linkEvaluationToRemediation(current,check);current.updatedAt=check.createdAt;current.activity.unshift({at:check.createdAt,text:`Automated ${evaluator} ${recorded.change}: ${result.status}${remediationUpdates.length?`; remediation ${remediationUpdates.map(item=>item.verificationStatus).join(', ')}`:''}`});for(const item of remediationUpdates)current.activity.unshift({at:check.createdAt,text:`Remediation action ${item.verificationStatus==='verified'?'verified by':'not resolved by'} ${evaluator}`});quality=evaluateQuality(current.checks,current.type);return true;});if(!found)return send(res,404,{error:'Project not found.'});return send(res,201,{check,change:recorded.change,previousCheckId:recorded.previous?.id||null,quality,remediationUpdates,details:{filesScanned:result.files,findings:result.findings,exitCode:result.exitCode}});
    }
    const promptMatch=route.match(/^\/api\/projects\/([\w-]+)\/workflow\/([\w-]+)\/prompt$/);
    if(promptMatch&&method==='GET'){
      const [,id,workflowId]=promptMatch;const project=(await projectStore.all()).find(p=>p.id===id);if(!project)return send(res,404,{error:'Project not found.'});
      const flow=project.workflows.find(w=>w.id===workflowId);if(!flow)return send(res,404,{error:'Workflow not found.'});flow.stale=workflowIsStale(project,flow);const task=flow.tasks.find(t=>t.id===url.searchParams.get('task'));if(!task)return send(res,404,{error:'Workflow task not found.'});
      return send(res,200,{task,prompt:createTaskPrompt(project,flow,task)});
    }
    const agentRunMatch=route.match(/^\/api\/projects\/([\w-]+)\/agents\/(codex|claude-code|antigravity)\/run$/);
    if(agentRunMatch&&method==='POST'){
      const input=await body(req);if(input.approved!==true)return send(res,400,{error:'Explicit approval is required before starting a coding agent.'});
      const [,id,provider]=agentRunMatch;const runner=provider==='codex'?agentRunner:provider==='claude-code'?claudeRunner:antigravityRunner;const project=(await projectStore.all()).find(p=>p.id===id);if(!project)return send(res,404,{error:'Project not found.'});
      const repositoryPath=await resolveRepository(project.repositoryPath);let task,prompt,run,conflict;
      const started=await updateProjects(projectStore,records=>{const current=records.find(p=>p.id===id);if(!current)return false;const flow=current.workflows.find(w=>w.id===input.workflowId);if(!flow){task=null;return true;}flow.stale=workflowIsStale(current,flow);task=flow.tasks.find(t=>t.id===input.taskId);conflict=(current.agentRuns||[]).find(r=>r.taskId===input.taskId&&r.workflowId===input.workflowId&&['running','orphaned'].includes(r.status));if(conflict)return true;prompt=createTaskPrompt(current,flow,task);run={id:randomUUID(),provider,taskId:task.id,workflowId:flow.id,status:'running',serverInstanceId,startedAt:new Date().toISOString(),output:'',error:'',events:[{type:'run.started',text:`Started: ${task.title}`,at:new Date().toISOString()}]};current.agentRuns??=[];current.agentRuns.unshift(run);current.updatedAt=run.startedAt;current.activity.unshift({at:run.startedAt,text:`${provider} run started: ${task.title}`});return true;});if(!started)return send(res,404,{error:'Project not found.'});if(!task)return send(res,404,{error:'Workflow not found.'});if(conflict)return send(res,409,{error:`A ${conflict.status} run already exists for this task. Inspect its repository effects before retrying.`});
      let eventQueue=Promise.resolve();const recordEvent=event=>{eventQueue=eventQueue.then(()=>updateProjects(projectStore,records=>{const current=records.find(p=>p.id===id);const saved=current?.agentRuns?.find(r=>r.id===run.id);if(!saved)return;saved.events??=[];saved.events.push({type:String(event.type||'output').slice(0,60),text:String(event.text||'').slice(0,4000),at:event.at||new Date().toISOString()});saved.events=saved.events.slice(-100);}));return eventQueue};
      Promise.resolve().then(()=>runner({repositoryPath,prompt,onEvent:event=>{void recordEvent(event).catch(()=>{})}})).then(async result=>{await eventQueue;await updateProjects(projectStore,records=>{const current=records.find(p=>p.id===id);const saved=current?.agentRuns?.find(r=>r.id===run.id);if(!saved)return;saved.status=result.status;saved.exitCode=result.exitCode;saved.output=String(result.output||'').slice(-200_000);saved.error=String(result.error||'').slice(-20_000);saved.completedAt=new Date().toISOString();saved.events??=[];saved.events.push({type:`run.${saved.status}`,text:`Run ${saved.status} (exit ${saved.exitCode??'unknown'})`,at:saved.completedAt});current.updatedAt=saved.completedAt;current.activity.unshift({at:saved.completedAt,text:`${provider} run ${saved.status}: ${task.title}`});});}).catch(async err=>{await eventQueue.catch(()=>{});await updateProjects(projectStore,records=>{const current=records.find(p=>p.id===id);const saved=current?.agentRuns?.find(r=>r.id===run.id);if(!saved)return;saved.status='failed';saved.error=err.message;saved.completedAt=new Date().toISOString();saved.events??=[];saved.events.push({type:'run.failed',text:clean(err.message,500),at:saved.completedAt});current.activity.unshift({at:saved.completedAt,text:`${provider} run failed: ${task.title}`});});});
      return send(res,202,{runId:run.id,status:run.status,task});
    }
    const runStatusMatch=route.match(/^\/api\/projects\/([\w-]+)\/agents\/runs\/([\w-]+)$/);
    if(runStatusMatch&&method==='GET'){const [,id,runId]=runStatusMatch;const project=(await projectStore.all()).find(p=>p.id===id);if(!project)return send(res,404,{error:'Project not found.'});const run=project.agentRuns?.find(r=>r.id===runId);return run?send(res,200,run):send(res,404,{error:'Agent run not found.'})}
    const trustMatch = route.match(/^\/api\/projects\/([\w-]+)\/trust$/);
    if (trustMatch && method === 'GET') {
      const project = (await projectStore.all()).find(p => p.id === trustMatch[1]);
      if (!project) return send(res, 404, { error: 'Project not found.' });
      const currentFingerprint = await computeRepositoryFingerprint(project.repositoryPath);
      const audit = auditProjectTrustEvidence(project, currentFingerprint);
      return send(res, 200, audit);
    }
    const twinMatch = route.match(/^\/api\/projects\/([\w-]+)\/twin(?:\/(impact))?$/);
    if (twinMatch) {
      const [, id, sub] = twinMatch;
      const project = (await projectStore.all()).find(p => p.id === id);
      if (!project) return send(res, 404, { error: 'Project not found.' });

      if (method === 'GET' && !sub) {
        const graph = await buildDigitalTwinGraph(project.repositoryPath, project);
        return send(res, 200, graph);
      }
      if (method === 'POST' && sub === 'impact') {
        const input = await body(req);
        const graph = await buildDigitalTwinGraph(project.repositoryPath, project);
        const impact = analyzeChangeImpact(graph, input.changedFiles || [], project.decisions || []);
        return send(res, 200, impact);
      }
    }
    const executionsMatch = route.match(/^\/api\/projects\/([\w-]+)\/executions(?:\/([\w-]+)(?:\/(approve|cancel))?)?$/);
    if (executionsMatch) {
      const [, id, sessionId, subAction] = executionsMatch;
      const project = (await projectStore.all()).find(p => p.id === id);
      if (!project) return send(res, 404, { error: 'Project not found.' });

      if (method === 'GET' && !sessionId) {
        return send(res, 200, project.executionSessions || []);
      }
      if (method === 'GET' && sessionId && !subAction) {
        const session = (project.executionSessions || []).find(s => s.id === sessionId);
        return session ? send(res, 200, session) : send(res, 404, { error: 'Execution session not found.' });
      }
      if (method === 'POST' && !sessionId) {
        const input = await body(req);
        if (input.approved !== true) return send(res, 400, { error: 'Explicit approval is required before starting a multi-task execution workflow.' });
        const flow = (project.workflows || []).find(w => w.id === input.workflowId);
        if (!flow) return send(res, 404, { error: 'Workflow not found.' });

        const activeSession = (project.executionSessions || []).find(s => ['pending', 'running', 'paused_for_approval'].includes(s.status));
        if (activeSession) {
          return send(res, 409, { error: `An execution session '${activeSession.id}' is already in status '${activeSession.status}'.` });
        }

        const session = createExecutionSession({
          workflow: flow,
          project,
          provider: input.provider || 'codex',
          idempotencyKey: input.idempotencyKey,
          approved: true,
          approvalCheckpoints: input.approvalCheckpoints
        });

        await updateProjects(projectStore, records => {
          const current = records.find(p => p.id === id);
          if (!current) return false;
          current.executionSessions = current.executionSessions || [];
          current.executionSessions.unshift(session);
          current.activity.unshift({ at: session.createdAt, text: `Execution session started for workflow ${flow.id}` });
          return true;
        });

        Promise.resolve().then(() => executionEngine.runSession(session, project, flow, {
          onUpdate: async (updated) => {
            await updateProjects(projectStore, records => {
              const current = records.find(p => p.id === id);
              if (!current) return false;
              const idx = (current.executionSessions || []).findIndex(s => s.id === updated.id);
              if (idx >= 0) current.executionSessions[idx] = { ...updated };
              return true;
            });
          }
        })).catch(err => {
          session.status = 'failed';
          session.error = err.message;
        });

        return send(res, 202, { sessionId: session.id, status: session.status, session });
      }
      if (method === 'POST' && sessionId && subAction === 'approve') {
        const input = await body(req);
        let session;
        const result = await updateProjects(projectStore, records => {
          const current = records.find(p => p.id === id);
          if (!current) return 'not_found';
          session = (current.executionSessions || []).find(s => s.id === sessionId);
          if (!session) return 'session_not_found';
          try {
            executionEngine.approveCheckpoint(session, input.taskId);
            return 'ok';
          } catch (err) {
            return err;
          }
        });
        if (result === 'not_found' || result === 'session_not_found') return send(res, 404, { error: 'Execution session not found.' });
        if (result instanceof Error) return send(res, result.status || 400, { error: result.message });

        const flow = (project.workflows || []).find(w => w.id === session.workflowId);
        Promise.resolve().then(() => executionEngine.runSession(session, project, flow, {
          onUpdate: async (updated) => {
            await updateProjects(projectStore, records => {
              const current = records.find(p => p.id === id);
              if (!current) return false;
              const idx = (current.executionSessions || []).findIndex(s => s.id === updated.id);
              if (idx >= 0) current.executionSessions[idx] = { ...updated };
              return true;
            });
          }
        }));

        return send(res, 200, { sessionId: session.id, status: session.status });
      }
      if (method === 'POST' && sessionId && subAction === 'cancel') {
        const input = await body(req);
        let session;
        const result = await updateProjects(projectStore, records => {
          const current = records.find(p => p.id === id);
          if (!current) return 'not_found';
          session = (current.executionSessions || []).find(s => s.id === sessionId);
          if (!session) return 'session_not_found';
          try {
            executionEngine.cancelSession(session, input.reason || 'User requested cancellation');
            return 'ok';
          } catch (err) {
            return err;
          }
        });
        if (result === 'not_found' || result === 'session_not_found') return send(res, 404, { error: 'Execution session not found.' });
        if (result instanceof Error) return send(res, result.status || 400, { error: result.message });

        return send(res, 200, { sessionId: session.id, status: session.status, cancelReason: session.cancelReason });
      }
    }
    const reportMatch=route.match(/^\/api\/projects\/([\w-]+)\/report\.md$/);
    if(reportMatch&&method==='GET'){const [,id]=reportMatch;const project=(await projectStore.all()).find(p=>p.id===id);if(!project)return send(res,404,{error:'Project not found.'});const quality=evaluateQuality(project.checks,project.type);res.writeHead(200,{'content-type':'text/markdown; charset=utf-8','content-disposition':`attachment; filename="agencyos-${id}-quality-report.md"`,'cache-control':'no-store','x-content-type-options':'nosniff'});return res.end(qualityReportMarkdown(project,quality));}
    const exportMatch=route.match(/^\/api\/projects\/([\w-]+)\/export\.json$/);
    if(exportMatch&&method==='GET'){const [,id]=exportMatch;const project=(await projectStore.all()).find(p=>p.id===id);if(!project)return send(res,404,{error:'Project not found.'});const backup=createProjectBackup({...project,quality:evaluateQuality(project.checks,project.type)});res.writeHead(200,{'content-type':'application/json; charset=utf-8','content-disposition':`attachment; filename="agencyos-project-${id}-backup.json"`,'cache-control':'no-store','x-content-type-options':'nosniff'});return res.end(JSON.stringify(backup,null,2));}
    const match = route.match(/^\/api\/projects\/([\w-]+)(?:\/(workflow|checks|decisions)(?:\/([\w-]+)(?:\/tasks\/([\w-]+))?)?)?$/);
    if (match) {
    const [, id, action, workflowId, taskId] = match; const projects = await projectStore.all(); const i = projects.findIndex(p => p.id === id);
      if (i < 0) return send(res, 404, { error:'Project not found.' }); const project = projects[i];
      if (!action && method === 'GET') return send(res, 200, withQuality(project));
      if (!action && method === 'PATCH') {
        const input=await body(req); const allowedStatus=['active','paused','completed'];
        if (input.status !== undefined && !allowedStatus.includes(input.status)) return send(res,400,{error:'Status must be active, paused, or completed.'});
        if (input.name !== undefined && !clean(input.name,100)) return send(res,400,{error:'Project name cannot be empty.'});
        if (input.priority !== undefined && !['low','normal','high','urgent'].includes(input.priority)) return send(res,400,{error:'Priority must be low, normal, high, or urgent.'});
        const repositoryPath=input.repositoryPath!==undefined?(input.repositoryPath?await resolveRepository(input.repositoryPath):undefined):undefined;let updated;
        const found=await updateProjects(projectStore,records=>{updated=records.find(p=>p.id===id);if(!updated)return false;if(input.name!==undefined)updated.name=clean(input.name,100);if(input.type!==undefined)updated.type=clean(input.type,50);if(input.objective!==undefined)updated.objective=clean(input.objective,1000);if(input.requirements!==undefined)updated.requirements=clean(input.requirements,5000);if(input.techPreferences!==undefined)updated.techPreferences=clean(input.techPreferences,1000);if(input.priority!==undefined)updated.priority=input.priority;if(repositoryPath!==undefined)updated.repositoryPath=repositoryPath;if(input.status!==undefined)updated.status=input.status;updated.updatedAt=new Date().toISOString();updated.activity.unshift({at:updated.updatedAt,text:'Project profile updated'});return true;});
        if(!found)return send(res,404,{error:'Project not found.'});return send(res,200,withQuality(updated));
      }
      if (!action && method === 'DELETE') { const deleted=await updateProjects(projectStore,records=>{const index=records.findIndex(p=>p.id===id);if(index<0)return false;records.splice(index,1);return true;});return deleted?send(res,200,{deleted:true,id}):send(res,404,{error:'Project not found.'}); }
      if (action === 'workflow' && workflowId && taskId && method === 'POST') {
        const input=await body(req);let result;const found=await updateProjects(projectStore,records=>{const current=records.find(p=>p.id===id);if(!current)return false;const flow=current.workflows.find(w=>w.id===workflowId);if(!flow){result={missingWorkflow:true};return true;}flow.stale=workflowIsStale(current,flow);if(flow.stale){result={stale:true};return true;}const task=updateWorkflowTask(flow,taskId,{status:input.status,evidence:clean(input.evidence,1000)});current.updatedAt=new Date().toISOString();current.activity.unshift({at:current.updatedAt,text:`Workflow task ${task.status}: ${task.title}`});result={task,workflow:flow};return true;});if(!found)return send(res,404,{error:'Project not found.'});if(result.missingWorkflow)return send(res,404,{error:'Workflow not found.'});if(result.stale)return send(res,409,{error:'Workflow context has changed. Create a fresh workflow before updating this task.'});return send(res,200,result);
      }
      if (action === 'workflow' && !workflowId && method === 'POST') { let flow;const found=await updateProjects(projectStore,records=>{const current=records.find(p=>p.id===id);if(!current)return false;flow=createWorkflow(current);current.workflows.unshift(flow);current.updatedAt=new Date().toISOString();current.activity.unshift({at:current.updatedAt,text:'Workflow plan created'});return true;});return found?send(res,201,flow):send(res,404,{error:'Project not found.'}); }
      if (action === 'checks' && method === 'POST') {
        const input=await body(req); const allowed=['pass','fail','unverified','na'];
        const category=clean(input.category,50); if (!category || !clean(input.title,160) || !allowed.includes(input.status)) return send(res,400,{error:'A category, title, and valid status (pass, fail, unverified, na) are required.'});
        if (['pass','fail','na'].includes(input.status) && !clean(input.evidence,1000)) return send(res,400,{error:'Evidence is required for pass, fail, and N/A results.'});
        const createdAt=new Date().toISOString();const evidence=clean(input.evidence,1000);const check={id:randomUUID(),category,controlId:clean(input.controlId,100)||undefined,title:clean(input.title,160),status:input.status,score:input.status==='pass'?100:input.status==='na'?0:0,evidence,critical:input.critical===true,verification:'user-reported',provenance:{kind:'user-reported',evidenceReference:evidence,capturedAt:createdAt},createdAt};
        let quality;const found=await updateProjects(projectStore,records=>{const current=records.find(p=>p.id===id);if(!current)return false;current.checks.push(check);current.updatedAt=check.createdAt;current.activity.unshift({at:check.createdAt,text:`Evidence recorded: ${check.title}`});quality=evaluateQuality(current.checks,current.type);return true;});return found?send(res,201,{check,quality}):send(res,404,{error:'Project not found.'});
      }
      if (action === 'decisions' && method === 'POST') {
        const input=await body(req);const title=clean(input.title,160);const rationale=clean(input.rationale,2000);if(!title||!rationale)return send(res,400,{error:'A decision title and rationale are required.'});
        const decision={id:randomUUID(),title,rationale,alternatives:clean(input.alternatives,2000),evidence:clean(input.evidence,1000),createdAt:new Date().toISOString()};const found=await updateProjects(projectStore,records=>{const current=records.find(p=>p.id===id);if(!current)return false;current.decisions.unshift(decision);current.updatedAt=decision.createdAt;current.activity.unshift({at:decision.createdAt,text:`Decision recorded: ${decision.title}`});return true;});return found?send(res,201,decision):send(res,404,{error:'Project not found.'});
      }
    }
    return send(res,404,{error:'API route not found.'});
   }
   if (method !== 'GET') return send(res,405,{error:'Method not allowed.'});
   const target=route==='/'?path.join(publicRoot,'index.html'):path.resolve(publicRoot,`.${decodeURIComponent(route)}`);
   if (!target.startsWith(publicRoot+path.sep)) return send(res,403,{error:'Forbidden'});
   const data=await readFile(target); res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}); res.end(data);
  } catch (err) { send(res,err.status||500,{error:err.status?err.message:'Internal server error'}); }
 }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const port=Number(process.env.PORT||4173); const host=process.env.HOST||'127.0.0.1';
 const loopback=['127.0.0.1','::1','localhost'].includes(host);if(!loopback&&(!auth.enabled||!process.env.DATABASE_URL||process.env.AGENCYOS_COOKIE_SECURE!=='true'))throw new Error('Non-loopback hosting requires configured authentication, DATABASE_URL PostgreSQL storage, and AGENCYOS_COOKIE_SECURE=true behind HTTPS.');
 createAppServer().listen(port,host,()=>console.log(`AgencyOS Studio: http://${host}:${port}`));
}

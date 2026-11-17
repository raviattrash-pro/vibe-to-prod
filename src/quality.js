import model from '../references/quality-model.json' with { type: 'json' };
import coverage from '../references/evaluator-coverage.json' with { type: 'json' };
import requirements from '../references/quality-requirements.json' with { type: 'json' };

export function evaluateQuality(checks = [], projectType = 'Custom Application') {
  const submitted = checks.filter(c => model.categories.some(k => k.id === c.category)).map(c => ({ ...c, status: ['pass','fail','na'].includes(c.status) && !String(c.evidence || '').trim() ? 'unverified' : c.status }));
  const latest=new Map();
  for(const check of submitted){const key=check.source?`${check.category}:source:${check.source}`:check.controlId?`${check.category}:control:${check.controlId}`:`${check.category}:manual:${String(check.title||'').trim().toLowerCase().replace(/\s+/g,' ')}`;const prior=latest.get(key);const time=Date.parse(check.createdAt||'');const priorTime=Date.parse(prior?.createdAt||'');if(!prior||!Number.isFinite(time)||!Number.isFinite(priorTime)||time>=priorTime)latest.set(key,check);}
  const valid=[...latest.values()];
  const effectiveProjectType=requirements.profiles[projectType]?projectType:'Custom Application';const requiredControls=requirements.profiles[effectiveProjectType];
  const requiredCoverage=requiredControls.map(control=>{const check=valid.find(item=>item.source===control.evaluatorId||item.controlId===control.id);return{...control,status:check?.status||'unverified',checkId:check?.id||null,verification:check?.verification||null,evidence:check?.evidence||null};});
  const categoryResults = model.categories.map(category => {
    const items = valid.filter(c => c.category === category.id);
    const applicable = items.filter(c => c.status !== 'na');
    const earned = applicable.reduce((sum, c) => sum + (c.status === 'pass' ? 100 : 0) * (Number(c.weight) > 0 ? Number(c.weight) : 1), 0);
    const possible = applicable.reduce((sum, c) => sum + (Number(c.weight) > 0 ? Number(c.weight) : 1), 0);
    const score = possible ? Math.round(earned / possible) : null;
    const supported=coverage.evaluators.filter(evaluator=>evaluator.category===category.id);
    const controlCounts={effective:items.length,pass:items.filter(c=>c.status==='pass').length,fail:items.filter(c=>c.status==='fail').length,unverified:items.filter(c=>c.status==='unverified'||!['pass','fail','na'].includes(c.status)).length,na:items.filter(c=>c.status==='na').length,applicable:applicable.length};
    return { id: category.id, name: category.name, weight: category.weight, score, checks: items, controlCounts, assessed:items.length>0, evaluatorCoverage:{supported:supported.length>0,evaluators:supported.map(e=>e.id),controls:supported.flatMap(e=>e.controls),limits:supported.flatMap(e=>e.limits)} };
  });
  const rated = categoryResults.filter(c => c.score !== null);
  const naWeight = categoryResults.filter(c => c.checks.length && c.checks.every(check => check.status === 'na')).reduce((s,c) => s + c.weight, 0);
  const applicableWeight = model.categories.reduce((s,c)=>s+c.weight,0) - naWeight;
  const score = rated.length ? Math.round(rated.reduce((s, c) => s + c.score * c.weight, 0) / applicableWeight) : null;
  const blockers = valid.filter(c => c.critical === true && c.status !== 'pass' && c.status !== 'na').map(c => ({ id: c.id, title: c.title, evidence: c.evidence || null }));
  const failed = valid.filter(c => c.status === 'fail');
  const unverified = valid.filter(c => c.status === 'unverified' || !['pass', 'fail', 'na'].includes(c.status));
  const evidenceComplete = valid.length > 0 && valid.every(c => ['pass','fail','na'].includes(c.status) && String(c.evidence || '').trim());
  const automatedCount=valid.filter(c=>c.verification==='automated').length;
  const userReportedCount=valid.length-automatedCount;
  const verificationLevel=automatedCount?(userReportedCount?'mixed':'automated-subset'):'user-reported';
  const controlCounts={effective:valid.length,applicable:valid.filter(c=>c.status!=='na').length,pass:valid.filter(c=>c.status==='pass').length,fail:valid.filter(c=>c.status==='fail').length,unverified:valid.filter(c=>c.status==='unverified'||!['pass','fail','na'].includes(c.status)).length,na:valid.filter(c=>c.status==='na').length};
  const requiredControlCounts={total:requiredCoverage.length,pass:requiredCoverage.filter(c=>c.status==='pass').length,fail:requiredCoverage.filter(c=>c.status==='fail').length,unverified:requiredCoverage.filter(c=>c.status==='unverified'||!['pass','fail','na'].includes(c.status)).length,na:requiredCoverage.filter(c=>c.status==='na').length};
  const releaseReasons=['Automated evaluator coverage is incomplete; this report cannot certify production readiness.'];if(requiredControlCounts.unverified)releaseReasons.push(`${requiredControlCounts.unverified} required profile control(s) are unverified.`);if(requiredControlCounts.fail)releaseReasons.push(`${requiredControlCounts.fail} required profile control(s) failed.`);
  return { score, scoreLabel:'provisional', verificationLevel, automatedCount, userReportedCount, submittedCheckCount:submitted.length, supersededCheckCount:submitted.length-valid.length, controlCounts, evidenceComplete, verified:false, coverageVersion:coverage.version, evaluatorCoverage:coverage.evaluators, requiredCoverageVersion:requirements.version, projectType:effectiveProjectType, requiredControls:requiredCoverage, requiredControlCounts, requirementsLimits:requirements.limits, verificationNote:'Automated checks cover only their named controls; remaining records are user-reported. This is not a complete release certification.', categories: categoryResults, blockers, failed, unverified, releaseReady:false, releaseReasons, applicability: `${rated.reduce((s,c)=>s+c.weight,0)} assessed / ${applicableWeight} applicable` };
}

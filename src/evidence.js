const rank={unverified:0,fail:1,pass:2};
import { evaluateQuality } from './quality.js';

export function recordEvaluation(project,check){
  project.checks??=[];project.evaluationHistory??=[];
  const before=evaluateQuality(project.checks,project.type);
  const previous=project.checks.find(item=>item.source===check.source);
  let change='initial';
  if(previous){
    change=rank[check.status]===undefined||rank[previous.status]===undefined?'incomparable':rank[check.status]>rank[previous.status]?'improved':rank[check.status]<rank[previous.status]?'regressed':'unchanged';
    project.checks=project.checks.filter(item=>item.source!==check.source);
  }
  project.checks.push(check);
  const after=evaluateQuality(project.checks,project.type);
  project.evaluationHistory.unshift({...check,change,comparedTo:previous?.id||null,qualityTransition:{before:before.score,after:after.score,delta:before.score===null||after.score===null?null:after.score-before.score,releaseReadyBefore:before.releaseReady,releaseReadyAfter:after.releaseReady}});
  project.evaluationHistory=project.evaluationHistory.slice(0,200);
  return {check,change,previous:previous||null};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { recordEvaluation } from '../src/evidence.js';

test('evaluation history compares new results while scoring only the latest result',()=>{
  const project={checks:[],evaluationHistory:[]};
  const first={id:'1',source:'seo-static',category:'seo',status:'fail',evidence:'Missing metadata'};assert.equal(recordEvaluation(project,first).change,'initial');
  const second={id:'2',source:'seo-static',category:'seo',status:'pass',evidence:'Metadata passes'};assert.equal(recordEvaluation(project,second).change,'improved');
  const third={id:'3',source:'seo-static',status:'fail'};assert.equal(recordEvaluation(project,third).change,'regressed');
  assert.deepEqual(project.checks.map(check=>check.id),['3']);assert.equal(project.evaluationHistory.length,3);assert.equal(project.evaluationHistory[1].comparedTo,'1');
  assert.equal(project.evaluationHistory[1].qualityTransition.delta,10);assert.equal(project.evaluationHistory[1].qualityTransition.releaseReadyAfter,false);
});

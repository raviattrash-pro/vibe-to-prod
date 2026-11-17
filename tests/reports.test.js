import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityReportMarkdown } from '../src/reports.js';
import { evaluateQuality } from '../src/quality.js';

test('quality report exports current context, evidence provenance, scores, and limitations safely',()=>{
 const project={name:'Portal #1',type:'SaaS',priority:'high',status:'active',objective:'Keep users safe',requirements:'No data exposure',techPreferences:'Node',checks:[{category:'security',title:'Manual review',status:'pass',evidence:'review note',critical:false}],decisions:[]};
 const report=qualityReportMarkdown(project,evaluateQuality(project.checks));assert.match(report,/Portal \\#1/);assert.match(report,/user-reported/);assert.match(report,/review note/);assert.match(report,/not a complete release certification/i);assert.match(report,/No data exposure/);
});

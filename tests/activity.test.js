import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeActivity, pageActivity, MAX_ACTIVITY_EVENTS } from '../src/activity.js';

test('activity pages are bounded and event identifiers remain stable',()=>{
 const project={activity:[{at:'2026-01-01T00:00:00Z',text:'created'},{at:'2026-01-02T00:00:00Z',text:'updated'}]};
 const first=pageActivity(project,{limit:1});const again=pageActivity(project,{limit:1});assert.equal(first.events.length,1);assert.equal(first.hasMore,true);assert.equal(first.events[0].id,again.events[0].id);
 const rest=pageActivity(project,{limit:500,offset:1});assert.equal(rest.events.length,1);assert.equal(rest.hasMore,false);
 project.activity=Array.from({length:MAX_ACTIVITY_EVENTS+5},(_,i)=>({at:String(i),text:`event ${i}`}));normalizeActivity(project);assert.equal(project.activity.length,MAX_ACTIVITY_EVENTS);assert.equal(project.activity[0].text,'event 0');
});

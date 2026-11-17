import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';

test('serialized store updates preserve concurrent writes',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-store-'));const store=new Store(path.join(dir,'projects.json'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await Promise.all(Array.from({length:40},(_,index)=>store.update(async records=>{await new Promise(resolve=>setTimeout(resolve,index%3));records.push({id:String(index)});} )));
 const records=await store.all();assert.equal(records.length,40);assert.equal(new Set(records.map(record=>record.id)).size,40);
});

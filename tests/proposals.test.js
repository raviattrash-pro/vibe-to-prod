import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyChangeProposal, createChangeProposal } from '../src/proposals.js';

test('file proposals produce reviewable diffs, require approval, and apply atomically',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agencyos-proposal-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'src'));await writeFile(path.join(root,'src/app.js'),'const label = "Old";\nconsole.log(label);\n');
 const proposal=await createChangeProposal(root,{path:'src/app.js',title:'Update app label',description:'Use the requested product label.',proposedContent:'const label = "New";\nconsole.log(label);\n'});assert.equal(proposal.status,'proposed');assert.equal(proposal.impact,'standard');assert.match(proposal.diff,/-const label = "Old"/);assert.match(proposal.diff,/\+const label = "New"/);
 await assert.rejects(applyChangeProposal(root,proposal,{approved:true,approvalHash:proposal.approvalHash}),{status:409});proposal.status='applying';await assert.rejects(applyChangeProposal(root,proposal,{approved:false,approvalHash:proposal.approvalHash}),{status:400});await assert.rejects(applyChangeProposal(root,proposal,{approved:true,approvalHash:'wrong'}),{status:409});
 const result=await applyChangeProposal(root,proposal,{approved:true,approvalHash:proposal.approvalHash});assert.equal(result.path,'src/app.js');assert.match(await readFile(path.join(root,'src/app.js'),'utf8'),/New/);
});

test('file proposals preserve a UTF-8 byte-order mark when applying',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agencyos-proposal-bom-'));t.after(()=>rm(root,{recursive:true,force:true}));const target=path.join(root,'app.js');await writeFile(target,Buffer.from('\uFEFFconst label = "Old";\n','utf8'));
 const proposal=await createChangeProposal(root,{path:'app.js',title:'Update label',description:'Preserve the file encoding marker.',proposedContent:'\uFEFFconst label = "New";\n'});proposal.status='applying';await applyChangeProposal(root,proposal,{approved:true,approvalHash:proposal.approvalHash});assert.equal((await readFile(target)).toString('utf8'),'\uFEFFconst label = "New";\n');
});

test('proposals reject path traversal, credentials, missing files, stale targets, and flag high impact',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agencyos-proposal-guards-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(path.join(root,'package.json'),'{}');await writeFile(path.join(root,'.env'),'TOKEN=private');const input={title:'Change',description:'Reason',proposedContent:'{"name":"safe"}'};
 await assert.rejects(createChangeProposal(root,{...input,path:'../outside.txt'}),{status:400});await assert.rejects(createChangeProposal(root,{...input,path:'.env'}),{status:400});await assert.rejects(createChangeProposal(root,{...input,path:'new.txt'}),{status:400});
 const proposal=await createChangeProposal(root,{...input,path:'package.json'});assert.equal(proposal.impact,'high');await writeFile(path.join(root,'package.json'),'{}\n');proposal.status='applying';await assert.rejects(applyChangeProposal(root,proposal,{approved:true,approvalHash:proposal.approvalHash}),{status:409});
});

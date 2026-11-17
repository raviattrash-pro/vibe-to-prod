import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService, hashPassword } from '../src/auth.js';
import { Store } from '../src/store.js';
import { createAppServer } from '../src/server.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('auth service creates signed sessions and checks the CSRF cookie/header pair',async()=>{
 const passwordHash=await hashPassword('a-long-test-password-123');const service=new AuthService({AGENCYOS_USERS_JSON:JSON.stringify([{username:'reviewer',passwordHash,role:'viewer'}]),AGENCYOS_SESSION_SECRET:'test-session-secret-that-is-at-least-32-bytes'});
 const session=await service.login('reviewer','a-long-test-password-123','127.0.0.1');assert.equal(session.user.role,'viewer');const cookies=service.cookieHeaders(session).map(value=>value.split(';')[0]).join('; ');const request={headers:{cookie:cookies,'x-csrf-token':session.csrf}};assert.deepEqual(service.session(cookies).username,'reviewer');assert.equal(service.csrfMatches(request,service.session(cookies)),true);request.headers['x-csrf-token']='wrong';assert.equal(service.csrfMatches(request,service.session(cookies)),false);
 const invalid={headers:{cookie:cookies.replace(session.token,`${session.token.slice(0,-1)}x`)}};assert.equal(service.session(invalid.headers.cookie),null);assert.equal(await service.login('reviewer','wrong-password','127.0.0.2'),null);
});

test('auth rejects short session secrets and malformed password hashes',()=>{
 assert.throws(()=>new AuthService({AGENCYOS_USERS_JSON:'[]',AGENCYOS_SESSION_SECRET:'short'}),/non-empty JSON array/);
 assert.throws(()=>new AuthService({AGENCYOS_USERS_JSON:JSON.stringify([{username:'x',passwordHash:'bad'}]),AGENCYOS_SESSION_SECRET:'x'.repeat(40)}),/passwordHash/);
});

test('authenticated API requires CSRF on writes and blocks viewer mutations',async t=>{
 const passwordHash=await hashPassword('another-long-test-password-456');const auth=new AuthService({AGENCYOS_USERS_JSON:JSON.stringify([{username:'viewer',passwordHash,role:'viewer'},{username:'member',passwordHash,role:'member'}]),AGENCYOS_SESSION_SECRET:'integration-test-session-secret-32-bytes-min'});const dir=await mkdtemp(path.join(os.tmpdir(),'agencyos-auth-api-'));const server=createAppServer({projectStore:new Store(path.join(dir,'projects.json')),authService:auth});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})});
 const login=async username=>{const response=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password:'another-long-test-password-456'})});assert.equal(response.status,200);const set=response.headers.getSetCookie();return{cookies:set.map(item=>item.split(';')[0]).join('; '),csrf:decodeURIComponent(set.find(item=>item.startsWith('agencyos_csrf=')).split(';')[0].split('=').slice(1).join('='))}};
 const viewer=await login('viewer');let response=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json',cookie:viewer.cookies,'x-csrf-token':viewer.csrf},body:JSON.stringify({name:'blocked'})});assert.equal(response.status,403);
 const member=await login('member');response=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json',cookie:member.cookies},body:JSON.stringify({name:'no csrf'})});assert.equal(response.status,403);response=await fetch(`${base}/api/projects`,{method:'POST',headers:{'content-type':'application/json',cookie:member.cookies,'x-csrf-token':member.csrf},body:JSON.stringify({name:'allowed'})});assert.equal(response.status,201);const project=await response.json();assert.equal(project.activity[0].actor.username,'member');
});
